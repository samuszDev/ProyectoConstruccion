// models/Cargo.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const Cargo = sequelize.define('Cargo', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  nombre: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  // interno/externo (se puede ampliar según necesidades)
  tipo: { 
    type: DataTypes.ENUM('interno', 'externo'),
    allowNull: false,
    defaultValue: 'interno'
  },
  descripcion: { type: DataTypes.STRING(200), allowNull: true }
}, {
  tableName: 'cargos',
  timestamps: true
});

module.exports = Cargo;
