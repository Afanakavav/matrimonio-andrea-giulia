// ══════════════════════════════════════════════════════════════
// upload-flow.js — Logica 4-step per /upload.html
// Dipendenze: firebase-config.js (db, storage, firebase)
// ══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Stato applicazione ──────────────────────────────────────
  const state = {
    name: '',           // nome invitato (da localStorage)
    files: [],          // File[] selezionati nell'upload corrente
    fileType: 'image',  // 'image' | 'video'
    total: 0,           // file da caricare in questo batch
    successCount: 0,    // upload completati con successo
    failCount: 0,       // upload falliti definitivamente
    rateWindow: [],     // timestamp selezioni (per rate limiting)
  };

  // ── Costanti ────────────────────────────────────────────────
  const MAX_CONCURRENT = 5;           // file in parallelo
  const MAX_RETRIES    = 3;           // tentativi per file
  const RATE_LIMIT     = 10;          // max file al minuto
  const MAX_PHOTO_MB   = 20 * 1024 * 1024;
  const MAX_VIDEO_MB   = 100 * 1024 * 1024;
  // Upload aperti dal 9 maggio per test. Tutto ciò che precede il matrimonio
  // viene marcato is_pre_wedding_test: true per separarlo dai media reali.
  const TEST_PHASE_END = new Date('2026-07-04T18:00:00');

  // ══════════════════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════════════════
  async function init() {
    // Sign-in anonimo automatico (necessario per le storage rules)
    try {
      if (!firebase.auth().currentUser) {
        const userCredential = await firebase.auth().signInAnonymously();
        console.log('[upload-flow] Anonymous auth:', userCredential.user.uid);
      } else {
        console.log('[upload-flow] User already authenticated:', firebase.auth().currentUser.uid);
      }
    } catch (err) {
      console.error('[upload-flow] Anonymous auth failed:', err);
      mostraErrore('Errore di autenticazione. Ricarica la pagina.');
      return;
    }

    // Banner beta: mostra se non già dimesso
    if (!localStorage.getItem('betaBannerDismissed')) {
      const betaBanner = document.getElementById('beta-banner');
      if (betaBanner) betaBanner.style.display = 'flex';
    }
    document.getElementById('beta-banner-close')?.addEventListener('click', () => {
      const betaBanner = document.getElementById('beta-banner');
      if (betaBanner) betaBanner.style.display = 'none';
      localStorage.setItem('betaBannerDismissed', '1');
    });

    // Pre-popola nome da sessione precedente
    state.name = localStorage.getItem('uploaderName') || '';
    const nameInput = document.getElementById('name-input');
    if (nameInput && state.name) nameInput.value = state.name;

    // Step 1
    document.getElementById('btn-start').addEventListener('click', handleNameSubmit);
    document.getElementById('name-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleNameSubmit();
    });

    // Step 2 — bottoni selezione file
    document.getElementById('btn-upload-photo').addEventListener('click', () =>
      document.getElementById('file-input-photo').click()
    );
    document.getElementById('btn-upload-video').addEventListener('click', () =>
      document.getElementById('file-input-video').click()
    );
    document.getElementById('file-input-photo').addEventListener('change', (e) => {
      handleFileSelect(Array.from(e.target.files), 'image');
    });
    document.getElementById('file-input-video').addEventListener('change', (e) => {
      handleFileSelect(Array.from(e.target.files), 'video');
    });

    // Step 2 — link "Cambia nome"
    document.getElementById('btn-change-name').addEventListener('click', changeNameClick);

    // Step 4 — "Carica altre"
    document.getElementById('btn-upload-more').addEventListener('click', () => {
      document.getElementById('file-input-photo').value = '';
      document.getElementById('file-input-video').value = '';
      showStep('step-upload');
    });

    // Mostra contatore file già caricati
    updateUploadCounter();
  }

  // ══════════════════════════════════════════════════════════════
  // NAVIGAZIONE TRA STEP
  // ══════════════════════════════════════════════════════════════
  function showStep(stepId) {
    document.querySelectorAll('.step').forEach((el) => {
      el.classList.remove('step-active');
    });

    const target = document.getElementById(stepId);
    if (!target) return;

    // Forza il reflow per riavviare l'animazione CSS
    void target.offsetWidth;
    target.classList.add('step-active');

    // Aggiornamenti contestuali per ogni step
    if (stepId === 'step-upload') {
      const greeting = document.getElementById('upload-greeting');
      if (greeting) greeting.textContent = state.name ? `Ciao ${state.name}!` : 'Ciao!';
      updateUploadCounter();
    }

    if (stepId === 'step-success') populateSuccessStep();
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 1 — Gestione nome
  // ══════════════════════════════════════════════════════════════
  function handleNameSubmit() {
    const input = document.getElementById('name-input');
    const nome = (input?.value || '').trim().substring(0, 50);
    state.name = nome;

    if (nome) localStorage.setItem('uploaderName', nome);

    showStep('step-upload');
  }

  function changeNameClick() {
    showStep('step-name');
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 2 — Selezione file
  // ══════════════════════════════════════════════════════════════
  function handleFileSelect(files, type) {
    if (!files || files.length === 0) return;

    // Rate limiting: max RATE_LIMIT file al minuto
    const ora = Date.now();
    state.rateWindow = state.rateWindow.filter((t) => ora - t < 60_000);
    if (state.rateWindow.length + files.length > RATE_LIMIT) {
      mostraErrore('Stai inviando troppi file. Attendi un momento e riprova.');
      return;
    }
    files.forEach(() => state.rateWindow.push(ora));

    // Validazione dimensione
    const maxSize = type === 'image' ? MAX_PHOTO_MB : MAX_VIDEO_MB;
    const maxLabel = type === 'image' ? '20MB' : '100MB';
    const validi = [];

    for (const file of files) {
      if (file.size > maxSize) {
        mostraErrore(`"${truncateName(file.name)}" supera il limite di ${maxLabel}.`);
        continue;
      }
      validi.push(file);
    }

    if (validi.length === 0) return;

    // Inizializza stato batch
    state.files      = validi;
    state.fileType   = type;
    state.total      = validi.length;
    state.successCount = 0;
    state.failCount    = 0;

    showStep('step-progress');
    buildProgressUI(validi);
    startUploads(validi, type);
  }

  function updateUploadCounter() {
    const count = parseInt(localStorage.getItem('totalUploadedCount') || '0', 10);
    const el = document.getElementById('upload-counter');
    if (el) el.textContent = `📦 ${count} file inviati finora`;
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 3 — UI Progress
  // ══════════════════════════════════════════════════════════════
  function buildProgressUI(files) {
    const container = document.getElementById('files-progress');
    if (!container) return;
    container.innerHTML = '';

    files.forEach((file, idx) => {
      const row = document.createElement('div');
      row.className = 'progress-row';
      row.id = `progress-row-${idx}`;
      row.setAttribute('role', 'listitem');
      row.innerHTML = `
        <div class="progress-bar-row">
          <div class="progress-spinner" id="spinner-${idx}"></div>
          <div class="progress-file-name">${truncateName(file.name, 30)}</div>
        </div>
      `;
      container.appendChild(row);
    });

    updateProgressSummary();
  }

  function updateProgress(fileIdx, stato) {
    const spinner = document.getElementById(`spinner-${fileIdx}`);
    if (!spinner) return;

    if (stato === 'completed') {
      spinner.className = 'progress-checkmark';
      spinner.textContent = '✓';
    } else {
      spinner.className = 'progress-spinner';
      spinner.textContent = '';
    }
  }

  function markFileError(fileIdx, messaggio) {
    const row     = document.getElementById(`progress-row-${fileIdx}`);
    const spinner = document.getElementById(`spinner-${fileIdx}`);

    if (row) row.classList.add('has-error');
    if (spinner) { spinner.className = 'progress-error'; spinner.textContent = '✗'; }

    // Aggiungi bottone riprova (una sola volta)
    if (row && !row.querySelector('.btn-retry')) {
      const btnRetry = document.createElement('button');
      btnRetry.className = 'btn-retry';
      btnRetry.textContent = 'Riprova';
      btnRetry.addEventListener('click', () => {
        row.classList.remove('has-error');
        row.querySelectorAll('.error-inline, .btn-retry').forEach((el) => el.remove());
        // Resetta il contatore errori per questo file e riprova
        state.failCount = Math.max(0, state.failCount - 1);
        updateProgress(fileIdx, 'uploading');
        uploadWithRetry(state.files[fileIdx], fileIdx, state.fileType, 1);
      });
      row.appendChild(btnRetry);
    }

    const errEl = document.createElement('p');
    errEl.className = 'error-inline';
    errEl.textContent = messaggio;
    if (row) row.appendChild(errEl);
  }

  function updateProgressSummary() {
    const el = document.getElementById('progress-summary');
    if (el) el.textContent = `${state.successCount} di ${state.total} completate`;
  }

  // ══════════════════════════════════════════════════════════════
  // PIPELINE UPLOAD
  // ══════════════════════════════════════════════════════════════

  // Avvia upload in chunk da MAX_CONCURRENT file
  async function startUploads(files, type) {
    for (let i = 0; i < files.length; i += MAX_CONCURRENT) {
      const chunk = files.slice(i, i + MAX_CONCURRENT);
      const promises = chunk.map((file, ci) =>
        uploadWithRetry(file, i + ci, type, 1)
      );
      await Promise.allSettled(promises);
    }
  }

  // Wrapper retry con backoff esponenziale (1s, 2s, 4s)
  async function uploadWithRetry(file, fileIdx, type, attempt) {
    try {
      await uploadFile(file, fileIdx, type);
      state.successCount++;
      updateProgressSummary();
      checkAllComplete();
    } catch (err) {
      if (isErrorRetryable(err) && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        await sleep(delay);
        return uploadWithRetry(file, fileIdx, type, attempt + 1);
      }
      // Fallimento definitivo
      logError('uploadWithRetry', err, { file: file.name, attempt });
      state.failCount++;
      updateProgressSummary();
      markFileError(fileIdx, 'Caricamento fallito. Clicca Riprova.');
      checkAllComplete();
    }
  }

  // Upload di un singolo file (tutte le versioni in parallelo)
  async function uploadFile(file, fileIdx, type) {
    const uuid      = generateUUID();
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const baseName  = `${uuid}_${safeName}`;

    // Definisce le versioni da caricare
    const versioni = [{ path: `wedding-media/originals/${baseName}`, blob: file, key: 'original' }];

    const downloadURLs = {};

    // Upload parallelo di tutte le versioni (single upload — più affidabile con storage rules anonymous)
    const uploadPromises = versioni.map(async (ver) => {
      const ref = storage.ref(ver.path);
      const metadata = {
        contentType: ver.blob.type || file.type || 'application/octet-stream',
        customMetadata: {
          uploaderName: state.name || '',
          uploadDate: new Date().toISOString(),
          isPreWeddingTest: String(new Date() < TEST_PHASE_END),
        },
      };
      const snapshot = await ref.put(ver.blob, metadata);
      downloadURLs[ver.key] = await snapshot.ref.getDownloadURL();
    });

    await Promise.all(uploadPromises);

    // Salva metadata in Firestore dopo che tutti gli upload sono completati
    await db.collection('wedding-media').add({
      uploadDate:    firebase.firestore.FieldValue.serverTimestamp(),
      uploader_name: state.name || '',
      uploaderUid:   firebase.auth().currentUser?.uid || null,
      file_type:     type === 'image' ? 'image' : 'video',
      fileName:      file.name,
      fileSize:      file.size,
      storagePath:   `wedding-media/originals/${baseName}`,
      original_url:  downloadURLs.original  || null,
      display_url:   downloadURLs.display   || null,
      thumb_url:     downloadURLs.thumbs    || null,
      status:             'pending',
      is_pre_wedding_test: new Date() < TEST_PHASE_END,
    });

    // Aggiorna counter localStorage
    const prev = parseInt(localStorage.getItem('totalUploadedCount') || '0', 10);
    localStorage.setItem('totalUploadedCount', String(prev + 1));

    updateProgress(fileIdx, 'completed');
  }

  // Controlla se tutti i file sono stati processati (success + failure)
  function checkAllComplete() {
    if (state.successCount + state.failCount < state.total) return;

    // Se ci sono errori, rimane su step-progress (l'utente vede i Riprova)
    if (state.failCount === 0) {
      setTimeout(() => onAllComplete(), 400);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // STEP 4 — Successo
  // ══════════════════════════════════════════════════════════════
  function onAllComplete() {
    showStep('step-success');
  }

  function populateSuccessStep() {
    const nameEl = document.getElementById('success-name');
    if (nameEl) {
      nameEl.textContent = state.name ? `✨ Grazie ${state.name}!` : '✨ Grazie!';
    }

    const countEl = document.getElementById('success-count');
    if (countEl) {
      const n = state.successCount;
      const parola = n === 1 ? 'foto/video è stato inviato' : 'foto/video sono state inviate';
      countEl.textContent = `Le tue ${n} ${parola}.`;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════════════════

  function truncateName(name, max = 30) {
    if (name.length <= max) return name;
    const dotIdx = name.lastIndexOf('.');
    if (dotIdx > 0 && name.length - dotIdx <= 5) {
      const ext = name.substring(dotIdx);
      return name.substring(0, max - 3 - ext.length) + '...' + ext;
    }
    return name.substring(0, max) + '...';
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Considera ritentabile solo gli errori di rete/timeout
  function isErrorRetryable(err) {
    if (!err) return false;
    const txt = (err.message || err.code || '').toLowerCase();
    return (
      txt.includes('network') ||
      txt.includes('timeout') ||
      txt.includes('unavailable') ||
      err.code === 'storage/retry-limit-exceeded' ||
      err.code === 'storage/server-file-wrong-size'
    );
  }

  // Log strutturato — no console.error sparsi
  function logError(contesto, err, extra) {
    console.warn(`[upload-flow] ${contesto}`, {
      messaggio: err?.message || String(err),
      codice:    err?.code,
      ...extra,
    });
  }

  // Mostra errore nell'UI (banner globale) — si nasconde dopo 5 secondi
  function mostraErrore(msg) {
    const banner = document.getElementById('error-banner');
    if (!banner) { alert(msg); return; }
    banner.textContent = msg;
    banner.style.display = 'block';
    clearTimeout(banner._timer);
    banner._timer = setTimeout(() => { banner.style.display = 'none'; }, 5000);
  }

  // UUID compatibile con Safari 14 (crypto.randomUUID non disponibile)
  function generateUUID() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ── Bootstrap ───────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
