# 🔥 Setup Firebase per il Sito Matrimonio

## 📋 Prerequisiti
- Account Google
- Node.js installato (per il backup script)

## 🚀 Passo 1: Crea Progetto Firebase

1. Vai su [Firebase Console](https://console.firebase.google.com/)
2. Clicca "Crea un progetto"
3. Nome progetto: `matrimonio-andrea-giulia-2026`
4. Abilita Google Analytics (opzionale)
5. Clicca "Crea progetto"

## 🗄️ Passo 2: Configura Firestore Database

1. Nel menu laterale, clicca "Firestore Database"
2. Clicca "Crea database"
3. Scegli "Inizia in modalità test" (per ora)
4. Scegli una regione (europe-west1 per l'Italia)
5. Clicca "Abilita"

## 📁 Passo 3: Configura Storage

1. Nel menu laterale, clicca "Storage"
2. Clicca "Inizia"
3. Scegli "Inizia in modalità test"
4. Scegli la stessa regione di Firestore
5. Clicca "Avanti" e poi "Fine"

## 🔧 Passo 4: Configura Web App

1. Nel menu laterale, clicca l'icona "Web" (</>)
2. Nome app: `matrimonio-website`
3. NON abilitare Firebase Hosting per ora
4. Clicca "Registra app"
5. Copia la configurazione Firebase

## 📝 Passo 5: Aggiorna Configurazione

1. Apri il file `firebase-config.js`
2. Sostituisci i valori placeholder con quelli del tuo progetto:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...", // La tua API Key
  authDomain: "matrimonio-andrea-giulia-2026.firebaseapp.com",
  projectId: "matrimonio-andrea-giulia-2026",
  storageBucket: "matrimonio-andrea-giulia-2026.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef..."
};
```

## 🔒 Passo 6: Configura Regole di Sicurezza

### Firestore Rules
Vai su Firestore > Regole e sostituisci con:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Permetti lettura e scrittura per wedding-media
    match /wedding-media/{document} {
      allow read, write: if true; // Temporaneo per il matrimonio
    }
  }
}
```

### Storage Rules
Vai su Storage > Regole e sostituisci con:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /wedding-media/{allPaths=**} {
      allow read, write: if true; // Temporaneo per il matrimonio
    }
  }
}
```

## 🧪 Passo 7: Test Configurazione

1. Apri `index.html` nel browser
2. Clicca "📸 Carica"
3. Prova a caricare una foto di test
4. Verifica che appaia nella galleria

## 📊 Passo 8: Monitoraggio Costi

1. Vai su Firebase Console > Utilizzo e fatturazione
2. Imposta alert per superare $10
3. Monitora l'utilizzo durante il matrimonio

## 🔄 Passo 9: Backup Automatico

Dopo il matrimonio, esegui il backup:

```bash
# Installa dipendenze
npm install

# Esegui backup
node backup-script.js
```

## ⚠️ Note Importanti

- **Sicurezza**: Le regole sono aperte per semplicità. Dopo il matrimonio, chiudi tutto
- **Costi**: Monitora sempre l'utilizzo per evitare sorprese
- **Backup**: Esegui il backup subito dopo il matrimonio
- **Disattivazione**: Dopo 1 mese, disattiva il progetto per fermare i costi

## 🆘 Risoluzione Problemi

### Errore "Firebase not initialized"
- Verifica che la configurazione sia corretta
- Controlla che i file JavaScript siano caricati

### Errore "Permission denied"
- Verifica le regole di Firestore e Storage
- Assicurati che siano in modalità test

### Upload non funziona
- Controlla la connessione internet
- Verifica che i file siano nei formati supportati
- Controlla la console del browser per errori

## 📞 Supporto

Se hai problemi:
1. Controlla la console del browser (F12)
2. Verifica la configurazione Firebase
3. Controlla le regole di sicurezza
4. Contattami per assistenza

---

**Buon matrimonio! 🎉**
