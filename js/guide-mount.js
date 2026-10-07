/* Loads the guide's data and mounts the map. Mirrors js/tours-mount.js:
 * defensive guards, no exports, one job.
 *
 * If anything fails — offline, a missing data file, tiles blocked — the page
 * must still be worth having open at the site, so the map container is
 * replaced with a readable text fallback rather than a dead grey box.
 */
(function () {
  const el = (id) => document.getElementById(id);
  const mapEl = el("guide-map");
  if (!mapEl || !window.GuideMap) return;

  const monuments = window.MAHABALIPURAM_MONUMENTS;
  const routeDefs = window.MAHABALIPURAM_ROUTES;
  if (!monuments || !routeDefs) return;

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const json = (url) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return r.json();
    });

  Promise.all([
    json("data/mahabalipuram-osm.json"),
    json("data/mahabalipuram-paths.geojson"),
    json("data/mahabalipuram-park.geojson"),
    json("data/mahabalipuram-routes.geojson"),
    // The monuments' own outlines (and water, landcover) — optional: the map
    // is complete without them, they only add the areas under the pins.
    json("data/mahabalipuram-plan.geojson").catch(() => null),
    // Where the numbered parts of a monument stand — optional too.
    json("data/mahabalipuram-part-positions.json").catch(() => null),
  ])
    .then(([osm, paths, park, routes, plan, partPositions]) => {
      if (typeof maplibregl === "undefined") throw new Error("maplibre failed to load");
      const instance = window.GuideMap.create({
        container: "guide-map",
        osm, paths, park, routes, monuments, routeDefs, plan, partPositions,
        legendEl: el("g-legend"),
        sheetEl: el("g-sheet"),
        sheetBodyEl: el("g-sheet-body"),
        provenanceEl: el("g-provenance"),
        routeBarEl: el("g-routes"),
        locateBtn: el("g-locate"),
        grabBtn: el("g-grab"),
        threeDBtn: el("g-tilt"),
        allBtn: el("g-all"),
        // Passed in rather than referenced directly, so guide-map.js stays
        // generic and testable with no network module present.
        photo: window.WikiPhoto || null,
      });
      // Local dev only: gives the console a handle for the checks in the
      // README (querySourceFeatures, queryTerrainElevation).
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        window.__guide = instance;
      }
    })
    .catch((err) => {
      console.error("[guide]", err);
      fallback(err);
    });

  /* The map is the nice version, not the only version. */
  function fallback(err) {
    const stops = routeDefs
      .map((r) => {
        const list = r.stops
          .map((s, i) => {
            const m = monuments.find((x) => x.id === s.monument);
            return m ? `<li><b>${i + 1}. ${esc(m.title)}</b>${s.note ? ` — ${esc(s.note)}` : ""}</li>` : "";
          })
          .join("");
        return `<h3>${esc(r.label)}</h3><p>${esc(r.blurb)}</p><ol>${list}</ol>`;
      })
      .join("");
    mapEl.innerHTML =
      `<div class="g-fallback">
        <h2>Site map unavailable</h2>
        <p>The map could not load${err && err.message ? ` (${esc(err.message)})` : ""}. The walking order is below.</p>
        ${stops}
        <p><a href="mahabalipuram.html">Back to the Mahabalipuram guide →</a></p>
      </div>`;
    mapEl.classList.add("is-fallback");
    const prov = el("g-provenance");
    if (prov) prov.textContent = "Map data © OpenStreetMap contributors (ODbL).";
  }
})();
