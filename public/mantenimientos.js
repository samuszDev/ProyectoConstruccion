// public/mantenimientos.js
const API = '/api/mantenimientos';
const API_EQUIPOS_MIN = '/api/equipos/min';
const API_EQUIPOS_FALLBACK = '/api/equipos';
const API_PERSONAS = '/api/personas-mantenimiento';
const API_UPLOADS = '/api/uploads';

const tbody = document.getElementById('tbody');
const btnNuevo = document.getElementById('btnNuevo');
const modal = new bootstrap.Modal(document.getElementById('modal'));
const $ = (id)=>document.getElementById(id);

// ====== Helpers ====== 
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const bg = type==='success'?'bg-success':type==='error'?'bg-danger':'bg-info';
  const el = document.createElement('div');
  el.className = `toast align-items-center text-white ${bg} border-0`;
  el.role='alert'; el.ariaLive='assertive'; el.ariaAtomic='true';
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  container.appendChild(el);
  const t=new bootstrap.Toast(el,{delay:2800}); t.show();
  el.addEventListener('hidden.bs.toast', ()=>el.remove());
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const raw = await r.text(); // leemos el cuerpo una sola vez
  if (!r.ok) {
    // intentamos formatear el error en algo legible
    try {
      const j = raw ? JSON.parse(raw) : null;
      const msg =
        (j?.errors && Array.isArray(j.errors) && j.errors.length)
          ? j.errors.join(' | ')
          : (j?.error || raw || 'Error');
      throw new Error(msg);
    } catch {
      throw new Error(raw || 'Error');
    }
  }
  return raw ? JSON.parse(raw) : {};
}

function formatDisplayDT(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // por si viene algo raro
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatDisplayDate(value) {
  if (!value) return '';

  // Caso 1: viene como fecha pura YYYY-MM-DD (lo tratamos como LOCAL)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    // new Date(año, mesIndex, día) crea una fecha local sin aplicar zona horaria
    const localDate = new Date(y, m - 1, d);
    return localDate.toLocaleDateString('es-CO', {
      dateStyle: 'medium'
    });
  }

  // Caso 2: viene como ISO completo (con "T" y posible "Z")
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;

  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium'
  });
}


