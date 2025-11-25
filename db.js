// db.js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    dialect: 'mysql',
    timezone: '+00:00', // guarda/lee en UTC
    logging: false, // true para ver el SQL
  }
);

module.exports = { sequelize }; // exporta la instancia de Sequelize para usar en otros módulos
