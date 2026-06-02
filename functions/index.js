/**
 * Cloud Functions per Matrimonio Andrea & Giulia
 *
 * Funzioni:
 * - verifyRecaptcha: Verifica token reCAPTCHA lato server
 * - submitRSVP: Salva RSVP dopo verifica reCAPTCHA
 */

const functions = require("firebase-functions");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const sharp = require("sharp");
const path = require("path");
const os = require("os");
const fs = require("fs");

// Carica variabili d'ambiente
require("dotenv").config();

// Inizializza Firebase Admin
admin.initializeApp();

/**
 * Crea transporter Nodemailer per Register.it (info@andreagiulia5luglio26.it)
 */
function createEmailTransporter() {
  const host = process.env.EMAIL_HOST || "authsmtp.securemail.pro";
  const port = parseInt(process.env.EMAIL_PORT || "465", 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    throw new Error("EMAIL_USER e EMAIL_PASS devono essere configurati in .env");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
}

/**
 * Invia email di conferma RSVP all'ospite
 * Mittente: info@andreagiulia5luglio26.it (Register.it)
 */
async function sendRsvpConfirmationEmail(rsvpData) {
  const transporter = createEmailTransporter();
  const fromEmail = "info@andreagiulia5luglio26.it";

  const attendanceText = rsvpData.attendance === "yes" ? "Parteciperà" : "Non parteciperà";

  const siteUrl = "https://andreagiulia5luglio26.it";

  const mailOptions = {
    from: `"Matrimonio Andrea & Giulia" <${fromEmail}>`,
    to: rsvpData.email,
    replyTo: fromEmail,
    subject: "Conferma R.S.V.P. - Matrimonio Andrea & Giulia",
    text: `
Ciao ${rsvpData.name},

grazie per aver confermato la tua partecipazione al matrimonio di Andrea & Giulia!

Riepilogo conferma:
- Partecipazione: ${attendanceText}
- Numero Ospiti: ${rsvpData.guests}
- Intolleranze Alimentari: ${rsvpData.intolerances}
- Messaggio: ${rsvpData.message}

Dettagli evento:
📅 Data: Domenica 5 Luglio 2026
🕐 Cerimonia: ore 15:30 - Chiesa di San Niccolò, Prato
🍽️ Ricevimento: ore 18:00 - Villa Corsini a Mezzomonte, Impruneta

Non vediamo l'ora di festeggiare con te!
Se hai bisogno di modificare la tua conferma, visita il sito Matrimonio Andrea & Giulia: ${siteUrl}

Con affetto,
Andrea & Giulia
    `.trim(),
  };

  return transporter.sendMail(mailOptions);
}

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
    throw new Error("reCAPTCHA secret key not configured");
  }

  const verificationURL = "https://www.google.com/recaptcha/api/siteverify";

  try {
    const response = await axios.post(verificationURL, null, {
      params: {
        secret: secretKey,
        response: token,
      },
    });

    return response.data;
  } catch (error) {
    console.error("Errore verifica reCAPTCHA:", error);
    throw new Error("Errore nella verifica reCAPTCHA");
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
    throw new functions.https.HttpsError("invalid-argument", "Token reCAPTCHA mancante");
  }

  try {
    // Verifica token con Google
    const verificationResult = await verifyRecaptchaToken(token);

    console.log("Risultato verifica reCAPTCHA:", verificationResult);

    // Controlla se la verifica è riuscita
    if (!verificationResult.success) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Verifica reCAPTCHA fallita",
        verificationResult["error-codes"]
      );
    }

    // Opzionale: Controlla lo score (per reCAPTCHA v3)
    // Score va da 0.0 (bot) a 1.0 (umano)
    // Soglia consigliata: 0.5
    if (verificationResult.score !== undefined && verificationResult.score < 0.5) {
      throw new functions.https.HttpsError("permission-denied", "Score reCAPTCHA troppo basso", {
        score: verificationResult.score,
      });
    }

    return {
      success: true,
      score: verificationResult.score,
      action: verificationResult.action,
    };
  } catch (error) {
    console.error("Errore verifica reCAPTCHA:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      "internal",
      "Errore interno durante la verifica reCAPTCHA"
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
exports.submitRSVP = functions
  .runWith({ timeoutSeconds: 120 })
  .https.onCall(async (data, context) => {
  const { token, rsvpData } = data;

  // Validazione input
  if (!token) {
    throw new functions.https.HttpsError("invalid-argument", "Token reCAPTCHA mancante");
  }

  if (!rsvpData || !rsvpData.name || !rsvpData.email || !rsvpData.attendance) {
    throw new functions.https.HttpsError("invalid-argument", "Dati RSVP incompleti");
  }

  try {
    // 1. Verifica reCAPTCHA
    const verificationResult = await verifyRecaptchaToken(token);

    if (!verificationResult.success) {
      throw new functions.https.HttpsError("permission-denied", "Verifica reCAPTCHA fallita");
    }

    // Opzionale: Controlla score
    if (verificationResult.score !== undefined && verificationResult.score < 0.5) {
      console.warn("Score reCAPTCHA basso:", verificationResult.score);
      throw new functions.https.HttpsError(
        "permission-denied",
        "Verifica reCAPTCHA fallita: score troppo basso"
      );
    }

    // 2. Validazione dati RSVP
    // Hasciamo l'IP con SHA-256 per conformità GDPR: non salviamo l'IP in chiaro.
    // Nota: utenti dietro NAT condividono lo stesso IP, ma per un sito matrimonio
    // con ~200 ospiti questo livello di rate limiting è più che sufficiente.
    const rawIp =
      (context.rawRequest.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      context.rawRequest.ip ||
      "unknown";
    const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");

    const sanitizedData = {
      name: rsvpData.name.trim(),
      email: rsvpData.email.trim().toLowerCase(),
      phone: rsvpData.phone?.trim() || "",
      attendance: rsvpData.attendance,
      guests: parseInt(rsvpData.guests) || 0,
      intolerances: rsvpData.intolerances?.trim() || "",
      message: rsvpData.message?.trim() || "",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      recaptchaScore: verificationResult.score || null,
      ipHash,
    };

    // Validazione email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitizedData.email)) {
      throw new functions.https.HttpsError("invalid-argument", "Email non valida");
    }

    // 3. Salva RSVP su Firestore
    const rsvpRef = await admin.firestore().collection("rsvp-confirmations").add(sanitizedData);

    console.log("RSVP salvato:", rsvpRef.id, sanitizedData);

    // 4. Invia email di conferma (da info@andreagiulia5luglio26.it)
    try {
      await sendRsvpConfirmationEmail(sanitizedData);
      console.log("Email di conferma inviata a:", sanitizedData.email);
    } catch (emailError) {
      console.error("Errore invio email conferma (RSVP salvato comunque):", emailError.message || emailError);
      if (emailError.response) console.error("SMTP response:", emailError.response);
      // Non bloccare: l'RSVP è già salvato
    }

    return {
      success: true,
      rsvpId: rsvpRef.id,
    };
  } catch (error) {
    console.error("Errore submit RSVP:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", "Errore interno durante il salvataggio RSVP");
  }
});

/**
 * Cloud Function: Rate Limiting per RSVP
 * Previene spam limitando il numero di RSVP per IP (salvato come hash SHA-256)
 */
exports.checkRateLimit = functions.https.onCall(async (data, context) => {
  const rawIp =
    (context.rawRequest.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    context.rawRequest.ip ||
    "unknown";
  const ipHash = crypto.createHash("sha256").update(rawIp).digest("hex");

  try {
    // Controlla numero di RSVP dall'IP (hashed) nelle ultime 24 ore
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentRSVPs = await admin
      .firestore()
      .collection("rsvp-confirmations")
      .where("ipHash", "==", ipHash)
      .where("timestamp", ">", oneDayAgo)
      .get();

    const count = recentRSVPs.size;
    const limit = 5; // Max 5 RSVP per IP in 24 ore

    if (count >= limit) {
      throw new functions.https.HttpsError(
        "resource-exhausted",
        "Troppi tentativi. Riprova più tardi."
      );
    }

    return {
      allowed: true,
      remaining: limit - count,
    };
  } catch (error) {
    console.error("Errore rate limiting:", error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError("internal", "Errore nel controllo rate limiting");
  }
});

// Cerca documento Firestore con backoff esponenziale per gestire race condition
// tra Storage finalize trigger (immediato) e client write Firestore (poco dopo).
async function findDocWithRetry(db, filePath, maxAttempts = 4) {
  const delays = [500, 1000, 2000, 4000]; // ms: 0.5s, 1s, 2s, 4s

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const querySnapshot = await db.collection("wedding-media")
      .where("storagePath", "==", filePath)
      .limit(1)
      .get();

    if (!querySnapshot.empty) {
      if (attempt > 0) {
        console.log(`Documento trovato al tentativo ${attempt + 1} (dopo ${delays.slice(0, attempt).reduce((a, b) => a + b, 0)}ms)`);
      }
      return querySnapshot;
    }

    if (attempt < maxAttempts - 1) {
      console.log(`Tentativo ${attempt + 1} fallito, aspetto ${delays[attempt]}ms prima di riprovare...`);
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }

  return null;
}

/**
 * generateThumbnails - Cloud Function event-driven
 *
 * Triggered: Storage upload in wedding-media/originals/
 * Genera:
 *   - wedding-media/display/{file} (max 2560x1440, JPEG q85, mozjpeg)
 *   - wedding-media/thumbs/{file}  (600x600 cover crop, JPEG q75)
 * Update: documento Firestore wedding-media corrispondente con
 *         display_url + thumb_url + thumbs_generated_at
 *
 * Filtri di sicurezza (prevenzione loop):
 *   - Solo file in wedding-media/originals/
 *   - Solo content-type image/*
 *   - Skip se già in display/ o thumbs/ (auto-trigger ricorsivo)
 *
 * Test end-to-end: 2026-05-09 ✅ VERIFIED via upload manuale Console
 *
 * Service Account: 295197554541-compute@developer.gserviceaccount.com
 *   con role Storage Admin (per leggere/scrivere bucket Storage)
 *   e Eventarc Event Receiver (per ricevere eventi Storage)
 */
exports.generateThumbnails = onObjectFinalized({
  cpu: 2,
  region: "us-central1",
  memory: "1GiB",
  timeoutSeconds: 120,
  bucket: "matrimonio-andrea-giulia-2026.firebasestorage.app",
}, async (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;
  const contentType = event.data.contentType;

  if (!filePath.startsWith("wedding-media/originals/")) {
    console.log(`Skip: ${filePath} non è in originals/`);
    return null;
  }

  if (!contentType || !contentType.startsWith("image/")) {
    console.log(`Skip: ${filePath} non è image/* (content-type: ${contentType})`);
    return null;
  }

  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  const bucket = admin.storage().bucket(fileBucket);
  await bucket.file(filePath).download({ destination: tempFilePath });
  console.log(`Downloaded ${filePath} to ${tempFilePath}`);

  const displayTempPath = path.join(os.tmpdir(), `display_${fileName}`);
  await sharp(tempFilePath)
    .rotate()
    .resize(2560, 1440, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(displayTempPath);

  const thumbTempPath = path.join(os.tmpdir(), `thumb_${fileName}`);
  await sharp(tempFilePath)
    .rotate()
    .resize(600, 600, { fit: "cover", position: "center" })
    .jpeg({ quality: 75, mozjpeg: true })
    .toFile(thumbTempPath);

  const displayDestination = `wedding-media/display/${fileName}`;
  const thumbDestination = `wedding-media/thumbs/${fileName}`;

  const [displayFile] = await bucket.upload(displayTempPath, {
    destination: displayDestination,
    metadata: { contentType: "image/jpeg" },
  });
  await displayFile.makePublic();

  const [thumbFile] = await bucket.upload(thumbTempPath, {
    destination: thumbDestination,
    metadata: { contentType: "image/jpeg" },
  });
  await thumbFile.makePublic();

  const displayUrl = `https://firebasestorage.googleapis.com/v0/b/${fileBucket}/o/${encodeURIComponent(displayDestination)}?alt=media`;
  const thumbUrl = `https://firebasestorage.googleapis.com/v0/b/${fileBucket}/o/${encodeURIComponent(thumbDestination)}?alt=media`;

  const db = admin.firestore();
  const querySnapshot = await findDocWithRetry(db, filePath);

  if (!querySnapshot) {
    console.error(`Nessun documento Firestore trovato per ${filePath} dopo 4 tentativi (7.5s totali). Client potrebbe aver fallito write Firestore.`);
  } else {
    const docRef = querySnapshot.docs[0].ref;
    await docRef.update({
      display_url: displayUrl,
      thumb_url: thumbUrl,
      thumbs_generated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Updated Firestore doc ${docRef.id} with display+thumb URLs`);
  }

  fs.unlinkSync(tempFilePath);
  fs.unlinkSync(displayTempPath);
  fs.unlinkSync(thumbTempPath);

  console.log(`generateThumbnails completed for ${filePath}`);
  return null;
});

/**
 * Cloud Function: Elimina RSVP (solo admin)
 * Bypassa le Firestore rules (allow delete: if false) tramite Admin SDK
 */
exports.deleteRSVP = functions
  .runWith({ memory: "256MB" })
  .https.onCall(async (data, context) => {
    const { documentId, password } = data;

    if (!documentId || typeof documentId !== "string") {
      throw new functions.https.HttpsError("invalid-argument", "documentId richiesto");
    }
    if (!password) {
      throw new functions.https.HttpsError("invalid-argument", "password richiesta");
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      throw new functions.https.HttpsError("permission-denied", "Password admin non valida");
    }

    try {
      const docRef = admin.firestore().collection("rsvp-confirmations").doc(documentId);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Documento RSVP non trovato");
      }

      const docData = docSnap.data();
      console.log(
        `[deleteRSVP] Admin deleted RSVP ${documentId}: ${docData.name} <${docData.email}> at ${new Date().toISOString()}`
      );

      await docRef.delete();

      return { success: true, deletedId: documentId };
    } catch (error) {
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      console.error("Errore deleteRSVP:", error);
      throw new functions.https.HttpsError("internal", "Errore interno durante l'eliminazione RSVP");
    }
  });

/**
 * Cloud Function: Elimina media (solo admin)
 * Cancella i 3 file Storage (originals + display + thumbs) e il documento Firestore.
 * Best-effort per Storage: se uno dei 3 manca (es. CF thumbnails non ancora girata),
 * logga il warning ma completa la cancellazione Firestore.
 */
exports.deleteMedia = functions
  .runWith({ memory: "256MB" })
  .https.onCall(async (data, context) => {
    const { documentId, password } = data;

    if (!documentId || typeof documentId !== "string")
      throw new functions.https.HttpsError("invalid-argument", "documentId richiesto");
    if (!password)
      throw new functions.https.HttpsError("invalid-argument", "password richiesta");
    if (password !== process.env.ADMIN_PASSWORD)
      throw new functions.https.HttpsError("permission-denied", "Password admin non valida");

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    const docRef = db.collection("wedding-media").doc(documentId);
    const docSnap = await docRef.get();
    if (!docSnap.exists)
      throw new functions.https.HttpsError("not-found", "Documento media non trovato");

    const docData = docSnap.data();
    const baseName = docData.storagePath?.replace("wedding-media/originals/", "");

    if (!baseName) {
      console.warn(`[deleteMedia] baseName mancante per ${documentId}, skip storage cleanup`);
    }

    console.log(`[deleteMedia] Admin deleting media ${documentId}: ${docData.fileName} by ${docData.uploader_name || "anonymous"} at ${new Date().toISOString()}`);

    const pathsToDelete = baseName ? [
      `wedding-media/originals/${baseName}`,
      `wedding-media/display/${baseName}`,
      `wedding-media/thumbs/${baseName}`,
    ] : [];

    const deleteResults = await Promise.allSettled(
      pathsToDelete.map((p) => bucket.file(p).delete())
    );

    deleteResults.forEach((result, idx) => {
      if (result.status === "rejected") {
        console.warn(`[deleteMedia] Storage delete failed for ${pathsToDelete[idx]}: ${result.reason?.message}`);
      }
    });

    await docRef.delete();

    return {
      success: true,
      deletedId: documentId,
      storageDeleted: deleteResults.filter((r) => r.status === "fulfilled").length,
      storageTotal: pathsToDelete.length,
    };
  });

/**
 * Cloud Function: Toggle preferito media (solo admin)
 * Bypassa Firestore rules (allow update: if false) tramite Admin SDK.
 */
exports.toggleFavorite = functions
  .runWith({ memory: "256MB" })
  .https.onCall(async (data, context) => {
    const { documentId, password } = data;

    if (!documentId || typeof documentId !== "string")
      throw new functions.https.HttpsError("invalid-argument", "documentId richiesto");
    if (!password)
      throw new functions.https.HttpsError("invalid-argument", "password richiesta");
    if (password !== process.env.ADMIN_PASSWORD)
      throw new functions.https.HttpsError("permission-denied", "Password admin non valida");

    const docRef = admin.firestore().collection("wedding-media").doc(documentId);
    const docSnap = await docRef.get();
    if (!docSnap.exists)
      throw new functions.https.HttpsError("not-found", "Documento media non trovato");

    const docData = docSnap.data();
    const currentValue = docData.favorite || false;
    const newValue = !currentValue;

    console.log(`[toggleFavorite] Admin ${currentValue ? "unfavorited" : "favorited"} media ${documentId}: ${docData.fileName} at ${new Date().toISOString()}`);

    await docRef.update({
      favorite: newValue,
      favorite_toggled_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, documentId, newValue };
  });

/**
 * Cloud Function: Moderazione media (approve/reject) — solo admin
 * Bypassa Firestore rules (allow update: if false) tramite Admin SDK.
 */
exports.moderateMedia = functions
  .runWith({ memory: "256MB" })
  .https.onCall(async (data, context) => {
    const { documentId, action, password } = data;

    if (!documentId || typeof documentId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "documentId richiesto"
      );
    }
    if (!action || !["approve", "reject"].includes(action)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "action deve essere 'approve' o 'reject'"
      );
    }
    if (!password) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "password richiesta"
      );
    }
    if (password !== process.env.ADMIN_PASSWORD) {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Password admin non valida"
      );
    }

    const newStatus = action === "approve" ? "approved" : "rejected";

    const docRef = admin
      .firestore()
      .collection("wedding-media")
      .doc(documentId);

    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      throw new functions.https.HttpsError(
        "not-found",
        "Documento media non trovato"
      );
    }

    await docRef.update({
      status: newStatus,
      moderated_at: admin.firestore.FieldValue.serverTimestamp(),
      moderated_by: "admin",
    });

    return {
      success: true,
      documentId,
      newStatus,
    };
  });

/**
 * Cloud Function: AI scoring immagini con Claude Vision API
 *
 * Triggered: Firestore onDocumentUpdated su wedding-media/{mediaId}
 * Scatta quando display_url passa da null/undefined → stringa (post generateThumbnails).
 * Assegna ai_score (1-10), ai_tags, ai_description al documento.
 */
exports.aiPhotoCurator = onDocumentUpdated({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
  document: "wedding-media/{mediaId}",
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const mediaId = event.params.mediaId;

  // Guard 1: scatta solo quando display_url passa da null/undefined → valore stringa
  const displayUrlBefore = before?.display_url;
  const displayUrlAfter = after?.display_url;
  if (!displayUrlAfter || displayUrlBefore === displayUrlAfter) {
    console.log(`[aiPhotoCurator] ${mediaId}: skip (display_url non cambiato o vuoto)`);
    return null;
  }

  // Guard 2: idempotenza — se già scorato, return
  if (after.ai_scored_at) {
    console.log(`[aiPhotoCurator] ${mediaId}: skip (già scorato in passato)`);
    return null;
  }

  // Guard 3: solo immagini (i video non passano da Vision)
  if (after.file_type !== "image") {
    console.log(`[aiPhotoCurator] ${mediaId}: skip (non immagine, è ${after.file_type})`);
    return null;
  }

  // Guard 4: API key presente
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[aiPhotoCurator] ${mediaId}: ANTHROPIC_API_KEY mancante in env`);
    return null;
  }

  try {
    console.log(`[aiPhotoCurator] ${mediaId}: download immagine da ${displayUrlAfter.substring(0, 80)}...`);

    // Scarica immagine come buffer
    const imageResponse = await axios.get(displayUrlAfter, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const imageBuffer = Buffer.from(imageResponse.data);
    const imageBase64 = imageBuffer.toString("base64");
    const mediaType = imageResponse.headers["content-type"] || "image/jpeg";

    console.log(`[aiPhotoCurator] ${mediaId}: immagine scaricata (${Math.round(imageBuffer.length/1024)}KB), invio a Claude Vision...`);

    // Chiamata Claude Vision API
    const promptText = `Sei un curatore fotografico per matrimoni italiani. Valuta questa foto/video frame di matrimonio.

Restituisci SOLO un oggetto JSON valido (niente preamble, niente markdown, niente code fence) con questa struttura ESATTA:

{
  "score": <numero intero 1-10>,
  "tags": [<array di 2-4 stringhe>],
  "description": "<una frase italiana max 100 caratteri>"
}

Criteri SCORE 1-10:
- 1-3: foto sfocata, mal inquadrata, senza valore narrativo
- 4-6: foto accettabile, soggetto chiaro ma composizione media
- 7-8: foto buona, momento significativo, buona luce/composizione
- 9-10: foto eccezionale, momento iconico, qualità da album

VOCABOLARIO TAGS (scegli 2-4, SOLO da questa lista):
ritratto, gruppo, dettaglio, cerimonia, ricevimento, ballo, cibo, decorazioni, paesaggio, emotivo, divertente, formale

DESCRIPTION: una frase italiana che riassume cosa rappresenta (max 100 caratteri).`;

    const apiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: promptText,
            },
          ],
        }],
      },
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 30000,
      }
    );

    // Parse risposta
    const responseText = apiResponse.data?.content?.[0]?.text || "";
    console.log(`[aiPhotoCurator] ${mediaId}: risposta API ricevuta (${responseText.length} chars)`);

    // Parser robusto: estrai JSON anche se c'è preamble/code fence
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      // Fallback: cerca JSON dentro la stringa
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Risposta API non contiene JSON valido");
      }
    }

    // Validazione minima
    const score = Number.isInteger(parsedData.score) && parsedData.score >= 1 && parsedData.score <= 10
      ? parsedData.score
      : null;
    const tags = Array.isArray(parsedData.tags) ? parsedData.tags.slice(0, 4) : [];
    const description = typeof parsedData.description === "string"
      ? parsedData.description.substring(0, 200)
      : "";

    if (score === null) {
      console.error(`[aiPhotoCurator] ${mediaId}: score non valido nella risposta`, parsedData);
      return null;
    }

    // Update Firestore
    await event.data.after.ref.update({
      ai_score: score,
      ai_tags: tags,
      ai_description: description,
      ai_scored_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[aiPhotoCurator] ${mediaId}: success — score=${score}, tags=[${tags.join(",")}]`);
    return null;

  } catch (error) {
    // Log errore ma non rilancio: doc resta senza score, moderabile manualmente
    console.error(`[aiPhotoCurator] ${mediaId}: errore`, error.message);
    if (error.response) {
      console.error(`[aiPhotoCurator] ${mediaId}: API status ${error.response.status}`, error.response.data);
    }
    return null;
  }
});

// ============================================
// CF aiStoryteller — caption cinematografiche
// ============================================
exports.aiStoryteller = onDocumentUpdated({
  region: "us-central1",
  memory: "512MiB",
  timeoutSeconds: 60,
  document: "wedding-media/{mediaId}",
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const mediaId = event.params.mediaId;

  // Guard 1: scatta solo quando favorite passa da non-true → true
  if (after?.favorite !== true || before?.favorite === true) {
    return null;
  }

  // Guard 2: favorite post-update deve essere true (defensive)
  if (!after.favorite) {
    return null;
  }

  // Guard 3: idempotenza — se già generato, return
  if (after.ai_story_generated_at) {
    console.log(`[aiStoryteller] ${mediaId}: skip (ai_story già presente)`);
    return null;
  }

  // Guard 4: display_url richiesta per vision
  const displayUrl = after.display_url;
  if (!displayUrl) {
    console.log(`[aiStoryteller] ${mediaId}: skip (display_url assente o vuoto)`);
    return null;
  }

  // Guard 5: solo immagini (i video non passano da Vision)
  if (after.file_type !== "image") {
    console.log(`[aiStoryteller] ${mediaId}: skip (non immagine, è ${after.file_type})`);
    return null;
  }

  // Guard 6: API key presente
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(`[aiStoryteller] ${mediaId}: ANTHROPIC_API_KEY mancante in env`);
    return null;
  }

  try {
    console.log(`[aiStoryteller] ${mediaId}: download immagine da ${displayUrl.substring(0, 80)}...`);

    // Scarica immagine come buffer
    const imageResponse = await axios.get(displayUrl, {
      responseType: "arraybuffer",
      timeout: 15000,
    });
    const imageBuffer = Buffer.from(imageResponse.data);
    const imageBase64 = imageBuffer.toString("base64");
    const mediaType = imageResponse.headers["content-type"] || "image/jpeg";

    console.log(`[aiStoryteller] ${mediaId}: immagine scaricata (${Math.round(imageBuffer.length / 1024)}KB), invio a Claude Vision...`);

    // Contesto opzionale da campi AI già presenti
    const contextLines = [];
    if (after.ai_description) contextLines.push(`Descrizione AI: ${after.ai_description}`);
    if (Array.isArray(after.ai_tags) && after.ai_tags.length) contextLines.push(`Tag: ${after.ai_tags.join(", ")}`);
    const contextBlock = contextLines.length
      ? `\n\nContesto aggiuntivo:\n${contextLines.join("\n")}`
      : "";

    const promptText = `Sei un poeta e sceneggiatore di film d'autore. Guarda questa fotografia di un evento speciale e scrivi cinque didascalie cinematografiche diverse.

Regole OBBLIGATORIE:
- Esattamente 5 frasi distinte
- Ogni frase: 8-15 parole in italiano
- Stile: lirico, evocativo, da sottotitolo di film d'autore
- Ispirate al contenuto visivo specifico di questa foto
- NON usare mai: "matrimonio", "sposi", "Andrea", "Giulia", "amore", "felicità"
- Ogni frase deve essere diversa per tono (una intima, una epica, una malinconica, una leggera, una sospesa)${contextBlock}

Restituisci SOLO un oggetto JSON valido, niente preamble né markdown.
LE STRINGHE NON DEVONO CONTENERE NUMERI PROGRESSIVI (no "1.", "2.", "3." ecc.).

{
  "stories": [
    "...",
    "...",
    "...",
    "...",
    "..."
  ]
}`;

    // Chiamata Claude Vision API
    const apiResponse = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: promptText,
            },
          ],
        }],
      },
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 30000,
      }
    );

    // Parse risposta
    const responseText = apiResponse.data?.content?.[0]?.text || "";
    console.log(`[aiStoryteller] ${mediaId}: risposta API ricevuta (${responseText.length} chars)`);

    // Parser robusto: estrai JSON anche se c'è preamble/code fence
    let parsedData;
    try {
      parsedData = JSON.parse(responseText);
    } catch (e) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Risposta API non contiene JSON valido");
      }
    }

    // Validazione e sanitizzazione
    if (!Array.isArray(parsedData.stories) || parsedData.stories.length === 0) {
      console.error(`[aiStoryteller] ${mediaId}: stories non valide nella risposta`, parsedData);
      return null;
    }

    const stories = parsedData.stories
      .filter((s) => typeof s === "string" && s.trim().length > 0)
      .slice(0, 5);

    if (stories.length === 0) {
      console.error(`[aiStoryteller] ${mediaId}: nessuna storia valida estratta`);
      return null;
    }

    // Update Firestore
    await event.data.after.ref.update({
      ai_story: stories,
      ai_story_generated_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[aiStoryteller] ${mediaId}: success — ${stories.length} storie generate`);
    return null;

  } catch (error) {
    console.error(`[aiStoryteller] ${mediaId}: errore`, error.message);
    if (error.response) {
      console.error(`[aiStoryteller] ${mediaId}: API status ${error.response.status}`, error.response.data);
    }
    return null;
  }
});

