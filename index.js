require('dotenv').config(); // Carga las variables de entorno desde .env
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors'); // Importa cors

const app = express();
const PORT = process.env.PORT || 3000; // Puerto del servidor

// Middlewares
app.use(express.json()); // Para parsear el cuerpo de las solicitudes JSON
app.use(cors()); // Habilita CORS para todas las rutas. En producción, configúralo para orígenes específicos.

// Configuración de la autenticación de la cuenta de servicio
const serviceAccountKeyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const adminEmail = process.env.ADMIN_EMAIL;
const scopes = ['https://www.googleapis.com/auth/admin.directory.user']; // Scope para gestionar usuarios

if (!serviceAccountKeyPath || !adminEmail) {
    console.error("ERROR: Las variables de entorno GOOGLE_APPLICATION_CREDENTIALS y ADMIN_EMAIL deben estar configuradas.");
    process.exit(1);
}

let adminService; // Variable para almacenar el servicio de Admin SDK

// Función para inicializar el cliente de la API de Google
async function initializeGoogleAdminService() {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: serviceAccountKeyPath,
            scopes: scopes,
            // La cuenta de servicio actúa en nombre de este administrador
            clientOptions: {
                subject: adminEmail
            }
        });

        const authClient = await auth.getClient();
        adminService = google.admin({ version: 'directory_v1', auth: authClient });
        console.log("Servicio de Google Admin SDK inicializado correctamente.");
    } catch (error) {
        console.error("Error al inicializar el servicio de Google Admin SDK:", error.message);
        console.error("Asegúrate de que la clave de la cuenta de servicio es válida y la delegación de ámbito de dominio está configurada correctamente.");
        process.exit(1); // Salir si la inicialización falla
    }
}

// Llama a la inicialización al arrancar el servidor
initializeGoogleAdminService();

// Ruta para el cambio de contraseña
app.post('/api/change-password', async (req, res) => {
    // Añade forcePasswordChange con un valor predeterminado de true si no se proporciona
    const { userEmail, newPassword, forcePasswordChange = true } = req.body;

    if (!userEmail || !newPassword) {
        return res.status(400).json({ success: false, message: 'Faltan userEmail o newPassword.' });
    }

    if (!adminService) {
        return res.status(500).json({ success: false, message: 'El servicio de Google Admin SDK no está inicializado.' });
    }

    try {
        const user = await adminService.users.update({
            userKey: userEmail,
            requestBody: {
                password: newPassword,
                // Usa el valor de forcePasswordChange del body, si no, usa 'true' por defecto
                changePasswordAtNextLogin: forcePasswordChange
            }
        });

        let message = `Contraseña para ${userEmail} actualizada correctamente.`;
        if (forcePasswordChange) {
            message += " El usuario deberá cambiarla en el próximo inicio de sesión.";
        } else {
            message += " El usuario podrá usar esta contraseña directamente.";
        }

        console.log(message);
        res.json({ success: true, message: message });

    } catch (error) {
        console.error(`Error al cambiar la contraseña para ${userEmail}:`, error.message);
        if (error.code === 404) {
            return res.status(404).json({ success: false, message: `Usuario ${userEmail} no encontrado.` });
        }
        if (error.code === 403) {
            return res.status(403).json({ success: false, message: `Permisos insuficientes. Asegúrate de que el superadministrador y la delegación de ámbito de dominio están configurados correctamente para ${adminEmail}.` });
        }
        // Otros errores de Google API o de red
        res.status(500).json({ success: false, message: `Error en el servidor al cambiar la contraseña: ${error.message}` });
    }
});

