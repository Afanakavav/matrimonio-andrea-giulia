# 📘 Product Requirements Document (PRD)
## Live Wedding Gallery — Andrea & Giulia

**Versione:** 1.0
**Data:** 7 maggio 2026
**Autore:** Francesco Perone (PM/Owner) + Claude (PM advisor)
**Matrimonio:** 5 luglio 2026
**Repository:** https://github.com/Afanakavav/matrimonio-andrea-giulia
**Sito live:** https://andreagiulia5luglio26.it

---

## 1. Vision & Goals

### Vision

Trasformare il sito statico del matrimonio in una **esperienza condivisa live cinematografica**, dove gli invitati possono caricare foto/video durante la giornata del matrimonio e vederli apparire in tempo reale su un grande schermo (TV/proiettore) in sala, creando un effetto "wow" emotivo e tecnologico mai visto in matrimoni tradizionali.

### Goals primari

1. **Engagement degli invitati**: rendere semplice (zero attrito) caricare foto/video durante la giornata
2. **Effetto WOW collettivo**: schermo in sala che mostra in tempo reale i contenuti caricati con caption AI emotive e layout cinematografici
3. **Curation di qualità**: dare al moderatore (Francesco) gli strumenti per scartare foto sfocate/duplicate e mettere in evidenza quelle migliori
4. **Memoria duratura**: archiviare TUTTI i media caricati (anche scartati) per gli sposi post-matrimonio

### Goals secondari

- Coerenza con il design romantic/elegante esistente del sito
- Funzionamento perfetto su mobile (la maggior parte degli invitati userà il telefono)
- Rispetto del budget: <50€ totali per tutto il progetto
- Integrazione con stack esistente Firebase (no migrazione)

### Non-Goals

- ❌ Non vogliamo un'app mobile dedicata (solo browser via QR code)
- ❌ Non vogliamo registrazione/login per invitati (frizione)
- ❌ Non vogliamo monetizzazione o ads
- ❌ Non vogliamo riscrivere il sito da zero (vanilla JS è ok)
- ❌ Non vogliamo Next.js, React, Supabase, o altri stack

---

## 2. Personas

### 👤 Persona 1: Marco — l'Invitato medio

**Demografia:** 35 anni, parente di Giulia, usa lo smartphone per tutto.

**Scenario:**
1. Arriva al matrimonio
2. Vede il QR code sul tavolo del ristorante
3. Lo scansiona con la fotocamera
4. Atterra sulla pagina upload del sito
5. Inserisce il suo nome ("Marco")
6. Carica 5 foto del cocktail in 30 secondi
7. Vede una foto apparire sul grande schermo della sala 1 minuto dopo
8. Si emoziona, ne carica altre 10

**Bisogni:**
- Velocità (max 30 secondi totali per upload)
- Zero login, zero password
- Conferma chiara che il caricamento è andato a buon fine
- Funzionare anche con WiFi/4G lenti

**Frustrazioni evitate:**
- Nessuna app da scaricare
- Nessun campo "obbligatorio" complicato (solo nome libero)
- Niente errori criptici

### 👤 Persona 2: Francesco — il Moderatore

**Scenario:**
1. È a sua volta un invitato, ma con il telefono ha la dashboard admin aperta
2. Riceve notifica visiva (non sonora, è in chiesa) di nuovi caricamenti
3. Swipe destra/sinistra per approvare o scartare
4. Tiene d'occhio i media auto-filtered dall'AI per ricontrollarli
5. Mette in "featured" 5-10 momenti chiave per il proiettore
6. Ogni tanto controlla lo schermo per assicurarsi che gira bene

**Bisogni:**
- Mobile-first (userà il telefono tutto il giorno)
- Decisioni rapide (1 tap = approva/rifiuta)
- Vedere statistiche quick (quanti media, quanti uploader)
- Tornare indietro se ha sbagliato (undo)

### 👤 Persona 3: Giulia & Andrea — gli Sposi

**Scenario:**
1. Durante il matrimonio sono troppo presi per usare attivamente il sistema
2. Gli viene mostrato lo schermo con la live gallery durante il taglio della torta
3. Si emozionano vedendo le foto dei loro invitati
4. **Dopo il matrimonio (post-evento)** accedono a una pagina admin privata
5. Scaricano TUTTI i media (anche scartati) come ricordo eterno
6. Possono ancora ricevere caricamenti per 2 settimane post-matrimonio

**Bisogni:**
- Ricevere TUTTI i contenuti (no perdita)
- Pagina archivio completa post-matrimonio
- Possibilità di download massivo

