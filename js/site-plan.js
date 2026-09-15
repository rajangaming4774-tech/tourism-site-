/* The site, laid out: an illustrated plan of Mahabalipuram from above, the
 * way a visitor board at a park shows it — the sea and the beach, the tanks
 * and ponds, the roads, the granite outcrops the monuments are cut from, the
 * monuments' own outlines where OpenStreetMap has them, every monument as a
 * small picture of its kind with its name always showing, and the guide's
 * walking route threaded through. It zooms and pans. Tapping a picture
 * opens a small card: what the place is in two lines, its photograph, how
 * far it is on foot from the previous stop, and the way into the site map
 * and the 3D view.
 *
 * WHAT IS REAL AND WHAT IS A PICTURE. The areas — sea, beach, water, grass
 * and scrub, the outcrops, the roads, the protected areas and the 13
 * monument outlines — are OpenStreetMap geometry exactly as mapped
 * (data/mahabalipuram-plan.geojson and the other extracts). The PICTURES
 * are not: each shows the KIND of monument (a stepped pyramid roof, a wagon
 * vault, a cave mouth, a boulder, a walled compound with two towers…), drawn
 * the same for every monument of that kind, not to scale, and not turned to
 * the real building. Which picture a monument gets comes from its `form`,
 * its documented `roof` where the repo has one, or an explicit `picture` in
 * content/mahabalipuram-monuments.js — every one with a source comment. The
 * legend says all this in as many words. Nothing on this plan is a survey.
 *
 * THE INSET draws the five rathas to their real outlines at about 5 px per
 * metre, their roofs in plan by the convention for each documented type.
 *
 * WALKING TIMES. From data/mahabalipuram-routes.geojson, the footpath legs
 * scripts/fetch-site-data.js routed over the real OSM network for the guide's
 * "Everything" order, at an assumed 4 km/h that is printed wherever it is
 * used. OpenStreetMap maps no ticket gate here, so no time "from the
 * entrance" is given, and the first stop says why. Two monuments are off the
 * route (Tiger Cave is reached by auto-rickshaw; Mukunda Nayanar is not on
 * it); for them a straight-line distance is given and labelled as such.
 *
 * ZOOM. A zoom is a new view and a fresh, crisp drawing (js/site-geo.js
 * `zoomView`); the CSS transform exists only while a finger or a wheel is
 * moving. Pins that fall outside the box at a zoom are hidden, never dragged
 * to the edge as if they stood there.
 *
 * The drawing helpers and the zoom engine are in js/site-geo.js, shared with
 * the map card. This file owns the section's DOM, the popover and the wording.
 *
 * Usage: SitePlan.mount(slotEl, { monuments, routes, guideHref, threeDHref });
 */