// Ruta para obtener información de un usuario
app.get('/api/user-info/:userEmail', async (req, res) => {
    const userEmail = req.params.userEmail; // Obtiene el email del parámetro de la URL

    if (!userEmail) {
        return res.status(400).json({ success: false, message: 'Falta userEmail en los parámetros de la URL.' });
    }

    if (!adminService) {
        return res.status(500).json({ success: false, message: 'El servicio de Google Admin SDK no está inicializado.' });
    }

    try {
        const response = await adminService.users.get({
            userKey: userEmail
        });

        // Puedes elegir qué campos quieres devolver para evitar exponer datos sensibles
        const userInfo = {
            id: response.data.id,
            primaryEmail: response.data.primaryEmail,
            name: response.data.name ? `${response.data.name.givenName} ${response.data.name.familyName}` : null,
            orgUnitPath: response.data.orgUnitPath,
            suspended: response.data.suspended,
            creationTime: response.data.creationTime,
            lastLoginTime: response.data.lastLoginTime,
            isDelegatedAdmin: response.data.isDelegatedAdmin,
            // Puedes añadir más campos según tus necesidades, revisa la documentación de la API
            // Por ejemplo: response.data.agreedToTerms, response.data.isMailboxSetup, etc.
        };

        console.log(`Información para ${userEmail} obtenida exitosamente.`);
        res.json({ success: true, user: userInfo });

    } catch (error) {
        console.error(`Error al obtener información para ${userEmail}:`, error.message);
        if (error.code === 404) {
            return res.status(404).json({ success: false, message: `Usuario ${userEmail} no encontrado.` });
        }
        if (error.code === 403) {
            return res.status(403).json({ success: false, message: `Permisos insuficientes para obtener información del usuario. Asegúrate de los scopes correctos y la delegación de ámbito de dominio.` });
        }
        res.status(500).json({ success: false, message: `Error en el servidor al obtener información del usuario: ${error.message}` });
    }
});

// ... (código anterior, después de los otros app.post y app.get) ...

// Ruta para actualizar información del usuario (nombre, estado de suspensión)
app.put('/api/user-update/:userEmail', async (req, res) => {
    const userEmail = req.params.userEmail; // Email del usuario a actualizar
    const { firstName, lastName, suspended } = req.body; // Campos que se pueden actualizar

    if (!userEmail) {
        return res.status(400).json({ success: false, message: 'Falta userEmail en los parámetros de la URL.' });
    }

    if (!adminService) {
        return res.status(500).json({ success: false, message: 'El servicio de Google Admin SDK no está inicializado.' });
    }

    const requestBody = {};

    // Construir el objeto de actualización basado en los campos proporcionados
    if (firstName !== undefined || lastName !== undefined) {
        requestBody.name = {};
        if (firstName !== undefined) {
            requestBody.name.givenName = firstName;
        }
        if (lastName !== undefined) {
            requestBody.name.familyName = lastName;
        }
    }

    if (suspended !== undefined) {
        // Asegúrate de que 'suspended' es un booleano
        if (typeof suspended !== 'boolean') {
            return res.status(400).json({ success: false, message: 'El campo "suspended" debe ser un valor booleano (true/false).' });
        }
        requestBody.suspended = suspended;
    }

    // Si no se proporcionó ningún campo para actualizar
    if (Object.keys(requestBody).length === 0) {
        return res.status(400).json({ success: false, message: 'No se proporcionaron campos para actualizar (firstName, lastName, o suspended).' });
    }

    try {
        const response = await adminService.users.update({
            userKey: userEmail,
            requestBody: requestBody // Envía solo los campos que deseas actualizar
        });

        let message = `Usuario ${userEmail} actualizado correctamente.`;
        if (firstName !== undefined || lastName !== undefined) {
            message += ` Nombre cambiado a ${response.data.name.givenName} ${response.data.name.familyName}.`;
        }
        if (suspended !== undefined) {
            message += ` Cuenta ${response.data.suspended ? 'suspendida' : 'reactivada'}.`;
        }

        console.log(message);
        res.json({ success: true, message: message, user: response.data });

    } catch (error) {
        console.error(`Error al actualizar el usuario ${userEmail}:`, error.message);
        if (error.code === 404) {
            return res.status(404).json({ success: false, message: `Usuario ${userEmail} no encontrado.` });
        }
        if (error.code === 403) {
            return res.status(403).json({ success: false, message: `Permisos insuficientes para actualizar el usuario. Asegúrate de los scopes correctos y la delegación de ámbito de dominio.` });
        }
        res.status(500).json({ success: false, message: `Error en el servidor al actualizar el usuario: ${error.message}` });
    }
});

// ... (resto del código, app.get('/') y app.listen) ...

// Ruta de prueba simple
app.get('/', (req, res) => {
    res.send('Backend de restablecimiento de contraseña de Google Admin API funcionando.');
});

// Inicia el servidor
app.listen(PORT, () => {
    console.log(`Servidor Node.js escuchando en el puerto ${PORT}`);
    console.log(`Accede a http://localhost:${PORT}`);
});
