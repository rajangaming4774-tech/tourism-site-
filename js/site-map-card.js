/* A small map of the monuments, shown the way a search result shows a place:
 * a map picture with the places pinned on it, the place name under it, and a
 * button through to the full map.
 *
 * WHY IT DRAWS ITS OWN MAP. The full site map (mahabalipuram-guide.html) is a
 * live MapLibre map; this page does not load that library, and a card that is
 * on screen for a few seconds does not need ~800 KB of it. Raster tiles were
 * tried first and dropped: CARTO's free raster basemap now stamps "KEY
 * REQUIRED" across every tile. So the picture is an SVG drawn from the
 * OpenStreetMap extracts this site already ships and the guide already uses —
 * roads (data/mahabalipuram-paths.geojson), the coastline
 * (data/mamallapuram-coastline.geojson) and the protected areas
 * (data/mahabalipuram-park.geojson). No third-party request, no key, nothing
 * new for the CSP, and it works offline once the page is cached. The
 * projection, the fit and the label layout live in js/site-geo.js, shared
 * with the illustrated site plan.
 *
 * WHERE THE PINS COME FROM. Each monument's `osm` id joined against
 * data/mahabalipuram-osm.json — the same join guide-map.js does. A monument
 * with no OSM position gets no pin rather than a guessed one. A monument too
 * far out to share the frame (Tiger Cave, ~4.7 km north) is not squeezed in:
 * it becomes a hollow pin on the edge facing it, labelled with its distance.
 *
 * Nothing here is required. If the data fails to load the card removes itself
 * and the page reads exactly as it did before.
 *
 * Usage: const card = SiteMapCard.mount(slotEl, { monuments, href, place, sub });
 *        card.setActive(monumentId);
 */