function toLocalDT(value){
  if(!value) return '';
  const d=new Date(value);
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TIPOS=['preventivo','correctivo'];
const PRIORIDADES=['baja','media','alta','crítica'];
const RESULTADOS=['exitoso','parcial','fallido'];

function loadEnums(){
  $('fTipo').innerHTML = '<option value="">Tipo...</option>'+TIPOS.map(v=>`<option value="${v}">${v}</option>`).join('');
  $('fPri').innerHTML  = '<option value="">Prioridad...</option>'+PRIORIDADES.map(v=>`<option value="${v}">${v}</option>`).join('');
  $('fRes').innerHTML  = '<option value="">Resultado...</option>' + RESULTADOS.map(v=>`<option value="${v}">${v}</option>`).join('');

  $('tipo').innerHTML = TIPOS.map(v=>`<option value="${v}">${v}</option>`).join('');
  $('prioridad').innerHTML = PRIORIDADES.map(v=>`<option value="${v}">${v}</option>`).join('');
  $('resultado').innerHTML = '<option value="">(pendiente)</option>' + RESULTADOS.map(v=>`<option value="${v}">${v}</option>`).join('');
}

/* ====== Catálogo de EQUIPOS (para código inventario) ====== */
let EQUIPOS = [];            // [{id, codigo_inventario, ...}]
let CODE_TO_ID = new Map();  // "EQ-0001" -> 12

async function cargarCodigos() {
  try {
    EQUIPOS = await fetchJSON(API_EQUIPOS_MIN);
  } catch {
    EQUIPOS = await fetchJSON(API_EQUIPOS_FALLBACK);
    EQUIPOS = EQUIPOS.map(e => ({
      id: e.id,
      codigo_inventario: e.codigo_inventario,
      marca: e.marca || '',
      modelo: e.modelo || ''
    }));
  }
  CODE_TO_ID.clear();
  const dl = $('dl_codigos');     if (dl) dl.innerHTML = '';
  const fdl = $('dl_fcodigos');   if (fdl) fdl.innerHTML = '';

  EQUIPOS.forEach(e => {
    if (!e.codigo_inventario) return;
    CODE_TO_ID.set(e.codigo_inventario, e.id);
    const opt = `<option value="${e.codigo_inventario}">${e.codigo_inventario} — ${e.marca} ${e.modelo}</option>`;
    dl?.insertAdjacentHTML('beforeend',  opt);
    fdl?.insertAdjacentHTML('beforeend', opt);
  });
}

/* ====== PERSONAS (catálogos separados) ====== */
const personaLabel = p => `${p.identificacion} — ${p.apellidos}, ${p.nombres}`;

// --- Normalización y resolución tolerante ---
function norm(s=''){
  return s
    .normalize('NFKC')
    .replace(/—/g, '-')     // emdash → hyphen, es decir, guion normal para separar identificación de nombre
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// intenta resolver ID por label normalizado o por identificación
async function resolverPersonaDesdeTexto(txt){
  const key = norm(txt);

  // 1) match exacto contra las entradas cargadas en el MODAL
  if (PERSONAS_MODAL.size){
    for (const [label,id] of PERSONAS_MODAL.entries()){
      if (norm(label) === key) return id;
    }
  }

  // 2) intentar por identificación (antes de “—” o “-”)
  const iden = txt.split('—')[0].split('-')[0].trim();
  if (iden){
    try{
      const list = await fetchJSON(`${API_PERSONAS}?q=${encodeURIComponent(iden)}`).catch(()=>[]);
      const exact = list.find(p => String(p.identificacion).trim() === iden);
      if (exact) return exact.id;
      if (list.length === 1) return list[0].id; // heurística amable
    }catch{}
  }
  return null;
}
 
// — Modal para seleccionar persona responsable
let PERSONAS_MODAL = new Map(); // label -> id
let PERSONAS_MASTER = new Map(); // label -> id (catálogo estable)

let ctrlModal = null;
async function buscarPersonasModal(q){
  try{
    if (ctrlModal) ctrlModal.abort();
    ctrlModal = new AbortController();
    const url = q ? `${API_PERSONAS}?q=${encodeURIComponent(q)}` : `${API_PERSONAS}`;
    const list = await fetchJSON(url, { signal: ctrlModal.signal }).catch(()=>[]);
    const dl = $('dl_personas_modal');

    // Render del datalist (filtrado)
    PERSONAS_MODAL.clear();
    if (dl) dl.innerHTML = '';
    list.forEach(p=>{
      const label = personaLabel(p);
      PERSONAS_MODAL.set(label, p.id);
      PERSONAS_MASTER.set(label, p.id); // <-- ¡siempre agregamos al maestro!
      dl?.insertAdjacentHTML('beforeend', `<option value="${label}">${label}</option>`);
    });

    // Si no hubo resultados pero el usuario dejó el label completo, intentamos resolver por identificación
    if (list.length === 0 && q){
      const id = await resolverPersonaDesdeTexto(q).catch(()=>null);
      if (id){
        PERSONAS_MASTER.set(q, id);
        PERSONAS_MODAL.set(q, id);
        dl?.insertAdjacentHTML('beforeend', `<option value="${q}">${q}</option>`);
      }
    }
  }catch{}
}


// — Filtro superior
let PERSONAS_FILTER = new Map(); // label -> id
let ctrlFilter = null;
async function buscarPersonasFiltro(q){
  try{
    if (ctrlFilter) ctrlFilter.abort();
    ctrlFilter = new AbortController();
    const url = q ? `${API_PERSONAS}?q=${encodeURIComponent(q)}` : `${API_PERSONAS}`;
    const list = await fetchJSON(url, { signal: ctrlFilter.signal }).catch(()=>[]);
    const dl = $('dl_personas_filter');
    PERSONAS_FILTER.clear();
    if (dl) dl.innerHTML = '';
    list.forEach(p=>{
      const label = personaLabel(p);
      PERSONAS_FILTER.set(label, p.id);
      dl?.insertAdjacentHTML('beforeend', `<option value="${label}">${label}</option>`);
    });
  }catch{}
}

/* ====== Validaciones y habilitar Guardar ====== */
function validarTodoYToggleSubmit(){
  const btn = document.querySelector('#form button[type="submit"]');
  if (!btn) return;
  const code = ($('codigo_inventario')?.value||'').trim();
  const per  = ($('persona_autocomplete')?.value||'').trim();
  const okCodigo  = CODE_TO_ID.has(code);

  // valida persona por igualdad NORMALIZADA contra el catálogo del modal
  let okPersona = false;
  if (per){
    const key = norm(per);
    for (const label of PERSONAS_MODAL.keys()){
      if (norm(label) === key){ okPersona = true; break; }
    }
  }

  btn.disabled = !(okCodigo && okPersona);
  $('codigo_inventario')?.classList.toggle('is-invalid', !okCodigo && code!=='');
  $('codigo_inventario')?.classList.toggle('is-valid',   okCodigo && code!=='');
  $('persona_autocomplete')?.classList.toggle('is-invalid', !okPersona && per!=='');
  $('persona_autocomplete')?.classList.toggle('is-valid',   okPersona && per!=='');
}

/* ====== Helpers de PREVIEW de adjunto ====== */
function setAdjuntoPreview(url){
  const a = $('adjunto_preview');
  const inputUrl = $('adjunto_url');
  if (!a || !inputUrl) return;
  if (!url){
    a.style.display = 'none';
    a.href = '#';
    inputUrl.value = '';
    return;
  }
  inputUrl.value = url;
  a.href = url;
  a.textContent = url.endsWith('.pdf') ? 'Ver PDF' : 'Ver adjunto';
  a.style.display = 'inline-block';
}

function validarArchivo(file){
  if (!file) return 'No se seleccionó archivo.';
  const okTypes = ['application/pdf','image/png','image/jpeg'];
  if (!okTypes.includes(file.type)) return 'Tipo no permitido. Usa PDF, JPG o PNG.';
  const max = 5 * 1024 * 1024; // 5MB
  if (file.size > max) return 'Archivo supera 5MB.';
  return null;
}

// ====== Subir adjunto ======
async function subirAdjunto(file){
  const err = validarArchivo(file);
  if (err) throw new Error(err);
  const fd = new FormData();
  fd.append('file', file);
  
  const res = await fetch(API_UPLOADS, { method: 'POST', body: fd });
  if (!res.ok){
    let msg = await res.text().catch(()=> 'Error al subir archivo');
    throw new Error(msg || 'Error al subir archivo');
  }
  const data = await res.json();
  const url = data.url || data.fileUrl;
  if (!url) throw new Error('El servidor no devolvió URL del adjunto');
  return url;
}

/* ====== Listado (con filtros por persona y código) ====== */
async function listar(){
  const params = new URLSearchParams();
  const q = $('q').value.trim();             if(q) params.set('q', q);
  const t = $('fTipo').value;                 if(t) params.set('tipo', t);
  const p = $('fPri').value;                  if(p) params.set('prioridad', p);
  const r = $('fRes').value;                  if(r) params.set('resultado', r);

// Filtro por persona (tolerante: label normalizado o búsqueda por identificación)
const fper = $('fPersona') ? $('fPersona').value.trim() : '';
if (fper) {
  // 1) intenta match normalizado contra el datalist cargado
  let pid = null;
  const nf = norm(fper);
  for (const [label, id] of PERSONAS_FILTER.entries()) {
    if (norm(label) === nf) { pid = id; break; }
  }
  // 2) si no hubo match, intenta resolver por identificación / búsqueda al backend
  if (!pid) {
    pid = await resolverPersonaDesdeTexto(fper).catch(() => null);
  }
  if (pid) {
    params.set('responsableId', String(pid));
  } else {
    showToast('Persona no encontrada en el catálogo', 'error');
  }
}


  // Filtro por código inventario → equipoId
  const fcod = $('fCodigo') ? $('fCodigo').value.trim() : '';
  if (fcod) {
    const eid = CODE_TO_ID.get(fcod);
    if (eid) params.set('equipoId', String(eid));
    else showToast('Código no encontrado en catálogo de equipos', 'error');
  }

  const data = await fetchJSON(`${API}${params.toString()?`?${params}`:''}`);
  tbody.innerHTML = '';
  data.forEach(m=>{
    const responsable = m.PersonaMantenimiento
  ? `${m.PersonaMantenimiento.apellidos}, ${m.PersonaMantenimiento.nombres}`
  : '';

    const adj = m.adjunto_url
      ? (m.adjunto_url.endsWith('.pdf')
          ? `<a href="${m.adjunto_url}" target="_blank" class="btn btn-sm btn-outline-dark">PDF</a>`
          : `<a href="${m.adjunto_url}" target="_blank"><img src="${m.adjunto_url}" alt="Adjunto" style="max-height:40px;border-radius:6px"></a>`)
      : '';
    const tr=document.createElement('tr');
    tr.innerHTML = `
      <td>${m.id}</td>
      <td>${m.Equipo ? (m.Equipo.codigo_inventario || ('#'+m.equipoId)) : ('#'+m.equipoId)}</td>
      <td>${m.tipo}</td>
      <td>${m.prioridad}</td>
      <td>${formatDisplayDT(m.fecha_programada)}</td>
      <td>${formatDisplayDT(m.fecha_ejecucion)}</td>
      <td>${formatDisplayDate(m.proximo_vencimiento)}</td>

      <td>${m.resultado||''}</td>
      <td>${responsable}</td>
      <td>${adj}</td>
            <td>
        ${
          (window.CURRENT_USER_ROLE === 'admin' || window.CURRENT_USER_ROLE === 'officer') 
          ? `<button class="btn btn-sm btn-warning me-2" data-act="edit" data-id="${m.id}">Editar</button>`
          : ''
        }

        ${
          (window.CURRENT_USER_ROLE === 'admin')
          ? `<button class="btn btn-sm btn-danger" data-act="del" data-id="${m.id}">Eliminar</button>`
          : ''
        }
      </td>
    `;
    tbody.appendChild(tr);
  });
}

document.getElementById('btnFiltrar').addEventListener('click', ()=>listar().catch(()=>showToast('Error al filtrar','error')));
document.getElementById('btnLimpiar').addEventListener('click', () => {
  $('q').value = '';
  if ($('fCodigo'))   $('fCodigo').value = '';
  if ($('fPersona'))  $('fPersona').value = '';
  $('fTipo').value = '';
  $('fPri').value  = '';
  $('fRes').value  = '';

  listar().catch(() => showToast('Error', 'error'));
});


/* ====== Nuevo mantenimiento ====== */
btnNuevo.addEventListener('click', ()=>{
  $('title').textContent='Nuevo mantenimiento';
  $('id').value='';
  $('codigo_inventario') && ($('codigo_inventario').value='');
  $('tipo').selectedIndex=0;
  $('prioridad').value='media';
  $('resultado').value='';
  $('fecha_programada').value='';
  $('fecha_ejecucion').value='';
  $('proximo_vencimiento').value='';
  $('persona_autocomplete') && ($('persona_autocomplete').value='');
  $('adjunto_url').value='';
  setAdjuntoPreview(null); // limpia preview
  $('descripcion').value='';
  $('observaciones').value='';
  modal.show();
  validarTodoYToggleSubmit();
});

/* ====== Editar / Eliminar ====== */
tbody.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const {act,id} = btn.dataset;
  if (act==='edit'){
    const it = await fetchJSON(`${API}/${id}`);
    $('title').textContent = `Editar mantenimiento #${id}`;
    $('id').value = id;

    if ($('codigo_inventario')) {
      const code = (it.Equipo && it.Equipo.codigo_inventario) ? it.Equipo.codigo_inventario : '';
      $('codigo_inventario').value = code;
    }

    $('tipo').value = it.tipo;
    $('prioridad').value = it.prioridad;
    $('resultado').value = it.resultado || '';

    $('fecha_programada').value = toLocalDT(it.fecha_programada);
    $('fecha_ejecucion').value  = toLocalDT(it.fecha_ejecucion);
    $('proximo_vencimiento').value = it.proximo_vencimiento || '';


    // Setear persona (y asegurar que el label esté en el catálogo del modal)
    if ($('persona_autocomplete')) {
      const label = it.PersonaMantenimiento ? personaLabel(it.PersonaMantenimiento) : '';
      $('persona_autocomplete').value = label;
      await buscarPersonasModal(it.PersonaMantenimiento ? it.PersonaMantenimiento.identificacion : '');

      validarTodoYToggleSubmit();
    }

    $('adjunto_url').value = it.adjunto_url || '';
    setAdjuntoPreview(it.adjunto_url || null);

    $('descripcion').value = it.descripcion || '';
    $('observaciones').value = it.observaciones || '';
    modal.show();
    validarTodoYToggleSubmit();
  } else if (act==='del'){
    if(!confirm('¿Eliminar mantenimiento?')) return;
    try { 
      await fetchJSON(`${API}/${id}`, { method:'DELETE' });
      await listar(); 
      showToast('Mantenimiento eliminado','info'); 
    } catch(e){ 
      showToast('No se pudo eliminar','error'); 
    }
  }
});

