/* Generic scroll-scrubbed video tour engine — mahabalipuram.html.
 * One `ScrollTour.create(config)` call builds and wires up one section:
 * sticky video stage, scroll-driven currentTime, chapter captions, and a
 * shared right-side progress rail. Content (chapters, headings, video
 * paths) lives in js/monuments-content.js — this file has no monument
 * specifics in it, so a fourth section is just a new content entry plus
 * one more `ScrollTour.create(...)` call (see README).
 *
 * Sections are lazy: the video's `src` is only set once the section is
 * within one viewport of entering (IntersectionObserver), and cleared
 * again once it's more than one viewport away, so at most one of the
 * three 4K ladders is ever actually buffered at a time.
 */
window.ScrollTour = (function () {
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DEV = location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  const DEBUG_FRAME = new URLSearchParams(location.search).get("debugFrame") === "1";
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Shared right-side progress rail ---------- */
  const rail = { el: null, sections: [] };
  function ensureRail() {
    if (rail.el) return rail.el;
    const el = document.createElement("div");
    el.className = "tour-rail-global";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    rail.el = el;
    return el;
  }
  function registerRailSegment(state) {
    const railEl = ensureRail();
    const seg = document.createElement("div");
    seg.className = "tour-rail-seg";
    seg.innerHTML = `<i></i>`;
    seg.title = state.config.heading;
    railEl.appendChild(seg);
    rail.sections.push(state);
    state.railSeg = seg;
  }
  function updateRail() {
    for (const state of rail.sections) {
      const bar = state.railSeg?.querySelector("i");
      if (!bar) continue;
      bar.style.height = `${(state.progress * 100).toFixed(2)}%`;
      state.railSeg.classList.toggle("active", state.active);
    }
  }

  function codecSupport(mime) {
    const v = document.createElement("video");
    return !!v.canPlayType && v.canPlayType(mime) !== "";
  }
  const HEVC_OK = codecSupport('video/mp4; codecs="hvc1.2.4.L153.B0"');
  const AV1_OK = codecSupport('video/mp4; codecs="av01.0.05M.08"');

  function tiersFor(videoBase) {
    return {
      2160: HEVC_OK ? `${videoBase}-2160p-hevc.mp4` : AV1_OK ? `${videoBase}-2160p-av1.mp4` : null,
      1440: HEVC_OK ? `${videoBase}-1440p-hevc.mp4` : AV1_OK ? `${videoBase}-1440p-av1.mp4` : null,
      1080: HEVC_OK ? `${videoBase}-1080p-hevc.mp4` : AV1_OK ? `${videoBase}-1080p-av1.mp4` : `${videoBase}-1080p-h264.mp4`,
      720: `${videoBase}-720p-h264.mp4`,
    };
  }
  function chooseTier(tiers) {
    const conn = navigator.connection;
    const saveData = !!(conn && conn.saveData);
    const effType = (conn && conn.effectiveType) || "4g";
    const goodConn = !saveData && (effType === "4g" || effType === "unknown");
    const px = window.devicePixelRatio * window.innerWidth;
    if (!goodConn) return tiers[720] ? 720 : 1080;
    if (px >= 3000 && tiers[2160]) return 2160;
    if (px >= 1800 && tiers[1440]) return 1440;
    return 1080;
  }

  function renderSectionHTML(config) {
    return `
      <div class="tour-stage" id="${config.sectionId}-stage">
        <div class="tour-media" id="${config.sectionId}-media">
          <picture>
            <source srcset="${config.poster}.avif" type="image/avif" />
            <img class="tour-poster" src="${config.poster}.jpg" alt="${esc(config.heading)} — rendered as a 3D model" />
          </picture>
          <video class="tour-video" id="${config.sectionId}-video" muted playsinline preload="none" aria-hidden="true"></video>
          <div class="tour-scrim" aria-hidden="true"></div>
          <div class="tour-debug-frame" aria-hidden="true" hidden></div>
        </div>
        <div class="tour-frame">
          <div class="tour-head wrap">
            <span class="tour-number">${esc(config.number)}</span>
            <span class="tour-eyebrow"><span class="dot"></span>${esc(config.subheading)}</span>
            <h2 class="tour-heading">${esc(config.heading)}</h2>
          </div>
          <div class="tour-caption wrap">
            <p class="tour-word" id="${config.sectionId}-word"></p>
            <p class="tour-sub" id="${config.sectionId}-sub"></p>
          </div>
          <div class="tour-rail wrap">
            <span class="tour-progress"><i id="${config.sectionId}-progress-bar"></i></span>
          </div>
        </div>
      </div>`;
  }

  function renderDivider(number) {
    return `<div class="tour-divider" aria-hidden="true"><span class="tour-divider-line"></span><span class="tour-divider-num">${esc(number)}</span></div>`;
  }

  /**
   * config: {
   *   sectionId, number, heading, subheading,
   *   videoBase, poster, chapters: [{start,end,title,body}],
   *   scrollHeight (css length, default '600vh'), mountTo (container element)
   * }
   */
  function create(config) {
    const scrollHeight = config.scrollHeight || "600vh";
    const host = document.createElement("section");
    host.className = "tour";
    host.id = config.sectionId;
    host.style.height = scrollHeight;
    host.setAttribute("aria-label", `Scroll-driven tour of ${config.heading}, rendered in 3D`);
    host.innerHTML = renderSectionHTML(config);
    config.mountTo.appendChild(host);

    const media = host.querySelector(".tour-media");
    const video = host.querySelector(".tour-video");
    const wordEl = host.querySelector(".tour-word");
    const subEl = host.querySelector(".tour-sub");
    const progressBar = host.querySelector(".tour-progress i");
    const debugBox = host.querySelector(".tour-debug-frame");

    if (DEBUG_FRAME) debugBox.hidden = false;

    const tiers = tiersFor(config.videoBase);
    const state = { config, progress: 0, active: false, railSeg: null, loaded: false, duration: 0 };
    registerRailSegment(state);

    function activate() {
      if (state.loaded) return;
      state.loaded = true;
      /* Attach BEFORE setting src, then re-check readyState: a cached file
       * can have its metadata ready before the listener would land, which
       * would leave duration at 0 and the scrub permanently inert. */
      let metaDone = false;
      const onMeta = () => {
        if (metaDone) return;
        metaDone = true;
        state.duration = video.duration || 0;
        media.classList.add("video-ready");
        onScroll();
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.preload = "auto";
      video.src = tiers[1080] || tiers[720];
      if (video.readyState >= 1) onMeta();

      const target = chooseTier(tiers);
      if (target !== 1080 && tiers[target]) {
        const probe = document.createElement("video");
        probe.muted = true;
        probe.preload = "auto";
        probe.src = tiers[target];
        probe.addEventListener(
          "canplaythrough",
          () => {
            if (!state.loaded) return; // section was unloaded before this resolved
            const t = video.currentTime;
            video.addEventListener("loadedmetadata", () => { video.currentTime = t; }, { once: true });
            video.src = tiers[target];
            if (DEV) console.log(`[scroll-tour:${config.sectionId}] swapped to ${target}p`);
          },
          { once: true }
        );
      }
      if (DEV) console.log(`[scroll-tour:${config.sectionId}] activated, HEVC=${HEVC_OK} AV1=${AV1_OK} target=${target}p`);
    }

    function deactivate() {
      if (!state.loaded) return;
      state.loaded = false;
      state.duration = 0;
      video.pause();
      video.removeAttribute("src");
      video.load();
      media.classList.remove("video-ready");
      if (DEV) console.log(`[scroll-tour:${config.sectionId}] unloaded (off-screen)`);
    }

    function updateCaption(seconds) {
      const active = config.chapters.find((c) => seconds >= c.start && seconds < c.end) || config.chapters[config.chapters.length - 1];
      if (wordEl.textContent !== active.title) {
        wordEl.textContent = active.title;
        subEl.textContent = active.body;
        wordEl.classList.remove("visible");
        subEl.classList.remove("visible");
        void wordEl.offsetWidth;
        wordEl.classList.add("visible");
        subEl.classList.add("visible");
      }
    }

    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const rect = host.getBoundingClientRect();
        state.active = rect.top < window.innerHeight && rect.bottom > 0;
        if (!state.duration) { updateRail(); return; }
        const range = host.offsetHeight - window.innerHeight;
        if (range <= 0) return;
        const p = clamp(-rect.top / range, 0, 1);
        state.progress = p;
        video.currentTime = p * state.duration;
        progressBar.style.width = `${(p * 100).toFixed(2)}%`;
        updateCaption(video.currentTime);
        updateRail();
      });
    }

    if (REDUCED_MOTION) {
      // No scroll-jacking, no lazy unload: play the loop normally.
      host.classList.add("tour-fallback");
      activate();
      video.loop = true;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}), { once: true });
      video.addEventListener("timeupdate", () => {
        if (state.duration) updateCaption(video.currentTime);
      });
      return state;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) activate();
          else deactivate();
        }
      },
      { rootMargin: "100% 0px 100% 0px" }
    );
    io.observe(host);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return state;
  }

  /* ================= Combined mode =================
   * One stitched master video, chapters grouped by monument. The heading
   * and section number swap during each dip-to-black; the right-hand rail
   * becomes one segment per monument with a clickable dot per chapter.
   */
  function renderCombinedHTML(config, totalGroups) {
    const first = config.groups[0];
    return `
      <div class="tour-stage">
        <div class="tour-media">
          <picture>
            <source srcset="${config.poster}.avif" type="image/avif" />
            <img class="tour-poster" src="${config.poster}.jpg" alt="${esc(config.breadcrumb)} — rendered as a 3D model" />
          </picture>
          <video class="tour-video" muted playsinline preload="metadata" aria-hidden="true"></video>
          <div class="tour-scrim" aria-hidden="true"></div>
          <div class="tour-debug-frame" aria-hidden="true" hidden></div>
        </div>
        <div class="tour-frame">
          <div class="tour-head wrap">
            <span class="tour-breadcrumb">
              <b>${esc(config.breadcrumb)}</b><span class="crumb-sep">—</span><span class="crumb-now">${esc(first.number)}</span> / ${esc(String(totalGroups).padStart(2, "0"))}
            </span>
            <div class="tour-title-swap">
              <span class="tour-number">${esc(first.number)}</span>
              <span class="tour-eyebrow"><span class="dot"></span><span class="eyebrow-text">${esc(first.subheading)}</span></span>
              <h2 class="tour-heading">${esc(first.heading)}</h2>
            </div>
          </div>
          <div class="tour-caption wrap">
            <p class="tour-word"></p>
            <p class="tour-sub"></p>
          </div>
        </div>
      </div>`;
  }

  function createCombined(config) {
    const groups = config.groups;
    const total = groups.length;
    const duration0 = config.estimatedDuration || 30;
    const vhPer8 = config.vhPerEightSeconds || 150;

    const host = document.createElement("section");
    host.className = "tour tour-combined";
    host.id = config.sectionId;
    host.style.height = `${Math.round((duration0 / 8) * vhPer8)}vh`;
    host.setAttribute("aria-label", `Scroll-driven tour of ${config.breadcrumb}, rendered in 3D`);
    host.innerHTML = renderCombinedHTML(config, total);
    config.mountTo.appendChild(host);

    const media = host.querySelector(".tour-media");
    const video = host.querySelector(".tour-video");
    const wordEl = host.querySelector(".tour-word");
    const subEl = host.querySelector(".tour-sub");
    const swapEl = host.querySelector(".tour-title-swap");
    const numberEl = host.querySelector(".tour-number");
    const eyebrowEl = host.querySelector(".eyebrow-text");
    const headingEl = host.querySelector(".tour-heading");
    const crumbNow = host.querySelector(".crumb-now");
    if (DEBUG_FRAME) host.querySelector(".tour-debug-frame").hidden = false;

    // Group boundaries. The swap lands mid-dip: the 0.6s fadeblack ends where
    // the next group starts, so its darkest point is ~0.3s before that.
    const groupStart = groups.map((g) => Math.min(...g.chapters.map((c) => c.start)));
    const swapAt = groupStart.map((s, i) => (i === 0 ? -Infinity : s - 0.3));

    let duration = 0;
    const tiers = tiersFor(config.videoBase);

    /* ---------- Rail: a segment per monument, a dot per chapter ---------- */
    const railEl = ensureRail();
    railEl.classList.add("is-interactive");
    const segs = groups.map((g, gi) => {
      const seg = document.createElement("div");
      seg.className = "tour-rail-seg";
      const span = (gi === total - 1 ? duration0 : groupStart[gi + 1]) - groupStart[gi];
      seg.style.flexGrow = String(Math.max(span, 0.1));
      seg.innerHTML = `<i class="rail-fill"></i>${DEV ? '<i class="rail-buf"></i>' : ""}`;
      seg.title = g.heading;
      for (const c of g.chapters) {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "tour-rail-dot";
        dot.style.top = `${(((c.start - groupStart[gi]) / Math.max(span, 0.1)) * 100).toFixed(2)}%`;
        dot.title = `${g.heading} — ${c.title}`;
        dot.setAttribute("aria-label", `Jump to ${c.title}`);
        dot.addEventListener("click", () => seekToTime(c.start));
        seg.appendChild(dot);
      }
      railEl.appendChild(seg);
      return seg;
    });

    function scrollRange() {
      return host.offsetHeight - window.innerHeight;
    }
    function seekToTime(t) {
      if (!duration) return;
      const top = host.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (t / duration) * scrollRange(), behavior: REDUCED_MOTION ? "auto" : "smooth" });
    }

    /* ---------- Load: metadata first so nothing blocks on the download ---------- */
    /* Attach BEFORE setting src, then re-check readyState: a cached file can
     * have its metadata ready before the listener would land, which would
     * leave duration at 0 and the scrub permanently inert. */
    let metaDone = false;
    const onMeta = () => {
      if (metaDone) return;
      metaDone = true;
      duration = video.duration || duration0;
      // Re-scale the track to the real duration, then let it buffer.
      host.style.height = `${Math.round((duration / 8) * vhPer8)}vh`;
      video.preload = "auto";
      media.classList.add("video-ready");
      if (DEV) console.log(`[scroll-tour:combined] duration=${duration.toFixed(2)}s track=${host.style.height}`);
      onScroll();
    };
    video.addEventListener("loadedmetadata", onMeta);
    video.preload = "metadata";
    video.src = tiers[1080] || tiers[720];
    if (video.readyState >= 1) onMeta();

    const target = chooseTier(tiers);
    if (target !== 1080 && tiers[target]) {
      const probe = document.createElement("video");
      probe.muted = true;
      probe.preload = "auto";
      probe.src = tiers[target];
      probe.addEventListener(
        "canplaythrough",
        () => {
          const t = video.currentTime;
          video.addEventListener("loadedmetadata", () => { video.currentTime = t; }, { once: true });
          video.src = tiers[target];
          if (DEV) console.log(`[scroll-tour:combined] swapped to ${target}p`);
        },
        { once: true }
      );
    }
    if (DEV) console.log(`[scroll-tour:combined] HEVC=${HEVC_OK} AV1=${AV1_OK} target=${target}p`);

    /* ---------- Captions + heading swap ---------- */
    let lastGroup = -1;
    function updateHeading(t) {
      let gi = 0;
      for (let i = 0; i < swapAt.length; i++) if (t >= swapAt[i]) gi = i;
      if (gi === lastGroup) return;
      lastGroup = gi;
      const g = groups[gi];
      swapEl.classList.add("swapping");
      setTimeout(() => {
        numberEl.textContent = g.number;
        eyebrowEl.textContent = g.subheading;
        headingEl.textContent = g.heading;
        crumbNow.textContent = g.number;
        swapEl.classList.remove("swapping");
      }, 260);
      segs.forEach((s, i) => s.classList.toggle("active", i === gi));
    }

    let lastChapter = null;
    function updateCaption(t) {
      const all = groups.flatMap((g) => g.chapters);
      const active = all.find((c) => t >= c.start && t < c.end) || all[all.length - 1];
      if (active === lastChapter) return;
      lastChapter = active;
      wordEl.textContent = active.title;
      subEl.textContent = active.body;
      wordEl.classList.remove("visible");
      subEl.classList.remove("visible");
      void wordEl.offsetWidth;
      wordEl.classList.add("visible");
      subEl.classList.add("visible");
    }

    function updateRail(t) {
      for (let i = 0; i < groups.length; i++) {
        const from = groupStart[i];
        const to = i === total - 1 ? duration : groupStart[i + 1];
        const p = clamp((t - from) / Math.max(to - from, 0.001), 0, 1);
        segs[i].querySelector(".rail-fill").style.height = `${(p * 100).toFixed(2)}%`;
        if (DEV && video.buffered.length) {
          const bufEnd = video.buffered.end(video.buffered.length - 1);
          const bp = clamp((bufEnd - from) / Math.max(to - from, 0.001), 0, 1);
          const buf = segs[i].querySelector(".rail-buf");
          if (buf) buf.style.height = `${(bp * 100).toFixed(2)}%`;
        }
      }
    }

    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!duration) return;
        const range = scrollRange();
        if (range <= 0) return;
        const p = clamp(-host.getBoundingClientRect().top / range, 0, 1);
        const t = p * duration;
        video.currentTime = t;
        updateCaption(t);
        updateHeading(t);
        updateRail(t);
      });
    }

    if (REDUCED_MOTION) {
      host.classList.add("tour-fallback");
      video.loop = true;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}), { once: true });
      video.addEventListener("timeupdate", () => {
        if (duration) { updateCaption(video.currentTime); updateHeading(video.currentTime); updateRail(video.currentTime); }
      });
      return;
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    if (DEV) video.addEventListener("progress", () => duration && updateRail(video.currentTime));
  }

  return { create, createCombined, renderDivider };
})();
