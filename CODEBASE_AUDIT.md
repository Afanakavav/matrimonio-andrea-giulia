# CODEBASE AUDIT — Matrimonio Andrea & Giulia
**Data audit:** 2026-05-03  
**Branch:** feature/live-gallery  
**Progetto Firebase:** matrimonio-andrea-giulia-2026  
**Dominio:** andreagiulia5luglio26.it

---

## 1. Stack Tecnologico

**Questo NON è un progetto Next.js.** È un sito statico HTML/CSS/JS puro, senza framework frontend.

| Componente | Versione / Dettaglio |
|---|---|
| Frontend | HTML statico + CSS + JavaScript vanilla (ES6+) |
| Firebase SDK (client) | **9.23.0 compat mode** (firebase-app-compat, firestore-compat, storage-compat) |
| Firebase Admin (backend) | firebase-admin ^12.0.0 |
| Cloud Functions runtime | firebase-functions ^5.0.0 — Node.js 20 |
| Email | nodemailer ^6.9.7 via SMTP Register.it |
| reCAPTCHA | v2 checkbox (widget .g-recaptcha) |
| Build step | **Nessuno** — il sito viene deployato così com'è |
| Bundler / minifier | Nessuno |
| Test | Playwright ^1.58.2 (e2e) + Node test runner (unit) |
| Linter / Formatter | ESLint ^8.57.0 + Prettier ^3.2.0 |

**Dipendenze root (devOnly):** `@playwright/test`, `eslint`, `prettier`, `serve`  
**Dipendenze functions:** `axios`, `dotenv`, `firebase-admin`, `firebase-functions`, `nodemailer`

---

## 2. Struttura del Frontend

### Pagine HTML

| File | Scopo |
|---|---|
| `index.html` | Pagina principale. Contiene: hero video, sezione "La Nostra Storia" con timeline, Cerimonia, Ricevimento, R.S.V.P. form, Lista Nozze |
| `gallery.html` | Galleria media condivisa dagli ospiti. Carica da Firestore `wedding-media`, mostra grid + modal lightbox |
| `admin-hub.html` | Landing page admin. Due card: link a admin.html (Media) e admin-rsvp.html (RSVP). Non richiede auth di per sé |
| `admin.html` | Pannello gestione media: visualizza/elimina foto e video caricati dagli ospiti |
| `admin-rsvp.html` | Pannello gestione RSVP: tabella con stats, ricerca, filtri, export CSV/Excel, dettagli per ospite |
| `generate-hash.html` | Utility per generare l'hash SHA256 della password admin |
| `test-hash.html` | Utility per testare l'hash SHA256 |

### Script JS (root)

| File | Ruolo |
|---|---|
| `script.js` | Comportamenti globali: hamburger menu, smooth scroll, navbar on scroll, animazioni IntersectionObserver |
| `rsvp-handler.js` | Form RSVP: validazione, reCAPTCHA v2, chiamata Cloud Function `submitRSVP`, countdown timer |
| `firebase-config.js` | Inizializza Firebase app, espone `window.db` e `window.storage`, definisce `WEDDING_CONFIG` |
| `gallery-script.js` | Classe `Gallery`: carica Firestore, renderizza grid, gestisce modal lightbox con navigazione keyboard |
| `upload-modal.js` | Classe `UploadModal`: drag&drop, validazione file, compressione immagini via Canvas, upload su Storage + salvataggio metadata su Firestore |
| `auth-manager-secure.js` | Classe `AuthManagerSecure`: autenticazione admin client-side via SHA256 + sessionStorage |
| `admin-script.js` | Pannello admin media (admin.html): carica lista media, preview, elimina da Storage e Firestore |
| `admin-rsvp-script.js` | Pannello admin RSVP: carica da Firestore, filtra, ordina, export CSV/Excel |
| `video-handler.js` | Handler video (funzione di supporto, non ancora integrata in modo significativo) |

### Struttura della Galleria (gallery.html + gallery-script.js)

