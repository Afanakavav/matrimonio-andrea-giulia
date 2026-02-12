#!/usr/bin/env node
/**
 * Phase 3 — Performance check: asset sizes
 * Esegui: node scripts/perf-check.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const IMAGE_MAX_KB = 500;
const VIDEO_MAX_MB = 50;

let hasWarnings = false;

function sizeKB(filePath) {
  return fs.statSync(filePath).size / 1024;
}

function sizeMB(filePath) {
  return fs.statSync(filePath).size / (1024 * 1024);
}

// Check images
const imagesDir = path.join(ROOT, "images");
if (fs.existsSync(imagesDir)) {
  const files = fs.readdirSync(imagesDir).filter((f) => /\.(png|jpg|jpeg|webp|gif)$/i.test(f));
  let totalImagesKB = 0;
  for (const f of files) {
    const fp = path.join(imagesDir, f);
    const kb = sizeKB(fp);
    totalImagesKB += kb;
    if (kb > IMAGE_MAX_KB) {
      console.warn(`[warn] ${f}: ${kb.toFixed(0)} KB (suggerito < ${IMAGE_MAX_KB} KB)`);
      hasWarnings = true;
    }
  }
  console.log(`  Immagini: ${files.length} file, ${totalImagesKB.toFixed(0)} KB totali`);
}

// Check video
const videoPath = path.join(ROOT, "wedding-video.mp4");
if (fs.existsSync(videoPath)) {
  const mb = sizeMB(videoPath);
  if (mb > VIDEO_MAX_MB) {
    console.warn(`[warn] wedding-video.mp4: ${mb.toFixed(1)} MB (suggerito < ${VIDEO_MAX_MB} MB)`);
    hasWarnings = true;
  }
  console.log(`  Video: ${mb.toFixed(1)} MB`);
}

// Check main JS size
const jsFiles = [
  "script.js",
  "rsvp-handler.js",
  "video-handler.js",
  "gallery-script.js",
  "upload-modal.js",
  "auth-manager-secure.js",
  "firebase-config.js",
];
let totalJS = 0;
for (const f of jsFiles) {
  const fp = path.join(ROOT, f);
  if (fs.existsSync(fp)) totalJS += fs.statSync(fp).size;
}
console.log(`  JS totale (root): ${(totalJS / 1024).toFixed(1)} KB`);

if (hasWarnings) {
  console.log(
    "\nSuggerimenti: comprimi immagini (es. TinyPNG) o video per caricamenti più veloci."
  );
  process.exit(1);
}
console.log("\n✅ Nessun problema critico rilevato.");
