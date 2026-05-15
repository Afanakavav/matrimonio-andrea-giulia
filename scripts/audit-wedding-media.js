/**
 * Audit script per Firebase Storage e Firestore - wedding-media
 * SOLO LETTURA: non modifica nulla.
 *
 * Prerequisiti:
 *   npm install firebase-admin   (nella root o in functions/)
 *
 * Service Account Key:
 *   1. Vai su Firebase Console > Project Settings > Service Accounts
 *   2. Clicca "Generate New Private Key"
 *   3. Salva il file come functions/serviceAccountKey.json
 *   IMPORTANTE: NON committare questo file (è in .gitignore)
 *
 * Esegui con:
 *   node scripts/audit-wedding-media.js
 */

const path = require('path');
const fs = require('fs');

// ── Configurazione ──────────────────────────────────────────────────────────

const SERVICE_ACCOUNT_PATHS = [
  path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'),
  path.join(__dirname, 'serviceAccountKey.json'),
];

const FIRESTORE_COLLECTION = 'wedding-media';
const STORAGE_PREFIX = 'wedding-media/';
const SAMPLE_DOCS = 3;

// ── Helpers ─────────────────────────────────────────────────────────────────

function findServiceAccount() {
  for (const p of SERVICE_ACCOUNT_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function detectFileType(name = '', contentType = '') {
  const ct = contentType.toLowerCase();
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ct.startsWith('image/') || ['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext)) return 'image';
  if (ct.startsWith('video/') || ['mp4','mov','avi','mkv','webm'].includes(ext)) return 'video';
  return 'other';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function printSection(title) {
  const line = '─'.repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  AUDIT: Firebase Storage + Firestore (wedding-media)');
  console.log(`  Data: ${new Date().toISOString()}`);
  console.log('══════════════════════════════════════════════════════════════');

  // 1. Trova service account key
  const keyPath = findServiceAccount();
  if (!keyPath) {
    console.error('\n❌  SERVICE ACCOUNT KEY NON TROVATA');
    console.error('\nPer creare la chiave:');
    console.error('  1. Vai su https://console.firebase.google.com');
    console.error('  2. Seleziona il tuo progetto');
    console.error('  3. Project Settings (icona ingranaggio) > Service Accounts');
    console.error('  4. Clicca "Generate New Private Key" > "Generate Key"');
    console.error('  5. Salva il file come: functions/serviceAccountKey.json');
    console.error('\n  IMPORTANTE: Il file è già in .gitignore — non finirà mai in git.');
    process.exit(1);
  }
  console.log(`\n✓  Service account key trovata: ${keyPath}`);

  // 2. Inizializza Firebase Admin
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    // prova da functions/node_modules
    try {
      admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
    } catch {
      console.error('\n❌  firebase-admin non trovato.');
      console.error('Esegui: npm install firebase-admin   oppure installalo in functions/');
      process.exit(1);
    }
  }

  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: `${serviceAccount.project_id}.firebasestorage.app`,
    });
  }

  const db = admin.firestore();
  const bucket = admin.storage().bucket();

  // ── FIRESTORE ──────────────────────────────────────────────────────────────
  printSection('FIRESTORE — collezione: ' + FIRESTORE_COLLECTION);

  const snapshot = await db.collection(FIRESTORE_COLLECTION).get();
  const totalDocs = snapshot.size;
  console.log(`\n  Documenti totali: ${totalDocs}`);

  if (totalDocs === 0) {
    console.log('  (Collection not yet created — will be created on first document)');
  } else {
    // Schema: raccogli tutti i campi distinti
    const fieldCounts = {};
    const typeDist = { image: 0, video: 0, other: 0 };
    let docsWithNewFields = 0;
    let docsWithOldFields = 0;

    snapshot.forEach(doc => {
      const data = doc.data();
      Object.keys(data).forEach(k => {
        fieldCounts[k] = (fieldCounts[k] || 0) + 1;
      });
      typeDist[detectFileType(data.fileName || data.name || '', data.contentType || data.mimeType || '')] += 1;

      // "Nuovi" campi attesi dopo la Settimana 2 (da aggiornare dopo la migrazione)
      const newFields = ['uploadedBy', 'caption', 'approved'];
      const hasNew = newFields.some(f => f in data);
      if (hasNew) docsWithNewFields++; else docsWithOldFields++;
    });

    console.log('\n  Distribuzione tipi di file:');
    console.log(`    Immagini : ${typeDist.image}`);
    console.log(`    Video    : ${typeDist.video}`);
    console.log(`    Altri    : ${typeDist.other}`);

    console.log('\n  Documenti con nuovi campi (post-migrazione): ' + docsWithNewFields);
    console.log('  Documenti con vecchi campi (da migrare)    : ' + docsWithOldFields);

    console.log('\n  Campi presenti (nome → n° documenti che lo hanno):');
    Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([field, count]) => {
        const pct = ((count / totalDocs) * 100).toFixed(0);
        console.log(`    ${field.padEnd(25)} ${count}/${totalDocs}  (${pct}%)`);
      });

    // Mostra primi N documenti come esempio
    console.log(`\n  Esempio dei primi ${SAMPLE_DOCS} documenti:`);
    let i = 0;
    snapshot.forEach(doc => {
      if (i >= SAMPLE_DOCS) return;
      console.log(`\n  [${i + 1}] id: ${doc.id}`);
      const data = doc.data();
      Object.entries(data).forEach(([k, v]) => {
        const val = v instanceof Object && v.toDate ? v.toDate().toISOString() : String(v).substring(0, 80);
        console.log(`       ${k.padEnd(20)}: ${val}`);
      });
      i++;
    });
  }

  // ── FIREBASE STORAGE ───────────────────────────────────────────────────────
  printSection('FIREBASE STORAGE — prefix: ' + STORAGE_PREFIX);

  const [files] = await bucket.getFiles({ prefix: STORAGE_PREFIX });
  const storageTotal = files.length;
  console.log(`\n  File totali: ${storageTotal}`);

  if (storageTotal === 0) {
    console.log('  (Nessun file trovato con prefix "' + STORAGE_PREFIX + '")');
  } else {
    const storageTypes = { image: 0, video: 0, other: 0 };
    let totalBytes = 0;

    files.forEach(file => {
      const meta = file.metadata || {};
      const ct = meta.contentType || '';
      const name = file.name || '';
      storageTypes[detectFileType(name, ct)] += 1;
      totalBytes += parseInt(meta.size || 0, 10);
    });

    console.log('\n  Distribuzione tipi:');
    console.log(`    Immagini : ${storageTypes.image}`);
    console.log(`    Video    : ${storageTypes.video}`);
    console.log(`    Altri    : ${storageTypes.other}`);
    console.log(`\n  Dimensione totale: ${formatBytes(totalBytes)}`);

    // Elenca i primi 10 file
    const preview = files.slice(0, 10);
    console.log(`\n  Primi ${preview.length} file:`);
    preview.forEach((f, idx) => {
      const meta = f.metadata || {};
      const size = formatBytes(parseInt(meta.size || 0, 10));
      const ct = (meta.contentType || 'unknown').padEnd(20);
      console.log(`  [${String(idx + 1).padStart(2)}] ${ct} ${size.padStart(10)}  ${f.name}`);
    });
    if (storageTotal > 10) {
      console.log(`  ... e altri ${storageTotal - 10} file`);
    }
  }

  // ── RIEPILOGO ──────────────────────────────────────────────────────────────
  printSection('RIEPILOGO');
  console.log(`\n  Firestore docs  : ${totalDocs}`);
  console.log(`  Storage files   : ${storageTotal}`);
  if (totalDocs !== storageTotal) {
    console.log(`\n  ⚠️  MISMATCH: ${Math.abs(totalDocs - storageTotal)} elementi disallineati`);
    console.log('     (documenti senza file o file senza documento)');
  } else {
    console.log('\n  ✓  Firestore e Storage sono allineati');
  }

  console.log('\n══════════════════════════════════════════════════════════════\n');
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌  Errore durante l\'audit:', err.message);
  process.exit(1);
});
