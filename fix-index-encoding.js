/**
 * Script Node per: (1) convertire index.html da UTF-16 a UTF-8,
 * (2) rimuovere Firebase App Check (causa errori in console),
 * (3) aggiungere script reCAPTCHA v2 e silenziare warning config.
 * Eseguire dalla cartella matrimonio-sito: node fix-index-encoding.js
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
let buf = fs.readFileSync(indexPath);
// Supporta UTF-16 LE (BOM FF FE) o UTF-8
let content = buf[0] === 0xFF && buf[1] === 0xFE
    ? buf.toString('utf16le')
    : buf.toString('utf8');
content = content.replace(/^\uFEFF/, '');

// Rimuovi blocco Firebase App Check (causa appCheck/recaptcha-error)
const appCheckBlock = `    <!-- Firebase App Check Initialization -->
    <script>
        // Initialize Firebase App Check after Firebase is loaded
        document.addEventListener('DOMContentLoaded', function() {
            if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
                try {
                    const app = firebase.app();
                    const recaptchaSiteKey = window.RECAPTCHA_SITE_KEY || '6LcIrSksAAAAAMOGMT7_W16O84yTnb09RlGSCljJ';

                    // Initialize App Check with reCAPTCHA v3
                    const appCheck = firebase.appCheck();
                    appCheck.activate(recaptchaSiteKey, true); // true = isTokenAutoRefreshEnabled

                    console.log('✅ Firebase App Check initialized');
                } catch (error) {
                    console.warn('⚠️ Firebase App Check initialization failed:', error);
                    console.warn('   App will work without App Check, but API key protection is reduced');
                }
            }
        });
    </script>
`;

if (content.includes('Firebase App Check Initialization')) {
    content = content.replace(appCheckBlock, '\n');
    console.log('Rimosso blocco Firebase App Check.');
}

// Sostituisci script reCAPTCHA v3 con v2 (checkbox per form RSVP) e silenzia warning config
// 1) Rimuovi onerror dal tag config.local.js per evitare messaggio fuorviante
content = content.replace(
    '<script src="config.local.js" onerror="console.warn(\'config.local.js not found, using placeholder config\')"></script>',
    '<script src="config.local.js"></script>'
);
if (content.includes('config.local.js"></script>') && !content.includes('onerror')) {
    console.log('Rimosso onerror da config.local.js.');
}

// 2) Aggiungi reCAPTCHA v2 subito dopo reCAPTCHA v3 (o sostituisci: per il form serve v2)
//    La pagina ha già api.js?render=... (v3). Aggiungiamo api.js (v2) per il widget checkbox.
const recaptchaV2Tag = '\n    <!-- reCAPTCHA v2 per form RSVP (checkbox) -->\n    <script src="https://www.google.com/recaptcha/api.js" async defer></script>\n';
if (!content.includes('recaptcha/api.js" async defer></script>')) {
    // Inserisci dopo il primo script recaptcha
    content = content.replace(
        /(<script src="https:\/\/www\.google\.com\/recaptcha\/api\.js\?render=[^"]+"\s+async\s+defer><\/script>)/,
        '$1' + recaptchaV2Tag
    );
    console.log('Aggiunto script reCAPTCHA v2.');
}

fs.writeFileSync(indexPath, content, { encoding: 'utf8' });
console.log('index.html convertito in UTF-8 e aggiornato. Fatto.');