---

## 3. User Journey End-to-End

### 🎬 Scenario: Marco al cocktail del matrimonio

```
[15:00] Marco arriva alla cerimonia in chiesa
        │
        ▼
[16:30] Cerimonia finita, va al ricevimento
        │
        ▼
[17:00] Vede il QR code sul tavolo
        │ Scansiona con fotocamera iPhone
        ▼
[17:01] Atterra su https://andreagiulia5luglio26.it/upload.html
        │ - Pagina mobile-first, sfondo elegante
        │ - Banner: "🎉 Carica i tuoi momenti!"
        │ - Campo: "Il tuo nome (per sapere chi ha condiviso)"
        ▼
[17:01] Marco scrive "Marco" → click "Inizia"
        │ Il nome viene salvato in localStorage
        ▼
[17:02] Schermata di upload:
        │ - Big button: "📸 Carica foto"
        │ - Big button: "🎥 Carica video"
        │ - Counter: "0 file caricati finora"
        ▼
[17:02] Click "Carica foto" → sistema apre la galleria iOS/Android
        │ Selezione multipla (5 foto)
        ▼
[17:03] Schermata progress:
        │ - Compressione client-side (1-3 sec totali)
        │ - Upload parallelo Firebase Storage (5-10 sec)
        │ - Progress bar per file
        ▼
[17:04] Schermata successo:
        │ "✨ Grazie Marco! Le tue 5 foto sono state inviate.
        │  Guardale apparire sul grande schermo!"
        │
        │ Bottone: "Carica altre"
        ▼
[17:04-onward] Backend lavora in parallelo:
        │ - Cloud Function generaThumbnails crea versioni 600px e 2560px
        │ - Cloud Function aiPhotoCurator analizza foto via Claude Vision
        │ - 4 foto OK + 1 marcata come "blurry" → auto_filtered
        │ - 3 foto migliori ricevono score AI 8+ (highlighted nella dashboard)
        │
[17:05] Francesco (moderatore) sul telefono vede notifica:
        │ "+5 da Marco | 4 OK + 1 auto-filtered"
        │ Swipe right per approvare quelle suggerite
        ▼
[17:06] La pagina /live (proiettata sulla TV in sala) riceve il
        realtime update:
        │ - Pop-up animato: "📸 Appena caricato da Marco"
        │ - La foto migliore di Marco viene mostrata in fullscreen
        │   con effetto Ken Burns
        │ - Caption AI generata: "🥂 Marco cattura il sorriso degli sposi"
        ▼
[17:06] Marco alza lo sguardo, vede la sua foto sul grande schermo
        │ ✨ EFFETTO WOW ✨
        │ Si gira verso il tavolo: "Guardate! L'ho fatta io!"
        ▼
[17:07] Marco è motivato → carica altre 10 foto nei prossimi 10 minuti
        │ Effetto contagioso → tutti gli invitati iniziano a caricare
```

### Flussi paralleli

**Flusso moderazione**: Francesco apre `/admin-media.html`, login con password, dashboard mobile con 4 tab (Pending, Approved, Rejected, Auto-filtered), filtri per uploader, swipe per moderare.

**Flusso schermo**: TV in sala apre `/live.html` in fullscreen, autoplay, 4 layout cinematografici che ruotano ogni 8-12 sec, scene basate su orario (cerimonia/cocktail/cena/festa).

**Flusso post-matrimonio**: pagina admin `/archive.html` (privata, password) con tutti i media in tutte le categorie, filtri avanzati, download massivo zip.

---

## 4. Functional Requirements

### 4.1 Upload (Settimana 2)

#### FR-UPL-01: Pagina /upload.html
- Pagina dedicata, separata da index.html
- Mobile-first design, responsive desktop
- Coerente con palette esistente (beige/verde/serif)
- Funziona offline-first per il form di nome (localStorage)

#### FR-UPL-02: Identificazione invitato
- Campo "Nome" (text input, max 50 char)
- **NON obbligatorio** ma fortemente raccomandato (placeholder dice "Aiuta gli sposi a ricordare chi ha condiviso!")
- Salvato in localStorage per riuso
- Modificabile in qualsiasi momento

#### FR-UPL-03: Selezione file
- Pulsanti separati per "📸 Foto" e "🎥 Video" (più chiaro su mobile)
- Selezione multipla nativa (input type="file" multiple)
- Tipi accettati: JPG, PNG, HEIC, GIF (foto); MP4, MOV (video)
- Validazione dimensione: max 20MB foto, max 100MB video

