# 📅 WEEK 2 PLAN — Upload nuovo + QR Code

**Periodo:** 12-18 maggio 2026 (1 settimana)
**Branch di lavoro:** `feature/upload-redesign` (NUOVO, da creare)
**Obiettivo:** Reimplementare il flusso di upload da zero, mobile-first, con compressione multi-resolution e QR code stampabile.

---

## 🎯 Goals della settimana

Alla fine della Settimana 2, avrai:

1. ✅ Pagina `/upload.html` nuova, mobile-first, separata da index
2. ✅ Compressione client-side multi-resolution (originale + display + thumb)
3. ✅ Upload parallelo a Firebase Storage in 3 cartelle (`originals/`, `display/`, `thumbs/`)
4. ✅ Cloud Function `generateThumbnails` che gestisce la pipeline lato server (fallback)
5. ✅ Schema Firestore `wedding-media` esteso con i nuovi campi (vedi PRD)
6. ✅ Sezione QR code nel sito principale + generator stampabile
7. ✅ Tutti i fix testati su preview channel
8. ✅ Deploy in produzione del nuovo flusso

---

## 📋 Prerequisiti

Prima di iniziare:
- ✅ Settimana 1 completata
- ✅ Tag `v1.0-foundations` esistente
- ✅ API key Anthropic creata (per la Settimana 3, ma teniamo in cassaforte)
- ✅ Cartella di lavoro: `c:\Users\frape\matrimonio-sito`

---

## 🟢 GIORNO 1 — Setup branch + audit Storage

### Task 1.1 — Crea branch di lavoro Settimana 2

In Claude Code:

````
Crea il branch di lavoro per la Settimana 2.

Azioni:
1. git status (verifica che siamo puliti)
2. git checkout main
3. git pull origin main (per sicurezza)
4. git checkout -b feature/upload-redesign
5. git branch (verifica siamo sul nuovo branch)

Mostrami git log --oneline -5 per conferma.
````

### Task 1.2 — Audit Firebase Storage attuale

````
Voglio fare un audit dello stato attuale di Firebase Storage e della
collection wedding-media in Firestore prima di iniziare a riscriverla.

Azioni:
1. Esegui:
   firebase storage:download wedding-media -p . --project matrimonio-andrea-giulia-2026
   (per scaricare metadata, NON file binari, se possibile)
   
   Se non funziona, in alternativa, mostrami quanti file ci sono in
   wedding-media/ via:
   gsutil ls gs://matrimonio-andrea-giulia-2026.firebasestorage.app/wedding-media/ | wc -l

2. Mostra struttura attuale di wedding-media/ (quante foto/video sono
   già caricati dai test precedenti)

3. Mostra schema attuale dei documenti in Firestore wedding-media via:
   firebase firestore:read wedding-media --limit 5
   (oppure via Firebase Console se CLI non lo supporta)

4. Crea documento STORAGE_AUDIT.md nella root con:
   - Numero file attuali per cartella
   - Schema documenti esistenti
   - Cosa va preservato (test reali) vs cosa va eliminato (test sviluppo)

NON cancellare niente. Solo audit.
````

---

## 🟢 GIORNO 2 — Schema Firestore esteso

### Task 2.1 — Aggiorna schema wedding-media

````
Devo estendere lo schema della collection Firestore wedding-media per
supportare le nuove feature della Settimana 2 e successive.

Lo schema target è documentato in PRD.md sezione FR-DB-01. Leggi il PRD.

Azioni:

1. Crea file scripts/migrate-wedding-media-schema.js che:
   - Si connette a Firestore via Admin SDK
   - Legge tutti i documenti esistenti in wedding-media
   - Per ognuno aggiunge i nuovi campi con valori di default:
     * uploader_name: "" (vuoto)
     * file_type: detect da fileName (.jpg/png → "image", .mp4/mov → "video")
     * original_url: copia da downloadURL esistente
     * display_url: null (sarà popolato dalla Cloud Function)
     * thumb_url: null (sarà popolato dalla Cloud Function)
     * status: "approved" (i media esistenti li consideriamo già approvati)
     * moderated_by: "system_migration"
     * moderated_at: timestamp ora
     * ai_score: null
     * ai_caption: null
     * blur_score: null
     * brightness: null
     * duplicate_of: null
     * scene: null
     * shown_at: null
     * shown_count: 0
     * duration: null

