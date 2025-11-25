// models/Mantenimiento.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const TIPOS = ['preventivo', 'correctivo'];
const PRIORIDADES = ['baja', 'media', 'alta', 'crítica'];
const RESULTADOS = ['exitoso', 'parcial', 'fallido'];

const Mantenimiento = sequelize.define('Mantenimiento', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },

  // FKs
  equipoId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  responsableId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false }, // para la relación con Persona

  // Enums
  tipo: { type: DataTypes.ENUM(...TIPOS), allowNull: false },
  prioridad: { type: DataTypes.ENUM(...PRIORIDADES), allowNull: false, defaultValue: 'media' },
  resultado: { type: DataTypes.ENUM(...RESULTADOS), allowNull: true },

  // Fechas
  fecha_programada: { type: DataTypes.DATE, allowNull: true },
  fecha_ejecucion: { type: DataTypes.DATE, allowNull: true },
  proximo_vencimiento: { type: DataTypes.DATE, allowNull: true },

  // Descripción
  descripcion: { type: DataTypes.TEXT, allowNull: true },
  observaciones: { type: DataTypes.TEXT, allowNull: true },

  // Adjuntos
  adjunto_url: { type: DataTypes.STRING(500), allowNull: true },
}, {
  tableName: 'mantenimientos',
  timestamps: true,
});

module.exports = { Mantenimiento, TIPOS, PRIORIDADES, RESULTADOS };