/* ====== Guardar (POST/PUT) ====== */
document.getElementById('form').addEventListener('submit', async (e)=>{
  e.preventDefault();

  const codigo = $('codigo_inventario') ? $('codigo_inventario').value.trim() : '';
  if (!codigo) return showToast('Ingresa el código de inventario', 'error');
  if (!CODE_TO_ID.has(codigo)) return showToast('El código de inventario no existe', 'error');

  const perLabel = $('persona_autocomplete') ? $('persona_autocomplete').value.trim() : '';
  if (!perLabel) return showToast('Selecciona el responsable', 'error');

  // 1) intenta por label normalizado contra el catálogo del modal
  let responsableId = null;
  const nPer = norm(perLabel);
  for (const [label,id] of PERSONAS_MODAL.entries()){
    if (norm(label) === nPer){ responsableId = id; break; }
  }
  // 2) fallback por identificación / búsqueda si no hubo match
  if (!responsableId){
    responsableId = await resolverPersonaDesdeTexto(perLabel);
  }
  if (!responsableId) return showToast('La persona no es válida', 'error');

  const payload = {
    codigo_inventario: codigo,   // backend resuelve equipoId
    responsableId,               // obligatorio
    tipo: $('tipo').value,
    prioridad: $('prioridad').value,
    resultado: $('resultado').value || null,
    fecha_programada: $('fecha_programada').value ? new Date($('fecha_programada').value).toISOString() : null,
    fecha_ejecucion:  $('fecha_ejecucion').value  ? new Date($('fecha_ejecucion').value).toISOString()  : null,
    proximo_vencimiento: $('proximo_vencimiento').value || null,
    adjunto_url: $('adjunto_url').value.trim() || null,
    descripcion: $('descripcion').value.trim() || null,
    observaciones: $('observaciones').value.trim() || null,
  };

  const id = $('id').value;
  try{
    if (id) await fetchJSON(`${API}/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    else     await fetchJSON(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    modal.hide(); 
    await listar(); 
    showToast(id?'Mantenimiento actualizado':'Mantenimiento creado');
  }catch (e) {
  showToast(e.message || 'Error al guardar', 'error');
}

});

/* ====== Eventos para UPLOAD del adjunto ====== */
$('adjunto_file')?.addEventListener('change', async (e)=>{
  const file = e.target.files?.[0];
  if (!file) return;
  try{
    const url = await subirAdjunto(file);
    setAdjuntoPreview(url);
    showToast('Adjunto subido');
  }catch(err){
    setAdjuntoPreview(null);
    showToast(err.message || 'No se pudo subir el adjunto', 'error');
  }
});

/* ====== Init ====== */
(function init(){
  loadEnums();
  (async ()=>{
    try {
      await cargarCodigos();

      // Carga inicial de personas en ambos catálogos
      await buscarPersonasModal('');
      await buscarPersonasFiltro('');

      // Autocomplete incremental: modal
      let timerModal = null;
      $('persona_autocomplete')?.addEventListener('input', (e)=>{
        clearTimeout(timerModal);
        const q = e.target.value.trim();
        timerModal = setTimeout(()=>buscarPersonasModal(q), 250);
        validarTodoYToggleSubmit();
      });

      // Autocomplete incremental: filtro superior
      let timerFilter = null;
      $('fPersona')?.addEventListener('input', (e)=>{
        clearTimeout(timerFilter);
        const q = e.target.value.trim();
        timerFilter = setTimeout(()=>buscarPersonasFiltro(q), 250);
      });

      $('codigo_inventario')?.addEventListener('input', validarTodoYToggleSubmit);
      validarTodoYToggleSubmit();

      await listar();
    } catch {
      showToast('Error de carga', 'error');
    }
  })();
})();
