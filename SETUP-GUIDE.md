# 🎉 Guida Completa Setup Sito Matrimonio

## 📋 RIEPILOGO MODIFICHE COMPLETATE

### ✅ 1. FIX ENCODING & DOWNLOAD
- **Encoding UTF-8**: Tutti i file ora usano UTF-8 correttamente
- **Download Admin**: Implementato metodo Blob con fallback per risolvere errori CORS
- **Messaggio di successo**: Ora mostra correttamente il numero di file scaricati

### ✅ 2. CERIMONIA & RICEVIMENTO
- **Chiesa**: Chiesa e Conservatorio di San Niccolò, Prato (ore 15:30)
- **Ricevimento**: Villa Corsini a Mezzomonte, Impruneta (ore 18:00)
- **Google Maps**: Pulsanti diretti per navigazione
- **Parcheggio**: Informazioni su parcheggio disponibile

### ✅ 3. LA NOSTRA STORIA
- **Countdown Timer**: Timer dinamico fino al 5 luglio 2026
- **Timeline**: 3 momenti principali (Primo Incontro, Proposta, Grande Giorno)
- **Sezione Social**: Hashtag #AndreaGiulia2026 con link Instagram

### ✅ 4. DOVE DORMIRE
- **3 Hotel di Esempio**:
  - Hotel Villa Casagrande (Figline Valdarno)
  - B&B Il Vicario (Impruneta)
  - Agriturismo Le Torri (Impruneta)
- Link Google Maps per ogni struttura

### ✅ 5. RSVP AVANZATO
- **Campo Intolleranze**: Nuovo campo per intolleranze alimentari
- **Deadline**: 1° maggio 2026 ben visibile
- **Campo Telefono**: Aggiunto per contatti
- **Email Automatica**: Sistema EmailJS integrato
- **Modifica Conferma**: Link per modificare la propria risposta
- **ReCAPTCHA**: Protezione anti-spam
- **Contatti Emergenza**: Francesco per il giorno del matrimonio

### ✅ 6. LISTA NOZZE
- **IBAN**: IT60 X054 2811 1010 0000 0123 456
- **6 Esperienze Luna di Miele**: 
  - Cena Romantica sulla Spiaggia (€150)
  - Escursione in Barca al Tramonto (€200)
  - Giornata SPA di Coppia (€250)
  - Escursione Snorkeling (€180)
  - Tour Culturale Privato (€300)
  - Volo in Mongolfiera all'Alba (€400)

### ✅ 7. ADMIN PANEL RSVP (NUOVO!)
- **Password**: RindiFusi
- **Statistiche**:
  - Totale confermati/non confermati
  - Numero totale ospiti
  - Persone con intolleranze
- **Tabella Prenotazioni**: Nome, Email, Telefono, Partecipazione, N. Ospiti, Intolleranze, Messaggio, Data
- **Funzioni**:
  - Ricerca per nome/email
  - Filtri (tutti, confermati, non confermati, con intolleranze)
  - Ordinamento (più recenti, più vecchie, nome A-Z)
  - Visualizza dettagli completi
  - Elimina prenotazioni
  - **Export CSV**: Scarica tutte le prenotazioni in CSV
  - **Export Excel**: Scarica in formato Excel
- **URL**: `admin-rsvp.html`

### ✅ 8. GALLERIA UPGRADE
- **Limiti Upload**: Max 10 foto + 3 video per upload
- **Compressione Automatica**: Le immagini vengono compresse a 1920x1920px max con qualità 80%
- **Hashtag**: Messaggio di promemoria #AndreaGiulia2026
- **Telegram Rimosso**: Solo WhatsApp per condivisione

### ✅ 9. FOOTER AGGIORNATO
- **Copyright**: © 2026 Afanakavav
- **Contatti**: francesco.perone00@gmail.com | +39 339 898 5125
- **Link Admin Nascosti**: Icone piccole per Admin Galleria e Admin RSVP

---

## 🔧 CONFIGURAZIONI NECESSARIE

### 1️⃣ **EmailJS (Email Automatiche RSVP)**

#### Step 1: Crea Account EmailJS
1. Vai su https://www.emailjs.com/
2. Registrati gratuitamente (100 email/mese gratis)
3. Verifica email

#### Step 2: Configura Service
1. Dashboard → Email Services → Add New Service
2. Scegli Gmail (o altro provider)
3. Connetti il tuo account email
4. Copia il **Service ID** (es: `service_abc123`) (Francesco / service_yp2w08r)

#### Step 3: Crea Template Email
1. Dashboard → Email Templates → Create New Template
2. Usa questo template:

**Template Name**: `rsvp_confirmation`  (template_6sj1bah)

**Template Content**:
```
Oggetto: Conferma RSVP - Matrimonio Andrea & Giulia

Ciao {{to_name}},

Grazie per aver confermato la tua partecipazione al matrimonio di Andrea & Giulia!

RIEPILOGO CONFERMA:
- Partecipazione: {{attendance}}
- Numero Ospiti: {{guests}}
- Intolleranze Alimentari: {{intolerances}}
- Messaggio: {{message}}

DETTAGLI EVENTO:
📅 Data: Domenica 5 Luglio 2026
🕐 Cerimonia: ore 15:30 - Chiesa di San Niccolò, Prato
🍽️ Ricevimento: ore 18:00 - Villa Corsini a Mezzomonte, Impruneta

Non vediamo l'ora di festeggiare con te!
Se hai bisogno di modificare la tua conferma, visita il sito.

Con affetto,
Andrea & Giulia

---
Per emergenze il giorno del matrimonio: +39 339 898 5125
```

3. Salva e copia il **Template ID** (es: `template_xyz789`)  (template_6sj1bah)

#### Step 4: Ottieni Public Key
1. Dashboard → Account → API Keys
2. Copia la **Public Key** (es: `user_ABC123xyz`)  (cVcAe6MvmwdmXfCXo)

#### Step 5: Aggiorna il Codice
Apri `rsvp-handler.js` e sostituisci:

```javascript
// Riga 3
emailjs.init("YOUR_EMAILJS_USER_ID"); // Sostituisci con la tua Public Key

// Riga 71
await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams);
// Sostituisci con i tuoi Service ID e Template ID
```

---

### 2️⃣ **Google reCAPTCHA (Anti-Spam)**

#### Step 1: Registra il Sito
1. Vai su https://www.google.com/recaptcha/admin/create
2. Accedi con account Google
3. Compila il form:
   - **Label**: Matrimonio Andrea Giulia
   - **reCAPTCHA type**: reCAPTCHA v2 → "I'm not a robot" Checkbox
   - **Domains**: Aggiungi:
     - `localhost` (per testing)
     - `127.0.0.1` (per testing)
     - Il tuo dominio GitHub Pages (es: `afanakavav.github.io`)
4. Accetta Terms of Service
5. Clicca "Submit"

#### Step 2: Ottieni Site Key
1. Copia la **Site Key** (stringa lunga, inizia con `6L...`)

#### Step 3: Aggiorna il Codice
Apri `index.html` e sostituisci alla riga 315:

```html
<div class="g-recaptcha" data-sitekey="6LcExample_AAAAAAAAAAAAAAAA_placeholder"></div>
```

con:

```html
<div class="g-recaptcha" data-sitekey="LA_TUA_SITE_KEY_QUI"></div>
```

#### Step 4: Verifica reCAPTCHA nel Form Handler
Il form RSVP attualmente non verifica il reCAPTCHA lato server (richiederebbe backend).
Per ora è solo visuale. Per implementazione completa, servono Cloud Functions.

---

### 3️⃣ **Dati da Personalizzare**

#### IBAN (index.html, riga 418)
```html
<span class="iban-code">IT60 X054 2811 1010 0000 0123 456</span>
```
Sostituisci con il vostro IBAN reale.

#### Intestatario (index.html, riga 417)
```html
<p><strong>Intestatario:</strong> Andrea Rossi & Giulia Bianchi</p>
```
Sostituisci con i vostri nomi completi.

#### Timeline "La Nostra Storia" (index.html, righe 90-130)
Personalizza i 3 eventi con le vostre date e storie reali:
- Il Primo Incontro (estate 2020)
- La Proposta (dicembre 2024)
- Il Grande Giorno (5 luglio 2026)

#### Hotel "Dove Dormire" (index.html, righe 203-250)
Aggiorna con hotel veri nelle vicinanze:
- Nomi hotel
- Telefoni
- Distanze precise
- Link Google Maps corretti

---

## 🚀 DEPLOY SU GITHUB PAGES

### Se è la Prima Volta:
```bash
cd C:\Users\frape\matrimonio-sito
git add .
git commit -m "Completato sito matrimonio con tutte le funzionalità"
git push origin main
```

### Se Aggiorni dopo Modifiche:
```bash
cd C:\Users\frape\matrimonio-sito
git add .
git commit -m "Aggiornamento dati personalizzati"
git push origin main
```

### Attiva GitHub Pages:
1. Vai su GitHub → Repository `matrimonio-andrea-giulia`
2. Settings → Pages
3. Source: Deploy from a branch
4. Branch: `main` → `/root`
5. Save

