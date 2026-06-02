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

## AGGIORNAMENTO 2026-05-10 — Settimana 2 Giorno 3 (parziale)

### Bug upload client: status finale dopo 7 round di debug

**Status: BLOCCATO. Sospeso per evitare diminishing returns.**

### Cosa funziona (verified)
- Storage upload via Admin SDK Node.js ✅
- Storage upload via Firebase Console UI manuale ✅  
- Cloud Function generateThumbnails end-to-end ✅
- Anonymous Authentication (sign-in anonimo client) ✅
- Storage rules Playground simulator dice ALLOWED ✅
- API Key restrictions configurate (6 API: Firestore, Storage 
  for Firebase, Identity Toolkit, Token Service, Installations, 
  Firebase Rules) ✅

### Cosa NON funziona
- Upload via Firebase JS SDK 9.23.0 compat in browser
- Errore: 403 Forbidden / storage/unauthorized
- Comportamento: chunk "start" del protocollo resumable (POST a 
  /o?name=...) viene rifiutato dal server
- Response server: generic "Permission denied" senza detail rule

### Diagnosi accumulata (7 round)
1. CSP Web Workers (risolto)
2. contentType check nelle rules (rimosso)
3. uploadBytes vs uploadBytesResumable (single upload non bypassa 
   il protocollo HTTP scelto dall'SDK)
4. size check nelle rules (rimosso)
5. Anonymous Auth (abilitato + rules con request.auth != null)
6. API Key restrictions (aggiunto localhost referrer + Identity 
   Toolkit API + Cloud Storage for Firebase)
7. Rules pattern {allPaths=**} (Playground OK ma browser ancora 403)

### Ipotesi residue (da indagare in futuro)
- App Check enforcement implicitamente attivo (banner "Configure 
  App Check" in tutti gli screenshot Storage Console)
- CORS configuration del bucket (richiede gsutil per modifica, 
  non Firebase Console)
- Firebase JS SDK 9.23.0 + Anonymous Auth + Resumable upload 
  combinazione con edge case bug
- Configurazione "Sign in providers" o "OAuth consent screen" 
  Google Cloud Platform incompleta

### Decisione strategica
- Pausa debug per evitare diminishing returns
- Proseguire con Giorno 5 (QR code) che è feature indipendente
- Tornare al bug con mente fresca + ricerca esterna (StackOverflow, 
  Firebase GitHub Issues, Anthropic Claude)
- Workaround temporaneo possibile: rules wedding-media completamente 
  pubbliche (allow create: if true) durante test phase, con TODO 
  stringere prima del 5 luglio 2026

### File modificati durante Giorno 3
- upload.html (page client completa)
- upload-styles.css (UI completa con spinner CSS)
- upload-flow.js (logica completa, Anonymous Auth integrato)
- storage.rules (deployed con request.auth + {allPaths=**})
- firestore.rules (deployed con wedding-media schema)
- functions/index.js (generateThumbnails working)

### Backend Cloud Functions live (4 totali)
- verifyRecaptcha (callable v1)
- submitRSVP (callable v1)
- checkRateLimit (callable v1)
- generateThumbnails (event-driven v2) ✅ TESTATO

---

## AGGIORNAMENTO 2026-05-10 — Settimana 2 Giorno 5 COMPLETATO

### QR Code Generator (in area admin)

**Status: COMPLETATO ✅**

### File creati
- qr-print.html: pagina stampa con 12 QR per A4, bottone Stampa,
  generazione via qr-code-styling CDN
- admin-qr.html: pagina admin protetta da password con QR singolo
  + download PNG + link a qr-print.html + istruzioni stampa

### File modificati
- index.html: rimossa sezione "Condividi le tue foto" (era pubblica,
  spostata in admin)
- styles.css: classi QR conservate per riuso in admin-qr.html
- admin-hub.html: aggiunta card "QR Code Generator" (terza nella grid)
- admin-styles.css: fix sistemico bug `var(--secondary-color)` →
  `var(--primary-dark)` per bottoni hover (era invisibile)

### Bug fixati durante implementazione
1. CSP qr-print.html: aggiunto Google Fonts + `unsafe-inline` per
   script-src (basso rischio per pagina di stampa senza input)
2. Inline event handler `onclick` rimosso da bottone Stampa, sostituito
   con addEventListener
3. firebase-storage-compat mancante in admin-qr.html (richiesto da
   firebase-config.js)
4. AuthManagerSecure non istanziato in admin-qr.html (mancava script
   dedicato come admin-rsvp-script.js)
5. **BUG LATENTE SISTEMICO**: var(--secondary-color) non definita in
   admin-styles.css, causava bottoni hover invisibili in tutte le pagine
   admin (hub, rsvp, qr). Fixato globalmente sostituendo con
   --primary-dark (#3f5e52).

### Design choice
- Mantenuti ENTRAMBI i flussi: download PNG singolo + stampa 12 per A4
- Sposi possono scegliere strategia stampa più adatta (1 grande, 12
  pronti, custom layout via PNG)
- QR removed da home pubblica perché feature per gli sposi, non per
  ospiti

### Tecnologie usate
- qr-code-styling v1.6.0-rc.1 via CDN (no npm install)
- SVG output per qualità di stampa massima
- Logo AG centrale (images/Logo-QR-code.png) con errorCorrectionLevel 'H'
- Colore #5a7d6f (verde matrimonio coerente)

### Test effettuati
- ✅ qr-print.html: 12 QR generati, stampa A4 preview perfetta
- ✅ admin-hub.html: 3 card visibili (media, rsvp, qr)
- ✅ admin-qr.html: login funziona, QR visualizzato, download PNG, link
  stampa A4, logout
- ✅ Scansione mobile: telefono riconosce URL `andreagiulia5luglio26.it/upload.html`
- ✅ Bug sistemico bottoni hover fixato in tutte le pagine admin

### Status Settimana 2 (riepilogo)
- ✅ Giorno 1: Setup branch + audit
- ✅ Giorno 2: Schema Firestore + rules + env
- 🟡 Giorno 3: Upload page (UI 100%, backend bug — sospeso)
- ✅ Giorno 4: Cloud Function generateThumbnails
- ✅ Giorno 5: QR Code Generator ⭐ OGGI
- ⏳ Giorno 6: Deploy preview + smoke test
- ⏳ Giorno 7: Deploy produzione + merge + tag

---

## AGGIORNAMENTO 2026-05-11 — Settimana 2 Giorno 6 COMPLETATO

### Deploy preview channel + smoke test desktop + mobile

**Status: COMPLETATO ✅**

### Cosa è stato fatto
- Deploy preview channel `preview-giorno6` su Firebase Hosting (scadenza 7 giorni)
- Smoke test desktop: 6/10 test PASS (skip 4 upload, bug Giorno 3 noto)
- Smoke test mobile reale: PASS (homepage, nav, sezioni, RSVP UI, QR)
- Aggiunti favicon AG globalmente a tutte le 8 pagine HTML
- Aggiunto bottone "Torna alla home" in upload.html Step 2

### URL preview
- Channel: `preview-giorno6`
- URL: https://matrimonio-andrea-giulia-2026--preview-giorno6-20456ocf.web.app
- Scadenza: 2026-05-18

### Configurazione domini whitelist (procedura post-deploy preview)
Tutti i nuovi domini preview channel richiedono aggiunta whitelist in 3 posti:
1. Firebase Auth → Authorized Domains
2. Cloud Console → API Key (Browser key 8 ott 2025) → HTTP referrers
3. reCAPTCHA admin → Settings → Domains

Domini attualmente whitelistati:
- localhost, localhost:5000
- afanakavav.github.io
- andreagiulia5luglio26.it, www.andreagiulia5luglio26.it
- matrimonio-andrea-giulia-2026.web.app
- matrimonio-andrea-giulia-2026.firebaseapp.com
- matrimonio-andrea-giulia-2026--preview-giorno6-20456ocf.web.app

### Bug noti residui (NON bloccanti per produzione)
1. **Bug Giorno 3 (upload Storage 403)**:
   - Auth funziona, ma upload chunk start fallisce con storage/unauthorized
   - Riprodotto in preview environment (8° round confermato)
   - Ipotesi residue da indagare:
     a. CORS configuration del bucket Storage (gsutil)
     b. App Check enforcement implicitamente attivo
     c. JS SDK 9.23.0 + Anonymous Auth + Resumable upload edge case
   - Strategia: rimandare a giugno per test reali, MVP utilizzabile senza upload via Admin SDK come fallback

2. **reCAPTCHA "Invalid domain"**:
   - Domini aggiunti correttamente in reCAPTCHA admin
   - Propagazione lenta, potrebbe richiedere fino a 24h
   - Da riverificare domani prima del deploy produzione

3. **config.local.js 404**:
   - Atteso (file gitignored, override locale)
   - Console warning cosmetico, nessun impatto funzionale

### Status Settimana 2 (riepilogo aggiornato)
- ✅ Giorno 1: Setup branch + audit
- ✅ Giorno 2: Schema Firestore + rules
- 🟡 Giorno 3: Upload page (UI ok, backend bug noto)
- ✅ Giorno 4: Cloud Function generateThumbnails
- ✅ Giorno 5: QR Code Generator
- ✅ Giorno 6: Deploy preview + smoke test ⭐ OGGI
- ⏳ Giorno 7: Deploy produzione + merge in main + tag v2.0

### File modificati Giorno 6
- 7 file HTML: favicon AG aggiunto
- upload.html, upload-styles.css: bottone "Torna alla home"
- CODEBASE_AUDIT.md: questa sezione

---

## AGGIORNAMENTO 2026-05-14 — Mini-sessione bug fix

### Sessione 22:00-23:30 — Fix delete RSVP + prevenzione CSP

**Status: COMPLETATO ✅**

### Bug fix: delete RSVP funziona ora

**Problema**: il pannello admin-rsvp.html non poteva cancellare RSVP,
falliva con "Missing or insufficient permissions" perché Firestore
rules bloccano delete diretto da client (architettura scelta in Sett 1
per sicurezza).

**Soluzione**: Cloud Function callable `deleteRSVP`:
- Verifica password admin (env var ADMIN_PASSWORD)
- Cancella documento via Admin SDK con privilegi elevati
- Audit log automatico (Cloud Logging) con timestamp + name + email
- Errori HTTPS espressi: invalid-argument, permission-denied, not-found, internal

**Modifiche**:
- functions/index.js: nuova CF deleteRSVP (callable v1, 256MB)
- functions/.env: aggiunto ADMIN_PASSWORD=RindiFusi
- admin-rsvp-script.js: chiamata httpsCallable invece di delete diretto
- auth-manager-secure.js: salva password in sessionStorage dopo login,
  rimuove al logout
- admin-rsvp.html: aggiunto firebase-functions-compat.js SDK
- admin-rsvp.html: CSP aggiornato con *.cloudfunctions.net
- admin-qr.html + admin.html: CSP aggiornato preventivamente

**Cloud Functions live ora (5)**:
- verifyRecaptcha (callable v1)
- submitRSVP (callable v1)
- checkRateLimit (callable v1)
- generateThumbnails (event-driven v2)
- deleteRSVP (callable v1) ⭐ NUOVO

**Tech debt accettato**:
- Password admin in chiaro in 3 posti (auth-manager-secure.js,
  sessionStorage, functions/.env). Mitigations: HTTPS sempre,
  sessionStorage si svuota chiudendo tab, .env gitignored. Da fixare
  con Firebase Auth + custom claims in Sett 3.

### Bug noti residui (aggiornato)

1. **Upload Storage 403** (bug Giorno 3, 8 round falliti)
   - Status: ANCORA APERTO
   - Strategia: domani Giorno 7 — opzioni A/B/C da decidere col PM
     (ricerca esterna, CF proxy upload, workaround banner)

2. **reCAPTCHA V2/V3 mismatch architetturale**
   - Status: tech debt, funziona ma mismatch
   - 2 site key registrate: V2 (`6Lc8hOUr...`, usata in index.html)
     e V3 (`6Ler8mMs...`)
   - Da rivedere in Sett 3

### Test effettuati stasera
- ✅ Deploy CF deleteRSVP riuscito (us-central1, 256MB)
- ✅ Re-deploy preview channel preview-giorno6 (3 volte)
- ✅ Test browser: login admin → crea RSVP test → cancella → success
- ✅ Verifica console F12: nessun errore
- ✅ sessionStorage.getItem('adminPassword') returna 'RindiFusi'
  dopo login
- ✅ Documento sparito dalla UI lista admin

### Status Settimana 2 (aggiornato)
- ✅ Giorno 1-2: Setup + schema
- 🟡 Giorno 3: Upload page (UI ok, backend ancora bug)
- ✅ Giorno 4: Cloud Function generateThumbnails
- ✅ Giorno 5: QR Code Generator
- ✅ Giorno 6: Preview channel + smoke test
- ⏳ Giorno 7: Deploy produzione + merge + tag v2.0 ← DOMANI
- + Mini-sessione 14 mag: fix delete RSVP ⭐ OGGI

---

## AGGIORNAMENTO 2026-05-14 — Analisi strategica upload bug (post-fix delete RSVP)

### Sessione 22:35-23:00 — Ricerca esterna su Storage 403

**Status: ANALISI COMPLETATA ✅ — fix da eseguire domani Giorno 7**

### Diagnosi probabile: CORS misconfiguration sul bucket Storage

Dopo 8 round falliti nei giorni 9-10 maggio (rules permutate, Anonymous
Auth abilitato/disabilitato, API Key restrictions verificate, ecc.), la
ricerca esterna stasera ha identificato un pattern molto specifico che
corrisponde al nostro caso.

**Pattern descritto da Firebase community**:
- Bucket Cloud Storage ha CORS configurazione default (restrittiva,
  no cross-origin)
- Web app hostata su dominio diverso dal bucket (custom domain o
  preview channel)
- Browser fa preflight request che fallisce
- Errore generato dal SDK assomiglia a "storage/unauthorized" (403)
- Trae in inganno: NON è un problema di Storage rules

**Match con il nostro caso**:
- Bucket: gs://matrimonio-andrea-giulia-2026.firebasestorage.app
- Web app: andreagiulia5luglio26.it (prod) + preview channels web.app
- Errore: storage/unauthorized 403 anche con rules `allow read,write: if true`
- Conferma indiretta: nessuna modifica alle rules ha risolto in 8 round

### Confidenza diagnosi: 70-80%

Indicatori positivi:
- Pattern documentato in più tutorial recenti (2024-2025)
- Errore browser corrisponde ESATTAMENTE al sintomo
- Spiega perché rules permissive non hanno fixato (era altro problema)
- Spiega perché il problema appare solo con upload (non download)

Indicatori di incertezza:
- Bucket usa il nuovo formato `.firebasestorage.app` (non vecchio `.appspot.com`)
- La maggior parte dei tutorial usa formato vecchio
- Comportamento `gsutil` su bucket nuovo non testato direttamente

### Piano operativo Giorno 7 (domani mattina, 12 maggio)

#### Fase 1 — Test CORS hypothesis (~30 min)
1. Verifica installazione gsutil (Google Cloud SDK)
   - Se non installato: scarica da https://cloud.google.com/sdk/docs/install
   - Se Windows: usa installer GoogleCloudSDKInstaller.exe
2. Autentica: `gcloud auth login`
3. Set progetto: `gcloud config set project matrimonio-andrea-giulia-2026`
4. Crea file cors.json nella root del progetto con contenuto:

```json
[
  {
    "origin": [
      "https://andreagiulia5luglio26.it",
      "https://www.andreagiulia5luglio26.it",
      "https://matrimonio-andrea-giulia-2026.web.app",
      "https://matrimonio-andrea-giulia-2026.firebaseapp.com",
      "https://matrimonio-andrea-giulia-2026--preview-giorno6-20456ocf.web.app",
      "http://localhost:5000",
      "http://localhost"
    ],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": [
      "Content-Type",
      "Authorization",
      "Content-Length",
      "User-Agent",
      "x-goog-resumable",
      "x-goog-upload-protocol",
      "x-goog-upload-command",
      "x-goog-upload-content-length",
      "x-goog-upload-offset"
    ]
  }
]
```

5. Applica al bucket:
   `gsutil cors set cors.json gs://matrimonio-andrea-giulia-2026.firebasestorage.app`
6. Verifica applicato:
   `gsutil cors get gs://matrimonio-andrea-giulia-2026.firebasestorage.app`
7. Re-deploy preview se necessario (NO, modifiche CORS sono bucket-level)
8. Test upload nel preview URL admin /upload.html (Chrome incognito)
9. ✅ Se funziona: BUG RISOLTO. Procedi Fase 3.
10. ❌ Se fallisce: passa a Fase 2.

#### Fase 2 — Plan B: CF proxy upload (~60 min, solo se Fase 1 fallisce)
- Nuova Cloud Function HTTPS callable `uploadMedia`
- Riceve file via FormData
- Salva su Storage via Admin SDK (bypassa client JS SDK)
- Crea documento Firestore wedding-media
- Risponde con URL pubblici
- Limite: 32 MB per request (CF HTTP limit)
- Per video > 32MB: signed upload URL in Sett 3

#### Fase 3 — Deploy produzione (~30 min)
1. `git checkout main`
2. `git merge feature/upload-redesign --no-ff`
3. `git push origin main`
4. `firebase deploy --only hosting`
5. Smoke test produzione su andreagiulia5luglio26.it
6. `git tag -a v2.0-upload-redesign -m "Settimana 2: upload + QR + delete RSVP + Cloud Functions"`
7. `git push origin v2.0-upload-redesign`

#### Fase 4 — Documentazione + bilancio (~15 min)
- Update CODEBASE_AUDIT.md con esito fix CORS
- Update bug noti residui
- Bilancio Settimana 2 in chat con PM

### Probabilità complessiva chiusura Settimana 2 domani

- Fase 1 success rate: 70-80%
- Fase 2 (fallback) success rate: 95%
- Probabilità complessiva: ~95-99%

**In ogni scenario**, il deploy produzione di domani NON è bloccato
dall'upload bug. Se Fase 1+2 falliscono entrambe (~5% probabilità),
fallback è banner "Upload in arrivo, torna il 5 luglio" che permette
deploy con feature in standby.

### Note tecniche

**Perché CORS può presentarsi come 403 unauthorized?**

I browser eseguono preflight OPTIONS request prima di POST/PUT cross-origin.
Se il server (Cloud Storage) non risponde con header CORS validi
(Access-Control-Allow-Origin, ecc.), il browser annulla la request.

Il Firebase JS SDK riceve un errore generico di rete e lo wrappa come
`storage/unauthorized` (codice errore default per 403). Il messaggio
quindi confonde: sembra rules failure ma è CORS.

**Verifica diagnosi a posteriori**:
- Aprire DevTools → Network → tentativo upload
- Cercare OPTIONS request prima del POST
- Se OPTIONS ha status 403 o no CORS headers → conferma CORS
- Se OPTIONS è OK ma POST è 403 → è rules (improbabile dato che già
  testato `if true`)

### Riferimenti consultati
- flamesshield.com: "How to Fix CORS Errors in Firebase Storage" (Aug 2025)
- vinaysaurabh.dev: "Fixing the CORS error in Firebase Storage on web" (May 2025)
- agiratech.com: "How to Fix Firebase Storage CORS Issues Using gsutil" (Apr 2025)
- groups.google.com firebase-talk: thread storia analoga

---

## AGGIORNAMENTO 2026-05-14 — Setup gsutil completato (preparazione Giorno 7)

### Status: COMPLETATO ✅

### Cosa è stato fatto stasera tardi (23:00-23:30)
- ✅ Download Google Cloud SDK Windows installer
- ✅ Installazione in `C:\Users\frape\AppData\Local\Google\Cloud SDK`
- ✅ `gcloud auth login` riuscito con francesco.perone00@gmail.com
- ✅ Progetto default settato: matrimonio-andrea-giulia-2026
- ✅ Verifica finale: gcloud 568.0.0, gsutil 5.37, config OK

### Comandi pronti per il Giorno 7

**Opzione consigliata (gsutil legacy, più documentato)**:
```
cd C:\Users\frape\matrimonio-sito
gsutil cors set cors.json gs://matrimonio-andrea-giulia-2026.firebasestorage.app
gsutil cors get gs://matrimonio-andrea-giulia-2026.firebasestorage.app
```

**Opzione moderna (gcloud storage, raccomandato da Google)**:
```
cd C:\Users\frape\matrimonio-sito
gcloud storage buckets update gs://matrimonio-andrea-giulia-2026.firebasestorage.app --cors-file=cors.json
gcloud storage buckets describe gs://matrimonio-andrea-giulia-2026.firebasestorage.app --format="value(cors_config)"
```

Nota: gsutil mostra warning "deprecated" ma funziona normalmente.
Decidere quale usare domani in base alla preferenza (gsutil è
documentato in più tutorial, gcloud storage è il futuro).

### Stato config gcloud locale

```
[core]
account = francesco.perone00@gmail.com
disable_usage_reporting = True
project = matrimonio-andrea-giulia-2026
```

### Fase 1 e 2 del Giorno 7 (aggiornato)

~~Fase 2 — Setup gsutil (20-30 min)~~ ✅ FATTO STASERA

**Nuovo piano Giorno 7 (più snello, ~1h 30min totali)**:
1. Pre-flight (5 min) — `git pull origin feature/upload-redesign`
2. Fix CORS (15 min) — `gsutil cors set ...` + verifica
3. Test upload preview (15 min) — Chrome incognito + upload reale
4. Plan B se fallisce (60 min) — CF proxy upload
5. Deploy produzione (30 min) — merge main + firebase deploy
6. Tag v2.0 + bilancio (15 min)

### Risparmio tempo stimato per domani

- 25 minuti risparmiati (setup gsutil non più necessario)
- Probabilità chiusura Settimana 2 domani: invariata 95-99%

---

## AGGIORNAMENTO 2026-05-15 — Settimana 2 COMPLETATA ✅

### Giorno 7 — Deploy produzione + chiusura Settimana 2

**Status: COMPLETATO ✅ — Tag v2.0-upload-redesign**

### Cronologia operativa (15 maggio 2026)

**16:47-17:00** — Pre-flight pomeridiano
- git fetch + status pulito
- gsutil + gcloud verificati attivi
- preview-giorno6 attivo fino al 21 mag
- cors.json validato

**17:01-17:10** — Fase 2: Fix CORS bucket Storage
- gsutil cors get → bucket aveva NO CORS configuration (diagnosi confermata)
- gsutil cors set cors.json → applicato
- gsutil cors get → 7 origin + 5 method + 9 header attivi

**17:10-17:30** — Fase 3: Test upload preview (PRIMA con CORS soltanto)
- Upload ancora 403, sintomo identico ma causa diversa
- Ricerca CORS era CORRETTA ma INCOMPLETA: c'era anche un bug client

**17:30-17:55** — Fase 3.5: DIAGNOSI VERA del bug Giorno 3
- Lettura codice + rules end-to-end
- TROVATO: upload-flow.js usava path `originals/`, `display/`, `thumbs/` SENZA prefisso `wedding-media/`
- Storage rules richiedono `wedding-media/{allPaths=**}` → 403 silenzioso
- Cloud Function generateThumbnails già ascolta `wedding-media/originals/`
- Strategia A: client uploada SOLO wedding-media/originals/, CF genera display+thumbs

**17:55-18:10** — Fix Strategia A
- Rimosse 17 righe da upload-flow.js (compressione client + 2 upload display/thumbs)
- Fixato schema mismatch gallery-script.js (fileType→file_type, downloadURL→display_url)
- Commit + push

**18:10-18:30** — Test E2E preview definitivo
- Upload reale foto: ✅ SUCCESS
- Galleria: ✅ foto visibile
- Modal: ✅ versione display caricata
- Firestore: ✅ document corretto con display_url/thumb_url popolati dalla CF

**18:30-18:50** — Deploy produzione
- git checkout main + merge feature/upload-redesign --no-ff
- git push origin main
- firebase deploy --only hosting → live su andreagiulia5luglio26.it

**18:50-19:00** — Smoke test produzione
- Homepage, upload reale, galleria, admin: ✅ 5/6 pass
- 2 bug minori trovati: admin-script schema (TypeError null) + nav menu galleria nascosta

**19:00-19:50** — Fix admin-script.js + index.html
- 15 occorrenze fileType/downloadURL sostituite in admin-script.js
- Rimossa class nav-hidden da index.html, aggiunte emoji 📸 🖼️
- Push + re-deploy hosting

**19:50-20:20** — Fix admin operations (delete media + favorites)
- 2 nuove Cloud Functions: deleteMedia (cancella 3 file Storage + Firestore) + toggleFavorite
- admin-script.js: chiamate dirette Storage/Firestore → httpsCallable CF
- admin.html: SDK firebase-functions-compat aggiunto
- Deploy functions + hosting
- Smoke test: delete singolo + favorite ✅, deleteSelected (batch) ancora KO → tech debt Sett 3

**20:20-...** — Tag v2.0 + chiusura

### Cloud Functions live (7 totali)
1. verifyRecaptcha (Sett 1)
2. submitRSVP (Sett 1)
3. checkRateLimit (Sett 1)
4. generateThumbnails (Sett 2 G4)
5. deleteRSVP (Sett 2 Mini 14 mag)
6. deleteMedia ⭐ NUOVA (Sett 2 G7)
7. toggleFavorite ⭐ NUOVA (Sett 2 G7)

### Numeri Settimana 2
- Giorni di lavoro effettivi: 7 (1-2 mag setup, 8-10 mag dev, 11 mag preview, 14 mag fix, 15 mag deploy)
- Giorni di pausa: 3 (martedì-mercoledì-giovedì)
- Commit nel branch: ~25
- Cloud Functions nuove: 4
- Bug critici risolti: 1 (Giorno 3, 8 round)
- Bug minori risolti: ~10
- File nuovi: 11+ (cors.json, qr-print, admin-qr, upload, ecc.)
- Righe codice aggiunte: +3635 (da diff merge)

### Tech debt esplicito per Settimana 3
1. **Feature uploader_name visibile** in admin media (richiesta utente 15 mag sera)
2. **Filtri admin per uploader_name** (richiesta utente 15 mag sera)
3. **deleteSelected (batch)** migrazione a CF (riuso deleteMedia in loop)
4. **reCAPTCHA V2/V3 mismatch**: documentare/risolvere
5. **Password admin hardcoded**: migrare a Firebase Auth + custom claims
6. **gallery-script.js status filter**: aggiungere quando moderazione attiva
7. **compressImage()** dead code in upload-flow.js (Strategia A delega tutto a CF)
8. **Merge commit "A A A" cosmetico** in git history (lasciare, force-push non vale)

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations, 7 maggio)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign, 15 maggio) ⭐ OGGI
- 📋 Sett 3 (16-22 mag): Moderazione admin + AI scoring + feature uploader_name
- 📋 Sett 4-5 (23-31 mag, compressed): Live page + AI Storyteller + Janitor
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE
- 📋 2 giugno - 4 luglio: Test reali con amici + polish finale
- 🎉 5 luglio: matrimonio Andrea & Giulia

---

## AGGIORNAMENTO 2026-06-02 (Pattern D) — Settimana 5 Giorno 1 — Pattern D COMPLETO ✅ SET 5 PATTERN COMPLETO

**Sessione:** stessa giornata, Fase 2 della sessione (dopo checkpoint + pausa post-Fase 2)
**Tag:** `v3.10-cinema-pattern-d`
**Deploy:** hosting + functions:telegramWebhook

**LAVORO COMPLETATO (Pattern D Particle Burst — Photo Explosion):**

### Decisioni (OK 1-5):
- 1C: Photo Explosion (foto esplodono dal centro a ondate)
- 2C: ritmo raffica + pausa
- 3A: scale + scatter + rotazione
- 4A+4B: niente caption, ma featured grande + glow
- 5A: sfondo nero

### Task 6.1 — Foundation (commit d39b5ce, +198 righe engine+CSS)
- registerPattern("burst"): init→scheduleWave→spawnPhoto→cleanup
- CONFIG iniziale, CSS sfondo nero + burstExplode keyframe + featured glow
- Test visivo locale OK (override temporaneo)

### Task 6.2 — Tuning visivo (commit 86ac632)
- Post test: BURST_INTERVAL 280→450, WAVE_PAUSE 2200→3200, PHOTO_LIFETIME 3500→5500, MAX_ON_SCREEN 12→8
- Foto più grandi: normali clamp 220-500px, featured clamp 300-680px
- Re-test locale OK

### Task 6.3 — VALID_MODES + deploy + E2E (commit 7e23f2c)
- VALID_MODES += "burst" (5 mode totali)
- Deploy hosting + functions:telegramWebhook
- E2E 7/7 PASS: /mode burst OK, indicatore "burst", esplosione+ritmo, featured glow, /mode help (5 mode), cleanup, B3 regression

**Commit (3):** d39b5ce foundation + 86ac632 tuning + 7e23f2c VALID_MODES

**🎯 SET COMPLETO 5 PATTERN:** Petali, Polaroid, Cinema, Scrapbook, Burst — tutti live e switchabili via Telegram.

**Note metodologiche:**
- Opzione B (2 task/sessione): Pattern E completamento + Pattern D completo — entrambi chiusi in 1 giornata
- Pattern D foundation era già quasi-completo (concept tutto implementato) → completamento veloce
- Tuning visivo post-test: 3 iterazioni parametri (ritmo/dimensioni/durata) prima del deploy
- Override gestito con disciplina (mai committato)
- Giornata: 3 milestone (Fase 2 chiusa + Pattern D foundation + Pattern D completo)

### Tech debt — update

CHIUSI:
- 🔴 Pattern D Particle Burst → CHIUSO ✅ (set 5 pattern completo)

RESIDUI MINORI (invariati):
- 🟡 .scrapbook-photo.with-corner satura ::before+::after
- 🟡 Drift cliché aiStoryteller ~6.7%
- 🟡 captionTimer Pattern C no-op
- 🟡 Node 20 deprecation (ott 2026, post-matrimonio)

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Polish + stress test pipeline produzione (carico 20-30 foto, performance) — chiude Fase 3
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

### Prossimi task

FASE 3 (completamento):
1. **Stress test pipeline produzione** — carico 20-30 foto reali, performance pool grande con tutti i 5 pattern, identificare bug latenti → chiude Fase 3

FASE 4:
2. **archive.html** (~5-7h) — vista permanente sposi post-matrimonio
3. **Setup Telegram A1 sposi** (~15-20 min, 1 settimana pre-matrimonio)

---

## AGGIORNAMENTO 2026-06-02 — Settimana 5 Giorno 1 (martedì) — Pattern E COMPLETO ✅ CHIUDE FASE 2

**Sessione:** 08:00 → ~09:30 (~1h30 lavoro tecnico, Fase 1 della sessione)
**Tag:** `v3.9-cinema-pattern-e` (Fase 2 Step 4 — Pattern E completamento)
**Deploy:** hosting + functions:telegramWebhook
**Apertura:** dopo 5 giorni di pausa dal progetto (28 mag → 2 giu)

**LAVORO COMPLETATO (Pattern E completamento):**

### Decisioni page-flip 3D (OK 1-5):
- 1A: rotateY (sfoglio orizzontale)
- 2B: durata 1.8s (lento, mood epilogo)
- 3B: rotazione + ombra dinamica
- 4A: prima pagina fade, successive flip
- 5B: transform-origin left (dorso album sinistro)

### Task 5.1 — Page-flip 3D + polish caption (commit bfb2803)
- transitionToPage sostituita: fade → page-flip 3D (flip-out rotateY 0→-100deg, flip-in rotateY 95→0deg con delay 0.9s)
- CSS: perspective 1200px, transform-style preserve-3d, backface-visibility hidden, transform-origin left
- 2 keyframes: scrapbookFlipOut + scrapbookFlipIn con ombra dinamica
- Polish caption: margin-top 2vh→0.5vh, gap→1.5vh 4vw, padding 6vh→4vh
- SOLO transitionToPage modificata (composePage/showNextPage/init/cleanup intatti)
- Test visivo locale (override temporaneo + firebase serve): page-flip confermato al primo colpo, zero tuning
- Override scartato con git checkout

### Task 5.2 — VALID_MODES + deploy + E2E (commit 04d2612)
- VALID_MODES += "scrapbook" + VALID_MODES_DESC entry
- Deploy hosting + functions:telegramWebhook
- Test E2E 7/7 PASS in produzione:
  - /mode scrapbook switch OK
  - **Indicatore mode mostra "scrapbook"** (risolto tech debt: in locale mostrava "petali" per bypass switchMode, in produzione corretto)
  - Page-flip 3D OK, caption handwriting OK, /mode help OK, cleanup OK, B3 regression OK

**Commit della sessione (2):**
- `bfb2803` feat(week5): Pattern E page-flip 3D + polish caption
- `04d2612` feat(week5): VALID_MODES include scrapbook

**🎯 FASE 2 COMPLETA:** 5 pattern visivi (Petali/Polaroid/Cinema/Scrapbook) + AI Storyteller, tutti switchabili real-time via Telegram.

**Note metodologiche:**
- Patto operativo: Pattern E completamento PRIMA di Pattern D — rispettato
- Velocità: ~1h30 vs stima 3-4h — sotto stima ~55%
- Page-flip 3D al primo colpo, zero iterazioni tuning (spec precisa + lezione prompt sintetici)
- Override temporaneo gestito con disciplina (marcato NON COMMITTARE, scartato, mai committato)

### Tech debt — update

CHIUSI:
- 🟡 Indicatore mode Pattern E → CHIUSO (verifica E2E: mostra "scrapbook" in produzione) ✅
- 🟡 Caption distante dalle foto → CHIUSO (polish: avvicinata) ✅
- 🔴 Pattern E completamento → CHIUSO, Fase 2 completa ✅

RESIDUI MINORI:
- 🟡 .scrapbook-photo.with-corner satura ::before+::after (no decoratori aggiuntivi futuri stesso elemento)
- 🟡 Drift cliché aiStoryteller ~6.7% (monitorare durante uso reale)
- 🟡 captionTimer Pattern C no-op innocuo
- 🟡 Node 20 deprecation (deadline ott 2026, dopo matrimonio — ignorabile)

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Pattern D Particle Burst Mosaic (Fase 3) — ~6-8h
- Polish + stress test pipeline produzione
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

### Prossimi task

FASE 3:
1. **Pattern D Particle Burst Mosaic** (~6-8h) — pattern epico per momenti chiave. OGGI: solo foundation.
2. **Polish + stress test pipeline produzione** (carico 20-30 foto, performance pool grande)

FASE 4:
3. **archive.html** (~5-7h) — vista permanente sposi post-matrimonio
4. **Setup Telegram A1 sposi** (~15-20 min, 1 settimana pre-matrimonio)

---

## AGGIORNAMENTO 2026-05-28 (pomeriggio) — Settimana 4 Giorno 3 sessione Pattern E foundation 🟡 WIP

**Sessione:** 16:00 → ~18:20 (~2h20 lavoro tecnico effettivo)
**Commit:** d15bdb3 (foundation) + 2f10d7c (fix fade-in)
**NO TAG:** Pattern E è FOUNDATION incompleta (page-flip 3D + deploy rimandati). Tag v3.9-cinema-pattern-e quando completo.
**Deploy:** NESSUNO (foundation testata solo in locale via firebase serve)

**LAVORO COMPLETATO (Pattern E Scrapbook Vivente — FOUNDATION):**

### Decisioni di design (OK 1-7):
- 1C: 2-4 foto random per pagina
- 2C: mix fissaggio (scotch washi / puntine / angolini fotografici)
- 3A: font handwriting Dancing Script
- 4B: rotazione ±10°
- 5B: 1 frase handwriting per pagina (dalla featured)
- 6A: transizione fade placeholder (page-flip 3D rimandato a prossima sessione)
- 7B: ~35 sec per pagina

### Task 4.1 — Implementazione foundation (commit d15bdb3)
- **live-cinema-engine.js:** +154 righe — registerPattern("scrapbook", {...})
  - CONFIG: PAGE_DURATION=35000, MIN/MAX_PHOTOS_PER_PAGE=2/4, ROTATION_MAX=10, TAPE_STYLES mix
  - showNextPage → composePage → transitionToPage (ISOLATA per sostituzione page-flip 3D futura)
  - pick-N foto distinte via loop+retry (pickWeightedRandom accetta 1 solo excludeId)
  - caption handwriting solo per featured con aiStory
- **live-cinema-styles.css:** +122 righe — sfondo carta avorio, polaroid incollate (.with-tape/.with-pin/.with-corner), Dancing Script caption, rotazioni, responsive
- Font Dancing Script già caricato in live-cinema.html L10 (no @import necessario)
- normalizeDoc già esponeva aiStory (no modifica)
- 5 verifiche post-compaction OK

### Task 4.2-4.5 — Test visivo locale + bug trovato e fixato
- Override temporaneo mode "scrapbook" per test locale (firebase serve), NON committato
- **BUG TROVATO:** Pattern E mostrava solo sfondo, foto invisibili (opacity 0)
- Diagnosi via log DEBUG: composePage riceveva foto correttamente (4 foto, featured OK), ma DOM invisibile
- **ROOT CAUSE:** classe `.fade-in` confliggeva con `.visible` (identica specificità 0,2,0, source order: .fade-in dichiarata dopo → opacity:0 vinceva permanentemente)
- **FIX (commit 2f10d7c):** rimossa classe "fade-in" da composePage className (la classe base .scrapbook-page-content ha già opacity:0 + transition, .fade-in era ridondante e conflittuale)
- **Validazione visiva:** Pattern E renderizza correttamente — carta avorio, polaroid con puntina/angolini, rotazione, caption Dancing Script ("Lei ride e lui dimentica persino il nome delle sue paure")
- Override scartato con git checkout (working tree pulito)

**Nota cosmetica (non bug):** durante test con override, indicatore mode mostrava "petali" perché override bypassa switchMode (che aggiorna l'etichetta). In produzione switchMode girerà normalmente. Da ri-verificare nel test E2E reale.

**Commit della sessione (2):**
- `d15bdb3` wip(week4): Pattern E Scrapbook Vivente foundation (placeholder fade, page-flip 3D + deploy rimandati)
- `2f10d7c` fix(week4): Pattern E foundation — rimuove classe fade-in che confliggeva con visible

**Note metodologiche:**
- Patto operativo: scope foundation only, NO page-flip 3D, NO deploy, NO tag — rispettato
- Pausa 17:45 SALTATA (dentro debug) — lezione: fermarsi anche a metà debug
- Confusione Pattern C vs E durante re-test (override non ri-aggiunto) — sintomo stanchezza ~6h lavoro, colta e corretta
- Test visivo locale via firebase serve + override temporaneo: workflow utile per validare pattern senza deploy
- Bug opacity da conflitto CSS source-order: classico bug senza errori console (CSS+JS validi, risultato sbagliato)

### Tech debt — update

NUOVI tech debt:
- 🟡 MINORE — Pattern E: layout caption distante dalle foto (molto spazio vuoto verticale). Da stringere prossima sessione.
- 🟡 MINORE — Pattern E: .scrapbook-photo.with-corner usa già ::before + ::after, no spazio per decoratori aggiuntivi futuri sullo stesso elemento.
- 🟡 DA VERIFICARE — indicatore mode con Pattern E: confermare che mostri "scrapbook" in produzione (test con override mostrava "petali" per bypass switchMode).

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Pattern E COMPLETAMENTO (page-flip 3D + VALID_MODES "scrapbook" + deploy + test E2E + polish) — ~3-4h rimanenti
- Pattern D Particle Burst Mosaic (Fase 3) — ~6-8h
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

### Prossimi task (priorità invariata)

PRIORITÀ ALTA — completamento Fase 2:
1. **Pattern E COMPLETAMENTO** (~3-4h):
   - Sostituire transitionToPage (fade) con page-flip 3D animation
   - VALID_MODES += "scrapbook" + VALID_MODES_DESC
   - Deploy hosting + functions:telegramWebhook
   - Test E2E completo (/mode scrapbook, verifica indicatore, cleanup, B3 regression)
   - Polish layout caption + decorazioni
   - Tag v3.9-cinema-pattern-e → CHIUDE FASE 2

POI Fase 3:
2. **Pattern D Particle Burst Mosaic** (~6-8h)
3. **Polish + stress test pipeline produzione**

POI Fase 4:
4. **archive.html** (~5-7h)
5. **Setup Telegram A1 sposi** (~15-20 min, 1 settimana pre-matrimonio)

---

## AGGIORNAMENTO 2026-05-28 (refinement aiStoryteller) — Settimana 4 Giorno 3 sessione post-pausa ✅

**Sessione:** 08:30 → ~09:35 (~1h05 lavoro tecnico effettivo)
**Tag:** `v3.8.1-cinema-pattern-c-hotfix` (primo hotfix del progetto)
**Deploy:** functions:aiStoryteller × 2 (1 per fix sintomo, 1 per root cause)

**LAVORO COMPLETATO:**

### Test diagnostico esteso (Opzione A)
- Toggle favorite=true su 2 foto featured-able mai marcate
- Generate 10 nuove frasi (5 per foto) via CF aiStoryteller
- Bug scoperto: 50% delle frasi (2 foto su 4 contando ieri) contengono numerazione "1.", "2." dentro la stringa
- Sample analysis: 15 frasi nuove oggi, 1 cliché vietato ("eternità") = 6.7% sotto soglia 10% → accettato

### Fix #1 — Rimozione ambiguità placeholder JSON (commit 54c9231)
- Modificato OUTPUT FORMATO JSON: "frase 1", "frase 2"... → "..."
- Aggiunto safety net esplicito: "LE STRINGHE NON DEVONO CONTENERE NUMERI PROGRESSIVI"
- Test validazione: 5/5 frasi pulite su 1 foto

### Fix #2 — Rimozione causa radice (commit f846acf)
- Diagnosi PM: 2 istruzioni contraddittorie nel prompt
  - r.912: "Esattamente 5 frasi, numerate 1-5" (forzava numerazione)
  - r.920: "LE STRINGHE NON DEVONO CONTENERE NUMERI" (vietava numerazione)
- Modifica: "numerate 1-5" → "5 frasi distinte"
- Test validazione: 5/5 frasi pulite su 1 foto + 0 cliché su sample
- Prompt ora internamente coerente

**Decisione PM strategica:**
- Bug numerazione (50% drift): refinement obbligatorio ✓
- Cliché vietati (6.7% drift): sotto soglia 10%, accettato (no refinement)

**Commit della sessione (2):**
- `54c9231` fix(week4): aiStoryteller prompt — rimuove ambiguita placeholder che causava numerazione
- `f846acf` fix(week4): aiStoryteller prompt — rimuove causa radice (regola 'numerate 1-5' contraddittoria con safety net)

**Note metodologiche:**
- Patto operativo rispettato: refinement only, no Pattern E
- Velocità: ~1h05 vs stima 55min-1h10 (in linea)
- Process learning consolidato: LLM prompt — istruzioni contraddittorie si combinano in modo imprevedibile, fix richiede ambiguità rimossa + safety net (belt and suspenders)
- Sample testing 15 frasi > test 1 foto sola: importante per scoprire pattern strutturali

**Velocità totale giornata 2026-05-28 (Pattern C + refinement):**
- Pattern C: 06:00 → 07:55 = ~1h45 (stima 5-6h, sotto stima 70%)
- Refinement: 08:30 → 09:35 = ~1h05 (stima 55min-1h30, in linea)
- **Totale giornata: ~2h50 per Pattern C + hotfix completi**

### Tech debt — update

CHIUSI:
- 🟡 MINORE — Drift cliché aiStoryteller ("destino" in 1 frase su 5) → CHIUSO con decisione PM: sotto soglia 10%, accettato

NUOVI tech debt:
- 🟡 MINORE — Drift residuo cliché ~6.7% (es. "eternità"). Da monitorare se peggiora durante uso reale matrimonio. Threshold attuale: <10% accettato.

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Pattern E Scrapbook Vivente (Fase 2 Step 4) — ~5-7h (ultimo pattern Fase 2)
- Pattern D Particle Burst Mosaic (Fase 3) — ~6-8h
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

### Prossimi task (priorità invariata)

PRIORITÀ ALTA — chiusura Fase 2:
1. **Pattern E Scrapbook Vivente** (~5-7h) — ultimo pattern Fase 2

POI Fase 3:
2. **Pattern D Particle Burst Mosaic** (~6-8h)
3. **Polish + stress test pipeline produzione**

POI Fase 4:
4. **archive.html** (~5-7h)
5. **Setup Telegram A1 sposi** (~15-20 min, 1 settimana pre-matrimonio)

---

## AGGIORNAMENTO 2026-05-28 (mattina) — Settimana 4 Giorno 3 ✅

**Sessione:** 06:00 → ~08:00 (~1h45 lavoro tecnico effettivo)
**Tag:** `v3.8-cinema-pattern-c` (Fase 2 Step 3 — Pattern C Cinema Letterbox)
**Deploy:** hosting + functions:telegramWebhook

**LAVORO COMPLETATO OGGI MATTINA:**

### Task 3.1 — Diagnostica pre-Pattern C
- normalizeDoc esistente: ai_story NON ancora mappato (da aggiungere)
- Pattern A/B cleanup: pattern simmetrico identificato
- Schema Firestore ai_story verificato manualmente su doc reale: Array 5 stringhe ✓
- CSS scope strategy confermata: .cinema-stage.pattern-XXX

### Task 3.2 — Pattern C implementazione (commit 418f004)
- **normalizeDoc:** +1 riga (aiStory = Array.isArray(d.ai_story) ? d.ai_story : [])
- **live-cinema-engine.js:** +149 righe (registerPattern("cinema", {...}))
  - Config: DURATION_NORMAL=16000, DURATION_FEATURED=20000, CAPTION_DURATION_RATIO=0.80
  - 5 transizioni cinema: TRANSITIONS = ["fade", "slide-left", "dip-to-black", "iris-out", "crossfade"]
  - Layout DOM: cinema-letterbox > cinema-bar top + cinema-frame + cinema-bar bottom (con cinema-caption)
  - showNextFrame: pesca media + transition random + renderFrame + renderCaption
  - renderCaption: pesca 1 frase random da media.aiStory[] solo se featured
- **live-cinema-styles.css:** +194 righe (Pattern A/B intatti)
  - .pattern-cinema con background nero + letterbox 16:9
  - 10 @keyframes (5 enter + 5 exit per le 5 transizioni)
  - .cinema-caption con cinemaCrawl animation, --caption-duration variabile
  - Responsive mobile
- 5 verifiche post-compaction OK

### Task 3.3 — Deploy + smoke test E2E (8/8 PASS, commit 92c68e8)
- VALID_MODES esteso: ["petali", "polaroid", "cinema"]
- VALID_MODES_DESC: cinema description aggiunta
- Deploy hosting (2 file: engine + CSS) + deploy functions:telegramWebhook
- Test 1: setup live-cinema accessibile ✓
- Test 2: /mode cinema → switch visivo (letterbox + foto fullscreen + caption) ✓
- Test 3: transizioni diverse su 5-6 cambi consecutivi ✓
- Test 4: caption AI scorre su featured ✓
- Test 5: no caption su non-featured ✓
- Test 6: /mode help include cinema ✓
- Test 7: switch ritorno (cinema → polaroid) cleanup pulito, no leak ✓
- Test 8: B3 regression OK ✓

**Risultato strategico:** ai_story passa da "dato dormiente" a "esperienza visibile" per la prima volta. Pattern A → B → C tutti switchabili real-time via Telegram.

**Commit della sessione (2):**
- `418f004` feat(week4): Pattern C Cinema Letterbox + normalizeDoc espone aiStory
- `92c68e8` feat(week4): VALID_MODES include cinema (Pattern C)

**Note metodologiche:**
- Patto operativo rispettato: Pattern C only, no Pattern E oggi
- Velocità: ~1h45 vs stima 5-6h — sotto stima ~70% (record giornaliero)
- Driver: architettura modulare + prompt sintetico (process learning Sett 4 Giorno 2 sera consolidato)
- Verifiche post-compaction obbligatorie applicate, hanno funzionato

### Tech debt — update

CHIUSI:
- 🔴 ALTO — Pattern C Cinema Letterbox (consuma ai_story) → CHIUSO Fase 2 Step 3 ✅

NUOVI tech debt:
- 🟡 MINORE — captionTimer dichiarato in Pattern C ma mai assegnato (renderCaption non lo usa, caption auto-conclude via CSS animation). clearTimeout(captionTimer) nel cleanup è no-op innocuo. Da rimuovere o collegare se si vorrà clear anticipato caption in futuro.

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Pattern E Scrapbook Vivente (Fase 2 Step 4) — ~5-7h (ultimo pattern Fase 2)
- Pattern D Particle Burst Mosaic (Fase 3) — ~6-8h
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

### Prossimi task

PRIORITÀ ALTA — chiusura Fase 2:
1. **Pattern E Scrapbook Vivente** (~5-7h) — ultimo pattern Fase 2
2. (eventuale refinement prompt aiStoryteller per cliché drift — vedi sessione 28 mag 09:00-10:00)

POI Fase 3:
3. **Pattern D Particle Burst Mosaic** (~6-8h)
4. **Polish + stress test pipeline produzione**

POI Fase 4:
5. **archive.html** (~5-7h)
6. **Setup Telegram A1 sposi** (~15-20 min, 1 settimana pre-matrimonio)

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign)
- ✅ Sett 3: DONE (tag v3.0 → v3.4)
- 🟢 Sett 4: IN CORSO
  - ✅ Giorno 1 mar 26 mag: Live Cinema foundation + Pattern A Petali (v3.5)
  - ✅ Giorno 2 mer 27 mag: Pattern B Polaroid (v3.6) + AI Storyteller CF (v3.7)
  - ✅ Giorno 3 gio 28 mag: Pattern C Cinema Letterbox (v3.8) ⭐ OGGI
  - 📋 Giorno 4+: Pattern E Scrapbook Vivente (Fase 2 Step 4)
- 📋 Sett 5: Pattern D Particle Burst + archive.html + Stage Mode
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE
- 🎉 5 luglio: matrimonio Andrea & Giulia

---

## AGGIORNAMENTO 2026-05-27 (sera) — Settimana 4 Giorno 2 sessione pomeriggio ✅

**Sessione:** 18:00 → ~19:30 (~1h30 lavoro tecnico effettivo)
**Tag:** `v3.7-cinema-ai-storyteller` (Fase 2 Step 2 — AI Storyteller CF)
**Deploy:** functions:aiStoryteller (CF NUOVA #12)
**Apertura:** sessione fresh (nuova chat post-pausa pranzo, Opzione 4 sessione mattina rispettata)

**LAVORO COMPLETATO OGGI POMERIGGIO (Task Fase 2 Step 2):**

### Task 2.0 — Diagnostica veloce stato post-pausa
- Letto ultime 2 entry CODEBASE_AUDIT.md (mercoledì mattina + martedì)
- Verificato stato git (HEAD 09b3222, 9 tag), 11 CF in produzione
- Confermato che aiPhotoCurator usa claude-sonnet-4-5 via REST diretto axios (no SDK)

### Brief decisioni AI Storyteller (5 decisioni "OK 1-5"):
- 1B: claude-sonnet-4-6 (più recente di aiPhotoCurator)
- 2A: trigger solo su favorite=true transition
- 3B: idempotente (skip se ai_story già presente)
- 4A: esattamente 5 frasi
- 5A: solo italiano

### Task 2.4 — Diagnostica aiPhotoCurator pattern (per riuso)
- Pattern axios REST: GIA' presente, riusabile
- Helper image download: inline (no helper riusabile separato), riproduco lo stesso pattern
- ANTHROPIC_API_KEY in env: OK (lunghezza 108)
- Package: axios ^1.6.0, no @anthropic-ai/sdk (REST diretto)
- Pattern guard idempotenti: replicato
- Modello: aiPhotoCurator usa claude-sonnet-4-5, aiStoryteller userà claude-sonnet-4-6

### Task 2.5 — Implementazione aiStoryteller (commit 5a6ceed)
- +171 righe in functions/index.js (tra aiPhotoCurator e notifyNewMedia)
- 6 guard early-return (G1: favorite transit, G2: ai_story present, G3: display_url, G4: file_type, G5: API key)
- Download immagine da display_url (axios arraybuffer + base64)
- Chiamata claude-sonnet-4-6 Vision con prompt poetico strutturato
- Vincoli prompt: 5 frasi 8-15 parole italiano lirico, no parole banali (matrimonio/sposi/amore/destino/eternità/magia), no nomi propri
- Parser robusto: JSON.parse + regex fallback
- Validazione: filter stringhe non vuote + slice(0,5), tollera 3-5 frasi
- Update Firestore: ai_story[], ai_story_generated_at (serverTimestamp)
- aiPhotoCurator INTATTA, no doppio require, schema snake_case (5 verifiche post-compaction OK)

### Task 2.6 — Deploy + Smoke test E2E
- Deploy `firebase deploy --only functions:aiStoryteller`
- CF NUOVA creata (Successful create operation, 12 CF totali in produzione)
- Smoke test su 1 foto reale prod:
  - Toggle favorite=true via admin web
  - Cloud Run logs aiStoryteller: download (142KB) + chiamata Claude + 5 storie generate (success)
  - Firestore: ai_story array 5 stringhe + ai_story_generated_at timestamp
- **5 frasi generate qualità ECCELLENTE:**
  1. "I suoi occhi cercano i miei come fanno le radici con la terra."
  2. "Il vento complice scompiglia i capelli e riscrive il destino."  ← contiene "destino" (cliché minore vietato)
  3. "Chissà quanti autunni ancora ci resteranno da attraversare insieme."
  4. "Lei ride e lui dimentica persino il nome delle sue paure."
  5. "Qualcosa sta per accadere, o forse è già accaduto in silenzio."
- 1 violazione minore (cliché "destino" in frase 2): accettata, raffinazione rimandata se drift si ripete

**Commit della sessione (1):**
- `5a6ceed` feat(week4): aiStoryteller CF (5 frasi poetiche per featured, claude-sonnet-4-6)

**Note metodologiche:**
- Patto operativo rispettato: scope AI Storyteller only, niente Pattern C oggi
- Velocità: ~1h30 vs stima 2h35-3h15 — sotto stima ~50% (architettura modulare + pattern riuso aiPhotoCurator + prompt sintetico)
- **Process learning nuovo:** prompt sintetici Claude Code (architettura definitiva, non implementazione prescrittiva) risparmiano 30-50% del tempo quando Claude Code ha già il contesto in flow. Da consolidare per prossime sessioni.
- 5 verifiche post-compaction obbligatorie applicate, hanno funzionato
- Sessione "fresh chat post-pausa pranzo" pattern operativo confermato vincente

**Tech debt — update:**

CHIUSI:
- 🟡 MEDIO — AI Storyteller CF (prerequisito Pattern C) → CHIUSO Fase 2 Step 2 ✅

NUOVI tech debt:
- 🟡 MINORE — Prompt aiStoryteller può drift sui cliché vietati (es. "destino"). Da monitorare durante sviluppo Pattern C.
- 🟡 MINORE — Modelli AI fra CF non allineati: aiPhotoCurator usa claude-sonnet-4-5, aiStoryteller usa claude-sonnet-4-6. Considerare upgrade aiPhotoCurator a 4-6 per consistenza (non bloccante, decisione futura).

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Pattern C Cinema Letterbox (Fase 2 Step 3) — ~5-6h, integra ai_story
- Pattern E Scrapbook Vivente (Fase 2 Step 4) — ~5-7h
- Pattern D Particle Burst Mosaic (Fase 3) — ~6-8h
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

**Prossimi task:**

PRIORITÀ ALTA (Fase 2 Step 3):
1. **Pattern C Cinema Letterbox** (~5-6h)
   - Layout: foto fullscreen + barre nere cinema 16:9
   - Caption crawl: pesca 1 frase random da ai_story, scorre lentamente sotto foto
   - Transizioni cinematografiche random (fade, slide, dip-to-black, iris-out, Ken Burns variation)
   - Mood: cena (20:00-22:00)
   - VALID_MODES estesi a ["petali", "polaroid", "cinema"]

POI Fase 2 Step 4:
2. **Pattern E Scrapbook Vivente** (~5-7h)

POI Fase 3:
3. **Pattern D Particle Burst** (~6-8h)
4. **Polish + stress test**

POI Fase 4:
5. **archive.html** (~5-7h)
6. **Setup Telegram A1 sposi** (~15-20 min, 1 settimana pre-matrimonio)

---

## AGGIORNAMENTO 2026-05-27 — Settimana 4 Giorno 2 (mercoledì mattina) ✅

**Sessione:** 12:25 → ~14:15 (~1h50 lavoro tecnico effettivo)
**Tag:** `v3.6-cinema-pattern-b` (Fase 2 Step 1 — Pattern B Floating Polaroids)
**Deploy:** functions:telegramWebhook + hosting

**Pre-task:** mini-update audit con addendum entry 2026-05-26 (deploy hosting Pattern A + checklist chiusura sessione)
- Commit `8381906`: docs(week4): addendum entry 2026-05-26

**LAVORO COMPLETATO OGGI (Task Fase 2 Step 1):**

### Task 2.1 — Diagnostica interfaccia Pattern A
- Confermata interfaccia `{init, cleanup}` di Pattern A
- Mappato context oggetto passato a patternFactory.create() — 5 proprietà disponibili 1:1 per Pattern B
- Identificate 6 dimensioni variation engine (riusabili)
- CSS strategy: `.cinema-stage.pattern-XXX` (classe sul stage, NON body[data-mode])
- 3 insight architetturali per Pattern B:
  1. NON modificare generateVariation engine (Pattern B implementa sub-variation interno)
  2. Cleanup gestisce Set dinamico (non array fisso come Pattern A)
  3. Confirm pattern naming: `.pattern-polaroid`

### Task 2.2 — Implementazione Pattern B (commit 5344ea6)
- **live-cinema-styles.css:** +135 righe in append (Pattern A intatto)
  - 3 keyframes: polaroidLifecycle, polaroidFloat, polaroidNewUploadPop
  - Tint filters riusati da Pattern A
  - Media query mobile (max-width: 767px) → 4 polaroid max
- **live-cinema-engine.js:** +130 righe TRA Pattern A e BOOTSTRAP
  - registerPattern("polaroid", {create(context){...}})
  - MAX_POLAROIDS=7, SPAWN_INTERVAL_MS=1800
  - Set tracker (activeTimers, activePolaroids) per cleanup symmetric
  - Slide-in dal bordo random (4 direzioni)
  - Drift exit verso direzione random
  - Rotation ±15° (più ampia di Pattern A che era ±3°)
  - Featured boost: scale 1.08 fisso, shadow più marcata, 15s vs 12s
  - New upload pop: polaroidNewUploadPop animation (scale 1.18→1.04→1.0)
- **functions/index.js:** VALID_MODES = ["petali", "polaroid"], VALID_MODES_DESC esteso
- 4 verifiche post-compaction OK: Pattern A intatto, Pattern B aggiunto, no smell Firestore, safety-net non toccato

### Task 2.3 — Deploy + Smoke test E2E (6/6 PASS)
- Deploy functions:telegramWebhook (VALID_MODES esteso)
- Deploy hosting (2 file: live-cinema-engine.js, live-cinema-styles.css)
- **Test 1:** setup live-cinema in incognito, Pattern A attivo da default ✓
- **Test 2:** /mode polaroid via Telegram → switch visivo a Pattern B confermato ✓
- **Test 3:** Pattern B variazioni 30 sec (slide-in, drift, rotation diverse, featured più grandi) ✓
- **Test 4:** /mode petali ritorno → polaroid spariscono completamente, petali ripartono (cleanup pulito, no leak) ✓
- **Test 5:** /mode help mostra entrambi i mode con descrizione ✓
- **Test 6:** B3 regression (upload + approve via Telegram) ✓
- **Test 7 (bonus):** New upload pop visivo confermato ✓

**Decisioni di design Pattern B (dichiarate prima del codice):**
1. Sfondo: avorio caldo continuità Pattern A (1A)
2. Densità: 7 polaroid simultanee (2B)
3. Stile: polaroid classica con padding inferiore largo (3A)
4. Ingresso: slide-in dal bordo random (4A)
5. New upload: glow + pop scale (5B)

**Commit della sessione (2):**
- `8381906` docs(week4): addendum entry 2026-05-26 con deploy hosting Pattern A + checklist chiusura
- `5344ea6` feat(week4): Pattern B Floating Polaroids + VALID_MODES updated

**Note metodologiche:**
- Patto operativo rispettato: scope Pattern B only, niente AI Storyteller (rimandata sessione pomeriggio dichiarata fresh)
- Velocità: ~1h50 vs stima 3h30-4h30 — molto sotto stima (architettura modulare ha pagato dividendi)
- 4 verifiche post-compaction obbligatorie applicate, hanno funzionato
- Pre-task audit (10 min) ha allineato stato prima di iniziare Pattern B
- Pause prevista: 30-60 min prima di sessione pomeriggio separata

**Tech debt — update:**

CHIUSI oggi:
- 🔴 ALTO — Pattern B Floating Polaroids → CHIUSO Fase 2 Step 1 ✅

NUOVI tech debt:
- 🟡 MEDIO — Quando si aggiungerà Pattern C (Cinema Letterbox), occorrerà CF aiStoryteller per popolare ai_story sui featured (prerequisito Pattern C)
- 🟡 PROCEDURAL — Pattern B usa `media.favorite` (corretto) ma `scale` per featured è literal `1.08` invece di stringa `"1.080"` come gli altri (toFixed). Non bloccante, CSS variable interpreta uguale.

MANTENUTI 🔴 ALTO (obiettivo matrimonio):
- Pattern C Cinema Letterbox (Fase 2 Step 2) — ~5-6h (richiede AI Storyteller CF prima)
- Pattern E Scrapbook Vivente (Fase 2 Step 3) — ~5-7h
- Pattern D Particle Burst Mosaic (Fase 3) — ~6-8h
- archive.html (Fase 4) — ~5-7h
- Setup Telegram A1 sposi (Fase 4 finale) — ~15-20 min

**Prossimi task (proposta priorità):**

PRIORITÀ IMMEDIATA (Fase 2 prossimo step):
1. **AI Storyteller CF** (~2-3h) — popola ai_story sui featured, prerequisito Pattern C
2. **Pattern C Cinema Letterbox** (~5-6h) — usa AI Storyteller

POI Fase 2 continua:
3. **Pattern E Scrapbook Vivente** (~5-7h)

POI Fase 3:
4. **Pattern D Particle Burst** (~6-8h)
5. **Polish + stress test**

POI Fase 4:
6. **archive.html** (~5-7h)
7. **Setup Telegram A1 sposi** (~15-20 min, 1 sett pre-matrimonio)

---

## AGGIORNAMENTO 2026-05-26 — Settimana 4 Giorno 1 (martedì pomeriggio) ✅

**Sessione:** 15:50 → ~19:30 (~3h40 lavoro tecnico effettivo)
**Tag:** `v3.5-cinema-foundation` (chiude Fase 1 — Foundation + Pattern A)
**Deploy:** firestore.rules + telegramWebhook (2 volte per rotazione credenziali) + redeploy completo 10/11 functions (fix env post-rotazione)

**Decisione strategica chiave presa OGGI:**
Piano "live cinema" in 4 fasi (~51-62h totali stimati):
- FASE 1 — Foundation + Pattern A Petali (completata oggi)
- FASE 2 — Pattern B Polaroids, C Cinema, E Scrapbook (~15-18h)
- FASE 3 — Pattern D Particle Burst + polish + stress test (~10-12h)
- FASE 4 — archive.html + setup Telegram A1 sposi (~8-10h)

**5 pattern definitivi** (tutti resilienti a pool piccolo, vincolo dichiarato utente):
A — Petali + Frames (romantico calmo) ✅ implementato oggi
B — Floating Polaroids (intimo/conviviale)
C — Cinema Letterbox + Caption Crawl (cinema d'autore, usa AI Storyteller)
D — Particle Burst Mosaic (epico, momenti chiave)
E — Scrapbook Vivente (nostalgico)

Pattern eliminato post-analisi: Tetris (non resiliente a pool piccolo, 16 tile uguali con 1 foto).

**Programmazione giornata matrimonio definita:**
15:30-16:30 Cerimonia (solo telefoni) → mode petali
18:30-20:00 Aperitivo (monitor+telefoni) → mode polaroid
20:00-22:00 Cena (tel principalmente) → mode cinema (AI Storyteller)
22:00-23:00 Momenti chiave (monitor+tel) → mode burst
23:00-02:00 Festa (monitor+tel) → mode polaroid (versione veloce)
02:00-03:00 Epilogo (monitor+tel) → mode scrapbook

**LAVORO COMPLETATO OGGI (Task Fase 1):**

### Task 1.1 — Diagnostica architetturale live.html
Lettura completa pattern esistenti (normalizeDoc, IIFE, listener Firestore, glow new upload). Confermato:
- Schema reale Firestore: display_url, file_type, favorite (lezione 19 mag internalizzata)
- Indice composito esistente: status ASC + uploadDate DESC (riusabile)
- 11 CF in produzione, lista mappata

### Task 1.2 — Creazione 3 file nuovi (commit 1026e4b)
- `live-cinema.html` (34 righe): markup base, container generico #cinemaStage, #petalsLayer, #modeIndicator, data-mode="petali"
- `live-cinema-engine.js` (243 righe): IIFE pulita con pattern registry, variation engine (6 dimensioni: kenBurnsDirection, duration, tintFilter, entranceAnimation, rotation, scale), pool Map, normalizeDoc allineato schema reale, Pattern A registrato
- `live-cinema-styles.css` (197 righe): palette avorio/oro (#faf5ed→#f0e6d2, --cinema-gold:#c9a76a, --cinema-rose:#d4a5a5), Ken Burns 6 direzioni, 4 tint, 5 entrance animations, petalFall/petalRotate/petalSway
- Code review post-compaction OK: schema Firestore corretto, no smell orfani
- Caveat #1 rispettato: live.html / live-script.js / live-styles.css NON toccati

### Task 1.3 — Test locale + fix rules
- Firebase Hosting emulator avviato (http://127.0.0.1:5000)
- Pattern A test in browser: 4 test OK (variazioni visibili, petali fluidi, featured boost percepito, responsive)
- Bug minore: errore console "Missing or insufficient permissions" su app-state/live
- Fix: aggiornato firestore.rules con `match /app-state/{stateId}: allow read (pubblico), allow write false` (commit 58da90c)
- Doc seed `app-state/live = {mode: "petali", updated_at: ..., updated_by: "seed"}` creato manualmente da Firebase Console

### Task 1.4 — Mode switcher via Telegram (commit 5501b94)
- Esteso `telegramWebhook` con branch update.message SOPRA il branch callback_query esistente (B3 NON rotto)
- Helper aggiunti: handleTextCommand, sendModeInfo, sendTelegramMessage, escapeMdV2
- TELEGRAM_ADMIN_CHAT_IDS=566187447 aggiunto in .env
- VALID_MODES = ['petali'] (espanderemo Fase 2)
- Deploy CF + setWebhook con allowed_updates=['callback_query', 'message']
- **Rotazione credenziali Telegram (doppia)**:
  - Causa: leak token + secret in chat (2 volte, durante proposta comando setWebhook)
  - Soluzione: BotFather /revoke + nuovo secret PowerShell random + Read-Host per setWebhook
  - Risultato: 2 rotation in 1 pomeriggio, lezione internalizzata

### Task 1.5 — Deploy hosting + chiusura sessione (post-audit, commit aa1d671 già esistente)
- Deploy hosting: `firebase deploy --only hosting`
- 3 file uploadati: live-cinema.html, live-cinema-engine.js, live-cinema-styles.css
- Pattern A LIVE in produzione: https://andreagiulia5luglio26.it/live-cinema.html
- 3 test smoke post-deploy OK:
  - live-cinema.html accessibile ✓
  - Nessun errore "Missing or insufficient permissions" (rules deployate OK) ✓
  - Mode switcher E2E (Telegram → CF → Firestore → onSnapshot → live-cinema): pipeline completa funzionante ✓
- Process omission rilevata: deploy hosting NON era nel checklist iniziale di chiusura sessione, è stato fatto come "addendum" dopo domanda dell'utente. Lezione consolidata sotto.

### Bug critico in-session — notifyNewMedia 401 Unauthorized
- **Sintomo:** dopo rotazione bot token, upload nuovo media → notifica Telegram NON arriva
- **Diagnosi tramite Cloud Run logs:** "API status 401, Unauthorized"
- **Root cause:** `firebase deploy --only functions:telegramWebhook` aggiorna SOLO quella CF. Le altre CF (notifyNewMedia, helper, ecc.) hanno snapshot del .env del loro proprio deploy → token vecchio in cache
- **Fix:** `firebase deploy --only functions` redeploy completo 10/11 CF (telegramWebhook skip giustamente)
- **Test post-fix:** upload media OK, notifica Telegram arrivata, 3 bottoni visibili, B3 funzionante
- **Lesson learned procedurale:** dopo rotazione credenziali ENV, redeploy COMPLETO functions, non selettivo

**Test E2E completi al termine sessione (8 test totali):**
- Pattern A locale: 4 test (variazioni, petali, featured, responsive) ✅
- /mode help / petali / burst: 3 test ✅
- Firestore verification: 1 test ✅
- B3 regression check: 1 test ✅

**Commit della sessione (3):**
- `1026e4b` feat(week4): Live Cinema foundation + Pattern A Petali (live-cinema.html nuovo)
- `58da90c` feat(week4): firestore rules per app-state/live (lettura pubblica, write bloccato)
- `5501b94` feat(week4): telegramWebhook gestisce comandi /mode (mode switcher live cinema)

**Note metodologiche:**
- Patto operativo rispettato: scope Fase 1 + Pattern A, niente AI Storyteller (rimandato Fase 2)
- Velocità: ~3h40 vs stima 4h15-5h15 — sotto stima nonostante 2 bug critici risolti in-session
- Pausa di metà sessione presa
- Lesson learned procedurali consolidati (rotazione env → deploy completo, code review post-compaction)
- Process learning: **checklist completa di chiusura sessione include hosting/functions deploy** se ci sono modifiche front-end/CF. NON limitarsi a tag + audit + push GitHub. Pattern formalizzato: prima di tag, verificare che lo stato deployato in produzione corrisponda a quello su GitHub.

---

## AGGIORNAMENTO 2026-05-19 — Settimana 3 Giorno 5 (martedì mattina) ✅

**Sessione:** 09:00 → ~11:40 (~2h40 lavoro tecnico effettivo)
**Tag:** `v3.4-live-page` (unico tag per Task A + Task B)
**Deploy:** hosting (2 deploy: iniziale + re-deploy fix schema)

**2 task completati:**

### Task A — Cleanup upload-modal.js (Opzione A1.4)
- **Strategia:** redirect nativo da index.html + before/after logic dentro upload.html (no più modal in-place)
- **Decisione architetturale risolta:** rami before/after preservati ma logica centralizzata in upload-flow.js
- **Diagnostica pre-fix (3 scoperte critiche):**
  - ID duplicato `uploadBtn` in index.html (nav link L50 + bottone modal morto L536)
  - 2 modal distinti: `#uploadStatusModal` (vivo) + `#uploadModal` (morto) — entrambi rimossi
  - Sub-strategia 1: `getUploadStatus()` già globale in firebase-config.js, riuso diretto (no duplicazioni)
- **File modificati (5):** index.html, upload.html, upload-flow.js, upload-styles.css, gallery.html
- **File eliminati (1):** upload-modal.js
- **Bilancio:** -352 righe nette (49+ / 401-)
- **Commit:** `89ec6b8`

### Task B — Live page cinematografica (live.html)
- **Decisioni branding:** sfondo scuro elegante (gradiente verde scurissimo `#1a2620` → `#0d1310`) + accenti oro `#d4af7a`. Font Playfair + Dancing Script per coerenza tema sito.
- **Decisioni layout:** grid responsive 3x2 desktop / 2x2 tablet / 1x2 mobile
- **Decisioni rotation:** 12s normale, 14s featured, staggered partenze (no cambio sincronizzato)
- **Decisioni pool:** 150 ultime approved, random pesato featured 3x
- **Decisioni new upload:** animazione slide-from-top + glow oro 1.5s, NO nome autore, NO badge featured visibile
- **Architettura:** Firestore `onSnapshot` con `docChanges()` per update chirurgici, pool gestito come `Map<id, doc>` in IIFE
- **Failure mode pool vuoto:** placeholder elegante 'A & G — In attesa dei vostri ricordi…'
- **File nuovi (3):** live.html (73 righe), live-styles.css (196 righe), live-script.js (227 righe)
- **Commit:** `e8ab632` + fix `cf51721`

**Bug critico scoperto e risolto in produzione (Task B):**
- **Sintomo:** 6 slot tutti neri, `img.src` = URL pagina corrente
- **Root cause:** Claude Code, dopo Conversation compacted durante scrittura, ha inventato nomi camelCase non esistenti nello schema Firestore reale:
  - `d.thumbnailUrl || d.url || d.downloadURL` → corretto: `d.display_url || d.original_url`
  - `d.mediaType` → corretto: `d.file_type`
  - `d.featured` → corretto: `d.favorite`
- **Diagnostica:** verifica console DevTools (`imgSrc: "https://andreagiulia5luglio26.it/live.html"`) + interrogazione Firestore diretta dal browser per confermare schema reale
- **Fix:** 3 sostituzioni mirate in `normalizeDoc` (chiavi oggetto preservate per zero impatto a valle)
- **Lesson learned (procedural):** dopo Conversation compacted, code review obbligatoria PRIMA del deploy. Pattern Strada 2 (verifica veloce) replicato con successo.

**Smoke test produzione (8 test):**
- Test 1: regression upload nav link OK
- Test 2: pipeline E2E upload→AI→Telegram funzionante
- Test 3: live.html accessibile (post-fix)
- Test 4: Ken Burns 12s visibile
- Test 5: featured 14s + animazione lenta
- Test 6: new upload glow oro visibile
- Test 7: responsive desktop/tablet/mobile
- Test 8: fullscreen F11 pulito

**Commit della sessione (3):**
- `89ec6b8` refactor(week4): cleanup upload-modal.js dead code, redirect diretto + before/after in upload.html
- `e8ab632` feat(week3): Live page cinematografica (grid 6 slot, onSnapshot, random pesato 3x featured)
- `cf51721` fix(week3): live-script.js schema Firestore (display_url, file_type, favorite)

**Note metodologiche:**
- Patto operativo rispettato: 2 task come da scope, niente AI Storyteller / Director / Stage Mode (rimandati Sett 4-5)
- Velocità: leggermente sopra stima (~2h40 vs 3h45-4h30 stimato) — un bug critico recuperato senza intaccare scope
- Conversation compacted in Claude Code introduce **un nuovo rischio** da gestire: code review post-compaction NON più opzionale
- Pausa di metà sessione tra Task A e B effettivamente presa (~10 min)

---

## AGGIORNAMENTO 2026-05-18 — Sessione bonus diagnostica upload-modal.js ✅

**Sessione:** 22:40 → ~23:00 (~20 min solo diagnostica, nessun codice toccato)
**Scope:** rispondere a "upload-modal.js è dead code o attivo?"

**Verdetto: DEAD CODE in finestra matrimonio (con sfumature)**

**Evidenza:**
- `upload-modal.js` linkato SOLO in `index.html` (riga 557 `<script src=...>`)
- Nessun altro JS in root fa riferimento a `UploadModal`/`uploadModal`
- Istanziato a DOMContentLoaded MA `uploadFiles()` e `compressImage()` mai chiamate
- Motivo: `handleUploadClick()` riga 7 → `window.location.href = '/upload.html'` + `return` → redirect immediato durante stato "open" (finestra matrimonio attiva)
- Doppia evidenza che è rotto anche se attivato: Storage path mancante `/originals/`, schema Firestore vecchio (`fileType` vs `file_type`), no Anonymous Auth

**Sfumatura: cosa NON è dead code**
- Funzione `handleUploadClick()` ha rami `before` / `after` che mostrano modal informativi pre/post matrimonio usando il div HTML `#uploadModal` (index.html riga 498). Quei rami non chiamano `uploadFiles()` ma testi statici. Da decidere se sono ancora desiderati.

**Storia git:** ultimo commit sostanziale = `3d0f5f6` (Settimana 2, creazione `/upload.html` con redirect). Da allora è residuo non rimosso.

**Piano fix proposto per prossima sessione (~45-50 min):**

1. **Decisione architetturale (5 min discussione):** i rami `before`/`after` di `handleUploadClick()` sono ancora desiderati?
   - Se sì: logica spostata altrove (es. `script.js`)
   - Se no: semplificazione a redirect diretto puro

2. **Modifiche codice (15-20 min):**
   - `index.html`: rimuovere riga 557 `<script src="upload-modal.js">`
   - `index.html` riga 498: decidere su `<div id="uploadModal">` (tenere/rimuovere)
   - `script.js`: spostare `handleUploadClick()` se necessario
   - `upload-modal.js`: `git rm` (rimozione totale file, 338 righe morte)

3. **Deploy + smoke test (15 min):** verificare che click su upload da `index.html` apra ancora correttamente `/upload.html`

4. **Tag opzionale `v3.4-cleanup` + audit doc (10 min)**

**Decisione da prendere a mente fresca:** rami before/after sì o no?

---

## AGGIORNAMENTO 2026-05-18 — Settimana 3 Giorno 4 (lunedì sera) ✅

**Sessione:** 21:15 → ~22:25 (~1h10 lavoro tecnico effettivo)
**Tag:** `v3.3-telegram-interactive`
**Deploy:** CF telegramWebhook (nuova) + notifyNewMedia (update)

**Decisione product-driven:**
- B3 (bottoni interattivi approve/reject in chat Telegram) era tech debt 🔴 ALTO obiettivo matrimonio. Chiuso oggi.
- Setup A3 mantenuto (chat privata Francesco). Migrazione ad A1 (gruppo sposi) resta tech debt 🔴 da fare 1 settimana prima del matrimonio.

**Decisioni architetturali:**
- Trigger: HTTP `onRequest` v2 (`firebase-functions/v2/https`), endpoint pubblico `https://us-central1-{project}.cloudfunctions.net/telegramWebhook`
- Sicurezza: verifica `X-Telegram-Bot-Api-Secret-Token` con `crypto.timingSafeEqual`. Secret 32 chars random in `functions/.env` come `TELEGRAM_WEBHOOK_SECRET`. Separato da `ADMIN_PASSWORD` (semanticamente diverso).
- `allowed_updates: ["callback_query"]` su `setWebhook` → Telegram notifica SOLO callback bottoni, niente messaggi normali. Riduce rumore e superficie di attacco.
- `callback_data` formato compatto: `"a:mediaId"` / `"r:mediaId"` (22 byte, ben sotto limite Telegram 64 byte)
- UX post-tap: `editMessageReplyMarkup` rimuove bottoni callback, lascia solo "Apri admin" come audit trail
- `moderated_by`: formato `"telegram:@username"` per distinguere da `"admin"` (moderazione web)
- Failure mode: errori loggati, `answerCallbackQuery` sempre chiamato (anche su errore) per evitare retry loop Telegram

**Implementato:**
- ✅ `TELEGRAM_WEBHOOK_SECRET` (32 chars random) in `functions/.env`
- ✅ Import `onRequest` da `firebase-functions/v2/https`
- ✅ CF `telegramWebhook` (185 righe): metodo POST only, verifica firma, parsing callback_query, idempotenza, update Firestore, answerCallbackQuery, editMessageReplyMarkup
- ✅ Helper `answerCallback()` e `editReplyMarkupKeepAdminLink()`
- ✅ Modifica `notifyNewMedia`: inline_keyboard ora ha 3 bottoni (Approva + Rifiuta callback, Apri admin URL)
- ✅ `setWebhook` su Telegram configurato con secret + allowed_updates
- ✅ Verifica sicurezza: 403 confermato per richieste senza secret + secret invalido

**Commit della sessione (1):**
- `88abd67` feat(week4): CF telegramWebhook bottoni interattivi approve/reject + notifyNewMedia callback_data

**Test produzione (E2E):**
- Upload nuovo media → notifica Telegram con thumbnail + AI score + 3 bottoni (~20 sec)
- Tap "✅ Approva" → toast `✅ Approvato` + bottoni callback rimossi + Firestore status=approved + moderated_by=telegram:@xxx
- Tap "❌ Rifiuta" → simmetrico, status=rejected
- Galleria pubblica mostra media approvati via Telegram identici a quelli approvati via admin web
- Pre-test sicurezza: 403 Forbidden senza secret + 403 con secret sbagliato

**CF live totali: 11**

**Note metodologiche:**
- Pre-sessione: PM ha dichiarato "no #1" su deploy serale (regola handover originale). Utente ha chiarito **vincolo strutturale** di disponibilità (solo serale possibile, non scelta). PM ha accettato e applicato 3 disciplinari aggiuntivi (verifica firma obbligatoria, no deploy senza test sicurezza, hard stop autonomo dell'utente).
- Disciplinari rispettati al 100%
- Velocità: sotto stima realistica di ~1h25 (1h10 vs 2h45-3h20 stimato). Diagnostica accurata + decisioni nette su trade-off (B1 verifica firma vs B2 HMAC, D1 editMessage vs D2 lascia bottoni).

### Tech debt residuo aggiornato
1. **reCAPTCHA V2/V3 mismatch architetturale**: V2 prod, V3 dev
2. ~~**compressImage() dead code in upload-flow.js**~~ ✅ RISOLTO Giorno 3 sera
3. **Password admin "RindiFusi" hardcoded** in 3 posti: migrare a Firebase Auth + custom claims
4. ~~**gallery-script.js status filter**~~ ✅ RISOLTO Giorno 2
5. **Merge commit "A A A" cosmetico** in git history main
6. 🟡 `firestore.indexes.json` contiene 1 indice composito (status+uploadDate); future query composite richiederanno estensione
7. 🟡 Filtro status admin è client-side (`loadMedia` carica tutto + filtra in JS). OK per ~hundreds di media. Se collection cresce >1000 doc serve paginazione + query server-side.
8. 🟡 `moderated_by: "admin"` hardcoded nella CF moderateMedia — diventerà UID reale quando migreremo a Firebase Auth + custom claims
9. 🟡 Scoring retroattivo dei media uploadati prima del deploy CF (17 mag ~10:00) non implementato. Mostrano "🤖 In attesa di analisi AI…" in admin. Possibile task futuro: CF callable `aiScoreRetroactive`. Stima 1h.
10. 🟡 Nessun rate-limiting esplicito sulla CF aiPhotoCurator. Per ~150 ospiti × 1-3 foto = max ~500 chiamate API durante matrimonio. Limite Anthropic default 50 req/min, ampio margine. Da monitorare durante evento.
11. 🟡 Tags AI sono solo display, no filtro admin per tag. Possibile feature futura.
12. 🟡 Nessun re-scoring on demand (es. bottone "ri-analizza" in admin). Se score sbagliato, decisione solo manuale.
13. 🟢 Node.js 20 deprecation notice (decommission 30 ott 2026): NON urgente. Da fare in sessione dedicata 1-2h dopo settembre 2026.
14. ~~🔴 **MEDIO — upload-modal.js è DEAD CODE in finestra matrimonio**~~ ✅ CHIUSO Giorno 5 (19 mag)
15. 🔴 **ALTO — Setup Telegram A3→A1 (gruppo sposi)**: deve essere migrato a A1 (gruppo con Andrea + Giulia) **almeno 1 settimana prima del matrimonio**. Steps: creare gruppo Telegram, aggiungere bot come membro, recuperare chat_id, aggiornare TELEGRAM_CHAT_ID in functions/.env, rideploy notifyNewMedia. Stima: 15-20 min.
16. ~~🔴 **ALTO — Telegram bot B3 (bottoni interattivi approve/reject in chat)**~~ ✅ CHIUSO Giorno 4 (18 mag)
17. 🟡 Video non triggerano notifyNewMedia (perché non passano da aiPhotoCurator). Caso edge da gestire: trigger separato su display_url per file_type=video. Stima: 30-45 min. Priorità: media.
18. ~~🟡 Hosting non deployato (upload-flow.js modificato in Giorno 3 ma prod ha ancora dead code)~~. ✅ CHIUSO Giorno 5 (19 mag)
19. 🟡 Admin UI non mostra campo `moderated_by`. Utile per audit ("approvato via Telegram da Andrea" vs "via web admin"). Stima: 15 min. Priorità: bassa.
20. 🟡 `telegramWebhook` non ha rate limiting esplicito. Stima realistica matrimonio: max 500 callback in 6h = sicuramente OK. Da monitorare durante evento.
21. 🟡 Nessun controllo identità utente su bottoni Telegram: chiunque sia nella chat può cliccare. Per setup A1 (gruppo sposi) è il comportamento voluto. Audit log via `moderated_by` permette tracciare.
22. 🟡 `live-script.js` gestisce pool fino a 150 doc. Se durante matrimonio approved > 150, le più vecchie escono dal pool. Per ~150 ospiti × 3 foto = max ~450 approved attese. Considerare aumentare a 200-250 durante test pre-matrimonio. Stima: 2 min modifica.
23. 🟡 `live-script.js` NON gestisce caso "pool < 6 distinct media": stesso media può apparire in 2 slot simultanei. Comportamento accettato al primo deploy ma da rifinire se desiderato.
24. 🟡 **Procedural:** dopo Conversation compacted di Claude Code, code review pre-deploy è obbligatoria. Schema Firestore inventato camelCase invece di snake_case — bug critico in produzione rilevato e risolto con 1 re-deploy. Pattern da applicare sistematicamente.

### Prossimi task (Sett 4)
1. **Setup Telegram A1 — gruppo sposi** (1 settimana prima matrimonio)
2. **AI Storyteller** (CF genera narrazione giornata, ~2h30)
3. **Director Layout** (vista regista per Andrea/Giulia, ~2h)
4. **Stage Mode** (proiettore con score AI ≥8, ~1h30)
5. Janitor batch, archive.html (Sett 4-5)

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign, 15 maggio)
- ✅ Sett 3: COMPLETATA
  - ✅ Giorno 1 sabato 16 mag: uploader_name + deleteSelected + race condition fix
  - ✅ Giorno 2 sabato 16 mag (sera): Moderazione admin completa (tag v3.0-moderation)
  - ✅ Giorno 3 dom 17 mag (mattina): AI scoring Claude Vision (tag v3.1-ai-scoring)
  - ✅ Giorno 3 dom 17 mag (sera): Telegram notifications + cleanup (tag v3.2-telegram-notifications)
  - ✅ Giorno 4 lun 18 mag (sera): Telegram bottoni interattivi B3 (tag v3.3-telegram-interactive)
  - ✅ Giorno 5 mar 19 mag (mattina): cleanup upload-modal.js + live page cinematografica (tag v3.4-live-page)
- 📋 Sett 4-5 (compressed): AI Storyteller + Director layout + Janitor + archive.html + Stage Mode
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE
- 🎉 5 luglio: matrimonio Andrea & Giulia

---

## AGGIORNAMENTO 2026-05-17 — Settimana 3 Giorno 3 (domenica sera) ✅

**Sessione:** 19:00 → ~21:00 (~2h lavoro tecnico effettivo)
**Tag:** `v3.2-telegram-notifications`
**Deploy:** CF notifyNewMedia (hosting NON deployato — solo cleanup client locale + push)

**Decisioni architetturali:**
- Notifica scelta: **Telegram bot** (al posto di email originariamente pianificata)
- Setup A3 (chat privata bot↔Francesco) — da estendere a A1 (gruppo con sposi) prima del matrimonio
- Trigger CF: Firestore `onDocumentUpdated` v2, guard `ai_scored_at` null→timestamp (= post aiPhotoCurator)
- Contenuto B2: thumbnail inline + caption ricca con AI info + bottone link admin
- Failure mode: graceful degradation — errore Telegram non blocca workflow moderazione web
- Solo foto (i video non passano da aiPhotoCurator → non triggerano notifica, tech debt)

**Implementato:**
- ✅ Bot Telegram `@andreagiulia_mod_bot` creato via @BotFather
- ✅ TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in `functions/.env`
- ✅ CF `notifyNewMedia` (functions v2, 256MiB, timeout 30s)
- ✅ Helper escape MarkdownV2 per caratteri speciali Telegram
- ✅ Caption italiana con emoji semaforo per score (🔴 1-3, 🟡 4-6, 🟢 7-8, ⭐ 9-10)
- ✅ sendPhoto con thumb_url inline + reply_markup inline_keyboard
- ✅ Fallback sendMessage testuale per media senza thumbnail
- ✅ Idempotenza via campo `telegram_notified_at`
- ✅ Schema doc esteso: `telegram_notified_at` (timestamp)
- ✅ Cleanup `compressImage()` dead code in `upload-flow.js` (−21 righe)

**Commit della sessione (2):**
- `5c686ae` feat(week3): CF notifyNewMedia notifica Telegram con thumb + AI score + link admin
- `8d059b3` chore(week3): rimozione compressImage dead code (Strategia A delega a CF)

**Test produzione (E2E):**
- Upload foto → catena completa (generateThumbnails → aiPhotoCurator → notifyNewMedia) → notifica Telegram ricevuta in ~20 secondi
- Thumbnail inline + caption + bottone "Apri admin" funzionanti
- 0 errori

**CF live totali: 10**

**Note metodologiche:**
- Decisione product-driven: Francesco ha messo in discussione la mia raccomandazione (email), ho analizzato 6 alternative, Telegram è oggettivamente superiore per il caso d'uso
- Patto operativo rispettato: scope chiuso (Telegram + cleanup upload-flow), stop su scope creep (upload-modal.js dead code investigation NON eseguito stasera)
- Scoperta inattesa durante cleanup: upload-modal.js ha compressImage attiva separata, scope creep dichiarato declinato → audit-only

### Tech debt residuo aggiornato
1. **reCAPTCHA V2/V3 mismatch architetturale**: V2 prod, V3 dev
2. ~~**compressImage() dead code in upload-flow.js**~~ ✅ RISOLTO Giorno 3 sera
3. **Password admin "RindiFusi" hardcoded** in 3 posti: migrare a Firebase Auth + custom claims
4. ~~**gallery-script.js status filter**~~ ✅ RISOLTO Giorno 2
5. **Merge commit "A A A" cosmetico** in git history main
6. 🟡 `firestore.indexes.json` contiene 1 indice composito (status+uploadDate); future query composite richiederanno estensione
7. 🟡 Filtro status admin è client-side (`loadMedia` carica tutto + filtra in JS). OK per ~hundreds di media. Se collection cresce >1000 doc serve paginazione + query server-side.
8. 🟡 `moderated_by: "admin"` hardcoded nella CF moderateMedia — diventerà UID reale quando migreremo a Firebase Auth + custom claims
9. 🟡 Scoring retroattivo dei media uploadati prima del deploy CF (17 mag ~10:00) non implementato. Mostrano "🤖 In attesa di analisi AI…" in admin. Possibile task futuro: CF callable `aiScoreRetroactive` che processa doc con `ai_score: null` in batch. Stima 1h.
10. 🟡 Nessun rate-limiting esplicito sulla CF aiPhotoCurator. Per ~150 ospiti × 1-3 foto = max ~500 chiamate API durante matrimonio. Limite Anthropic default 50 req/min, ampio margine. Da monitorare durante evento.
11. 🟡 Tags AI sono solo display, no filtro admin per tag (es. "mostra solo cerimonia"). Possibile feature futura.
12. 🟡 Nessun re-scoring on demand (es. bottone "ri-analizza" in admin). Se score sbagliato, decisione solo manuale.
13. 🟢 Node.js 20 deprecation notice (decommission 30 ott 2026): NON urgente, 5+ mesi di buffer dopo matrimonio. Da fare in sessione dedicata 1-2h dopo settembre 2026.
14. 🔴 **ALTO — upload-modal.js usa imageCompression CDN client-side**: in contrasto con Strategia A applicata a upload-flow.js. Da investigare: chi importa/instanzia upload-modal.js? Se dead code → rimuovere intero file. Se attivo → allineare a Strategia A. Stima diagnostica: 15-20 min. Stima fix: 30-45 min. **Priorità: prima del matrimonio (5 luglio).**
15. 🔴 **ALTO — Setup Telegram attualmente A3 (solo Francesco)**: deve essere migrato a A1 (gruppo con Andrea + Giulia) **almeno 1 settimana prima del matrimonio**. Steps: creare gruppo Telegram, aggiungere bot come membro, recuperare chat_id del gruppo, aggiornare TELEGRAM_CHAT_ID in functions/.env, rideploy notifyNewMedia. Stima: 15-20 min. **Senza questo, valore della feature non si manifesta.**
16. 🔴 **ALTO — Telegram bot B3 (bottoni interattivi approve/reject in chat)**: obiettivo dichiarato Francesco per il matrimonio. Richiede CF webhook Telegram in entrata + verifica firma + gestione callback_query. Stima: 2-3h sessione dedicata. **Priorità: prima del matrimonio (5 luglio).**
17. 🟡 Video non triggerano notifyNewMedia (perché non passano da aiPhotoCurator). Caso edge da gestire: trigger separato su display_url per file_type=video, con notifica senza AI score. Stima: 30-45 min. Priorità: media.
18. 🟡 Hosting non deployato stasera: `upload-flow.js` modificato (compressImage rimossa) ma in produzione contiene ancora il dead code. Verrà deployato alla prossima feature visibile. Priorità: bassa (cleanup non cambia comportamento utente).

### Prossimi task (Sett 3 Giorno 4+)
1. **Upload-modal.js investigation + fix** (diagnostica + eventuale rimozione/allineamento Strategia A) — stima 45-60 min
2. **Telegram setup A1 + Telegram B3 (bottoni interattivi approve/reject)** — obiettivi matrimonio, stima 2-3h sessione
3. **Live page cinematografica** (Sett 4, sessione mezza giornata)
4. Janitor batch, archive.html, Stage Mode (Sett 4-5)

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign, 15 maggio)
- 🟢 Sett 3: IN CORSO
  - ✅ Giorno 1 sabato 16 mag: uploader_name + deleteSelected + race condition fix
  - ✅ Giorno 2 sabato 16 mag (sera): Moderazione admin completa (tag v3.0-moderation)
  - ✅ Giorno 3 dom 17 mag (mattina): AI scoring Claude Vision (tag v3.1-ai-scoring)
  - ✅ Giorno 3 dom 17 mag (sera): Telegram notifications + cleanup (tag v3.2-telegram-notifications)
  - 📋 Giorno 4+: upload-modal.js investigation + Telegram A1 setup + Telegram B3 bottoni
- 📋 Sett 4-5 (compressed): live page + AI Storyteller + Director layout + Janitor + archive.html + Stage Mode
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE
- 🎉 5 luglio: matrimonio

---

## AGGIORNAMENTO 2026-05-17 — Settimana 3 Giorno 3 (domenica mattina) ✅

**Sessione:** 09:45 → ~11:00 (~1h15 lavoro tecnico effettivo)
**Tag:** `v3.1-ai-scoring`
**Deploy:** CF aiPhotoCurator + hosting

**Decisioni architetturali:**
- Trigger CF: Firestore `onDocumentUpdated` v2 su `wedding-media/{id}`, guard interna su `display_url: null → string` (= post generateThumbnails)
- Servizio AI: chiamata diretta a `api.anthropic.com/v1/messages` via axios (no SDK aggiuntivo)
- Model: `claude-sonnet-4-5` con vision (image base64)
- Failure mode: graceful degradation — errori loggati, doc resta moderabile manualmente
- Solo nuovi upload (no scoring retroattivo dei media pre-deploy)
- Vocabolario tags fisso (12 valori): ritratto, gruppo, dettaglio, cerimonia, ricevimento, ballo, cibo, decorazioni, paesaggio, emotivo, divertente, formale

**Implementato:**
- ✅ CF `aiPhotoCurator` (functions v2, 512MiB, timeout 60s)
- ✅ 4 guard: display_url changed + idempotenza ai_scored_at + file_type image + API key presente
- ✅ Parser JSON robusto con fallback regex (per risposte API con preamble)
- ✅ Validazione output: score 1-10 intero, tags array max 4, description max 200 chars
- ✅ Schema doc esteso: `ai_score`, `ai_tags`, `ai_description`, `ai_scored_at`
- ✅ Admin UI: blocco display sotto card con score colorato (low/medium/good/excellent), tags separati da bullet, description corsivo
- ✅ Stato "in attesa" giallo per media senza ai_score
- ✅ Galleria pubblica: nessuna modifica (AI info solo per admin)

**Commit della sessione (2):**
- `ca91987` feat(week3): CF aiPhotoCurator scoring immagini con Claude Vision API
- `25ed81b` feat(week3): admin UI display AI scoring (score + tags + description)

**Test produzione (E2E):**
- Test 1 "Bacio 2" (foto buona): score 9, tags [ritratto, paesaggio, emotivo, formale], description toscana coerente
- Test 2 "Cuore verde" (foto mediocre): score 2, tags [dettaglio, decorazioni], description critica
- Discriminazione 7 punti delta → prompt funzionante al primo colpo, nessuna iterazione necessaria
- Test post-deploy: nuovo upload → pipeline completa upload → thumbnails → AI scoring → admin display in ~30 secondi

**Costo API stimato:**
- ~$0.007 per foto (claude-sonnet-4-5 vision, ~1500 token input + ~150 token output)
- Stima totale matrimonio ~150 foto = ~$1 totali (trascurabile)

**Note metodologiche:**
- Patto operativo rispettato: 1 macro-task chiuso senza scope creep
- Stop pre-deadline (~11:00 vs stop dichiarato 12:45): ottima velocità grazie a diagnostica accurata
- Decisione PM: rinviata email moderation e cleanup tech debt (Strategia 3 invece di 2 originale)
- Mente fresca domenica mattina = strategia giusta per task strategico con prompt engineering

### Tech debt residuo aggiornato
1. **reCAPTCHA V2/V3 mismatch architetturale**: V2 prod, V3 dev
2. **compressImage() dead code in upload-flow.js** (Strategia A delega tutto a CF generateThumbnails) — cleanup 30 min
3. **Password admin "RindiFusi" hardcoded** in 3 posti: migrare a Firebase Auth + custom claims
4. ~~**gallery-script.js status filter**~~ ✅ RISOLTO Giorno 2
5. **Merge commit "A A A" cosmetico** in git history main
6. 🟡 `firestore.indexes.json` contiene 1 indice composito (status+uploadDate); future query composite richiederanno estensione
7. 🟡 Filtro status admin è client-side (`loadMedia` carica tutto + filtra in JS). OK per ~hundreds di media. Se collection cresce >1000 doc serve paginazione + query server-side.
8. 🟡 `moderated_by: "admin"` hardcoded nella CF moderateMedia — diventerà UID reale quando migreremo a Firebase Auth + custom claims
9. 🟡 Scoring retroattivo dei media uploadati prima del deploy CF (17 mag ~10:00) non implementato. Mostrano "🤖 In attesa di analisi AI…" in admin. Possibile task futuro: CF callable `aiScoreRetroactive` che processa doc con `ai_score: null` in batch. Stima 1h.
10. 🟡 Nessun rate-limiting esplicito sulla CF aiPhotoCurator. Per ~150 ospiti × 1-3 foto = max ~500 chiamate API durante matrimonio. Limite Anthropic default 50 req/min, ampio margine. Da monitorare durante evento.
11. 🟡 Tags AI sono solo display, no filtro admin per tag (es. "mostra solo cerimonia"). Possibile feature futura.
12. 🟡 Nessun re-scoring on demand (es. bottone "ri-analizza" in admin). Se score sbagliato, decisione solo manuale.
13. 🟢 Node.js 20 deprecation notice (decommission 30 ott 2026): NON urgente, 5+ mesi di buffer dopo matrimonio. Da fare in sessione dedicata 1-2h dopo settembre 2026.

### Prossimi task (Sett 3 Giorno 4+)
1. Email moderation per Andrea/Giulia (stima 1-2h) — rinviato da oggi
2. Cleanup `compressImage()` dead code in upload-flow.js (stima 30 min) — rinviato da oggi
3. (Settimane 4-5, compressed): live page cinematografica, AI Storyteller, Director layout, Janitor, archive.html, Stage Mode

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign, 15 maggio)
- 🟢 Sett 3: IN CORSO
  - ✅ Giorno 1 sabato 16 mag: uploader_name + deleteSelected + race condition fix
  - ✅ Giorno 2 sabato 16 mag (sera): Moderazione admin completa (tag v3.0-moderation)
  - ✅ Giorno 3 dom 17 mag: AI scoring Claude Vision (tag v3.1-ai-scoring)
  - 📋 Giorno 4+: Email moderation per Andrea/Giulia — stima 1-2h
  - 📋 Giorno 4+: Cleanup `compressImage()` dead code — stima 30 min
- 📋 Sett 4-5 (compressed): live page + AI Storyteller + Director layout + Janitor + archive.html + Stage Mode
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE
- 🎉 5 luglio: matrimonio

---

## AGGIORNAMENTO 2026-05-16 — Settimana 3 Giorno 2 (sabato sera) ✅

### Sessione 19:25-22:00 — Moderazione admin completa (v3.0-moderation)

**Status: COMPLETATO ✅ — Tag v3.0-moderation**

### Decisioni architetturali

- **A1** (confermata): nuovi upload nascono con `status: 'pending'`
- **B1-bis** (scelta su B1): `status` enum a 3 valori (`pending | approved | rejected`) + riuso campo `favorite` esistente come "featured". Più semplice e meno bug-prone di un enum a 4 valori.
- **C1**: indice composito Firestore deployato insieme al codice

### Cosa è stato fatto

**Task 1 — CF moderateMedia**
- functions/index.js: nuova CF `moderateMedia` callable v1 (azioni: `approve`, `reject`, password admin via env)
- Pattern: identico a `toggleFavorite` — Admin SDK bypassa `allow update: if false` in firestore.rules
- Schema doc esteso: `status`, `moderated_at` (serverTimestamp), `moderated_by` (hardcoded "admin")
- Commit: edb1fbb

**Task 2 — Admin UI moderazione**
- admin-script.js: property `this.statusFilter = 'all'` + listener `statusFilter`
- admin-script.js: filtro status in `applyFilters()` (client-side)
- admin-script.js: 2 bottoni `approve-btn` / `reject-btn` nel template card
- admin-script.js: badge `status-badge` (🕐 pending / ✓ approved / ✗ rejected) per ogni card
- admin-script.js: metodo `moderateMedia()` chiama CF + aggiorna `item.status` in locale senza refetch
- admin.html: 4° filter-group `<select id="statusFilter">`
- admin-styles.css: stili `.approve-btn`, `.reject-btn`, `.action-btn:disabled`, `.status-badge.*`
- Commit: 26a118b

**Task 3 — Indice composito Firestore**
- firestore.indexes.json: creato da zero con indice `wedding-media (status ASC, uploadDate DESC)`
- firebase.json: aggiunta entry `"indexes": "firestore.indexes.json"` nella sezione firestore
- Deploy: firebase deploy --only firestore:indexes (Successful, stato Enabled verificato in Console)
- Commit: 6b2a4dd

**Task 4 — Galleria pubblica filtro approved + featured-first**
- gallery-script.js: query aggiornata con `.where("status", "==", "approved")`
- gallery-script.js: sort client-side `favorite=true` in cima dopo fetch
- gallery-script.js: badge "⭐ In evidenza" via DOM API (`createElement`) su card featured
- gallery-styles.css: stile `.featured-badge` (gradient oro, position absolute top-right)
- Commit: ec253db

### Cloud Functions live (8 totali)
1. verifyRecaptcha
2. submitRSVP
3. checkRateLimit
4. generateThumbnails (retry race condition fix)
5. deleteRSVP
6. deleteMedia
7. toggleFavorite
8. moderateMedia ⭐ NUOVA

### Smoke test produzione: 8/8 ✅
- Galleria vuota inizialmente (0 media approved) → empty state OK
- Approve media via admin → appare in galleria pubblica OK
- Reject media via admin → scompare da galleria pubblica OK
- Filtro status admin: pending/approved/rejected OK
- Sort featured-first: favorite=true in cima OK
- Upload nuovo media → status pending, non visibile in galleria OK
- Badge colorato nelle card admin OK
- Badge "⭐ In evidenza" nella galleria pubblica OK

### Tech debt residuo aggiornato
1. **reCAPTCHA V2/V3 mismatch architetturale**: V2 prod, V3 dev
2. **compressImage() dead code in upload-flow.js** (Strategia A delega tutto a CF generateThumbnails) — cleanup 30 min
3. **Password admin "RindiFusi" hardcoded** in 3 posti: migrare a Firebase Auth + custom claims
4. ~~**gallery-script.js status filter**~~ ✅ RISOLTO in questa sessione
5. **Merge commit "A A A" cosmetico** in git history main
6. 🟡 `firestore.indexes.json` contiene 1 indice composito (status+uploadDate); future query composite richiederanno estensione
7. 🟡 Filtro status admin è client-side (`loadMedia` carica tutto + filtra in JS). OK per ~hundreds di media. Se collection cresce >1000 doc serve paginazione + query server-side.
8. 🟡 `moderated_by: "admin"` hardcoded nella CF moderateMedia — diventerà UID reale quando migreremo a Firebase Auth + custom claims

### Note metodologiche
- Patto operativo rispettato: stop a 5 task, niente AI scoring stasera nonostante margine temporale
- Deploy in serata contro raccomandazione PM, autorizzato dall'utente con caveat espliciti (rollback plan + stop su bug + no extra task) — tutti i caveat rispettati
- Errore PM percezione tempo: pensavo fossero le 21:00 ma erano le 20:00. Annotato per prossime sessioni.
- Errore logico nel piano deploy: finestra "galleria vuota" (0 media approved) non anticipata. Soluzione pragmatica accettata (finestra ~2-3 min trascurabile).

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign, 15 maggio)
- 🟢 Sett 3: IN CORSO (tag v3.0-moderation per Giorno 2)
  - ✅ Giorno 1 sabato 16 mag: uploader_name + deleteSelected + race condition fix
  - ✅ Giorno 2 sabato 16 mag (sera): Moderazione admin completa
  - 📋 Giorno 3+: AI scoring (Claude Vision — CF `aiPhotoCurator`) — stima 4-5h
  - 📋 Giorno 3+: Notifiche email moderation per Andrea/Giulia — stima 1-2h
  - 📋 Giorno 3+: Cleanup `compressImage()` dead code — stima 30 min
- 📋 Sett 4-5 (compressed): live page + AI Storyteller
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE
- 🎉 5 luglio: matrimonio

---

## AGGIORNAMENTO 2026-05-16 — Settimana 3 Giorno 1 (sabato sera)

### Sessione 18:05-19:00 — 3 task chiusi con disciplina di scope

**Status: COMPLETATO ✅**

### Cosa è stato fatto stasera

**Task A — Feature uploader_name visibile + filtro dropdown admin**
- admin-script.js: nuovo metodo `escapeHtml()` per XSS protection
- admin-script.js: template card mostra terza riga con `uploader_name` 
  + icona Font Awesome user
- admin-script.js: nuovo metodo `populateUploaderFilter()` chiamato 
  dopo loadMedia
- admin-script.js: nuovo filtro `this.uploaderFilter` in applyFilters
- admin.html: dropdown `<select id="uploaderFilter">` in sezione filters
- admin-styles.css: stile `.media-uploader` + `.filter-select`
- Commit: d508533

**Task B — Fix deleteSelected batch (Cancella selezionati)**
- admin-script.js: refactor `deleteSelected()` usa CF deleteMedia in 
  Promise.allSettled (parallelo, resilient)
- Riusa CF già deployata in Sett 2, niente nuove CF
- UI feedback: alert con succeeded/failed counts
- `this.selectedItems.clear()` + chiamata `updateSelectionUI()` riusata
- Commit: c0d69d8

**Task C — Fix race condition CF generateThumbnails (BONUS)**
- Bug scoperto durante diagnostica: display_url/thumb_url null in alcuni 
  documenti Firestore caricati ieri sera (Sett 2 deploy)
- Causa: race condition tra Storage finalize trigger e client write 
  Firestore doc. File piccoli (<100KB) trigger CF MOLTO veloce → 
  documento Firestore ancora non scritto dal client.
- Fix: nuovo helper `findDocWithRetry(db, filePath, maxAttempts=4)` con 
  backoff esponenziale 500ms→1s→2s→4s (7.5s max)
- functions/index.js: lookup documento usa retry helper invece di query 
  diretta
- Deploy: firebase deploy --only functions:generateThumbnails (Successful 
  update operation)
- Verifica: smoke test con foto piccola (27KB QR) → log "Tentativo 1 
  fallito, aspetto 500ms... Documento trovato al tentativo 2 (dopo 
  500ms)" → display_url e thumb_url popolati correttamente
- Commit: 0a0a235

### Cloud Functions live (7 totali, generateThumbnails aggiornata)
1. verifyRecaptcha
2. submitRSVP
3. checkRateLimit
4. generateThumbnails ⭐ AGGIORNATA con retry race condition
5. deleteRSVP
6. deleteMedia
7. toggleFavorite

### Pattern operativi confermati stasera
1. **Diagnostica precisa prima del fix**: 5 minuti di analisi Cloud 
   Functions Logs ha rivelato race condition specifica file piccoli
2. **Riuso CF esistenti**: deleteSelected riusa deleteMedia (no nuove CF)
3. **Prompt brevi + scope chiaro**: 3 task chiusi in ~55 minuti
4. **Patto rispettato**: stop dopo Opzione 1 (race condition fix), 
   no Opzione 3 nonostante tempo disponibile

### Tech debt residuo (rimandato a Sett 3 Giorno 2+)
1. **reCAPTCHA V2/V3 mismatch architetturale**: V2 prod, V3 dev
2. **compressImage() dead code in upload-flow.js** (Strategia A delega 
   tutto a CF generateThumbnails)
3. **Password admin "RindiFusi" hardcoded** in 3 posti: migrare a 
   Firebase Auth + custom claims
4. **gallery-script.js status filter**: aggiungere quando moderazione 
   admin attiva (richiederà indice composito Firestore)
5. **Merge commit "A A A" cosmetico** in git history main

### Roadmap aggiornata
- ✅ Sett 1: DONE (tag v1.0-foundations)
- ✅ Sett 2: DONE (tag v2.0-upload-redesign, 15 maggio)
- 🟢 Sett 3: IN CORSO
  - ✅ Giorno 1 sabato 16 mag (oggi): uploader_name + deleteSelected + race condition fix
  - 📋 Giorno 2 domenica 17 mag: Moderazione admin (admin-media + CF moderateMedia + galleria filter status)
  - 📋 Giorno 3-7: AI scoring (Claude Vision) + polish
- 📋 Sett 4-5 (compressed): live page + AI Storyteller
- 🎯 1 giugno: MVP COMPLETO TESTATO INTERNAMENTE (16 giorni rimangono)
- 🎉 5 luglio: matrimonio

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
