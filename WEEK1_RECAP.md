# 📋 WEEK 1 RECAP — Foundations & Migration

**Periodo:** 7 maggio 2026 (1 giornata intensiva)
**Tag versione:** `v1.0-foundations`
**Branch principale:** `main` (con feature/live-gallery e backup/pre-live-gallery preservati)
**Status:** ✅ **COMPLETATA**

---

## 🎯 Obiettivo della settimana

Riparare i bug critici del sito esistente, mettere in sicurezza l'infrastruttura, e **migrare il dominio custom da GitHub Pages a Firebase Hosting**, preparando il terreno per le feature di live gallery (Settimana 2+).

---

## ✅ Cosa è stato fatto

### 🛠️ Fix critici al sito (9)

| # | Fix | Commit | File toccati |
|---|-----|--------|--------------|
| 1 | Feature flag temporale per upload (apertura 4 lug 18:00, chiusura 19 lug) | `4e548bb` | firebase-config.js, index.html, upload-modal.js, styles.css |
| 2 | Rules Firestore: rimossa deadline RSVP, bloccato delete/update pubbliche | `faa232e` | firestore.rules |
| 3 | Link Admin reso discreto (visibile ma non appariscente) + robots.txt | `3c39c38` | index.html, gallery.html, styles.css, robots.txt |
| 4 | Fix link rotto `upload.html` (non esistente) in gallery.html empty-state | `ff4c5b8` | gallery.html, upload-modal.js |
| 5 | Footer galleria: rimosso "Afanakavav" e email personale | `b981f05` | gallery.html |
| 6 | Rate limiting RSVP con hash IP (GDPR-friendly) | `262d51a` | functions/index.js |
| 7 | Sostituito telefono personale con contatti Giulia/Andrea | `cf654be` | gallery.html, styles.css |
| 8 | Rimossi contatti dal footer galleria (privacy + focus visivo) | `698ef77` | gallery.html, styles.css |
| 9 | Bottone empty-state: hover blindato, no più icona "+" sovrapposta | `87ec434` | gallery.html, gallery-styles.css |

### 🔒 Fix sicurezza infrastruttura (3)

| # | Fix | Commit |
|---|-----|--------|
| 10 | Footer galleria centrato in colonna (UX coerente con index) | `65080e7` |
| 11 | Estensione `firebase.json` ignore list per non esporre file interni | `d4ad7fa` |
| 12 | Mini-fix finale: rimossa deadline dal testo RSVP | `a9af0c1` |

### 🌐 Migrazione DNS completa

**Da:** GitHub Pages (`185.199.x.153`)
**A:** Firebase Hosting (`199.36.158.100`)

Operazioni effettuate:
- ✅ Disconnesso GitHub Pages dal dominio custom (Settings → Pages → Remove)
- ✅ Sostituiti 4 record A GitHub con 1 record A Firebase
- ✅ Aggiunto record TXT `hosting-site=matrimonio-andrea-giulia-2026`
- ✅ Sostituito CNAME `www` da `afanakavav.github.io.` a `matrimonio-andrea-giulia-2026.web.app`
- ✅ Verificati 2 custom domain in Firebase Console
- ✅ HTTPS automatico generato per entrambi i domini
- ✅ TTL ridotto a 5 minuti durante la migrazione (ora si può alzare a 1h se vuoi)

**Email/PEC:** preservate al 100%. Tutti i record MX, SPF, SRV, CNAME smtp/pop/autoconfig/ftp/pec intatti.

### ☁️ Deploy effettuati

| Servizio | Comando | Stato |
|----------|---------|-------|
| Firebase Hosting (preview) | `firebase hosting:channel:deploy preview-live-gallery` | ✅ ok, poi eliminato dopo cleanup |
| Firebase Hosting (live) | `firebase deploy --only hosting` | ✅ ok |
| Firestore Rules | `firebase deploy --only firestore:rules` | ✅ ok |
| Cloud Functions | `firebase deploy --only functions` | ✅ ok (3 functions) |

### 🧪 Test eseguiti

- ✅ 6 test funzionali in locale (emulator Firebase hosting)
- ✅ 6 test funzionali sul preview channel
- ✅ 15 HTTP smoke tests (verifica leakage file sensibili)
- ✅ 10 smoke tests sul dominio custom post-migrazione
- ✅ Test reale RSVP su produzione con email di conferma ricevuta

---

## 📊 Stato attuale dell'infrastruttura

### Hosting
- **Dominio principale:** `https://andreagiulia5luglio26.it` ✅ Connected
- **Dominio www:** `https://www.andreagiulia5luglio26.it` ✅ Connected
- **Subdomain Firebase:** `https://matrimonio-andrea-giulia-2026.web.app` ✅ ok
- **HTTPS:** valido su tutti i domini

### Backend
- **Cloud Functions live:** `verifyRecaptcha`, `submitRSVP`, `checkRateLimit`
- **Runtime:** Node.js 20 (⚠️ deprecato a ottobre 2026)
- **Region:** us-central1

### Database
- **Firestore collections:**
  - `rsvp-confirmations` (con campo `ipHash` per rate limiting)
  - `wedding-media` (in attesa di feature live gallery)
