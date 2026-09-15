/* The 3D page's bootstrap: the list first, the scene only if the device can
 * use it.
 *
 * WHY THIS FILE EXISTS. Before it, mahabalipuram-3d.html loaded js/scene-3d.js
 * directly — and scene-3d.js statically imports three.js, the loaders, the
 * post-processing chain and every scene module, then fetches nine data files
 * at module top level. All of that ran on a low-end phone that was only ever
 * going to show the HTML list: ~650 KB gzipped to decide to render nothing.
 * Now the list path costs the list — this file, pois.json and the stylesheet,
 * about 21 KB — and the scene graph is a dynamic import behind the tier probe.
 *
 * WHAT LIVES HERE. Only what the list needs and what the scene shares with it:
 * the DOM helpers, the list renderer, the status line, the WebGL check and the
 * tier probe. Everything about the scene stays in scene-3d.js, which imports
 * the helpers from here (that direction only — this file never statically
 * imports the scene).
 */

export const el = (id) => document.getElementById(id);
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const statusEl = el("s3-status");
export function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

/* Road directions, handed off to Google Maps.
 *
 * This site routes on the OSM footpath network, which is right for walking
 * between monuments on site and wrong for driving here from wherever you are —
 * that needs live traffic, the whole road network and your position. The link
 * carries a destination and nothing else; nothing about the visitor is sent.
 * `lngLat` is [lng, lat]; Maps wants lat,lng. */
export const directionsLink = (poi, cls) => {
  if (!poi.lngLat) return "";
  const [lng, lat] = poi.lngLat;
  return `<a class="${cls}" href="https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving" target="_blank" rel="noopener">Road directions on Google Maps →</a>`;
};

/* Never render a price. The dataset holds none, and a plausible-looking figure
 * is exactly the stale-price failure the brief warns against. */
export function ticketLine(p) {
  if (!p.ticket.ticketed) return "<b>Ticket:</b> none recorded for this monument";
  return "<b>Ticket:</b> ticketed by the ASI — price not verified here, so not shown. Check at the gate.";
}

/* ---------- The plain list: quality floor, and the no-WebGL fallback ---------- */
export function renderList(doc) {
  el("s3-list-intro").textContent =
    "Every monument in the scene, in full. This list works with the 3D view switched off, " +
    "and is what you get if your device cannot run WebGL.";

  el("s3-list-items").innerHTML = doc.pois
    .map((p) => {
      const hist = (p.history || []).map((h) => `<p>${esc(h)}</p>`).join("");
      const fac = p.facilities.length
        ? `<b>Nearby:</b> ${p.facilities.map((f) => `${esc(f.label)} (${f.metres} m)`).join(", ")}`
        : "<b>Nearby:</b> nothing recorded within 250 m";
      return `<li class="s3-item" id="item-${esc(p.id)}">
        <h3>${esc(p.name)}</h3>
        ${p.nameTamil ? `<p class="s3-tamil" lang="ta">${esc(p.nameTamil)}</p>` : ""}
        ${p.period ? `<span class="s3-when">${esc(p.period)}</span>` : ""}
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
        ${hist}
        <p class="s3-meta">${fac}</p>
        <p class="s3-meta">${ticketLine(p)}</p>
        <p>${directionsLink(p, "s3-directions")}</p>
      </li>`;
    })
    .join("");

  el("s3-prov").innerHTML =
    `${esc(doc.attribution)}. Descriptions are paraphrased from the cited sources on each entry. ` +
    `Ticket prices, opening times and Tamil names are not shown because no verified value for them ` +
    `exists in this dataset — they are omitted rather than guessed. Palms in the 3D scene are ` +
    `decorative: they mark ground OpenStreetMap records as vegetated, not individual trees.`;
}

/* ---------- Can this device use the scene? ---------- */
export function webglOK() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (_) {
    return false;
  }
}

