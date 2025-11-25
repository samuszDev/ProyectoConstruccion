// models/User.js
const { DataTypes } = require('sequelize');
const { sequelize } = require('../db');

const User = sequelize.define('User', {
  username: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    validate: { notEmpty: true }
  },
  password_hash: {
    type: DataTypes.STRING(200),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'user', 'officer'),
    allowNull: false,
    defaultValue: 'user'
  },
  //  Campos para recuperación de contraseña
  reset_token: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  reset_expires: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'users',
  timestamps: true
});

module.exports = User;
