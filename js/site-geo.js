/* Geometry and drawing helpers shared by the two hand-drawn maps on the
 * destination page: the small map card (js/site-map-card.js) and the
 * illustrated site plan (js/site-plan.js).
 *
 * Both draw SVG from the OpenStreetMap extracts this site already ships —
 * no map library, no tile host, nothing new for the CSP — and both need the
 * same things: a Web-Mercator projection, a fit of some points into a box,
 * the sea / land / water / roads / areas as paths, and pins whose labels
 * never cover each other. Those live here, as pure functions on plain data;
 * the two callers own their DOM. The plan also zooms and pans, so the zoom
 * engine (`zoomable`) is here too, for the card to pick up later.
 *
 * Coordinates: `project()` gives pixels of a 256 px world at zoom 0. A "view"
 * (`fitView` / `zoomView`) scales that by k and shifts it, so every render is
 * only a multiply and a subtract per point. A zoom is NOT a CSS transform on
 * the drawing: it is a new view, and the drawing is redrawn crisp at it. The
 * CSS transform exists only while a finger or a wheel is moving.
 *
 * Classic script, deliberately: mahabalipuram.html loads no ES modules and the
 * CSP allows no inline script, so `window.SiteGeo` is the module.
 */
window.SiteGeo = (function () {
  /* Road classes, drawn widest first so junctions read cleanly. widths[0] is
   * the casing pass, widths[1] the fill; 0 means no pass. */
  const ROADS = [
    { cls: "major", widths: [5.5, 3.6], match: ["trunk", "primary", "primary_link", "secondary"] },
    { cls: "minor", widths: [3.6, 2.2], match: ["tertiary", "tertiary_link", "residential", "living_street", "pedestrian"] },
    { cls: "lane", widths: [0, 1.2], match: ["service", "track"] },
    { cls: "foot", widths: [0, 1], match: ["footway", "path", "steps"] },
  ];

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // Web Mercator, in pixels of a 256 px world at zoom 0.
  const project = ([lng, lat]) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return [256 * ((lng + 180) / 360), 256 * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI))];
  };
  // Back from a projected y to latitude, for the scale bar.
  const latOfY = (y) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 256))) * 180) / Math.PI;

  const kmBetween = ([lng1, lat1], [lng2, lat2]) => {
    const r = Math.PI / 180;
    const a =
      Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
      Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(a));
  };
  const compass = ([lng1, lat1], [lng2, lat2]) => {
    const deg = (Math.atan2((lng2 - lng1) * Math.cos((lat1 * Math.PI) / 180), lat2 - lat1) * 180) / Math.PI;
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((deg + 360) % 360) / 45) % 8];
  };

  const json = (url) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });
  const optional = (url) => json(url).catch(() => null);

  /* Project the extracts once, into typed layers.
   *   paths / coast / park   what the card and the plan both draw
   *   context                the 3D massing file (plan only): of it only tier 1
   *                          is real OSM geometry — the upper tiers are
   *                          generated insets for the 3D view
   *   plan                   data/mahabalipuram-plan.geojson (plan only):
   *                          water, landcover and the monuments' own outlines */
  function prepare({ paths, coast, park, context, plan }) {
    const roads = [];
    if (paths && paths.features) {
      for (const f of paths.features) {
        const hw = f.properties && f.properties.highway;
        const cls = ROADS.find((r) => r.match.includes(hw));
        if (cls && f.geometry && f.geometry.type === "LineString") roads.push({ cls, pts: f.geometry.coordinates.map(project) });
      }
    }
    const polyFeatures = (doc, keep) =>
      doc && doc.features
        ? doc.features.filter((f) => f.geometry && f.geometry.type === "Polygon" && (!keep || keep(f.properties || {})))
        : [];
    const rings = (f) => f.geometry.coordinates.map((r) => r.map(project));
    const polys = (doc, keep) => polyFeatures(doc, keep).map(rings);
    const areas = new Map();
    for (const f of polyFeatures(plan, (p) => p.kind === "monument" && p.monument)) areas.set(f.properties.monument, rings(f));
    return {
      roads,
      coastLines: coast && coast.features
        ? coast.features.filter((f) => f.geometry && f.geometry.type === "LineString").map((f) => f.geometry.coordinates.map(project))
        : [],
      parks: polys(park),
      rocks: polys(context, (p) => p.kind === "rock" && p.tier === 1),
      buildings: polys(context, (p) => p.kind === "building" && p.tier === 1),
      water: polys(plan, (p) => p.kind === "water"),
      land: polyFeatures(plan, (p) => p.kind === "land").map((f) => ({ cover: f.properties.cover, rings: rings(f) })),
      areas,
    };
  }

  /* A view: the closures every renderer needs, from a scale k and an offset. */
  function makeView({ w, h, k, left, top, latMid }) {
    const px = (p) => [p[0] * k - left, p[1] * k - top];
    const sx = (p) => (p[0] * k - left).toFixed(1);
    const sy = (p) => (p[1] * k - top).toFixed(1);
    const line = (arr) => "M" + arr.map((p) => `${sx(p)},${sy(p)}`).join("L");
    const ring = (arr) => line(arr) + "Z";
    // Whether any of a polyline's bounding box lies within `m` px of the frame.
    const onScreen = (arr, m = 10) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of arr) {
        const x = p[0] * k - left, y = p[1] * k - top;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return x1 > -m && x0 < w + m && y1 > -m && y0 < h + m;
    };
    // Pixel extent of a projected ring on screen.
    const extent = (arr) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of arr) {
        const x = p[0] * k - left, y = p[1] * k - top;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      return Math.max(x1 - x0, y1 - y0);
    };
    const metresPerPx = (40075016.686 * Math.cos((latMid * Math.PI) / 180)) / (256 * k);
    return { w, h, k, left, top, latMid, s: 1, px, toPx: (ll) => px(project(ll)), sx, sy, line, ring, onScreen, extent, metresPerPx };
  }

  /* Fit `fitPts` (projected) into w × h, leaving `padX` at the sides, `padT`
   * above and `padB` below (the bottom usually carries an attribution strip).
   * The zoom is clamped to [minZ, maxZ] so an empty or one-point fit cannot
   * run away. This is the s = 1 view; `zoomView` derives the others from it. */
  function fitView({ w, h, fitPts, padX = 40, padT = 30, padB = 30, minZ = 12, maxZ = 17.5 }) {
    const xs = fitPts.map((p) => p[0]);
    const ys = fitPts.map((p) => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const k = 2 ** clamp(
      Math.min(
        Math.log2((w - 2 * padX) / Math.max(maxX - minX, 1e-9)),
        Math.log2((h - padT - padB) / Math.max(maxY - minY, 1e-9))
      ),
      minZ,
      maxZ
    );
    const left = ((minX + maxX) / 2) * k - w / 2;
    const top = ((minY + maxY) / 2) * k - (padT - padB) / 2 - h / 2;
    const v = makeView({ w, h, k, left, top, latMid: latOfY((minY + maxY) / 2) });
    v.base = v;
    v.cx = (left + w / 2) / k;
    v.cy = (top + h / 2) / k;
    return v;
  }

  /* The view at zoom factor s over the fit v0, with the projected world point
   * (cx, cy) at the box centre — clamped so the zoomed box never looks
   * outside the s = 1 frame. */
  function zoomView(v0, s, cx, cy) {
    s = clamp(s, 1, 64);
    const k = v0.k * s;
    const halfW = v0.w / (2 * k), halfH = v0.h / (2 * k);
    const fl = v0.left / v0.k, ft = v0.top / v0.k;
    const c = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
    cx = c(cx, fl + halfW, fl + v0.w / v0.k - halfW);
    cy = c(cy, ft + halfH, ft + v0.h / v0.k - halfH);
    const v = makeView({ w: v0.w, h: v0.h, k, left: cx * k - v0.w / 2, top: cy * k - v0.h / 2, latMid: v0.latMid });
    v.s = s; v.cx = cx; v.cy = cy; v.base = v0;
    return v;
  }

  /* The basemap as SVG markup, bottom to top: sea, landcover, buildings, park
   * fill, granite outcrops, water, roads (casing then fill), park outline,
   * the monuments' own areas, the sea's name. Classes are `geo-*`; both
   * callers style them in css/place.css. `overscan` is how far outside the
   * box paths are still drawn (the plan draws a margin so a pan in progress
   * has something to show). */
  function basemapSvg(view, L, o = {}) {
    const { w, h, k, left, line, ring, extent } = view;
    const opts = Object.assign(
      { sea: true, parks: true, roads: true, rocks: false, buildings: false, water: false, land: false, areas: false, seaName: "Bay of Bengal", uid: "a", overscan: 10 },
      o
    );
    const onScreen = (arr) => view.onScreen(arr, opts.overscan);
    const polyD = (list) => list.filter((rings) => onScreen(rings[0]) && extent(rings[0]) >= 3).map((rings) => rings.map(ring).join("")).join("");
    let out = "";

    /* The sea. OSM draws coastline ways with the water on their RIGHT; here
     * that is east, so each line is closed round a point far to its right
     * (four frame widths past the edge) — valid while the line runs past the
     * top and bottom of the frame, which this 17 km extract does. */
    let sea = "";
    if (opts.sea) {
      sea = L.coastLines
        .map((arr) => {
          const a = arr[0], b = arr[arr.length - 1];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const len = Math.hypot(dx, dy) || 1;
          const off = (w * 4) / k;
          const nx = (-dy / len) * off, ny = (dx / len) * off; // right of travel in screen space (y down)
          return line(arr) + `L${view.sx([b[0] + nx, b[1] + ny])},${view.sy([b[0] + nx, b[1] + ny])}L${view.sx([a[0] + nx, a[1] + ny])},${view.sy([a[0] + nx, a[1] + ny])}Z`;
        })
        .join("");
      if (sea) out += `<path class="geo-sea" d="${sea}"/>`;
    }
    if (opts.land && L.land) {
      const byCover = new Map();
      for (const f of L.land) {
        if (!onScreen(f.rings[0]) || extent(f.rings[0]) < 3) continue;
        byCover.set(f.cover, (byCover.get(f.cover) || "") + f.rings.map(ring).join(""));
      }
      for (const [cover, d] of byCover) out += `<path class="geo-land geo-cover-${esc(cover)}" d="${d}"/>`;
    }
    if (opts.buildings) {
      const d = polyD(L.buildings);
      if (d) out += `<path class="geo-building" d="${d}"/>`;
    }
    const parkD = opts.parks ? L.parks.map((rings) => rings.map(ring).join("")).join("") : "";
    if (parkD) out += `<path class="geo-parkfill" d="${parkD}"/>`;
    if (opts.rocks) {
      const d = polyD(L.rocks); // rings under 3 px would only speckle the drawing
      if (d) {
        const id = `geo-hatch-${opts.uid}`;
        out +=
          `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="geo-hatch"/></pattern></defs>` +
          `<path class="geo-rock" d="${d}"/><path class="geo-rock-hatch" fill="url(#${id})" d="${d}"/>`;
      }
    }
    if (opts.water && L.water) {
      const d = polyD(L.water);
      if (d) out += `<path class="geo-water" d="${d}"/>`;
    }
    if (opts.roads) {
      for (const pass of [0, 1]) {
        for (const r of ROADS) {
          const width = r.widths[pass];
          if (!width) continue;
          const d = L.roads.filter((x) => x.cls === r && onScreen(x.pts)).map((x) => line(x.pts)).join("");
          if (d) out += `<path class="geo-road geo-${r.cls}${pass ? "" : " geo-casing"}" stroke-width="${width}" d="${d}"/>`;
        }
      }
    }
    if (parkD) out += `<path class="geo-parkline" d="${parkD}"/>`;
    if (opts.areas && L.areas) {
      let d = "";
      for (const rings of L.areas.values()) if (onScreen(rings[0])) d += rings.map(ring).join("");
      if (d) out += `<path class="geo-area" d="${d}"/>`;
    }
    if (sea && opts.seaName) {
      // Only where the frame's right edge is clearly water.
      const coastXs = L.coastLines.flat().map((p) => p[0] * k - left).filter((x) => x > -50 && x < w + 50);
      if (coastXs.length && Math.max(...coastXs) < w - 90) {
        out += `<text class="geo-sea-name" x="${(w - 14).toFixed(0)}" y="${(h * 0.52).toFixed(0)}" text-anchor="end">${esc(opts.seaName)}</text>`;
      }
    }
    return out;
  }

  /* Pins closer together than a pin is wide (Varaha Cave sits 55 m from the
   * Descent of the Ganges) would hide each other. Push such pins apart just
   * far enough, and out from under any `blocked` rectangle (an inset, a north
   * point). Each pin keeps its true spot in tx/ty, so the caller can mark it. */
  function nudgePins(pins, { min = 24, w, h, inset = 12, bottomReserve = 30, blocked = [] }) {
    const r = min / 2;
    for (let it = 0; it < 60; it++) {
      let moved = false;
      /* Out from under the furniture: to its nearest edge — or the next
       * nearest, when that way runs into the frame's edge, as it does for a
       * pin clamped into a corner the furniture also owns. */
      for (const p of pins) {
        for (const b of blocked) {
          if (p.x + r <= b.l || p.x - r >= b.r || p.y + r <= b.t || p.y - r >= b.b) continue;
          const ways = [
            { d: p.x + r - b.l, x: b.l - r - 0.1, y: p.y },
            { d: b.r - (p.x - r), x: b.r + r + 0.1, y: p.y },
            { d: p.y + r - b.t, x: p.x, y: b.t - r - 0.1 },
            { d: b.b - (p.y - r), x: p.x, y: b.b + r + 0.1 },
          ].sort((u, v) => u.d - v.d);
          const way = ways.find((o) => o.x >= inset && o.x <= w - inset && o.y >= inset && o.y <= h - bottomReserve) || ways[0];
          p.x = way.x;
          p.y = way.y;
          moved = true;
        }
      }
      for (let i = 0; i < pins.length; i++) {
        for (let j = i + 1; j < pins.length; j++) {
          const a = pins[i];
          const b = pins[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d = Math.hypot(dx, dy);
          if (d >= min) continue;
          if (d < 0.01) {
            dx = Math.cos(j);
            dy = Math.sin(j);
            d = 1;
          }
          const push = (min - d) / 2 + 0.1;
          a.x -= (dx / d) * push;
          a.y -= (dy / d) * push;
          b.x += (dx / d) * push;
          b.y += (dy / d) * push;
          moved = true;
        }
      }
      pins.forEach((p) => {
        p.x = clamp(p.x, inset, w - inset);
        p.y = clamp(p.y, inset, h - bottomReserve);
      });
      if (!moved) break;
    }
  }

  /* Every pin keeps its label. Each label first tries the four spots touching
   * its pin (right, left, above, below). Where the pins crowd it moves to the
   * nearest free spot in the box and a hairline leads back to its pin. Labels
   * never cover another label, a pin, a `blocked` rectangle (an inset, a scale
   * bar) or the bottom reserve. Only if the box has no free room at all does a
   * label overlap. Returns the leader/tick markup for the caller's SVG.
   *
   * pins: { x, y, tx, ty, n, el (a `pin` px box centred on x,y), label } */
  function layoutLabels(pins, { w, h, gap = 3, pin = 20, blocked = [], bottomReserve = 18 }) {
    if (!w || !h) return "";
    const r = pin / 2 + 2;
    const off = pin / 2 + 6;
    const dots = pins.map((p) => ({ l: p.x - r, t: p.y - r, r: p.x + r, b: p.y + r }));
    const kept = [];
    const hit = (a, b) => !(a.r + gap <= b.l || a.l >= b.r + gap || a.b + gap <= b.t || a.t >= b.b + gap);
    const ok = (c) =>
      c.l >= 2 && c.r <= w - 2 && c.t >= 2 && c.b <= h - bottomReserve &&
      !kept.some((q) => hit(c, q)) && !dots.some((q) => hit(c, q)) && !blocked.some((q) => hit(c, q));
    /* The most crowded pins choose first, while the spots touching them are
     * still free; pins with room around them can take whatever is left. */
    const crowd = (p) => pins.filter((q) => q !== p && Math.hypot(q.x - p.x, q.y - p.y) < 80).length;
    const order = [...pins].sort((a, b) => crowd(b) - crowd(a) || a.n - b.n);
    let leaders = "";
    for (const p of pins) {
      if (Math.hypot(p.x - p.tx, p.y - p.ty) > 2) {
        leaders += `<line class="geo-tick" x1="${p.tx.toFixed(1)}" y1="${p.ty.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}"/><circle class="geo-true" cx="${p.tx.toFixed(1)}" cy="${p.ty.toFixed(1)}" r="2.6"/>`;
      }
    }
    for (const p of order) {
      const lw = p.label.offsetWidth;
      const lh = p.label.offsetHeight;
      const at = (l, t) => ({ l, t, r: l + lw, b: t + lh });
      const touching = [
        at(p.x + off, p.y - lh / 2),
        at(p.x - off - lw, p.y - lh / 2),
        at(p.x - lw / 2, p.y - off - lh),
        at(p.x - lw / 2, p.y + off),
      ];
      let spot = touching.find(ok);
      let led = false;
      if (!spot) {
        let best = Infinity;
        for (let t = 2; t + lh <= h - bottomReserve; t += 4) {
          for (let l = 2; l + lw <= w - 2; l += 6) {
            const c = at(l, t);
            // Distance from the pin to the nearest point of the label.
            const dx = p.x - clamp(p.x, c.l, c.r);
            const dy = p.y - clamp(p.y, c.t, c.b);
            const d = dx * dx + dy * dy;
            if (d < best && ok(c)) {
              best = d;
              spot = c;
            }
          }
        }
        led = Boolean(spot);
        if (!spot) spot = touching[0];
      }
      kept.push(spot);
      // The label lives inside its pin's box, so place it relative to that.
      p.label.style.left = `${(spot.l - (p.x - pin / 2)).toFixed(1)}px`;
      p.label.style.top = `${(spot.t - (p.y - pin / 2)).toFixed(1)}px`;
      if (led) {
        const ex = clamp(p.x, spot.l, spot.r);
        const ey = clamp(p.y, spot.t, spot.b);
        leaders += `<line class="geo-lead" x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}"/><circle class="geo-lead-end" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="1.6"/>`;
      }
    }
    return leaders;
  }

  /* Metres from a projected point to the nearest edge of any of the projected
   * rings (0 inside — the rings are the ASI-protected areas, and the question
   * is only "how far outside"). One world pixel at zoom 0 is ~152.8 km at this
   * latitude; the scale error across a site is negligible. */
  function metresToRings(pt, rings) {
    const mPerPx = (40075016.686 * Math.cos((latOfY(pt[1]) * Math.PI) / 180)) / 256;
    let best = Infinity;
    for (const ring of rings) {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = clamp(((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
        best = Math.min(best, Math.hypot(pt[0] - a[0] - t * dx, pt[1] - a[1] - t * dy));
      }
      if (inside) return 0;
    }
    return best * mPerPx;
  }

  /* The longest round length that fits in maxPx at this view's scale. */
  function scaleBar(view, { maxPx = 140, steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000] } = {}) {
    let metres = steps[0];
    for (const s of steps) if (s / view.metresPerPx <= maxPx) metres = s;
    return { metres, px: metres / view.metresPerPx };
  }

  /* Zoom and pan for a box that is redrawn per view.
   *
   * The engine never draws. While a gesture is in progress it puts one CSS
   * transform on `worldEl` (translate + scale, relative to the last drawing)
   * and one custom property `--zs` on `mapEl` (so pins can counter-scale);
   * when the gesture ends it works out the view the transform amounts to,
   * clears the transform and calls `onEnd(s, cx, cy)` — the caller redraws
   * at that view and everything is crisp again. Absolute state therefore
   * lives in the caller's view (`getView()`), not here.
   *
   * Gestures: pinch (two pointers), drag (one pointer, only when zoomed in —
   * an unzoomed map must not steal a phone's page scroll), wheel with
   * ctrl/meta (a macOS trackpad pinch arrives that way; a plain wheel scrolls
   * the page and calls `onHint`), double-tap / dblclick, the +/−/0 keys when
   * the box has focus, and whatever buttons the caller wires to `zoomBy` and
   * `reset`. Pointer capture is taken late — on the first real movement or
   * the second pointer — so a plain tap on a pin still reaches the pin. */
  function zoomable(mapEl, worldEl, opts) {
    const { min = 1, max = 6, getView, onStart, onEnd, onHint } = opts;
    let t = null;        // the transient: { sr, dx, dy } — x' = sr * x + dx
    let frame = 0;
    let bakeTimer = 0;
    let lastMoveAt = 0;
    let started = false;
    const pts = new Map();   // pointerId → {x, y}
    let gesture = null;      // { p0:{x,y}, d0, s0, t0:{sr,dx,dy} }

    const box = () => mapEl.getBoundingClientRect();
    const local = (e) => { const b = box(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    const view = () => getView();
    const S = () => view().s || 1;

    /* Keep the box inside the s = 1 frame: with the current drawing at view v,
     * the frame's edges are at these drawing pixels. */
    function clampT(tr) {
      const v = view();
      const v0 = v.base || v;
      const fl = (v0.left * v.k) / v0.k - v.left, fr = fl + (v0.w * v.k) / v0.k;
      const ft = (v0.top * v.k) / v0.k - v.top, fb = ft + (v0.h * v.k) / v0.k;
      const sr = tr.sr;
      return {
        sr,
        dx: clamp(tr.dx, v.w - sr * fr, -sr * fl),
        dy: clamp(tr.dy, v.h - sr * fb, -sr * ft),
      };
    }
    function apply() {
      frame = 0;
      if (!t) return;
      worldEl.style.transform = `translate(${t.dx.toFixed(2)}px, ${t.dy.toFixed(2)}px) scale(${t.sr.toFixed(4)})`;
      mapEl.style.setProperty("--zs", t.sr.toFixed(4));
    }
    function setT(next) {
      t = clampT(next);
      if (!started) { started = true; worldEl.classList.add("is-moving"); if (onStart) onStart(); }
      if (!frame) frame = requestAnimationFrame(apply);
    }
    // Compose "scale by f about point c" onto the transient.
    function scaleAbout(f, c) {
      const cur = t || { sr: 1, dx: 0, dy: 0 };
      const sr = clamp(S() * cur.sr * f, min, max) / S();
      const g = sr / cur.sr;
      setT({ sr, dx: g * cur.dx + c.x * (1 - g), dy: g * cur.dy + c.y * (1 - g) });
    }
    function bake() {
      clearTimeout(bakeTimer);
      bakeTimer = 0;
      cancelAnimationFrame(frame);
      frame = 0;
      worldEl.style.transform = "";
      mapEl.style.removeProperty("--zs");
      worldEl.classList.remove("is-moving");
      started = false;
      if (!t) return;
      const v = view();
      const tr = t;
      t = null;
      const s = (v.s || 1) * tr.sr;
      // The drawing pixel at the box centre after the transform, back to a world point.
      const k = v.k * tr.sr;
      const left = tr.sr * v.left - tr.dx, top = tr.sr * v.top - tr.dy;
      onEnd(s, (left + v.w / 2) / k, (top + v.h / 2) / k);
      mapEl.style.touchAction = s > 1 ? "none" : "pan-y";
    }
    const bakeSoon = () => { clearTimeout(bakeTimer); bakeTimer = setTimeout(bake, 150); };

    /* ---------- pointers: pinch and drag ---------- */
    function startGesture() {
      const ps = [...pts.values()];
      if (!ps.length) { gesture = null; return; }
      const p0 = ps.length > 1 ? { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 } : { ...ps[0] };
      gesture = { p0, d0: ps.length > 1 ? Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y) : 0, t0: t || { sr: 1, dx: 0, dy: 0 }, moved: false };
    }
    mapEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        for (const id of pts.keys()) { try { mapEl.setPointerCapture(id); } catch (_) {} }
        if (t) bake(); // one finger was already panning: settle it, then pinch from here
      }
      startGesture();
    });
    mapEl.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId) || !gesture) return;
      pts.set(e.pointerId, local(e));
      const ps = [...pts.values()];
      if (ps.length >= 2) {
        const mid = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
        const d = Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y);
        const f = gesture.d0 ? d / gesture.d0 : 1;
        const sr = clamp(S() * gesture.t0.sr * f, min, max) / S();
        gesture.moved = true;
        lastMoveAt = performance.now();
        // The point that was under the pinch centre stays under it.
        setT({ sr, dx: mid.x - (sr / gesture.t0.sr) * (gesture.p0.x - gesture.t0.dx), dy: mid.y - (sr / gesture.t0.sr) * (gesture.p0.y - gesture.t0.dy) });
        return;
      }
      const p = ps[0];
      const dx = p.x - gesture.p0.x, dy = p.y - gesture.p0.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
      if (S() * (t ? t.sr : 1) <= 1.001) return; // not zoomed: leave the page's scroll alone
      if (!gesture.moved) { gesture.moved = true; try { mapEl.setPointerCapture(e.pointerId); } catch (_) {} }
      lastMoveAt = performance.now();
      setT({ sr: gesture.t0.sr, dx: gesture.t0.dx + dx, dy: gesture.t0.dy + dy });
    });
    const release = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      try { mapEl.releasePointerCapture(e.pointerId); } catch (_) {}
      if (pts.size === 0) { gesture = null; if (t) bake(); }
      else { if (t) bake(); startGesture(); } // a finger lifted mid-pinch: settle, carry on with the rest
    };
    mapEl.addEventListener("pointerup", release);
    mapEl.addEventListener("pointercancel", release);
    mapEl.addEventListener("lostpointercapture", release);
    // iOS Safari decides touch-action at touchstart; stop its page zoom during a pinch here.
    mapEl.addEventListener("touchmove", (e) => { if (e.touches.length >= 2) e.preventDefault(); }, { passive: false });
    for (const ev of ["gesturestart", "gesturechange"]) mapEl.addEventListener(ev, (e) => e.preventDefault());

    /* ---------- wheel, double-click, keys ---------- */
    mapEl.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) { if (onHint) onHint(); return; }
      e.preventDefault();
      const dy = clamp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? mapEl.clientHeight : 1), -60, 60);
      lastMoveAt = performance.now();
      scaleAbout(Math.exp(-dy * 0.01), local(e));
      bakeSoon();
    }, { passive: false });
    mapEl.addEventListener("dblclick", (e) => {
      if (e.target.closest("button, a")) return;
      e.preventDefault();
      scaleAbout(S() >= max ? 1 / S() : 2, local(e));
      bakeSoon();
    });
    mapEl.addEventListener("keydown", (e) => {
      if (e.target !== mapEl) return;
      const c = { x: mapEl.clientWidth / 2, y: mapEl.clientHeight / 2 };
      if (e.key === "+" || e.key === "=") { scaleAbout(1.5, c); bakeSoon(); }
      else if (e.key === "-" || e.key === "_") { scaleAbout(1 / 1.5, c); bakeSoon(); }
      else if (e.key === "0") { api.reset(); }
      else if (e.key.startsWith("Arrow") && S() > 1) {
        const cur = t || { sr: 1, dx: 0, dy: 0 };
        const step = 40;
        setT({ sr: cur.sr, dx: cur.dx + (e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0), dy: cur.dy + (e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0) });
        bakeSoon();
      } else return;
      e.preventDefault();
    });

    const api = {
      zoomBy(f, at) { scaleAbout(f, at || { x: mapEl.clientWidth / 2, y: mapEl.clientHeight / 2 }); bakeSoon(); },
      reset() { clearTimeout(bakeTimer); t = null; worldEl.style.transform = ""; mapEl.style.removeProperty("--zs"); worldEl.classList.remove("is-moving"); started = false; const v = view(); const v0 = v.base || v; onEnd(1, v0.cx, v0.cy); mapEl.style.touchAction = "pan-y"; },
      // True right after a gesture that moved: the click it left behind is not a tap.
      swallowClick() { return performance.now() - lastMoveAt < 350; },
      moving() { return Boolean(t); },
    };
    mapEl.style.touchAction = "pan-y";
    return api;
  }

  return { ROADS, esc, clamp, project, kmBetween, compass, json, optional, prepare, makeView, fitView, zoomView, basemapSvg, nudgePins, layoutLabels, metresToRings, scaleBar, zoomable };
})();
