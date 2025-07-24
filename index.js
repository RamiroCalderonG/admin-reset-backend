// Cargar variables de entorno desde .env
require('dotenv').config();
const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

// Middleware para parsear JSON en las solicitudes (opcional si no esperas JSON)
app.use(express.json());

// Ruta de prueba simple
app.get('/', (req, res) => {
    res.send('¡Backend base funcionando! Listo para nuevos proyectos.');
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Backend escuchando en http://localhost:${port}`);
});