2. Lo script deve essere idempotente (se rilanciato non duplica modifiche).

3. NON ESEGUIRE LO SCRIPT, solo crearlo. Lo eseguiremo manualmente
   con conferma esplicita dopo review.

4. Aggiorna anche firestore.rules con la nuova validazione payload per
   create di wedding-media (richiede uploader_name, file_type, ecc.).
   Leggi il PRD sezione FR-DB-03 per i dettagli.

5. NON deployare le rules nuove. Solo modifica il file.

6. Commit:
   "feat(week2): schema wedding-media esteso + migration script (no exec)"
````

### Task 2.2 — Esegui migrazione (manuale + reversibile)

````
Voglio eseguire lo script di migrazione del schema, ma con piena trasparenza
e possibilità di rollback.

Azioni:

1. Prima crea un backup: scarica via Admin SDK tutti i documenti attuali di
   wedding-media in un file scripts/backup-wedding-media-2026-05-XX.json

2. Mostrami quanti documenti ha trovato (probabilmente pochi, < 10)

3. Esegui lo script di migrazione con un dry-run prima:
   node scripts/migrate-wedding-media-schema.js --dry-run
   (lo script deve supportare il flag dry-run)

4. Mostra l'output del dry-run

5. Se sembra tutto ok, esegui per davvero:
   node scripts/migrate-wedding-media-schema.js

6. Verifica che i campi nuovi siano stati aggiunti leggendo 3 documenti
   random da Firestore.

7. Commit del backup:
   git add scripts/backup-wedding-media-*.json
   git commit -m "chore: backup wedding-media pre-migrazione schema"

NOTA: il backup file contiene URL ma non file binari. Se serve rollback
totale, eseguiremo uno script reverse.
````

---

## 🟢 GIORNO 3 — Pagina /upload.html nuova

### Task 3.1 — Sviluppa upload.html mobile-first

````
Adesso sviluppiamo la nuova pagina /upload.html secondo le specifiche del
PRD.md (sezione 4.1 FR-UPL-01 to FR-UPL-08).

