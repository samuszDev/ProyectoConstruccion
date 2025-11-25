// models/Equipo.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const TIPOS = ['laptop', 'desktop', 'impresora', 'switch', 'router', 'servidor', 'otro'];
const ESTADOS = ['operativo', 'en_mantenimiento', 'dado_de_baja'];

const Equipo = sequelize.define('Equipo', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },

  codigo_inventario: {
    type: DataTypes.STRING(60),
    allowNull: false,
    unique: { msg: 'El código de inventario ya existe' },
    validate: {
      notNull: { msg: 'El código de inventario es obligatorio' },
      notEmpty: { msg: 'El código de inventario no puede estar vacío' },
      len: { args: [2, 60], msg: 'El código de inventario debe tener entre 2 y 60 caracteres' }
    }
  },

  serial: {
    type: DataTypes.STRING(100),
    allowNull: false,                           
    unique: { msg: 'El serial ya existe' },
    validate: {
      notNull: { msg: 'El serial es obligatorio' },
      notEmpty: { msg: 'El serial no puede estar vacío' },
      len: { args: [2, 100], msg: 'El serial debe tener entre 2 y 100 caracteres' }
    }
  },

  marca: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notNull: { msg: 'La marca es obligatoria' },
      notEmpty: { msg: 'La marca no puede estar vacía' },
      len: { args: [2, 100], msg: 'La marca debe tener entre 2 y 100 caracteres' }
    }
  },

  modelo: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notNull: { msg: 'El modelo es obligatorio' },
      notEmpty: { msg: 'El modelo no puede estar vacío' },
      len: { args: [1, 100], msg: 'El modelo debe tener entre 1 y 100 caracteres' }
    }
  },

  tipo_equipo: {
    type: DataTypes.ENUM(...TIPOS),
    allowNull: false,
    validate: {
      notNull: { msg: 'El tipo de equipo es obligatorio' },
      isIn: { args: [TIPOS], msg: `Tipo de equipo inválido. Opciones: ${TIPOS.join(', ')}` }
    }
  },

  estado: {
    type: DataTypes.ENUM(...ESTADOS),
    allowNull: false,
    validate: {
      notNull: { msg: 'El estado es obligatorio' },
      isIn: { args: [ESTADOS], msg: `Estado inválido. Opciones: ${ESTADOS.join(', ')}` }
    }
  },

  // Relaciones
  ubicacionId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    validate: {
      notNull: { msg: 'La ubicación es obligatoria' },
      isInt: { msg: 'ubicacionId debe ser un número entero' },
      min: { args: [1], msg: 'ubicacionId debe ser mayor a 0' }
    }
  },

  responsableId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    validate: {
      notNull: { msg: 'El responsable/custodio es obligatorio' },
      isInt: { msg: 'responsableId debe ser un número entero' },
      min: { args: [1], msg: 'responsableId debe ser mayor a 0' }
    }
  }
}, {
  tableName: 'equipos',
  timestamps: true,
  hooks: {
    beforeValidate(instance) {
      // Trims defensivos
      ['codigo_inventario','serial','marca','modelo'].forEach(k=>{
        if (typeof instance[k] === 'string') instance[k] = instance[k].trim();
      });
    }
  }
});

module.exports = { Equipo, TIPOS, ESTADOS };