La galleria è una **single-load grid** senza real-time e senza pagination reale:

1. Al caricamento della pagina, `Gallery.loadMedia()` esegue una query Firestore su `wedding-media` ordinata per `uploadDate` desc, **limit 100**
2. I risultati vengono renderizzati tutti in una grid CSS (`.gallery-container`)
3. Ogni elemento è un `<img>` o `<video>` che punta direttamente alla `downloadURL` di Firebase Storage (URL firmato, full-resolution)
4. Click su un elemento apre un modal lightbox con navigazione prev/next e supporto keyboard (←, →, Esc)
5. Non c'è real-time listener (`onSnapshot`), non c'è lazy-loading delle immagini oltre l'attributo `loading="lazy"`, non ci sono thumbnails

---

## 3. Backend Firebase

### Cloud Functions (`functions/index.js`)

| Funzione | Tipo | Cosa fa |
|---|---|---|
| `verifyRecaptcha` | `onCall` | Verifica un token reCAPTCHA v3 chiamando l'API Google. Ritorna `{ success, score, action }`. Soglia score: 0.5 |
| `submitRSVP` | `onCall` (timeout 120s) | Pipeline completa: 1) verifica reCAPTCHA 2) sanitizza dati 3) salva su Firestore `rsvp-confirmations` 4) invia email di conferma via SMTP Register.it. L'RSVP viene salvato anche se l'email fallisce |
| `checkRateLimit` | `onCall` | Dovrebbe limitare a 5 RSVP per IP in 24h — ma ha un **bug**: `submitRSVP` non salva mai il campo `ip` nel documento, quindi questa funzione trova sempre 0 record e non blocca nulla |

**Email:** mittente `info@andreagiulia5luglio26.it`, SMTP `authsmtp.securemail.pro:465` (SSL). Credenziali da `functions/.env`.

### Schema Firestore

**Collezione `rsvp-confirmations`**
```
{
  name: string,
  email: string,
  phone: string,
  attendance: "yes" | "no",
  guests: number,
  intolerances: string,
  message: string,
  timestamp: Timestamp (serverTimestamp),
  recaptchaScore: number | null
}
```
*Nota: campo `ip` assente nonostante `checkRateLimit` lo cerchi.*

**Collezione `wedding-media`**
```
{
  fileName: string,
  fileType: string (MIME),
  fileSize: number (bytes),
  downloadURL: string (Firebase Storage URL),
  uploadDate: Timestamp (serverTimestamp),
  storagePath: string ("wedding-media/timestamp-filename"),
  hashtag: "#AndreaGiulia2026"
}
```

### Configurazione firebase-config.js

```javascript
const WEDDING_CONFIG = {
  weddingDate: "2026-07-05",
  uploadEnabled: true,
  maxFileSize: 100MB,
  allowedTypes: [jpeg, jpg, png, gif, mp4, mov, avi],
  maxFilesPerUpload: 20  // UI limita però a 10 foto + 3 video
};
```
Il Firebase project ID è `matrimonio-andrea-giulia-2026`. La API key è esposta nel codice client (normale per Firebase web SDK).

### Regole Firestore (`firestore.rules`)

| Collezione | Create | Read/Update/Delete |
|---|---|---|
| `rsvp-confirmations` | Pubblica fino al **6 aprile 2026** (già scaduta!) con validazione name/email/attendance | `if true` — completamente aperta |
| `wedding-media` | Pubblica fino al **12 agosto 2026** | Delete: `if true` — aperta; Read: aperta fino al 12/08 |

---

## 4. Sistema RSVP Attuale

**Flusso completo:**

1. Utente compila form su `index.html` (nome, email, partecipazione, ospiti, intolleranze, messaggio)
2. reCAPTCHA v2 checkbox (widget visibile) — l'utente deve spuntare "Non sono un robot"
3. `rsvp-handler.js` chiama la Cloud Function `submitRSVP` con token + dati
4. Cloud Function verifica token, sanitizza, salva su Firestore, invia email di conferma
5. L'email parte da `info@andreagiulia5luglio26.it` (SMTP Register.it)
6. UI mostra messaggio di successo; link "modifica" rimostra il form (ma non pre-compila)

