// models/index.js
const Ubicacion = require('./Ubicacion');
const ResponsableCustodio = require('./ResponsableCustodio');
const { Equipo } = require('./Equipo');
const { Mantenimiento } = require('./Mantenimiento');
const PersonaMantenimiento = require('./PersonaMantenimiento');
const Cargo = require('./Cargo'); // ✅ nuevo
const User = require('./User');


// Ubicación 1..N Equipos
Ubicacion.hasMany(Equipo, { foreignKey: 'ubicacionId' });
Equipo.belongsTo(Ubicacion, { foreignKey: 'ubicacionId' });

// ResponsableCustodio 1..N Equipos
ResponsableCustodio.hasMany(Equipo, { foreignKey: 'responsableId' });
Equipo.belongsTo(ResponsableCustodio, { foreignKey: 'responsableId' });

// Equipo 1..N Mantenimientos
Equipo.hasMany(Mantenimiento, { foreignKey: 'equipoId', onDelete: 'CASCADE' });
Mantenimiento.belongsTo(Equipo, { foreignKey: 'equipoId' });

// PersonaMantenimiento 1..N Mantenimientos
PersonaMantenimiento.hasMany(Mantenimiento, { foreignKey: 'responsableId' });
Mantenimiento.belongsTo(PersonaMantenimiento, { foreignKey: 'responsableId' });

// Cargo 1..N PersonasMantenimiento
Cargo.hasMany(PersonaMantenimiento, { foreignKey: 'cargoId' });
PersonaMantenimiento.belongsTo(Cargo, { foreignKey: 'cargoId' }); // ✅

module.exports = {
  Ubicacion,
  ResponsableCustodio,
  Equipo,
  Mantenimiento,
  PersonaMantenimiento,
  Cargo, 
  User
};
