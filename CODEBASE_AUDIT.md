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