// =====================================
// CF notifyNewMedia — notifica Telegram
// =====================================
exports.notifyNewMedia = onDocumentUpdated({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 30,
  document: "wedding-media/{mediaId}",
}, async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const mediaId = event.params.mediaId;

  // Guard 1: scatta solo quando ai_scored_at passa da null/undefined → valore
  const aiScoredBefore = before?.ai_scored_at;
  const aiScoredAfter = after?.ai_scored_at;
  if (!aiScoredAfter || aiScoredBefore) {
    return null;
  }

  // Guard 2: idempotenza — se già notificato, return
  if (after.telegram_notified_at) {
    console.log(`[notifyNewMedia] ${mediaId}: skip (già notificato)`);
    return null;
  }

  // Guard 3: credenziali Telegram presenti
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.error(`[notifyNewMedia] ${mediaId}: TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID mancanti in env`);
    return null;
  }

  // Helper: escape caratteri speciali MarkdownV2
  const escapeMd = (str) => {
    if (typeof str !== "string") return "";
    return str.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
  };

  try {
    // Costruisci caption
    const uploaderName = escapeMd(after.uploader_name || "Anonimo");
    const fileType = after.file_type === "image" ? "📷 Foto" : "🎥 Video";
    const score = typeof after.ai_score === "number" ? after.ai_score : null;
    const tags = Array.isArray(after.ai_tags) ? after.ai_tags.join(", ") : "";
    const description = after.ai_description || "";

    let scoreEmoji = "";
    if (score !== null) {
      if (score <= 3) scoreEmoji = "🔴";
      else if (score <= 6) scoreEmoji = "🟡";
      else if (score <= 8) scoreEmoji = "🟢";
      else scoreEmoji = "⭐";
    }

    const caption =
      `📸 *Nuovo media in attesa*\n\n` +
      `*Da:* ${uploaderName}\n` +
      `*Tipo:* ${escapeMd(fileType)}\n` +
      (score !== null
        ? `*🤖 AI Score:* ${scoreEmoji} ${score}/10` +
          (tags ? ` _\\(${escapeMd(tags)}\\)_` : "") +
          `\n`
        : "") +
      (description
        ? `\n_"${escapeMd(description)}"_\n`
        : "");

    // Bottone link admin
    const adminUrl = "https://andreagiulia5luglio26.it/admin.html";
    const inlineKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Approva", callback_data: `a:${mediaId}` },
          { text: "❌ Rifiuta", callback_data: `r:${mediaId}` },
        ],
        [{ text: "📲 Apri admin", url: adminUrl }],
      ],
    };

    // Decidi se mandare con foto o solo testo (foto solo se file_type=image E thumb_url disponibile)
    const hasThumb = after.file_type === "image" && after.thumb_url;

    let telegramResponse;
    if (hasThumb) {
      // sendPhoto con thumbnail
      console.log(`[notifyNewMedia] ${mediaId}: sendPhoto con thumb ${after.thumb_url.substring(0, 60)}...`);
      telegramResponse = await axios.post(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          chat_id: chatId,
          photo: after.thumb_url,
          caption: caption,
          parse_mode: "MarkdownV2",
          reply_markup: inlineKeyboard,
        },
        { timeout: 15000 }
      );
    } else {
      // sendMessage solo testo
      console.log(`[notifyNewMedia] ${mediaId}: sendMessage solo testo`);
      telegramResponse = await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          chat_id: chatId,
          text: caption,
          parse_mode: "MarkdownV2",
          reply_markup: inlineKeyboard,
        },
        { timeout: 15000 }
      );
    }

    if (telegramResponse.data?.ok) {
      console.log(`[notifyNewMedia] ${mediaId}: messaggio inviato (id ${telegramResponse.data.result.message_id})`);
      // Marca come notificato per idempotenza
      await event.data.after.ref.update({
        telegram_notified_at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      console.error(`[notifyNewMedia] ${mediaId}: Telegram API risposta inattesa`, telegramResponse.data);
    }

    return null;
  } catch (error) {
    console.error(`[notifyNewMedia] ${mediaId}: errore`, error.message);
    if (error.response) {
      console.error(`[notifyNewMedia] ${mediaId}: API status ${error.response.status}`, JSON.stringify(error.response.data));
    }
    return null;
  }
});

