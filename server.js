// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid'); // para nombres únicos de archivos
const ExcelJS = require('exceljs'); // para exportar a Excel

const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store); // con esto podemos guardar sesiones en la BD, en la tabla "Sessions"
const bcrypt = require('bcrypt');

const { sequelize } = require('./db');

const app = express();

/* ===============================
 *  Configuración de vistas / estáticos
 * =============================== */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json());




// Para leer campos de formularios HTML (login)
app.use(express.urlencoded({ extended: true }));

// Sesiones
const store = new SequelizeStore({ db: sequelize });

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev',
  resave: false,
  saveUninitialized: false,
  store,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 8 // 8 horas
  }
}));

// Sincroniza tabla de sesiones
store.sync();


/* ===============================
 *  Importar modelos de dominio
 * =============================== */
const { Op } = require('sequelize');
const {
  Ubicacion,
  ResponsableCustodio,
  Equipo,
  Mantenimiento,
  PersonaMantenimiento,
  Cargo,
  User 
} = require('./models');

// Cargar usuario desde la sesión en cada request
app.use(async (req, res, next) => {
  if (req.session.userId) {
    try {
      const u = await User.findByPk(req.session.userId);
      if (u) req.user = u;
    } catch (_) { /* ignorar errores */ }
  }
  // Disponible en EJS para poder mostrar datos del usuario en la UI
  res.locals.currentUser = req.user || null;
  next();
});

// Evitar cachear páginas protegidas
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});


// Middlewares de protección
const requireAuth = (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).send('Acceso prohibido');
  }
  next();
};


// Public (js, css, imágenes…)
app.use(express.static('public'));

// Carpeta de uploads segura
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff')
}));

/* ===============================
 *  Multer (uploads)
 * =============================== */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg'];
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error('Tipo de archivo no permitido. Usa PDF/JPG/PNG.'));
    }
    cb(null, true);
  }
});

// Endpoint de subida
app.post('/api/uploads',requireAuth, upload.single('file'), (req, res) => {
  try {
    const relUrl = `/uploads/${req.file.filename}`;
    return res.status(201).json({
      ok: true,
      url: relUrl,
      original: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
});



/* ===============================
 *  Helpers de DTO / Fechas Bogotá
 * =============================== */
function fmtBogota(date) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(date));
}
function toDTO(entity) {
  const obj = entity?.toJSON ? entity.toJSON() : { ...entity };
  if (obj.createdAt) obj.createdAt = fmtBogota(obj.createdAt);
  if (obj.updatedAt) obj.updatedAt = fmtBogota(obj.updatedAt);
  return obj;
}


function safeISOorEmpty(d){
  if (!d) return '';
  try { return new Date(d).toISOString(); } catch { return ''; }
}
function onlyDateYYYYMMDD(value) {
  if (!value) return '';
  // Si viene como Date (DATETIME / DATE en Sequelize)
  if (value instanceof Date) {
    const pad = n => String(n).padStart(2, '0');
    const y = value.getFullYear();
    const m = pad(value.getMonth() + 1);
    const d = pad(value.getDate());
    return `${y}-${m}-${d}`; // siempre YYYY-MM-DD
  }

  // Si viene como string (DATEONLY, o texto de la BD)
  const s = String(value);
  if (s.length >= 10) {
    // "2025-12-31 00:00:00" -> "2025-12-31"
    return s.slice(0, 10);
  }

  // parsear con Date
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toDTOmtto(m) {
  const o = m?.toJSON ? m.toJSON() : { ...m };

  // Normalizamos fechas de mantenimiento
  o.fecha_programada   = safeISOorEmpty(o.fecha_programada);
  o.fecha_ejecucion    = safeISOorEmpty(o.fecha_ejecucion);
  // para que solo tenga la parte de fecha (YYYY-MM-DD)
  o.proximo_vencimiento = onlyDateYYYYMMDD(o.proximo_vencimiento);

  if (o.createdAt)  o.createdAt  = fmtBogota(o.createdAt);
  if (o.updatedAt)  o.updatedAt  = fmtBogota(o.updatedAt);

  return o;
}


// Helper para exponer usuarios sin campos sensibles
function userToDTO(user) {
  const o = user?.toJSON ? user.toJSON() : { ...user };

  delete o.password_hash;
  delete o.reset_token;
  delete o.reset_expires;

  // Formato bonito usando fmtBogota para las fechas
  if (o.createdAt) o.createdAt = fmtBogota(o.createdAt);
  if (o.updatedAt) o.updatedAt = fmtBogota(o.updatedAt);

  return o;
}


const {
  TIPOS: MT_TIPOS,
  PRIORIDADES: MT_PRIORIDADES,
  RESULTADOS: MT_RESULTADOS
} = require('./models/Mantenimiento');

const isValidEnum = (val, arr) => (val == null || val === '' ? true : arr.includes(val));
const isISOorNull = (v) => !v || !Number.isNaN(Date.parse(v));

/* ===============================
 *  Health
 * =============================== */
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));



/* ===============================
 *  APIs — Cargos
 * =============================== */

// Listar / ver → solo requiere estar logueado
app.get('/api/cargos', requireAuth, async (req, res) => {
  try {
    const { q, tipo } = req.query;
    const where = {};
    if (q) where[Op.or] = [
      { nombre:      { [Op.like]: `%${q}%` } },
      { descripcion: { [Op.like]: `%${q}%` } },
    ];
    if (tipo && ['interno','externo'].includes(tipo)) where.tipo = tipo;

    const items = await Cargo.findAll({ where, order: [['nombre', 'ASC']] });
    res.json(items.map(toDTO));
  } catch (e) {
    res.status(500).json({ error: 'Error al listar cargos' });
  }
});

app.get('/api/cargos/:id', requireAuth, async (req, res) => {
  const item = await Cargo.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: 'Cargo no encontrado' });
  res.json(toDTO(item));
});

