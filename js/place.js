/* Mahabalipuram destination page.
 * Renders the monument cards and fills each one with a photo from the
 * Wikipedia REST summary endpoint — the same source the map's detail cards use.
 * The page reads fine with no network: cards keep their text, photos just stay empty.
 */
(function () {
  /* Shared with the on-site guide — see content/mahabalipuram-monuments.js,
   * which must load before this script. */
  const MONUMENTS = window.MAHABALIPURAM_MONUMENTS || [];
  if (!MONUMENTS.length) return;

  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const smoothstep = (t) => t * t * (3 - 2 * t);

  /* ---------- Cards ---------- */
  const cardHtml = (m, i) => `
    <article class="mon">
      <div class="mon-photo"${m.photo ? ` data-wiki="${esc(m.wiki)}"` : ""}>
        <span class="ph-fallback">${esc(m.title)}</span>
      </div>
      <div class="mon-body">
        <div class="mon-meta">
          <span class="mon-num">${String(i + 1).padStart(2, "0")}</span>
          <span class="mon-when">${esc(m.when)}</span>
        </div>
        <h3>${esc(m.title)}</h3>
        <p>${esc(m.text)}</p>
        <div class="mon-tags">
          ${m.tags.map((t) => `<span>${esc(t)}</span>`).join("")}
          ${m.mapSite ? `<span><a href="index.html#site=${esc(m.mapSite)}">On the map →</a></span>` : ""}
        </div>
      </div>
    </article>`;

  const $ = (id) => document.getElementById(id);
  const grid = $("monuments-grid");
  const flyEl = $("fly");
  const scene = $("fly-scene");
  if (!grid || !flyEl || !scene) return;

  /* The top bar floats over the dark video stages at the top of the page and
   * over light paper below them: flag which, so the CSS can restyle it. */
  const toursRoot = $("tours-root");
  const navBar = document.querySelector(".place-bar");
  function updateBarTheme() {
    const navH = navBar ? navBar.offsetHeight : 0;
    const past = !toursRoot || toursRoot.getBoundingClientRect().bottom <= navH;
    document.documentElement.classList.toggle("past-tours", past);
  }
  window.addEventListener("scroll", updateBarTheme, { passive: true });
  window.addEventListener("resize", updateBarTheme);
  updateBarTheme();

  /* The flythrough is the headline presentation, but only one card is on screen
   * at a time — so the flat list stays below it as the accessible index rather
   * than being swapped out. Reduced motion gets the list on its own. */
  const FLY = !REDUCED_MOTION;

  /* The grid lists every monument; the flythrough shows a curated subset.
   * That split is load-bearing, not editorial tidiness: `.fly` is
   * `height: calc(100vh + var(--steps) * 60vh)`, so driving --steps from the
   * full list would take this page from ~6 screens of scroll to ~15. The
   * flythrough is the cinematic intro; the grid is the index. */
  const FEATURED = MONUMENTS.filter((m) => m.feature);

  grid.innerHTML = MONUMENTS.map(cardHtml).join("");

  if (FLY) {
    scene.innerHTML = FEATURED.map((m, i) => `<div class="fly-card">${cardHtml(m, i)}</div>`).join("");
    flyEl.style.setProperty("--steps", String(FEATURED.length));
    flyEl.hidden = false;
    $("fly-total").textContent = String(FEATURED.length);
    // The list below the tour covers everything, not just the featured few.
    document.querySelectorAll(".mon-h-flat, .mon-sub-flat").forEach((el) => (el.hidden = true));
    document.querySelectorAll(".mon-h-fly, .mon-sub-fly").forEach((el) => (el.hidden = false));
    document.documentElement.classList.add("is-3d");
  }

  /* ---------- Map card ---------- */
  /* Where the tour's monuments stand, numbered like the cards. In the tour it
   * sits in the frame above the cards and lights up the monument flying past;
   * without the tour it heads the list instead. */
  const mapSlot = $(FLY ? "smc-fly" : "smc-flat");
  const siteMap =
    mapSlot && window.SiteMapCard
      ? window.SiteMapCard.mount(mapSlot, {
          monuments: FEATURED,
          href: "mahabalipuram-guide.html",
          place: "Mamallapuram",
          sub: FLY
            ? "Keep scrolling — they come to you, one at a time."
            : `The ${FEATURED.length} monuments of the tour, where they stand.`,
        })
      : null;

  /* The site plan (Chapter II) — every monument, not just the featured eight.
   * Mounted here, before the reduced-motion return below, so the flat page
   * gets it too; it fetches nothing until the section is near. */
  if (window.SitePlan) {
    window.SitePlan.mount($("site-plan"), {
      monuments: MONUMENTS,
      routes: window.MAHABALIPURAM_ROUTES || [],
      guideHref: "mahabalipuram-guide.html",
      threeDHref: "mahabalipuram-3d.html",
    });
  }

  /* On a computer the map docks beside the cards and stays open for the whole
   * tour, lighting up each monument as its card flies past. On a phone there
   * is no room beside a card, so it sits in the head above them and folds
   * away once the tour starts (see drawFly). 860 px is the narrowest width
   * that fits a 320 px map column next to a 440 px card. The slot is moved in
   * the DOM rather than only restyled, so on a phone it keeps its place
   * between the heading and the skip link. */
  const DOCK_MQ = window.matchMedia("(min-width: 860px)");
  const flyStage = flyEl.querySelector(".fly-stage");
  const flyHeadWrap = flyEl.querySelector(".fly-head .wrap");
  function placeMap() {
    if (!FLY || !mapSlot || !flyStage || !flyHeadWrap) return;
    const dock = DOCK_MQ.matches;
    flyStage.classList.toggle("has-dock", dock);
    if (dock && mapSlot.parentNode !== flyStage) flyStage.insertBefore(mapSlot, scene);
    if (!dock && mapSlot.parentNode !== flyHeadWrap) flyHeadWrap.insertBefore(mapSlot, flyHeadWrap.querySelector(".fly-skip"));
  }
  placeMap();

  /* ---------- Photos ---------- */
  /* Shared with the guide page via js/wiki-photo.js — the memoised cache, the
   * disambiguation guard and the credit line all live there now.
   *
   * Only monuments with photo:true carry a data-wiki attribute, so the seven
   * that have no Wikipedia article of their own make NO request and simply
   * keep their .ph-fallback name plate. */
  document.querySelectorAll(".mon-photo[data-wiki]").forEach(async (slot) => {
    if (!window.WikiPhoto) return;
    const got = await window.WikiPhoto.lookup([slot.dataset.wiki], { size: "thumb" });
    if (!got || !slot.isConnected) return;
    slot.innerHTML = `<img src="${esc(got.src)}" alt="${esc(got.title)}" loading="lazy" decoding="async" />`;
  });

  // The hero backdrop is the Shore Temple, at full resolution where available.
  (window.WikiPhoto ? window.WikiPhoto.summary("Shore Temple") : Promise.resolve(null)).then((d) => {
    const src = d?.originalimage?.width <= 2600 ? d.originalimage.source : d?.thumbnail?.source;
    const far = $("hero-far");
    if (!src || !far) return;
    const img = new Image();
    img.onload = () => {
      far.style.backgroundImage = `url("${src}")`;
      far.style.opacity = FLY ? "0.4" : "0.28";
    };
    img.src = src;
  });

  if (!FLY) return;

  /* ---------- Camera ---------- */
  /* Cards sit on a line receding into the screen, one SPACING apart. Scrolling
   * drives the camera forward along that line; each card therefore rises out of
   * the dark, settles dead centre at z = 0, then sweeps past the viewer.
   * The eased segment gives every card a rest stop at z = 0 long enough to read. */
  const SPACING = 700;
  const TRAVEL_SHARE = 0.6; // of each scroll segment; the remainder is the rest stop

  const cards = [...scene.querySelectorAll(".fly-card")];
  const hero = $("hero");
  const heroContent = $("hero-content");
  const heroFar = $("hero-far");
  const flyIndex = $("fly-index");
  const flyNow = $("fly-now");
  const flyBar = $("fly-bar");
  const reveals = [
    ...document.querySelectorAll("#plan .sec-head, #story .sec-head, #visit .sec-head, .tl li, .visit-card"),
  ];

  function travelFor(p) {
    const n = cards.length;
    const k = Math.min(Math.floor(p * n), n - 1);
    const t = p * n - k;
    return SPACING * (k + smoothstep(clamp(t / TRAVEL_SHARE, 0, 1)));
  }

  // Fade up out of the depths, hold through the rest stop, fade as it sails past.
  function opacityFor(z) {
    if (z < -SPACING * 1.9 || z > SPACING * 0.72) return 0;
    if (z < -SPACING * 0.95) return (z + SPACING * 1.9) / (SPACING * 0.95);
    if (z > SPACING * 0.22) return 1 - (z - SPACING * 0.22) / (SPACING * 0.5);
    return 1;
  }

  /* On a phone the map card is big enough that the flying cards need its room
   * back, so it folds away as soon as the tour gets going and returns when you
   * scroll up to the start. Docked beside the cards on a computer, it never
   * folds. The fold and the `inert` that keeps its links out of the tab order
   * are set together here, so they can never disagree. */
  let folded = false;

  let lastIndex = -1;
  function drawFly() {
    const rect = flyEl.getBoundingClientRect();
    const range = flyEl.offsetHeight - window.innerHeight;
    if (range <= 0) return;
    const p = clamp(-rect.top / range, 0, 1);
    const travel = travelFor(p);

    const fold = !DOCK_MQ.matches && p > 0.03;
    if (fold !== folded) {
      folded = fold;
      flyEl.classList.toggle("map-folded", fold);
      if (mapSlot) mapSlot.inert = fold;
    }

    let nearest = 0;
    let nearestDist = Infinity;
    // How far a distant card swings out to the side. 155 px on a desktop, but
    // on a phone that pushes half the card off screen, so it scales with width.
    const swing = Math.min(155, window.innerWidth * 0.2);

    cards.forEach((el, i) => {
      const z = -(i + 1) * SPACING + travel;
      const o = opacityFor(z);
      if (o <= 0.002) {
        if (el.style.visibility !== "hidden") {
          el.style.visibility = "hidden";
          el.style.opacity = "0";
        }
        return;
      }
      // Swing in from alternating sides and straighten out as it reaches the camera.
      const depth = clamp(-z / SPACING, 0, 1);
      const side = i % 2 ? 1 : -1;
      el.style.visibility = "visible";
      el.style.opacity = o.toFixed(3);
      el.style.transform =
        `translate3d(${(side * swing * depth).toFixed(1)}px, ${(depth * -26).toFixed(1)}px, ${z.toFixed(1)}px)` +
        ` rotateY(${(-side * 17 * depth).toFixed(2)}deg)`;
      el.style.zIndex = String(500 + Math.round(z / 10));

      const dist = Math.abs(z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });

    flyBar.style.width = `${(p * 100).toFixed(2)}%`;
    if (nearest !== lastIndex) {
      lastIndex = nearest;
      flyIndex.textContent = String(nearest + 1);
      flyNow.textContent = FEATURED[nearest].title;
      if (siteMap) siteMap.setActive(FEATURED[nearest].id);
    }
  }

  function drawHero() {
    const r = hero.getBoundingClientRect();
    const p = clamp(-r.top / (r.height * 0.9), 0, 1);
    heroContent.style.transform =
      `translate3d(0, ${(p * -44).toFixed(1)}px, ${(p * -270).toFixed(1)}px) rotateX(${(p * 7).toFixed(2)}deg)`;
    heroContent.style.opacity = (1 - p * 0.85).toFixed(3);
    if (heroFar.style.backgroundImage) {
      heroFar.style.transform = `translate3d(0, ${(p * 95).toFixed(1)}px, 0) scale(${(1.06 + p * 0.13).toFixed(3)})`;
    }
  }

  // Timeline entries and visit cards tip up out of the page as they arrive.
  function drawReveals() {
    const vh = window.innerHeight;
    for (const el of reveals) {
      const r = el.getBoundingClientRect();
      if (r.top > vh + 120 || r.bottom < -160) continue;
      const e = smoothstep(clamp((vh - r.top) / (vh * 0.55), 0, 1));
      el.style.opacity = e.toFixed(3);
      el.style.transform =
        `translate3d(0, ${((1 - e) * 46).toFixed(1)}px, ${((1 - e) * -220).toFixed(1)}px)` +
        ` rotateX(${((1 - e) * -12).toFixed(2)}deg)`;
    }
  }

  /* Coalesce scroll events into one frame by replacing the pending request
   * rather than guarding with a flag: a frame that never lands (the tab was
   * backgrounded, or laid out at zero height) would latch that flag on and
   * silently kill the animation for the rest of the page's life. */
  let frame = 0;
  function draw() {
    frame = 0;
    drawFly();
    drawHero();
    drawReveals();
  }
  function onScroll() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  // A backgrounded tab stops serving frames, so the queued draw never lands and
  // the scene is stale on return. Redraw whenever the page becomes live again.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) onScroll();
  });
  window.addEventListener("pageshow", onScroll);
  // Crossing the dock width (a window resized, a tablet turned): move the map.
  DOCK_MQ.addEventListener("change", () => {
    placeMap();
    onScroll();
  });
  onScroll();
})();
