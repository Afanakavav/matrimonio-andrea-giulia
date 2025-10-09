# 🎬 Video Hero Section - Documentazione

## 📝 Modifiche Implementate

Il video `wedding-video.mp4` è stato aggiunto come elemento principale della Hero Section, sostituendo l'immagine statica.

---

## ✅ Caratteristiche Implementate

### 1. **Autoplay Automatico**
- Il video parte automaticamente all'apertura della pagina
- **Muted**: Il video è senza audio (richiesto per autoplay su mobile)
- **Loop**: Il video si ripete all'infinito

### 2. **Responsive Design**
- **Desktop**: Video a 500px di altezza
- **Mobile**: Video ridotto a 300px per ottimizzare lo spazio
- **Object-fit: cover**: Il video copre l'intera area mantenendo le proporzioni

### 3. **Ottimizzazioni Performance**
- **Preload**: Il video viene precaricato automaticamente
- **Intersection Observer**: Il video si mette in pausa quando non è visibile (risparmio batteria)
- **Hardware Acceleration**: Utilizzo di `transform: translateZ(0)` per accelerazione GPU

### 4. **Compatibilità Cross-Browser**
- **iOS Safari**: Attributo `playsinline` per evitare fullscreen automatico
- **Browser Vecchi**: Fallback con immagine statica
- **Controlli Nascosti**: Nessun controllo visibile (play/pause/volume)

### 5. **Fallback Automatico**
- Se l'autoplay fallisce (iOS), il video parte al primo tocco/click dell'utente
- Se il browser non supporta `<video>`, viene mostrata un'immagine di fallback

---

## 📁 File Modificati

1. **index.html**
   - Sostituita `<img>` con `<video>` nella Hero Section (linee 54-60)
   - Aggiunto script `video-handler.js` (linea 274)

2. **styles.css**
   - Aggiunti stili `.hero-video` (linee 173-206)
   - Aggiornati stili responsive per mobile (linea 830-832)

3. **video-handler.js** (NUOVO)
   - Gestisce l'autoplay intelligente
   - Implementa Intersection Observer per ottimizzare batteria
   - Gestisce fallback per iOS

4. **wedding-video.mp4** (NUOVO)
   - Video originale: `Matrimonio Giulina.mp4`
   - Dimensione: 4.38 MB
   - Formato: MP4 (compatibile con tutti i browser)

---

## 🚀 Come Testare

### Test Locale:
1. Apri `index.html` con **Live Server** (VS Code)
2. Il video dovrebbe partire automaticamente
3. Testa su mobile aprendo il sito dal cellulare

### Test su Dispositivi:
- **Desktop**: Il video dovrebbe partire automaticamente
- **Mobile**: Il video dovrebbe partire automaticamente (se in modalità non-silenziosa)
- **iOS**: Se l'autoplay fallisce, tocca lo schermo per avviare il video

---

## 🔧 Troubleshooting

### Il video non parte su iOS:
- **Causa**: iOS blocca l'autoplay fino al primo tocco dell'utente
- **Soluzione**: Tocca lo schermo, il video partirà automaticamente

### Il video appare sfocato:
- **Causa**: Il browser sta ancora caricando il video
- **Soluzione**: Attendi qualche secondo per il caricamento completo

### Il video non si vede:
- **Causa**: Il file `wedding-video.mp4` potrebbe essere mancante
- **Soluzione**: Verifica che il file sia nella cartella `matrimonio-sito`

### Il video consuma troppa batteria su mobile:
- **Soluzione**: Il sistema Intersection Observer pausa automaticamente il video quando non è visibile

---

## 🎨 Personalizzazioni Future

Se vuoi modificare il video:
1. Sostituisci `wedding-video.mp4` con il nuovo video
2. Mantieni il formato MP4 per compatibilità
3. Comprimi il video se supera i 10 MB (per performance)

Per cambiare l'altezza del video:
- **Desktop**: Modifica `.hero-video { height: 500px; }` in `styles.css` (linea 176)
- **Mobile**: Modifica altezza a linea 831 di `styles.css`

---

## ✨ Risultato Finale

- ✅ Video autoplay automatico
- ✅ Loop infinito
- ✅ Nessun audio (muted)
- ✅ Bordi arrotondati (20px)
- ✅ Responsive mobile/desktop
- ✅ Ottimizzato per performance
- ✅ Compatibile con tutti i browser
- ✅ Fallback per browser vecchi

---

**Fatto con ❤️ per Andrea & Giulia**

