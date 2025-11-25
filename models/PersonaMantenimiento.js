// models/PersonaMantenimiento.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const PersonaMantenimiento = sequelize.define('PersonaMantenimiento', {
  id: { type: DataTypes.INTEGER.UNSIGNED, autoIncrement: true, primaryKey: true },
  identificacion: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  nombres: { type: DataTypes.STRING(120), allowNull: false },
  apellidos: { type: DataTypes.STRING(120), allowNull: false },
  
  cargoId: { 
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,          // si debe tener cargo sí o sí
    references: { model: 'cargos', key: 'id' },
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  },
  email: { type: DataTypes.STRING(160), allowNull: true, validate: { isEmail: true } },
  telefono: { type: DataTypes.STRING(40), allowNull: true },
}, {
  tableName: 'personas_mantenimiento',
  timestamps: true,
});
PersonaMantenimiento.associate = (models) => {
  PersonaMantenimiento.belongsTo(models.Cargo, {
    foreignKey: 'cargoId',
    as: 'Cargo'
  });
};

module.exports = PersonaMantenimiento;



  

