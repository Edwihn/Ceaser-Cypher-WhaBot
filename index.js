const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrCode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});

// ─── QR Code Generation ───────────────────────────────────────────────
client.on('qr', (qr) => {
    qrCode.generate(qr, { small: true });
});

// ─── Ready Event ──────────────────────────────────────────────────────
client.on('ready', () => {
    console.log('Client is ready!');
});

// ─── Caesar Cipher Helper Functions ───────────────────────────────────

/**
 * Encrypts a string using the Caesar Cipher algorithm.
 * Shifts each letter forward by `shift` positions, wrapping around the alphabet.
 * Non-letter characters are left unchanged; letter case is preserved.
 *
 * @param {string} text  - The plaintext to encrypt.
 * @param {number} shift - The number of positions to shift (0–25).
 * @returns {string} The encrypted ciphertext.
 */
function caesarEncrypt(text, shift) {
    // Normalize the shift to a positive value within 0–25
    shift = ((shift % 26) + 26) % 26;

    return text
        .split('')
        .map((char) => {
            // Handle uppercase letters (A = 65 … Z = 90)
            if (char >= 'A' && char <= 'Z') {
                return String.fromCharCode(((char.charCodeAt(0) - 65 + shift) % 26) + 65);
            }
            // Handle lowercase letters (a = 97 … z = 122)
            if (char >= 'a' && char <= 'z') {
                return String.fromCharCode(((char.charCodeAt(0) - 97 + shift) % 26) + 97);
            }
            // Non-alphabetic characters pass through unchanged
            return char;
        })
        .join('');
}

/**
 * Decrypts a string that was encrypted with the Caesar Cipher.
 * Shifts each letter backward by `shift` positions (equivalent to
 * encrypting with 26 − shift).
 *
 * @param {string} text  - The ciphertext to decrypt.
 * @param {number} shift - The shift that was used during encryption.
 * @returns {string} The decrypted plaintext.
 */
function caesarDecrypt(text, shift) {
    // Decrypting is just encrypting in the opposite direction
    return caesarEncrypt(text, -shift);
}

// ─── Message Handler ──────────────────────────────────────────────────
client.on('message', async (message) => {
    try {
        // Skip messages from Channels / Newsletters to avoid the
        // "Cannot read properties of undefined (reading 'description')"
        // crash inside whatsapp-web.js's Channel._patch.
        if (message.from?.endsWith('@newsletter')) return;

        // Ignore messages sent by the bot itself to prevent reply loops
        if (message.fromMe) return;

        const chat = await message.getChat();

        // Split the message body into parts: [command, word, shift]
        const parts = message.body.trim().split(/\s+/);
        const command = parts[0]?.toLowerCase();

        // ── 1. Ping Command ───────────────────────────────────────────
        if (command === 'ping') {
            await message.reply('pong');
            return;
        }

        // ── 2. Caesar Encrypt Command ─────────────────────────────────
        if (command === '!cypher') {
            const word = parts[1];
            const shift = parseInt(parts[2], 10);

            // Validate that both arguments were provided and shift is a number
            if (!word || isNaN(shift)) {
                await message.reply('⚠️ Usage: !cypher WORD SHIFT\nExample: !cypher HELLO 3');
                return;
            }

            const encrypted = caesarEncrypt(word, shift);
            await message.reply(encrypted);
            return;
        }

        // ── 3. Caesar Decrypt Command ─────────────────────────────────
        if (command === '!decypher') {
            const word = parts[1];
            const shift = parseInt(parts[2], 10);

            // Validate that both arguments were provided and shift is a number
            if (!word || isNaN(shift)) {
                await message.reply('⚠️ Usage: !decypher WORD SHIFT\nExample: !decypher KHOOR 3');
                return;
            }

            const decrypted = caesarDecrypt(word, shift);
            await message.reply(decrypted);
            return;
        }

        // ── 4. Sticker (default action for non-command messages) ──────
        // Only send the sticker if the message is NOT a recognized command.
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

// ─── Initialize the Client ───────────────────────────────────────────z
client.initialize();