(function() {
  "use strict";

  // ========== CONFIG ==========
  const POOL_LIMIT = 150;
  const VARIATIONS_HISTORY = 5;  // ricorda ultime 5 variazioni di stesso media per non ripetere

  // ========== STATE ==========
  const pool = new Map();              // id → normalizedMedia
  const variationsHistory = new Map(); // mediaId → array<varConfig> (max VARIATIONS_HISTORY)
  let currentMode = "petali";
  let currentPattern = null;           // istanza pattern attivo
  let isFirstSnapshot = true;
  const pendingNewUpload = { id: null };

  // ========== PATTERN REGISTRY ==========
  const patterns = {};  // populated by registerPattern()

  function registerPattern(name, patternObj) {
    patterns[name] = patternObj;
  }

  // ========== NORMALIZE DOC (schema reale Firestore) ==========
  function normalizeDoc(doc) {
    const d = doc.data();
    return {
      id: doc.id,
      url: d.display_url || d.original_url || "",
      fileType: d.file_type || "image",   // "image" | "video", default coerente con schema
      favorite: d.favorite === true,
      uploadDate: d.uploadDate,
      aiDescription: d.ai_description || "",   // usato da pattern Cinema in Fase 2
      aiTags: Array.isArray(d.ai_tags) ? d.ai_tags : [],
      aiScore: typeof d.ai_score === "number" ? d.ai_score : null,
      uploaderName: d.uploader_name || "Anonimo"
    };
  }

  // ========== VARIATION ENGINE ==========
  // Genera config di variazione random per ogni rendering di un media.
  // Tiene memoria delle ultime N variazioni per stesso media → no ripetizioni.
  function generateVariation(mediaId) {
    const history = variationsHistory.get(mediaId) || [];

    // 6 dimensioni di variazione casuale
    const variation = {
      kenBurnsDirection: pickFrom(["zoom-in", "zoom-out", "pan-left", "pan-right", "diagonal-ne", "diagonal-sw"], history.map(v => v.kenBurnsDirection)),
      duration: 10000 + Math.floor(Math.random() * 6000),   // 10-16 sec
      tintFilter: pickFrom(["none", "warm", "cool", "vintage"], history.map(v => v.tintFilter)),
      entranceAnimation: pickFrom(["fade", "slide-up", "slide-down", "scale-in", "rotate-in"], history.map(v => v.entranceAnimation)),
      rotation: (Math.random() * 6 - 3).toFixed(2) + "deg",   // -3°..+3°
      scale: (0.92 + Math.random() * 0.16).toFixed(3)         // 0.92..1.08
    };

    // Memoria FIFO
    history.push(variation);
    if (history.length > VARIATIONS_HISTORY) history.shift();
    variationsHistory.set(mediaId, history);

    return variation;
  }

  // Picker che evita le ultime variazioni recenti per stessa dimensione
  function pickFrom(options, recent) {
    const recentSet = new Set(recent);
    const fresh = options.filter(o => !recentSet.has(o));
    const pickList = fresh.length > 0 ? fresh : options;
    return pickList[Math.floor(Math.random() * pickList.length)];
  }

  // ========== POOL MANAGER ==========
  function pickWeightedRandom(excludeId) {
    if (pool.size === 0) return null;
    if (pool.size === 1) {
      // Caso "1 sola foto nel pool" — restituiscila comunque (con variazioni infinite gestite a livello visivo)
      return pool.keys().next().value;
    }

    const candidates = [];
    pool.forEach((media, id) => {
      if (id === excludeId && pool.size > 1) return;
      const weight = media.favorite ? 3 : 1;
      for (let w = 0; w < weight; w++) candidates.push(id);
    });

    if (candidates.length === 0) return pool.keys().next().value;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ========== FIRESTORE LISTENERS ==========
  function subscribeToMedia() {
    if (!window.db) {
      console.error("[cinema] Firestore db non disponibile");
      return;
    }
    window.db.collection("wedding-media")
      .where("status", "==", "approved")
      .orderBy("uploadDate", "desc")
      .limit(POOL_LIMIT)
      .onSnapshot(handleMediaSnapshot, (err) => {
        console.error("[cinema] errore onSnapshot wedding-media:", err);
      });
  }

  function handleMediaSnapshot(snapshot) {
    snapshot.docChanges().forEach((change) => {
      const normalized = normalizeDoc(change.doc);
      if (change.type === "added") {
        pool.set(normalized.id, normalized);
        if (!isFirstSnapshot) {
          pendingNewUpload.id = normalized.id;
        }
      } else if (change.type === "modified") {
        pool.set(normalized.id, normalized);
      } else if (change.type === "removed") {
        pool.delete(normalized.id);
      }
    });

    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      startCurrentPattern();
    }
  }

  function subscribeToModeChanges() {
    if (!window.db) return;
    window.db.collection("app-state").doc("live")
      .onSnapshot((doc) => {
        if (!doc.exists) return;
        const newMode = doc.data().mode;
        if (newMode && newMode !== currentMode && patterns[newMode]) {
          console.log(`[cinema] mode switch: ${currentMode} → ${newMode}`);
          switchMode(newMode);
        }
      }, (err) => {
        console.error("[cinema] errore onSnapshot app-state/live:", err);
      });
  }

  // ========== MODE DISPATCHER ==========
  function switchMode(newMode) {
    if (currentPattern && typeof currentPattern.cleanup === "function") {
      currentPattern.cleanup();
    }
    currentMode = newMode;
    document.body.setAttribute("data-mode", newMode);
    document.getElementById("modeIndicator").textContent = newMode;
    startCurrentPattern();
  }

  function startCurrentPattern() {
    const patternFactory = patterns[currentMode];
    if (!patternFactory) {
      console.error(`[cinema] pattern '${currentMode}' non registrato`);
      return;
    }
    const stage = document.getElementById("cinemaStage");
    currentPattern = patternFactory.create({
      stage,
      pool,
      pickWeightedRandom,
      generateVariation,
      pendingNewUpload
    });
    currentPattern.init();
  }

  // ========== PATTERN A: PETALI + FRAMES ==========
  registerPattern("petali", {
    create(context) {
      const { stage, pool, pickWeightedRandom, generateVariation, pendingNewUpload } = context;
      const SLOT_COUNT = 4;             // Pattern A usa 4 frame su sfondo petali
      const slotElements = [];
      const slotTimers = [];
      const slotCurrentIds = new Array(SLOT_COUNT).fill(null);
      let petalsInterval = null;

      function init() {
        // Crea 4 frame nel cinema stage
        stage.classList.add("pattern-petali");
        stage.innerHTML = "";
        for (let i = 0; i < SLOT_COUNT; i++) {
          const frame = document.createElement("div");
          frame.className = "petali-frame";
          frame.dataset.frameIndex = i;
          stage.appendChild(frame);
          slotElements.push(frame);
        }

        // Avvia ciclo frame con stagger
        for (let i = 0; i < SLOT_COUNT; i++) {
          setTimeout(() => cycleFrame(i), i * 1500);
        }

        // Avvia generazione petali (continui in sfondo)
        startPetalsAnimation();
      }

      function cycleFrame(frameIdx) {
        const frame = slotElements[frameIdx];
        if (!frame || !document.contains(frame)) return;

        let mediaId;
        // Priorità new upload (consume once)
        if (pendingNewUpload.id && pool.has(pendingNewUpload.id) && pendingNewUpload.id !== slotCurrentIds[frameIdx]) {
          mediaId = pendingNewUpload.id;
          pendingNewUpload.id = null;
          frame.classList.add("new-upload-glow");
          setTimeout(() => frame.classList.remove("new-upload-glow"), 1500);
        } else {
          mediaId = pickWeightedRandom(slotCurrentIds[frameIdx]);
        }

        if (!mediaId) {
          slotTimers[frameIdx] = setTimeout(() => cycleFrame(frameIdx), 3000);
          return;
        }

        const media = pool.get(mediaId);
        if (!media) {
          slotTimers[frameIdx] = setTimeout(() => cycleFrame(frameIdx), 3000);
          return;
        }

        slotCurrentIds[frameIdx] = mediaId;
        const variation = generateVariation(mediaId);
        renderFrame(frame, media, variation);

        slotTimers[frameIdx] = setTimeout(() => cycleFrame(frameIdx), variation.duration);
      }

      function renderFrame(frame, media, variation) {
        // Fade out wrapper precedente
        const oldWrapper = frame.querySelector(".petali-wrapper");
        if (oldWrapper) {
          oldWrapper.classList.add("exiting");
          setTimeout(() => oldWrapper.remove(), 600);
        }

        // Crea nuovo wrapper
        const wrapper = document.createElement("div");
        wrapper.className = `petali-wrapper entrance-${variation.entranceAnimation} tint-${variation.tintFilter}`;
        wrapper.style.setProperty("--rot", variation.rotation);
        wrapper.style.setProperty("--scale", variation.scale);
        wrapper.dataset.kenburns = variation.kenBurnsDirection;

        if (media.fileType === "video") {
          const video = document.createElement("video");
          video.src = media.url;
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          wrapper.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.src = media.url;
          img.alt = "";
          wrapper.appendChild(img);
        }

        frame.appendChild(wrapper);
        requestAnimationFrame(() => wrapper.classList.add("visible"));
      }

      function startPetalsAnimation() {
        const layer = document.getElementById("petalsLayer");
        if (!layer) return;
        layer.classList.add("active");

        // Crea un petalo ogni 800ms
        petalsInterval = setInterval(() => {
          const petal = document.createElement("div");
          petal.className = "petal";
          // Variazione random
          petal.style.left = Math.random() * 100 + "%";
          petal.style.setProperty("--fall-duration", (8 + Math.random() * 6) + "s");
          petal.style.setProperty("--sway-amount", (Math.random() * 80 - 40) + "px");
          petal.style.setProperty("--rotation-speed", (Math.random() * 4 + 2) + "s");
          petal.style.setProperty("--petal-size", (8 + Math.random() * 8) + "px");
          petal.style.setProperty("--petal-opacity", (0.4 + Math.random() * 0.4).toFixed(2));
          layer.appendChild(petal);

          // Auto-cleanup dopo animazione
          setTimeout(() => petal.remove(), 14000);
        }, 800);
      }

      function cleanup() {
        slotTimers.forEach(t => clearTimeout(t));
        if (petalsInterval) clearInterval(petalsInterval);
        const layer = document.getElementById("petalsLayer");
        if (layer) {
          layer.classList.remove("active");
          layer.innerHTML = "";
        }
        stage.classList.remove("pattern-petali");
        stage.innerHTML = "";
      }

      return { init, cleanup };
    }
  });

  // ========== BOOTSTRAP ==========
  document.addEventListener("DOMContentLoaded", () => {
    subscribeToMedia();
    subscribeToModeChanges();
  });

})();
