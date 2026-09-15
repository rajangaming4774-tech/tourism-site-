/* On-site visitor guide map engine.
 *
 * Generic: no Mahabalipuram specifics live here. It takes monuments, routes
 * and an OSM facility dump and renders a wayfinding map with a walking route,
 * category-filtered facility pins, and the visitor's own position.
 *
 * Data contract (all supplied by js/guide-mount.js):
 *   osm     { fetched, license, counts, monuments[], amenities[] }
 *   paths   GeoJSON LineStrings — the pedestrian network (context only)
 *   park    GeoJSON Polygons — the protected-area boundary
 *   routes  GeoJSON LineStrings, properties { route, from, to, gap }
 *   monuments / routeDefs — the hand-authored content globals
 */
window.GuideMap = (function () {
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DEV =
    location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:";
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dur = (ms) => (REDUCED_MOTION ? 0 : ms);

  /* Facility categories. Every one is always shown in the legend — including
   * those OSM has no record of here — because "0 recorded" is honest and a
   * silently missing category reads as "there are none". */
  const CATEGORY_META = {
    toilets:   { label: "Toilets",   icon: "M7 4h3l1 7H9v9H7v-9H5zM15 4a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 20v-5h-2l2-5h4l2 5h-2v5z" },
    water:     { label: "Water",     icon: "M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10z" },
    parking:   { label: "Parking",   icon: "M8 20V5h5a4 4 0 0 1 0 8H8" },
    tickets:   { label: "Tickets",   icon: "M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM14 8v12" },
    info:      { label: "Info",      icon: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 11v5M12 7.5v.5" },
    food:      { label: "Food",      icon: "M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.5 2-2 4-2 6h4V3M17 9v12" },
    shops:     { label: "Shops",     icon: "M4 8h16l-1 12H5zM8 8V6a4 4 0 0 1 8 0v2" },
    money:     { label: "ATM",       icon: "M3 6h18v12H3zM3 10h18M7 15h3" },
    transport: { label: "Bus",       icon: "M5 5h14v9H5zM5 14v3h3v-3M16 14v3h3v-3M5 9h14" },
    medical:   { label: "Medical",   icon: "M12 5v14M5 12h14" },
    shade:     { label: "Shade",     icon: "M12 4v3M4 12h3M17 12h3M12 17v3M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" },
    lockers:   { label: "Lockers",   icon: "M6 3h12v18H6zM12 10v3M15 3v18" },
  };
  const CATEGORY_ORDER = Object.keys(CATEGORY_META);
  const DEFAULT_ON = ["toilets", "water", "parking", "tickets"];

  /* When OSM has nothing for a category, tapping it should explain why rather
   * than silently doing nothing. Facts asserted by the site's own pages are
   * quoted here and attributed as such — they are never turned into a pin. */
  const EMPTY_NOTE = {
    tickets:
      "OpenStreetMap has no ticket counter mapped at this site. From the guide page: a single ASI ticket covers the Shore Temple and the Pancha Rathas, and the caves and open-air reliefs are free. Ask at either gate.",
    lockers: "No cloakroom or lockers are recorded in OpenStreetMap here.",
    shade: "Little is mapped. The site is open granite with very little natural shade — carry water and a hat.",
    medical: "No first-aid post is mapped on site. The nearest pharmacies and clinics are shown instead.",
  };

  const svgIcon = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  function create(config) {
    const {
      container, osm, paths, park, routes, monuments, routeDefs, plan,
      legendEl, sheetEl, sheetBodyEl, provenanceEl, routeBarEl, locateBtn, grabBtn, threeDBtn, photo, allBtn,
    } = config;
    /* The pictures on the pins (js/monument-pictures.js), the same drawings
     * the destination page's site plan uses. Optional: without the script the
     * pins fall back to a plain disc. */
    const pictures = window.MonumentPictures || null;

    const monById = new Map(monuments.map((m) => [m.id, m]));
    const osmMonById = new Map(osm.monuments.map((m) => [m.id, m]));
    const amenityById = new Map(osm.amenities.map((a) => [a.id, a]));
    /* Monument <-> 3D massing. The footprints file is keyed by OSM id, the
     * same key monuments use, so the two can be joined without a new field. */
    let footprintByOsm = new Map();
    const heightFor = (osmId) => footprintByOsm.get(osmId) || null;
    const monByOsm = new Map(monuments.map((m) => [m.osm, m]));

    const coordFor = (id) => {
      const m = monById.get(id);
      const o = m && osmMonById.get(m.osm);
      return o ? o.lngLat : null;
    };

    let activeRoute = null;
    let enabled = new Set(readStoredCategories());
    let monMarkers = [];
    let amenityMarkers = [];

    /* ---------- Map ---------- */
    const map = new maplibregl.Map({
      container,
      // Light basemap — matches the paper palette, and it is on the one CDN
      // the site's CSP allows. Its tiles cap at z14 while we work at z16–18,
      // so it is context only; the real detail is the OSM path network and
      // the park boundary we draw ourselves below.
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      /* Opens on the Pancha Rathas rather than the whole site, because that is
       * the only place the 3D is legible: five of the six extruded monuments
       * are in this one cluster, and measured on screen a block is ~41 px here
       * against ~9 px from a site-wide view. Zoom out or pick a route for the
       * overview. */
      /* A site overview, not a single monument. This used to open tight on the
       * Pancha Rathas because they were the only cluster with enough extruded
       * mass to look like anything; now the whole core stands up, so the wide
       * view is the one that actually shows the 3D — and it is the view that
       * answers "where am I and what is around me", which is the page's job. */
      /* Framing solved by measurement, not taste: at this camera the rendered
       * 3D mass spans 16-66% of the viewport height on a desktop pane and
       * 22-72% on a 375px phone, clearing the control row at the top and the
       * legend at the bottom in both. */
      center: [80.1915, 12.6168],
      zoom: 15.7,
      bearing: -35,
      minZoom: 13,
      maxZoom: 19,
      maxBounds: [[80.170, 12.592], [80.220, 12.670]],
      // Default maxPitch is 60 and setPitch clamps silently — anything steeper
      // than 60 is quietly ignored without this.
      maxPitch: 75,
      fadeDuration: dur(300),
    });
    /* showCompass was false, which was a bug even before 3D: dragRotate and
     * touchZoomRotate are on by MapLibre's default, so a two-finger twist on
     * site already left the map crooked with no way to straighten it. The
     * compass owns bearing; the 3D button owns pitch (so visualizePitch stays
     * off — it would call resetNorthPitch and flatten the map behind our
     * button's back, desyncing aria-pressed). */
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "bottom-right");

    /* Both overrides matter. The vendored defaults are enableHighAccuracy
     * false (coarse cell/wifi positioning, hundreds of metres) and maxZoom 15
     * (~4.7 m/px — the whole town on one screen, useless for telling which
     * monument you are at). */
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
      fitBoundsOptions: { maxZoom: 18, duration: dur(800) },
      trackUserLocation: true,
      showAccuracyCircle: true,
    });
    map.addControl(geolocate, "bottom-right");

    /* MapLibre's own controls ship a native `title=`, and the browser draws that
     * as a black system box in the system font — the only thing on this page
     * that takes no part in the design. Our own controls moved their text to
     * `data-tip` (styled in css/guide.css); these do the same, but they have to
     * be rewritten after MapLibre builds them.
     *
     * SAFE because every one of them carries `aria-label` with the same string
     * already — verified on all five: zoom in, zoom out, compass, geolocate and
     * the attribution toggle. So the accessible name is untouched and only the
     * OS-drawn box goes away. Re-run on `idle` as well as now, because the
     * geolocate button rewrites its own title as its permission state changes
     * ("Location not available" → "Find my location"). */
    const restyleTips = () => {
      for (const el of map.getContainer().querySelectorAll("[title]")) {
        const t = el.getAttribute("title");
        if (!t) continue;
        // Never drop the only accessible name a control has.
        if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", t);
        el.setAttribute("data-tip", t);
        el.removeAttribute("title");
      }
    };
    restyleTips();
    map.on("idle", restyleTips);

    geolocate.on("error", (e) => {
      const denied = e && e.code === 1;
      setSheet(
        "Location",
        `<p class="g-note">${
          denied
            ? "Location permission was refused, so the map cannot show where you are. You can still use the route and the facility pins."
            : "Your location is not available right now — this often happens indoors or with a weak GPS signal. The route and facility pins still work."
        }</p>`
      );
    });
    if (locateBtn) {
      // Only ever on an explicit tap. An unprompted permission dialog on a
      // page someone just opened is hostile, and iOS penalises it.
      locateBtn.addEventListener("click", () => {
        // trigger() returns false when the control disabled itself — no
        // geolocation API, or an insecure origin. Say so; a button that
        // silently does nothing is worse than one that explains itself.
        if (geolocate.trigger() === false) {
          setSheet(
            "Location",
            `<p class="g-note">This browser will not share a location with the page. That usually means the
             page was opened over plain <code>http://</code> rather than <code>https://</code>, or location
             services are switched off for the browser.</p>
             <p class="g-note">The walking routes and the facility pins all still work — you just won't see
             a dot for yourself.</p>`
          );
        }
      });
    }

    map.on("load", () => {
      map.addSource("park", { type: "geojson", data: park });
      map.addSource("paths", { type: "geojson", data: paths });
      map.addSource("route", { type: "geojson", data: emptyFC() });

      /* Sandy tint inside the ASI enclosures, as in the aerial photographs —
       * the sites read as bare sand and rock against the surrounding green,
       * and this keeps them legible as distinct areas rather than blending
       * into the basemap. Draped, so it follows the terrain in 3D. */
      map.addLayer({
        id: "park-fill", type: "fill", source: "park",
        paint: { "fill-color": "#d9c9a3", "fill-opacity": 0.42 },
      });
      /* The monuments' own outlines, as OpenStreetMap maps them (13 of the 24
       * are ways; the rest are points and get no area). Under the footpaths
       * and the pins, over the park tint — so the Shore Temple compound and
       * the rathas' plinths read as areas rather than a dot each. Water and
       * landcover from the same file are NOT drawn here: the basemap already
       * carries OSM's water and parks, and two copies would disagree at
       * the edges. */
      if (plan && plan.features) {
        const areas = { type: "FeatureCollection", features: plan.features.filter((f) => f.properties && f.properties.kind === "monument") };
        map.addSource("areas", { type: "geojson", data: areas });
        map.addLayer({
          id: "area-fill", type: "fill", source: "areas",
          paint: { "fill-color": "#fbf6ec", "fill-opacity": 0.75 },
        });
        map.addLayer({
          id: "area-line", type: "line", source: "areas",
          layout: { "line-join": "round" },
          paint: { "line-color": "#2a211a", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.8, 18, 1.6] },
        });
      }
      map.addLayer({
        id: "park-line", type: "line", source: "park",
        /* Colour changed, not just opacity — and it had to be. #a67c2e at full
         * opacity is still only 2.89:1 over the sand fill, short of the 3:1 a
         * graphical object carrying information needs. #8c6a2a (--gold-deep,
         * already a token here) reaches 3.81:1. This boundary answers "is my
         * ASI ticket valid here", so it is information, not decoration. */
        paint: {
          "line-color": "#8c6a2a", "line-opacity": 1,
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1.8, 18, 3],
          "line-dasharray": [4, 2.5],
        },
      });

      /* The footpaths are the single biggest piece of real detail on this page —
       * 339 mapped features — and they were being drawn at 0.22 opacity and
       * 1.2 px over Positron's near-white #fafaf8, which made them effectively
       * invisible. That is most of the reason the map reads as empty: the
       * detail was loaded, paid for and then not shown.
       *
       * The casing matters as much as the opacity. These paths cross the sand
       * park fill (#d9c9a3) and the basemap's grey blocks, and a single brown
       * line disappears against one or the other; a cream casing keeps them
       * legible over both. Width is zoom-interpolated so they stay hairlines at
       * the site overview and thicken as you walk in, rather than turning the
       * overview into a net. */
      /* ONLY the pedestrian classes. This is a correctness filter, not a tidy-up.
       *
       * The file holds 339 ways, but 265 of them are vehicle roads — service
       * 106, residential 100, primary 23, tertiary 13, secondary 9,
       * living_street 9, trunk 3, links 2 — and the basemap already draws every
       * one of those, correctly widened all the way to z18. Drawing ours on top
       * does not add information; it double-strokes the same geometry with a
       * second colour and an antialiasing fringe along every road in town.
       *
       * The 74 that ARE ours: footway 45, path 18, steps 4, track 4,
       * pedestrian 3. Positron draws these at 0.5-3 px in #d5d5d5 (about
       * 1.15:1 against its own page white) or not at all — so on a walking map,
       * on a phone, in sun, they are the layer that is missing. */
      const PEDESTRIAN = ["match", ["get", "highway"],
        ["footway", "path", "steps", "pedestrian", "track"], true, false];

      /* The casing is not decoration either. These paths cross three different
       * grounds — Positron's #fafaf8, our own sand park-fill, and the diorama
       * board in 3D — and no single ink holds contrast against all three. Over a
       * cream casing the brown reads the same everywhere. The route line above
       * already uses exactly this trick, so this is the file's own precedent. */
      map.addLayer({
        id: "paths-casing", type: "line", source: "paths", filter: PEDESTRIAN,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#fbf6ec",
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, 0.55, 16.5, 0.8],
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 14, 2.4, 16, 4.2, 18, 7.2],
        },
      });
      map.addLayer({
        id: "paths-line", type: "line", source: "paths", filter: PEDESTRIAN,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#8c6a2a",
          // Was 0.22 — about 1.33:1 against the page, which is invisible in
          // glare. At full opacity it is 4.77:1. Zoom does the fading instead,
          // so a wide view is not a brown scribble.
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.45, 15.5, 0.85, 16.5, 1],
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 14, 0.9, 16, 1.8, 18, 3.4],
          "line-dasharray": [2.4, 1.8],
        },
      });
      // Cream casing under the gold so the route reads over sand, grass and
      // tarmac alike.
      map.addLayer({
        id: "route-casing", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#fbf6ec", "line-width": 9, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line", type: "line", source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#a67c2e",
          "line-width": 4.5,
          // A leg with no mapped footpath is drawn dashed, never solid — the
          // map does not claim to know a way it hasn't got.
          "line-dasharray": ["case", ["get", "gap"], ["literal", [1.5, 1.5]], ["literal", [1, 0]]],
        },
      });

      renderMonumentMarkers();
      renderAmenityMarkers();
      restoreFromHash();
      if (DEV) {
        map.on("error", (e) => console.warn("[guide] map error", e && e.error && e.error.message));
      }
      if (DEV) console.log(`[guide] ${osm.monuments.length} monuments, ${osm.amenities.length} amenities`);
    });

    /* ---------- Markers ---------- */
    function clearMarkers(list) {
      for (const m of list) m.remove();
      list.length = 0;
    }

    function renderMonumentMarkers() {
      clearMarkers(monMarkers);
      const order = activeRoute ? activeRoute.stops.map((s) => s.monument) : [];
      monuments.forEach((m, i) => {
        const lngLat = coordFor(m.id);
        if (!lngLat) return;
        const idx = order.indexOf(m.id);
        if (activeRoute && idx === -1) return;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "g-mon" + (activeRoute ? " is-numbered" : "");
        /* The pin is the picture of the monument's kind (shared with the
         * destination page's site plan) with a number badge: the route's stop
         * number while a route is on, otherwise the monument's number in the
         * destination page's list, so "04" here is "04" there. */
        const n = activeRoute ? idx + 1 : i + 1;
        const picHtml = pictures ? pictures.svg(pictures.pictureOf(m), "g-mon-pic") : "";
        el.setAttribute("aria-label", `${String(n).padStart(2, "0")}, ${m.title}`);
        el.innerHTML =
          `<span class="g-mon-pin">${picHtml}<span class="g-mon-badge">${String(n).padStart(2, "0")}</span></span>` +
          `<span class="g-mon-label">${esc(m.title)}</span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          showStop(m.id);
        });
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, -2], opacityWhenCovered: "0.35" })
          .setLngLat(lngLat)
          .addTo(map);
        marker._mon = m;
        marker._onRoute = idx !== -1;
        // Measured once at mount: reading offsetWidth for 23 markers every
        // frame would be 23 forced layouts per move.
        marker._labelW = el.querySelector(".g-mon-label").offsetWidth || 110;
        monMarkers.push(marker);
      });
      declutter();
    }

    /* ---------- Declutter ----------
     * 23 monuments on a site ~1 km across, several within 40 m of each other:
     * Mahishasuramardini and Olakkanneshwara are 37 m apart (63 px at z18) and
     * Draupadi and Arjuna just 6 m (20 px at max zoom, narrower than the 46 px
     * button). Zoom tiers alone cannot fix that, so a collision pass is needed.
     *
     * Markers stay DOM buttons rather than becoming a symbol layer: a symbol
     * layer would gain MapLibre's collision detection and lose the focusable
     * <button>, the aria-label and the 44 px target this page is built around.
     * Anything culled here stays reachable through the monument list, so the
     * keyboard path is never worse than the visual one. */
    function declutter() {
      const z = map.getZoom();
      const accepted = [];
      const labels = [];
      // Headline monuments first, so a low-rank pin never displaces the
      // Shore Temple.
      const ordered = [...monMarkers].sort((a, b) => (a._mon.rank || 99) - (b._mon.rank || 99));

      for (const marker of ordered) {
        const m = marker._mon;
        const el = marker.getElement();
        const label = el.querySelector(".g-mon-label");

        // An active route stop is never culled — the numbered sequence has to
        // stay complete or the route stops meaning anything.
        if (!marker._onRoute) {
          if ((m.zoomFrom && z < m.zoomFrom) || (m.zoomTo && z >= m.zoomTo)) {
            el.style.display = "none";
            continue;
          }
        }

        const p = map.project(marker.getLngLat());

        /* A CROWDED PIN SHRINKS. IT IS NEVER REMOVED.
         *
         * This used to be `display:none` for any pin within 30 px of an
         * accepted one below z17.5, and that deleted real monuments from the
         * map: at the opening camera it removed Varaha Cave (24 px from the
         * Descent of the Ganges) and Olakkanneshwara (19 px from
         * Mahishasuramardini), leaving them unclickable and, to a reader,
         * simply absent. Hiding a name is a legible compromise; hiding a
         * monument is a false statement about what is on the site.
         *
         * Measured at z15.7, one metre is 0.35 px, and 27 monument pairs here
         * are within 60 m of each other — so crowding is the normal case, not
         * the exception, and it has to degrade gracefully rather than delete. */
        const near = accepted.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 18);
        el.classList.toggle("is-crowded", near && !marker._onRoute);
        el.style.display = "";
        accepted.push(p);

        // Above z17.5 the reader has deliberately zoomed in; overlap is
        // acceptable there and culling would make Draupadi or Arjuna
        // permanently untappable given their 6 m separation.
        const w = marker._labelW;
        const box = { l: p.x - w / 2, r: p.x + w / 2, t: p.y - 42, b: p.y - 20 };
        const clash = labels.some((q) => !(box.r < q.l || box.l > q.r || box.b < q.t || box.t > q.b));
        if (clash) {
          el.classList.add("is-pin-only");
        } else {
          el.classList.remove("is-pin-only");
          labels.push(box);
        }
      }
    }

    function renderAmenityMarkers() {
      clearMarkers(amenityMarkers);
      for (const a of osm.amenities) {
        if (!enabled.has(a.category)) continue;
        const meta = CATEGORY_META[a.category];
        if (!meta) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = `g-am g-am--${a.category}`;
        el.setAttribute("aria-label", `${meta.label}${a.name ? ` — ${a.name}` : ""}`);
        el.innerHTML = `<span class="g-am-glyph">${svgIcon(meta.icon)}</span>`;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          showAmenity(a.id);
        });
        amenityMarkers.push(new maplibregl.Marker({ element: el, anchor: "center", opacityWhenCovered: "0.35" }).setLngLat(a.lngLat).addTo(map));
      }
    }

    /* ================= 3D =================
     * Flat by default. Everything here is lazy: the flat page must not pay for
     * a mode nobody opened. */
    /* The map opens tilted. It was flat-by-default originally, on the argument
     * that flat is easier for the actual job of finding a toilet — but the 3D
     * view is the thing worth seeing, and the button is still there to flatten
     * it. Cost of the change: every visit now loads the footprints file and the
     * terrain tiles, which the lazy path used to avoid. */
    /* Said where the reader is, not only in the README. The monuments are
     * measured; the town is not, and the sentence that admits it ships next to
     * the map rather than in a file nobody opens. */
    const MASSING_NOTE =
      " The pictures on the pins show the kind of monument, not the monument" +
      " itself — the same drawing for every cave temple, and so on. Where an" +
      " outline is drawn under a pin, that is the area OpenStreetMap maps; a" +
      " monument with no outline is a single point in OpenStreetMap." +
      " In 3D, monument heights are measured and cited; surrounding buildings are" +
      " drawn at a nominal height by type, not surveyed. Palms are decorative:" +
      " they mark ground OpenStreetMap records as vegetated, not individual trees.";
    /* The site map opens FLAT, and that is a deliberate reversal.
     *
     * It used to open tilted, and the cost was hidden in another file:
     * `css/guide.css` hides every monument label in 3D ("In 3D the monument
     * name labels stack toward the horizon and turn the view to soup"), and the
     * pin's own text is `activeRoute ? idx + 1 : ""`. So a first visit — tilted,
     * with no route chosen — showed twenty-three IDENTICAL BLANK GOLD CIRCLES
     * and not one monument name. The CSS comment defends this on the grounds
     * that "the numbered gold pins carry the same information", but they are
     * only numbered while a route is active, which on arrival it is not.
     *
     * The page's own HTML already argues for flat: "this page is used on site in
     * glare, where the plan view is the legible one". Tilt remains one tap away,
     * and `d` in the hash still wins either way, so shared tilted links (#d=1)
     * are unaffected. */
    const DEFAULT_3D = false;
    const PITCH_3D = 62;

    /* ---------- The diorama ----------
     *
     * The 3D view is styled as a physical tabletop model: sand board, little
     * cream buildings, a grey granite outcrop, warm raking sun, long shadows.
     * Flat mode is untouched and stays the high-contrast utility map, because
     * that is the one people actually use standing in the sun at the site.
     *
     * ONE sun serves the whole scene. setLight, the fake shadows and the
     * hillshade all read this constant, so they cannot drift out of agreement
     * — a shadow falling toward the light is the single most obvious way a
     * scene like this stops reading as a physical object. */
    const SUN_AZIMUTH = 215; // degrees clockwise from north, per the light spec
    const SUN_POLAR = 62; // degrees from vertical; a raking sun, not overhead
    /* Ground length of a cast shadow, in metres. Held constant on the ground
     * as you zoom (fill-translate is in PIXELS, so it is recomputed on zoom). */
    const SHADOW_M = 8;
    /* Not app.js's 1.8 — that was tuned for Himalayan relief at z6. Here the
     * whole ridge is ~25 m and the same tile carries sea floor to -240 m, so
     * exaggeration deepens the hole faster than it lifts the hill. 1.0 keeps
     * the ridge legible (measured ~4 m at the Shore Temple against ~19 m on
     * the hill) without dredging the bay. */
    const TERRAIN_EXAG = 1.0;
    // cameraForBounds fits a flat rectangle; under pitch the near edge is
    // magnified and the far edge runs to the horizon, so the fitted zoom
    // overshoots. Measured against the half-day route at 375px and 1280px.
    const PITCH_ZOOM_BACKOFF = 0.6;
    let is3D = false;
    let assets3D = null;
    let hasContext = false;
    /* Everything this file adds itself. The basemap pass must never repaint or
     * hide one of these — they are the diorama, not the ground under it. */
    const OWN_LAYERS = new Set([
      "park-fill", "area-fill", "area-line", "park-line", "paths-casing", "paths-line", "route-casing", "route-line",
      "context-extrusion", "rock-extrusion", "footprint-line", "monument-extrusion",
      "shadow-context", "shadow-monument", "diorama-hillshade",
      "board-mask", "board-edge", "palms",
      "sea-waves", "sea-surf-0", "sea-surf-1", "sea-surf-2",
    ]);

    /* ---------- The sea ----------
     *
     * Flat turquoise read as a coloured hole in the board. The reference has two
     * things this needs: surf breaking in bands parallel to the shore, and a
     * moving texture across the open water.
     *
     * Both are derived from REAL geometry rather than painted on. CARTO's vector
     * source exposes `water` as polygons, so drawing that same source-layer as a
     * LINE gives the actual shoreline, and line-offset steps copies of it out to
     * sea for the successive breakers. Nothing here invents where the coast is.
     *
     * The surf is ornament, but it is optical ornament — it says "this is sea",
     * not "there is something at this spot" — so by the rule the palms follow it
     * needs no disclosure. */
    /* Positive offset puts the band INTO the water — verified on the shoreline,
     * since which way a polygon ring winds decides the sign. */
    const SURF_SIDE = 1;
    const SURF_BANDS = [
      { off: 0, w: 3.4, op: 0.95, blur: 1.4, dash: null },
      { off: 7, w: 2.6, op: 0.7, blur: 2.0, dash: [3, 2.2] },
      { off: 15, w: 1.9, op: 0.45, blur: 2.6, dash: [2, 3.4] },
    ];

    /* CARTO tags each water polygon with a class. Surf belongs to the OCEAN
     * alone: the first pass broke waves around the temple tank and, absurdly,
     * around hotel swimming pools. Waves also take the big lagoon, which is
     * open water, but never a pool or a river channel. */
    const OCEAN_ONLY = ["==", ["get", "class"], "ocean"];
    const OPEN_WATER = ["match", ["get", "class"], ["ocean", "lake"], true, false];

    /* A small tile of soft wave crests, drawn straight onto a canvas — no SVG
     * and no network. Repeats across the open water to break up the flat fill. */
    function waveImage() {
      const S = 64;
      const c = document.createElement("canvas");
      c.width = S;
      c.height = S;
      const g = c.getContext("2d");
      g.clearRect(0, 0, S, S);
      g.lineCap = "round";
      for (let row = 0; row < 3; row++) {
        const y0 = 10 + row * 21;
        g.beginPath();
        for (let x = 0; x <= S; x++) {
          // Two summed sines so the crests do not repeat on an obvious beat.
          const y = y0 + Math.sin((x / S) * Math.PI * 2) * 2.6 + Math.sin((x / S) * Math.PI * 6) * 1.1;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = row % 2 ? "rgba(255,255,255,0.34)" : "rgba(255,255,255,0.22)";
        g.lineWidth = row % 2 ? 1.5 : 1.1;
        g.stroke();
      }
      return g.getImageData(0, 0, S, S);
    }

    function addSea(beforeId) {
      if (map.getLayer("sea-waves")) return;
      const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
      try {
        if (!map.hasImage("wave")) map.addImage("wave", waveImage());
        map.addLayer({
          id: "sea-waves",
          type: "fill",
          source: "carto",
          "source-layer": "water",
          filter: ["all", ["==", ["geometry-type"], "Polygon"], OPEN_WATER],
          paint: { "fill-pattern": "wave", "fill-opacity": 0.5 },
        }, before);

        SURF_BANDS.forEach((b, i) => {
          const paint = {
            "line-color": "#ffffff",
            "line-width": b.w,
            "line-opacity": b.op,
            "line-blur": b.blur,
            "line-offset": SURF_SIDE * b.off,
          };
          if (b.dash) paint["line-dasharray"] = b.dash;
          map.addLayer({
            id: `sea-surf-${i}`,
            type: "line",
            source: "carto",
            "source-layer": "water",
            filter: ["all", ["==", ["geometry-type"], "Polygon"], OCEAN_ONLY],
            layout: { "line-cap": "round", "line-join": "round" },
            paint,
          }, before);
        });
      } catch (err) {
        console.warn("[guide] sea detail not drawn:", err && err.message);
      }
    }

    /* ---------- Palms ----------
     *
     * The only purely invented thing on this map, and deliberately fenced in.
     * OSM maps no individual trees here, so scripts/fetch-scenery.js scatters
     * them only inside polygons OSM actually tags as vegetated — the land cover
     * is sourced, the trunk positions are not, and the provenance line says so.
     *
     * Drawn as viewport-aligned billboards: under pitch they stand upright like
     * the card trees in a physical model rather than lying flat on the ground,
     * which is both closer to the reference and cheaper than any real geometry
     * (this MapLibre build has no model layer at all). */
    const PALM_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80">' +
      '<path d="M32 79 C30 60 30 48 31 35 L36 35 C37 48 37 60 35 79 Z" fill="#7c6547"/>' +
      '<g fill="#6d7a46">' +
      '<path d="M33 36 C22 30 12 28 3 33 C11 23 24 23 34 32 Z"/>' +
      '<path d="M34 36 C45 30 55 28 63 33 C55 23 42 23 33 32 Z"/>' +
      '<path d="M33 34 C26 22 18 14 9 11 C22 11 30 21 35 31 Z"/>' +
      '<path d="M34 34 C41 22 49 14 58 11 C45 11 37 21 32 31 Z"/>' +
      '<path d="M33 32 C31 20 32 10 34 1 C39 11 38 23 36 33 Z"/>' +
      "</g>" +
      '<circle cx="33" cy="36" r="2.6" fill="#5d6a3c"/>' +
      "</svg>";

    /* Rasterised in-page from a data: URI — no network, and CSP already allows
     * `img-src data:`, so this needs no policy change and works offline. */
    function palmImage() {
      return new Promise((resolve, reject) => {
        const ratio = 2;
        const img = new Image();
        img.onload = () => {
          try {
            const c = document.createElement("canvas");
            c.width = 64 * ratio;
            c.height = 80 * ratio;
            const ctx = c.getContext("2d");
            ctx.drawImage(img, 0, 0, c.width, c.height);
            resolve({ data: ctx.getImageData(0, 0, c.width, c.height), ratio });
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error("palm sprite failed to decode"));
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(PALM_SVG);
      });
    }

    async function addPalms(scenery, beforeId) {
      if (!scenery || !scenery.features || !scenery.features.length) return;
      if (map.getLayer("palms")) return;
      let sprite;
      try { sprite = await palmImage(); } catch (_) { return; } // no palms is fine
      if (map.getLayer("palms")) return; // a second enable3D raced us
      try {
        if (!map.hasImage("palm")) map.addImage("palm", sprite.data, { pixelRatio: sprite.ratio });
        if (!map.getSource("scenery")) map.addSource("scenery", { type: "geojson", data: scenery });
        const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
        map.addLayer({
          id: "palms",
          type: "symbol",
          source: "scenery",
          // Below this the board is read as a whole and 142 sprites are noise.
          minzoom: 15.4,
          layout: {
            "icon-image": "palm",
            "icon-anchor": "bottom",
            /* Spacing is already enforced at build time, so let them overlap
             * rather than have MapLibre's collision engine thin them out
             * unpredictably as the camera turns. */
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            // Upright billboards, not decals lying on the ground.
            "icon-pitch-alignment": "viewport",
            "icon-rotation-alignment": "viewport",
            /* The zoom interpolate has to be the OUTERMOST expression — MapLibre
             * rejects a zoom curve nested inside another operator, so the
             * obvious ["*", ["get","size"], [interpolate…]] silently fails to
             * add the layer. Per-feature variation goes in the stop outputs
             * instead, which is allowed. */
            "icon-size": [
              "interpolate", ["linear"], ["zoom"],
              15.4, ["*", ["get", "size"], 0.14],
              17, ["*", ["get", "size"], 0.34],
              19, ["*", ["get", "size"], 0.78],
            ],
          },
          paint: {
            "icon-opacity": ["interpolate", ["linear"], ["zoom"], 15.4, 0, 16.1, 0.92],
            "icon-opacity-transition": { duration: dur(400) },
          },
        }, before);
      } catch (err) {
        // Ornament: never worth breaking the view over. But say so, or a broken
        // expression looks identical to "the file was missing".
        console.warn("[guide] palms not drawn:", err && err.message);
      }
    }

    /* ---------- The board ----------
     *
     * A diorama is a model that ENDS. Without an edge the sand just runs to the
     * horizon and it reads as a map with an odd palette; with one it reads as an
     * object on a table, which is the whole illusion.
     *
     * CORE is the walkable site, and it is the same rectangle the data pipeline
     * uses — scripts/fetch-site-data.js:39 is the source of truth. Keep them in
     * step: a board edge that does not match the data's edge would draw a
     * boundary around nothing. */
    const CORE = { s: 12.6, w: 80.179, n: 12.631, e: 80.201 };

    function boardGeoJSON() {
      /* Outer ring counter-clockwise, hole clockwise, per the GeoJSON
       * right-hand rule. The outer ring is deliberately wider than maxBounds so
       * the mask still covers at the most zoomed-out, most tilted camera. */
      const outer = [
        [80.10, 12.52], [80.29, 12.52], [80.29, 12.74], [80.10, 12.74], [80.10, 12.52],
      ];
      const hole = [
        [CORE.w, CORE.s], [CORE.w, CORE.n], [CORE.e, CORE.n], [CORE.e, CORE.s], [CORE.w, CORE.s],
      ];
      return {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { part: "table" }, geometry: { type: "Polygon", coordinates: [outer, hole] } },
          { type: "Feature", properties: { part: "edge" }, geometry: { type: "LineString", coordinates: hole } },
        ],
      };
    }

    function addBoard(beforeId) {
      if (!map.getSource("board")) {
        map.addSource("board", { type: "geojson", data: boardGeoJSON() });
      }
      const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
      if (!map.getLayer("board-mask")) {
        map.addLayer({
          id: "board-mask",
          type: "fill",
          source: "board",
          filter: ["==", ["get", "part"], "table"],
          // The cream of the table the model sits on, sampled from the reference.
          /* 0.999, not 1, and the odd value is load-bearing. At exactly 1 the
           * layer is drawn in MapLibre's OPAQUE pass, which runs before the
           * translucent pass that symbols live in — so every CARTO place label
           * outside the site painted straight over the table. Anything below 1
           * moves the mask into the translucent pass, where ordinary layer
           * order applies and the labels are covered. The 0.1% of translucency
           * is invisible; the pass change is the point. */
          paint: { "fill-color": "#ece2cc", "fill-opacity": 0.999 },
        }, before);
      }
      if (!map.getLayer("board-edge")) {
        map.addLayer({
          id: "board-edge",
          type: "line",
          source: "board",
          filter: ["==", ["get", "part"], "edge"],
          layout: { "line-join": "miter" },
          // Two-tone: a warm line for the lit top edge of the board, drawn over
          // the mask so it reads as the model's cut edge rather than a border.
          paint: { "line-color": "#b9a67f", "line-width": 2.5, "line-opacity": 0.85 },
        }, before);
      }
    }

    /* ---------- Sculpted relief ----------
     *
     * The reference's centrepiece is a grey granite outcrop rising out of sand.
     * We already load a DEM for terrain; a hillshade over it, lit from the SAME
     * sun as everything else, turns the ridge from a flat tint into something
     * that looks carved. MapLibre 5.24 ships the multi-illumination hillshade,
     * so the shadow/highlight/accent colours can be warmed to match the board
     * instead of the default cold grey. */
    function addHillshade(beforeId) {
      if (map.getLayer("diorama-hillshade") || !map.getSource("dem")) return;
      const before = beforeId && map.getLayer(beforeId) ? beforeId : undefined;
      try {
        map.addLayer({
          id: "diorama-hillshade",
          type: "hillshade",
          source: "dem",
          paint: {
            "hillshade-method": "igor",
            "hillshade-exaggeration": 0.55,
            "hillshade-illumination-anchor": "map",
            "hillshade-illumination-direction": SUN_AZIMUTH,
            "hillshade-shadow-color": "#8a7355",
            "hillshade-highlight-color": "#f3e7cd",
            "hillshade-accent-color": "#b9a67f",
          },
        }, before);
      } catch (_) {
        /* Older hillshade spec (no method/colour arrays) — the view still works
         * without it, so this is not worth failing over. */
      }
    }

    /* ---------- Basemap recolour ----------
     *
     * The ground under everything is CARTO Positron, a hosted style this file
     * had never touched. In 3D it is repainted into the diorama's sand tones
     * and restored exactly on the way out, so flat mode is bit-for-bit the map
     * it has always been.
     *
     * Rules match on `source-layer`, NOT on layer id. Ids like
     * "road_sec_case_noramp" are CARTO's private naming and could be renamed in
     * any restyle; the source-layer names ("transportation", "water",
     * "landcover") come from the OpenMapTiles schema and are far more stable.
     *
     * Palette sampled from the reference diorama frames: an eleven-step warm
     * sand ramp from #473622 to #e7d6bb, in which even the sea is desaturated
     * almost to grey. */
    const D = {
      sand: "#d8c9a8",
      sandDeep: "#cdbb98",
      veg: "#bcbd9a",
      sea: "#bcccc4",
      road: "#e7dcc4",
      roadCase: "#cbb997",
    };

    /* Each rule: which layers it claims, and the paint it sets. `hide` drops the
     * layer entirely for the duration of 3D. */
    const BASEMAP_RULES = [
      { on: (l) => l.type === "background", paint: { "background-color": D.sand } },
      { on: (l) => l["source-layer"] === "landcover", paint: { "fill-color": D.veg } },
      { on: (l) => l["source-layer"] === "landuse", paint: { "fill-color": D.sandDeep } },
      { on: (l) => l["source-layer"] === "park", paint: { "fill-color": D.veg } },
      { on: (l) => l["source-layer"] === "water" && l.type === "fill", paint: { "fill-color": D.sea } },
      { on: (l) => l["source-layer"] === "waterway", paint: { "line-color": D.sea } },
      {
        on: (l) => l["source-layer"] === "transportation" && l.type === "line",
        // Casings read as the darker edge of a road cut into sand; fills as the
        // pale track surface. /case/ is an id test, but only to pick between two
        // tones — if CARTO renames it the roads still recolour, just uniformly.
        paint: (l) => ({ "line-color": /case/.test(l.id) ? D.roadCase : D.road }),
      },
      // Our own extrusions already draw every building inside the board, and
      // Positron's flat fill would show through them as grey patches.
      { on: (l) => l["source-layer"] === "building", hide: true },
      { on: (l) => l["source-layer"] === "boundary", hide: true },
      /* Hidden, not recoloured. Two reasons, one practical and one aesthetic.
       *
       * Practical: MapLibre draws symbols after the translucent pass whatever
       * the layer order says, so the board mask cannot cover them — place names
       * from the next village along kept printing across the table. Dropping
       * the mask below opacity 1 fixes lines bleeding through, but not symbols.
       *
       * Aesthetic: the reference diorama carries no text at all, and this file
       * already hides its OWN monument labels in 3D (css `body.is-3d
       * .g-mon-label`). Hiding CARTO's is the same decision applied evenly.
       * Nothing is lost — every name is one tap away in the sheet. */
      { on: (l) => l.type === "symbol", hide: true },
    ];

    /* id -> { paint: {prop: originalValue}, visibility: originalOrUndefined } */
    let basemapCache = null;

    function applyDiorama() {
      if (basemapCache) return; // already applied
      const cache = new Map();
      let matched = 0;
      let layers;
      try { layers = map.getStyle().layers || []; } catch (_) { return; }

      for (const l of layers) {
        // Never touch our own layers — they are not the basemap.
        if (OWN_LAYERS.has(l.id)) continue;
        const rule = BASEMAP_RULES.find((r) => {
          try { return r.on(l); } catch (_) { return false; }
        });
        if (!rule) continue;
        const entry = { paint: {}, visibility: undefined, hadVisibility: false };
        try {
          if (rule.hide) {
            entry.visibility = map.getLayoutProperty(l.id, "visibility");
            entry.hadVisibility = true;
            map.setLayoutProperty(l.id, "visibility", "none");
          } else {
            const paint = typeof rule.paint === "function" ? rule.paint(l) : rule.paint;
            for (const prop of Object.keys(paint)) {
              entry.paint[prop] = map.getPaintProperty(l.id, prop);
              map.setPaintProperty(l.id, prop, paint[prop]);
            }
          }
          cache.set(l.id, entry);
          matched++;
        } catch (_) {
          /* One awkward layer must not abort the pass; it simply stays as it was. */
        }
      }

      /* Fail soft. A handful of matches means CARTO's schema moved under us, and
       * a half-recoloured basemap looks broken in a way the original never did.
       * Roll back and keep today's map. */
      if (matched < 20) {
        for (const [id, entry] of cache) restoreLayer(id, entry);
        console.warn(`[guide] basemap recolour matched only ${matched} layers — leaving the basemap as shipped`);
        return;
      }
      basemapCache = cache;
    }

    function restoreLayer(id, entry) {
      try {
        if (entry.hadVisibility) {
          // undefined is the correct restore for "was never set" — it resets
          // the layer to the style default rather than pinning it to "visible".
          map.setLayoutProperty(id, "visibility", entry.visibility);
        }
        for (const prop of Object.keys(entry.paint)) {
          map.setPaintProperty(id, prop, entry.paint[prop]);
        }
      } catch (_) { /* layer gone; nothing to restore */ }
    }

    function clearDiorama() {
      if (!basemapCache) return;
      for (const [id, entry] of basemapCache) restoreLayer(id, entry);
      basemapCache = null;
    }

    /* ---------- Fake cast shadows ----------
     *
     * MapLibre 5.24 renders NO shadows: no shadow map, no ambient occlusion,
     * no `cast-shadows` property. (Verified against the vendored bundle — the
     * only "shadow" hits in it are hillshade colours, hillshade uniforms and
     * Canvas2D/DOM APIs.) So the long soft shadows that make a miniature read
     * as a physical object have to be drawn by hand.
     *
     * The trick: draw each footprint a second time as a flat dark fill, offset
     * away from the sun, underneath the extrusion. It is not a real projection
     * — a tall block and a low one cast the same length — but at these zooms
     * the eye reads it as contact with the ground, which is the whole job.
     *
     * fill-translate is in PIXELS, so a fixed offset would shrink in ground
     * terms every time you zoom in. shadowOffset() converts SHADOW_M into
     * pixels for the current zoom, and the zoom handler below re-applies it. */
    function shadowOffset() {
      const lat = map.getCenter().lat;
      // Web-mercator ground resolution at this latitude and zoom.
      const mPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
      const px = SHADOW_M / mPerPx;
      // Shadows fall AWAY from the light, hence +180.
      const bearing = ((SUN_AZIMUTH + 180) * Math.PI) / 180;
      // +x east, +y south (screen-down is south in the map-anchored frame).
      return [px * Math.sin(bearing), -px * Math.cos(bearing)];
    }

    const SHADOW_LAYERS = [
      /* Tier 1 only. Buildings and rock are both stacks now, so without the
       * filter every tier laid down its own offset copy and the shadows piled
       * up several deep — darker, and fringed where the tiers differ. */
      { id: "shadow-context", source: "context", filter: ["==", ["get", "tier"], 1] },
      { id: "shadow-monument", source: "footprints", filter: ["==", ["get", "tier"], 1] },
    ];

    function addShadowLayers(beforeId) {
      for (const s of SHADOW_LAYERS) {
        if (map.getLayer(s.id) || !map.getSource(s.source)) continue;
        const def = {
          id: s.id,
          type: "fill",
          source: s.source,
          paint: {
            "fill-color": "#7d6144",
            "fill-opacity": 0.22,
            "fill-translate": shadowOffset(),
            /* "map", not the default "viewport": the sun is fixed to the world
             * (setLight anchor is also "map"), so the shadow has to rotate with
             * the map. With "viewport" it would swing around as you spin. */
            "fill-translate-anchor": "map",
          },
        };
        if (s.filter) def.filter = s.filter;
        // beforeId puts the shadows UNDER the massing they belong to.
        if (beforeId && map.getLayer(beforeId)) map.addLayer(def, beforeId);
        else map.addLayer(def);
      }
      refreshShadowOffset();
    }

    function setShadowVisibility(v) {
      for (const s of SHADOW_LAYERS) {
        if (map.getLayer(s.id)) {
          try { map.setLayoutProperty(s.id, "visibility", v); } catch (_) { /* noop */ }
        }
      }
    }

    function setDioramaVisibility(v) {
      for (const id of ["diorama-hillshade", "board-mask", "board-edge", "palms",
                        "sea-waves", "sea-surf-0", "sea-surf-1", "sea-surf-2"]) {
        if (map.getLayer(id)) {
          try { map.setLayoutProperty(id, "visibility", v); } catch (_) { /* noop */ }
        }
      }
    }

    function refreshShadowOffset() {
      const off = shadowOffset();
      for (const s of SHADOW_LAYERS) {
        if (map.getLayer(s.id)) {
          try { map.setPaintProperty(s.id, "fill-translate", off); } catch (_) { /* noop */ }
        }
      }
    }

    /* The town and the granite: everything that is not a cited monument.
     *
     * These heights are NOMINAL. OpenStreetMap records a real height for one
     * of the 129 buildings in this bbox and levels for none of them, so the
     * blocks are a convention, not a survey — see the header of
     * scripts/fetch-context-massing.js. That is why they are painted to read
     * as scene-setting and never as measurement: flat matte paper tones, no
     * vertical gradient, held under the monument stone in both value and
     * opacity, and labelled in the provenance line under the map.
     *
     * The separation is load-bearing, not taste. If these ever start reading
     * as authoritative as the monuments, the fix is the data, not the paint. */
    function addContextMassing(ctx) {
      if (!ctx || !ctx.features || !ctx.features.length) return;
      if (map.getSource("context")) return;
      map.addSource("context", { type: "geojson", data: ctx });
      /* Rock and buildings are separate layers, and the split is forced by the
       * vertical gradient rather than by taste. The gradient is what stops 119
       * flat tan buildings reading as paper cutouts, but it becomes visible
       * BANDING at every tier line once base > 0 — the same trap documented on
       * the monument layer below. Rock is now stacked tiers, so it needs the
       * gradient off; buildings still sit at base 0 and want it on. One layer
       * cannot do both. */
      map.addLayer({
        id: "rock-extrusion",
        type: "fill-extrusion",
        source: "context",
        filter: ["==", ["get", "kind"], "rock"],
        paint: {
          // Granite: greyer, cooler and lighter than the rendered town, and
          // lighter than it used to be — dark brown read as earth, not stone.
          "fill-extrusion-color": "#b6ac99",
          "fill-extrusion-height": ["get", "top_m"],
          "fill-extrusion-base": ["get", "base_m"],
          "fill-extrusion-opacity": 0.95,
          "fill-extrusion-vertical-gradient": false,
        },
      });
      map.addLayer({
        id: "context-extrusion",
        type: "fill-extrusion",
        source: "context",
        filter: ["==", ["get", "kind"], "building"],
        paint: {
          "fill-extrusion-color": [
            "case",
            // The single building with a surveyed height earns a touch more
            // presence than its 118 nominal neighbours. Small, but it means
            // the honest case is not flattened for the sake of uniformity.
            ["get", "measured"], "#cbbda0",
            "#d9cdb4",
          ],
          "fill-extrusion-height": ["get", "top_m"],
          "fill-extrusion-base": ["get", "base_m"],
          "fill-extrusion-opacity": 0.9,
          "fill-extrusion-opacity-transition": { duration: dur(450) },
          /* OFF now, and it used to be ON. The gradient was doing the work of
           * stopping flat tan boxes reading as paper cutouts — but buildings
           * are stacked since the roof slab was added, so their upper tier has
           * base > 0, and the gradient turns into visible banding exactly at
           * the eaves line. The geometry does that job properly now: the
           * oversailing roof gives a real horizontal break for the light to
           * catch, which is what the gradient was only faking. */
          "fill-extrusion-vertical-gradient": false,
        },
      });
      hasContext = true;
    }

    function enable3D() {
      if (!assets3D) {
        /* Both massings load together, but the context (town + granite) is
         * allowed to fail on its own: it is scene-setting, and losing it must
         * not cost the monuments, which are the actual point of the view. */
        assets3D = Promise.all([
          fetch("data/mahabalipuram-footprints.geojson").then((r) => {
            if (!r.ok) throw new Error(`footprints: HTTP ${r.status}`);
            return r.json();
          }),
          fetch("data/mahabalipuram-context.geojson")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("data/mahabalipuram-scenery.geojson")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ])
          .then(([fc, ctx, scenery]) => {
            // Added first so it sits UNDER the monuments in layer order.
            addContextMassing(ctx);
            map.addSource("footprints", { type: "geojson", data: fc });
            // Both sources exist now, so the shadows can go in beneath them.
            addShadowLayers("rock-extrusion");
            /* Order matters and reads bottom-up: hillshade paints the ground,
             * the board masks everything outside the site, then the shadows and
             * the massing sit on top. "park-fill" is our lowest existing layer. */
            addHillshade("park-fill");
            // Sea detail sits above CARTO's water but below the board mask, so
            // the table still covers the sea outside the site.
            addSea("park-fill");
            addBoard("park-fill");
            // Last, so palms stand in front of the massing they grow beside.
            addPalms(scenery);
            map.addLayer({
              id: "footprint-line",
              type: "line",
              source: "footprints",
              // Tier 1 only. Every tier lives in this source, so without the
              // filter the ground gains a set of concentric ghost outlines.
              filter: ["==", ["get", "tier"], 1],
              layout: { "line-join": "round" },
              paint: { "line-color": "#8c6a2a", "line-width": 1.2, "line-opacity": 0.55 },
            });
            map.addLayer({
              id: "monument-extrusion",
              type: "fill-extrusion",
              source: "footprints",
              paint: {
                /* Two stones, keyed off the existing `form` property, sampled
                 * from the reference photographs: the rathas are pale granite
                 * in full sun, the boulder a greyer unworked stone. All sit
                 * between --paper-deep and --gold-deep, and none competes with
                 * --gold-page, which owns the route line and the pins.
                 *
                 * Deliberately NOT ramped by tier: a lightening ramp would read
                 * the steps out nicely and would also look like the tiers encode
                 * a quantity. The step separation already comes free — top caps
                 * and side walls take different normal paths in the shader, so
                 * they are tonally distinct under setLight({anchor:"map"}). */
                "fill-extrusion-color": [
                  "match", ["get", "form"],
                  "monolith", "#c9ac7e",
                  "structural", "#9a8d78",
                  "boulder", "#b09b7d",
                  "#96836a",
                ],
                // Metres ABOVE THE TERRAIN SURFACE — the shader adds terrain
                // elevation itself. Do not add it here.
                "fill-extrusion-height": ["get", "top_m"],
                /* Tier 1 is always 0, asserted at build time. The shader grants
                 * the 10 m downward skirt that closes the gap under a block on
                 * a slope ONLY when base is 0. Upper tiers have base > 0 and
                 * need no skirt — they rest on the tier below, and every tier
                 * of one monument samples terrain at nearly the same point
                 * (asserted within 2 m), so a stack tilts as one object. */
                "fill-extrusion-base": ["get", "base_m"],
                /* Must stay 1: at opacity 1 the painter takes a single
                 * depth-sorted pass. Below 1 it falls back to a depth prepass
                 * plus stencil — still correct for stacked tiers, but two
                 * passes for nothing. */
                "fill-extrusion-opacity": 1,
                "fill-extrusion-opacity-transition": { duration: dur(450) },
                /* NOT a no-op any more, now that tiers give base > 0. The
                 * shader's clamp((t + base) * pow(height/150, 0.5), 0.868, 1)
                 * term pins the ground tier's SIDE walls to the lower bound and
                 * every upper tier's to 1.0 — a ~15% brightness step at exactly
                 * the storey lines, which a reader would take for information.
                 * Leave this false. */
                "fill-extrusion-vertical-gradient": false,
              },
            });
            // anchor:"map" fixes the sun to the world, so rotating actually
            // moves the shading across the rathas. The default is "viewport",
            // which pins the light to the screen and kills the effect.
            try {
              for (const f of fc.features) {
              if (f.properties.tier === 1) footprintByOsm.set(f.properties.id, f.properties);
            }
            /* polar 62 deg, not 40: a raking sun rather than a near-overhead one. It is
             * what separates a top cap from a side wall, and with no ambient occlusion
             * in fill-extrusion that tonal split is the ONLY thing that makes a stack
             * of tiers read as steps instead of as one lump. intensity 0.62 for the
             * same reason — at 0.4 the faces were within a few percent of each other. */
            map.setLight({
              anchor: "map",
              position: [1.5, SUN_AZIMUTH, SUN_POLAR],
              color: "#fff1d4",
              intensity: 0.62,
            });
            } catch (_) { /* older style spec */ }
            return fc;
          });
      }

      /* Terrain is the supporting act, not the point. If the DEM fails the
       * blocks still stand correctly at elevation 0 on a flat plane. */
      if (!map.getSource("dem")) {
        map.addSource("dem", {
          type: "raster-dem",
          tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
          encoding: "terrarium",
          tileSize: 256,
          // app.js caps at 12; z13/14 recover real detail the cap was throwing
          // away. z15 exists but only interpolates — the source is ~30 m.
          maxzoom: 14,
          attribution: "Terrain: Mapzen/AWS",
        });
      }
      try { map.setTerrain({ source: "dem", exaggeration: TERRAIN_EXAG }); } catch (_) { /* unsupported */ }
      /* The same coastal DEM tile carries real bathymetry to about -240 m, and
       * terrarium encoding has no clamp. Fog in paper tones hides the far
       * field rather than pretending to fix the geometry. */
      try {
        map.setSky({
          "sky-color": "#dfe8f0",
          "horizon-color": "#efe6d6",
          "fog-color": "#f3ebdc",
          "sky-horizon-blend": 0.7,
          "horizon-fog-blend": 0.4,
          "fog-ground-blend": 0.5,
        });
      } catch (_) { /* no sky support */ }

      if (map.getLayer("monument-extrusion")) {
        map.setLayoutProperty("monument-extrusion", "visibility", "visible");
        map.setLayoutProperty("footprint-line", "visibility", "visible");
      }
      if (hasContext) {
        map.setLayoutProperty("context-extrusion", "visibility", "visible");
        map.setLayoutProperty("rock-extrusion", "visibility", "visible");
      }
      setShadowVisibility("visible");
      setDioramaVisibility("visible");
      applyDiorama();
      map.easeTo({ pitch: PITCH_3D, duration: dur(900) });

      assets3D.catch((err) => {
        // Tilt and terrain still worked — say what's missing, don't fail silently.
        setSheet(
          "3D view",
          `<p class="g-note">The monument shapes could not load (${esc(err.message)}). The tilt and the
           hill relief still work — the monuments are shown as flat pins.</p>`
        );
      });
    }

    /* The disclosure surface for the 3D blocks. It is not optional polish:
     * four of the five extruded monuments (the rathas) are not in
     * content/mahabalipuram-monuments.js at all, so this is the ONLY detail
     * card they have. */
    function showMassing(p) {
      const rows = [
        ["Height", `${p.total_m} m`],
        ["What that measures", p.measure],
        ["Storeys", `${p.documentedTiers} (documented)`],
      ].filter(([, v]) => v);

      const caveat =
        p.roof === "boulder"
          ? `<p class="g-note"><strong>Massing, not a model.</strong> A real OpenStreetMap outline and a
             published height. A boulder has no storeys — the rounded top is shown as two extra steps for
             shape only. Krishna's Butterball rests on a small contact patch, and an extrusion cannot be
             undercut, so its base is drawn at full width.</p>`
          : p.roof === "hut"
          ? `<p class="g-note"><strong>Massing, not a model.</strong> A real OpenStreetMap outline, a published
             height, and one documented storey. The curved hut roof is shown as one extra step for shape
             only — it is not a storey.</p>`
          : `<p class="g-note"><strong>Massing, not a model.</strong> A real OpenStreetMap outline, a published
             height, and a documented count of ${esc(String(p.documentedTiers))} storeys. Where each step sits
             and how far it steps in are drawn to look like the building — they are not measured. The carving,
             the finial and the true plan of each storey are not in this geometry.</p>`;

      setSheet(
        p.name,
        `<dl class="g-rows">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
          caveat +
          `<p class="g-note">The outline is wider than the published plan — these OpenStreetMap ways trace the
           plinth or the surrounding rock, not the wall line.</p>` +
          (p.source ? `<p><a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">Height source →</a></p>` : "") +
          (p.tiersSource ? `<p class="g-note">Storeys: ${esc(p.tiersSource)}</p>` : "") +
          // The rathas now have full monument cards too; link the two together
          // rather than leaving a reader with two unconnected views.
          (monByOsm.has(p.id)
            ? `<p><button class="g-linkish" type="button" data-stop="${esc(monByOsm.get(p.id).id)}">About this monument →</button></p>`
            : "")
      );
    }

    map.on("click", "monument-extrusion", (e) => {
      if (!is3D || !e.features || !e.features.length) return;
      showMassing(e.features[0].properties);
    });
    map.on("mouseenter", "monument-extrusion", () => {
      if (is3D) map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "monument-extrusion", () => {
      map.getCanvas().style.cursor = "";
    });

    function disable3D() {
      try { map.setTerrain(null); } catch (_) { /* noop */ }
      if (map.getLayer("monument-extrusion")) {
        map.setLayoutProperty("monument-extrusion", "visibility", "none");
        map.setLayoutProperty("footprint-line", "visibility", "none");
      }
      if (hasContext) {
        map.setLayoutProperty("context-extrusion", "visibility", "none");
        map.setLayoutProperty("rock-extrusion", "visibility", "none");
      }
      setShadowVisibility("none");
      setDioramaVisibility("none");
      clearDiorama();
      map.easeTo({ pitch: 0, duration: dur(700) });
    }

    if (threeDBtn) {
      threeDBtn.addEventListener("click", () => {
        is3D = !is3D;
        threeDBtn.setAttribute("aria-pressed", String(is3D));
        // Hides the monument name labels — under pitch, eight opaque uppercase
        // labels stacked toward the horizon is what actually makes the view
        // unreadable. The numbered gold pins survive fine.
        document.body.classList.toggle("is-3d", is3D);
        if (is3D) enable3D();
        else disable3D();
        updateHash();
      });
    }

    /* ---------- Routes ---------- */
    function setRoute(id) {
      activeRoute = id ? routeDefs.find((r) => r.id === id) || null : null;
      const feats = activeRoute ? routes.features.filter((f) => f.properties.route === activeRoute.id) : [];
      const src = map.getSource("route");
      if (src) src.setData({ type: "FeatureCollection", features: feats });

      for (const btn of routeBarEl.querySelectorAll("[data-route]")) {
        btn.setAttribute("aria-pressed", String(Boolean(activeRoute) && btn.dataset.route === activeRoute.id));
      }
      renderMonumentMarkers();

      if (activeRoute) {
        const coords = feats.flatMap((f) => f.geometry.coordinates);
        if (coords.length) {
          const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
          /* Not map.fitBounds(): cameraForBounds defaults bearing to 0, so a
           * plain fitBounds silently snaps a rotated map back to north. Its
           * zoom math also has no pitch term, hence the backoff. */
          const cam = map.cameraForBounds(b, { padding: fitPadding(), bearing: map.getBearing() });
          if (cam) {
            map.easeTo({
              ...cam,
              zoom: is3D ? cam.zoom - PITCH_ZOOM_BACKOFF : cam.zoom,
              pitch: is3D ? PITCH_3D : 0,
              duration: dur(900),
            });
          }
        }
        showRouteList();
      } else {
        setSheet("", "");
      }
      updateHash();
    }

    // Keep the fitted content clear of the sheet (mobile) or the rail (desktop).
    // In 3D the far half of the view runs to the horizon, so the top is what
    // gets clipped — give it more room.
    const fitPadding = () => {
      const base =
        window.innerWidth < 820
          ? { top: 90, bottom: 300, left: 30, right: 30 }
          : { top: 90, bottom: 90, left: 400, right: 60 };
      return is3D ? { ...base, top: base.top + 120 } : base;
    };
    // Under pitch the screen centre sits higher up the view, so a target
    // needs pushing further from the sheet than it does flat.
    const centreOffset = () =>
      window.innerWidth < 820 ? [0, is3D ? -90 : -40] : [0, 0];

    function showRouteList() {
      const r = activeRoute;
      const items = r.stops
        .map((s, i) => {
          const m = monById.get(s.monument);
          if (!m) return "";
          const auto = s.travel === "auto";
          return `<li>
            <button class="g-stop" type="button" data-stop="${esc(m.id)}">
              <span class="g-stop-num">${i + 1}</span>
              <span class="g-stop-text">
                <b>${esc(m.title)}</b>
                <em>${esc(m.when)}${auto ? " · by auto-rickshaw" : ""}</em>
                ${s.note ? `<small>${esc(s.note)}</small>` : ""}
              </span>
            </button></li>`;
        })
        .join("");
      setSheet(r.label, `<p class="g-blurb">${esc(r.blurb)}</p><ol class="g-stops">${items}</ol>`);
    }

    /* ---------- Detail ---------- */
    function showStop(id) {
      const m = monById.get(id);
      if (!m) {
        // With 23 shareable ids a stale #stop= link is likely enough to deserve
        // an answer rather than a silent no-op.
        setSheet("Not found", `<p class="g-note">That monument isn’t in the guide.</p>`);
        return;
      }
      const lngLat = coordFor(id);
      const rows = [
        ["Period", m.when],
        ["Ticket", m.ticketed ? "Covered by the ASI ticket" : "Free to enter"],
      ];
      const height = heightFor(m.osm);
      if (height) rows.push(["Height", `${height.total_m} m`]);

      // Children (the five rathas under Pancha Rathas) and the reverse link.
      const kids = monuments.filter((x) => x.partOf === m.id);
      const parent = m.partOf ? monById.get(m.partOf) : null;

      const body =
        `<p class="g-lede">${esc(m.text)}</p>` +
        // The box is reserved ONLY when a photo is actually expected, so a
        // monument with no article never shows an empty frame.
        (m.photo ? `<figure class="g-photo" data-photo></figure>` : "") +
        `<dl class="g-rows">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` +
        /* Road directions, handed off to Google Maps.
         *
         * Deliberately delegated. This guide draws its own routes from the OSM
         * FOOTPATH network, which is the right answer for walking between
         * monuments once you are on site — but it is the wrong tool for getting
         * here by road from wherever you happen to be, which needs live traffic,
         * the whole road network and your current position. Google already does
         * that; duplicating it badly would help nobody.
         *
         * The destination is the monument's real OSM coordinate, in Maps' own
         * lat,lng order. Nothing about the visitor is sent — the link carries a
         * destination and nothing else. */
        (lngLat
          ? `<p><a class="g-directions" href="https://www.google.com/maps/dir/?api=1&destination=${lngLat[1]},${lngLat[0]}&travelmode=driving" target="_blank" rel="noopener">Road directions on Google Maps →</a></p>`
          : "") +
        (m.detail || []).map((t) => `<p>${esc(t)}</p>`).join("") +
        (m.photo
          ? ""
          : `<p class="g-note">This monument has no Wikipedia article of its own, so the guide has no photograph for it.</p>`) +
        (kids.length
          ? `<p class="g-note">The five monoliths:</p><ol class="g-stops">${kids
              .map((k) => `<li><button class="g-stop" type="button" data-stop="${esc(k.id)}"><span class="g-stop-text"><b>${esc(k.title)}</b></span></button></li>`)
              .join("")}</ol>`
          : "") +
        (parent ? `<p><button class="g-linkish" type="button" data-stop="${esc(parent.id)}">Part of ${esc(parent.title)} →</button></p>` : "") +
        (m.sources || []).map((s) => `<p class="g-source">${esc(s.text)} — <a href="${esc(s.url)}" target="_blank" rel="noopener">source</a>, accessed ${esc(s.accessed)}</p>`).join("") +
        (m.mapSite ? `<p><a href="index.html#site=${esc(m.mapSite)}">See it on the heritage map →</a></p>` : "") +
        `<p><a href="mahabalipuram.html">Read the full guide →</a></p>`;

      setSheet(m.title, body);
      // Looked up AFTER setSheet, which replaces the body wholesale. render()
      // re-checks isConnected after its await, so opening another card first
      // simply leaves this node detached and the injection no-ops.
      if (photo && m.photo) {
        const slot = sheetBodyEl.querySelector("[data-photo]");
        if (slot) photo.render(slot, [m.wiki], { size: "thumb", alt: m.title, credit: m.photoCredit });
      }
      if (lngLat) map.easeTo({ center: lngLat, zoom: Math.max(map.getZoom(), 17), offset: centreOffset(), duration: dur(650) });
      updateHash({ stop: id });
    }

    function showAmenity(id) {
      const a = amenityById.get(id);
      if (!a) return;
      const meta = CATEGORY_META[a.category];
      const d = a.detail || {};
      const rows = [];
      if (a.kind) rows.push(["Type", a.kind.replace(/_/g, " ")]);
      // Only what OSM actually tagged. A blank is not "yes" — two of the
      // toilets here are tagged wheelchair=no, which is real information.
      if (d.opening_hours) rows.push(["Hours", d.opening_hours]);
      if (d.fee) rows.push(["Fee", d.fee === "yes" ? "Yes" : d.fee === "no" ? "No" : d.fee]);
      if (d.wheelchair) rows.push(["Step-free", d.wheelchair === "yes" ? "Yes" : d.wheelchair === "no" ? "No" : d.wheelchair]);
      if (d.operator) rows.push(["Operator", d.operator]);

      const body =
        (rows.length ? `<dl class="g-rows">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : "") +
        (a.geometryFrom !== "node" ? `<p class="g-note">Shown at the centre of the mapped area.</p>` : "") +
        `<p class="g-note">Community-mapped. <strong>Verify on site.</strong></p>` +
        `<p><a href="https://www.openstreetmap.org/${esc(a.id)}" target="_blank" rel="noopener">${esc(a.id)} on OpenStreetMap →</a></p>`;
      setSheet(a.name || meta.label, body);
      map.easeTo({ center: a.lngLat, zoom: Math.max(map.getZoom(), 17), offset: centreOffset(), duration: dur(650) });
      updateHash({ am: id });
    }

    function setSheet(title, html) {
      sheetBodyEl.innerHTML = title ? `<h2 class="g-sheet-title">${esc(title)}</h2>${html}` : "";
      sheetEl.classList.toggle("is-open", Boolean(title));
      // Always reopen at the peek height: the map is the point, and the
      // reader can expand if they want the whole list.
      sheetEl.classList.remove("is-expanded");
      if (grabBtn) grabBtn.setAttribute("aria-expanded", "false");
      sheetBodyEl.scrollTop = 0;
    }

    if (grabBtn) {
      grabBtn.addEventListener("click", () => {
        const open = sheetEl.classList.toggle("is-expanded");
        grabBtn.setAttribute("aria-expanded", String(open));
        grabBtn.querySelector(".g-grab-text").textContent = open ? "Less" : "More";
      });
    }

    sheetBodyEl.addEventListener("click", (e) => {
      const stop = e.target.closest("[data-stop]");
      if (stop) showStop(stop.dataset.stop);
    });

    /* ---------- Legend ---------- */
    function renderLegend() {
      legendEl.innerHTML = CATEGORY_ORDER.map((c) => {
        const n = osm.counts[c] || 0;
        const meta = CATEGORY_META[c];
        return `<button class="g-cat${n ? "" : " is-empty"}" type="button" data-cat="${c}"
                   aria-pressed="${enabled.has(c) && n > 0}">
          <span class="g-cat-glyph">${svgIcon(meta.icon)}</span>
          <span class="g-cat-label">${esc(meta.label)}</span>
          <span class="g-cat-n">${n || "0"}</span>
        </button>`;
      }).join("");
    }
    legendEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      const c = btn.dataset.cat;
      const n = osm.counts[c] || 0;
      if (!n) {
        setSheet(
          CATEGORY_META[c].label,
          `<p class="g-note"><strong>0 recorded.</strong> ${esc(EMPTY_NOTE[c] || "Nothing of this kind is mapped in OpenStreetMap here.")}</p>`
        );
        return;
      }
      if (enabled.has(c)) enabled.delete(c);
      else enabled.add(c);
      btn.setAttribute("aria-pressed", String(enabled.has(c)));
      storeCategories();
      renderAmenityMarkers();
      updateHash();
    });

    function readStoredCategories() {
      try {
        const raw = localStorage.getItem("guide.cats");
        if (raw) return JSON.parse(raw);
      } catch (_) {
        /* private mode, cleared storage — fall through to the defaults */
      }
      return DEFAULT_ON;
    }
    function storeCategories() {
      try {
        localStorage.setItem("guide.cats", JSON.stringify([...enabled]));
      } catch (_) {
        /* not worth surfacing — the filter still works for this session */
      }
    }

    /* ---------- Provenance ---------- */
    function renderProvenance() {
      const d = new Date(osm.fetched);
      const days = Math.round((Date.now() - d.getTime()) / 86400000);
      const when = d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const stale = days > 180;
      provenanceEl.classList.toggle("is-stale", stale);
      provenanceEl.innerHTML = stale
        ? `Facility locations from OpenStreetMap, fetched ${esc(when)} — over ${Math.floor(days / 30)} months ago and possibly out of date. Check on site. © OpenStreetMap contributors (ODbL).${MASSING_NOTE}`
        : `Facility locations from OpenStreetMap, fetched ${esc(when)}. Community-mapped — check on site. © OpenStreetMap contributors (ODbL).${MASSING_NOTE}`;
    }

    /* ---------- Hash ---------- */
    function updateHash(extra) {
      const parts = {};
      if (activeRoute) parts.route = activeRoute.id;
      parts.d = is3D ? "1" : "0";
      if (enabled.size) parts.cats = [...enabled].join(",");
      Object.assign(parts, extra || {});
      const q = Object.entries(parts)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join("&");
      history.replaceState(null, "", q ? `#${q}` : location.pathname);
    }
    function restoreFromHash() {
      const h = Object.fromEntries(
        location.hash.replace(/^#/, "").split("&").filter(Boolean).map((p) => {
          const [k, ...rest] = p.split("=");
          return [k, decodeURIComponent(rest.join("="))];
        })
      );
      if (h.cats) {
        enabled = new Set(h.cats.split(",").filter((c) => CATEGORY_META[c]));
        renderLegend();
        renderAmenityMarkers();
      }
      // After the route restore, so fitBounds runs with the right pitch set.
      /* The map opens in 3D. `d` in the hash always wins, so a shared link to a
       * deliberately flattened view stays flat ("d=0") and one to a tilted view
       * stays tilted ("d=1"); the default only applies when the link says
       * nothing either way. */
      const want3D = h.d === undefined ? DEFAULT_3D : h.d === "1";
      if (want3D && threeDBtn && !is3D) threeDBtn.click();
      if (h.route) setRoute(h.route);
      if (h.stop) showStop(h.stop);
      else if (h.am) showAmenity(h.am);
    }

    routeBarEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-route]");
      if (!btn) return;
      setRoute(activeRoute && activeRoute.id === btn.dataset.route ? null : btn.dataset.route);
    });

    /* rAF-coalesced by replacing the pending frame rather than latching a
     * boolean — a frame that never lands in a backgrounded tab would otherwise
     * leave the pass switched off permanently. */
    let declutterFrame = 0;
    map.on("move", () => {
      cancelAnimationFrame(declutterFrame);
      declutterFrame = requestAnimationFrame(declutter);
    });

    /* The tilt-shift blur is suspended while the camera moves.
     *
     * A PRECAUTION, not a measured fix — and the distinction is worth recording
     * so nobody later "optimises" it away on the strength of a number that was
     * never real. backdrop-filter over a WebGL canvas is a known cost, but this
     * dev environment cannot resolve it: four pans under identical conditions
     * gave 20.2 / 12.3 / 16.2 / 16.2 fps, a spread wider than any effect being
     * measured. So the honest position is that the cost is unquantified here.
     *
     * Suspending it is still right on principle: the miniature effect only has
     * to exist when someone is LOOKING at the frame, nobody studies a scene
     * mid-drag, and doing strictly less work during motion cannot be slower.
     * If it ever needs proving, profile on a real phone, not here.
     *
     * The short delay after moveend is deliberate: re-enabling the filter on the
     * frame the camera stops shows a hitch on the last easing frames. */
    let blurTimer = 0;
    map.on("movestart", () => {
      clearTimeout(blurTimer);
      document.body.classList.add("no-tiltshift");
    });
    map.on("moveend", () => {
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => document.body.classList.remove("no-tiltshift"), 180);
    });

    /* Same coalescing shape, separate frame: the shadow offset only depends on
     * zoom and latitude, so it does not need to run on every pan the declutter
     * pass handles. */
    let shadowFrame = 0;
    map.on("zoom", () => {
      if (!is3D) return;
      cancelAnimationFrame(shadowFrame);
      shadowFrame = requestAnimationFrame(refreshShadowOffset);
    });

    /* The backstop for the declutter pass: everything culled from the map is
     * still one tap away here, so a pin hidden at low zoom is never lost. This
     * is what makes culling defensible rather than a quiet removal. */
    if (allBtn) {
      allBtn.addEventListener("click", () => {
        const groups = monuments.filter((m) => !m.partOf);
        const rowFor = (m) =>
          `<li><button class="g-stop" type="button" data-stop="${esc(m.id)}">` +
          `<span class="g-stop-text"><b>${esc(m.title)}</b><em>${esc(m.when)}</em></span></button></li>`;
        const html = groups
          .map((m) => {
            const kids = monuments.filter((k) => k.partOf === m.id);
            return rowFor(m) + kids.map((k) => `<li class="g-stop-child">${rowFor(k).slice(4, -5)}</li>`).join("");
          })
          .join("");
        setSheet(`All ${monuments.length} monuments`, `<ol class="g-stops">${html}</ol>`);
      });
    }

    renderLegend();
    renderProvenance();

    return { setRoute, showStop, showAmenity, map };
  }

  const emptyFC = () => ({ type: "FeatureCollection", features: [] });

  return { create };
})();