Requisiti chiave:
- Pagina dedicata, separata da index.html
- Mobile-first design responsive
- Coerente con palette esistente (beige #faf7f3, verde #5a7d6f, serif Playfair)
- Funziona offline-first per il form nome (localStorage)
- Step 1: nome → Step 2: upload → Step 3: success

Struttura del file:
- /upload.html (nuovo, root del progetto)
- /upload-styles.css (NUOVO, dedicato a questa pagina)
- /upload-flow.js (NUOVO, JS della pagina)

Per la compressione client-side, usa la libreria browser-image-compression:
- Aggiungila come <script> dal CDN nell'head di upload.html
- URL: https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js

Step 1 — Schermata "Inserisci il tuo nome":
- Logo cuore (riusa quello del sito)
- Title: "Condividi i tuoi momenti"
- Subtitle: "Aiutaci a creare la nostra galleria live!"
- Input "Il tuo nome" (placeholder: "es. Marco", optional ma raccomandato)
- Bottone "Inizia →" (verde solido grande, easy tap)

Step 2 — Schermata "Carica foto/video":
- "Ciao [nome]!" oppure "Ciao!" se nome vuoto
- 2 grandi bottoni:
  - "📸 Carica foto" (apre input type=file accept=image/*)
  - "🎥 Carica video" (apre input type=file accept=video/*)
- Counter "📦 X file inviati finora" (legge da localStorage)
- Link discreto: "Cambia nome" → torna a step 1

Step 3 — Mentre uploada:
- Lista dei file in upload con progress bar per ognuno
- "Sto caricando 3 di 5..."
- NON permettere di chiudere la pagina (warning beforeunload)

Step 4 — Successo:
- "✨ Grazie [nome]! Le tue X foto sono state inviate."
- "Guardale apparire sul grande schermo!"
- Bottoni: "Carica altre" (torna a step 2) | "Vedi la galleria live →" (link a /live.html)

Implementazione tecnica:
- Compressione client multi-resolution come da PRD FR-UPL-04
- Upload parallelo Firebase Storage (max 5 in parallelo) come da PRD FR-UPL-05
- Salvataggio in 3 cartelle: originals/, display/, thumbs/ (nei nomi file usa UUID)
- Salvataggio metadata in Firestore wedding-media con status="pending"
- Gestione errori graceful con retry automatico (3 tentativi)

Limiti rispettati:
- Max 20MB per foto, max 100MB per video
- Tipi: JPG, JPEG, PNG, HEIC, GIF (foto); MP4, MOV (video)
- Nessun limite di file totali per invitato (decisione esplicita)

NON modificare l'index.html né altre pagine esistenti.

Commit: "feat(week2): nuova pagina /upload.html mobile-first con multi-resolution"
````

### Task 3.2 — Test locale upload

````
Testa la nuova pagina /upload.html in locale.

Azioni:
1. firebase emulators:start --only hosting,firestore,storage

2. Apri http://localhost:5000/upload.html

3. Esegui questo flow:
   - Inserisci nome "TEST"
   - Carica 3 foto di test (qualsiasi)
   - Verifica che le foto appaiano in:
     - Storage emulator UI: 3 file in originals/, 3 in display/, 3 in thumbs/
     - Firestore emulator UI: 3 documenti in wedding-media con tutti i nuovi campi

4. Riportami:
   - Tempo medio di compressione per foto
   - Dimensione media file originale vs display vs thumb
   - Eventuali errori

5. Se Firestore emulator non funziona (Java mancante), testa solo upload
   verificando lato Storage emulator. Faremo test Firestore in produzione.
````

---

## 🟢 GIORNO 4 — Cloud Function generateThumbnails (fallback server)

### Task 4.1 — Cloud Function generateThumbnails

````
Sviluppa la Cloud Function generateThumbnails che funge da fallback
server-side per generare display+thumb se la compressione client fallisce
o se per qualche motivo arrivano file non compressi.

Specifiche:
- Trigger: Storage upload nella cartella wedding-media/originals/
- Input: file appena caricato (foto)
- Output: 2 file in wedding-media/display/ e wedding-media/thumbs/
  + aggiornamento del documento Firestore corrispondente con display_url e thumb_url
- Library: sharp (npm)

Azioni:

1. Aggiungi sharp alle dipendenze functions:
   cd functions
   npm install sharp@latest
   cd ..

2. Aggiungi nuova funzione in functions/index.js:
   - Nome: generateThumbnails
   - Trigger: onObjectFinalized in cartella wedding-media/originals/
   - Logica:
     * Verifica che è un'immagine (skip video, tireremo i video con metadata only)
     * Genera display version (max 2560x1440, JPEG q85)
     * Salva in wedding-media/display/{stesso filename}
     * Genera thumb version (600x600, JPEG q75, cover crop)
     * Salva in wedding-media/thumbs/{stesso filename}
     * Trova documento Firestore corrispondente (matching su storagePath)
     * Aggiorna con display_url e thumb_url

3. Per i video: solo aggiorna Firestore con duration extraction (placeholder
   per ora, implementeremo in Settimana 3)

4. NON deployare ancora. Solo sviluppo locale.

5. Test in locale via emulator:
   firebase emulators:start --only functions,storage,firestore

6. Carica una foto via /upload.html locale e verifica che la Cloud Function
   generi correttamente display e thumb in <5 secondi.

7. Commit: "feat(week2): Cloud Function generateThumbnails con sharp"
````

### Task 4.2 — Deploy + smoke test

````
Deploy della Cloud Function generateThumbnails in produzione.

Azioni:

1. Verifica che il file functions/.env esista con le credenziali necessarie

2. Esegui:
   firebase deploy --only functions:generateThumbnails

3. Cattura output completo. Verifica deploy ok.

4. Smoke test:
   - Apri https://andreagiulia5luglio26.it/upload.html
   - Carica 1 foto di test
   - Vai su Firebase Console > Storage e verifica 3 file generati
   - Vai su Firestore e verifica documento wedding-media con tutti i campi

5. Se funziona, ottimo. Se ci sono errori, mostrami logs:
   firebase functions:log --only generateThumbnails

6. NON cancellare il media di test. Lo userò io dopo.

7. NON committare niente al deploy stesso (questo è un effetto, non codice).
   I commit sono già stati fatti.
````

---

## 🟢 GIORNO 5 — QR Code generator

### Task 5.1 — Sezione QR nel sito + generator stampabile

````
Aggiungi una sezione "Carica le tue foto" all'index.html con un QR code
che linka a /upload.html. Crea anche un generatore di card stampabili.

Azioni:

1. Aggiungi una sezione in index.html (prima del footer) con:
   - Title: "Condividi con noi i tuoi momenti"
   - Subtitle: "Scansiona il QR code dal tuo telefono per caricare foto e video"
   - Container per il QR code (renderizzato via JS)
   - Mini-istruzioni: "Apri la fotocamera del telefono e inquadra il QR"

2. Crea file qr-generator.js che usa qr-code-styling per generare il QR
   pointing a https://andreagiulia5luglio26.it/upload.html
   - Stile: design coerente con palette del sito (verde + beige)
   - Dimensione: 250x250 sul sito, 1000x1000 quando stampato

3. Crea pagina dedicata /qr-print.html (privata, accessibile solo via link
   diretto, non in nav) che:
   - Genera 12 QR code da stampare su un foglio A4 (4x3 grid)
   - Ogni card include: QR + testo "Carica le tue foto del matrimonio"
   - CSS @media print per ottimizzare la stampa
   - Bottone "Stampa" + bottone "Salva PDF"

4. Aggiungi qr-print.html alla lista admin in robots.txt (non indicizzare)
   e alla ignore list di firebase.json se serve.

5. Test locale:
   - Apri /qr-print.html
   - Verifica che le 12 card si stampino bene su A4
   - Scansiona uno dei QR con il telefono per verificare che porti a /upload.html

6. Commit: "feat(week2): sezione QR in homepage + pagina /qr-print.html stampabile"
````

---

## 🟢 GIORNO 6 — Deploy preview + smoke test completo

### Task 6.1 — Deploy preview Settimana 2

````
È il momento di deployare tutto sul preview channel per test reali.

Azioni:

1. Verifica git status pulito (a parte file attesi).

2. Pre-flight:
   - Esegui git log --oneline -10 per vedere i commit di questa settimana
   - Conta quanti file sono stati modificati con git diff main..feature/upload-redesign --stat

3. Deploy preview:
   firebase hosting:channel:deploy preview-week2 --expires 14d

4. Cattura URL preview.

5. Smoke test HTTP automatizzato (via curl/Invoke-WebRequest):
   - / → 200
   - /upload.html → 200 (nuova pagina!)
   - /qr-print.html → 200
   - /gallery.html → 200
   - /CODEBASE_AUDIT.md → 404 (sicurezza)
   - /scripts/* → 404 (sicurezza)
   - /functions/* → 404 (sicurezza)

6. Riportami:
   - URL preview
   - Numero file deployati
   - Tabella smoke test

NON deployare in produzione finché non ti do il GO esplicito.
````

### Task 6.2 — Test reale completo su preview

````
Faccio io test reale dal mio telefono. Scrivimi 4 cose:

1. URL preview esatto
2. Eventuali credenziali necessarie
3. Una checklist di scenari da testare (almeno 5)
4. Cosa mi devi mostrare DOPO il test (es. "screenshot dei 3 file in Storage")

NON eseguire nulla. Solo scrivimi la guida per il test.
````

(Tu fai i test reali sul telefono e mi riporti i risultati nella chat)

---

## 🟢 GIORNO 7 — Deploy produzione + chiusura

### Task 7.1 — Deploy produzione + merge

````
GO per il deploy in produzione.

Azioni:

1. Pre-flight check:
   - git status pulito
   - git log --oneline -10

2. Deploy hosting:
   firebase deploy --only hosting

3. Smoke test produzione (stessa lista del preview ma sul dominio vero):
   - https://andreagiulia5luglio26.it/upload.html → 200
   - File sensibili → 404

4. Se ok, merge in main:
   git checkout main
   git pull origin main
   git merge feature/upload-redesign --no-ff -m "merge: Settimana 2 - upload redesign"
   git tag -a v2.0-upload-redesign -m "Settimana 2 completata"
   git push origin main
   git push origin v2.0-upload-redesign

5. Cleanup preview channel:
   firebase hosting:channel:delete preview-week2

6. Aggiorna WEEK1_RECAP.md → CODEBASE_AUDIT.md con stato post-Week2.

7. Riportami report finale.
````

---

## 🎯 Checklist Definition of Done — Settimana 2

Alla fine della settimana, verifica:

- [ ] Nuova pagina `/upload.html` live in produzione
- [ ] Compressione client multi-resolution funzionante
- [ ] Storage Firebase con 3 cartelle (originals, display, thumbs)
- [ ] Cloud Function `generateThumbnails` deployata e funzionante
- [ ] Schema Firestore esteso con migrazione completata
- [ ] Sezione QR in homepage
- [ ] Pagina `/qr-print.html` stampabile
- [ ] Tutti i fix testati su preview e produzione
- [ ] Branch merge in main + tag `v2.0-upload-redesign`
- [ ] Aggiornato CODEBASE_AUDIT.md
- [ ] Test reale dal telefono andato a buon fine

---

## 🚀 Cosa viene dopo (Settimana 3 anteprima)

- Dashboard moderazione `/admin-media.html` con 4 tab
- Real-time updates con `onSnapshot`
- Cloud Function `aiPhotoCurator` (Claude Vision per scoring)
- Filtri tecnici (blur, brightness, duplicates)
- Swipe gestures mobile

---

## 💡 Note operative

### Quando lanciare Claude Code

Per ogni task della settimana:
1. Apri Cursor sul progetto
2. Apri terminale (Ctrl+\`)
3. Verifica branch: `git branch` → deve essere `feature/upload-redesign`
4. Lancia: `claude` Invio
5. Incolla il prompt del task
6. Attendi che finisca
7. Esci con `exit`

### Quando torni qui in chat con me

- Quando un task è completato → riporta output di Claude Code
- Quando c'è un errore → screenshot + descrizione
- Quando non sei sicuro → chiedi prima di eseguire
- Quando un task richiede review (es. test reale) → ti aspetto qui

### Tempo stimato per la settimana

- Giorno 1: 30 min (setup + audit)
- Giorno 2: 1h (schema + migrazione)
- Giorno 3: 2-3h (upload page nuovo)
- Giorno 4: 1-2h (Cloud Function)
- Giorno 5: 1h (QR generator)
- Giorno 6: 1h (deploy + smoke test)
- Giorno 7: 30 min (produzione + cleanup)

**Totale: ~8 ore distribuite su 7 giorni** = ~1h al giorno se vuoi farlo a piccoli pezzi, oppure 1-2 weekend mezzi.

---

🎯 **Buona Settimana 2! Quando sei pronto per iniziare, parti dal Giorno 1.**