Il sito sarà online a: `https://afanakavav.github.io/matrimonio-andrea-giulia/`

---

## 🔒 SICUREZZA FIREBASE API KEY

### Limita l'API Key:
1. Vai su https://console.cloud.google.com/
2. Seleziona progetto: `matrimonio-andrea-giulia-2026`
3. APIs & Services → Credentials
4. Clicca sulla tua API Key
5. Application restrictions → HTTP referrers (web sites)
6. Aggiungi:
   ```
   https://afanakavav.github.io/*
   http://127.0.0.1:*
   ```
7. Salva

---

## 📱 TESTING

### Test Locale (con Live Server):
1. Apri VS Code nella cartella `matrimonio-sito`
2. Click destro su `index.html` → "Open with Live Server"
3. Testa tutte le funzionalità

### Test Online:
1. Apri il sito su GitHub Pages
2. Testa RSVP form
3. Testa upload foto (con limiti 10 foto + 3 video)
4. Testa Admin Panel Galleria (password: RindiFusi)
5. Testa Admin Panel RSVP (password: RindiFusi)

---

## 📊 MONITORAGGIO RSVP

### Accesso Admin RSVP:
1. Vai su `https://afanakavav.github.io/matrimonio-andrea-giulia/admin-rsvp.html`
2. Password: `RindiFusi`
3. Visualizza statistiche in tempo reale
4. Esporta CSV/Excel per stampa lista ospiti

### Export per Catering:
1. Admin RSVP → "Scarica Excel"
2. Apri in Excel/Google Sheets
3. Filtra per "Partecipazione = Sì"
4. Somma colonna "N. Ospiti" per totale
5. Leggi colonna "Intolleranze" per menu speciali

---

## 🆘 PROBLEMI COMUNI

### 1. Email non vengono inviate
- Verifica EmailJS Service ID e Template ID in `rsvp-handler.js`
- Controlla quota EmailJS (max 100/mese gratis)
- Verifica connessione email in EmailJS dashboard

### 2. Upload foto non funziona
- Verifica regole Firebase Storage in Firebase Console
- Controlla che la data sia nel range consentito
- Max 10 foto + 3 video per upload

### 3. Admin Panel non si apre
- Password: `RindiFusi` (case sensitive)
- Cancella cache browser (Ctrl+Shift+Delete)
- Controlla console browser per errori (F12)

### 4. Download foto Admin da errore
- Problema CORS di GitHub Pages con Firebase
- Il sistema tenta automaticamente fallback (apre in nuova tab)
- Consiglio: testare in locale con Live Server

---

## 📝 FILE CREATI/MODIFICATI

### Nuovi File:
- `rsvp-handler.js` - Gestione form RSVP e countdown
- `admin-rsvp.html` - Admin panel prenotazioni
- `admin-rsvp-script.js` - Logic admin RSVP
- `SETUP-GUIDE.md` - Questa guida

### File Modificati:
- `index.html` - Tutte le sezioni aggiornate
- `styles.css` - +600 righe di stili nuovi
- `admin-script.js` - Fix download + rimozione Telegram
- `admin-styles.css` - Stili tabella RSVP
- `upload-modal.js` - Limiti + compressione
- `gallery.html` - Footer aggiornato
- `admin.html` - Link Admin RSVP

---

## 🎨 PERSONALIZZAZIONI FUTURE

### Cambiare Colori:
Modifica in `styles.css` (righe 8-17):
```css
:root {
    --primary-color: #d4af37;      /* Oro */
    --secondary-color: #8b4513;    /* Marrone */
    --accent-color: #f5f5dc;       /* Beige */
}
```

### Cambiare Font:
Modifica in `index.html` (riga 8) il link Google Fonts.

### Aggiungere Foto Reali:
Sostituisci URL Unsplash in `index.html` con le vostre foto caricate su:
- Imgur (gratuito)
- Google Drive (public link)
- Firebase Storage

---

## 📞 CONTATTI

Per supporto tecnico:
- **Email**: francesco.perone00@gmail.com
- **Telefono**: +39 339 898 5125

---

## 🎉 CONGRATULAZIONI!

Il sito è completo e pronto per il vostro matrimonio! 

**Ricordatevi di:**
1. ✅ Configurare EmailJS per email automatiche
2. ✅ Configurare reCAPTCHA per anti-spam
3. ✅ Aggiornare IBAN e dati personali
4. ✅ Testare tutto prima di condividere il link
5. ✅ Fare backup periodici del database Firebase

**Buon matrimonio Andrea & Giulia!** 💍❤️🎊

