// Firebase Configuration
// config.local.js (se presente) sovrascrive window.FIREBASE_CONFIG prima di questo script.
// Fallback qui necessario per il sito in deploy (es. GitHub Pages) dove config.local.js non esiste.

const firebaseConfig = window.FIREBASE_CONFIG || {
  apiKey: "AIzaSyDp-va9ud9rDhNqqTD4Y0lMb-O-_Kg6YAQ",
  authDomain: "matrimonio-andrea-giulia-2026.firebaseapp.com",
  projectId: "matrimonio-andrea-giulia-2026",
  storageBucket: "matrimonio-andrea-giulia-2026.firebasestorage.app",
  messagingSenderId: "295197554541",
  appId: "1:295197554541:web:d932fc9b2407d182e44c64",
  measurementId: "G-WTT3TQN19C",
};

const app = firebase.initializeApp(firebaseConfig);
const storage = firebase.storage();
const db = firebase.firestore();

// Export per uso in altri file
window.db = db;
window.storage = storage;

const WEDDING_CONFIG = {
  weddingDate: "2026-07-05",
  // NOTA: finestra aperta da oggi (9 maggio 2026) per permettere
  // test full-stack in produzione. Il flag is_pre_wedding_test
  // distinguerà i media test dai media veri del matrimonio.
  uploadOpenDate: "2026-05-09T00:00:00",
  uploadCloseDate: "2026-07-19T23:59:59",
  uploadEnabled: true,
  maxFileSize: 100 * 1024 * 1024,
  allowedTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "video/mp4",
    "video/mov",
    "video/avi",
  ],
  maxFilesPerUpload: 20,
};

function getUploadStatus() {
  const now = new Date();
  const open = new Date(WEDDING_CONFIG.uploadOpenDate);
  const close = new Date(WEDDING_CONFIG.uploadCloseDate);
  if (now < open) return "before";
  if (now > close) return "after";
  return "open";
}

function isUploadEnabled() {
  return getUploadStatus() === "open";
}

function isViewingEnabled() {
  return true;
}
