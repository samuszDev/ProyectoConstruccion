# crear la base de datos en mysql
CREATE DATABASE crud_orm_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;

# Instalaciones en la terminal de VSCode
- mkdir crud-orm-js && cd crud-orm-js   (aplica en caso de no haber creado previamente la carpeta del proyecto)

1. npm init -y
2. npm i express sequelize mysql2 dotenv cors
3. npm i -D nodemon


# Estructura del proyecto:
crud-orm-js/
├─ .env                    # Configuración sensible (puertos, credenciales)
├─ package.json            # Dependencias + scripts de node js (se crea bajo instalación)
├─ server.js               # Punto de entrada: Express, rutas API, arranque
├─ db.js                   # Conexión Sequelize centralizada
├─ models/
│  └─ Product.js           # Modelo ORM (tabla 'productos')
└─ public/                 # Frontend estático servido por Express
│  ├─ index.html           # UI con Bootstrap
│  └─ app.js               # Lógica de UI: fetch a la API, render y eventos
└─ utils/                  # Utilidades
   └─ enumReader.js        # para leer los valores de un ENUM en MySQL
      


# Ejecución del proyecto en la terminal
node server.js
nodemon server.js  (para tomar las actualizaciones sin reiniciar el servidor)

# por si no arranca el servidor con nodemon:
npm install -g nodemon
# verificar la versión
nodemon -v

## Flujo de comunicación entre los archivos ------------------------------------------------------------------

1.) Inicio y configuración
# .env
Aquí se definen las variables de entorno: credenciales de MySQL (DB_HOST, DB_USER, etc.) y el puerto (PORT).
# db.js
Crea una conexión única a MySQL usando Sequelize, leyendo los datos de .env.
# Este módulo se exporta y lo usan server.js y enumReader.js.


2.) Capa de datos (Modelos)
# models/Product.js
Define el modelo Product, que corresponde a la tabla productos en MySQL.
Incluye los campos (id, nombre, precio, categoria, condicion).
# utils/enumReader.js
Función que consulta INFORMATION_SCHEMA.COLUMNS en MySQL para leer los valores actuales de los ENUM (categoría y condición).
# Es usado por la ruta /api/opciones en server.js

3.) Backend (API REST con Express) 
# server.js
Es el corazón del backend:

1. Crea la app de Express.
2. Carga middlewares (cors, express.json, express.static).
3. Define las rutas:
/api/opciones → usa enumReader para enviar las opciones de los <select>.
/api/productos (GET/POST/PUT/DELETE) → CRUD usando el modelo Product.


4. Al arrancar, hace sequelize.sync() y si no hay productos, inserta un seed con 3 registros.
# Sirve el frontend (archivos en public) y responde a las llamadas (fetch - Asynchronous JavaScript).

4.) Frontend (UI con HTML+Bootstrap+JS)

# public/index.html
- Define la estructura visual: tabla de productos, modal para crear/editar, botones.
- Incluye un div.toast-container para mostrar mensajes flash.
- Importa Bootstrap y app.js.

# public/app.js
Es la lógica del frontend:
- cargarOpciones() → pide /api/opciones al backend y llena los <select> de categoría y condición.
- listar() → pide /api/productos y dibuja la tabla con renderTabla().
- Maneja clics en la tabla:
    Editar → abre el modal con datos de /api/productos/:id.
    Eliminar → llama DELETE /api/productos/:id y refresca.
- Maneja el modal:
    submit → decide entre POST o PUT a /api/productos.
    Si ok, cierra modal, refresca tabla, muestra un toast.
- showToast() → crea dinámicamente mensaje flash un Bootstrap toast (éxito/error/info).

5.) Flujo de comunicación

- 1. El navegador pide http://localhost:4000/ → Express devuelve public/index.html.
- 2. index.html carga app.js.
- 3. app.js llama:
    /api/opciones → obtiene catálogos (ENUMs) y llena selects.
    /api/productos → obtiene productos y llena tabla.

- 4. Al crear/editar/eliminar:
    app.js manda fetch (POST/PUT/DELETE) → server.js procesa con Sequelize → MySQL.
    Backend responde → FE refresca lista y muestra toast.


# -------------------------------------------------------------------------------

Frontend (HTML+JS) 
            → manda requests con fetch 
                    → Backend (Express) 
                        → usa Modelo Sequelize → MySQL.
Los datos vuelven al frontend → app.js actualiza DOM y muestra toasts.

# -------------------------------------------------------------------------------




# -------------------------------- PRUEBAS POSTMAN -------------------------------

1.) Probar healthcheck
Método: GET
URL: http://localhost:4000/api/health
Respuesta esperada:
{ "status": "ok" }

2.) Obtener opciones ENUM
Método: GET
URL: http://localhost:4000/api/opciones
Respuesta esperada:
{
  "categorias": ["Equipo IT", "Equipo biomédico"....],
  "condiciones": ["nuevo", "usado"]
}


3.) Listar todos los productos
Método: GET
URL: http://localhost:4000/api/productos
Respuesta esperada:
[
  {
    "id": 1,
    "nombre": "Router",
    "precio": "299900.00",
    "categoria": "Equipo IT",
    "condicion": "nuevo",
    "createdAt": "29 de septiembre de 2025, 11:32 a. m.",
    "updatedAt": "29 de septiembre de 2025, 11:32 a. m."
  },
  ...
]


4.) Obtener un producto por ID

Método: GET

URL: http://localhost:4000/api/productos/1


5.) Crear un producto

Método: POST
URL: http://localhost:4000/api/productos

Body/raw/JSON: 
{
  "nombre": "Monitor 27”",
  "precio": 1200000,
  "categoria": "Equipo IT",
  "condicion": "nuevo"
}


6.) Actualizar un producto

Método: PUT
URL: http://localhost:4000/api/productos/8

Body/raw/JSON:
{
  "nombre": "Router TP-Link",
  "precio": 280000,
  "categoria": "Equipo IT",
  "condicion": "usado"
}


7.) Eliminar un producto

Método: DELETE

URL: http://localhost:4000/api/productos/8


# --------------------------------------------------------------------------------

# ----- proyecto con EJS
npm i ejs


# -------------------- Instalaciones 30 octubre ---------------------------

0. crear la base de datos
CREATE DATABASE project_db_c_sw CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;


1. npm init -y
2. npm i express sequelize mysql2 dotenv cors
3. npm i -D nodemon
4. npm install ejs
5. npm i multer uuid


6. npm i express-session bcrypt
npm i express-session connect-session-sequelize bcrypt

7. npm install exceljs
