/**
 * Cloud Functions per Matrimonio Andrea & Giulia
 * 
 * Funzioni:
 * - verifyRecaptcha: Verifica token reCAPTCHA lato server
 * - submitRSVP: Salva RSVP dopo verifica reCAPTCHA
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

// Carica variabili d'ambiente
require('dotenv').config();

// Inizializza Firebase Admin
admin.initializeApp();

/**
 * Verifica token reCAPTCHA con Google
 * 
 * @param {string} token - Token reCAPTCHA da verificare
 * @returns {Promise<object>} - Risultato verifica da Google
 */
async function verifyRecaptchaToken(token) {
    // Secret Key di reCAPTCHA (da file .env)
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    
    if (!secretKey) {
        throw new Error('reCAPTCHA secret key not configured');
    }

    const verificationURL = 'https://www.google.com/recaptcha/api/siteverify';
    
    try {
        const response = await axios.post(verificationURL, null, {
            params: {
                secret: secretKey,
                response: token
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('Errore verifica reCAPTCHA:', error);
        throw new Error('Errore nella verifica reCAPTCHA');
    }
}

/**
 * Cloud Function: Verifica token reCAPTCHA
 * 
 * Endpoint: POST /verifyRecaptcha
 * Body: { token: string }
 * Response: { success: boolean, score?: number, action?: string }
 */
exports.verifyRecaptcha = functions.https.onCall(async (data, context) => {
    const { token } = data;

    // Validazione input
    if (!token) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Token reCAPTCHA mancante'
        );
    }

    try {
        // Verifica token con Google
        const verificationResult = await verifyRecaptchaToken(token);
        
        console.log('Risultato verifica reCAPTCHA:', verificationResult);

        // Controlla se la verifica è riuscita
        if (!verificationResult.success) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Verifica reCAPTCHA fallita',
                verificationResult['error-codes']
            );
        }

        // Opzionale: Controlla lo score (per reCAPTCHA v3)
        // Score va da 0.0 (bot) a 1.0 (umano)
        // Soglia consigliata: 0.5
        if (verificationResult.score !== undefined && verificationResult.score < 0.5) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Score reCAPTCHA troppo basso',
                { score: verificationResult.score }
            );
        }

        return {
            success: true,
            score: verificationResult.score,
            action: verificationResult.action
        };

    } catch (error) {
        console.error('Errore verifica reCAPTCHA:', error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        
        throw new functions.https.HttpsError(
            'internal',
            'Errore interno durante la verifica reCAPTCHA'
        );
    }
});

/**
 * Cloud Function: Submit RSVP con verifica reCAPTCHA
 * 
 * Endpoint: POST /submitRSVP
 * Body: {
 *   token: string,
 *   rsvpData: {
 *     name: string,
 *     email: string,
 *     phone: string,
 *     attendance: string,
 *     guests: number,
 *     intolerances: string,
 *     message: string
 *   }
 * }
 * Response: { success: boolean, rsvpId: string }
 */
exports.submitRSVP = functions.https.onCall(async (data, context) => {
    const { token, rsvpData } = data;

    // Validazione input
    if (!token) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Token reCAPTCHA mancante'
        );
    }

    if (!rsvpData || !rsvpData.name || !rsvpData.email || !rsvpData.attendance) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Dati RSVP incompleti'
        );
    }

    try {
        // 1. Verifica reCAPTCHA
        const verificationResult = await verifyRecaptchaToken(token);
        
        if (!verificationResult.success) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Verifica reCAPTCHA fallita'
            );
        }

        // Opzionale: Controlla score
        if (verificationResult.score !== undefined && verificationResult.score < 0.5) {
            console.warn('Score reCAPTCHA basso:', verificationResult.score);
            throw new functions.https.HttpsError(
                'permission-denied',
                'Verifica reCAPTCHA fallita: score troppo basso'
            );
        }

        // 2. Validazione dati RSVP
        const sanitizedData = {
            name: rsvpData.name.trim(),
            email: rsvpData.email.trim().toLowerCase(),
            phone: rsvpData.phone?.trim() || '',
            attendance: rsvpData.attendance,
            guests: parseInt(rsvpData.guests) || 0,
            intolerances: rsvpData.intolerances?.trim() || '',
            message: rsvpData.message?.trim() || '',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            recaptchaScore: verificationResult.score || null
        };

        // Validazione email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedData.email)) {
            throw new functions.https.HttpsError(
                'invalid-argument',
                'Email non valida'
            );
        }

        // 3. Salva RSVP su Firestore
        const rsvpRef = await admin.firestore()
            .collection('rsvp-confirmations')
            .add(sanitizedData);

        console.log('RSVP salvato:', rsvpRef.id, sanitizedData);

        // 4. Invia email di conferma (gestito da EmailJS nel frontend)
        
        return {
            success: true,
            rsvpId: rsvpRef.id
        };

    } catch (error) {
        console.error('Errore submit RSVP:', error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        
        throw new functions.https.HttpsError(
            'internal',
            'Errore interno durante il salvataggio RSVP'
        );
    }
});

/**
 * Cloud Function: Rate Limiting per RSVP
 * Previene spam limitando il numero di RSVP per IP
 */
exports.checkRateLimit = functions.https.onCall(async (data, context) => {
    // Ottieni IP dell'utente
    const ip = context.rawRequest.ip;
    
    if (!ip) {
        throw new functions.https.HttpsError(
            'internal',
            'Impossibile determinare IP'
        );
    }

    try {
        // Controlla numero di RSVP dall'IP nelle ultime 24 ore
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const recentRSVPs = await admin.firestore()
            .collection('rsvp-confirmations')
            .where('ip', '==', ip)
            .where('timestamp', '>', oneDayAgo)
            .get();

        const count = recentRSVPs.size;
        const limit = 5; // Max 5 RSVP per IP in 24 ore

        if (count >= limit) {
            throw new functions.https.HttpsError(
                'resource-exhausted',
                'Troppi tentativi. Riprova più tardi.'
            );
        }

        return {
            allowed: true,
            remaining: limit - count
        };

    } catch (error) {
        console.error('Errore rate limiting:', error);
        
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        
        throw new functions.https.HttpsError(
            'internal',
            'Errore nel controllo rate limiting'
        );
    }
});

