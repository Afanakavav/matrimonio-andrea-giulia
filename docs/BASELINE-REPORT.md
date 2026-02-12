# Phase 0 — Baseline & Safety Net Report

**Date:** 2025  
**Project:** Matrimonio Andrea & Giulia (wedding site)

---

## 1. Stack detection

| Item                | Finding                                                               |
| ------------------- | --------------------------------------------------------------------- |
| **Framework**       | None. Static HTML/CSS/JavaScript.                                     |
| **Bundler**         | None. Assets served as-is (e.g. GitHub Pages).                        |
| **Runtime**         | Browser. Backend: Firebase Cloud Functions (Node 18) in `functions/`. |
| **Package manager** | npm (only in `functions/`). No root `package.json`.                   |
| **Language**        | JavaScript (no TypeScript).                                           |

---

## 2. Existing scripts

- **Root:** None (no package.json).
- **functions/:** `serve`, `shell`, `start`, `deploy`, `logs` (Firebase).

No `lint`, `format`, `typecheck`, `test`, or `build` at repo level.

---

## 3. Current test setup

- **Unit / integration tests:** None.
- **E2E tests:** None.
- **functions/:** Has `firebase-functions-test` in devDependencies; no test script or test files.

---

## 4. Lint / format / typecheck

- **ESLint:** Not configured.
- **Prettier:** Not configured.
- **TypeScript:** Not used.

---

## 5. Baseline metrics (static site)

| Metric             | Value                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Build**          | N/A (no build step).                                                                                                                                                |
| **Bundle size**    | N/A. Static assets only.                                                                                                                                            |
| **Main JS (root)** | script.js, rsvp-handler.js, upload-modal.js, video-handler.js, gallery-script.js, admin-script.js, admin-rsvp-script.js, firebase-config.js, auth-manager-secure.js |
| **HTML pages**     | index.html, gallery.html, admin.html, admin-hub.html, admin-rsvp.html, generate-hash.html, test-hash.html                                                           |
| **Deploy**         | Push to `main` → GitHub Pages. Firebase Hosting config in firebase.json (public: ".").                                                                              |

---

## 6. Obvious risks

- No automated checks before deploy (lint, tests).
- `config.local.js` is gitignored; production relies on `firebase-config.js` (or placeholder).
- Cloud Functions need `.env` with `RECAPTCHA_SECRET_KEY` (not in repo).
- No CI config (e.g. GitHub Actions) for lint/test.

---

## 7. Next steps (Phases 1–4)

- ~~Add root package.json with lint, format, and (optional) validate.~~ ✅ Phase 1 done
- ~~Add minimal ESLint + Prettier config.~~ ✅
- ~~Add CI-friendly npm scripts (no interactive prompts).~~ ✅
- ~~Refactor dead code / redundancy (Phase 2).~~ ✅ Consolidated 3× firestore-rules-\*.js → firestore.rules; removed unused createCountdown; fixed ESLint warnings
- ~~Add performance checks where applicable (Phase 3).~~ ✅ `npm run perf:check` — controlla dimensioni immagini/video/JS
- ~~Add functional tests (unit + E2E) for core flows (Phase 4).~~ ✅ `npm test` (unit), `npm run test:e2e` (Playwright)
