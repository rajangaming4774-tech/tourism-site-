/* India Heritage Map — homepage app (v3).
 * Layers: 198 heritage sites (4 types) + per-period Kingdoms choropleth.
 * Features: time slider with play mode, search, deep links, trails,
 * post-1947 year scrubber, cross-linked dynasty/site cards, wiki photos.
 */
(async function () {
  const TYPE_META = {
    rock_art: { label: "Rock art", color: "#e2493b" },
    temple: { label: "Temple", color: "#e39a1e" },
    asi_site: { label: "ASI / UNESCO", color: "#2f9fe0" },
    excavation: { label: "Excavation", color: "#14b385" },
  };
  /* Places with a full guide page of their own. Each gets a standing marker on
   * the map — visible in every period — that opens the guide when tapped. */
  const PLACE_GUIDES = [
    {
      id: "mahabalipuram",
      label: "Mahabalipuram",
      blurb: "Pallava shore temples & rock reliefs — open the guide",
      url: "mahabalipuram.html",
      // The on-site wayfinding map — routes, facilities and "you are here".
      mapUrl: "mahabalipuram-guide.html",
      center: [80.1928, 12.6269],
      sites: ["TM-015", "TM-018"],
    },
  ];
  const guideForSite = (id) => PLACE_GUIDES.find((g) => g.sites.includes(id));

  /* Why a monument standing right next to the 3D masses is not one itself.
   * Recorded so the absence reads as a decision rather than a gap; the full
   * reasoning lives with the height table in content/mahabalipuram-heights.js. */
  const NO_MASSING_NOTE = {
    "TM-018":
      "Not raised in 3D: the OpenStreetMap outline here is the walled prakara around both " +
      "shrines and the courtyard between them — 46 × 21 m, four times the cited ~15 m platform. " +
      "The published 18 m belongs to the Kshatriyasimhesvara tower alone, so standing that " +
      "outline up would put a 46 × 21 × 18 m slab on the shoreline. It qualifies the day OSM " +
      "carries a separate way for the vimana.",
  };

  const BASE_OPACITY = 0.95;
  const GLOW_OPACITY = 0.3;
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Splash hero ---------- */
  const splash = document.getElementById("splash");
  const splashCta = document.getElementById("splash-cta");
  // Real modal while it's up: everything behind it is unreachable by mouse,
  // keyboard and screen reader until it's dismissed.
  const heroSiblings = [
    document.querySelector(".site-header"),
    document.querySelector("main.layout"),
    document.querySelector(".timeline"),
  ];
  heroSiblings.forEach((el) => el?.setAttribute("inert", ""));

  function dismissSplash() {
    heroSiblings.forEach((el) => el?.removeAttribute("inert"));
    splash.classList.add("done");
    setTimeout(() => splash.remove(), 700);
    // Globe intro: spin in from orbit and settle over India.
    if (introPending) {
      introPending = false;
      map.flyTo({ center: INDIA_CENTER, zoom: INDIA_ZOOM, duration: 3200, curve: 1.3, essential: true });
    }
  }

  /* ---------- Data ---------- */
  let sites, periods, records, statesGeo, dynasties, trails;
  try {
    [sites, periods, records, statesGeo, dynasties, trails] = await Promise.all([
      fetch("data/sites.geojson").then((r) => { if (!r.ok) throw new Error("sites"); return r.json(); }),
      fetch("data/periods.json").then((r) => { if (!r.ok) throw new Error("periods"); return r.json(); }),
      fetch("data/research/post1947.json").then((r) => { if (!r.ok) throw new Error("records"); return r.json(); }),
      fetch("data/india_states_min.geojson").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("data/dynasties.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("data/trails.json").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
  } catch {
    // Core data failed (network down, bad deploy, blocked request) — never
    // leave the visitor staring at a button that will never work.
    splashCta.disabled = false;
    splashCta.textContent = "Couldn't load — tap to retry";
    splashCta.addEventListener("click", () => location.reload());
    splashCta.focus();
    return;
  }
  splashCta.addEventListener("click", dismissSplash);
  const KINGDOMS_READY = Boolean(statesGeo && dynasties);
  const KINGDOM_PALETTE = [
    "#8b5cf6", "#d97706", "#0ea5e9", "#10b981", "#e11d48",
    "#eab308", "#6366f1", "#14b8a6", "#f472b6", "#84cc16",
    "#f97316", "#22d3ee",
  ];
  const KINGDOM_FILL_OPACITY = 0.32;
  const siteById = new Map(sites.features.map((f) => [f.properties.id, f]));

  // Deep links skip the globe intro and land straight on India.
  const initialHash = Object.fromEntries(
    location.hash.replace(/^#/, "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent))
  );
  const skipIntro = Boolean(initialHash.site || initialHash.trail || REDUCED_MOTION);

  // A phone's map area is both narrower and shorter (header + timeline eat a
  // much bigger share of the viewport), so it needs a lower zoom to still
  // show all of India rather than cropping the south and the northeast.
  const isMobileViewport = window.matchMedia("(max-width: 768px)").matches;
  const INDIA_CENTER = [80.5, 22.5];
  const INDIA_ZOOM = isMobileViewport ? 3.35 : 4.1;

  const map = new maplibregl.Map({
    container: "map",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    center: skipIntro ? INDIA_CENTER : [72, 12],
    zoom: skipIntro ? INDIA_ZOOM : 1.6,
    minZoom: 1.2,
    // z18 so the cited-height monuments are actually approachable — a ratha is
    // 8–12 m across and stays a smudge at z16. Both the vector basemap (z14)
    // and the DEM (z14) overzoom past their own maximum.
    maxZoom: 18,
    // The 3D camera asks for pitch 62; the default 60 clamps it silently.
    maxPitch: 75,
    fadeDuration: 300,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
  // Local dev only: a console handle for the same checks the guide map exposes
  // (querySourceFeatures, queryTerrainElevation, camera state).
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    window.__map = map;
  }
  let introPending = !skipIntro;

  // Never leave the splash locked if tiles are slow or blocked — the app is
  // safe to open early since every layer call below guards on map.getLayer().
  const mapLoadTimer = setTimeout(() => {
    if (splashCta.disabled) {
      splashCta.disabled = false;
      splashCta.textContent = "Explore the map";
      splashCta.focus();
    }
  }, 10000);

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const sliderEl = $("period-slider");
  const labelEl = $("period-label");
  const captionEl = $("period-caption");
  const countEl = $("site-count");
  const detailPanel = $("detail-panel");
  const detailContent = $("detail-content");
  const recordsPanel = $("records-panel");
  const recordsList = $("records-list");
  const tickRow = $("tick-row");
  const kingdomsChip = $("kingdoms-chip");
  const kingdomLegend = $("kingdom-legend");
  const searchInput = $("search");
  const searchResults = $("search-results");
  const trailRow = $("trail-row");
  const recordsBtn = $("records-btn");
  const legendToggle = $("legend-toggle");
  const legendPills = $("legend-pills");
  const browseBtn = $("browse-btn");
  const browsePanel = $("browse-panel");
  const browseList = $("browse-list");
  const browseSub = $("browse-sub");
  const playBtn = $("play-btn");
  const yearSlider = $("year-slider");
  const yearLabel = $("year-label");
  const chips = Array.from(document.querySelectorAll(".lrow[data-layer]"));

  const layerEnabled = Object.fromEntries(Object.keys(TYPE_META).map((t) => [t, true]));
  let kingdomsEnabled = KINGDOMS_READY;
  let activeTrail = null;

  const fmtYear = (y) => (y < 0 ? `${-y} BC` : `${y} AD`);
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  periods.forEach((p, i) => {
    const t = document.createElement("button");
    t.className = "tick";
    t.type = "button";
    t.title = p.label;
    t.setAttribute("aria-label", `Jump to ${p.label}`);
    t.addEventListener("click", () => {
      stopPlay();
      setPeriod(i);
    });
    tickRow.appendChild(t);
  });
  const ticks = Array.from(tickRow.children);

  const currentPeriod = () => periods[Number(sliderEl.value)];
  const inPeriod = (props, p) => {
    if (props.type === "excavation" && p.modern_track) return true; // digs are visitable today
    return props.period_start <= p.end && props.period_end >= p.start;
  };
  const periodIndexForYear = (y) => {
    const c = Math.max(-2000, Math.min(2026, y));
    return Math.max(0, periods.findIndex((p) => c >= p.start && c <= p.end));
  };

  function filterFor(type, p) {
    if (type === "excavation" && p.modern_track) return ["==", ["get", "type"], type];
    return [
      "all",
      ["==", ["get", "type"], type],
      ["<=", ["get", "period_start"], p.end],
      [">=", ["get", "period_end"], p.start],
    ];
  }

  function setLayerOpacity(type, on) {
    const dimExpr = activeTrail
      ? ["case", ["in", ["get", "id"], ["literal", activeTrail.stops]], BASE_OPACITY, 0.12]
      : BASE_OPACITY;
    map.setPaintProperty(`glow-${type}`, "circle-opacity", on ? (activeTrail ? 0.1 : GLOW_OPACITY) : 0);
    map.setPaintProperty(`sites-${type}`, "circle-opacity", on ? dimExpr : 0);
    map.setPaintProperty(`sites-${type}`, "circle-stroke-opacity", on ? 1 : 0);
  }

  /* ---------- Deep links ---------- */
  function updateHash(extra = {}) {
    const parts = [`p=${currentPeriod().id}`];
    if (extra.site) parts.push(`site=${extra.site}`);
    if (extra.dyn) parts.push(`dyn=${encodeURIComponent(extra.dyn)}`);
    if (activeTrail) parts.push(`trail=${activeTrail.id}`);
    history.replaceState(null, "", "#" + parts.join("&"));
  }
  function parseHash() {
    const h = Object.fromEntries(
      location.hash.replace(/^#/, "").split("&").filter(Boolean).map((kv) => kv.split("=").map(decodeURIComponent))
    );
    return h;
  }

  /* ---------- Kingdoms ---------- */
  function politiesFor(p) {
    if (!KINGDOMS_READY) return [];
    return (dynasties[p.id]?.polities ?? []).map((pol, i) => ({
      ...pol,
      color: KINGDOM_PALETTE[i % KINGDOM_PALETTE.length],
      periodId: p.id,
    }));
  }

  function kingdomMatchExpr(polities) {
    const arms = [];
    for (const pol of polities) {
      if (!pol.states?.length) continue;
      arms.push(pol.states, pol.color);
    }
    if (!arms.length) return null;
    return ["match", ["get", "st_nm"], ...arms, "rgba(0,0,0,0)"];
  }

  function applyKingdomState() {
    if (!KINGDOMS_READY || !map.getLayer("kingdom-fill")) return;
    const polities = politiesFor(currentPeriod());
    const expr = kingdomMatchExpr(polities);
    const visible = kingdomsEnabled && expr && !activeTrail;
    if (expr) map.setPaintProperty("kingdom-fill", "fill-color", expr);
    map.setPaintProperty("kingdom-fill", "fill-opacity", visible ? KINGDOM_FILL_OPACITY : 0);
    map.setPaintProperty("kingdom-outline", "line-opacity", visible ? 0.5 : 0);
    renderKingdomLegend(visible ? polities : []);
  }

  let legendExpanded = false;
  function renderKingdomLegend(polities) {
    const shown = polities.filter((p) => p.states?.length);
    kingdomLegend.hidden = shown.length === 0;
    if (!shown.length) return;
    const lead = shown[0];
    legendToggle.innerHTML = `
      <span class="k-swatch" style="background:${lead.color}"></span>
      Who ruled — ${esc(lead.name.split("(")[0].trim())}
      ${shown.length > 1 ? `<span class="k-count">+${shown.length - 1} more</span>` : ""}`;
    legendToggle.setAttribute("aria-expanded", String(legendExpanded));
    legendPills.hidden = !legendExpanded;
    legendPills.innerHTML = shown
      .map(
        (pol, i) => `
      <button class="k-pill" style="--i:${i}" type="button">
        <span class="k-swatch" style="background:${pol.color}"></span>${esc(pol.name)}
      </button>`
      )
      .join("");
    Array.from(legendPills.children).forEach((el, i) =>
      el.addEventListener("click", () => showKingdomDetail(shown[i]))
    );
  }
  legendToggle.addEventListener("click", () => {
    legendExpanded = !legendExpanded;
    legendToggle.setAttribute("aria-expanded", String(legendExpanded));
    legendPills.hidden = !legendExpanded;
  });

  /* Sites plausibly built under this polity: dynasty-token match + era overlap. */
  function monumentsOf(pol, p) {
    const tokens = `${pol.name} ${pol.dynasty || ""}`
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 4 && !["empire", "kingdom", "dynasty", "sultanate", "confederacy"].includes(w));
    if (!tokens.length) return [];
    return sites.features
      .filter((f) => {
        const d = `${f.properties.dynasty || ""} ${f.properties.builder || ""}`.toLowerCase();
        if (!d) return false;
        const start = f.properties.true_period_start ?? f.properties.period_start;
        return tokens.some((t) => d.includes(t)) && start >= p.start - 100 && start <= p.end + 100;
      })
      .slice(0, 6);
  }

  function showKingdomDetail(pol) {
    const p = periods.find((x) => x.id === pol.periodId) || currentPeriod();
    const rulers = (pol.rulers ?? []).filter((r) => r.name);
    const built = monumentsOf(pol, p);
    closeSidePanels();
    detailContent.innerHTML = `
      <span class="detail-type" style="color:${pol.color}">
        <span class="k-swatch" style="background:${pol.color}"></span>Ruling power
      </span>
      <h2>${esc(pol.name)}</h2>
      <div class="detail-state">${esc(pol.dynasty || "")}${pol.capital ? " · " + esc(pol.capital) : ""}</div>
      <div class="detail-era">${esc(p.label)}</div>
      <p class="summary">${esc(pol.summary)}</p>
      ${rulers.length ? `<dl class="detail-rulers">${rulers.map((r) => `<dt>${esc(r.name)}</dt><dd>${esc(r.reign || "")}</dd>`).join("")}</dl>` : ""}
      ${pol.note ? `<p class="k-note">⚠ ${esc(pol.note)}</p>` : ""}
      ${built.length ? `<div class="chip-row"><h3>From this era on the map</h3>${built.map((f) => `<button class="era-chip" data-site="${f.properties.id}">${esc(f.properties.name.split(",")[0])}</button>`).join("")}</div>` : ""}
      ${pol.states?.length ? `<p class="summary"><em>Approximate extent (modern states): ${pol.states.map(esc).join(", ")}.</em></p>` : ""}
      ${sourcesHtml(pol.sources)}`;
    detailContent.querySelectorAll("[data-site]").forEach((el) =>
      el.addEventListener("click", () => openSite(el.dataset.site))
    );
    openPanel(detailPanel);
    detailPanel.scrollTop = 0;
    applyUIState();
    updateHash({ dyn: pol.name });
  }

  function sourcesHtml(sources) {
    if (typeof sources === "string") {
      try { sources = JSON.parse(sources); } catch { sources = [sources]; }
    }
    if (!Array.isArray(sources) || !sources.length) return "";
    return `<div class="detail-sources"><h3>Sources</h3><ul>${sources
      .map((s) =>
        /^https?:\/\//.test(s)
          ? `<li><a href="${esc(s)}" target="_blank" rel="noopener">${esc(String(s).replace(/^https?:\/\/(www\.)?/, ""))}</a></li>`
          : `<li>${esc(s)}</li>`
      )
      .join("")}</ul></div>`;
  }

  /* ---------- Map crossfade ---------- */
  let fadeTimer = null;
  function applyMapState({ animate = true } = {}) {
    if (!map.getLayer("sites-rock_art")) return;
    const p = currentPeriod();
    const swap = () => {
      for (const type of Object.keys(TYPE_META)) {
        const filter = activeTrail
          ? ["all", ["==", ["get", "type"], type], ["in", ["get", "id"], ["literal", activeTrail.stops]]]
          : filterFor(type, p);
        map.setFilter(`sites-${type}`, filter);
        map.setFilter(`glow-${type}`, filter);
        setLayerOpacity(type, layerEnabled[type]);
      }
      applyKingdomState();
    };
    if (!animate || REDUCED_MOTION) {
      swap();
      return;
    }
    clearTimeout(fadeTimer);
    for (const type of Object.keys(TYPE_META)) setLayerOpacity(type, false);
    if (map.getLayer("kingdom-fill")) {
      map.setPaintProperty("kingdom-fill", "fill-opacity", 0);
      map.setPaintProperty("kingdom-outline", "line-opacity", 0);
    }
    fadeTimer = setTimeout(swap, 180);
  }

  function applyUIState() {
    const p = currentPeriod();
    const i = Number(sliderEl.value);

    labelEl.textContent = p.label;
    captionEl.textContent = p.caption;
    captionEl.setAttribute("aria-expanded", "false");
    for (const el of [labelEl, captionEl]) {
      el.classList.remove("fade-swap");
      void el.offsetWidth;
      el.classList.add("fade-swap");
    }
    ticks.forEach((t, ti) => t.classList.toggle("active", ti === i));

    const n = sites.features.filter((f) => layerEnabled[f.properties.type] && inPeriod(f.properties, p)).length;
    countEl.textContent = `${n} sites`;

    // The post-1947 record is opt-in: a button appears in the final period.
    const inModern = Boolean(p.modern_track) && !activeTrail;
    recordsBtn.hidden = !inModern;
    if (!inModern && !recordsPanel.hidden) {
      hidePanel(recordsPanel);
      recordsBtn.setAttribute("aria-pressed", "false");
    }
    if (!browsePanel.hidden) renderBrowse();
    updateHash();
  }
  captionEl.addEventListener("click", () => {
    const open = captionEl.getAttribute("aria-expanded") === "true";
    captionEl.setAttribute("aria-expanded", String(!open));
  });
  recordsBtn.addEventListener("click", () => {
    const opening = recordsPanel.hidden;
    recordsBtn.setAttribute("aria-pressed", String(opening));
    if (opening) {
      hidePanel(browsePanel);
      browseBtn.setAttribute("aria-pressed", "false");
      openPanel(recordsPanel);
    } else {
      hidePanel(recordsPanel);
    }
  });

  function setPeriod(i, { animate = true } = {}) {
    sliderEl.value = String(i);
    applyUIState();
    applyMapState({ animate });
  }

  /* ---------- Panels ---------- */
  function openPanel(panel) {
    clearTimeout(panel._hideTimer);
    panel.classList.remove("panel-out");
    panel.hidden = false;
  }
  function hidePanel(panel) {
    clearTimeout(panel._hideTimer);
    if (REDUCED_MOTION) {
      panel.hidden = true;
      return;
    }
    panel.classList.add("panel-out");
    panel._hideTimer = setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove("panel-out");
    }, 220);
  }
  // At most one right-hand panel on screen at a time — opening a site/kingdom/
  // trail card always wins over whatever list panel was open.
  function closeSidePanels() {
    if (!recordsPanel.hidden) {
      hidePanel(recordsPanel);
      recordsBtn.setAttribute("aria-pressed", "false");
    }
    if (!browsePanel.hidden) {
      hidePanel(browsePanel);
      browseBtn.setAttribute("aria-pressed", "false");
    }
  }

  /* ---------- Records (post-1947) ---------- */
  function renderRecords() {
    recordsList.innerHTML = records
      .map(
        (r, i) => `
      <div class="record-entry" style="--i:${Math.min(i, 9)}" data-year="${r.year}">
        <span class="record-year">${r.year}</span>
        <div class="record-body">
          <h3>${esc(r.title)}</h3>
          <p>${esc(r.text)}</p>
          <span class="record-cat">${esc(r.category)}</span>
          ${(r.related_places || [])
            .map((pl) => {
              const site = findSiteByPlace(pl);
              return site ? `<button class="record-place" data-site="${site.properties.id}">${esc(pl)}</button>` : "";
            })
            .join("")}
        </div>
      </div>`
      )
      .join("");
    recordsList.querySelectorAll("[data-site]").forEach((el) =>
      el.addEventListener("click", () => openSite(el.dataset.site))
    );
  }

  function findSiteByPlace(place) {
    const q = place.toLowerCase();
    return sites.features.find((f) => {
      const n = f.properties.name.toLowerCase();
      return n.includes(q) || q.includes(n.split(/[ ,(]/)[0]);
    });
  }

  yearSlider.addEventListener("input", () => {
    const y = Number(yearSlider.value);
    yearLabel.textContent = String(y);
    let target = null;
    recordsList.querySelectorAll(".record-entry").forEach((el) => {
      const ey = Number(el.dataset.year);
      el.classList.toggle("dimmed", ey > y);
      el.classList.toggle("current-year", ey === y);
      if (!target && ey >= y) target = el;
    });
    (target || recordsList.lastElementChild)?.scrollIntoView({ block: "start", behavior: REDUCED_MOTION ? "auto" : "smooth" });
  });

  /* ---------- Guide markers ---------- */
  /* A DOM marker rather than a circle layer: it must sit above every other
   * layer, stay put across period changes, and be a real tap target on touch. */
  function addGuideMarkers() {
    for (const g of PLACE_GUIDES) {
      const el = document.createElement("a");
      el.className = "guide-marker";
      el.href = g.url;
      el.setAttribute("aria-label", `${g.label} — ${g.blurb}`);
      el.title = g.blurb;
      el.innerHTML = `
        <span class="gm-pulse" aria-hidden="true"></span>
        <span class="gm-dot" aria-hidden="true"></span>
        <span class="gm-label">${esc(g.label)}</span>`;
      // Stop the click reaching the map, which would otherwise deselect.
      el.addEventListener("click", (e) => e.stopPropagation());
      // Anchor left and pull back half a dot so the dot — not the label — sits
      // on the coordinate, with the label reading out to the right of it.
      new maplibregl.Marker({ element: el, anchor: "left", offset: [-6.5, 0] })
        .setLngLat(g.center)
        .addTo(map);
    }
  }

  /* ---------- Site detail ---------- */
  const photoCache = new Map();
  async function loadPhoto(props, container) {
    const id = props.id;
    if (photoCache.has(id)) {
      if (photoCache.get(id)) container.innerHTML = photoCache.get(id);
      return;
    }
    const candidates = [
      props.name.split(/[,(]/)[0].trim(),
      props.name.replace(/\(.*?\)/g, "").trim(),
    ];
    for (const title of [...new Set(candidates)]) {
      try {
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
        if (!r.ok) continue;
        const d = await r.json();
        if (d.thumbnail?.source && d.type === "standard") {
          const src = d.originalimage && d.originalimage.width <= 2200 ? d.originalimage.source : d.thumbnail.source;
          const html = `<figure class="detail-photo"><img src="${esc(src)}" alt="${esc(props.name)}" loading="lazy" />
            <figcaption>Image · <a href="${esc(d.content_urls?.desktop?.page || "#")}" target="_blank" rel="noopener">Wikipedia</a></figcaption></figure>`;
          photoCache.set(id, html);
          if (container.isConnected) container.innerHTML = html;
          return;
        }
      } catch { /* offline or blocked — card stays text-only */ }
    }
    photoCache.set(id, "");
  }

  function eraRulerOf(props) {
    if (!KINGDOMS_READY) return null;
    const start = props.true_period_start ?? props.period_start;
    const p = periods[periodIndexForYear(start)];
    const pol = politiesFor(p).find((k) => k.states?.includes(props.state));
    return pol ? { pol, p } : null;
  }

  function alsoHere(props) {
    const me = siteById.get(props.id);
    if (!me) return [];
    const [lng, lat] = me.geometry.coordinates;
    return sites.features
      .filter((f) => {
        if (f.properties.id === props.id) return false;
        const [flng, flat] = f.geometry.coordinates;
        return Math.abs(flng - lng) < 0.06 && Math.abs(flat - lat) < 0.06;
      })
      .slice(0, 4);
  }

  function showDetail(props, lngLat) {
    const meta = TYPE_META[props.type];
    const start = props.true_period_start ?? props.period_start;
    const era =
      props.period_end >= 2026 ? `${fmtYear(start)} → present` : `${fmtYear(start)} → ${fmtYear(props.period_end)}`;

    const rows = [
      ["Style", props.style],
      ["Dynasty / builder", props.dynasty || props.builder],
      ["Category", props.category],
      ["Protection", props.protection],
      ["Excavated", props.excavated],
      ["Key finds", props.key_finds],
      ["Museum", props.museum],
      ["Discovery", props.discovery],
      ["Later additions", props.major_additions],
    ].filter(([, v]) => v);

    const ruler = eraRulerOf(props);
    const near = alsoHere(props);
    const guide = guideForSite(props.id);

    closeSidePanels();
    detailContent.innerHTML = `
      <span class="detail-type" style="color:${meta.color}">
        <span class="dot" style="background:${meta.color};border-color:${meta.color}"></span>${meta.label}
      </span>
      <h2>${esc(props.name)}</h2>
      <div class="detail-state">${esc(props.state)}</div>
      <div class="detail-era">${era}</div>
      <div id="photo-slot"></div>
      <p class="summary">${esc(props.summary)}</p>
      ${guide ? `<a class="guide-cta" href="${esc(guide.url)}">Open the ${esc(guide.label)} guide
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a>` : ""}
      ${guide && guide.mapUrl ? `<a class="guide-cta guide-cta-alt" href="${esc(guide.mapUrl)}">Site map &amp; facilities
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="14" height="14" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg></a>` : ""}
      ${rows.length ? `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}
      ${ruler ? `<div class="chip-row"><h3>Who ruled here then</h3><button class="era-chip" id="ruler-chip"><span class="k-swatch" style="background:${ruler.pol.color};display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px"></span>${esc(ruler.pol.name)} · ${esc(ruler.p.label)}</button></div>` : ""}
      ${near.length ? `<div class="chip-row"><h3>Also at this location</h3>${near.map((f) => `<button class="also-chip" data-site="${f.properties.id}">${esc(f.properties.name.split(",")[0])}</button>`).join("")}</div>` : ""}
      ${props.notes ? `<p class="summary"><em>${esc(props.notes)}</em></p>` : ""}
      ${NO_MASSING_NOTE[props.id] ? `<p class="summary detail-note"><em>${esc(NO_MASSING_NOTE[props.id])}</em></p>` : ""}
      ${sourcesHtml(props.sources)}`;

    detailContent.querySelector("#ruler-chip")?.addEventListener("click", () => showKingdomDetail(ruler.pol));
    detailContent.querySelectorAll("[data-site]").forEach((el) =>
      el.addEventListener("click", () => openSite(el.dataset.site))
    );
    loadPhoto(props, detailContent.querySelector("#photo-slot"));

    openPanel(detailPanel);
    detailPanel.scrollTop = 0;
    applyUIState();
    updateHash({ site: props.id });

    if (lngLat && !REDUCED_MOTION) {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      map.easeTo({
        center: lngLat,
        offset: isMobile ? [0, -90] : [-170, 0],
        duration: 650,
        easing: (t) => 1 - Math.pow(1 - t, 3),
        // Fold the tilt into this move rather than firing a second, competing
        // ease behind it when the camera is already in 3D.
        ...(terrainOn ? { pitch: 62 } : {}),
      });
    }
  }

  /* A monument tier, opened by clicking the 3D massing. Same card the guide
   * map shows, and the same admission: the total height and the storey count
   * are cited, the shape of the steps is not. */
  function showMassing(p) {
    closeSidePanels();
    detailContent.innerHTML = `
      <span class="detail-type" style="color:#c9ac7e">
        <span class="dot" style="background:#c9ac7e;border-color:#c9ac7e"></span>3D massing
      </span>
      <h2>${esc(p.name)}</h2>
      <div class="detail-state">Mahabalipuram, Tamil Nadu</div>
      <div class="detail-era">${esc(String(p.total_m))} m · ${esc(String(p.documentedTiers))} ${
        p.tierKind === "storey" ? "storeys" : "steps"
      }</div>
      <p class="summary">${esc(p.measure || "")}</p>
      <p class="summary"><em>Massing, not a model. The height and the storey count come from the
        sources below. How that height is split between the storeys, and how far each one steps
        in, are drawn to look like the building — they are not measured. The carving, the finial
        and the true plan of each storey are not in this geometry.</em></p>
      ${sourcesHtml([p.source, p.sourceUrl, p.tiersSource].filter(Boolean))}`;
    openPanel(detailPanel);
    detailPanel.scrollTop = 0;
  }

  /* Open a site from anywhere: jump the timeline to a period where it is
   * visible, fly to it, and show its card. */
  function openSite(id) {
    const f = siteById.get(id);
    if (!f) return;
    stopPlay();
    const props = f.properties;
    if (!inPeriod(props, currentPeriod())) {
      setPeriod(periodIndexForYear(props.period_start), { animate: false });
    }
    showDetail(props, f.geometry.coordinates);
  }

  function closeDetail() {
    hidePanel(detailPanel);
    setTimeout(applyUIState, 230);
  }

  /* ---------- Search ---------- */
  const searchIndex = [
    ...sites.features.map((f) => ({
      label: f.properties.name,
      sub: `${TYPE_META[f.properties.type].label} · ${f.properties.state}`,
      color: TYPE_META[f.properties.type].color,
      run: () => openSite(f.properties.id),
    })),
    ...(KINGDOMS_READY
      ? Object.entries(dynasties).flatMap(([pid, d]) => {
          const p = periods.find((x) => x.id === pid);
          return d.polities.map((pol, i) => ({
            label: pol.name,
            sub: `Ruling power · ${p.label}`,
            color: KINGDOM_PALETTE[i % KINGDOM_PALETTE.length],
            run: () => {
              stopPlay();
              setPeriod(periods.indexOf(p), { animate: false });
              showKingdomDetail({ ...pol, color: KINGDOM_PALETTE[i % KINGDOM_PALETTE.length], periodId: pid });
            },
          }));
        })
      : []),
  ];

  let srActive = -1;
  let srItems = [];
  function runSearch(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) {
      searchResults.hidden = true;
      return;
    }
    srItems = searchIndex.filter((x) => x.label.toLowerCase().includes(q) || x.sub.toLowerCase().includes(q)).slice(0, 8);
    // Pre-select the first hit so a bare Enter (no arrow key first) works.
    srActive = srItems.length ? 0 : -1;
    searchResults.hidden = srItems.length === 0;
    searchResults.innerHTML = srItems
      .map(
        (x, i) => `
      <button class="sr-item${i === srActive ? " active" : ""}" data-i="${i}" type="button">
        <span class="sr-dot" style="background:${x.color}"></span>
        <span>${esc(x.label)}<span class="sr-sub">${esc(x.sub)}</span></span>
      </button>`
      )
      .join("");
    searchResults.querySelectorAll(".sr-item").forEach((el) =>
      el.addEventListener("click", () => pickSearch(Number(el.dataset.i)))
    );
  }
  function pickSearch(i) {
    if (!srItems[i]) return;
    searchResults.hidden = true;
    searchInput.value = "";
    srItems[i].run();
  }
  searchInput.addEventListener("input", () => runSearch(searchInput.value));
  searchInput.addEventListener("keydown", (e) => {
    if (searchResults.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      srActive = (srActive + (e.key === "ArrowDown" ? 1 : -1) + srItems.length) % srItems.length;
      searchResults.querySelectorAll(".sr-item").forEach((el, i) => el.classList.toggle("active", i === srActive));
    } else if (e.key === "Enter" && srActive >= 0) {
      pickSearch(srActive);
    } else if (e.key === "Escape") {
      searchResults.hidden = true;
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) searchResults.hidden = true;
  });

  /* ---------- Browse ---------- */
  function renderBrowse() {
    const p = currentPeriod();
    const groups = {};
    for (const f of sites.features) {
      if (!layerEnabled[f.properties.type] || !inPeriod(f.properties, p)) continue;
      (groups[f.properties.type] ??= []).push(f);
    }
    browseSub.textContent = `${p.label} — click a site to fly to it`;
    browseList.innerHTML = Object.entries(groups)
      .map(
        ([type, fs]) => `
      <div class="browse-group" style="color:${TYPE_META[type].color}">${TYPE_META[type].label} (${fs.length})</div>
      ${fs
        .sort((a, b) => a.properties.name.localeCompare(b.properties.name))
        .map(
          (f) => `
        <button class="browse-item" data-site="${f.properties.id}" type="button">
          <span class="sr-dot" style="background:${TYPE_META[type].color}"></span>
          ${esc(f.properties.name.split(",")[0])}
          <span class="b-state">${esc(f.properties.state)}</span>
        </button>`
        )
        .join("")}`
      )
      .join("");
    browseList.querySelectorAll("[data-site]").forEach((el) =>
      el.addEventListener("click", () => openSite(el.dataset.site))
    );
  }
  browseBtn.addEventListener("click", () => {
    const opening = browsePanel.hidden;
    browseBtn.setAttribute("aria-pressed", String(opening));
    if (opening) {
      renderBrowse();
      hidePanel(recordsPanel);
      openPanel(browsePanel);
    } else {
      hidePanel(browsePanel);
      setTimeout(applyUIState, 230);
    }
  });

  /* ---------- Trails (chips inside the Explore panel) ---------- */
  function renderTrailRow() {
    trailRow.innerHTML = trails
      .map(
        (t) => `
      <button class="era-chip" data-trail="${t.id}" type="button" aria-pressed="${activeTrail?.id === t.id}">
        <span class="k-swatch" style="background:${t.color};display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px"></span>${esc(t.name)}
      </button>`
      )
      .join("");
    trailRow.querySelectorAll("[data-trail]").forEach((el) =>
      el.addEventListener("click", () => setTrail(activeTrail?.id === el.dataset.trail ? "" : el.dataset.trail))
    );
  }

  function setTrail(id) {
    stopPlay();
    activeTrail = trails.find((t) => t.id === id) || null;
    renderTrailRow();
    if (map.getSource("trail")) {
      map.getSource("trail").setData(trailGeojson());
      map.setPaintProperty("trail-line", "line-opacity", activeTrail ? 0.85 : 0);
    }
    applyMapState({ animate: false });
    if (activeTrail) {
      const coords = activeTrail.stops.map((s) => siteById.get(s)?.geometry.coordinates).filter(Boolean);
      const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(b, { padding: { top: 80, bottom: 80, left: 80, right: 420 }, duration: REDUCED_MOTION ? 0 : 900 });
      showTrailCard(activeTrail);
    } else {
      hidePanel(detailPanel);
      map.easeTo({ center: [80.5, 22.5], zoom: 4.1, duration: REDUCED_MOTION ? 0 : 700 });
      setTimeout(applyUIState, 230);
    }
    updateHash();
  }

  function trailGeojson() {
    if (!activeTrail) return { type: "FeatureCollection", features: [] };
    const coords = activeTrail.stops.map((s) => siteById.get(s)?.geometry.coordinates).filter(Boolean);
    return {
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: {} }],
    };
  }

  function showTrailCard(trail) {
    closeSidePanels();
    detailContent.innerHTML = `
      <span class="detail-type" style="color:${trail.color}">
        <span class="k-swatch" style="background:${trail.color}"></span>Heritage trail
      </span>
      <h2>${esc(trail.name)}</h2>
      <div class="detail-era">${trail.stops.length} stops</div>
      <p class="summary">${esc(trail.blurb)}</p>
      <div class="chip-row"><h3>Stops in order</h3>
        ${trail.stops
          .map((id, i) => {
            const f = siteById.get(id);
            return f ? `<button class="era-chip" data-site="${id}">${i + 1}. ${esc(f.properties.name.split(",")[0])}</button>` : "";
          })
          .join("")}
      </div>
      <p class="summary"><em>Close this card to exit the trail and return to the full map.</em></p>`;
    detailContent.querySelectorAll("[data-site]").forEach((el) =>
      el.addEventListener("click", () => {
        const f = siteById.get(el.dataset.site);
        showDetail(f.properties, f.geometry.coordinates);
      })
    );
    openPanel(detailPanel);
    detailPanel.scrollTop = 0;
  }

  /* ---------- Play through history ---------- */
  let playTimer = null;
  function stopPlay() {
    if (!playTimer) return;
    clearInterval(playTimer);
    playTimer = null;
    playBtn.setAttribute("aria-pressed", "false");
    playBtn.querySelector(".ic-play").style.display = "";
    playBtn.querySelector(".ic-pause").style.display = "none";
  }
  playBtn.addEventListener("click", () => {
    if (playTimer) return stopPlay();
    if (activeTrail) setTrail("");
    playBtn.setAttribute("aria-pressed", "true");
    playBtn.querySelector(".ic-play").style.display = "none";
    playBtn.querySelector(".ic-pause").style.display = "";
    if (Number(sliderEl.value) >= 19) setPeriod(0, { animate: false });
    playTimer = setInterval(() => {
      const i = Number(sliderEl.value);
      if (i >= 19) return stopPlay();
      setPeriod(i + 1);
    }, REDUCED_MOTION ? 1500 : 3500);
  });

  /* ---------- Map load ---------- */
  map.on("load", () => {
    clearTimeout(mapLoadTimer);
    // Globe + atmosphere (v5); harmless no-ops if unsupported.
    try { map.setProjection({ type: "globe" }); } catch { /* mercator fallback */ }
    try {
      map.setSky({
        "sky-color": "#0b1220",
        "horizon-color": "#1d2c4f",
        "fog-color": "#0b1220",
        "sky-horizon-blend": 0.6,
        "horizon-fog-blend": 0.5,
        "fog-ground-blend": 0.85,
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 1, 8, 0],
      });
    } catch { /* no sky support */ }

    // Tint the vector basemap toward the site's navy.
    try {
      map.setPaintProperty("background", "background-color", "#0b1220");
      map.setPaintProperty("water", "fill-color", "#0e1830");
    } catch { /* layer ids differ — keep style defaults */ }

    // Overlays that belong *under* the basemap's place labels.
    const firstSymbolId = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

    // 3D terrain (free AWS Terrarium DEM) + always-on subtle hillshade.
    map.addSource("dem", {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      // z14 rather than z12: the map now tilts into 3D at city zooms, where a
      // z12 DEM is too coarse to hold a hillside's shape under the buildings.
      maxzoom: 14,
      attribution: "Terrain: Mapzen/AWS",
    });
    map.addSource("dem-hills", {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 12,
    });
    map.addLayer(
      {
        id: "hills",
        type: "hillshade",
        source: "dem-hills",
        paint: {
          // Strong enough to read as mountains on a very dark basemap.
          "hillshade-exaggeration": 0.62,
          "hillshade-shadow-color": "#04070d",
          "hillshade-highlight-color": "#5b7099",
          "hillshade-accent-color": "#16233d",
        },
      },
      firstSymbolId
    );

    /* City massing. CARTO's own vector tiles carry the OpenMapTiles building
     * schema (render_height / render_min_height / hide_3d), so zooming into a
     * city stands its buildings up with no data of ours.
     *
     * These are NOT measured heights and the UI must never imply they are.
     * OpenMapTiles fills render_height from an OSM `height` tag where one
     * exists, from levels where it doesn't, and from a default where neither
     * does — and the three are indistinguishable once baked into the tile.
     * A tall tower really is tall here; a 5 m shop may just be untagged. */
    try {
      map.addLayer(
        {
          id: "massing",
          type: "fill-extrusion",
          source: "carto",
          "source-layer": "building",
          minzoom: 12.5,
          filter: ["!=", ["get", "hide_3d"], true],
          paint: {
            "fill-extrusion-color": "#22304e",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            // Comes up with the tilt rather than popping in at full strength.
            "fill-extrusion-opacity": ["interpolate", ["linear"], ["zoom"], 12.5, 0, 14.5, 0.85],
            "fill-extrusion-vertical-gradient": true,
          },
        },
        firstSymbolId
      );
      /* The basemap draws buildings twice — a flat fill plus an offset
       * "building-top" that fakes depth in 2D. Once the real extrusions come
       * up, that fake reads as a smear beside them, so fade it out on the same
       * curve the massing fades in on. */
      for (const id of ["building", "building-top"]) {
        if (map.getLayer(id)) {
          map.setPaintProperty(id, "fill-opacity", [
            "interpolate", ["linear"], ["zoom"], 12.5, 1, 14.5, 0,
          ]);
        }
      }
    } catch { /* style without a building layer — massing is optional */ }

    map.addSource("sites", { type: "geojson", data: sites });
    map.addSource("trail", { type: "geojson", data: trailGeojson() });

    if (KINGDOMS_READY) {
      map.addSource("states", { type: "geojson", data: statesGeo });
      map.addLayer(
        {
          id: "kingdom-fill",
          type: "fill",
          source: "states",
          paint: { "fill-color": "rgba(0,0,0,0)", "fill-opacity": 0, "fill-opacity-transition": { duration: 220 } },
        },
        firstSymbolId
      );
      map.addLayer(
        {
          id: "kingdom-outline",
          type: "line",
          source: "states",
          paint: { "line-color": "#0b1220", "line-width": 0.8, "line-opacity": 0, "line-opacity-transition": { duration: 220 } },
        },
        firstSymbolId
      );
      map.on("click", "kingdom-fill", (e) => {
        if (!kingdomsEnabled || activeTrail) return;
        const hits = map.queryRenderedFeatures(e.point, { layers: Object.keys(TYPE_META).map((t) => `sites-${t}`) });
        if (hits.length) return;
        const pol = politiesFor(currentPeriod()).find((p) => p.states?.includes(e.features[0].properties.st_nm));
        if (pol) showKingdomDetail(pol);
      });
      kingdomsChip.hidden = false;
      kingdomsChip.addEventListener("click", () => {
        kingdomsEnabled = !kingdomsEnabled;
        kingdomsChip.setAttribute("aria-pressed", String(kingdomsEnabled));
        applyKingdomState();
      });
    }

    map.addLayer({
      id: "trail-line",
      type: "line",
      source: "trail",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#f5b53f", "line-width": 2.5, "line-dasharray": [0.5, 2], "line-opacity": 0 },
    });

    for (const [type, meta] of Object.entries(TYPE_META)) {
      map.addLayer({
        id: `glow-${type}`,
        type: "circle",
        source: "sites",
        filter: ["==", ["get", "type"], type],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 10, 7, 16, 12, 22],
          "circle-color": meta.color,
          "circle-blur": 1.1,
          "circle-opacity": GLOW_OPACITY,
          "circle-opacity-transition": { duration: 220 },
        },
      });
      map.addLayer({
        id: `sites-${type}`,
        type: "circle",
        source: "sites",
        filter: ["==", ["get", "type"], type],
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 4.5, 7, 7.5, 12, 11],
          "circle-color": meta.color,
          "circle-stroke-color": "#f8fafc",
          "circle-stroke-width": 1.4,
          "circle-opacity": BASE_OPACITY,
          "circle-stroke-opacity": 1,
          "circle-opacity-transition": { duration: 220 },
          "circle-stroke-opacity-transition": { duration: 220 },
        },
      });

      map.on("click", `sites-${type}`, (e) => {
        if (!layerEnabled[type]) return;
        const f = e.features[0];
        showDetail(f.properties, f.geometry.coordinates);
      });
      map.on("mouseenter", `sites-${type}`, () => {
        if (layerEnabled[type]) map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", `sites-${type}`, () => (map.getCanvas().style.cursor = ""));
    }

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    for (const type of Object.keys(TYPE_META)) {
      map.on("mousemove", `sites-${type}`, (e) => {
        if (!layerEnabled[type]) return;
        popup.setLngLat(e.lngLat).setText(e.features[0].properties.name).addTo(map);
      });
      map.on("mouseleave", `sites-${type}`, () => popup.remove());
    }

    addGuideMarkers();

    renderRecords();

    // Deep-link restore.
    const h = parseHash();
    const pi = periods.findIndex((p) => p.id === h.p);
    if (pi >= 0) sliderEl.value = String(pi);
    applyMapState({ animate: false });
    applyUIState();
    renderTrailRow();
    if (h.trail && trails.some((t) => t.id === h.trail)) {
      setTrail(h.trail);
    } else if (h.site && siteById.has(h.site)) {
      openSite(h.site);
    } else if (h.dyn) {
      const pol = politiesFor(currentPeriod()).find((p) => p.name === h.dyn);
      if (pol) showKingdomDetail(pol);
    }

    splashCta.disabled = false;
    splashCta.textContent = "Explore the map";
    splashCta.focus();
  });

  /* ---------- 3D ----------
   * One path for both the button and the automatic engage-on-zoom below, so
   * the two can never disagree about what state the map is in.
   *
   * Terrain needs a mercator projection, which is why entering 3D drops the
   * globe and leaving it puts the globe back. */
  const terrainBtn = $("terrain-btn");
  let terrainOn = false;
  let userForced3D = false; // a deliberate press outranks the zoom rule, both ways

  /* 1.8 was tuned for Himalayan relief seen at z6. Held that high close in, a
   * 25 m coastal ridge turns into a mountain — the guide map uses 1.0 for
   * exactly that reason. Slide between the two as the camera comes down. */
  const exagForZoom = (z) => (z <= 6 ? 1.8 : z >= 13 ? 1 : 1.8 - ((z - 6) / 7) * 0.8);

  function set3D(on, { zoomFloor = false } = {}) {
    if (!map.getSource("dem") || on === terrainOn) return;
    terrainOn = on;
    terrainBtn.setAttribute("aria-pressed", String(on));
    if (on) {
      try { map.setProjection({ type: "mercator" }); } catch { /* keep current */ }
      try { map.setTerrain({ source: "dem", exaggeration: exagForZoom(map.getZoom()) }); } catch { /* unsupported */ }
      map.setPaintProperty("hills", "hillshade-exaggeration", 0.85);
      map.easeTo({
        pitch: 62,
        // Only the button lifts the camera to where relief reads; the zoom
        // rule must not tug at a zoom the reader is already driving.
        ...(zoomFloor ? { zoom: Math.max(map.getZoom(), 6) } : {}),
        duration: REDUCED_MOTION ? 0 : 900,
      });
    } else {
      try { map.setTerrain(null); } catch { /* noop */ }
      map.setPaintProperty("hills", "hillshade-exaggeration", 0.62);
      map.easeTo({ pitch: 0, duration: REDUCED_MOTION ? 0 : 700 });
      setTimeout(() => {
        // Guard: the reader may have gone back into 3D while this was pending.
        if (!terrainOn) { try { map.setProjection({ type: "globe" }); } catch { /* noop */ } }
      }, REDUCED_MOTION ? 0 : 720);
    }
  }

  terrainBtn.addEventListener("click", () => {
    userForced3D = true;
    set3D(!terrainOn, { zoomFloor: true });
  });

  /* ---------- Cited-height monuments ----------
   * The guide map's 3D monuments, on the national map: the same file, built by
   * scripts/fetch-site-data.js from a real OSM outline, a published height and
   * a published storey count. A monument with no cited height is not in here,
   * and that is the point — see content/mahabalipuram-heights.js.
   *
   * Lazy: a reader who never goes to Mahabalipuram never fetches it. */
  const MONUMENT_SETS = [
    { url: "data/mahabalipuram-footprints.geojson", bbox: [80.17, 12.592, 80.22, 12.67] },
  ];
  let monumentsLoaded = false;

  async function loadMonumentsIfNear() {
    if (monumentsLoaded || map.getZoom() < 14) return;
    const c = map.getCenter();
    const set = MONUMENT_SETS.find(
      (s) => c.lng >= s.bbox[0] && c.lng <= s.bbox[2] && c.lat >= s.bbox[1] && c.lat <= s.bbox[3]
    );
    if (!set) return;
    monumentsLoaded = true; // claim it before awaiting, so moveend can't double-fetch

    let fc = null;
    try { fc = await fetch(set.url).then((r) => (r.ok ? r.json() : null)); } catch { /* offline */ }
    if (!fc) {
      // A blip offline shouldn't cost the reader the monuments for the rest of
      // the visit — let the next pass over the site try again.
      monumentsLoaded = false;
      return;
    }
    if (map.getSource("footprints")) return;

    map.addSource("footprints", { type: "geojson", data: fc });
    map.addLayer({
      id: "monument-extrusion",
      type: "fill-extrusion",
      source: "footprints",
      paint: {
        "fill-extrusion-color": [
          "match", ["get", "form"],
          "monolith", "#c9ac7e",
          "structural", "#9a8d78",
          "boulder", "#b09b7d",
          "#96836a",
        ],
        // Metres above the terrain surface — the shader adds the elevation.
        "fill-extrusion-height": ["get", "top_m"],
        "fill-extrusion-base": ["get", "base_m"],
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": false,
      },
    });
    map.on("click", "monument-extrusion", (e) => showMassing(e.features[0].properties));
    map.on("mouseenter", "monument-extrusion", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "monument-extrusion", () => (map.getCanvas().style.cursor = ""));
  }
  map.on("moveend", loadMonumentsIfNear);

  /* Engage on the way in, drop it on the way out. The two thresholds are
   * deliberately apart so a map sitting on the line cannot flap between
   * states, and this runs on zoomend rather than zoom so it never fights the
   * gesture that is still in progress. */
  const ZOOM_3D_IN = 13.2;
  const ZOOM_3D_OUT = 12.8;
  const massingNote = $("massing-note");
  map.on("zoomend", () => {
    const z = map.getZoom();
    // The qualifier follows the massing it qualifies, in every motion mode.
    if (massingNote) massingNote.hidden = z < 12.5;
    if (REDUCED_MOTION) return; // reduced motion stays flat and button-only
    if (terrainOn) {
      try { map.setTerrain({ source: "dem", exaggeration: exagForZoom(z) }); } catch { /* noop */ }
    }
    if (userForced3D) return;
    if (!terrainOn && z >= ZOOM_3D_IN) set3D(true);
    else if (terrainOn && z <= ZOOM_3D_OUT) set3D(false);
  });

  let scrubTimer = null;
  sliderEl.addEventListener("input", () => {
    stopPlay();
    applyUIState();
    clearTimeout(scrubTimer);
    scrubTimer = setTimeout(() => applyMapState(), 90);
  });

  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      const type = chip.dataset.layer;
      layerEnabled[type] = !layerEnabled[type];
      chip.setAttribute("aria-pressed", String(layerEnabled[type]));
      if (map.getLayer(`sites-${type}`)) setLayerOpacity(type, layerEnabled[type]);
      applyUIState();
    })
  );

  document.getElementById("detail-close").addEventListener("click", () => {
    if (activeTrail) {
      setTrail("");
      return;
    }
    closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!searchResults.hidden) searchResults.hidden = true;
      else if (!detailPanel.hidden) document.getElementById("detail-close").click();
      else if (!browsePanel.hidden) browseBtn.click();
    }
  });
})();