// =====================================
// CF telegramWebhook — gestisce callback bottoni Telegram
// =====================================
exports.telegramWebhook = onRequest({
  region: "us-central1",
  memory: "256MiB",
  timeoutSeconds: 30,
  cors: false,
}, async (req, res) => {
  // ============== 1. METODO HTTP ==============
  if (req.method !== "POST") {
    console.warn(`[telegramWebhook] metodo non POST: ${req.method}`);
    return res.status(405).send("Method Not Allowed");
  }

  // ============== 2. VERIFICA FIRMA ==============
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.error("[telegramWebhook] TELEGRAM_WEBHOOK_SECRET mancante in env");
    return res.status(500).send("Server Misconfigured");
  }

  const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (!receivedSecret) {
    console.warn("[telegramWebhook] header secret mancante");
    return res.status(403).send("Forbidden");
  }

  try {
    const expectedBuf = Buffer.from(expectedSecret, "utf-8");
    const receivedBuf = Buffer.from(receivedSecret, "utf-8");
    if (expectedBuf.length !== receivedBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
      console.warn("[telegramWebhook] secret mismatch");
      return res.status(403).send("Forbidden");
    }
  } catch (e) {
    console.error("[telegramWebhook] errore verifica firma", e.message);
    return res.status(403).send("Forbidden");
  }

  // ============== 3. PARSING UPDATE TELEGRAM ==============
  const update = req.body;
  if (!update) {
    return res.status(200).send("OK");
  }

  // ============== BRANCH MESSAGE (comandi testuali) ==============
  if (update.message && update.message.text) {
    return handleTextCommand(update.message, res);
  }

  // ============== BRANCH CALLBACK_QUERY (bottoni - logica esistente) ==============
  if (!update.callback_query) {
    console.log("[telegramWebhook] update senza message né callback_query, skip");
    return res.status(200).send("OK");
  }

  const callbackQuery = update.callback_query;
  const callbackId = callbackQuery.id;
  const callbackData = callbackQuery.data || "";
  const fromUser = callbackQuery.from || {};
  const username = fromUser.username
    ? `@${fromUser.username}`
    : `${fromUser.first_name || "Anonimo"} ${fromUser.last_name || ""}`.trim();
  const message = callbackQuery.message || {};
  const chatId = message.chat?.id;
  const messageId = message.message_id;

  console.log(`[telegramWebhook] callback ricevuto: data=${callbackData}, from=${username}`);

  // ============== 4. PARSE callback_data ==============
  const match = callbackData.match(/^([ar]):(.+)$/);
  if (!match) {
    console.warn(`[telegramWebhook] callback_data invalido: ${callbackData}`);
    await answerCallback(callbackId, "Comando non valido", true);
    return res.status(200).send("OK");
  }

  const actionCode = match[1];
  const mediaId = match[2];
  const action = actionCode === "a" ? "approve" : "reject";
  const newStatus = action === "approve" ? "approved" : "rejected";
  const actionLabel = action === "approve" ? "approvato" : "rifiutato";

  // ============== 5. FETCH DOC + IDEMPOTENZA ==============
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.error("[telegramWebhook] TELEGRAM_BOT_TOKEN mancante");
    await answerCallback(callbackId, "Errore server", true).catch(() => {});
    return res.status(500).send("Server Misconfigured");
  }

  let docSnap;
  try {
    const docRef = admin.firestore().collection("wedding-media").doc(mediaId);
    docSnap = await docRef.get();
  } catch (e) {
    console.error(`[telegramWebhook] errore fetch doc ${mediaId}`, e.message);
    await answerCallback(callbackId, "Errore lettura", true).catch(() => {});
    return res.status(200).send("OK");
  }

  if (!docSnap.exists) {
    console.warn(`[telegramWebhook] doc ${mediaId} non trovato`);
    await answerCallback(callbackId, "Media non trovato", true).catch(() => {});
    return res.status(200).send("OK");
  }

  const docData = docSnap.data();
  const currentStatus = docData.status;

  // Idempotenza: già moderato
  if (currentStatus !== "pending") {
    const alreadyLabel = currentStatus === "approved" ? "approvato" : "rifiutato";
    console.log(`[telegramWebhook] ${mediaId} già ${alreadyLabel}`);
    await answerCallback(callbackId, `Già ${alreadyLabel}`, false).catch(() => {});
    // Rimuovi comunque i bottoni se ancora presenti
    if (chatId && messageId) {
      await editReplyMarkupKeepAdminLink(chatId, messageId).catch(() => {});
    }
    return res.status(200).send("OK");
  }

  // ============== 6. UPDATE FIRESTORE ==============
  try {
    await docSnap.ref.update({
      status: newStatus,
      moderated_at: admin.firestore.FieldValue.serverTimestamp(),
      moderated_by: `telegram:${username}`,
    });
    console.log(`[telegramWebhook] ${mediaId} → ${newStatus} by ${username}`);
  } catch (e) {
    console.error(`[telegramWebhook] errore update ${mediaId}`, e.message);
    await answerCallback(callbackId, "Errore aggiornamento", true).catch(() => {});
    return res.status(200).send("OK");
  }

  // ============== 7. RISPOSTE A TELEGRAM ==============
  const toastEmoji = action === "approve" ? "✅" : "❌";
  await answerCallback(
    callbackId,
    `${toastEmoji} ${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)}`,
    false
  ).catch((e) => console.error("answerCallback fail (non bloccante)", e.message));

  // Rimuovi bottoni callback (lascia solo Apri admin)
  if (chatId && messageId) {
    await editReplyMarkupKeepAdminLink(chatId, messageId).catch((e) =>
      console.error("editReplyMarkup fail (non bloccante)", e.message)
    );
  }

  return res.status(200).send("OK");
});

