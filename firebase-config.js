// Firebase Configuration
// IMPORTANT: This file should use environment variables or be generated from a template
// For production, replace these values with actual Firebase config from environment
// NEVER commit real API keys to the repository!

// Load config from window object (set by build process or config file)
const firebaseConfig = window.FIREBASE_CONFIG || {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "matrimonio-andrea-giulia-2026.firebaseapp.com",
    projectId: "matrimonio-andrea-giulia-2026",
    storageBucket: "matrimonio-andrea-giulia-2026.firebasestorage.app",
    messagingSenderId: "295197554541",
    appId: "1:295197554541:web:d932fc9b2407d182e44c64",
    measurementId: "G-WTT3TQN19C"
};

const app = firebase.initializeApp(firebaseConfig);
const storage = firebase.storage();
const db = firebase.firestore();

// Export per uso in altri file
window.db = db;
window.storage = storage;

const WEDDING_CONFIG = {
  weddingDate: '2026-07-05',
  uploadEnabled: true,
  maxFileSize: 100 * 1024 * 1024,
  allowedTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'video/mp4', 'video/mov', 'video/avi'],
  maxFilesPerUpload: 20
};

function isUploadEnabled() {
  return true;
}

function isViewingEnabled() {
  return true;
}