// Crear / editar / borrar → solo admin
app.post('/api/cargos', requireRole('admin'), async (req, res) => {
  try {
    const { nombre, tipo, descripcion } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (tipo && !['interno','externo'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido (use interno/externo)' });
    }
    const item = await Cargo.create({
      nombre: nombre.trim(),
      tipo: tipo || 'interno',
      descripcion
    });
    res.status(201).json(toDTO(item));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/cargos/:id', requireRole('admin'), async (req, res) => {
  try {
    const it = await Cargo.findByPk(req.params.id);
    if (!it) return res.status(404).json({ error: 'Cargo no encontrado' });

    const { nombre, tipo, descripcion } = req.body;
    if (tipo && !['interno','externo'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido (use interno/externo)' });
    }

    await it.update({
      ...(nombre != null ? { nombre: String(nombre).trim() } : {}),
      ...(tipo   != null ? { tipo } : {}),
      ...(descripcion != null ? { descripcion } : {})
    });

    res.json(toDTO(it));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/cargos/:id', requireRole('admin'), async (req, res) => {
  try {
    const hasPeople = await PersonaMantenimiento.count({ where: { cargoId: req.params.id } });
    if (hasPeople) {
      return res.status(400).json({ error: 'No se puede eliminar: hay personas asociadas a este cargo' });
    }

    const it = await Cargo.findByPk(req.params.id);
    if (!it) return res.status(404).json({ error: 'Cargo no encontrado' });

    await it.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ===============================
 *  APIs — Personas de Mantenimiento
 *  (GET/POST/PUT/DELETE /api/personas-mantenimiento)
 * =============================== */
// Listar Personas
app.get('/api/personas-mantenimiento', requireAuth,async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};

    if (q) {
      // q="Cal"
      where[Op.or] = [
        { identificacion: { [Op.like]: `%${q}%` } },
        { nombres:        { [Op.like]: `%${q}%` } },
        { apellidos:      { [Op.like]: `%${q}%` } },
        { email:      { [Op.like]: `%${q}%` } },
        { telefono:      { [Op.like]: `%${q}%` } }
      ];
    }

    const personas = await PersonaMantenimiento.findAll({
      where,
      include: [{ model: Cargo }],
      order: [['nombres', 'ASC']]
    });

    res.json(personas);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar personas' });
  }
});

// GET one
app.get('/api/personas-mantenimiento/:id',requireAuth, async (req, res) => {
  const p = await PersonaMantenimiento.findByPk(req.params.id, { include: [{ model: Cargo }] });
  if (!p) return res.status(404).json({ error: 'Persona no encontrada' });
  res.json(toDTO(p));
});

// POST
app.post('/api/personas-mantenimiento', requireRole('admin'),async (req, res) => {
  try {
    const { cargoId } = req.body;
    if (cargoId) {
      const exists = await Cargo.count({ where: { id: cargoId } });
      if (!exists) return res.status(400).json({ error: 'cargoId no existe' });
    }
    const p = await PersonaMantenimiento.create(req.body);
    res.status(201).json(toDTO(p));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT
app.put('/api/personas-mantenimiento/:id', requireRole('admin'),async (req, res) => {
  try {
    const p = await PersonaMantenimiento.findByPk(req.params.id);
    if (!p) return res.status(404).json({ error: 'Persona no encontrada' });

    const { cargoId } = req.body;
    if (cargoId != null) {
      const exists = await Cargo.count({ where: { id: cargoId } });
      if (!exists) return res.status(400).json({ error: 'cargoId no existe' });
    }

    await p.update(req.body);
    res.json(toDTO(p));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/personas-mantenimiento/:id', requireRole('admin'),async (req, res) => {
  try {
    const hasMtto = await Mantenimiento.count({ where: { responsableId: req.params.id } });
    if (hasMtto) return res.status(400).json({ error: 'No se puede eliminar: tiene mantenimientos asociados' });
    const p = await PersonaMantenimiento.findByPk(req.params.id);
    if (!p) return res.status(404).json({ error: 'Persona no encontrada' });
    await p.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
/* ===============================
 *  Reportes — Mantenimientos (Excel)
 *  GET /reportes/mantenimientos.xlsx
 * =============================== */
app.get('/reportes/personas.xlsx', requireAuth, async (req, res) => {
  try {
    const { cargoId, q } = req.query;

    const where = {};

    if (cargoId) where.cargoId = Number(cargoId);
    if (q) {
      where[Op.or] = [
        { identificacion: { [Op.like]: `%${q}%` } },
        { nombres:        { [Op.like]: `%${q}%` } },
        { apellidos:      { [Op.like]: `%${q}%` } },
        { email:          { [Op.like]: `%${q}%` } },
        { telefono:       { [Op.like]: `%${q}%` } }
      ];
    }

    // === CONSULTA CON ASOCIACIÓN AL CARGO ===
    const items = await PersonaMantenimiento.findAll({
      where,
      include: [
        { model: Cargo, as: 'Cargo' }
      ],
      order: [['id', 'ASC']]
    });

    // === CREACIÓN DEL EXCEL ===
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Personas');

    // === ENCABEZADOS ===
    sheet.addRow([
      'ID',
      'Identificación',
      'Nombres',
      'Apellidos',
      'Cargo',
      'Email',
      'Teléfono',
      'Fecha creación',
      'Última actualización'
    ]);

    sheet.getRow(1).font = { bold: true };

    // === FUNCIÓN PARA FORMATEAR FECHAS ===
    const formatDate = (d) =>
      d ? new Date(d).toISOString().slice(0, 10) : '';

    // === AGREGAR FILAS ===
    items.forEach(p => {
      sheet.addRow([
        p.id,
        p.identificacion || '',
        p.nombres || '',
        p.apellidos || '',
        p.Cargo ? p.Cargo.nombre : '',
        p.email || '',
        p.telefono || '',
        formatDate(p.createdAt),
        formatDate(p.updatedAt)
      ]);
    });

    // === AJUSTE DE ANCHO DE COLUMNAS ===
    sheet.columns.forEach(col => {
      col.width = 20;
    });

    // === DESCARGA ===
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="Personas.xlsx"'
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (e) {
    console.error(e);
    res.status(500).send('Error al generar el reporte de personas');
  }
});


/* ===============================
 *  APIs — Equipos (incluye /min) min es para listar códigos solo, es decir, datos mínimos
 * =============================== */
app.get('/api/equipos/min', requireAuth,async (_req, res) => {
  try {
    const rows = await Equipo.findAll({
      attributes: ['id', 'codigo_inventario', 'marca', 'modelo'],
      order: [['codigo_inventario', 'ASC']]
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al listar códigos' });
  }
});

app.get('/api/equipos', requireAuth,async (req, res) => {
  try {
    const { q, estado, tipo, ubicacionId, responsableId } = req.query;
    const where = {};
    if (estado) where.estado = estado;
    if (tipo) where.tipo_equipo = tipo;
    if (ubicacionId) where.ubicacionId = Number(ubicacionId);
    if (responsableId) where.responsableId = Number(responsableId);
    if (q) {
      where[Op.or] = [
        { codigo_inventario: q },
        { serial: { [Op.like]: `%${q}%` } },
        { marca: { [Op.like]: `%${q}%` } },
        { modelo: { [Op.like]: `%${q}%` } }
      ];
    }

    const items = await Equipo.findAll({
      where,
      include: [Ubicacion, ResponsableCustodio],
      order: [['id', 'ASC']]
    });
    res.json(items.map(toDTO));
  } catch (e) {
    res.status(500).json({ error: 'Error al listar equipos' });
  }
});

app.get('/api/equipos/:id', requireAuth,async (req, res) => {
  const item = await Equipo.findByPk(req.params.id, { include: [Ubicacion, ResponsableCustodio] });
  if (!item) return res.status(404).json({ error: 'Equipo no encontrado' });
  res.json(toDTO(item));
});

// Helpers para responder errores de validación en lote
function collectSequelizeErrors(err) {
  if (err?.errors?.length) {
    return err.errors.map(e => e.message || 'Validación inválida');
  }
  return [err?.message || 'Error de validación'];
}

app.post('/api/equipos', requireRole('admin'),async (req, res) => {
  try {
    const { codigo_inventario, serial, marca, modelo, tipo_equipo, estado, ubicacionId, responsableId } = req.body;
    const errors = [];

    // Requeridos
    if (!codigo_inventario?.trim()) errors.push('El código de inventario es obligatorio');
    if (!serial?.trim())            errors.push('El serial es obligatorio');
    if (!marca?.trim())             errors.push('La marca es obligatoria');
    if (!modelo?.trim())            errors.push('El modelo es obligatorio');
    if (!tipo_equipo)               errors.push('El tipo de equipo es obligatorio');
    if (!estado)                    errors.push('El estado es obligatorio');
    if (!ubicacionId)               errors.push('La ubicación es obligatoria');
    if (!responsableId)             errors.push('El responsable/custodio es obligatorio');

    // Enums
    if (tipo_equipo && !['laptop','desktop','impresora','switch','router','servidor','otro'].includes(tipo_equipo)) {
      errors.push('Tipo de equipo inválido');
    }
    if (estado && !['operativo','en_mantenimiento','dado_de_baja'].includes(estado)) {
      errors.push('Estado inválido');
    }

    // Claves foráneas
    if (ubicacionId) {
      const u = await Ubicacion.findByPk(Number(ubicacionId));
      if (!u) errors.push('La ubicación indicada no existe');
    }
    if (responsableId) {
      const r = await ResponsableCustodio.findByPk(Number(responsableId));
      if (!r) errors.push('El responsable/custodio indicado no existe');
    }

    // Unicidad manual para mensajes más precisos
    if (codigo_inventario) {
      const dupCode = await Equipo.count({ where: { codigo_inventario } });
      if (dupCode) errors.push('El código de inventario ya existe');
    }
    if (serial) {
      const dupSerial = await Equipo.count({ where: { serial } });
      if (dupSerial) errors.push('El serial ya existe');
    }

    if (errors.length) return res.status(400).json({ errors });

    const item = await Equipo.create({
      codigo_inventario: codigo_inventario.trim(),
      serial: serial.trim(),
      marca: marca.trim(),
      modelo: modelo.trim(),
      tipo_equipo,
      estado,
      ubicacionId: Number(ubicacionId),
      responsableId: Number(responsableId)
    });

    return res.status(201).json(toDTO(item));

  } catch (e) {
    const errors = collectSequelizeErrors(e);
    return res.status(400).json({ errors });
  }
});

app.put('/api/equipos/:id', requireRole('admin'),async (req, res) => {
  try {
    const it = await Equipo.findByPk(req.params.id);
    if (!it) return res.status(404).json({ errors: ['Equipo no encontrado'] });

    const { codigo_inventario, serial, marca, modelo, tipo_equipo, estado, ubicacionId, responsableId } = req.body;
    const errors = [];

    // Requeridos
    if (!codigo_inventario?.trim()) errors.push('El código de inventario es obligatorio');
    if (!serial?.trim())            errors.push('El serial es obligatorio');
    if (!marca?.trim())             errors.push('La marca es obligatoria');
    if (!modelo?.trim())            errors.push('El modelo es obligatorio');
    if (!tipo_equipo)               errors.push('El tipo de equipo es obligatorio');
    if (!estado)                    errors.push('El estado es obligatorio');
    if (!ubicacionId)               errors.push('La ubicación es obligatoria');
    if (!responsableId)             errors.push('El responsable/custodio es obligatorio');

    // Enums
    if (tipo_equipo && !['laptop','desktop','impresora','switch','router','servidor','otro'].includes(tipo_equipo)) {
      errors.push('Tipo de equipo inválido');
    }
    if (estado && !['operativo','en_mantenimiento','dado_de_baja'].includes(estado)) {
      errors.push('Estado inválido');
    }

    // Claves foráneas
    if (ubicacionId) {
      const u = await Ubicacion.findByPk(Number(ubicacionId));
      if (!u) errors.push('La ubicación indicada no existe');
    }
    if (responsableId) {
      const r = await ResponsableCustodio.findByPk(Number(responsableId));
      if (!r) errors.push('El responsable/custodio indicado no existe');
    }

    // Unicidad excluyendo el propio registro
    if (codigo_inventario) {
      const dupCode = await Equipo.count({ where: { codigo_inventario, id: { [Op.ne]: it.id } } });
      if (dupCode) errors.push('El código de inventario ya existe');
    }
    if (serial) {
      const dupSerial = await Equipo.count({ where: { serial, id: { [Op.ne]: it.id } } });
      if (dupSerial) errors.push('El serial ya existe');
    }

    if (errors.length) return res.status(400).json({ errors });

    await it.update({
      codigo_inventario: codigo_inventario.trim(),
      serial: serial.trim(),
      marca: marca.trim(),
      modelo: modelo.trim(),
      tipo_equipo,
      estado,
      ubicacionId: Number(ubicacionId),
      responsableId: Number(responsableId)
    });

    return res.json(toDTO(it));

  } catch (e) {
    const errors = collectSequelizeErrors(e);
    return res.status(400).json({ errors });
  }
});


app.delete('/api/equipos/:id', requireRole('admin'),async (req, res) => {
  try {
    const item = await Equipo.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Equipo no encontrado' });
    await item.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ===============================
 *  APIs — Mantenimientos (+validaciones fuertes)
 * =============================== */
app.get('/api/mantenimientos/opciones',requireAuth, (_req, res) => {
  res.json({ tipos: MT_TIPOS, prioridades: MT_PRIORIDADES, resultados: MT_RESULTADOS });
});

/* opciones se mantienen igual */
app.get('/api/mantenimientos', requireAuth,async (req, res) => {
  try {
    const { equipoId, tipo, prioridad, resultado, desde, hasta, q, responsableId } = req.query;
    const where = {};
    if (equipoId)      where.equipoId = Number(equipoId);
    if (responsableId) where.responsableId = Number(responsableId);
    if (tipo)          where.tipo = tipo;
    if (prioridad)     where.prioridad = prioridad;
    if (resultado)     where.resultado = resultado;
    if (q)             where.descripcion = { [Op.like]: `%${q}%` };
    if (desde || hasta) {
      const r = {};
      if (desde) r[Op.gte] = new Date(desde);
      if (hasta) r[Op.lte] = new Date(hasta);
      where.fecha_programada = r;
    }
    const items = await Mantenimiento.findAll({
      where,
      include: [
        { model: Equipo },
        { model: PersonaMantenimiento }        
      ],
      order: [['id', 'ASC']]
    });
    res.json(items.map(toDTOmtto));

  } catch {
    res.status(500).json({ error: 'Error al listar mantenimientos' });
  }
});

app.get('/api/mantenimientos/:id',requireAuth, async (req, res) => {
  const it = await Mantenimiento.findByPk(req.params.id, {
    include: [{ model: Equipo }, { model: PersonaMantenimiento }]  
  });
  if (!it) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
  res.json(toDTOmtto(it));
});

app.post('/api/mantenimientos', requireRole('admin'),async (req, res) => {
  try {
    let { equipoId, codigo_inventario, responsableId, tipo, prioridad, resultado,
          fecha_programada, fecha_ejecucion, proximo_vencimiento } = req.body;

    if (!equipoId && codigo_inventario) {
      const eq = await Equipo.findOne({ where: { codigo_inventario } });
      if (!eq) return res.status(400).json({ error: 'No existe un equipo con ese código de inventario' });
      equipoId = eq.id;
    }
    if (!equipoId) return res.status(400).json({ error: 'Falta equipo (equipoId o codigo_inventario)' });

    if (!responsableId) return res.status(400).json({ error: 'Falta responsableId' });
    const exists = await PersonaMantenimiento.count({ where: { id: responsableId } }); 
    if (!exists) return res.status(400).json({ error: 'responsableId no existe' });

    if (!isValidEnum(tipo, MT_TIPOS))        return res.status(400).json({ error: 'tipo inválido' });
    if (!isValidEnum(prioridad, MT_PRIORIDADES)) return res.status(400).json({ error: 'prioridad inválida' });
    if (!isValidEnum(resultado, MT_RESULTADOS))  return res.status(400).json({ error: 'resultado inválido' });

    if (!isISOorNull(fecha_programada) || !isISOorNull(fecha_ejecucion) || !isISOorNull(proximo_vencimiento)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    const payload = { ...req.body, equipoId, responsableId };
    delete payload.codigo_inventario;

    const item = await Mantenimiento.create(payload);
    res.status(201).json(toDTO(item));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/mantenimientos/:id', requireRole('admin'),async (req, res) => {
  try {
    const it = await Mantenimiento.findByPk(req.params.id);
    if (!it) return res.status(404).json({ error: 'Mantenimiento no encontrado' });

    let { equipoId, codigo_inventario, responsableId, tipo, prioridad, resultado,
          fecha_programada, fecha_ejecucion, proximo_vencimiento } = req.body;

    if (!equipoId && codigo_inventario) {
      const eq = await Equipo.findOne({ where: { codigo_inventario } });
      if (!eq) return res.status(400).json({ error: 'No existe un equipo con ese código de inventario' });
      equipoId = eq.id;
    }
    if (responsableId == null) return res.status(400).json({ error: 'Falta responsableId' });
    const exists = await PersonaMantenimiento.count({ where: { id: responsableId } }); 
    if (!exists) return res.status(400).json({ error: 'responsableId no existe' });

    if (!isValidEnum(tipo, MT_TIPOS))            return res.status(400).json({ error: 'tipo inválido' });
    if (!isValidEnum(prioridad, MT_PRIORIDADES)) return res.status(400).json({ error: 'prioridad inválida' });
    if (!isValidEnum(resultado, MT_RESULTADOS))  return res.status(400).json({ error: 'resultado inválido' });

    if (!isISOorNull(fecha_programada) || !isISOorNull(fecha_ejecucion) || !isISOorNull(proximo_vencimiento)) {
      return res.status(400).json({ error: 'Formato de fecha inválido' });
    }

    const payload = { ...req.body };
    if (equipoId) payload.equipoId = equipoId;
    payload.responsableId = responsableId;
    delete payload.codigo_inventario;

    await it.update(payload);
    res.json(toDTO(it));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


app.delete('/api/mantenimientos/:id', requireRole('admin'),async (req, res) => {
  try {
    const it = await Mantenimiento.findByPk(req.params.id);
    if (!it) return res.status(404).json({ error: 'Mantenimiento no encontrado' });
    await it.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/* ===============================
 *  Reportes — Mantenimientos (Excel)
 *  GET /reportes/mantenimientos.xlsx
 * =============================== */
app.get('/reportes/mantenimientos.xlsx', requireAuth, async (req, res) => {
  try {
    // tenemos el filtrado para el reporte igual que en el API, es decir, mismos query params que /api/mantenimientos
    const { equipoId, tipo, prioridad, resultado, desde, hasta, responsableId, q } = req.query;

    const where = {};
    if (equipoId)      where.equipoId = Number(equipoId);
    if (responsableId) where.responsableId = Number(responsableId);
    if (tipo)          where.tipo = tipo;
    if (prioridad)     where.prioridad = prioridad;
    if (resultado)     where.resultado = resultado;
    if (q)             where.descripcion = { [Op.like]: `%${q}%` };
    if (desde || hasta) {
      const r = {};
      if (desde) r[Op.gte] = new Date(desde);
      if (hasta) r[Op.lte] = new Date(hasta);
      where.fecha_programada = r;
    }

    const items = await Mantenimiento.findAll({
      where,
      include: [
        { model: Equipo },
        { model: PersonaMantenimiento }
      ],
      order: [['id', 'ASC']]
    });

    // Normalizamos fechas y formatos igual que el API
    const rows = items.map(toDTOmtto);

    // Crear el Excel
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Mantenimientos');

    // Encabezados
    ws.addRow([
      'ID',
      'Código equipo',
      'Marca',
      'Modelo',
      'Responsable',
      'Tipo',
      'Prioridad',
      'Resultado',
      'Fecha programada',
      'Fecha ejecución',
      'Próximo vencimiento',
      'Descripción'
    ]);

    // Encabezados en negrita
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };

    // Filas
    rows.forEach(r => {
      const equipo = r.Equipo || r.equipo || {};
      const responsable = r.PersonaMantenimiento || r.personaMantenimiento || {};

      ws.addRow([
        r.id,
        equipo.codigo_inventario || '',
        equipo.marca || '',
        equipo.modelo || '',
        (responsable.apellidos || '') + ' ' + (responsable.nombres || ''),
        r.tipo || '',
        r.prioridad || '',
        r.resultado || '',
        r.fecha_programada || '',
        r.fecha_ejecucion || '',
        r.proximo_vencimiento || '',
        r.descripcion || ''
      ]);
    });

    // Ajustar ancho aproximado de columnas
    ws.columns.forEach(col => {
      col.width = 18;
    });

    // Cabeceras HTTP para descargar
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="mantenimientos.xlsx"'
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al generar el reporte de mantenimientos');
  }
});



/* ===============================
 *  APIs — Ubicaciones / Responsables
 * =============================== */

/* ===============================
 *  Reportes — Ubicaciones (Excel)
 *  GET /reportes/ubicaciones.xlsx
 * =============================== */
app.get('/reportes/ubicaciones.xlsx', requireAuth, async (req, res) => {
  try {
    // Filtrado para el reporte igual que en el API, es decir, mismos query params que /api/ubicaciones
    const { identificacion, sede, edificio, piso, sala, q } = req.query;

    const where = {};
    if (identificacion) where.identificacion = identificacion;
    if (sede) where.sede = sede;
    if (edificio) where.edificio = edificio;
    if (piso) where.piso = piso;
    if (sala) where.sala = sala;
    if (q) where.sede = { [Op.like]: `%${q}%` };

    const items = await Ubicacion.findAll({
      where,
      order: [['id', 'ASC']]
    });

    // Crear el Excel
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ubicaciones');

    // Encabezados
    ws.addRow([
      'ID',
      'Identificación',
      'Sede',
      'Edificio',
      'Piso',
      'Sala',
      'Fecha creación',
      'Fecha actualización'
    ]);

    // Encabezados en negrita
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };

    // Filas
    items.forEach(u => {
      ws.addRow([
        u.id,
        u.identificacion || '',
        u.sede || '',
        u.edificio || '',
        u.piso || '',
        u.sala || '',
        u.createdAt || '',
        u.updatedAt || ''
      ]);
    });

    ws.columns.forEach(col => {
      col.width = 18;
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="ubicaciones.xlsx"'
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al generar el reporte de ubicaciones');
  }
});

// Listar Ubicaciones
app.get('/api/ubicaciones', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};

    if (q) {
      where[Op.or] = [
        { identificacion: { [Op.like]: `%${q}%` } },
        { sede:        { [Op.like]: `%${q}%` } },
        { edificio:      { [Op.like]: `%${q}%` } },
        { piso:      { [Op.like]: `%${q}%` } },
        { sala:      { [Op.like]: `%${q}%` } }
      ];
    }

    const ubicaciones = await Ubicacion.findAll({
      where,
      order: [['identificacion', 'ASC']]
    });

    res.json(ubicaciones);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar ubicaciones' });
  }
});

app.get('/api/ubicaciones/:id', requireAuth,async (req, res) => {
  const item = await Ubicacion.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: 'Ubicación no encontrada' });
  res.json(toDTO(item));
});

app.post('/api/ubicaciones',requireRole('admin'), async (req, res) => {
  try {
    const item = await Ubicacion.create(req.body);
    res.status(201).json(toDTO(item));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/ubicaciones/:id', requireRole('admin'),async (req, res) => {
  try {
    const item = await Ubicacion.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Ubicación no encontrada' });
    await item.update(req.body);
    res.json(toDTO(item));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/ubicaciones/:id', requireRole('admin'),async (req, res) => {
  try {
    const hasEquipos = await Equipo.count({ where: { ubicacionId: req.params.id } });
    if (hasEquipos) return res.status(400).json({ error: 'No se puede eliminar: hay equipos en esta ubicación' });
    const item = await Ubicacion.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Ubicación no encontrada' });
    await item.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ===============================
 *  APIs — Responsables/Custodios
 *  (GET/POST/PUT/DELETE /api/responsables-custodios)
 * =============================== */

// Listar Responsables/Custodios
app.get('/api/responsables-custodios', requireAuth, async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};

    if (q) {
      where[Op.or] = [
        { id_area:     { [Op.like]: `%${q}%` } },
        { nombre_area: { [Op.like]: `%${q}%` } }
      ];
    }

    const responsables = await ResponsableCustodio.findAll({
      where,
      order: [['id_area', 'ASC']]
    });

    res.json(responsables);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar responsables/custodios' });
  }
});

app.get('/api/responsables-custodios/:id', requireAuth, async (req, res) => {
  const item = await ResponsableCustodio.findByPk(req.params.id);
  if (!item) return res.status(404).json({ error: 'Responsable/custodio no encontrado' });
  res.json(toDTO(item));
});

app.post('/api/responsables-custodios', requireRole('admin'), async (req, res) => {
  try {
    const item = await ResponsableCustodio.create(req.body);
    res.status(201).json(toDTO(item));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/responsables-custodios/:id', requireRole('admin'), async (req, res) => {
  try {
    const item = await ResponsableCustodio.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Responsable/custodio no encontrado' });
    await item.update(req.body);
    res.json(toDTO(item));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/responsables-custodios/:id', requireRole('admin'), async (req, res) => {
  try {
    const hasEquipos = await Equipo.count({ where: { responsableId: req.params.id } });
    if (hasEquipos) return res.status(400).json({ error: 'No se puede eliminar: hay equipos asociados a este responsable/custodio' });
    const item = await ResponsableCustodio.findByPk(req.params.id);
    if (!item) return res.status(404).json({ error: 'Responsable/custodio no encontrado' });
    await item.destroy();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



/* ===============================
 *  APIs — Usuarios (solo admin)
 *  /api/usuarios
 * =============================== */

/* ===============================
 *  Reportes — Usuarios (Excel)
 *  GET /reportes/usuarios.xlsx
 * =============================== */
app.get('/reportes/usuarios.xlsx', requireAuth, async (req, res) => {
  try {
    // tenemos el filtrado para el reporte igual que en el API, es decir, mismos query params que /api/mantenimientos
    const { username, role, q } = req.query;

    const where = {};
    if (username)      where.username = username;
    if (role)          where.role = role;
    if (q)             where.username = { [Op.like]: `%${q}%` };
    
    const items = await User.findAll({
      where,
      order: [['id', 'ASC']]
    });

    // Crear el Excel
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Usuarios');

    // Encabezados
    ws.addRow([
      'ID',
      'Usuario',
      'Rol',
      'Creado',
      'Actualizado'
    ]);

    // Encabezados en negrita
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };

    // Filas
    items.forEach(u => {
      ws.addRow([
        u.id,
        u.username || '',
        u.role || '',
        u.createdAt || '',
        u.updatedAt || ''
      ]);
    });

    // Ajustar ancho aproximado de columnas
    ws.columns.forEach(col => {
      col.width = 18;
    });

    // Cabeceras HTTP para descargar
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="usuarios.xlsx"'
    );

    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(500).send('Error al generar el reporte de usuarios');
  }
});

// Listar usuarios
app.get('/api/usuarios', requireRole('admin'), async (req, res) => {
  try {
    const { q } = req.query;
    const where = {};
    if (q) {
      where[Op.or] = [
        { username: { [Op.like]: `%${q}%` } },
        { role:     { [Op.like]: `%${q}%` } }
      ];
    }
    const usuarios = await User.findAll({
      where,
      order: [['username', 'ASC']]
    });
    res.json(usuarios.map(userToDTO));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
});

// Obtener un usuario
app.get('/api/usuarios/:id', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(userToDTO(user));
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// Crear usuario
app.post('/api/usuarios', requireRole('admin'), async (req, res) => {
  try {
    const { username, password, role } = req.body || {};
    const errors = [];

    if (!username?.trim()) errors.push('El nombre de usuario es obligatorio');
    if (!password?.trim()) errors.push('La contraseña es obligatoria');
    if (password && password.length < 6) errors.push('La contraseña debe tener al menos 6 caracteres');
    if (!role || !['admin', 'user', 'officer'].includes(role)) {
      errors.push('Rol inválido (use admin, user u officer)');
    }

    const existing = await User.count({ where: { username } });
    if (existing) errors.push('El nombre de usuario ya existe');

    if (errors.length) {
      return res.status(400).json({ errors });
    }

    const hash = await bcrypt.hash(password, 10);
    const nuevo = await User.create({
      username: username.trim(),
      password_hash: hash,
      role
    });

    res.status(201).json(userToDTO(nuevo));
  } catch (e) {
    console.error(e);
    res.status(500).json({ errors: ['Error al crear usuario'] });
  }
});

// Actualizar usuario
app.put('/api/usuarios/:id', requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ errors: ['Usuario no encontrado'] });

    const { username, password, role } = req.body || {};
    const errors = [];

    if (username != null && !String(username).trim()) {
      errors.push('El nombre de usuario no puede estar vacío');
    }
    if (role != null && !['admin', 'user', 'officer'].includes(role)) {
      errors.push('Rol inválido (use admin o user)');
    }

    // Validar unicidad de username si se cambia
    if (username && username !== user.username) {
      const existing = await User.count({
        where: {
          username,
          id: { [Op.ne]: user.id }
        }
      });
      if (existing) errors.push('El nombre de usuario ya existe');
    }


  // 🚫 No permitir que un admin se baje su propio rol
    if (
      role &&                        // se está enviando rol
      user.id === req.user.id &&     // está editando su propio usuario
      user.role === 'admin' &&       // actualmente es admin
      role !== 'admin'               // intenta cambiarlo a otro (user)
    ) {
      return res.status(400).json({
        errors: ['No puede cambiar su propio rol de admin a user']
      });
    }


    if (errors.length) return res.status(400).json({ errors });

    const payload = {};
    if (username != null) payload.username = String(username).trim();
    if (role != null) payload.role = role;

    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({ errors: ['La contraseña debe tener al menos 6 caracteres'] });
      }
      const hash = await bcrypt.hash(password, 10);
      payload.password_hash = hash;
    }

    await user.update(payload);
    res.json(userToDTO(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ errors: ['Error al actualizar usuario'] });
  }
});

// Eliminar usuario
app.delete('/api/usuarios/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);

    // No permitir que el admin se elimine a sí mismo
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    }

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    await user.destroy();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});


/* ===============================
 *  APIs — Perfil de usuario autenticado
 *  /api/me  (GET/PUT)
 * =============================== */

// Obtener mi propio perfil
app.get('/api/me', requireAuth, (req, res) => {
  res.json(userToDTO(req.user));
});

// Actualizar mi propio perfil (solo username y contraseña)
app.put('/api/me', requireAuth, async (req, res) => {
  try {
    const user = req.user; // el que está logueado
    const { username, password } = req.body || {};
    const errors = [];

    if (username != null && !String(username).trim()) {
      errors.push('El nombre de usuario no puede estar vacío');
    }

    // Validar unicidad si cambia el username
    if (username && username !== user.username) {
      const existing = await User.count({
        where: {
          username,
          id: { [Op.ne]: user.id }
        }
      });
      if (existing) errors.push('El nombre de usuario ya existe');
    }

    if (password && password.trim() && password.length < 6) {
      errors.push('La contraseña debe tener al menos 6 caracteres');
    }

    if (errors.length) return res.status(400).json({ errors });

    const payload = {};
    if (username != null) payload.username = String(username).trim();

    if (password && password.trim()) {
      const hash = await bcrypt.hash(password, 10);
      payload.password_hash = hash;
    }

    await user.update(payload);
    res.json(userToDTO(user));
  } catch (e) {
    console.error(e);
    res.status(500).json({ errors: ['Error al actualizar perfil'] });
  }
});




/* ===============================
 *  Auth: login / logout
 * =============================== */

// Formulario de login
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');  // ya logueado
  const { msg } = req.query;
  res.render('login', { error: null, success: msg || null });
});


// Procesar login
app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).render('login', { error: 'Credenciales inválidas', success: null });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).render('login', { error: 'Credenciales inválidas', success: null });
    }

    req.session.userId = user.id;
    res.redirect('/');
  } catch (e) {
    console.error(e);
    res.status(500).render('login', { error: 'Error interno', success: null });
  }
});


// Logout
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error al destruir sesión:', err);
    }
    // Borra la cookie de la sesión
    res.clearCookie('connect.sid');
    // Redirige siempre al login
    res.redirect('/login');
  });
});


/* ===============================
 *  Recuperación de contraseña
 * =============================== */

app.get('/forgot-password', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('forgot_password', { error: null, message: null, resetLink: null });
});

app.post('/forgot-password', async (req, res) => {
  const { username } = req.body || {};
  try {
    if (!username) {
      return res.render('forgot_password', {
        error: 'Debe ingresar el nombre de usuario',
        message: null,
        resetLink: null
      });
    }

    const user = await User.findOne({ where: { username } });

    if (!user) {
      return res.render('forgot_password', {
        error: null,
        message: 'Si el usuario existe, se ha generado un enlace de recuperación.',
        resetLink: null
      });
    }

    const token = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await user.update({
      reset_token: token,
      reset_expires: expires
    });

    const resetLink = `http://localhost:${PORT}/reset-password?token=${token}`;
    console.log('🔐 Enlace de recuperación generado:', resetLink);

    return res.render('forgot_password', {
      error: null,
      message: 'Se ha generado un enlace de recuperación (válido por 1 hora).',
      resetLink
    });
  } catch (e) {
    console.error(e);
    res.render('forgot_password', {
      error: 'Error al procesar la solicitud.',
      message: null,
      resetLink: null
    });
  }
});

app.get('/reset-password', async (req, res) => {
  const { token } = req.query || {};

  if (!token) {
    return res.render('reset_password', {
      error: 'Token inválido o faltante.',
      token: null
    });
  }

  const user = await User.findOne({
    where: {
      reset_token: token,
      reset_expires: { [Op.gt]: new Date() }
    }
  });

  if (!user) {
    return res.render('reset_password', {
      error: 'Token inválido o expirado.',
      token: null
    });
  }

  res.render('reset_password', {
    error: null,
    token
  });
});

app.post('/reset-password', async (req, res) => {
  const { token, password, password2 } = req.body || {};

  try {
    if (!token) {
      return res.render('reset_password', {
        error: 'Token faltante.',
        token: null
      });
    }

    if (!password || !password2) {
      return res.render('reset_password', {
        error: 'Debe ingresar y confirmar la nueva contraseña.',
        token
      });
    }

    if (password !== password2) {
      return res.render('reset_password', {
        error: 'Las contraseñas no coinciden.',
        token
      });
    }

    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_expires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.render('reset_password', {
        error: 'Token inválido o expirado.',
        token: null
      });
    }

    const hash = await bcrypt.hash(password, 10);

    await user.update({
      password_hash: hash,
      reset_token: null,
      reset_expires: null
    });

    return res.redirect('/login?msg=' + encodeURIComponent('Contraseña actualizada. Ya puede iniciar sesión.'));

  } catch (e) {
    console.error(e);
    return res.render('reset_password', {
      error: 'Error interno al actualizar la contraseña.',
      token
    });
  }
});


/* ===============================
 *  Rutas de vistas (SSR con EJS)
 * =============================== */
app.get('/', requireAuth,(_req, res) => {
  res.render('home');
});

app.get('/equipos', requireAuth,async (_req, res) => {
  const equipos = await Equipo.findAll({
    include: [Ubicacion, ResponsableCustodio],
    order: [['id', 'ASC']]
  });
  res.render('equipos', { equipos });
});

app.get('/ubicaciones', requireAuth,async (_req, res) => {
  const ubicaciones = await Ubicacion.findAll({ order: [['identificacion', 'ASC']] });
  res.render('ubicaciones', { ubicaciones });
});

app.get('/responsables-custodios', requireAuth,async (_req, res) => {
  const responsables = await ResponsableCustodio.findAll({ order: [['id_area', 'ASC']] });
  res.render('responsables_custodios', { responsables });
});

app.get('/cargos',requireAuth, async (_req, res) => {
  const cargos = await Cargo.findAll({ order: [['nombre', 'ASC']] });
  res.render('cargos', { cargos });
});

app.get('/personas-mantenimiento', requireAuth,async (_req, res) => {
  res.render('personas_mantenimiento', {});
});

app.get('/mantenimientos', requireAuth,async (_req, res) => {
  const mantenimientos = await Mantenimiento.findAll({
    include: [{ model: Equipo }, { model: PersonaMantenimiento }], 
    order: [['id', 'ASC']]
  });
  res.render('mantenimientos', { mantenimientos: mantenimientos.map(toDTOmtto) });
});


app.get('/usuarios', requireRole('admin'), async (_req, res) => {
  const usuarios = await User.findAll({ order: [['username', 'ASC']] });
  res.render('usuarios', {
    usuarios: usuarios.map(userToDTO)
  });
});


app.get('/mi-perfil', requireAuth, (req, res) => {
  res.render('mi_perfil', { user: userToDTO(req.user) });
});


/* ===============================
 *  Manejo de errores de multer
 * =============================== */
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ ok: false, error: 'Archivo supera 5MB' });
    }
    return res.status(400).json({ ok: false, error: `Error de subida: ${err.code}` });
  }
  if (err && err.message && err.message.includes('Tipo de archivo no permitido')) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  return res.status(500).json({ ok: false, error: err?.message || 'Error interno' });
});

