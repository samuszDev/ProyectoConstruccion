// models/Ubicacion.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

// Campos solicitados: id, identificación (único), sede, edificio, piso, sala
const Ubicacion = sequelize.define('Ubicacion', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  identificacion: { type: DataTypes.STRING(60), allowNull: false, unique: true }, // p.ej. "S1-A-3-305"
  sede: { type: DataTypes.STRING(100), allowNull: false },
  edificio: { type: DataTypes.STRING(100), allowNull: false },
  piso: { type: DataTypes.STRING(20), allowNull: false },
  sala: { type: DataTypes.STRING(100), allowNull: false },
}, {
  tableName: 'ubicaciones',
  timestamps: true,
});

module.exports = Ubicacion;