// ============== HELPER: handleTextCommand (/mode commands) ==============
async function handleTextCommand(message, res) {
  const text = (message.text || "").trim();
  const fromUser = message.from || {};
  const chatId = message.chat?.id;
  const userId = fromUser.id;
  const username = fromUser.username
    ? `@${fromUser.username}`
    : `${fromUser.first_name || "Anonimo"}`;

  // Comando deve iniziare con /mode (anche senza argomenti)
  if (!text.startsWith("/mode") && !text.startsWith("/status")) {
    console.log(`[telegramWebhook] comando non /mode da ${username}: ${text.substring(0, 30)}`);
    return res.status(200).send("OK");
  }

  // Verifica autorizzazione: userId deve essere in whitelist
  const adminIdsRaw = process.env.TELEGRAM_ADMIN_CHAT_IDS || "";
  const adminIds = adminIdsRaw.split(",").map(s => Number(s.trim())).filter(n => !isNaN(n) && n > 0);

  if (!adminIds.includes(userId)) {
    console.warn(`[telegramWebhook] /mode tentato da non-admin: ${username} (id ${userId})`);
    await sendTelegramMessage(chatId, "⛔ Non sei autorizzato a cambiare modalità\\.").catch(() => {});
    return res.status(200).send("OK");
  }

  // Lista pattern validi (hardcoded server-side, da espandere in Fase 2/3)
  const VALID_MODES = ["petali", "polaroid", "cinema", "scrapbook", "burst"];

  // Parse argomenti dopo /mode
  const parts = text.split(/\s+/);
  const command = parts[0];                   // /mode o /status
  const arg = (parts[1] || "").toLowerCase();  // nome mode o "help" o ""

  // /status, /mode, /mode help → mostra info
  if (command === "/status" || !arg || arg === "help") {
    return sendModeInfo(chatId, res);
  }

  // /mode <name> → cambia mode
  if (!VALID_MODES.includes(arg)) {
    const validList = VALID_MODES.join(", ");
    await sendTelegramMessage(
      chatId,
      `❌ Mode *${escapeMdV2(arg)}* sconosciuto\\.\n\nMode disponibili: *${escapeMdV2(validList)}*`
    ).catch(() => {});
    return res.status(200).send("OK");
  }

  // Scrivi su Firestore app-state/live
  try {
    await admin.firestore().collection("app-state").doc("live").set({
      mode: arg,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_by: username,
    }, { merge: true });

    console.log(`[telegramWebhook] mode → ${arg} by ${username}`);

    await sendTelegramMessage(
      chatId,
      `✅ Mode cambiato a *${escapeMdV2(arg)}* da ${escapeMdV2(username)}`
    ).catch(() => {});

  } catch (err) {
    console.error(`[telegramWebhook] errore update app-state/live:`, err.message);
    await sendTelegramMessage(chatId, "❌ Errore nel salvataggio della modalità\\.").catch(() => {});
  }

  return res.status(200).send("OK");
}