**Dove vengono salvati i dati:** Firestore `rsvp-confirmations` (documento con ID auto-generato)

**Admin RSVP (`admin-rsvp.html`):**
- Login con password hashata (SHA256 di "RindiFusi", hash hardcoded in `auth-manager-secure.js`)
- Dashboard con 4 statistiche: confermati, non confermati, totale ospiti, con intolleranze
- Tabella con ricerca full-text (client-side), filtri per stato, ordinamento
- Export CSV e Export Excel (generati lato client)
- Modal dettaglio per ogni RSVP
- Pulsante elimina per ogni record

**Problema critico:** La deadline Firestore per nuovi RSVP era il **6 aprile 2026** — già passata. I nuovi RSVP vengono bloccati dalle regole Firestore, non dalla UI.

---

## 5. Sistema Upload/Galleria Attuale

**Flusso upload:**

1. Bottone "Carica" in nav di `index.html` (href="#", non funziona — vedi Issues)
2. `UploadModal` si apre (ma `uploadBtn` punta a `href="#"` invece di aprire il modal via JS)
3. Utente seleziona file tramite click o drag&drop
4. Validazione: max 100MB per file, tipi JPEG/PNG/GIF/MP4/MOV/AVI, max 10 foto + 3 video per batch
5. Immagini compresse client-side via Canvas: max 1920×1920px, JPEG quality 0.8 — solo se il risultato è più piccolo dell'originale
6. Upload su Firebase Storage path `wedding-media/{timestamp}-{filename}`
7. Metadata salvato su Firestore `wedding-media`

**Dove vengono salvati i file:** Firebase Storage bucket `matrimonio-andrea-giulia-2026.firebasestorage.app`, folder `wedding-media/`

**Limiti attuali:**
- L'upload è **non accessibile dalla homepage** (`uploadBtn` ha href="#", i link Carica/Galleria in nav sono nascosti con classe `nav-hidden`)
- Nessun campo "nome fotografo" — impossibile sapere chi ha caricato cosa
- Nessuna moderazione: qualsiasi file valido appare subito in galleria
- Nessun thumbnail: la galleria mostra immagini full-res (fino a 1920px) direttamente
- Nessun real-time: gli ospiti non vedono le nuove foto senza ricaricare la pagina
- Upload sequenziale (un file alla volta), non parallelo
- Gallery link in `gallery.html` empty-state punta a `upload.html` che non esiste

---

## 6. Hosting e Deploy

