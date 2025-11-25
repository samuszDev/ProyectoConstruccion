// models/ResponsableCustodio.js
// responsables de custodia de equipos
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const ResponsableCustodio = sequelize.define('ResponsableCustodio', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  id_area: { type: DataTypes.STRING(50), allowNull: false, unique: true }, // código único
  nombre_area: { type: DataTypes.STRING(120), allowNull: false },
}, {
  tableName: 'responsables_custodios', // <-- NUEVO NOMBRE DE TABLA
  timestamps: true,
});

module.exports = ResponsableCustodio;