/* Three tiers, probed without touching the GPU (a benchmark on load costs the
 * frames it is trying to save; the runtime watchdog in scene-3d.js handles
 * what a probe cannot see).
 *
 *   list  — no WebGL, or a device that would crawl: the HTML list only, and
 *           nothing else downloads. Unchanged from the old all-or-nothing gate.
 *   lite  — a phone, or a small or memory-light machine: no ambient occlusion,
 *           1024 px shadows, pixel ratio capped at 1.5, a slower water tick.
 *   full  — everything.
 *
 * `deviceMemory` and `hardwareConcurrency` are absent on Safari and Firefox;
 * absent means UNKNOWN, not low, so there the phone signal comes from
 * `pointer: coarse` and the viewport. `?tier=lite|full` overrides for testing,
 * and the chosen tier is written onto <body> as `tier-*`, the same convention
 * as the `no-ssao` / `no-tiltshift` escape hatches. */
export function probeTier() {
  const forced = new URLSearchParams(location.search).get("tier");
  if (forced === "list" || forced === "lite" || forced === "full") return forced;
  if (!webglOK()) return "list";
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const saveData = navigator.connection && navigator.connection.saveData;
  if ((typeof mem === "number" && mem <= 2) || (typeof cores === "number" && cores <= 2)) return "list";
  if ((typeof mem === "number" && mem <= 4) || (typeof cores === "number" && cores <= 4) || coarse || innerWidth < 720 || saveData) return "lite";
  return "full";
}

/* ---------- Boot ---------- */
fetch("data/pois.json")
  .then((r) => {
    if (!r.ok) throw new Error(`pois.json: HTTP ${r.status}`);
    return r.json();
  })
  .then((doc) => {
    renderList(doc);
    /* A `poi=<id>` link on a device that only gets the list still lands on
     * that monument's entry; with the scene running, scene-3d.js opens its
     * panel instead. */
    const want = (/(?:^|[#&])poi=([^&]+)/.exec(location.hash) || [])[1];
    const item = want && el(`item-${decodeURIComponent(want)}`);
    if (item && probeTier() === "list") item.scrollIntoView({ block: "start" });
    el("s3-list-toggle").addEventListener("click", (e) => {
      const b = e.currentTarget;
      b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"));
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el("s3-list").scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });

    const tier = probeTier();
    document.body.classList.add(`tier-${tier}`);
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.log(`[3d] tier ${tier}`, {
        mem: navigator.deviceMemory, cores: navigator.hardwareConcurrency,
        coarse: matchMedia("(pointer: coarse)").matches, w: innerWidth,
      });
    }
    if (tier === "list") {
      setStatus(
        webglOK()
          ? "This device looks low-powered, so the 3D scene is off to keep the page usable. The full list is below."
          : "Your browser cannot run WebGL, so the 3D scene is off. The full list is below."
      );
      return;
    }
    /* Everything heavy lives behind this import: three.js, the loaders, the
     * scene modules, and inside scene-3d.js the optional data fetches.
     *
     * The big modules are preloaded HERE, not with <link rel="modulepreload">
     * in the HTML — a static preload fetches on the list tier too, which is
     * the 650 KB this file exists to avoid. Injected links fire in parallel
     * with the import, so the four are discovered at once instead of one
     * import statement at a time. */
    for (const href of [
      "assets/vendor/three.module.js",
      "assets/vendor/three-gltfloader.js",
      "assets/vendor/three-orbitcontrols.js",
      "assets/vendor/meshopt_decoder.module.js",
    ]) {
      const l = document.createElement("link");
      l.rel = "modulepreload";
      l.href = href;
      document.head.appendChild(l);
    }
    return import("./scene-3d.js").then((m) => m.boot({ doc, tier }));
  })
  .catch((err) => {
    console.error("[3d]", err);
    setStatus(`The scene could not load (${err.message}).`);
    el("s3-list-intro").textContent = "The monument data could not load. The full guide is still available.";
  });