- **Rules:** delete:false, update:false su entrambe; create con validazione payload

### Sicurezza
- **Ignore list Firebase Hosting:** estesa per non esporre `functions/`, `firestore.rules`, `package.json`, `CODEBASE_AUDIT.md`, file admin utility, test, scripts, docs
- **robots.txt:** disallow su pagine admin e utility
- **Admin link:** discreto ma visibile (per uso sposi + Francesco)

---

## 🛡️ Backup e rete di sicurezza

### Branch Git preservati
- `main`: produzione attiva (12 commit + tag v1.0-foundations)
- `feature/live-gallery`: branch di lavoro Settimana 1 (può essere eliminato in futuro)
- `backup/pre-live-gallery`: snapshot pre-modifiche (TENERE come emergency rollback)

### Tag
- `v1.0-foundations`: stato del codice al 7 maggio 2026, post-deploy completo

### Rollback possibili
- **Frontend:** `firebase hosting:rollback` → torna al deploy precedente
- **Cloud Functions:** redeploy della versione precedente da branch backup
- **DNS:** riferimento screenshot `dns-backup-2026-05-07_*.png` per ripristino totale

### Repository legacy
- **GitHub Pages site:** ancora accessibile su `https://afanakavav.github.io/matrimonio-andrea-giulia/`
  - Non è stato cancellato, serve come backup di emergenza
  - In futuro (post-matrimonio) può essere unpublishato

---

## ⚠️ Pending da affrontare

### Urgenti (Settimana 2)
Tutti gestiti in WEEK2_PLAN.md:
- 🟢 Sviluppo nuovo flusso `/upload.html` mobile-first
- 🟢 Compressione multi-resolution lato client
- 🟢 Cloud Function `generateThumbnails` (triggered da Storage)
- 🟢 Galleria real-time con `onSnapshot`
- 🟢 Slideshow/Cinema Mode per proiettore
- 🟢 Caption AI con Claude API
- 🟢 Dashboard moderazione (4 tab)
- 🟢 QR code generator

### Non urgenti (Settimana 3-4)
- 🟡 Aggiornare runtime Node.js (da 20 a 22) entro ottobre 2026
- 🟡 Aggiornare package `firebase-functions` (versione outdated)
- 🟡 Considerare rimozione branch `feature/live-gallery` dopo Settimana 2

### Idee future (post-matrimonio)
- 💡 Pagina archivio completa per gli sposi (con tutti i media, anche scartati)
- 💡 Download zip massivo dei media via Cloud Function
- 💡 Statistiche per gli sposi: chi ha caricato di più, momenti più condivisi, ecc.

---

## 🎓 Lessons learned

### Cose che hanno funzionato bene
1. **Branching strategy con backup branch** → rete di sicurezza vera
2. **Deploy stratificato (locale → preview → produzione)** → zero panico durante il deploy
3. **Pre-flight checklist prima del deploy** → ha trovato il problema della ignore list incompleta
4. **TTL ridotto a 5 minuti durante migrazione DNS** → propagazione veloce
5. **Cancellazione record `www` GitHub prima dell'add Firebase** → no conflitti DNS

### Cose da ricordare
1. ⚠️ **Scoprire i sub-hosting nascosti**: il sito era servito da GitHub Pages senza che fosse documentato. Sempre verificare DNS prima di un deploy in produzione su domini "noti".
2. ⚠️ **Cache CDN domini custom ≠ cache CDN subdomain Firebase**: i due possono avere stati diversi durante deploy. Test sempre su entrambi.
3. ⚠️ **GitHub Actions automatici creano commit silenziosi**: il "Delete CNAME" è apparso da magia → check `git fetch` prima di push.
4. ⚠️ **reCAPTCHA è site-bound**: il dominio preview non era autorizzato → da considerare in setup futuri di nuovi canali.

### Setup operativo per Settimana 2+
- 💻 IDE: Cursor (per editing visivo)
- 🤖 Agent AI: Claude Code (per task autonomi)
- 🌐 Firebase Console (Hosting, Firestore, Functions, Storage)
- 🔑 Anthropic Console (API keys)
- 📡 Register.it (DNS, ma non dovremo più toccarlo per il sito)

---

## 🏆 Numeri di chiusura

- **Commit:** 12 in produzione + 1 di docs = **13 totali**
- **File toccati:** ~10
- **Cloud Functions:** 3 deployate
- **Firestore rules:** 2 collection rilavorate
- **Custom domains:** 2 collegati a Firebase
- **Test eseguiti:** 30+
- **Tempo totale:** ~6 ore di lavoro effettivo
- **Costo speso:** ~0€ (tutto nel free tier Firebase + Anthropic credits non ancora consumati)

---

**Riferimenti utili**:
- 📋 PRD del progetto: `PRD.md`
- 📋 Piano Settimana 2: `WEEK2_PLAN.md`
- 📋 Audit codice: `CODEBASE_AUDIT.md`
- 🔗 Repo GitHub: `https://github.com/Afanakavav/matrimonio-andrea-giulia`

---

🎉 **Bravo Francesco. Settimana 1 chiusa. Settimana 2 inizia.**