window.SitePlan = (function () {
  const G = window.SiteGeo;
  const esc = G.esc;
  /* What the plan shows is the protected site: a monument more than this far
   * outside every ASI-protected area (data/mahabalipuram-park.geojson) is
   * an edge pin with its straight-line distance, not squeezed in. Today that
   * is Tiger Cave (4.8 km) and Mukunda Nayanar (~0.8 km north of the hill). */
  const FAR_M = 400;
  const WALK_KMH = 4;      // assumed, and printed wherever it is used
  const ROUTE_ID = "everything";
  const SHEET_MQ = "(max-width: 639px), (pointer: coarse)";
  const PIN = 24;          // the picture's box, px
  const IPIN = 20;         // an inset pin's box, px

  /* The pictures live in js/monument-pictures.js, shared with the guide's
   * map pins so both pages draw the same thing for the same monument. */
  const MP = window.MonumentPictures;
  const PIC_LABEL = MP.LABEL;
  const pictureOf = MP.pictureOf;
  const pic = MP.svg;
  const num = (n) => String(n).padStart(2, "0");

  function mount(slot, opts) {
    const { monuments, routes = [], guideHref = "mahabalipuram-guide.html", threeDHref = "mahabalipuram-3d.html" } = opts || {};
    if (!slot || !monuments || !monuments.length) return;
    slot.innerHTML = `<div class="spl is-loading"><div class="spl-map"><p class="spl-wait">Drawing the plan…</p></div></div>`;

    const start = () =>
      Promise.all([
        G.json("data/mahabalipuram-osm.json"),
        G.optional("data/mahabalipuram-paths.geojson"),
        G.optional("data/mamallapuram-coastline.geojson"),
        G.optional("data/mahabalipuram-park.geojson"),
        G.optional("data/mahabalipuram-context.geojson"),
        G.optional("data/mahabalipuram-plan.geojson"),
        G.optional("data/mahabalipuram-footprints.geojson"),
        G.optional("data/mahabalipuram-routes.geojson"),
        G.optional("data/pois.json"),
      ])
        .then(([osm, paths, coast, park, context, plan, footprints, routeGeo, pois]) =>
          build({ osm, layers: G.prepare({ paths, coast, park, context, plan }), plan, footprints, routeGeo, pois })
        )
        .catch((err) => {
          console.warn("[site-plan]", err && err.message);
          slot.innerHTML = `<p class="spl-fallback">The site plan could not load. <a href="${esc(guideHref)}">Open the site map →</a></p>`;
        });

    // Half a megabyte of extracts: fetch when the section is near, not on page load.
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            start();
          }
        },
        { rootMargin: "600px" }
      );
      io.observe(slot);
    } else start();

    function build({ osm, layers, plan, footprints, routeGeo, pois }) {
      const byOsm = new Map(osm.monuments.map((m) => [m.id, m]));
      const byId = new Map(monuments.map((m) => [m.id, m]));
      const recs = monuments
        .map((m, i) => ({ m, n: i + 1, o: byOsm.get(m.osm) }))
        .filter((r) => r.o && Array.isArray(r.o.lngLat))
        .map((r) => ({ m: r.m, id: r.m.id, n: r.n, title: r.m.title, picture: pictureOf(r.m), lngLat: r.o.lngLat, pt: G.project(r.o.lngLat) }));
      if (!recs.length) throw new Error("no monument has an OSM position");
      const titleOf = (id) => (byId.get(id) || {}).title || id;

      // The group's middle, by median so one outlier cannot drag it.
      const med = (k) => {
        const v = recs.map((p) => p.lngLat[k]).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      const middle = [med(0), med(1)];
      const parkRings = layers.parks.map((rings) => rings[0]);
      recs.forEach((p) => {
        const outside = parkRings.length ? G.metresToRings(p.pt, parkRings) : G.kmBetween(middle, p.lngLat) * 1000;
        p.far = outside > FAR_M ? { km: G.kmBetween(middle, p.lngLat), dir: G.compass(middle, p.lngLat) } : null;
      });

      /* The five rathas share a 41 m plinth: on the main plan they are stop
       * 02, and each has its own mark in the inset. */
      let insetIds = new Set(monuments.filter((m) => m.partOf === "pancha-rathas").map((m) => m.id));
      if (!insetIds.size) insetIds = new Set(["dharmaraja-ratha", "bhima-ratha", "arjuna-ratha", "draupadi-ratha", "nakula-sahadeva-ratha"]);
      const mainRecs = recs.filter((p) => !insetIds.has(p.id));
      const insetRecs = recs.filter((p) => insetIds.has(p.id));
      const core = mainRecs.filter((p) => !p.far);

      // Outlines with a documented roof, by OSM id: tier rings, projected.
      const outlines = new Map();
      if (footprints && footprints.features) {
        for (const f of footprints.features) {
          const p = f.properties || {};
          if (!f.geometry || f.geometry.type !== "Polygon" || !p.id) continue;
          if (!outlines.has(p.id)) outlines.set(p.id, { roof: p.roof, name: p.name, tiers: [] });
          outlines.get(p.id).tiers.push({ tier: p.tier || 1, ring: f.geometry.coordinates[0].map(G.project) });
        }
        for (const o of outlines.values()) o.tiers.sort((a, b) => a.tier - b.tier);
      }
      const outlineFor = (rec) => outlines.get(rec.m.osm) || null;

      // The walking route: legs, and minutes into each stop from the one before.
      const route = routes.find((r) => r.id === ROUTE_ID) || routes[0] || { stops: [] };
      const stopOf = new Map(route.stops.map((s) => [s.monument, s]));
      const firstStop = route.stops.length ? route.stops[0].monument : null;
      const legs = routeGeo && routeGeo.features
        ? routeGeo.features.filter((f) => f.properties && f.properties.route === route.id && f.geometry && f.geometry.type === "LineString")
        : [];
      const walk = new Map();
      for (const f of legs) {
        const c = f.geometry.coordinates;
        let km = 0;
        for (let i = 1; i < c.length; i++) km += G.kmBetween(c[i - 1], c[i]);
        walk.set(f.properties.to, { from: f.properties.from, km, gap: Boolean(f.properties.gap), pts: c.map(G.project) });
      }
      const poiIds = new Set(pois && pois.pois ? pois.pois.map((p) => p.id) : []);
      const planCounts = (plan && plan.counts) || null;

      /* ---------- DOM ---------- */
      const stopsOnFoot = route.stops.filter((s) => s.travel !== "auto").length;
      const usedPics = [...new Set(recs.map((p) => p.picture))].filter((k) => PIC_LABEL[k]);
      const pinHtml = (p, cls) =>
        `<li><button type="button" class="${cls}${p.far ? " is-far" : ""}" data-id="${esc(p.id)}" aria-expanded="false" aria-controls="spl-pop"
            aria-label="${num(p.n)}, ${esc(p.title)}${p.far ? `, ${p.far.km.toFixed(1)} km ${p.far.dir} in a straight line` : ""}">${
            cls === "spl-pin"
              ? `${pic(p.picture)}<span class="spl-badge">${num(p.n)}</span><span class="spl-label"><b>${num(p.n)}</b> ${esc(p.title)}${p.far ? ` · ${p.far.km.toFixed(1)} km ${p.far.dir}` : ""}</span>`
              : `<span class="spl-dot">${num(p.n)}</span>`
          }</button></li>`;
      const landKinds = planCounts ? Object.entries(planCounts.land || {}).filter(([, n]) => n > 0).map(([c]) => c) : [];
      const legendLand = landKinds.length ? landKinds.map((c) => c.replace("_", " ")).join(", ") : "none mapped";
      slot.innerHTML = `
        <div class="spl">
          <div class="spl-map" tabindex="0" aria-label="Plan of the site. Zoom with plus and minus, or pinch; move with the arrow keys or a drag.">
            <div class="spl-world">
              <svg class="spl-base" aria-hidden="true"></svg>
              <svg class="spl-leaders" aria-hidden="true"></svg>
              <ol class="spl-pins">${mainRecs.map((p) => pinHtml(p, "spl-pin")).join("")}</ol>
            </div>
            <div class="spl-ctl" role="group" aria-label="Zoom">
              <button type="button" data-z="in" aria-label="Zoom in">+</button>
              <button type="button" data-z="out" aria-label="Zoom out">−</button>
              <button type="button" data-z="reset" aria-label="Show the whole site">⟲</button>
            </div>
            <div class="spl-hint" hidden>Ctrl + scroll to zoom · pinch on a phone</div>
            <div class="spl-inset" aria-label="Inset: the five rathas, to shape">
              <div class="spl-inset-head">The five rathas <small>to shape</small></div>
              <div class="spl-inset-box">
                <svg class="spl-inset-svg" aria-hidden="true"></svg>
                <ol class="spl-inset-pins">${insetRecs.map((p) => pinHtml(p, "spl-ipin")).join("")}</ol>
              </div>
              <p class="spl-inset-cap">${insetRecs
                .map((p) => `<b>${num(p.n)}</b> ${esc(p.title.replace(/ Ratha$/, ""))}${outlineFor(p) ? "" : " <i>(position only)</i>"}`)
                .join(" · ")}</p>
            </div>
            <div class="spl-north" aria-hidden="true"><svg viewBox="0 0 20 28"><path d="M10 2 4 22l6-4 6 4z"/><path d="M10 2v16"/></svg><span>N</span></div>
            <div class="spl-scale" aria-hidden="true"><i></i><span></span></div>
            <span class="spl-attr">© OpenStreetMap contributors</span>
            <div id="spl-pop" class="spl-pop" role="dialog" aria-labelledby="spl-pop-title" hidden>
              <button type="button" class="spl-pop-close" aria-label="Close">×</button>
              <figure class="spl-pop-photo" hidden></figure>
              <p class="spl-pop-meta"><span class="spl-pop-num"></span><span class="spl-pop-when"></span></p>
              <h3 id="spl-pop-title"></h3>
              <p class="spl-pop-text"></p>
              <p class="spl-pop-walk"></p>
              <p class="spl-pop-acts"></p>
            </div>
          </div>
          <div class="spl-side">
            <ol class="spl-list" aria-label="The monuments, in the order of the cards">${recs
              .map((p) => `<li><button type="button" class="spl-item" data-id="${esc(p.id)}" aria-controls="spl-pop">${pic(p.picture, "spl-pic spl-pic-s")}<b>${num(p.n)}</b> <span>${esc(p.title)}</span></button></li>`)
              .join("")}</ol>
          </div>
          <div class="spl-legend">
            <ul class="spl-key">
              ${usedPics.map((k) => `<li>${pic(k, "spl-pic spl-pic-s")} ${esc(PIC_LABEL[k])}</li>`).join("")}
              <li><svg class="spl-pic spl-pic-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3z" class="k-area"/></svg> Monument area, as OpenStreetMap maps it (${layers.areas.size} of ${recs.length})</li>
              <li><svg class="spl-pic spl-pic-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16 10 8l5 6 6-8" class="k-route"/></svg> Walking route — the guide's “${esc(route.label || route.id)}” order, ${stopsOnFoot} stops on foot</li>
              <li><svg class="spl-pic spl-pic-s" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18 8 6h9l4 12z" class="k-rock"/></svg> Granite outcrop</li>
              <li><svg class="spl-pic spl-pic-s" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" class="k-water"/></svg> Water — sea, tanks and ponds${planCounts ? ` (${planCounts.water} mapped)` : ""}</li>
              <li><svg class="spl-pic spl-pic-s" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" class="k-land"/></svg> Grass, park, scrub, beach — as mapped (${esc(legendLand)})</li>
              <li><svg class="spl-pic spl-pic-s" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" class="k-park"/></svg> Protected area</li>
            </ul>
            <p class="spl-note">
              The pictures show the kind of monument, not the monument itself: the same drawing for every cave temple,
              every stepped-roof ratha, and so on, not to scale and not turned to the real building. Where an outline is
              drawn, that is the area OpenStreetMap maps; a monument with no outline is a single point in OpenStreetMap.
              The five rathas' roofs in the inset follow the documented roof type and are drafting convention. Water and
              landcover are drawn only where OpenStreetMap has them. Walking times are along OpenStreetMap footpaths at
              ${WALK_KMH} km/h; time inside each monument is not included, and no ticket gate is mapped, so none is given
              from the entrance. Nothing here is a survey. Positions © OpenStreetMap contributors.
            </p>
          </div>
        </div>`;

      const root = slot.querySelector(".spl");
      const mapEl = slot.querySelector(".spl-map");
      const worldEl = slot.querySelector(".spl-world");
      const baseEl = slot.querySelector(".spl-base");
      const leadersEl = slot.querySelector(".spl-leaders");
      const insetEl = slot.querySelector(".spl-inset");
      const insetBox = slot.querySelector(".spl-inset-box");
      const insetSvg = slot.querySelector(".spl-inset-svg");
      const northEl = slot.querySelector(".spl-north");
      const scaleEl = slot.querySelector(".spl-scale");
      const ctlEl = slot.querySelector(".spl-ctl");
      const hintEl = slot.querySelector(".spl-hint");
      const pinEls = [...slot.querySelectorAll(".spl-pin")].map((el, i) => ({ ...mainRecs[i], el, label: el.querySelector(".spl-label") }));
      const ipinEls = [...slot.querySelectorAll(".spl-ipin")].map((el, i) => ({ ...insetRecs[i], el }));
      const allPins = [...pinEls, ...ipinEls];
      const pinById = new Map(allPins.map((p) => [p.id, p]));

      /* On a phone the map is too small to lend a corner to the inset, so it
       * moves out to sit under the map as its own box; on anything wider it
       * lives in the map's bottom-left. Moved in the DOM, so the label layout
       * only has to avoid it when it is actually on the map. */
      const SMALL_MQ = window.matchMedia("(max-width: 639px)");
      const insetHome = insetEl.nextElementSibling; // the north point
      function placeInset() {
        const out = SMALL_MQ.matches;
        insetEl.classList.toggle("is-out", out);
        if (out && insetEl.parentNode === mapEl) mapEl.parentNode.insertBefore(insetEl, mapEl.nextSibling);
        if (!out && insetEl.parentNode !== mapEl) mapEl.insertBefore(insetEl, insetHome);
      }
      placeInset();
      SMALL_MQ.addEventListener("change", () => { placeInset(); lastW = 0; fit(); });

      /* ---------- Roof-plan lines for the documented outlines ---------- */
      const orientedBox = (ring) => {
        let best = 0, ang = 0;
        for (let i = 1; i < ring.length; i++) {
          const dx = ring[i][0] - ring[i - 1][0], dy = ring[i][1] - ring[i - 1][1];
          const l = dx * dx + dy * dy;
          if (l > best) { best = l; ang = Math.atan2(dy, dx); }
        }
        const c = Math.cos(-ang), s = Math.sin(-ang);
        const rot = ring.map(([x, y]) => [x * c - y * s, x * s + y * c]);
        const xs = rot.map((p) => p[0]), ys = rot.map((p) => p[1]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const un = ([x, y]) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
        return [un([x0, y0]), un([x1, y0]), un([x1, y1]), un([x0, y1])];
      };
      const roofLines = (o, view) => {
        const base = o.tiers[0].ring;
        let d = "";
        if (o.roof === "pyramidal") {
          for (const t of o.tiers.slice(1)) d += view.ring(t.ring);
        } else if (o.roof === "barrel") {
          // The ridge joins the midpoints of the two short sides.
          const pts = base[0][0] === base[base.length - 1][0] && base[0][1] === base[base.length - 1][1] ? base.slice(0, -1) : base;
          const box = pts.length === 4 ? pts : orientedBox(base);
          const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
          const e = [0, 1, 2, 3].map((i) => [box[i], box[(i + 1) % 4]]);
          const pair = len(...e[0]) + len(...e[2]) < len(...e[1]) + len(...e[3]) ? [e[0], e[2]] : [e[1], e[3]];
          const mid = ([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          d += view.line([mid(pair[0]), mid(pair[1])]);
        } else if (o.roof === "hut") {
          const b = orientedBox(base);
          d += view.line([b[0], b[2]]) + view.line([b[1], b[3]]);
        }
        return d;
      };

      /* ---------- Render: fit on a size change, draw on every view ---------- */
      let lastW = 0, lastH = 0;
      let v0 = null;                      // the s = 1 fit
      let view = null;                    // what is drawn now
      let zoomState = { s: 1, cx: null, cy: null };
      function fit() {
        const w = mapEl.clientWidth, h = mapEl.clientHeight;
        if (!w || !h || (w === lastW && h === lastH)) return;
        lastW = w; lastH = h;
        v0 = G.fitView({ w, h, fitPts: core.map((p) => p.pt), padX: 48, padT: 44, padB: 40 });
        renderInset();
        draw();
      }
      function draw() {
        if (!v0) return;
        const { w, h } = v0;
        view = zoomState.s > 1 ? G.zoomView(v0, zoomState.s, zoomState.cx, zoomState.cy) : v0;
        zoomState = { s: view.s, cx: view.cx, cy: view.cy };
        mapEl.classList.toggle("is-zoomed", view.s > 1.001);
        ctlEl.querySelector('[data-z="out"]').disabled = view.s <= 1.001;
        ctlEl.querySelector('[data-z="reset"]').disabled = view.s <= 1.001;
        ctlEl.querySelector('[data-z="in"]').disabled = view.s >= 5.999;

        // The base is drawn with a margin all round, so a pan in progress has something to show.
        const over = Math.max(w, h) / 2;
        let base = G.basemapSvg(view, layers, {
          rocks: true, water: true, land: true, areas: true,
          buildings: w >= 560 || view.metresPerPx < 1.5,
          uid: "plan", overscan: over,
        });
        for (const leg of walk.values()) base += `<path class="geo-route${leg.gap ? " is-gap" : ""}" d="${view.line(leg.pts)}"/>`;
        baseEl.setAttribute("viewBox", `${-over} ${-over} ${w + 2 * over} ${h + 2 * over}`);
        baseEl.style.left = `${-over}px`; baseEl.style.top = `${-over}px`;
        baseEl.style.width = `${w + 2 * over}px`; baseEl.style.height = `${h + 2 * over}px`;
        baseEl.innerHTML = base;

        const sb = G.scaleBar(view, { maxPx: Math.min(160, w * 0.3) });
        scaleEl.querySelector("i").style.width = `${sb.px.toFixed(0)}px`;
        scaleEl.querySelector("span").textContent = sb.metres >= 1000 ? `${sb.metres / 1000} km` : `${sb.metres} m`;

        const inset = 16;
        const shown = [];
        pinEls.forEach((p) => {
          let [x, y] = view.px(p.pt);
          if (p.far) { x = G.clamp(x, inset, w - inset); y = G.clamp(y, inset, h - inset - 14); }
          p.tx = p.x = x; p.ty = p.y = y;
          // Outside the box (with the pan margin) at this zoom: hidden, never dragged to the edge.
          const vis = x > -over && x < w + over && y > -over && y < h + over;
          p.el.hidden = !vis;
          p.el.classList.toggle("is-offscreen", !(x >= 0 && x <= w && y >= 0 && y <= h));
          if (vis) shown.push(p);
        });
        const inBox = shown.filter((p) => !p.el.classList.contains("is-offscreen"));
        G.nudgePins(inBox, { w, h, min: PIN + 6, inset, bottomReserve: 32, blocked: furniture() });
        shown.forEach((p) => { p.el.style.left = `${p.x.toFixed(1)}px`; p.el.style.top = `${p.y.toFixed(1)}px`; });
        layoutLabels(inBox);
        if (openId && (!pinById.get(openId) || pinById.get(openId).el.hidden)) close();
        else if (openId && !pop.hidden) place(pinById.get(openId));
      }

      function renderInset() {
        const w = insetBox.clientWidth, h = insetBox.clientHeight;
        if (!w || !h) return;
        const fitPts = [];
        for (const p of insetRecs) { fitPts.push(p.pt); const o = outlineFor(p); if (o) fitPts.push(...o.tiers[0].ring); }
        const v = G.fitView({ w, h, fitPts, padX: 18, padT: 18, padB: 26, minZ: 12, maxZ: 22 });
        let d = "";
        for (const p of insetRecs) {
          const o = outlineFor(p);
          if (!o) continue;
          d += `<path class="geo-outline" d="${v.ring(o.tiers[0].ring)}"/>`;
          const r = roofLines(o, v);
          if (r) d += `<path class="geo-roof" d="${r}"/>`;
        }
        const sb = G.scaleBar(v, { maxPx: w * 0.4, steps: [5, 10, 20, 25, 50] });
        d += `<g class="geo-iscale"><line x1="8" y1="${h - 9}" x2="${(8 + sb.px).toFixed(1)}" y2="${h - 9}"/><text x="${(10 + sb.px).toFixed(1)}" y="${h - 6}">${sb.metres} m</text></g>`;
        insetSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        insetSvg.innerHTML = d;
        ipinEls.forEach((p) => {
          const [x, y] = v.px(p.pt);
          p.tx = p.x = x; p.ty = p.y = y;
        });
        G.nudgePins(ipinEls, { w, h, min: IPIN + 2, inset: 11, bottomReserve: 22 });
        ipinEls.forEach((p) => { p.el.style.left = `${p.x.toFixed(1)}px`; p.el.style.top = `${p.y.toFixed(1)}px`; });
      }

      // The furniture, in the map's own pixels: pins and labels keep clear of it.
      function furniture() {
        const box = mapEl.getBoundingClientRect();
        return [insetEl, northEl, scaleEl, ctlEl].filter((el) => el.parentNode === mapEl).map((el) => {
          const r = el.getBoundingClientRect();
          return { l: r.left - box.left, t: r.top - box.top, r: r.right - box.left, b: r.bottom - box.top };
        });
      }
      function layoutLabels(list) {
        if (!lastW || !lastH) return;
        leadersEl.setAttribute("viewBox", `0 0 ${lastW} ${lastH}`);
        leadersEl.innerHTML = G.layoutLabels(list || pinEls.filter((p) => !p.el.hidden && !p.el.classList.contains("is-offscreen")), {
          w: lastW, h: lastH, pin: PIN, blocked: furniture(), bottomReserve: 20,
        });
        markActive();
      }

      /* ---------- Zoom ---------- */
      let hintTimer = 0;
      const zoom = G.zoomable(mapEl, worldEl, {
        min: 1, max: 6,
        getView: () => view,
        onStart: () => close(),
        onEnd: (s, cx, cy) => { zoomState = { s, cx, cy }; draw(); },
        onHint: () => {
          hintEl.hidden = false;
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => { hintEl.hidden = true; }, 1500);
        },
      });
      ctlEl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-z]");
        if (!b) return;
        if (b.dataset.z === "in") zoom.zoomBy(1.6);
        else if (b.dataset.z === "out") zoom.zoomBy(1 / 1.6);
        else zoom.reset();
      });

      /* ---------- The popover ---------- */
      const pop = slot.querySelector("#spl-pop");
      const popPhoto = pop.querySelector(".spl-pop-photo");
      let openId = null;
      let invoker = null;

      function walkLine(rec) {
        if (insetIds.has(rec.id)) return `Visited with the Pancha Rathas (stop ${num((recs.find((r) => r.id === "pancha-rathas") || {}).n || 2)}) — no separate leg.`;
        if (rec.id === firstStop) return "Start of the walking route. No ticket gate is mapped in OpenStreetMap, so no time from the entrance is given.";
        const leg = walk.get(rec.id);
        if (leg) {
          const m_ = Math.round(leg.km * 1000);
          if (leg.gap) return `From ${titleOf(leg.from)} — no mapped footpath, so no time is given.`;
          const min = (leg.km / WALK_KMH) * 60;
          return min < 1
            ? `Under a minute from ${titleOf(leg.from)} — ${m_} m of mapped path.`
            : `≈ ${Math.round(min)} min walk from ${titleOf(leg.from)} — ${m_} m of mapped path at ${WALK_KMH} km/h.`;
        }
        const stop = stopOf.get(rec.id);
        const straight = rec.far ? `${rec.far.km.toFixed(1)} km ${rec.far.dir} of the plan's centre in a straight line` : null;
        if (stop && stop.travel === "auto") return `${stop.note || "Reached by road, not on foot."}${straight ? ` (${straight}.)` : ""}`;
        return `Not on the walking route.${straight ? ` ${straight[0].toUpperCase()}${straight.slice(1)} — no footpath is used for that figure.` : ""}`;
      }

      async function open(id, from) {
        const rec = pinById.get(id);
        if (!rec) return;
        if (openId === id && !pop.hidden) { close(); return; }
        openId = id;
        invoker = from || rec.el;
        const m = rec.m;
        pop.dataset.id = id;
        pop.querySelector(".spl-pop-num").textContent = num(rec.n);
        pop.querySelector(".spl-pop-when").textContent = m.when || "";
        pop.querySelector("#spl-pop-title").textContent = m.title;
        pop.querySelector(".spl-pop-text").textContent = m.text || "";
        pop.querySelector(".spl-pop-walk").textContent = walkLine(rec);
        pop.querySelector(".spl-pop-acts").innerHTML =
          `<a class="spl-act" href="${esc(guideHref)}#stop=${encodeURIComponent(id)}">Directions</a>` +
          (poiIds.has(id) ? `<a class="spl-act" href="${esc(threeDHref)}#site&poi=${encodeURIComponent(id)}">See in 3D</a>` : "");
        popPhoto.hidden = true;
        popPhoto.innerHTML = "";
        allPins.forEach((p) => { p.el.setAttribute("aria-expanded", String(p.id === id)); p.el.classList.toggle("is-open", p.id === id); });
        pop.hidden = false;
        place(rec);
        pop.querySelector(".spl-pop-close").focus({ preventScroll: true });

        if (m.photo && m.wiki && window.WikiPhoto) {
          const got = await window.WikiPhoto.lookup([m.wiki], { size: "thumb" });
          if (!got || pop.dataset.id !== id) return; // a later open wins
          popPhoto.innerHTML = `<img src="${esc(got.src)}" alt="${esc(got.title)}" loading="lazy" decoding="async">`;
          popPhoto.hidden = false;
          place(rec);
        }
      }
      function place(rec) {
        if (!rec || window.matchMedia(SHEET_MQ).matches) { pop.style.left = pop.style.top = ""; return; } // CSS: a bottom sheet
        const w = lastW, h = lastH;
        // Where the mark is, in the map's own pixels (inset pins live inside the inset box).
        let x = rec.x, y = rec.y;
        if (insetIds.has(rec.id)) {
          const b = insetBox.getBoundingClientRect(), mb = mapEl.getBoundingClientRect();
          x += b.left - mb.left; y += b.top - mb.top;
        }
        const pw = pop.offsetWidth, ph = pop.offsetHeight;
        const off = PIN / 2 + 6;
        let l = x + off;
        if (l + pw > w - 6) l = x - off - pw;
        if (l < 6) l = 6;
        let t = y - 24;
        if (t + ph > h - 6) t = h - 6 - ph;
        if (t < 6) t = 6;
        pop.style.left = `${l.toFixed(0)}px`;
        pop.style.top = `${t.toFixed(0)}px`;
      }
      function close() {
        if (pop.hidden) return;
        pop.hidden = true;
        openId = null;
        allPins.forEach((p) => { p.el.setAttribute("aria-expanded", "false"); p.el.classList.remove("is-open"); });
        if (invoker && invoker.isConnected) invoker.focus({ preventScroll: true });
        invoker = null;
      }
      const markActive = () => allPins.forEach((p) => p.el.classList.toggle("is-open", p.id === openId && !pop.hidden));
      root.addEventListener("click", (e) => {
        if (e.detail > 1 || zoom.swallowClick()) return; // a double-click zooms; a drag is not a tap
        const b = e.target.closest(".spl-pin, .spl-ipin, .spl-item");
        if (b) { open(b.dataset.id, b); return; }
        if (e.target.closest(".spl-pop-close")) close();
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) close(); });
      document.addEventListener("pointerdown", (e) => {
        if (pop.hidden || pop.contains(e.target) || e.target.closest(".spl-pin, .spl-ipin, .spl-item")) return;
        close();
      });

      /* ---------- Go ---------- */
      root.classList.remove("is-loading");
      if ("ResizeObserver" in window) new ResizeObserver(fit).observe(mapEl);
      else window.addEventListener("resize", fit);
      fit();
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layoutLabels());
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        console.log("[site-plan]", {
          monuments: recs.length, onPlan: mainRecs.length, inInset: insetRecs.length,
          edge: recs.filter((p) => p.far).map((p) => `${p.id} ${p.far.km.toFixed(1)} km ${p.far.dir}`),
          pictures: Object.fromEntries(recs.map((p) => [p.id, p.picture])),
          areas: [...layers.areas.keys()], water: layers.water.length, land: layers.land.length,
          legs: walk.size, rocks: layers.rocks.length, buildings: layers.buildings.length, in3D: [...poiIds],
        });
        window.__plan = { get view() { return view; }, zoom, draw: () => draw() };
      }
    }
  }

  return { mount };
})();
