/* live-script.js — Galleria live cinematografica
   IIFE, nessuna dipendenza globale oltre a window.db (firebase-config.js).
*/
(function () {
  "use strict";

  // ── Costanti ──────────────────────────────────────────────────
  const POOL_LIMIT          = 150;
  const SLOT_COUNT          = 6;
  const ROTATION_NORMAL_MS  = 12000;
  const ROTATION_FEATURED_MS= 14000;
  const FEATURED_WEIGHT     = 3;
  const SLOT_STAGGER_MS     = 2000;
  const GLOW_DURATION_MS    = 1500;

  // ── Stato ─────────────────────────────────────────────────────
  const pool        = new Map();   // id → {id, url, mediaType, featured, uploadDate}
  const slotState   = [];          // [{ timerId, currentId }]
  let pendingNewUpload = null;     // id del media appena arrivato (da mostrare per primo)
  let isFirstSnapshot  = true;

  // ── DOM refs ──────────────────────────────────────────────────
  const container   = document.getElementById("liveContainer");
  const placeholder = document.getElementById("emptyPlaceholder");

  // ── Bootstrap ─────────────────────────────────────────────────
  function init() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      slotState.push({ timerId: null, currentId: null });
    }
    subscribeToMedia();
  }

  // ── Firestore listener ─────────────────────────────────────────
  function subscribeToMedia() {
    window.db
      .collection("wedding-media")
      .where("status", "==", "approved")
      .orderBy("uploadDate", "desc")
      .limit(POOL_LIMIT)
      .onSnapshot(handleSnapshot, function (err) {
        console.error("[live] onSnapshot error:", err);
      });
  }

  function handleSnapshot(snapshot) {
    if (isFirstSnapshot) {
      // Prima snapshot: carica tutto il pool e avvia i slot
      snapshot.docs.forEach(function (doc) {
        pool.set(doc.id, normalizeDoc(doc));
      });
      isFirstSnapshot = false;
      updatePlaceholder();
      if (pool.size > 0) bootstrapSlots();
      return;
    }

    // Snapshot successivi: applica solo le differenze
    snapshot.docChanges().forEach(function (change) {
      if (change.type === "added" || change.type === "modified") {
        const data = normalizeDoc(change.doc);
        const isNew = change.type === "added" && !pool.has(change.doc.id);
        pool.set(change.doc.id, data);
        if (isNew) pendingNewUpload = change.doc.id;
        // Mantieni pool entro POOL_LIMIT (rimuovi i più vecchi)
        if (pool.size > POOL_LIMIT) evictOldest();
      } else if (change.type === "removed") {
        pool.delete(change.doc.id);
      }
    });

    updatePlaceholder();

    // Se erano vuoti, avvia ora
    if (pool.size > 0 && slotState.every(function (s) { return s.timerId === null && s.currentId === null; })) {
      bootstrapSlots();
    }
  }

  function normalizeDoc(doc) {
    const d = doc.data();
    return {
      id:        doc.id,
      url:       d.display_url || d.original_url || "",
      mediaType: d.file_type || "photo",
      featured:  d.favorite === true,
      uploadDate: d.uploadDate,
    };
  }

  function evictOldest() {
    // Rimuovi la prima entry nella Map (la più vecchia aggiunta)
    const firstKey = pool.keys().next().value;
    if (firstKey) pool.delete(firstKey);
  }

  // ── Placeholder ───────────────────────────────────────────────
  function updatePlaceholder() {
    if (pool.size > 0) {
      placeholder.classList.add("hidden");
    } else {
      placeholder.classList.remove("hidden");
    }
  }

  // ── Avvio scaglionato slot ─────────────────────────────────────
  function bootstrapSlots() {
    for (let i = 0; i < SLOT_COUNT; i++) {
      (function (slotId) {
        setTimeout(function () {
          showNextMedia(slotId);
        }, slotId * SLOT_STAGGER_MS);
      })(i);
    }
  }

  // ── Rotazione singolo slot ─────────────────────────────────────
  function showNextMedia(slotId) {
    if (pool.size === 0) return;

    const slotEl  = container.querySelector('[data-slot-id="' + slotId + '"]');
    if (!slotEl || slotEl.style.display === "none") return;
    const inner   = slotEl.querySelector(".live-slot-inner");
    const state   = slotState[slotId];

    // Scegli media: priorità al pending new upload, poi random pesato
    let mediaId;
    let isNewUpload = false;

    if (pendingNewUpload && pendingNewUpload !== state.currentId) {
      mediaId          = pendingNewUpload;
      pendingNewUpload = null;
      isNewUpload      = true;
    } else {
      mediaId = pickWeightedRandom(state.currentId);
    }

    if (!mediaId) return;

    const media = pool.get(mediaId);
    if (!media) return;

    // Rimuovi wrapper precedente
    const old = inner.querySelector(".media-wrapper");
    if (old) old.remove();

    // Monta nuovo wrapper
    const wrapper = createMediaWrapper(media);
    inner.appendChild(wrapper);

    // Aggiorna stato slot
    state.currentId = mediaId;

    // Glow gold se è un nuovo upload
    if (isNewUpload) {
      slotEl.classList.add("new-upload");
      setTimeout(function () {
        slotEl.classList.remove("new-upload");
      }, GLOW_DURATION_MS);
    }

    // Programma prossima rotazione
    const delay = media.featured ? ROTATION_FEATURED_MS : ROTATION_NORMAL_MS;
    if (state.timerId) clearTimeout(state.timerId);
    state.timerId = setTimeout(function () {
      showNextMedia(slotId);
    }, delay);
  }

  // ── Selezione random pesata ────────────────────────────────────
  function pickWeightedRandom(excludeId) {
    if (pool.size === 0) return null;

    const candidates = [];
    pool.forEach(function (media, id) {
      if (id === excludeId) return;
      const weight = media.featured ? FEATURED_WEIGHT : 1;
      for (let w = 0; w < weight; w++) {
        candidates.push(id);
      }
    });

    if (candidates.length === 0) {
      // Tutti gli slot mostrano lo stesso unico media — ripeti
      return excludeId || null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ── Crea elemento media ────────────────────────────────────────
  function createMediaWrapper(media) {
    const wrapper = document.createElement("div");
    wrapper.className = "media-wrapper";

    // Posizioni random per Ken Burns (evita sempre lo stesso centro)
    const kbX = (20 + Math.random() * 60).toFixed(1) + "%";
    const kbY = (20 + Math.random() * 60).toFixed(1) + "%";
    wrapper.style.setProperty("--kb-x", kbX);
    wrapper.style.setProperty("--kb-y", kbY);

    if (media.mediaType === "video") {
      wrapper.classList.add("kb-video");
      const video = document.createElement("video");
      video.src      = media.url;
      video.autoplay = true;
      video.muted    = true;
      video.loop     = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      wrapper.appendChild(video);
    } else {
      wrapper.classList.add(media.featured ? "kb-featured" : "kb-photo");
      const img = document.createElement("img");
      img.src = media.url;
      img.alt = "";
      img.loading = "lazy";
      wrapper.appendChild(img);
    }

    return wrapper;
  }

  // ── Avvio ──────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", init);

})();