#### FR-UPL-04: Compressione client-side
Pipeline per ogni foto:
1. Riduce a max 2560x1440px (versione "display") JPEG q85 → ~400KB
2. Riduce a 600x600px (versione "thumb") JPEG q75 → ~50KB
3. Mantiene file originale per upload separato

Pipeline per video:
- NO compressione client (troppo pesante per mobile)
- Compressione server-side post-upload via Cloud Function (settimana 3)

#### FR-UPL-05: Upload parallelo
- Upload simultaneo di max 5 file in parallelo (Promise.all con limit)
- Progress bar per ogni file (ChunkedUpload Firebase)
- Retry automatico in caso di errore di rete (3 tentativi)

#### FR-UPL-06: Conferma e ringraziamento
- Schermata finale con messaggio personalizzato col nome dell'utente
- Counter "X file inviati"
- CTA: "Carica altre" o "Vai alla galleria live"

#### FR-UPL-07: Limiti e abuse prevention
- **Nessun limite di file per invitato** (decisione esplicita di Francesco)
- Rate limiting client-side: max 10 file/minuto per evitare DDoS
- Rate limiting server-side via Cloud Function (settimana 3)

#### FR-UPL-08: QR Code
- Sezione dedicata in index.html con QR code che linka a /upload.html
- QR code generato lato client con `qr-code-styling` lib
- Versione stampabile per i tavoli (PDF generato al volo)

### 4.2 Storage & Database (Settimana 2)

#### FR-DB-01: Firestore collection `wedding-media` (estesa)

```javascript
{
  id: string (auto),
  uploadDate: timestamp,
  uploader_name: string,                  // "Marco" o vuoto
  file_type: "image" | "video",
  
  // URL
  original_url: string,                   // Firebase Storage URL
  display_url: string,                    // versione 2560px
  thumb_url: string,                      // versione 600px
  
  // File metadata
  fileName: string,
  fileSize: number,
  storagePath: string,
  duration: number | null,                // solo video, in secondi
  
  // Moderation
  status: "pending" | "approved" | "rejected" | "auto_filtered" | "featured",
  moderated_by: string | null,
  moderated_at: timestamp | null,
  
  // AI scoring (settimana 3)
  ai_score: number | null,                // 1-10 da Claude Vision
  ai_caption: string | null,
  blur_score: number | null,
  brightness: number | null,
  duplicate_of: string | null,            // ID di un altro media simile
  scene: "ceremony" | "cocktail" | "dinner" | "party" | null,
  
  // Display tracking
  shown_at: timestamp | null,             // per badge "Just now"
  shown_count: number                     // quante volte è apparso in /live
}
```

#### FR-DB-02: Firebase Storage struttura

```
/wedding-media/
  /originals/
    {timestamp}-{uuid}.jpg|mp4
  /display/
    {timestamp}-{uuid}.jpg               (2560px JPEG)
  /thumbs/
    {timestamp}-{uuid}.jpg               (600px JPEG)
```

#### FR-DB-03: Firestore rules (estese)

```
match /wedding-media/{docId} {
  allow read: if true;                   // pubblico per /live
  allow create: if 
    request.time >= timestamp.date(2026, 7, 4) &&
    request.time <= timestamp.date(2026, 7, 19) &&
    validatePayload(request.resource.data);
  allow update: if false;                // solo via Admin SDK
  allow delete: if false;                // solo via Admin SDK
}
```

### 4.3 Moderation Dashboard (Settimana 3)

#### FR-MOD-01: Pagina /admin-media.html (sostituisce admin.html)
- Login con password "RindiFusi" (sistema esistente)
- Mobile-first
- 4 tab navigabili in alto: Pending / Approved / Rejected / Auto-filtered
- Counter accanto a ogni tab

#### FR-MOD-02: Real-time updates
- Subscription `onSnapshot` su `wedding-media` filtrato per `status`
- Nuovi media appaiono in cima senza refresh
- Animazione di entrata fade-in

#### FR-MOD-03: Card media (mobile)
- Thumbnail 300x300 (versione thumb_url)
- Nome uploader
- Timestamp relativo ("2 min fa")
- AI score con stelline (se disponibile)
- Bottoni grandi: ✅ Approva / ❌ Scarta / ⭐ Featured

#### FR-MOD-04: Swipe gestures
- Swipe right su una card → approva
- Swipe left → scarta
- Long press → mostra foto a tutto schermo per ispezione