/* ===============================
 *  Arranque + Seeds (solo dominio de mantenimiento)
 * =============================== */
const PORT = Number(process.env.PORT || 4000);

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Conectado a la BD MySQL');

    await sequelize.sync();
    console.log('Tablas listas');

    // Seed de usuario admin si no existe
    const adminCount = await User.count();
    if (!adminCount) {
      const passwordHash = await bcrypt.hash('admin123', 10); //podemos cambiar esta contraseña por defecto
      await User.create({
        username: 'admin',
        password_hash: passwordHash,
        role: 'admin'
      });
      console.log('✅ Usuario admin creado: username=admin, password=admin123');
    }


    // Seeds para dominio de mantenimiento de equipos

    const uCount = await Ubicacion.count();
    if (!uCount) {
      await Ubicacion.bulkCreate([
        { identificacion: 'S1-A-3-305', sede: 'Sede 1', edificio: 'A', piso: '3', sala: '305' },
        { identificacion: 'S1-D-1-101', sede: 'Sede 1', edificio: 'D', piso: '1', sala: '101' }
      ]);
    }

    const rCount = await ResponsableCustodio.count();
if (!rCount) {
  await ResponsableCustodio.bulkCreate([
    { id_area: 'TI',  nombre_area: 'Tecnologías de la Información' },
    { id_area: 'LOG', nombre_area: 'Logística' }
  ]);
}
const [u1] = await Ubicacion.findAll({ limit: 1 });
const [r1] = await ResponsableCustodio.findAll({ limit: 1 });


    const eCount = await Equipo.count();
    if (!eCount && u1 && r1) {
      await Equipo.bulkCreate([
        {
          codigo_inventario: 'EQ-0001',
          serial: 'SN-ABC-001',
          marca: 'Dell',
          modelo: 'Latitude 5520',
          tipo_equipo: 'laptop',
          estado: 'operativo',
          ubicacionId: u1.id,
          responsableId: r1.id
        },
        {
          codigo_inventario: 'EQ-0002',
          serial: 'SN-XYZ-002',
          marca: 'HP',
          modelo: 'ProDesk 600',
          tipo_equipo: 'desktop',
          estado: 'operativo',
          ubicacionId: u1.id,
          responsableId: r1.id
        }
      ]);
    }

    // Seeds Cargos
