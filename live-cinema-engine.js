(function() {
  "use strict";

  // ========== CONFIG ==========
  const POOL_LIMIT = 150;
  const VARIATIONS_HISTORY = 5;  // ricorda ultime 5 variazioni di stesso media per non ripetere

  // ========== STATE ==========
  const pool = new Map();              // id → normalizedMedia
  const variationsHistory = new Map(); // mediaId → array<varConfig> (max VARIATIONS_HISTORY)
  let currentMode = "scrapbook";   // default produzione: Galleria = scrapbook mobile (switch Telegram resta attivo)
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
      aiStory: Array.isArray(d.ai_story) ? d.ai_story : [],
      posterUrl: d.poster_url || null,
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
      const { stage, pool } = context;

      // CONFIG
      const MEDIA_PER_PAGE = 2;   // target mobile finale
      const ROTATION_MAX = 10;
      const TAPE_STYLES = ["tape", "pin", "corner"];

      // STATE
      let pageTimer = null;
      let pages = [];             // array di pagine (ognuna = array di max MEDIA_PER_PAGE media)
      let currentPageIndex = 0;
      let fullscreenOverlay = null;   // C1: overlay visualizzatore fullscreen (creato on demand)
      let fullscreenVideoEl = null;   // C2: riferimento al video del fullscreen (per pausa alla chiusura)

      function init() {
        stage.classList.add("pattern-scrapbook");
        stage.innerHTML = "";

        const page = document.createElement("div");
        page.className = "scrapbook-page";
        stage.appendChild(page);

        buildNavUI();

        pages = buildPages();
        currentPageIndex = 0;
        renderPage(0);
      }

      // Overlay navigazione A2: 3 zone tap (sx=prev, dx=next, centro=inerte) + frecce + indicatore.
      function buildNavUI() {
        const nav = document.createElement("div");
        nav.className = "scrapbook-nav";

        const left = document.createElement("div");
        left.className = "scrapbook-nav-zone left";
        left.addEventListener("click", goPrev);

        const center = document.createElement("div");
        center.className = "scrapbook-nav-zone center";
        // centro INERTE in A2 — in Fase C aprirà il media in fullscreen

        const right = document.createElement("div");
        right.className = "scrapbook-nav-zone right";
        right.addEventListener("click", goNext);

        nav.appendChild(left);
        nav.appendChild(center);
        nav.appendChild(right);
        stage.appendChild(nav);

        // Frecce discrete: puramente VISIVE (pointer-events:none nel CSS) — il tap lo gestiscono le zone sotto.
        const arrowLeft = document.createElement("div");
        arrowLeft.className = "scrapbook-arrow left";
        arrowLeft.textContent = "‹";
        arrowLeft.setAttribute("aria-hidden", "true");

        const arrowRight = document.createElement("div");
        arrowRight.className = "scrapbook-arrow right";
        arrowRight.textContent = "›";
        arrowRight.setAttribute("aria-hidden", "true");

        stage.appendChild(arrowLeft);
        stage.appendChild(arrowRight);

        // Indicatore "pagina X di Y"
        const indicator = document.createElement("div");
        indicator.className = "scrapbook-page-indicator";
        indicator.textContent = "—";
        stage.appendChild(indicator);
      }

      function goNext() {
        if (!pages.length) return;
        // SET STABILE (D2-A): ricostruzione SOLO qui, sul loop ultima→prima → entrano media nuovi.
        if (currentPageIndex >= pages.length - 1) {
          pages = buildPages();
          currentPageIndex = 0;
        } else {
          currentPageIndex += 1;
        }
        renderPage(currentPageIndex);
      }

      function goPrev() {
        if (!pages.length) return;
        if (currentPageIndex <= 0) {
          currentPageIndex = pages.length - 1;   // loop all'ultima
        } else {
          currentPageIndex -= 1;
        }
        renderPage(currentPageIndex);
      }

      function updateIndicator() {
        const ind = stage.querySelector(".scrapbook-page-indicator");
        if (!ind) return;
        ind.textContent = pages.length ? (currentPageIndex + 1) + " / " + pages.length : "—";
      }

      // Costruisce il set di pagine DETERMINISTICO dal pool:
      // media ordinati per uploadDate DESC (più recenti prima), poi spezzati in chunk da MEDIA_PER_PAGE.
      // Es: 7 media → [[m1,m2],[m3,m4],[m5,m6],[m7]] (ultima pagina può avere 1 media).
      function buildPages() {
        const all = Array.from(pool.values());
        all.sort((a, b) => uploadMillis(b) - uploadMillis(a));   // DESC: più recenti prima
        const result = [];
        for (let i = 0; i < all.length; i += MEDIA_PER_PAGE) {
          result.push(all.slice(i, i + MEDIA_PER_PAGE));
        }
        return result;
      }

      // uploadDate è un Firestore Timestamp (o variante): normalizza a millisecondi per l'ordinamento.
      function uploadMillis(media) {
        const v = media && media.uploadDate;
        if (!v) return 0;
        if (typeof v.toMillis === "function") return v.toMillis();
        if (typeof v.seconds === "number") return v.seconds * 1000;
        if (v instanceof Date) return v.getTime();
        const n = Date.parse(v);
        return isNaN(n) ? 0 : n;
      }

      // Mostra la pagina all'indice dato — pagine FISSE, niente più sorteggio.
      function renderPage(index) {
        if (pageTimer) { clearTimeout(pageTimer); pageTimer = null; }

        // Pool ancora vuoto / nessuna pagina → attesa media (retry), poi ricostruisci.
        if (!pages.length) {
          updateIndicator();
          pageTimer = setTimeout(() => {
            pages = buildPages();
            renderPage(0);
          }, 3000);
          return;
        }

        // Normalizza l'indice nel range valido (loop sicuro su entrambi i versi).
        const total = pages.length;
        currentPageIndex = ((index % total) + total) % total;

        const pageMedia = pages[currentPageIndex];
        composePage(pageMedia);
        updateIndicator();

        // A2: navigazione SOLO manuale (tap zone / frecce). Nessun avanzamento automatico.
      }

      function composePage(photos) {
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
            // A4: primo frame FERMO + badge ▶ (placeholder; poster vero via ffmpeg = Fase E).
            // NIENTE autoplay/loop → risparmia dati/batteria ed evita problemi autoplay iOS.
            const videoWrap = document.createElement("div");
            videoWrap.className = "scrapbook-video-wrap";

            const video = document.createElement("video");
            video.src = media.url;
            video.muted = true;
            video.playsInline = true;
            video.preload = "metadata";   // mostra il primo frame senza scaricare tutto il video
            video.className = "scrapbook-video";
            if (media.posterUrl) { video.poster = media.posterUrl; }   // Fase E (se presente)

            // Robustezza primo frame: scrubba a 0.1s su browser che mostrano nero (NON avvia il play)
            video.addEventListener("loadedmetadata", () => {
              try { video.currentTime = 0.1; } catch (e) {}
            });

            // Overlay icona play (CSS puro) — in A4 SOLO visivo (apertura fullscreen = Fase C)
            const playBadge = document.createElement("div");
            playBadge.className = "scrapbook-play-badge";
            playBadge.setAttribute("aria-label", "Video");

            videoWrap.appendChild(video);
            videoWrap.appendChild(playBadge);
            photoEl.appendChild(videoWrap);
          } else {
            const img = document.createElement("img");
            img.src = media.url;
            img.alt = "";
            photoEl.appendChild(img);
          }

          // C1: tap diretto sulla polaroid → apre il SUO media in fullscreen
          photoEl.style.cursor = "pointer";
          photoEl.addEventListener("click", (e) => {
            e.stopPropagation();
            openFullscreen(media);   // 'media' = il singolo media di QUESTA polaroid (forEach)
          });

          content.appendChild(photoEl);
        });

        // A3: nessuna frase AI nello scrapbook (decisione sposi). CSS .scrapbook-caption lasciato inerte.

        transitionToPage(content);
      }

      // ===== C1/C2: visualizzatore fullscreen (foto=img, video=player audio; zoom = Fase D) =====
      function openFullscreen(media) {
        if (!media) return;

        closeFullscreen();   // sicurezza: chiudi eventuale overlay già aperto

        fullscreenOverlay = document.createElement("div");
        fullscreenOverlay.className = "scrapbook-fullscreen";

        const closeBtn = document.createElement("button");
        closeBtn.className = "scrapbook-fullscreen-close";
        closeBtn.setAttribute("aria-label", "Chiudi");
        closeBtn.textContent = "✕";
        closeBtn.addEventListener("click", (e) => { e.stopPropagation(); closeFullscreen(); });
        fullscreenOverlay.appendChild(closeBtn);

        if (media.fileType === "video") {
          // C2: elemento video NUOVO con audio + controlli + autoplay (NON quello del collage A4)
          const video = document.createElement("video");
          video.className = "scrapbook-fullscreen-video";
          video.src = media.url;        // video = original_url (file reale con audio)
          video.controls = true;        // controlli nativi (play/pausa/barra)
          video.playsInline = true;     // niente takeover fullscreen forzato iOS
          video.autoplay = true;        // user-initiated dal tap
          // NIENTE muted → audio attivo (l'utente l'ha aperto apposta)
          if (media.posterUrl) { video.poster = media.posterUrl; }
          fullscreenOverlay.appendChild(video);

          fullscreenVideoEl = video;    // riferimento per la pausa alla chiusura

          const p = video.play();
          if (p && typeof p.catch === "function") {
            p.catch((err) => console.warn("[fullscreen] autoplay video bloccato:", err));
          }
        } else {
          // C1: foto
          const img = document.createElement("img");
          img.className = "scrapbook-fullscreen-img";
          img.src = media.url;   // foto = display_url (≤2560px)
          img.alt = "";
          fullscreenOverlay.appendChild(img);
        }

        // tap-fuori (sul backdrop, non sul media) → chiudi
        fullscreenOverlay.addEventListener("click", (e) => {
          if (e.target === fullscreenOverlay) closeFullscreen();
        });

        document.body.appendChild(fullscreenOverlay);
        document.body.style.overflow = "hidden";   // blocca scroll dietro
        document.addEventListener("keydown", onFullscreenKeydown);
      }

      function onFullscreenKeydown(e) {
        if (e.key === "Escape") closeFullscreen();
      }

      function closeFullscreen() {
        // C2: pausa il video se presente (SOLO pausa, NO reset currentTime — decisione B)
        if (fullscreenVideoEl) {
          try { fullscreenVideoEl.pause(); } catch (e) {}
          fullscreenVideoEl = null;
        }
        if (fullscreenOverlay) {
          fullscreenOverlay.remove();
          fullscreenOverlay = null;
        }
        document.body.style.overflow = "";   // ripristina scroll
        document.removeEventListener("keydown", onFullscreenKeydown);
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
        closeFullscreen();   // C1: rimuove overlay + listener keydown + ripristina overflow
        if (pageTimer) clearTimeout(pageTimer);
        pageTimer = null;
        pages = [];
        currentPageIndex = 0;
        stage.classList.remove("pattern-scrapbook");
        stage.innerHTML = "";
      }

      return { init, cleanup };
    }
  });

  // ========== PATTERN D: PARTICLE BURST (Photo Explosion) ==========
  registerPattern("burst", {
    create(context) {
      const { stage, pool, pickWeightedRandom, pendingNewUpload } = context;

      const WAVE_SIZE_MIN = 3;
      const WAVE_SIZE_MAX = 4;
      const PHOTO_LIFETIME = 5500;
      const BURST_INTERVAL = 450;
      const WAVE_PAUSE = 3200;
      const MAX_ON_SCREEN = 8;
      const ROTATION_MAX = 25;

      let waveTimer = null;
      const burstTimers = new Set();
      const activePhotos = new Set();

      function init() {
        stage.classList.add("pattern-burst");
        stage.innerHTML = "";
        const layer = document.createElement("div");
        layer.className = "burst-layer";
        stage.appendChild(layer);
        scheduleWave();
      }

      function scheduleWave() {
        if (pool.size === 0) {
          waveTimer = setTimeout(scheduleWave, 3000);
          return;
        }

        const waveSize = Math.min(
          WAVE_SIZE_MIN + Math.floor(Math.random() * (WAVE_SIZE_MAX - WAVE_SIZE_MIN + 1)),
          pool.size
        );

        let lastId = null;
        for (let i = 0; i < waveSize; i++) {
          const isFirst = i === 0;
          const isLast = i === waveSize - 1;
          const delay = i * BURST_INTERVAL;
          const tid = setTimeout(() => {
            burstTimers.delete(tid);
            let mediaId;
            let isNewUpload = false;
            if (isFirst && pendingNewUpload.id && pool.has(pendingNewUpload.id)) {
              mediaId = pendingNewUpload.id;
              pendingNewUpload.id = null;
              isNewUpload = true;
            } else {
              mediaId = pickWeightedRandom(lastId);
            }
            if (!mediaId) return;
            lastId = mediaId;
            const media = pool.get(mediaId);
            if (media) spawnPhoto(media, isNewUpload);
            if (isLast) {
              waveTimer = setTimeout(scheduleWave, WAVE_PAUSE);
            }
          }, delay);
          burstTimers.add(tid);
        }
      }

      function spawnPhoto(media, isNewUpload) {
        const layer = stage.querySelector(".burst-layer");
        if (!layer) return;

        if (activePhotos.size >= MAX_ON_SCREEN) {
          const oldest = activePhotos.values().next().value;
          if (oldest && oldest.parentNode) oldest.remove();
          activePhotos.delete(oldest);
        }

        const el = document.createElement("div");
        el.className = "burst-photo";
        if (media.favorite) el.classList.add("featured");
        if (isNewUpload) el.classList.add("new-upload-glow");

        const angle = Math.random() * Math.PI * 2;
        const dist = 15 + Math.random() * 30;
        const tx = (Math.cos(angle) * dist).toFixed(2);
        const ty = (Math.sin(angle) * dist * 0.6).toFixed(2);
        const rot = ((Math.random() * 2 - 1) * ROTATION_MAX).toFixed(2);

        el.style.setProperty("--tx", tx + "vw");
        el.style.setProperty("--ty", ty + "vh");
        el.style.setProperty("--rot", rot + "deg");

        let mediaEl;
        if (media.fileType === "video") {
          mediaEl = document.createElement("video");
          mediaEl.muted = true;
          mediaEl.autoplay = true;
          mediaEl.loop = true;
          mediaEl.playsInline = true;
          mediaEl.src = media.url;
        } else {
          mediaEl = document.createElement("img");
          mediaEl.src = media.url;
        }
        el.appendChild(mediaEl);
        layer.appendChild(el);
        activePhotos.add(el);

        const fadeTimer = setTimeout(() => {
          burstTimers.delete(fadeTimer);
          el.classList.add("burst-out");
          const removeTimer = setTimeout(() => {
            burstTimers.delete(removeTimer);
            if (el.parentNode) el.remove();
            activePhotos.delete(el);
          }, 700);
          burstTimers.add(removeTimer);
        }, PHOTO_LIFETIME);
        burstTimers.add(fadeTimer);
      }

      function cleanup() {
        clearTimeout(waveTimer);
        burstTimers.forEach(clearTimeout);
        burstTimers.clear();
        activePhotos.clear();
        stage.classList.remove("pattern-burst");
        stage.innerHTML = "";
      }

      return { init, cleanup };
    }
  });

  // ========== PATTERN F: VIDEO DEGLI OSPITI ==========
  registerPattern("video", {
    create(context) {
      const { stage, pool, pendingNewUpload } = context;

      // CONFIG
      const SAFETY_TIMEOUT = 300000;  // 5 min fallback, sostituito da loadedmetadata con durata reale

      // STATE
      let currentIndex  = 0;
      let currentVideo  = null;
      let endedListener = null;
      let errorListener = null;
      let safetyTimer   = null;
      let retryTimer    = null;

      function getVideos() {
        const vids = [];
        pool.forEach((media) => { if (media.fileType === "video") vids.push(media); });
        return vids;
      }

      function showEmptyState() {
        stage.innerHTML = "";
        const card = document.createElement("div");
        card.className = "video-empty-state";
        card.innerHTML =
          '<p class="video-empty-title">In attesa di video…</p>' +
          '<p class="video-empty-sub">I video degli ospiti appariranno qui</p>';
        stage.appendChild(card);
        retryTimer = setTimeout(playNext, 5000);
      }

      function playNext() {
        // Cleanup video precedente
        if (currentVideo) {
          if (endedListener) currentVideo.removeEventListener("ended", endedListener);
          if (errorListener) currentVideo.removeEventListener("error", errorListener);
          currentVideo.pause();
          currentVideo.src = "";
          currentVideo = null;
        }
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        if (retryTimer)  { clearTimeout(retryTimer);  retryTimer  = null; }

        const videos = getVideos();

        if (videos.length === 0) {
          showEmptyState();
          return;
        }

        // Priorità: pendingNewUpload se è un video
        let media;
        if (
          pendingNewUpload.id &&
          pool.has(pendingNewUpload.id) &&
          pool.get(pendingNewUpload.id).fileType === "video"
        ) {
          media = pool.get(pendingNewUpload.id);
          pendingNewUpload.id = null;
          const idx = videos.findIndex((v) => v.id === media.id);
          if (idx !== -1) currentIndex = (idx + 1) % videos.length;
        } else {
          currentIndex = currentIndex % videos.length;
          media = videos[currentIndex];
          currentIndex = (currentIndex + 1) % videos.length;
        }

        // Costruisci stage
        stage.innerHTML = "";

        const container = document.createElement("div");
        container.className = "video-player-container";

        const video = document.createElement("video");
        video.src         = media.url;
        video.muted       = true;
        video.autoplay    = true;
        video.playsInline = true;
        video.controls    = false;
        video.poster      = media.posterUrl || "";
        video.className   = "video-fullscreen";
        container.appendChild(video);

        if (media.uploaderName && media.uploaderName.trim() && media.uploaderName !== "Anonimo") {
          const caption = document.createElement("div");
          caption.className   = "video-caption";
          caption.textContent = media.uploaderName;
          container.appendChild(caption);
        }

        stage.appendChild(container);
        currentVideo = video;

        endedListener = () => playNext();
        errorListener = () => {
          console.warn("[cinema:video] errore video, skip al prossimo");
          playNext();
        };
        video.addEventListener("ended", endedListener);
        video.addEventListener("error", errorListener);

        // Fallback anti-freeze: 5 min, sostituito da loadedmetadata con durata reale
        safetyTimer = setTimeout(() => {
          console.warn("[cinema:video] safety fallback 5min — avanzo al prossimo");
          playNext();
        }, SAFETY_TIMEOUT);

        video.addEventListener("loadedmetadata", () => {
          clearTimeout(safetyTimer);
          const dur = video.duration;
          if (isFinite(dur) && dur > 0) {
            safetyTimer = setTimeout(() => {
              console.warn("[cinema:video] safety timeout (dur+15s) — avanzo al prossimo");
              playNext();
            }, (dur + 15) * 1000);
          }
        });

        const playPromise = video.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => console.warn("[cinema:video] autoplay bloccato:", err));
        }
      }

      return {
        init() {
          stage.classList.add("pattern-video");
          stage.innerHTML = "";
          currentIndex = 0;
          playNext();
        },
        cleanup() {
          if (currentVideo) {
            if (endedListener) currentVideo.removeEventListener("ended", endedListener);
            if (errorListener) currentVideo.removeEventListener("error", errorListener);
            currentVideo.pause();
            currentVideo.src = "";
            currentVideo = null;
          }
          if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
          if (retryTimer)  { clearTimeout(retryTimer);  retryTimer  = null; }
          endedListener = null;
          errorListener = null;
          stage.classList.remove("pattern-video");
          stage.innerHTML = "";
        }
      };
    }
  });

  // ========== BOOTSTRAP ==========
  document.addEventListener("DOMContentLoaded", () => {
    subscribeToMedia();
    subscribeToModeChanges();
  });

})();