#### FR-MOD-05: Filtri e search
- Filtro per uploader (dropdown con nomi unici)
- Filtro per AI score (>=8 / >=6 / qualsiasi)
- Search testuale in caption AI
- Filtro per scene (ceremony/cocktail/dinner/party)

#### FR-MOD-06: Statistiche
- Counter live: "📸 234 totali", "✅ 156 approvate", "👥 23 uploader"
- Lista uploader top 5 con counter
- Grafico timeline (foto/ora) con sparkline

### 4.4 Live Display (Settimana 4)

#### FR-LIVE-01: Pagina /live.html (sostituisce gallery.html)
- Public, no auth (è il display per tutti)
- Detection automatica device: Cinema Mode (>1200px) vs Elegant Mode (<768px)
- Modalità Stage (tasto F per fullscreen + presentazione TV)

#### FR-LIVE-02: Cinema Mode (TV/proiettore)
- Sfondo nero pieno (#0a0a0a)
- Tipografia gigante serif (titoli 96-120px)
- Caption AI sovraimpresse stile cinema
- Foto a tutto schermo con Ken Burns
- Letterbox cinematografico per video
- Transizioni fade nero
- Counter live in alto a destra (font monospace)

#### FR-LIVE-03: Elegant Mode (mobile)
- Toni neutri coerenti col sito
- Layout verticale a card romantiche
- Caption AI in piccolo sotto ogni media
- Scrolling fluido infinite scroll
- Navigation discreta in alto

#### FR-LIVE-04: Sistema scene temporizzate

| Orario | Scena | Mood AI |
|--------|-------|---------|
| 15:00–17:00 | 💒 La Cerimonia | Caption emotive, lente, romantiche |
| 17:00–19:00 | 🥂 Il Cocktail | Toni vivaci, brindisi, sorrisi |
| 19:00–22:00 | 🍝 La Cena | Caption conviviali, cibo, discorsi |
| 22:00–02:00 | 💃 La Festa | Energia alta, emoji, ritmo veloce |

Cambio scena: transizione fade nero + titolo gigante della nuova scena.

#### FR-LIVE-05: Layout dinamici (4 template)
- **Hero**: una foto/video gigante a tutto schermo + caption sovraimpressa
- **Split**: due media affiancati (uno verticale + uno orizzontale)
- **Mosaic**: 4 media in griglia con uno più grande
- **Story**: testo poetico AI generato a tutto schermo (per pause tra media)

Rotazione automatica ogni 8-12 secondi.

#### FR-LIVE-06: Just Now badge
- Media appena approvati (<60 sec) appaiono per 10 sec con badge animato pulsante
- Testo: "📸 Appena caricato da [Nome]"

#### FR-LIVE-07: Counter live
- "🎉 [N] invitati hanno condiviso"
- "📸 [N] momenti"
- "❤️ La festa è iniziata [Xh Ym] fa"
- Animazioni numeri che salgono

#### FR-LIVE-08: Selezione media
Algoritmo:
- 70% media `approved` recenti (ultimi 30 min)
- 20% media `featured` (in evidenza dal moderatore)
- 10% pool generale `approved`

I media appena approvati (<60 sec) hanno **priorità assoluta** + badge.

### 4.5 AI Agents (Settimana 3-4)

#### FR-AI-01: Photo Curator (Claude Haiku Vision)
- Triggered: Cloud Function `aiPhotoCurator` da Storage upload
- Input: URL della foto display
- Analizza:
  - Score 1-10 (composizione, emozione, momento)
  - Soggetto rilevato (descrizione 1 frase)
  - Flag: blur/dark/inappropriate
- Output salvato in `wedding-media.ai_score`, `ai_caption`, `blur_score`, etc.

#### FR-AI-02: Storyteller (Claude Sonnet)
- Triggered: chiamata HTTP da `/live.html` ogni 30-60 secondi
- Input: scena attuale + ultimi N media + tone preferences
- Genera: caption poetica 8-12 parole, max 1 emoji
- Output: stringa di testo per overlay

#### FR-AI-03: Director (logica deterministica + Claude)
- Logica client-side per scegliere layout (Hero/Split/Mosaic/Story)
- Regole base:
  - Foto verticale singola → Hero
  - Foto + caption emotiva → Hero con sovrapposizione
  - 2+ foto stessa scena → Split o Mosaic
  - Pausa tra media → Story (testo a tutto schermo)
- Per casi ambigui, chiamata a Claude Sonnet

#### FR-AI-04: Janitor (Claude Haiku, batch notturno)
- Triggered: Cloud Scheduler ogni 24h
- Lavora su tutti i media `pending` e `auto_filtered`
- Funzioni:
  - Rileva duplicati con perceptual hashing
  - Raggruppa media per persona riconosciuta
  - Suggerisce best-of della giornata

### 4.6 Post-matrimonio (Settimana 4-5)

#### FR-POST-01: Pagina /archive.html (privata, password)
- Tutti i media in tutte le categorie
- Filtri avanzati
- Download massivo zip via Cloud Function
- Esclusivo per Giulia & Andrea (link condiviso a loro post-matrimonio)

---

## 5. Non-Functional Requirements

### Performance
- Upload con compressione client: <30 secondi per 10 foto su 4G
- Pagina /live aggiornamento: <2 secondi dal momento di approvazione
- Pagina /upload caricamento: <2 secondi su 3G
- Pagina /live caricamento: <3 secondi su 4G

### Sicurezza
- HTTPS only
- Firestore rules con delete:false, update:false
- Rate limiting con hash IP per RSVP e upload
- File scanning antivirus (Firebase Storage built-in)
- No API keys nel codice client (uso Firebase config public-safe)
- Anthropic API key in `functions/.env` (mai committata)

### Affidabilità
- Backup automatico Firestore daily (Firebase built-in)
- Tutti i media originali preservati anche se moderati
- Rollback frontend in 1 minuto via `firebase hosting:rollback`

### Privacy & GDPR
- Upload anonimo opzionale (campo nome non obbligatorio)
- IP hashati con SHA-256 prima di salvarli
- No analytics tracking di terze parti
- Diritto all'oblio: contattando direttamente gli sposi via email

### Costi target
- **Massimo 50€ totali** per tutta la durata del progetto
- Stima realistica: <20€ (free tier Firebase + ~5€ Anthropic API)

### Browser support
- Chrome 90+, Safari 14+, Firefox 88+, Edge 90+
- iOS Safari 14+, Android Chrome 90+
- No supporto IE (out of scope)

---

## 6. Architecture

### Stack confermato

```
Frontend:
├── HTML/CSS/JS vanilla (NO framework)
├── Firebase SDK 9.23.0 compat
├── browser-image-compression (compressione client)
├── qr-code-styling (QR generation)
└── Framer Motion / CSS animations (no React)

Backend:
├── Firebase Hosting (CDN globale)
├── Firestore (database + realtime)
├── Firebase Storage (media files)
├── Cloud Functions Node.js 20
│   ├── verifyRecaptcha (esistente)
│   ├── submitRSVP (esistente)
│   ├── checkRateLimit (esistente)
│   ├── generateThumbnails (NUOVA, Settimana 2)
│   ├── aiPhotoCurator (NUOVA, Settimana 3)
│   ├── aiStoryteller (NUOVA, Settimana 4)
│   ├── aiJanitor (NUOVA, Settimana 4)
│   └── archiveDownload (NUOVA, Settimana 5)
└── Anthropic Claude API (vision + text generation)

External:
├── Register.it (DNS - non toccare più)
├── reCAPTCHA v2 (form RSVP)
└── Resend/SMTP Register.it (email)
```

### Diagramma flusso

```
INVITATO (smartphone)
    │ scansiona QR
    ▼
/upload.html
    │ compressione client
    ▼
Firebase Storage (originals/, display/, thumbs/)
    │ trigger
    ▼
Cloud Function generateThumbnails
    │ scrive metadata
    ▼
Firestore wedding-media (status: pending)
    │ trigger
    ▼
Cloud Function aiPhotoCurator (Claude Vision)
    │ aggiorna ai_score
    ▼
Firestore (status: pending o auto_filtered)
    │ realtime onSnapshot
    ▼
┌─────────────────────────┬─────────────────────────┐
│                         │                         │
▼                         ▼                         ▼
/admin-media.html       /live.html              /archive.html
(Francesco modera)      (TV/mobile mostrano)    (post-matrimonio)
    │
    │ approva
    ▼
Firestore update (status: approved)
    │ realtime
    ▼
/live.html mostra con badge "Just now"
    │
    │ ogni 30s
    ▼
Cloud Function aiStoryteller (Claude Sonnet)
    │ genera caption
    ▼
/live.html aggiorna overlay testuale
```

---

## 7. Roadmap

### Settimana 1 — ✅ COMPLETATA
Foundations: fix critici, sicurezza, migrazione DNS, deploy produzione.

### Settimana 2 — Upload nuovo + QR (12-18 maggio)
- /upload.html nuovo design
- Compressione multi-resolution client
- Cloud Function generateThumbnails
- QR code generator
- Test mobile reali

### Settimana 3 — Moderation + AI scoring (19-25 maggio)
- /admin-media.html nuova dashboard
- Real-time onSnapshot
- Cloud Function aiPhotoCurator (Claude Vision)
- Filtri tecnici (blur, brightness, duplicates)
- Swipe gestures

### Settimana 4 — Live page cinematografica (26 mag - 1 giu)
- /live.html con Cinema Mode + Elegant Mode
- 4 layout dinamici
- Sistema scene temporizzate
- Cloud Function aiStoryteller
- Animazioni Ken Burns + transizioni
- Counter live

### Settimana 5 — Polish + AI Janitor (2-8 giugno)
- aiJanitor batch notturno
- Performance ottimizzazioni
- Stage Mode per proiettore
- Pagina /archive.html post-matrimonio
- Sound design opzionale

### Settimana 6 — Test reale (9-15 giugno)
- Test di carico (50+ upload concorrenti simulati)
- Test su 5+ device diversi
- **Prova generale con 10 amici reali**
- Bug fix delle 5-10 cose che salteranno fuori

### Settimana 7 — Backup plans + QR stampa (16-22 giugno)
- Generazione QR code finale con design custom
- Stampa QR card per i tavoli
- Pagine errore amichevoli
- Backup plan in caso di malfunzionamento durante l'evento
- Documentazione operativa "come fare durante il matrimonio"

### Settimana 8 — Buffer + Documentation (23-29 giugno)
- Buffer week per imprevisti
- Documentazione finale per gli sposi
- Test finali con 5+ persone reali

### Settimana 9 — FREEZE (30 giu - 5 lug)
- ❄️ Feature freeze: zero nuove feature
- Solo test, monitoring, riposo
- Briefing finale a Giulia e a chi aiuta nella moderazione live
- Ultima prova generale 1-2 giorni prima
- 🎉 **5 luglio: vivi il matrimonio. ✨**

---

## 8. Risk Register

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| WiFi del ristorante lento o down | 🟡 Media | 🔴 Alto | Test pre-evento, fallback su 4G, comunicare a invitati di usare propri dati |
| Quota Firebase superata | 🟢 Bassa | 🟡 Medio | Monitoring giornaliero pre-evento + setup billing alerts |
| Anthropic API down il giorno X | 🟢 Bassa | 🟡 Medio | Fallback a layout senza AI caption, sistema continua a funzionare |
| Bug critico scoperto il giorno del matrimonio | 🟡 Media | 🔴 Alto | Backup plan: galleria statica come fallback automatico |
| Francesco non disponibile per moderare | 🟢 Bassa | 🟡 Medio | Auto-approve mode con AI score >= 7 come fallback |
| Invitati caricano contenuti inappropriati | 🟢 Bassa | 🔴 Alto | AI vision flag, moderazione manuale, possibilità di blocco singolo uploader |
| Costo eccede 50€ | 🟢 Bassa | 🟢 Basso | Monitoring billing settimanale + early warning a 30€ |
| Custom domain DNS issue | 🟢 Bassa | 🔴 Alto | Backup branch + procedura rollback documentata |

---

## 9. Definition of Done

Per ogni feature, considerare "done" solo se:
- ✅ Codice sviluppato e committato
- ✅ Test manuale su computer + telefono
- ✅ Deploy su preview channel
- ✅ Smoke test su preview
- ✅ Deploy in produzione
- ✅ Verifica visiva sul sito vero

Per la Settimana 6+ (test reali con utenti):
- ✅ Tutto sopra +
- ✅ Test con 10 utenti reali
- ✅ Documentazione operativa scritta

---

## 10. Open Questions / TBD

- 🤔 Vogliamo chiedere agli invitati anche un'email per inviare un "thank you"
  con link alla galleria post-matrimonio?
- 🤔 Vogliamo permettere agli invitati di lasciare un breve messaggio scritto
  insieme alla foto? (max 100 char, mostrato nelle caption)
- 🤔 Cinema Mode: fare in modo che la TV cambi automaticamente mood di colore
  in base al momento? (caldo per cena, neon per festa)

---

🎯 **Questo PRD è la bibbia del progetto. Da consultare prima di ogni decisione importante.**

**Versione:** 1.0 | **Data:** 7 maggio 2026 | **Owner:** Francesco