// ============== HELPER: sendModeInfo (info comando /mode) ==============
async function sendModeInfo(chatId, res) {
  try {
    const liveDoc = await admin.firestore().collection("app-state").doc("live").get();
    const data = liveDoc.exists ? liveDoc.data() : {};
    const currentMode = data.mode || "petali";
    const updatedBy = data.updated_by || "seed";
    const updatedAtMs = data.updated_at?.toMillis?.() || Date.now();
    const updatedAtStr = new Date(updatedAtMs).toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      hour: "2-digit",
      minute: "2-digit",
    });

    const VALID_MODES_DESC = [
      ["petali", "Pattern romantico con petali rosa"],
      ["polaroid", "Polaroid che fluttuano nello spazio"],
      ["cinema", "Cinema letterbox con caption AI"],
      ["scrapbook", "Album scrapbook con pagine che si sfogliano"],
      ["burst", "Esplosione di foto per i momenti clou"],
    ];
    const modeList = VALID_MODES_DESC.map(([n, d]) => `• \`${n}\` — ${escapeMdV2(d)}`).join("\n");

    const msg =
      `🎬 *Live Cinema*\n\n` +
      `Mode attuale: *${escapeMdV2(currentMode)}* \\(da ${escapeMdV2(updatedBy)}, ${escapeMdV2(updatedAtStr)}\\)\n\n` +
      `Mode disponibili:\n${modeList}\n\n` +
      `Comandi:\n` +
      `\`/mode <nome>\` — cambia mode\n` +
      `\`/mode help\` — questa lista\n` +
      `\`/status\` — alias di /mode help`;

    await sendTelegramMessage(chatId, msg).catch(() => {});
  } catch (err) {
    console.error("[telegramWebhook] errore sendModeInfo:", err.message);
    await sendTelegramMessage(chatId, "❌ Errore nel recupero dello stato\\.").catch(() => {});
  }
  return res.status(200).send("OK");
}

// ============== HELPER: sendTelegramMessage (testo MarkdownV2) ==============
async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  return axios.post(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      chat_id: chatId,
      text: text,
      parse_mode: "MarkdownV2",
    },
    { timeout: 8000 }
  );
}

// ============== HELPER: escapeMdV2 (MarkdownV2 escape) ==============
function escapeMdV2(str) {
  if (typeof str !== "string") return "";
  return str.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

// ============== HELPER: answerCallbackQuery ==============
async function answerCallback(callbackQueryId, text, showAlert) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  return axios.post(
    `https://api.telegram.org/bot${botToken}/answerCallbackQuery`,
    {
      callback_query_id: callbackQueryId,
      text: text,
      show_alert: !!showAlert,
    },
    { timeout: 8000 }
  );
}

// ============== HELPER: editMessageReplyMarkup (rimuove bottoni callback) ==============
async function editReplyMarkupKeepAdminLink(chatId, messageId) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminUrl = "https://andreagiulia5luglio26.it/admin.html";
  return axios.post(
    `https://api.telegram.org/bot${botToken}/editMessageReplyMarkup`,
    {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [{ text: "📲 Apri admin", url: adminUrl }],
        ],
      },
    },
    { timeout: 8000 }
  );
}
