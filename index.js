// Cargar variables de entorno desde.env
require('dotenv').config();
const express = require('express');
const axios = require('axios'); // Importar axios

const app = express();
const port = process.env.PORT || 3000; // Corregido: Cambiado '| |' a '||'

// Middleware para parsear JSON en las solicitudes
app.use(express.json());

// --- Configuración de SonicWall ---
const SONICWALL_HOST = process.env.SONICWALL_HOST;
const SONICWALL_USER = process.env.SONICWALL_USER;
const SONICWALL_PASSWORD = process.env.SONICWALL_PASSWORD;
const SONICWALL_PORT = process.env.SONICWALL_PORT || 443; // Corregido: Cambiado '| |' a '||'

const sonicwallBaseUrl = `https://${SONICWALL_HOST}:${SONICWALL_PORT}/api/sonicos`;

// Función para codificar credenciales en Base64 para Basic Auth
function encodeBase64(str) {
    return Buffer.from(str).toString('base64');
}

// Generar el encabezado de autorización Basic Auth una vez
const sonicwallAuthHeader = `Basic ${encodeBase64(`${SONICWALL_USER}:${SONICWALL_PASSWORD}`)}`;

// --- Rutas de SonicWall ---

// Endpoint para autenticar con SonicWall
app.post('/api/sonicwall/auth', async (req, res) => {
    console.log('Intentando autenticar con SonicWall...');
    try {
        const response = await axios.post(
            `${sonicwallBaseUrl}/auth`,
            { override: true }, // Usar override para tomar control de la sesión [1]
            {
                headers: {
                    'Accept': 'application/Json',
                    'Content-Type': 'application/Json',
                    'Authorization': sonicwallAuthHeader, // Encabezado de autenticación básica [1]
                },
                // Deshabilitar la verificación del certificado SSL/TLS (solo para desarrollo/pruebas)
                // En producción, configura un certificado válido o un proxy inverso.
                // Esto es necesario si SonicWall usa un certificado autofirmado.
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        if (response.data && response.data.status && response.data.data.status.success) { // Corregido: Acceso a response.data.data.status.success
            console.log('Autenticación con SonicWall exitosa.');
            res.json({
                success: true,
                message: 'Autenticación con SonicWall exitosa.',
                // Importante: Con Basic Auth, no se devuelve un token.
                // El mismo encabezado de autorización se usa para futuras solicitudes.
                sonicwallAuthHeader: sonicwallAuthHeader // Devolver el encabezado para que el frontend lo use
            });
        } else {
            console.error('Autenticación con SonicWall fallida:', response.data);
            res.status(401).json({ success: false, message: 'Autenticación con SonicWall fallida.', details: response.data });
        }
    } catch (error) {
        console.error('Error al conectar o autenticar con SonicWall:', error.message);
        if (error.response) {
            console.error('Respuesta de error de SonicWall:', error.response.data);
            if (error.response.status === 403) {
                res.status(403).json({ success: false, message: 'Acceso denegado. Asegúrate de que la API de SonicWall esté habilitada y el usuario tenga privilegios de administrador.', details: error.response.data });
            } else if (error.response.status === 401) {
                res.status(401).json({ success: false, message: 'Credenciales de SonicWall inválidas.', details: error.response.data });
            } else {
                res.status(error.response.status).json({ success: false, message: `Error de SonicWall: ${error.response.statusText}`, details: error.response.data });
            }
        } else {
            res.status(500).json({ success: false, message: `Error de conexión con SonicWall: ${error.message}` });
        }
    }
});

// Ejemplo de una ruta protegida que usaría la autenticación de SonicWall
// En un proyecto real, esta ruta sería llamada por tu frontend después de que el admin se autentique en tu backend.
// Luego, esta ruta usaría el sonicwallAuthHeader para hacer una operación en SonicWall.
app.post('/api/sonicwall/example-operation', async (req, res) => {
    console.log('Intentando realizar una operación de ejemplo en SonicWall...');
    try {
        // Aquí se usaría el mismo sonicwallAuthHeader para la operación
        const response = await axios.post(
            `${sonicwallBaseUrl}/config/pending`, // Ejemplo: verificar configuración pendiente [1]
            {}, // Cuerpo de la solicitud (puede ser vacío o con datos específicos de la operación)
            {
                headers: {
                    'Accept': 'application/Json',
                    'Content-Type': 'application/Json',
                    'Authorization': sonicwallAuthHeader, // Reutiliza el encabezado de autenticación
                },
                httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
            }
        );

        if (response.data && response.data.status && response.data.data.status.success) { // Corregido: Acceso a response.data.data.status.success
            console.log('Operación de ejemplo en SonicWall exitosa.');
            res.json({ success: true, message: 'Operación de ejemplo en SonicWall exitosa.', data: response.data });
        } else {
            console.error('Operación de ejemplo en SonicWall fallida:', response.data);
            res.status(500).json({ success: false, message: 'Operación de ejemplo en SonicWall fallida.', details: response.data });
        }
    } catch (error) {
        console.error('Error al realizar operación en SonicWall:', error.message);
        if (error.response) {
            res.status(error.response.status).json({ success: false, message: `Error de SonicWall: ${error.response.statusText}`, details: error.response.data });
        } else {
            res.status(500).json({ success: false, message: `Error de conexión con SonicWall: ${error.message}` });
        }
    }
});


// --- Rutas de prueba (mantener para verificación básica) ---
app.get('/', (req, res) => {
    res.send('¡Backend base funcionando! Listo para nuevos proyectos.');
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Backend escuchando en http://localhost:${port}`);
    console.log(`SonicWall API Base URL: ${sonicwallBaseUrl}`);
});