const cCount = await Cargo.count();
if (!cCount) {
  await Cargo.bulkCreate([
    { nombre: 'Técnico de Soporte', tipo: 'interno' },
    { nombre: 'Proveedor Externo', tipo: 'externo' },
    { nombre: 'Jefe de Mantenimiento', tipo: 'interno' },
  ]);
  console.log('✅ Seeds de cargos creados');
}

// Busca un cargo para asignar
const cargoSoporte = await Cargo.findOne({ where: { nombre: 'Técnico de Soporte' } }) 
  || await Cargo.findOne(); // fallback

// Seeds Personas ( con cargoId)
const pCount = await PersonaMantenimiento.count();
if (!pCount) {
  await PersonaMantenimiento.bulkCreate([
    { identificacion: '1001', apellidos: 'Pérez',  nombres: 'Carlos',          email: 'carlos.perez@demo.com', cargoId: cargoSoporte?.id || null },
    { identificacion: '1002', apellidos: 'Pérez',  nombres: 'Carlos Andrés',   cargoId: cargoSoporte?.id || null },
    { identificacion: '2001', apellidos: 'García', nombres: 'María',           cargoId: cargoSoporte?.id || null }
  ]);
}


    const mCount = await Mantenimiento.count();
    if (!mCount) {
      const firstEquipo = await Equipo.findOne();
      let firstPersona = await PersonaMantenimiento.findOne();

if (!firstPersona) {
  firstPersona = await PersonaMantenimiento.create({
    identificacion: '0000',
    apellidos: 'Soporte',
    nombres: 'Técnico',
    email: 'soporte@demo.com'
  });
}


      if (firstEquipo && firstPersona) {
        await Mantenimiento.bulkCreate([
          {
            equipoId: firstEquipo.id,
            responsableId: firstPersona.id,
            tipo: 'preventivo',
            prioridad: 'media',
            fecha_programada: new Date(),
            proximo_vencimiento: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
            descripcion: 'Mantenimiento preventivo general (limpieza y actualización BIOS).',
            resultado: null
          },
          {
            equipoId: firstEquipo.id,
            responsableId: firstPersona.id,
            tipo: 'correctivo',
            prioridad: 'alta',
            fecha_programada: new Date(),
            fecha_ejecucion: new Date(),
            descripcion: 'Reemplazo de fuente de poder.',
            resultado: 'exitoso'
          }
        ]);
        console.log('Seed de mantenimientos cargado.');
      } else {
        console.log('No se sembraron mantenimientos: faltan equipo y/o persona.');
      }
    }

    app.listen(PORT, () => {
      console.log(`Servidor listo → http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('No se pudo iniciar:', err);
    process.exit(1);
  }
})();
