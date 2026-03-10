const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrCode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// ─── Ruta al archivo JSON que funciona como "base de datos" local ─────
// Guarda usuarios registrados y su estado de sesión.
// Estructura: { "5215512345678@c.us": { "password": "cifrada", "isLoggedIn": false } }
const DB_PATH = path.join(__dirname, 'database.json');

// ─── Llave fija para el Cifrado César de contraseñas ──────────────────
const PASSWORD_SHIFT = 7;

// ─── Funciones de lectura / escritura del archivo JSON ────────────────

/**
 * Lee database.json y devuelve su contenido como objeto JS.
 * Si el archivo no existe o está corrupto, devuelve un objeto vacío {}.
 */
function loadDB() {
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch {
        // Si el archivo no existe o el JSON es inválido, se empieza limpio
        return {};
    }
}

/**
 * Escribe el objeto JS completo de vuelta a database.json.
 * Se usa JSON.stringify con 2 espacios de indentación para legibilidad.
 */
function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

// ─── Inicialización del cliente de WhatsApp ───────────────────────────
const client = new Client({
    authStrategy: new LocalAuth()
});

// ─── QR Code Generation ──────────────────────────────────────────────
client.on('qr', (qr) => {
    qrCode.generate(qr, { small: true });
});

// ─── Ready Event ─────────────────────────────────────────────────────
client.on('ready', () => {
    console.log('Client is ready!');
});

// ─── Caesar Cipher Helper Functions ──────────────────────────────────

/**
 * Encripta un string usando el Cifrado César.
 * Desplaza cada letra hacia adelante `shift` posiciones.
 * Los caracteres no alfabéticos se mantienen igual.
 *
 * @param {string} text  - Texto plano a encriptar.
 * @param {number} shift - Posiciones de desplazamiento (0–25).
 * @returns {string} Texto cifrado.
 */
function caesarEncrypt(text, shift) {
    // Normaliza el desplazamiento a un valor positivo entre 0–25
    shift = ((shift % 26) + 26) % 26;

    return text
        .split('')
        .map((char) => {
            // Mayúsculas (A = 65 … Z = 90)
            if (char >= 'A' && char <= 'Z') {
                return String.fromCharCode(((char.charCodeAt(0) - 65 + shift) % 26) + 65);
            }
            // Minúsculas (a = 97 … z = 122)
            if (char >= 'a' && char <= 'z') {
                return String.fromCharCode(((char.charCodeAt(0) - 97 + shift) % 26) + 97);
            }
            // Caracteres no alfabéticos pasan sin cambios
            return char;
        })
        .join('');
}

/**
 * Desencripta un string cifrado con César.
 * Equivale a encriptar con 26 − shift.
 *
 * @param {string} text  - Texto cifrado.
 * @param {number} shift - Desplazamiento usado al encriptar.
 * @returns {string} Texto plano.
 */
function caesarDecrypt(text, shift) {
    return caesarEncrypt(text, -shift);
}