**Piattaforma:** Firebase Hosting  
Configurazione in `firebase.json`: la cartella pubblica è la root (`"public": "."`), quindi **tutto il repository viene servito** (inclusi file potenzialmente sensibili non esclusi dall'`ignore`).

**File `.firebaserc`:**
```json
{ "projects": { "default": "matrimonio-andrea-giulia-2026" } }
```

**Script di deploy disponibili:**

| Comando | Dove | Cosa fa |
|---|---|---|
| `firebase deploy --only functions` | `functions/package.json` | Deploya solo le Cloud Functions |
| `firebase emulators:start --only functions` | `functions/package.json` | Avvia emulatore locale functions |
| `node scripts/perf-check.js` | `package.json` | Controlla dimensioni asset (immagini >500KB, video >50MB, JS totale) |

Non esiste uno script di deploy completo del sito (Hosting + Functions insieme). Il deploy del frontend avviene presumibilmente con `firebase deploy` manuale da CLI.

---

## 7. Issues Identificati

### Critici

1. **`uploadBtn` è rotto** — `index.html:51`: `<a href="#" id="uploadBtn">` punta a `#`. Il click listener in `upload-modal.js` si aspetta di intercettare il click, ma il link non ha `href` valido e i voci "Carica" e "Galleria" hanno classe `nav-hidden` quindi sono nascosti nella nav.

2. **Deadline RSVP già scaduta** — Le Firestore rules bloccano nuovi RSVP dal 6 aprile 2026 (oggi 3 maggio 2026). La UI non mostra nessun messaggio di chiusura: il form viene compilato ma la Cloud Function fallisce silenziosamente per le regole Firestore.

3. **Auth admin client-side non sicura** — `auth-manager-secure.js:29`: l'hash SHA256 della password è hardcoded nel JS (`d0756e88...`). Chiunque apra DevTools può vederlo. Non è Firebase Authentication, è sessionStorage + hash lato client. Non c'è protezione server-side delle operazioni admin (le regole Firestore sono `if true`).

4. **Firestore rules wide-open per delete** — Chiunque può eliminare RSVP e media senza autenticazione chiamando l'API Firestore direttamente.

5. **`gallery.html` empty-state linka a `upload.html`** — `gallery.html:90`: `<a href="upload.html">` — questo file non esiste nel progetto (404).

### Performance

6. **Nessun thumbnail** — La galleria carica immagini full-resolution (fino a 1920px) per ogni tile della grid. Con 100 foto, il browser scarica potenzialmente centinaia di MB.

7. **Video hero e timeline non ottimizzati** — `wedding-video.mp4` (5.2MB) e `chilometri.mp4` (2.5MB) vengono scaricati interamente con `preload="auto"` anche su mobile.

8. **Firebase SDK non tree-shakeable** — Vengono caricati i CDN compat bundles (firebase-app-compat, firestore-compat, storage-compat) che includono tutto il SDK. Un approccio modulare ridurrebbe il bundle di ~40%.

9. **Gallery carica tutto in una volta** — Limit 100 documenti, tutti renderizzati subito. Nessuna virtual scroll né lazy-load delle schede.

### Bug minori

10. **Footer `gallery.html`** — Copyright "Afanakavav" (presumibilmente placeholder mai aggiornato), email di contatto personale `francesco.perone00@gmail.com` invece di quella del matrimonio.

11. **`checkRateLimit` inutile** — La funzione cerca documenti con campo `ip` che `submitRSVP` non salva mai → rate limiting sempre bypassed.

12. **reCAPTCHA v2 + v3 confusi** — `index.html` carica il script reCAPTCHA v2, `rsvp-handler.js` carica v2 dinamicamente se non presente, ma `verifyRecaptcha` Cloud Function usa il verificatore v3 con score (v2 non ha score → `verificationResult.score` sarà `undefined`, il check score viene skippato correttamente ma l'architettura è confusa).

13. **Navigazione galleria non circolare** — Prev/Next nel modal si bloccano al primo e all'ultimo elemento invece di fare wrap-around.

---

## 8. Asset Preziosi da Preservare

Questi dati/risorse **non devono essere persi** durante qualsiasi refactoring:

| Asset | Dove | Note |
|---|---|---|
| **RSVP degli ospiti** | Firestore `rsvp-confirmations` | Tutti i documenti con nome, email, numero ospiti, intolleranze — dati critici per l'organizzazione |
| **Foto/video caricati dagli ospiti** | Firebase Storage `wedding-media/` + Firestore `wedding-media` | I metadata su Firestore puntano agli URL di Storage — entrambi vanno preservati insieme |
| **Credenziali SMTP** | `functions/.env` → `EMAIL_USER`, `EMAIL_PASS` | Credenziali Register.it per `info@andreagiulia5luglio26.it` |
| **Chiave reCAPTCHA** | `functions/.env` → `RECAPTCHA_SECRET_KEY` | Non committata in git, va preservata separatamente |
| **Firebase project config** | `firebase-config.js`, `.firebaserc` | Project ID, storageBucket, appId — necessari per qualsiasi redeployment |
| **Dominio** | `CNAME` file → `andreagiulia5luglio26.it` | Dominio registrato, va mantenuto puntato a Firebase Hosting |
| **Email matrimonio** | `info@andreagiulia5luglio26.it` | Casella Register.it già configurata e usata per email ai guest |
| **Video asset** | `wedding-video.mp4`, `chilometri.mp4` | File unici, non recuperabili se persi |
| **Immagini timeline** | `images/` (proposta, asilo, liceo, coronamento) | Foto personali originali |

---

## RACCOMANDAZIONI

### Opinione professionale sull'architettura attuale

Il progetto è solido per la sua natura (sito evento una-tantum, ~100-200 ospiti) e la scelta dello stack statico è corretta: nessun server da mantenere, costi minimi, deploy istantaneo. Le Cloud Functions per RSVP con email sono ben implementate. **Non bisogna riscrivere tutto.**

---

### Cosa va RIUSATO senza modifiche

- **L'intera struttura di `index.html`** — cerimonia, ricevimento, lista nozze, timeline, hero video. È completa e funzionante.
- **Il sistema RSVP** — `rsvp-handler.js` + Cloud Function `submitRSVP` + email. Funziona bene; va solo aggiornata la deadline Firestore rules.
- **`firebase-config.js`** — la configurazione e il `WEDDING_CONFIG` vanno benissimo.
- **`auth-manager-secure.js`** — sufficiente per un pannello admin privato di un sito matrimonio; non serve Firebase Auth completo per questo use case (nessun dato finanziario, nessun PII critico).
- **I pannelli admin** (`admin.html`, `admin-rsvp.html`) — funzionali, usabili as-is.
- **Le Firestore rules** — struttura giusta, vanno solo corrette le deadline e le regole di delete.

---

### Cosa va RIFATTORIZZATO

1. **Galleria (`gallery-script.js`)** — Trasformare da "carica-tutto-in-una-volta" a stream real-time con `onSnapshot`, aggiungere paginazione (20 item per volta), aggiungere indicatore "nuove foto disponibili".

2. **Upload (`upload-modal.js`)** — Aggiungere campo "nome" obbligatorio per identificare il fotografo; rendere l'upload accessibile (fixare `uploadBtn` href, rimuovere `nav-hidden`); aggiungere upload parallelo con `Promise.all`.

3. **Firestore rules** — Aggiornare deadline RSVP (o rimuoverla dato che è passata); aggiungere autenticazione per delete operations.

4. **`gallery.html` empty-state** — Correggere link a `upload.html` (inesistente).

5. **Footer** — Rimuovere "Afanakavav", usare email del matrimonio invece di quella personale.

---

### Cosa va AGGIUNTO DA ZERO per la live gallery cinematografica

Per un'esperienza **cinematografica e live** durante il matrimonio (5 luglio 2026), queste sono le funzionalità che mancano completamente:

**Priorità alta:**

1. **Thumbnail automatici** — Cloud Function triggered da Firebase Storage che genera thumbnail (es. 400×300px) per ogni immagine caricata, salvando il thumbnail URL su Firestore. La galleria mostra i thumbnail, il modal carica il full-res. Senza questo, la galleria è inutilizzabile oltre le prime 10-15 foto.

2. **Real-time updates** — Sostituire la query one-shot con `db.collection('wedding-media').onSnapshot()`. Le nuove foto appaiono automaticamente nella galleria senza refresh, con una transizione fluida (fade-in dei nuovi elementi).

3. **Pagina upload dedicata** — Una pagina `upload.html` separata, mobile-friendly, con UI semplificata pensata per smartphone degli ospiti: grande area di drop/click, campo nome obbligatorio, feedback visivo chiaro del progresso.

4. **QR code nel sito** — Sezione dedicata in `index.html` con QR code che punta a `upload.html`, da mostrare ai matrimoni su schermo/proiettore o stampare nei segnaposto.

**Priorità media:**

5. **Slideshow/projector mode** — Pagina a schermo intero (`slideshow.html`) che mostra le ultime foto caricate in tempo reale, pensata per essere aperta su un TV/proiettore durante il ricevimento. Transizioni cinematografiche (Ken Burns effect, crossfade), nessuna UI, solo foto.

6. **Filtro per "momenti"** — Tag opzionale al momento dell'upload: cerimonia / cocktail / cena / ballo. Permette di filtrare la galleria per momento della giornata.

7. **Download pack** — Pulsante admin per scaricare uno ZIP di tutti i media (via Cloud Function con Firebase Admin SDK).

**Priorità bassa (post-evento):**

8. **Lazy loading virtualizzato** — Per quando la galleria raggiungerà centinaia di foto, usare Intersection Observer per caricare le immagini solo quando entrano nel viewport, e smontare quelle fuori dal viewport.

9. **Video thumbnail** — Generare un frame di preview per i video caricati (richiede ffmpeg in Cloud Function, es. via Cloud Run).

**Stack consigliato (rimanere su statico):** Non serve Next.js. Il progetto può rimanere HTML/JS vanilla + Firebase SDK v9 modulare (non compat). L'aggiunta del modulo `firebase/firestore` e `firebase/storage` in stile ESM con `<script type="module">` è sufficiente e riduce il bundle. La complessità aggiuntiva di Next.js (build step, SSR, hydration) non porta benefici concreti per questo use case.

---

## AGGIORNAMENTO 2026-05-07 — Settimana 1 Completata

---

### Stato reale post-Week 1

#### 1. Hosting

- Sito statico HTML/CSS/JS deployato su **Firebase Hosting** (NON più GitHub Pages)
- Custom domain `andreagiulia5luglio26.it`: Connected ✅
- Custom domain `www.andreagiulia5luglio26.it`: Connected ✅
- HTTPS automatico via Firebase ✅
- Versione live: tag `v1.0-foundations` (12 commit dopo checkpoint)

#### 2. Backend

- Cloud Functions deployate: `verifyRecaptcha`, `submitRSVP`, `checkRateLimit`
- Runtime: Node.js 20 (⚠️ deprecation ottobre 2026 — va aggiornato)
- `submitRSVP` ora salva `ipHash` (SHA-256) invece di `ip` in chiaro per GDPR
- `checkRateLimit` ora funziona davvero (5 RSVP/IP/24h)

#### 3. Database

- Firestore rules deployate con: `delete: false` e `update: false` su entrambe le collection, create RSVP senza deadline temporale
- Collection `rsvp-confirmations`: campi aggiornati, include `ipHash`
- Collection `wedding-media`: struttura invariata, in attesa Settimana 2

#### 4. Sicurezza

- Ignore list Firebase estesa: `functions/`, `firestore.rules`, `CODEBASE_AUDIT.md`, file admin utility, test, scripts, docs **esclusi** dal deploy hosting
- `robots.txt` creato per non indicizzare pagine admin
- Link Admin nel footer reso discreto ma ancora visibile
- Custom domain ha SSL valido

#### 5. Frontend changes

- Bottone "Carica" sbloccato e visibile nella nav
- Feature flag temporale: upload aperto dal 4 luglio 2026 alle 18:00 fino al 19 luglio 2026 alle 23:59
- Modal "before" / "open" / "after" implementato
- Footer galleria semplificato (no contatti, layout pulito)
- Footer tagliato "Andrea & Giulia" (non più "Afanakavav")
- Bottone empty-state corretto (no icon-only su hover)
- Deadline RSVP rimossa dal testo

#### 6. Migrazione DNS effettuata

- DNS GitHub Pages (`185.199.x.153`) sostituiti con Firebase (`199.36.158.100`)
- Record TXT `hosting-site=matrimonio-andrea-giulia-2026` attivo
- CNAME `www` → `matrimonio-andrea-giulia-2026.web.app` attivo
- Email/PEC totalmente preservate (record MX, SPF, SRV, CNAME smtp/pop/etc.)
- GitHub Pages disconnesso dal dominio (sito vecchio resta accessibile via `afanakavav.github.io/matrimonio-andrea-giulia/` come backup)

---

### Pending per Settimana 2+

🟡 **Node.js 20 deprecation** — Cloud Functions runtime va aggiornato entro ottobre 2026. Non urgente ma da fare.

🟡 **firebase-functions package** outdated — aggiornare quando si tocca il backend.

🟢 **Live Gallery features** — da implementare:
- Pagina `/upload.html` dedicata mobile-first
- Compressione client-side (multi-resolution)
- Cloud Function `generaThumbnails` (triggered da Storage)
- Real-time `onSnapshot` in galleria
- Slideshow / Cinema Mode per proiettore
- Caption AI con Claude API
- Vision scoring per pre-filtro foto
- Dashboard admin moderazione (4 tab)
- QR code generator per tavoli

---

### Architettura aggiornata

Stack confermato (**NON usare Next.js, NON migrare a Supabase**):

| Layer | Tecnologia |
|---|---|
| Frontend | HTML/CSS/JS vanilla + Firebase SDK 9.23.0 compat |
| Backend | Cloud Functions Node.js 20 (firebase-admin) |
| Database | Firestore |
| Storage | Firebase Storage (per Settimana 2) |
| Realtime | Firestore listeners `onSnapshot` (per Settimana 2) |
| Hosting | Firebase Hosting con custom domain |
| AI | API Anthropic Claude (chiave da configurare in `functions/.env`) |

---

### Commit Settimana 1

| SHA | Messaggio |
|---|---|
| `a9af0c1` | ux: rimuovi deadline RSVP dal testo (form sempre aperto) |
| `d4ad7fa` | security: estendi firebase.json ignore list per non esporre file interni |
| `87ec434` | fix: bottone empty-state senza icona, hover blindato, fix stati visivi |
| `45c9679` | fix: hover bottone empty-state e centra footer galleria in colonna |
| `9e3fde0` | ux: rimuovi contatti dal footer gallery per privacy e focus visivo |
| `ed42183` | fix: sostituisci telefono personale con contatti Giulia e Andrea |
| `6b6f605` | fix: rate limiting RSVP con hash IP per privacy |
| `827a4e5` | fix: pulisci footer con info matrimonio corrette |
| `1f03459` | fix: link rotto upload.html in gallery.html ora porta a index con auto-trigger |
| `b2ef19c` | ux: link Admin discreto + robots.txt per non indicizzare pagine private |
| `ca470ab` | security: rimuovi deadline RSVP, blocca delete e update pubbliche |
| `e761ecb` | feat: feature flag temporale per upload con messaggi pre/post matrimonio |
| `1194f4c` | checkpoint: pre-live-gallery setup |

---

## AGGIORNAMENTO 2026-05-09 — Settimana 2 Giorno 4

### Cosa è stato fatto
- ✅ Cloud Function generateThumbnails sviluppata e deployata
- ✅ Pipeline server-side image processing testata end-to-end
- ✅ Sharp 0.34.5 integrato per resize JPEG con mozjpeg
- ✅ Schema Firestore wedding-media esteso (campi display_url, thumb_url, thumbs_generated_at)
- ✅ Service Account IAM configurato (Storage Admin + Eventarc Event Receiver)

### Cloud Functions live (4 total)
- verifyRecaptcha (callable v1, 256MB)
- submitRSVP (callable v1, 256MB)
- checkRateLimit (callable v1, 256MB)
- generateThumbnails (event-driven v2, 1024MB) ⭐ NEW

### Pending Settimana 2
- 🔴 Bug upload client: /upload.html fallisce con 403 storage/unauthorized
  Diagnosi: isolato a SDK JS uploadBytesResumable, NON infrastrutturale
  (verified: Admin SDK e Console UI scrivono Storage senza problemi)
- 🟢 QR code generator (Giorno 5)
- 🟢 Deploy preview channel + smoke test
- 🟢 Merge in main + tag v2.0-upload-redesign

### Test data cleanup
File di test rimossi dopo verifica:
- wedding-media/originals/Bacio.jpg
- wedding-media/display/Bacio.jpg
- wedding-media/thumbs/Bacio.jpg
