# Modifiche fatte in locale con Cursor

Riepilogo delle modifiche applicate al sito **Matrimonio Andrea & Giulia** nella cartella locale (non ancora necessariamente pubblicate su GitHub Pages).

---

## 1. `firebase-config.js`

- **Config per il sito in linea (GitHub Pages)**  
  `config.local.js` è in `.gitignore`, quindi su GitHub Pages non esiste e prima il sito usava il placeholder `YOUR_API_KEY_HERE` e Firebase non funzionava.
- **Modifica:** inserita la configurazione Firebase reale come fallback in `firebase-config.js` (stessa config di `config.local.js`). In locale continua a funzionare con `config.local.js` se presente; in deploy viene usato il fallback.

---

## 2. `index.html`

- **Codifica:** convertito da UTF-16 a UTF-8 (tramite script `fix-index-encoding.js`).
- **Firebase App Check rimosso:** eliminato il blocco che inizializzava App Check con reCAPTCHA v3, per evitare gli errori in console (`AppCheck: ReCAPTCHA error`) e conflitti con il form RSVP.
- **Script reCAPTCHA:**  
  - Rimosso lo script reCAPTCHA v3 (`api.js?render=...`).  
  - Lasciato solo lo script reCAPTCHA v2 (`https://www.google.com/recaptcha/api.js`) per la checkbox “Non sono un robot” nel form RSVP.
- **Firebase SDK:** rimosso il caricamento di `firebase-app-check-compat.js` (non più usato).
- **config.local.js:** rimosso l’attributo `onerror` dal tag `<script src="config.local.js">` per evitare il messaggio in console “config.local.js not found, using placeholder config” quando il file non c’è (es. su GitHub Pages).

---

## 3. `rsvp-handler.js`

- **Caricamento reCAPTCHA v2:** aggiunta la funzione `loadRecaptchaV2()` che, se serve, inietta lo script reCAPTCHA v2 così la checkbox del form RSVP viene renderizzata (backup rispetto allo script in `index.html`).
- **Chiamate a `grecaptcha.reset()` rese sicure:** prima di chiamare `grecaptcha.reset()` viene controllato che `grecaptcha` e `grecaptcha.reset` esistano, per evitare errori se il widget non è ancora caricato.

---

## 4. `fix-index-encoding.js` (nuovo file)

- Script Node da eseguire una volta dalla cartella `matrimonio-sito`:
  ```bash
  node fix-index-encoding.js
  ```
- **Cosa fa:**  
  - Legge `index.html` (supporta UTF-16 LE e UTF-8).  
  - Rimuove il blocco “Firebase App Check Initialization”.  
  - Rimuove l’`onerror` dal tag `config.local.js`.  
  - Aggiunge lo script reCAPTCHA v2 in testa.  
  - Salva `index.html` in UTF-8.

*(Dopo le correzioni manuali successive, parte di queste modifiche sono già state applicate direttamente a `index.html`; lo script può essere usato in altri ambienti o come riferimento.)*

---

## File non modificati (solo riferimento)

- **`auth-manager-secure.js`**, **`admin-script.js`**, **`admin-rsvp-script.js`**, **`admin-*.html`**: nessuna modifica in questa sessione.
- **`functions/`** (Cloud Function `submitRSVP`, verifica reCAPTCHA): nessuna modifica in questa sessione.

---

## Come vedere le modifiche in Cursor

1. Apri la cartella `matrimonio-sito` in Cursor.
2. Usa **Source Control** (icona ramo a sinistra) per vedere i file modificati e il diff.
3. Apri questo file **`MODIFICHE-CURSOR.md`** per leggere il riepilogo.
4. Per confrontare con la versione precedente: tasto destro su un file → **Open Changes** o **Compare with...** per vedere le differenze.

---

## Pubblicare le modifiche su GitHub Pages

Per avere le stesse correzioni (reCAPTCHA visibile, niente errori App Check, RSVP che funziona) sul sito in linea:

```bash
cd matrimonio-sito
git add .
git status
git commit -m "Fix RSVP: reCAPTCHA v2, rimosso App Check, firebase-config per deploy"
git push
```

Poi in [reCAPTCHA Admin](https://www.google.com/recaptcha/admin) aggiungere il dominio `afanakavav.github.io` alla chiave reCAPTCHA v2 del sito.
