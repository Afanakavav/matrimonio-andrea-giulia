# Environment Variables and Configuration Guide for Matrimonio Andrea & Giulia

## IMPORTANT: API Keys Security

This is a static website, so we use a different approach for API keys.

### Setup Instructions:

1. Create a file \config.local.js\ (NOT committed to git) with:

\\\javascript
// config.local.js - DO NOT COMMIT THIS FILE
window.FIREBASE_CONFIG = {
  apiKey: 'your-actual-api-key',
  authDomain: 'matrimonio-andrea-giulia-2026.firebaseapp.com',
  projectId: 'matrimonio-andrea-giulia-2026',
  storageBucket: 'matrimonio-andrea-giulia-2026.firebasestorage.app',
  messagingSenderId: '295197554541',
  appId: '1:295197554541:web:d932fc9b2407d182e44c64',
  measurementId: 'G-WTT3TQN19C'
};
\\\

2. Include it in your HTML before other scripts:
\\\html
<script src="/config.local.js"></script>
<script src="/firebase-config.js"></script>
\\\

3. The \irebase-config.js\ file will automatically use \window.FIREBASE_CONFIG\ if available.

## Firebase Project: matrimonio-andrea-giulia-2026

Get your Firebase config from:
Firebase Console > Project Settings > General > Your apps