// ─── Message Handler ─────────────────────────────────────────────────
client.on('message', async (message) => {
    try {
        // Ignorar mensajes de Canales / Newsletters
        if (message.from?.endsWith('@newsletter')) return;

        // Ignorar mensajes propios para evitar loops
        if (message.fromMe) return;

        const chat = await message.getChat();

        // Separar el mensaje en partes: [comando, ...args]
        const parts = message.body.trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();

        // ─── Identificador único del usuario (su número de WhatsApp) ──
        const userId = message.from; // ej. "5215512345678@c.us"

        // Cargar la base de datos al procesar cada mensaje
        const db = loadDB();

        // ══════════════════════════════════════════════════════════════
        // COMANDOS PÚBLICOS (no requieren sesión activa)
        // ══════════════════════════════════════════════════════════════

        // ── Registro: !mialta [password] ─────────────────────────────
        // Registra al usuario usando su número de teléfono como username.
        // La contraseña se encripta con César (llave fija 7) antes de guardarse.
        if (command === '!mialta') {
            const rawPassword = parts[1];

            if (!rawPassword) {
                await message.reply('⚠️ Uso: !mialta TU_CONTRASEÑA\nEjemplo: !mialta miClave123');
                return;
            }

            // Verificar si el usuario ya está registrado
            if (db[userId]) {
                await message.reply('⚠️ Ya estás registrado. Usa *!entrar [password]* para iniciar sesión.');
                return;
            }

            // Encriptar la contraseña automáticamente con llave fija 7
            const encryptedPassword = caesarEncrypt(rawPassword, PASSWORD_SHIFT);

            // Guardar en la "base de datos" con sesión inactiva
            db[userId] = {
                password: encryptedPassword,
                isLoggedIn: false
            };
            saveDB(db);

            await message.reply('✅ ¡Registro exitoso! Tu usuario es tu número de teléfono.\nUsa *!entrar [password]* para iniciar sesión.');
            return;
        }

        // ── Login: !entrar [password] ────────────────────────────────
        // Encripta el input del usuario con la misma llave 7 y lo compara
        // con la contraseña almacenada. Si coinciden, se activa la sesión.
        if (command === '!entrar') {
            const rawPassword = parts[1];

            if (!rawPassword) {
                await message.reply('⚠️ Uso: !entrar TU_CONTRASEÑA\nEjemplo: !entrar miClave123');
                return;
            }

            // Verificar si el usuario está registrado
            if (!db[userId]) {
                await message.reply('⚠️ No estás registrado. Usa *!mialta [password]* primero.');
                return;
            }

            // Verificar si ya tiene sesión activa
            if (db[userId].isLoggedIn) {
                await message.reply('ℹ️ Ya tienes una sesión activa.');
                return;
            }

            // Encriptar el input con la misma llave y comparar
            const encryptedInput = caesarEncrypt(rawPassword, PASSWORD_SHIFT);

            if (encryptedInput === db[userId].password) {
                // Login exitoso → actualizar estado de sesión
                db[userId].isLoggedIn = true;
                saveDB(db);
                await message.reply('✅ ¡Inicio de sesión exitoso! Ya puedes usar todos los comandos.');
            } else {
                // Contraseña incorrecta
                await message.reply('❌ Error de conexión: contraseña incorrecta.');
            }
            return;
        }

        // ══════════════════════════════════════════════════════════════
        // VERIFICACIÓN DE SESIÓN para comandos protegidos
        // ══════════════════════════════════════════════════════════════
        // Los comandos debajo de este punto requieren isLoggedIn === true.

        if (!db[userId] || !db[userId].isLoggedIn) {
            // Solo responder si el usuario envió un comando conocido
            const protectedCommands = ['ping', '!cypher', '!decypher', 'que'];
            if (protectedCommands.includes(command)) {
                await message.reply('🔒 Debes iniciar sesión primero.\nUsa *!entrar [password]* o regístrate con *!mialta [password]*.');
            }
            return;
        }

        // ══════════════════════════════════════════════════════════════
        // COMANDOS PROTEGIDOS (requieren sesión activa)
        // ══════════════════════════════════════════════════════════════

        // ── 1. Ping Command ──────────────────────────────────────────
        if (command === 'ping') {
            await message.reply('pong');
            return;
        }

        // ── 2. Caesar Encrypt Command ────────────────────────────────
        if (command === '!cypher') {
            const word = parts[1];
            const shift = parseInt(parts[2], 10);

            if (!word || isNaN(shift)) {
                await message.reply('⚠️ Uso: !cypher PALABRA DESPLAZAMIENTO\nEjemplo: !cypher HELLO 3');
                return;
            }

            const encrypted = caesarEncrypt(word, shift);
            await message.reply(encrypted);
            return;
        }

        // ── 3. Caesar Decrypt Command ────────────────────────────────
        if (command === '!decypher') {
            const word = parts[1];
            const shift = parseInt(parts[2], 10);

            if (!word || isNaN(shift)) {
                await message.reply('⚠️ Uso: !decypher PALABRA DESPLAZAMIENTO\nEjemplo: !decypher KHOOR 3');
                return;
            }

            const decrypted = caesarDecrypt(word, shift);
            await message.reply(decrypted);
            return;
        }

        // ── 4. Sticker Command ───────────────────────────────────────
        if (command === 'que') {
            const url = 'https://images7.memedroid.com/images/UPLOADED574/625f4dd6290b4.jpeg';

            const media = await MessageMedia.fromUrl(url);

            await client.sendMessage(message.from, media, {
                sendMediaAsSticker: true,
                stickerAuthor: 'My bot',
                stickerName: 'Sticker'
            });
        }
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// ─── Initialize the Client ──────────────────────────────────────────
client.initialize();