window.SiteMapCard = (function () {
  const G = window.SiteGeo;
  const FAR_KM = 2; // further than this from the group's middle: an edge pin
  const esc = G.esc;

  function mount(slot, opts) {
    const { monuments, href = "mahabalipuram-guide.html", place = "Mamallapuram", sub = "" } = opts;
    let active = null;
    let api = { setActive: (id) => (active = id) };
    if (!slot || !monuments || !monuments.length) return api;

    Promise.all([
      G.json("data/mahabalipuram-osm.json"),
      G.optional("data/mahabalipuram-paths.geojson"),
      G.optional("data/mamallapuram-coastline.geojson"),
      G.optional("data/mahabalipuram-park.geojson"),
    ])
      .then(([osm, paths, coast, park]) => build(osm, G.prepare({ paths, coast, park })))
      .catch((err) => {
        console.warn("[site-map-card]", err && err.message);
        slot.innerHTML = "";
      });

    return { setActive: (id) => api.setActive(id) };

    function build(osm, layers) {
      const byOsm = new Map(osm.monuments.map((m) => [m.id, m]));
      const pins = monuments
        .map((m, i) => ({ m, n: i + 1, o: byOsm.get(m.osm) }))
        .filter((p) => p.o && Array.isArray(p.o.lngLat))
        .map((p) => ({ id: p.m.id, n: p.n, title: p.m.title, lngLat: p.o.lngLat, pt: G.project(p.o.lngLat) }));
      if (!pins.length) throw new Error("no monument has an OSM position");

      // The group's middle, by median so one outlier cannot drag it.
      const med = (k) => {
        const v = pins.map((p) => p.lngLat[k]).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      const middle = [med(0), med(1)];
      pins.forEach((p) => {
        const d = G.kmBetween(middle, p.lngLat);
        p.far = d > FAR_KM ? { km: d, dir: G.compass(middle, p.lngLat) } : null;
      });
      const near = pins.filter((p) => !p.far);

      const count = pins.length;
      slot.innerHTML = `
        <figure class="smc" aria-label="Map of the ${count} monuments on the tour">
          <div class="smc-inner">
            <div class="smc-card">
              <div class="smc-map">
                <svg class="smc-base" aria-hidden="true"></svg>
                <a class="smc-bg" href="${esc(href)}" aria-label="Open the full site map"></a>
                <svg class="smc-leaders" aria-hidden="true"></svg>
                <ol class="smc-pins">${pins
                  .map(
                    (p) => `<li><a class="smc-pin${p.far ? " smc-far" : ""}" data-id="${esc(p.id)}"
                      href="${esc(href)}#stop=${encodeURIComponent(p.id)}"
                      aria-label="${p.n}, ${esc(p.title)}${p.far ? `, ${p.far.km.toFixed(1)} km ${p.far.dir}` : ""} — show on the site map">
                      <span class="smc-dot">${p.n}</span><span class="smc-label"><b class="smc-ln">${p.n}</b> ${esc(p.title)}${
                        p.far ? ` · ${p.far.km.toFixed(1)} km ${p.far.dir}` : ""
                      }</span></a></li>`
                  )
                  .join("")}</ol>
                <span class="smc-attr">© OpenStreetMap contributors</span>
              </div>
              <figcaption class="smc-cap">
                <span class="smc-text"><b class="smc-place">${esc(place)}</b>${sub ? `<span class="smc-sub">${esc(sub)}</span>` : ""}</span>
                <a class="smc-open" href="${esc(href)}">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>
                  Site map
                </a>
              </figcaption>
            </div>
          </div>
        </figure>`;

      const mapEl = slot.querySelector(".smc-map");
      const baseEl = slot.querySelector(".smc-base");
      const leadersEl = slot.querySelector(".smc-leaders");
      const pinEls = [...slot.querySelectorAll(".smc-pin")].map((el, i) => ({
        ...pins[i],
        el,
        label: el.querySelector(".smc-label"),
      }));

      let lastW = 0;
      let lastH = 0;
      function render() {
        const w = mapEl.clientWidth;
        const h = mapEl.clientHeight;
        if (!w || !h || (w === lastW && h === lastH)) return;
        lastW = w;
        lastH = h;

        // Fit the near pins, leaving room for pin dots and the attribution.
        const view = G.fitView({ w, h, fitPts: near.map((p) => p.pt) });
        baseEl.setAttribute("viewBox", `0 0 ${w} ${h}`);
        baseEl.innerHTML = G.basemapSvg(view, layers, { uid: "card" });
        if (!layers.roads.length && !layers.coastLines.length) mapEl.classList.add("is-bare");

        const inset = 14;
        pinEls.forEach((p) => {
          let [x, y] = view.px(p.pt);
          if (p.far) {
            x = G.clamp(x, inset, w - inset);
            y = G.clamp(y, inset, h - inset - 14);
          }
          p.tx = p.x = x;
          p.ty = p.y = y;
        });
        G.nudgePins(pinEls, { w, h });
        pinEls.forEach((p) => {
          p.el.style.left = `${p.x.toFixed(1)}px`;
          p.el.style.top = `${p.y.toFixed(1)}px`;
        });
        layoutLabels();
      }

      /* Laid out by position alone, not by which card is flying, so labels
       * don't jump about during the tour. */
      function layoutLabels() {
        leadersEl.setAttribute("viewBox", `0 0 ${lastW} ${lastH}`);
        leadersEl.innerHTML = G.layoutLabels(pinEls, { w: lastW, h: lastH });
        markActive();
      }

      const markActive = () => pinEls.forEach((p) => p.el.classList.toggle("is-active", p.id === active));

      api = {
        setActive(id) {
          if (id === active) return;
          active = id;
          markActive();
        },
      };

      if ("ResizeObserver" in window) new ResizeObserver(render).observe(mapEl);
      else window.addEventListener("resize", render);
      render();
      // Label widths change when the web fonts arrive.
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutLabels);
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        console.log("[site-map-card] pins", pins.map((p) => `${p.n} ${p.id}${p.far ? ` (edge, ${p.far.km.toFixed(1)} km ${p.far.dir})` : ""}`), {
          roads: layers.roads.length, coast: layers.coastLines.length, parks: layers.parks.length,
        });
      }
    }
  }

  return { mount };
})();
