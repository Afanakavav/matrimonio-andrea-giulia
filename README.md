# Matrimonio Andrea & Giulia

Sito per il matrimonio (5 luglio 2026).

- **Sito online:** [andreagiulia5luglio26.it](https://andreagiulia5luglio26.it)
- **Copia su GitHub Pages:** [afanakavav.github.io/matrimonio-andrea-giulia](https://afanakavav.github.io/matrimonio-andrea-giulia)

---

## Contenuto

- Home, La Nostra Storia, Cerimonia, Ricevimento, Dove Dormire
- **RSVP** con conferma via email (EmailJS) e verifica reCAPTCHA (Cloud Function)
- **Deadline RSVP:** 1° maggio 2026
- Galleria foto/video, upload da invitati
- Lista nozze / esperienze luna di miele

---

## Tecnologie

- HTML, CSS, JavaScript
- **Firebase:** Firestore, Storage, Cloud Functions (RSVP + reCAPTCHA)
- **EmailJS** per email di conferma RSVP
- **reCAPTCHA v2** sul form RSVP

---

## Configurazione locale

- **Firebase:** i dati sono in `firebase-config.js`. Per sovrascrivere in locale (senza committare), crea `config.local.js` con `window.FIREBASE_CONFIG = { ... }` (il file è in `.gitignore`).
- **Cloud Functions:** in `functions/` serve un file `.env` con `RECAPTCHA_SECRET_KEY=...` (chiave segreta reCAPTCHA). Non committare `.env`.
- **Admin:** pannello protetto da password (vedi `auth-manager-secure.js`). Accesso da `admin-hub.html` → Media o RSVP.

---

## Deploy

**Importante:** dopo ogni modifica eseguire **entrambi** i comandi:

1. `firebase deploy` → aggiorna [matrimonio-andrea-giulia-2026.web.app](https://matrimonio-andrea-giulia-2026.web.app)
2. `git push` → aggiorna [andreagiulia5luglio26.it](https://andreagiulia5luglio26.it) (GitHub Pages)

Il dominio personalizzato è configurato tramite il file `CNAME` (andreagiulia5luglio26.it) e i record DNS presso Register.it.
