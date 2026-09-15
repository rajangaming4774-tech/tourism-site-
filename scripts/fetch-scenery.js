#!/usr/bin/env node
/* Decorative planting for the 3D diorama view.
 *
 * WHAT IS TRUE HERE AND WHAT IS NOT
 * ---------------------------------
 * OpenStreetMap maps ZERO individual trees inside the Mahabalipuram core
 * (checked 6 September 2026: `node["natural"="tree"]` returns nothing). So
 * there is no honest way to draw a tree where a tree actually stands.
 *
 * What OSM DOES map is which ground is vegetated: `landuse=grass`,
 * `leisure=park`, `leisure=garden`, `natural=scrub` and friends. This script
 * scatters palms strictly INSIDE those polygons. The claim the map ends up
 * making — "this ground is vegetated" — is therefore true and sourced. The
 * individual trunk positions are invented, and every feature says so with
 * `decorative: true`, as does the provenance line under the map.
 *
 * That line matters. Scattering palms across the whole board would look closer
 * to the reference and would be a lie a visitor could act on: shade that is not
 * there. Confining them to real vegetation keeps the ornament honest.
 *
 * The scatter is SEEDED and therefore reproducible: re-running without a data
 * change reproduces the committed file byte for byte, so a diff means the world
 * changed, not that the random number generator did.
 *
 * Usage:  node scripts/fetch-scenery.js
 * Output: data/mahabalipuram-scenery.geojson
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "mahabalipuram-scenery.geojson");

const CORE = [12.6, 80.179, 12.631, 80.201];
const UA = "india-heritage-map/1.0 (static site build script; contact via repo)";
const ENDPOINT = "https://overpass-api.de/api/interpreter";

const SEED = 20260906; // bump only if you intend the planting to change
const DENSITY_M2 = 420; // one palm per this many square metres of vegetation
const MIN_SPACING_M = 7; // trunks closer than this look like a hedge, not palms
const MAX_PER_POLYGON = 40; // keeps one huge polygon from swamping the scene

const QUERY = `[out:json][timeout:120];
(
  way["landuse"~"^(grass|forest|meadow|village_green|orchard)$"](${CORE.join(",")});
  way["leisure"~"^(park|garden)$"](${CORE.join(",")});
  way["natural"="scrub"](${CORE.join(",")});
);
out geom tags;`;

/* mulberry32 — a small, fast, fully deterministic PRNG. Math.random() would
 * make the committed file churn on every run. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ringOf(el) {
  if (!el.geometry || el.geometry.length < 3) return null;
  const pts = el.geometry.map((p) => [p.lon, p.lat]);
  const f = pts[0];
  const l = pts[pts.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) pts.push([f[0], f[1]]);
  return pts.length >= 4 ? pts : null;
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const hit = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

/* Planar area in m^2 — fine at this scale (the bbox is ~2.4 x 3.4 km). */
function areaM2(ring, lat) {
  const mPerDegLat = 110574;
  const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2) * mPerDegLat * mPerDegLng;
}

async function overpass(q) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    body: "data=" + encodeURIComponent(q),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return (await res.json()).elements || [];
}

(async () => {
  console.log("Fetching vegetation polygons from Overpass…");
  const els = await overpass(QUERY);
  console.log(`  ${els.length} vegetated polygons`);

  const rand = rng(SEED);
  const features = [];
  let totalArea = 0;

  // Sorted by id so element order from Overpass cannot change the output.
  els.sort((a, b) => a.id - b.id);

  for (const el of els) {
    const ring = ringOf(el);
    if (!ring) continue;
    const tags = el.tags || {};
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const p of ring) {
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
      y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
    }
    const lat = (y0 + y1) / 2;
    const area = areaM2(ring, lat);
    totalArea += area;
    const want = Math.min(MAX_PER_POLYGON, Math.floor(area / DENSITY_M2));
    if (want < 1) continue;

    const mPerDegLat = 110574;
    const mPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
    const placed = [];
    // Rejection sampling with a hard attempt cap — a thin sliver polygon can
    // otherwise spin forever failing the spacing test.
    for (let attempt = 0; attempt < want * 60 && placed.length < want; attempt++) {
      const p = [x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0)];
      if (!pointInRing(p, ring)) continue;
      let ok = true;
      for (const q of placed) {
        const dx = (p[0] - q[0]) * mPerDegLng;
        const dy = (p[1] - q[1]) * mPerDegLat;
        if (Math.hypot(dx, dy) < MIN_SPACING_M) { ok = false; break; }
      }
      if (!ok) continue;
      placed.push(p);
      features.push({
        type: "Feature",
        properties: {
          kind: "palm",
          decorative: true,
          within: `way/${el.id}`,
          // Carried through so the map can vary sprite size slightly and so a
          // reader can see WHICH real tag justified planting here.
          landcover: tags.landuse || tags.leisure || tags.natural || "vegetation",
          size: 0.8 + Math.round(rand() * 40) / 100,
        },
        geometry: { type: "Point", coordinates: [+p[0].toFixed(6), +p[1].toFixed(6)] },
      });
    }
  }

  if (!features.length) throw new Error("no palms placed — refusing to write an empty file");

  const doc = {
    type: "FeatureCollection",
    note:
      "DECORATIVE. OpenStreetMap maps no individual trees in this area, so these " +
      "positions are invented. What is real is the land cover: every palm falls " +
      "inside a polygon OSM tags as grass, park, garden, scrub or similar, listed " +
      "in each feature's `within` and `landcover`. Do not read a palm as a tree " +
      "that exists at that spot, or as shade.",
    generated: new Date().toISOString().slice(0, 10),
    seed: SEED,
    convention: `1 palm per ${DENSITY_M2} m2, min spacing ${MIN_SPACING_M} m, max ${MAX_PER_POLYGON} per polygon`,
    attribution: "Land cover © OpenStreetMap contributors (ODbL); planting is decorative",
    features,
  };

  fs.writeFileSync(outPath, JSON.stringify(doc, null, 1));
  console.log(
    `wrote ${path.relative(root, outPath)}  ${features.length} palms ` +
      `across ${Math.round(totalArea).toLocaleString()} m2 of mapped vegetation`
  );
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
