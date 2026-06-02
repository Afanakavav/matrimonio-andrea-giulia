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
      uploaderName: d.uploader_name || "Anonimo",
      aiStory: Array.isArray(d.ai_story) ? d.ai_story : []
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

  // ========== PATTERN B: FLOATING POLAROIDS ==========
  registerPattern("polaroid", {
    create(context) {
      const { stage, pool, pickWeightedRandom, generateVariation, pendingNewUpload } = context;

      const MAX_POLAROIDS = 7;          // 6-8 simultanee, fisso a 7
      const SPAWN_INTERVAL_MS = 1800;   // nuova polaroid ogni ~1.8 sec
      const LIFE_NORMAL_MS = 12000;
      const LIFE_FEATURED_MS = 15000;

      const activeTimers = new Set();   // timer despawn per ogni polaroid
      let spawnTimer = null;
      const activePolaroids = new Set();  // tracking elementi DOM attivi

      function init() {
        stage.classList.add("pattern-polaroid");
        stage.innerHTML = "";
        // Spawn iniziale: popola subito 3-4 polaroid con stagger
        for (let i = 0; i < 4; i++) {
          setTimeout(() => spawnPolaroid(), i * 700);
        }
        // Avvia loop spawn
        scheduleNextSpawn();
      }

      function scheduleNextSpawn() {
        spawnTimer = setTimeout(() => {
          if (activePolaroids.size < MAX_POLAROIDS) {
            spawnPolaroid();
          }
          scheduleNextSpawn();
        }, SPAWN_INTERVAL_MS);
      }

      function spawnPolaroid() {
        // Pesca media
        let mediaId;
        let isNewUpload = false;

        if (pendingNewUpload.id && pool.has(pendingNewUpload.id)) {
          mediaId = pendingNewUpload.id;
          pendingNewUpload.id = null;
          isNewUpload = true;
        } else {
          mediaId = pickWeightedRandom(null);  // null = no exclude
        }

        if (!mediaId) return;
        const media = pool.get(mediaId);
        if (!media) return;

        const variation = generateVariation(mediaId);
        const isFeatured = media.favorite;
        const life = isFeatured ? LIFE_FEATURED_MS : LIFE_NORMAL_MS;

        // Crea polaroid
        const card = document.createElement("div");
        card.className = `polaroid-card tint-${variation.tintFilter}`;
        if (isFeatured) card.classList.add("featured");
        if (isNewUpload) card.classList.add("new-upload");

        // Posizione end: random dentro viewport (con margine sicurezza 10%)
        const W = window.innerWidth;
        const H = window.innerHeight;
        const xEnd = (W * 0.10) + Math.random() * (W * 0.80) - 150;
        const yEnd = (H * 0.10) + Math.random() * (H * 0.80) - 100;

        // Posizione start: dal bordo random (Decisione 4A - slide-in)
        const side = Math.floor(Math.random() * 4);  // 0=top, 1=right, 2=bottom, 3=left
        let xStart, yStart;
        switch(side) {
          case 0: xStart = xEnd; yStart = -300; break;
          case 1: xStart = W + 300; yStart = yEnd; break;
          case 2: xStart = xEnd; yStart = H + 300; break;
          case 3: xStart = -300; yStart = yEnd; break;
        }

        // Drift exit: direzione random per uscita
        const driftX = (Math.random() - 0.5) * 200;  // -100 .. +100
        const driftY = (Math.random() - 0.5) * 200;

        // Rotation polaroid (±15° come da Decisione 2)
        const rotation = (Math.random() * 30 - 15).toFixed(1) + "deg";

        // Scale
        const scale = isFeatured ? 1.08 : (0.92 + Math.random() * 0.12).toFixed(3);

        // Float duration + delay random (per phase distinte)
        const floatDuration = (3 + Math.random() * 2).toFixed(1) + "s";  // 3-5 sec
        const floatDelay = (Math.random() * 2).toFixed(1) + "s";          // 0-2 sec

        // Dimensioni polaroid (random, range medio)
        const cardWidth = 240 + Math.random() * 100;   // 240-340 px
        const cardHeight = cardWidth * 1.25;            // ratio polaroid

        // Set CSS variables
        card.style.cssText = `
          width: ${cardWidth}px;
          height: ${cardHeight}px;
          --pr-rot: ${rotation};
          --pr-scale: ${scale};
          --pr-x-start: ${xStart}px;
          --pr-y-start: ${yStart}px;
          --pr-x-end: ${xEnd}px;
          --pr-y-end: ${yEnd}px;
          --pr-drift-x: ${driftX}px;
          --pr-drift-y: ${driftY}px;
          --pr-float-duration: ${floatDuration};
          --pr-float-delay: ${floatDelay};
          --pr-life: ${life}ms;
          z-index: ${Math.floor(Math.random() * 100)};
        `;

        // Media element (img o video)
        if (media.fileType === "video") {
          const video = document.createElement("video");
          video.className = "polaroid-image";
          video.src = media.url;
          video.autoplay = true;
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          card.appendChild(video);
        } else {
          const img = document.createElement("img");
          img.className = "polaroid-image";
          img.src = media.url;
          img.alt = "";
          card.appendChild(img);
        }

        stage.appendChild(card);
        activePolaroids.add(card);

        // Despawn dopo lifecycle
        const despawnTimer = setTimeout(() => {
          if (card.parentNode) card.remove();
          activePolaroids.delete(card);
          activeTimers.delete(despawnTimer);
        }, life);
        activeTimers.add(despawnTimer);
      }

      function cleanup() {
        if (spawnTimer) clearTimeout(spawnTimer);
        activeTimers.forEach(t => clearTimeout(t));
        activeTimers.clear();
        activePolaroids.clear();
        stage.classList.remove("pattern-polaroid");
        stage.innerHTML = "";
      }

      return { init, cleanup };
    }
  });

  // ========== PATTERN C: CINEMA LETTERBOX ==========
  registerPattern("cinema", {
    create(context) {
      const { stage, pool, pickWeightedRandom, generateVariation, pendingNewUpload } = context;

      // CONFIG
      const DURATION_NORMAL = 16000;
      const DURATION_FEATURED = 20000;
      const CAPTION_DURATION_RATIO = 0.80;

      const TRANSITIONS = ["fade", "slide-left", "dip-to-black", "iris-out", "crossfade"];

      // STATE
      let frameTimer = null;
      let captionTimer = null;
      let currentMediaId = null;
      let isFirstFrame = true;

      function init() {
        stage.classList.add("pattern-cinema");
        stage.innerHTML = "";

        const letterbox = document.createElement("div");
        letterbox.className = "cinema-letterbox";
        letterbox.innerHTML = `
          <div class="cinema-bar top"></div>
          <div class="cinema-frame" id="cinemaFrame"></div>
          <div class="cinema-bar bottom">
            <div class="cinema-caption" id="cinemaCaption"></div>
          </div>
        `;
        stage.appendChild(letterbox);

        showNextFrame();
      }

      function showNextFrame() {
        if (pool.size === 0) {
          frameTimer = setTimeout(showNextFrame, 3000);
          return;
        }

        let mediaId, isNewUpload = false;
        if (pendingNewUpload.id && pool.has(pendingNewUpload.id) && pendingNewUpload.id !== currentMediaId) {
          mediaId = pendingNewUpload.id;
          pendingNewUpload.id = null;
          isNewUpload = true;
        } else {
          mediaId = pickWeightedRandom(currentMediaId);
        }

        if (!mediaId) {
          frameTimer = setTimeout(showNextFrame, 3000);
          return;
        }

        const media = pool.get(mediaId);
        if (!media) {
          frameTimer = setTimeout(showNextFrame, 3000);
          return;
        }

        currentMediaId = mediaId;
        const isFeatured = media.favorite;
        const duration = isFeatured ? DURATION_FEATURED : DURATION_NORMAL;

        const transition = TRANSITIONS[Math.floor(Math.random() * TRANSITIONS.length)];

        renderFrame(media, transition, isNewUpload, isFirstFrame);
        renderCaption(media, duration);

        isFirstFrame = false;

        frameTimer = setTimeout(showNextFrame, duration);
      }

      function renderFrame(media, transition, isNewUpload, isFirst) {
        const frame = document.getElementById("cinemaFrame");
        if (!frame) return;

        const oldWrapper = frame.querySelector(".cinema-media-wrapper");
        if (oldWrapper && !isFirst) {
          oldWrapper.classList.add(`exit-${transition}`);
          setTimeout(() => oldWrapper.remove(), 800);
        }

        const wrapper = document.createElement("div");
        wrapper.className = `cinema-media-wrapper enter-${transition}`;
        if (isNewUpload) wrapper.classList.add("new-upload-glow");

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

        if (isNewUpload) {
          setTimeout(() => wrapper.classList.remove("new-upload-glow"), 1500);
        }
      }

      function renderCaption(media, frameDuration) {
        const captionEl = document.getElementById("cinemaCaption");
        if (!captionEl) return;

        if (captionTimer) clearTimeout(captionTimer);
        captionEl.classList.remove("crawling");
        captionEl.textContent = "";

        if (!media.favorite || !Array.isArray(media.aiStory) || media.aiStory.length === 0) {
          return;
        }

        const story = media.aiStory[Math.floor(Math.random() * media.aiStory.length)];
        captionEl.textContent = story;

        const captionDuration = Math.floor(frameDuration * CAPTION_DURATION_RATIO);
        captionEl.style.setProperty("--caption-duration", `${captionDuration}ms`);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => captionEl.classList.add("crawling"));
        });
      }

      function cleanup() {
        if (frameTimer) clearTimeout(frameTimer);
        if (captionTimer) clearTimeout(captionTimer);
        stage.classList.remove("pattern-cinema");
        stage.innerHTML = "";
      }

      return { init, cleanup };
    }
  });

  // ========== PATTERN E: SCRAPBOOK VIVENTE ==========
  registerPattern("scrapbook", {
    create(context) {
      const { stage, pool, pickWeightedRandom, generateVariation, pendingNewUpload } = context;

      // CONFIG
      const PAGE_DURATION = 35000;
      const MIN_PHOTOS_PER_PAGE = 2;
      const MAX_PHOTOS_PER_PAGE = 4;
      const ROTATION_MAX = 10;
      const TAPE_STYLES = ["tape", "pin", "corner"];

      // STATE
      let pageTimer = null;
      let currentPageMediaIds = [];

      function init() {
        stage.classList.add("pattern-scrapbook");
        stage.innerHTML = "";

        const page = document.createElement("div");
        page.className = "scrapbook-page";
        stage.appendChild(page);

        showNextPage();
      }

      function showNextPage() {
        if (pool.size === 0) {
          pageTimer = setTimeout(showNextPage, 3000);
          return;
        }

        const count = Math.min(
          MIN_PHOTOS_PER_PAGE + Math.floor(Math.random() * (MAX_PHOTOS_PER_PAGE - MIN_PHOTOS_PER_PAGE + 1)),
          pool.size
        );

        const picked = new Set();
        const photos = [];
        let lastId = null;

        for (let i = 0; i < count; i++) {
          let id = null;

          // pickWeightedRandom in loop: evita id già pescati questa pagina
          for (let attempt = 0; attempt < 8; attempt++) {
            const candidate = pickWeightedRandom(lastId);
            if (candidate && !picked.has(candidate)) {
              id = candidate;
              break;
            }
          }

          // Fallback: scan diretto preferendo foto non viste nella pagina precedente
          if (!id) {
            for (const [k] of pool) {
              if (!picked.has(k) && !currentPageMediaIds.includes(k)) { id = k; break; }
            }
          }
          // Fallback finale: qualsiasi foto non ancora pescata
          if (!id) {
            for (const [k] of pool) {
              if (!picked.has(k)) { id = k; break; }
            }
          }

          if (id) {
            picked.add(id);
            const media = pool.get(id);
            if (media) { photos.push(media); lastId = id; }
          }
        }

        currentPageMediaIds = [...picked];

        const featured = photos.find(m => m.favorite && Array.isArray(m.aiStory) && m.aiStory.length > 0) || null;
        composePage(photos, featured);

        pageTimer = setTimeout(showNextPage, PAGE_DURATION);
      }

      function composePage(photos, featuredMedia) {
        const pageEl = stage.querySelector(".scrapbook-page");
        if (!pageEl) return;

        const content = document.createElement("div");
        content.className = "scrapbook-page-content";

        photos.forEach(media => {
          const rotation = (Math.random() * 2 - 1) * ROTATION_MAX;
          const offsetX = ((Math.random() * 2 - 1) * 1.5).toFixed(2);
          const offsetY = ((Math.random() * 2 - 1) * 1.5).toFixed(2);
          const tapeStyle = TAPE_STYLES[Math.floor(Math.random() * TAPE_STYLES.length)];

          const photoEl = document.createElement("div");
          photoEl.className = `scrapbook-photo with-${tapeStyle}`;
          photoEl.style.transform = `rotate(${rotation.toFixed(1)}deg) translate(${offsetX}vw, ${offsetY}vh)`;

          if (media.fileType === "video") {
            const video = document.createElement("video");
            video.src = media.url;
            video.muted = true;
            video.autoplay = true;
            video.loop = true;
            video.playsInline = true;
            photoEl.appendChild(video);
          } else {
            const img = document.createElement("img");
            img.src = media.url;
            img.alt = "";
            photoEl.appendChild(img);
          }

          content.appendChild(photoEl);
        });

        if (featuredMedia && featuredMedia.aiStory.length > 0) {
          const story = featuredMedia.aiStory[Math.floor(Math.random() * featuredMedia.aiStory.length)];
          const caption = document.createElement("div");
          caption.className = "scrapbook-caption";
          caption.textContent = story;
          content.appendChild(caption);
        }

        transitionToPage(content);
      }

      function transitionToPage(newContent) {
        const pageEl = stage.querySelector(".scrapbook-page");
        if (!pageEl) return;

        const old = pageEl.querySelector(".scrapbook-page-content");

        // PRIMA PAGINA: niente da sfogliare → fade semplice
        if (!old) {
          pageEl.appendChild(newContent);
          requestAnimationFrame(() => newContent.classList.add("visible"));
          return;
        }

        // PAGINE SUCCESSIVE: page-flip 3D
        // Fase 1: vecchia pagina ruota via (rotateY 0 → -100deg)
        old.classList.add("flip-out");

        // Fase 2: nuova pagina entra ruotando (rotateY 95 → 0deg), delay = durata fase 1
        newContent.classList.add("flip-in");
        pageEl.appendChild(newContent);

        // Rimuovi vecchia pagina al termine fase uscita (~900ms + margine)
        setTimeout(() => {
          if (old && old.parentNode) old.remove();
        }, 950);
      }

      function cleanup() {
        if (pageTimer) clearTimeout(pageTimer);
        stage.classList.remove("pattern-scrapbook");
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
