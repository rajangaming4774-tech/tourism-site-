// Fetches the Mahabalipuram site data — monuments, visitor facilities, the
// pedestrian path network and the ASI park boundary — from OpenStreetMap via
// the Overpass API, and writes them as committed data files for the on-site
// visitor guide (mahabalipuram-guide.html).
//
// Run: node scripts/fetch-site-data.js
//      node scripts/fetch-site-data.js --offline   (skip the network; just
//                                                   regenerate route geometry
//                                                   from committed data)
//
// WHY THIS BYPASSES scripts/build-data.js:
// that pipeline deliberately scatters co-located markers in a ~1.5 km ring
// (see the de-overlap block there) so national-scale dots stay clickable. At
// this site the whole point is telling a visitor which boulder they are
// standing next to — Mahishasuramardini and Olakkanneshwara are 37 m apart —
// so a 1.5 km jitter would be catastrophic. These coordinates never go
// through it.
//
// WHY OSM AND NOT WIKIDATA: Wikidata's points here are wrong. Varaha Cave is
// ~18 km out (longitude typo) and three separate monuments share one rounded
// placeholder. OSM has correct, distinct points for all eight.
//
// The fetch is build-time, not runtime, because the site's CSP (vercel.json)
// allows connect-src to 'self' and *.cartocdn.com only — a live Overpass call
// from the browser would be blocked, and should be: a guide that silently
// fails to load its toilets when Overpass is down is worse than one shipping
// a known-dated snapshot.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const OFFLINE = process.argv.includes("--offline");

/* Bboxes are [south, west, north, east] — Overpass order.
 * CORE: the walkable site. Facilities and footpaths come from here only.
 * WIDE: reaches Saluvankuppam so Tiger Cave (5.4 km north) is included. */
const CORE = [12.6, 80.179, 12.631, 80.201];
const WIDE = [12.6, 80.179, 12.662, 80.212];
const bbox = (b) => b.join(",");

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const UA = "india-heritage-map/1.0 (static site build script; contact via repo)";

/* One table, one place. The browser never parses OSM tags — it reads the
 * resolved `category` string this script emits — so the two sides cannot
 * drift apart. Categories with no OSM presence here (tickets, lockers) are
 * still declared: the guide shows them as "0 recorded" rather than hiding
 * them, and if OSM gains them tomorrow they appear with no code change. */
const CATEGORIES = [
  "toilets", "water", "parking", "food", "shops",
  "medical", "transport", "money", "info", "shade",
  "tickets", "lockers",
];

function categoryFor(tags) {
  const a = tags.amenity;
  if (a === "toilets") return "toilets";
  if (a === "drinking_water" || a === "fountain") return "water";
  if (a === "parking" || a === "bicycle_parking") return "parking";
  if (["restaurant", "cafe", "fast_food", "ice_cream", "bar"].includes(a)) return "food";
  if (["hospital", "clinic", "doctors", "pharmacy", "first_aid"].includes(a)) return "medical";
  if (["bus_station", "taxi"].includes(a) || tags.highway === "bus_stop") return "transport";
  if (["atm", "bank", "bureau_de_change"].includes(a)) return "money";
  if (a === "shelter" || a === "bench") return "shade";
  if (a === "lockers") return "lockers";
  if (a === "marketplace" || tags.shop) return "shops";
  if (tags.tourism === "information") return "info";
  if (tags.leisure === "park" || tags.leisure === "garden") return "shade";
  return null;
}

/* Some monuments here carry no `historic` or `tourism` tag at all. Ganesha
 * Ratha is mapped only as amenity=place_of_worship + building=temple with a
 * wikipedia tag, so the original predicate dropped it silently and any content
 * entry referencing it would have had coordFor() return null and its pin
 * vanish without an error. The building=temple clause is deliberately gated on
 * a wikipedia/wikidata tag: ungated it would sweep in every modern shrine,
 * mosque and hotel temple in the town. */
/* OSM records a plain `name` for most things here, but not all: two features in
 * this bbox carry ONLY `name:en` — node/4433895791 "Devaneri beach" and
 * node/4453036789 "Mumu Surf Club". Reading tags.name alone wrote them into
 * data/mahabalipuram-osm.json as nameless, which then read as mysterious
 * unidentified records and cost a real investigation to explain. They were
 * never anonymous, just differently tagged. Prefer the local name, fall back to
 * name:en, then to null for things genuinely unnamed. */
function osmName(tags) {
  return tags.name || tags["name:en"] || null;
}

function isMonument(tags) {
  return Boolean(
    tags.historic ||
      ["attraction", "museum", "viewpoint"].includes(tags.tourism) ||
      tags.man_made === "lighthouse" ||
      (tags.building === "temple" && (tags.wikipedia || tags.wikidata))
  );
}

/* ---------- Overpass ---------- */
const QUERY_POIS = `[out:json][timeout:120];
(
  nwr["amenity"~"^(toilets|drinking_water|fountain|parking|bicycle_parking|shelter|bench|lockers|first_aid|restaurant|cafe|fast_food|ice_cream|bar|marketplace|hospital|clinic|doctors|pharmacy|atm|bank|bureau_de_change|bus_station|taxi)$"](${bbox(CORE)});
  nwr["shop"](${bbox(CORE)});
  nwr["tourism"="information"](${bbox(CORE)});
  nwr["highway"="bus_stop"](${bbox(CORE)});
  nwr["leisure"~"^(park|garden)$"](${bbox(CORE)});
  nwr["historic"](${bbox(WIDE)});
  nwr["tourism"~"^(attraction|museum|viewpoint)$"](${bbox(WIDE)});
  // Monuments mapped only as a temple building — Ganesha Ratha is one. Gated
  // on a wikipedia/wikidata tag so this does not sweep in every modern shrine.
  nwr["building"="temple"]["wikipedia"](${bbox(WIDE)});
  nwr["building"="temple"]["wikidata"](${bbox(WIDE)});
  nwr["man_made"="lighthouse"](${bbox(WIDE)});
);
out center tags;`;

/* Every walkable highway type, not just footways. Measured: restricting this
 * to footway/path/service/residential leaves the network in 45 disconnected
 * components (largest 339 of 1766 nodes) because the main street and the ECR
 * are the backbone that joins the clusters — routing between the rathas and
 * the Shore Temple was impossible. Including primary/secondary/tertiary drops
 * it to 4 components, with all seven walkable monuments in the largest one,
 * each within 5–30 m of a way. Motorways are excluded as genuinely unwalkable
 * (there are none in this bbox anyway). */
const QUERY_PATHS = `[out:json][timeout:120];
way["highway"]["highway"!~"^(motorway|motorway_link|construction|proposed)$"](${bbox(CORE)});
out geom;`;

const QUERY_PARK = `[out:json][timeout:120];
(
  way(103163461);
  nwr["boundary"="protected_area"](${bbox(CORE)});
  nwr["heritage"](${bbox(CORE)});
);
out geom tags;`;

async function overpass(query, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 150000);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: new URLSearchParams({ data: query }),
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status === 504) {
        const wait = attempt * 20000;
        console.warn(`  ${label}: HTTP ${res.status}, backing off ${wait / 1000}s (attempt ${attempt}/3)`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements)) throw new Error(`${label}: no elements array`);
      console.log(`  ${label}: ${json.elements.length} elements`);
      return json;
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 3) throw new Error(`${label} failed after 3 attempts: ${err.message}`);
      console.warn(`  ${label}: ${err.message} — retrying`);
      await new Promise((r) => setTimeout(r, attempt * 10000));
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ---------- Load the hand-authored content files (browser globals) ---------- */
function loadGlobalFile(rel, key) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const value = sandbox.window[key];
  if (!value) throw new Error(`${rel} did not define window.${key}`);
  return value;
}

const MONUMENTS = loadGlobalFile("content/mahabalipuram-monuments.js", "MAHABALIPURAM_MONUMENTS");
const HEIGHTS = loadGlobalFile("content/mahabalipuram-heights.js", "MAHABALIPURAM_HEIGHTS");

/* Footprints for the 3D view. The query is built FROM the heights table, so a
 * monument with no cited height is never even fetched — "no citation" and "no
 * polygon" are the same condition, enforced structurally rather than by
 * convention.
 *
 * This is a SEPARATE query from QUERY_POIS on purpose. That one ends with
 * `out center`, and one of its 135 amenities is a relation, which emits no
 * `center` under `out geom` — widening it would drop that facility and would
 * re-derive every lngLat the route graph and the sites.geojson cross-check are
 * built on. */
const EXTRUDABLE = HEIGHTS.filter((h) => h.height != null);
const byOsmId = new Map(EXTRUDABLE.map((h) => [h.osm, h]));
const footprintIds = EXTRUDABLE.map((h) => h.osm.split("/")[1]);
const QUERY_FOOTPRINTS = `[out:json][timeout:60];
way(id:${footprintIds.join(",")});
out geom tags;`;

/* ---------- Geometry helpers ---------- */
const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function metres(a, b) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const la1 = rad(a[1]);
  const la2 = rad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const round6 = (n) => Math.round(n * 1e6) / 1e6;
const inBox = (lng, lat, b) => lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];

/* ---------- Tiered massing geometry ----------
 * The monuments are stepped pyramidal towers, not boxes. Given a footprint
 * ring, a cited total height and a documented storey count, emit one stacked
 * polygon per tier.
 *
 * WHAT IS DOCUMENTED AND WHAT IS NOT: the storey count comes from a citation
 * (`tiers` / `tiersSource` in content/mahabalipuram-heights.js). The vertical
 * split between storeys (`r`) and how far each steps in (`batter`) are
 * STYLISED — tuned by eye against photographs. Steps that are not storeys at
 * all are emitted as tierKind:"cap" so the data itself keeps the distinction.
 */

// Project a ring into local metres about its own mean. Rings here are <= 50 m,
// so the planar approximation is exact to well under a millimetre. Not metres()
// — that returns distances, and this needs signed components.
function localFrame(ring) {
  const pts = ring.slice(0, -1);
  const mLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const mLng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const kx = 111320 * Math.cos(rad(mLat));
  const ky = 110574;
  return {
    xy: pts.map(([lng, lat]) => [(lng - mLng) * kx, (lat - mLat) * ky]),
    toLngLat: ([x, y]) => [round6(mLng + x / kx), round6(mLat + y / ky)],
  };
}

const signedArea = (p) => {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
};

/* The AREA centroid, not the vertex mean. The vertex mean is a mean of nodes,
 * so it drifts toward wherever the mapper happened to put more of them; the
 * area centroid is invariant to node density. */
function areaCentroid(p) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a /= 2;
  if (Math.abs(a) < 1e-9) {
    return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

// The vertex mean exactly as MapLibre computes its terrain sample point
// (distinct vertices; the closing duplicate is skipped).
const vertexMean = (p) => [
  p.reduce((s, q) => s + q[0], 0) / p.length,
  p.reduce((s, q) => s + q[1], 0) / p.length,
];

// Minimum-area bounding rectangle by rotating calipers over the edge
// directions. n <= 28 here, so brute force is free.
function minAreaRect(p) {
  let best = { area: Infinity, long: 0, short: 0, theta: 0 };
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const th = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(-th);
    const s = Math.sin(-th);
    const xs = p.map(([x, y]) => x * c - y * s);
    const ys = p.map(([x, y]) => x * s + y * c);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w * h < best.area) best = { area: w * h, long: Math.max(w, h), short: Math.min(w, h), theta: th };
  }
  return best;
}

/* Step every side in by the same absolute distance `d`, by scaling in the
 * ring's own principal frame.
 *
 * Not plain scaling toward the centroid: on Bhima Ratha (16.0 x 9.1 m) that
 * shortens the block nearly twice as fast as it narrows — the opposite of a
 * wagon roof, and the opposite of a vimana, which steps in about equally on
 * all four sides.
 *
 * Not a true polygon offset either: an offset changes topology, and Arjuna's
 * shortest edge is 2.76 m and the Butterball's 0.55 m, so a 1.4 m offset would
 * eat them. This is an affine map with positive determinant, so it can never
 * self-intersect and it PRESERVES WINDING — side-face normals cannot flip
 * between tiers. */
function insetRing(xy, origin, rect, d) {
  const su = Math.max((rect.long - 2 * d) / rect.long, 0.02);
  const sv = Math.max((rect.short - 2 * d) / rect.short, 0.02);
  const c = Math.cos(-rect.theta);
  const s = Math.sin(-rect.theta);
  const ci = Math.cos(rect.theta);
  const si = Math.sin(rect.theta);
  return xy.map(([x, y]) => {
    const dx = x - origin[0];
    const dy = y - origin[1];
    const u = (dx * c - dy * s) * su;
    const v = (dx * s + dy * c) * sv;
    return [origin[0] + (u * ci - v * si), origin[1] + (u * si + v * ci)];
  });
}

function pointInRing(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/* Per roof form. `r` is the geometric ratio for storey thickness — a Dravidian
 * ground storey is taller than the talas above it, so a uniform split reads
 * wrong. `batter` is the tower's slope in horizontal metres per metre of rise,
 * which makes the silhouette a constant-slope tower stepped at the documented
 * storey lines. `caps` replaces both for forms with one documented storey and
 * a shaped top. Every number here is stylised. */
const ROOF = {
  pyramidal: { r: 0.72, batter: 0.38 },
  barrel: { r: 0.8, batter: 0.21 },
  hut: { caps: [{ top: 0.55, inset: 0 }, { top: 1.0, inset: 0.55 }] },
  boulder: { caps: [{ top: 0.62, inset: 0 }, { top: 0.86, inset: 0.6 }, { top: 1.0, inset: 1.7 }] },
};

function buildTiers(ring, spec) {
  const roof = ROOF[spec.roof];
  if (!roof) throw new Error(`unknown roof form "${spec.roof}" for ${spec.osm}`);
  const H = spec.height;
  const frame = localFrame(ring);
  const xy = frame.xy;
  const rect = minAreaRect(xy);
  const origin = areaCentroid(xy);

  // [cumulative top (m), cumulative inset (m), kind]
  const steps = [];
  if (roof.caps) {
    for (let i = 0; i < roof.caps.length; i++) {
      steps.push([roof.caps[i].top * H, roof.caps[i].inset, i === 0 ? "storey" : "cap"]);
    }
  } else {
    const n = spec.tiers;
    const w = Array.from({ length: n }, (_, i) => Math.pow(roof.r, i));
    const sw = w.reduce((a, b) => a + b, 0);
    let cum = 0;
    for (let i = 0; i < n; i++) {
      cum += (H * w[i]) / sw;
      steps.push([i === n - 1 ? H : cum, roof.batter * (i === 0 ? 0 : steps[i - 1][0]), "storey"]);
    }
  }

  const out = [];
  let base = 0;
  for (let i = 0; i < steps.length; i++) {
    const [top, inset, kind] = steps[i];
    const insetXY = inset > 0 ? insetRing(xy, origin, rect, inset) : xy;
    const lngLat = insetXY.map(frame.toLngLat);
    lngLat.push([...lngLat[0]]);
    const topR = Math.round(top * 1000) / 1000;
    out.push({
      ring: lngLat,
      xy: insetXY,
      tier: i + 1,
      tierKind: kind,
      // Derived from the PREVIOUS tier's already-rounded top, so the
      // contiguity assertion is an exact === and not an epsilon compare.
      base_m: base,
      top_m: topR,
    });
    base = topR;
  }
  return out;
}

function elementCoords(el) {
  if (typeof el.lat === "number") return { lngLat: [round6(el.lon), round6(el.lat)], from: "node" };
  if (el.center) return { lngLat: [round6(el.center.lon), round6(el.center.lat)], from: `${el.type}-center` };
  return null;
}

/* ---------- Main ---------- */
const osmPath = path.join(dataDir, "mahabalipuram-osm.json");
const pathsPath = path.join(dataDir, "mahabalipuram-paths.geojson");
const parkPath = path.join(dataDir, "mahabalipuram-park.geojson");
const footprintsPath = path.join(dataDir, "mahabalipuram-footprints.geojson");

let osmDoc;
let pathsDoc;

if (OFFLINE) {
  console.log("--offline: reusing committed data, regenerating routes and tiers");
  osmDoc = JSON.parse(fs.readFileSync(osmPath, "utf8"));
  pathsDoc = JSON.parse(fs.readFileSync(pathsPath, "utf8"));

  /* Rebuild the tiers from the committed base rings so the taper can be
   * retuned — and the tier assertions exercised — without hitting Overpass.
   * Tier 1 is the un-inset footprint, so it is the base ring. */
  if (fs.existsSync(footprintsPath)) {
    const prev = JSON.parse(fs.readFileSync(footprintsPath, "utf8"));
    const bases = new Map();
    for (const f of prev.features) {
      if (f.properties.tier === 1) bases.set(f.properties.id, f.geometry.coordinates[0]);
    }
    const rebuilt = { ...prev, features: [] };
    for (const h of EXTRUDABLE) {
      const ring = bases.get(h.osm);
      if (!ring) continue;
      const tiers = buildTiers(ring, h);
      for (const t of tiers) {
        rebuilt.features.push({
          type: "Feature",
          properties: {
            id: h.osm, name: h.label, tier: t.tier, tierCount: tiers.length, tierKind: t.tierKind,
            base_m: t.base_m, top_m: t.top_m, total_m: h.height, documentedTiers: h.tiers,
            roof: h.roof, form: h.form, measure: h.measure, source: h.source,
            sourceUrl: h.sourceUrl, tiersSource: h.tiersSource,
          },
          geometry: { type: "Polygon", coordinates: [t.ring] },
        });
      }
    }
    fs.writeFileSync(footprintsPath, JSON.stringify(rebuilt, null, 1));
    console.log(`  rebuilt ${rebuilt.features.length} tiers from committed base rings`);
  }
} else {
  console.log("Fetching from Overpass…");
  const [pois, paths, park, footprints] = [
    await overpass(QUERY_POIS, "pois"),
    await overpass(QUERY_PATHS, "paths"),
    await overpass(QUERY_PARK, "park"),
    await overpass(QUERY_FOOTPRINTS, "footprints"),
  ];

  /* --- amenities + monuments --- */
  const amenities = [];
  const monuments = [];
  const seen = new Set();

  for (const el of pois.elements) {
    const tags = el.tags || {};
    const pos = elementCoords(el);
    if (!pos) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const [lng, lat] = pos.lngLat;

    if (isMonument(tags) && inBox(lng, lat, WIDE)) {
      monuments.push({
        id,
        name: osmName(tags),
        lngLat: pos.lngLat,
        kind: tags.historic || tags.tourism || null,
        wikidata: tags.wikidata || null,
        geometryFrom: pos.from,
      });
    }

    const category = categoryFor(tags);
    // Facilities are CORE-only: an element pulled in by the WIDE monument
    // clauses could also carry amenity=cafe, and a cafe 5 km up the highway
    // is not a facility of this site.
    if (category && inBox(lng, lat, CORE)) {
      const detail = {};
      for (const k of ["fee", "wheelchair", "opening_hours", "operator", "drinking_water", "male", "female", "unisex"]) {
        if (tags[k] !== undefined) detail[k] = tags[k];
      }
      amenities.push({
        id,
        category,
        name: osmName(tags),
        kind: tags.amenity || tags.shop || tags.tourism || tags.leisure || tags.highway || null,
        lngLat: pos.lngLat,
        geometryFrom: pos.from,
        detail,
      });
    }
  }

  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const a of amenities) counts[a.category]++;

  osmDoc = {
    _note: "Generated by scripts/fetch-site-data.js — do not hand-edit.",
    fetched: new Date().toISOString().slice(0, 10),
    source: "OpenStreetMap via Overpass API",
    license: "ODbL 1.0 — © OpenStreetMap contributors",
    bbox: { core: CORE, wide: WIDE },
    query: QUERY_POIS,
    counts,
    monuments,
    amenities,
  };

  /* --- pedestrian network --- */
  pathsDoc = {
    type: "FeatureCollection",
    features: paths.elements
      .filter((w) => Array.isArray(w.geometry) && w.geometry.length > 1)
      .map((w) => ({
        type: "Feature",
        properties: { id: `way/${w.id}`, highway: (w.tags || {}).highway || null, name: (w.tags || {}).name || null },
        geometry: { type: "LineString", coordinates: w.geometry.map((p) => [round6(p.lon), round6(p.lat)]) },
      })),
  };

  /* --- park boundary --- */
  const parkDoc = {
    type: "FeatureCollection",
    features: park.elements
      .filter((w) => Array.isArray(w.geometry) && w.geometry.length > 2)
      .map((w) => ({
        type: "Feature",
        properties: { id: `${w.type}/${w.id}`, name: (w.tags || {}).name || null },
        geometry: { type: "Polygon", coordinates: [w.geometry.map((p) => [round6(p.lon), round6(p.lat)])] },
      })),
  };

  /* --- footprints: real OSM outlines + the cited height, baked together --- */
  const footprintDoc = {
    _note: "Generated by scripts/fetch-site-data.js — do not hand-edit.",
    _heights:
      "Heights are hand-authored in content/mahabalipuram-heights.js and every one carries a source. A monument with no cited height is not in this file.",
    fetched: new Date().toISOString().slice(0, 10),
    license: "Geometry: ODbL 1.0 — © OpenStreetMap contributors",
    type: "FeatureCollection",
    features: footprints.elements
      .filter((w) => Array.isArray(w.geometry) && w.geometry.length > 3)
      .flatMap((w) => {
        const id = `${w.type}/${w.id}`;
        const h = byOsmId.get(id);
        if (!h) return [];
        let ring = w.geometry.map((p) => [round6(p.lon), round6(p.lat)]);
        // Overpass returns a way's nodes in way order; a closed way repeats the
        // first node last, but close it defensively.
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);

        /* Normalise winding. Side-face normals derive from ring direction, so
         * a ring wound the other way lights inside-out — and the committed
         * rings were split (Shore Temple CCW, the five rathas CW), meaning one
         * group was already wrong before any tiering. CW (negative signed area
         * in lng/lat) is the majority here and is what the render was tuned
         * against; verified in the browser with
         *   __guide.map.setLight({anchor:"map", position:[1.5,0,30]})
         * lighting Dharmaraja Ratha's north face. 2026-09-04. */
        if (signedArea(localFrame(ring).xy) > 0) {
          ring = [...ring.slice(0, -1)].reverse();
          ring.push([...ring[0]]);
        }

        const tiers = buildTiers(ring, h);
        return tiers.map((t) => ({
          type: "Feature",
          properties: {
            id,
            name: h.label,
            tier: t.tier,
            tierCount: tiers.length,
            tierKind: t.tierKind,
            base_m: t.base_m,
            top_m: t.top_m,
            total_m: h.height,
            documentedTiers: h.tiers,
            roof: h.roof,
            form: h.form,
            measure: h.measure,
            source: h.source,
            sourceUrl: h.sourceUrl,
            tiersSource: h.tiersSource,
          },
          geometry: { type: "Polygon", coordinates: [t.ring] },
        }));
      }),
  };

  fs.writeFileSync(osmPath, JSON.stringify(osmDoc, null, 1));
  fs.writeFileSync(pathsPath, JSON.stringify(pathsDoc));
  fs.writeFileSync(parkPath, JSON.stringify(parkDoc));
  fs.writeFileSync(footprintsPath, JSON.stringify(footprintDoc, null, 1));
  console.log(`wrote ${path.relative(root, footprintsPath)}  ${EXTRUDABLE.length} monuments, ${footprintDoc.features.length} tiers`);
  console.log(`\nwrote ${path.relative(root, osmPath)}  monuments ${monuments.length}  amenities ${amenities.length}`);
  console.log(`wrote ${path.relative(root, pathsPath)}  ways ${pathsDoc.features.length}`);
  console.log(`wrote ${path.relative(root, parkPath)}  polygons ${parkDoc.features.length}`);
  console.log(JSON.stringify(counts));
}

/* ---------- Route geometry: shortest path along real footways ----------
 * A straight line between two stops would cut through the ASI boundary fence
 * and a granite hill. (js/app.js's trailGeojson() draws straight lines between
 * stops, which is right at national scale and wrong at 100 m scale.) So build
 * a graph from the OSM pedestrian network and walk it. */
const nodeKey = (c) => `${c[0]},${c[1]}`;
const graph = new Map();
function addEdge(a, b) {
  const ka = nodeKey(a);
  const kb = nodeKey(b);
  const w = metres(a, b);
  if (!graph.has(ka)) graph.set(ka, { coord: a, edges: [] });
  if (!graph.has(kb)) graph.set(kb, { coord: b, edges: [] });
  graph.get(ka).edges.push([kb, w]);
  graph.get(kb).edges.push([ka, w]);
}
for (const f of pathsDoc.features) {
  const cs = f.geometry.coordinates;
  for (let i = 1; i < cs.length; i++) addEdge(cs[i - 1], cs[i]);
}

function nearestNode(target) {
  let best = null;
  let bestD = Infinity;
  for (const [k, n] of graph) {
    const d = metres(target, n.coord);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return { key: best, distance: bestD };
}

function shortestPath(fromKey, toKey) {
  const dist = new Map([[fromKey, 0]]);
  const prev = new Map();
  const visited = new Set();
  // Small graph (~550 nodes) — a linear scan beats the complexity of a heap.
  while (true) {
    let cur = null;
    let curD = Infinity;
    for (const [k, d] of dist) {
      if (!visited.has(k) && d < curD) {
        curD = d;
        cur = k;
      }
    }
    if (cur === null) return null;
    if (cur === toKey) break;
    visited.add(cur);
    for (const [nk, w] of graph.get(cur).edges) {
      const nd = curD + w;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, cur);
      }
    }
  }
  const out = [];
  for (let k = toKey; k !== undefined; k = prev.get(k)) {
    out.unshift(graph.get(k).coord);
    if (k === fromKey) break;
  }
  return { coords: out, metres: dist.get(toKey) };
}

const ROUTES = loadGlobalFile("content/mahabalipuram-routes.js", "MAHABALIPURAM_ROUTES");
const byId = new Map(MONUMENTS.map((m) => [m.id, m]));
const osmById = new Map(osmDoc.monuments.map((m) => [m.id, m]));
const coordFor = (monumentId) => {
  const m = byId.get(monumentId);
  if (!m) throw new Error(`route references unknown monument "${monumentId}"`);
  const o = osmById.get(m.osm);
  if (!o) throw new Error(`monument "${monumentId}" osm ref ${m.osm} not present in the OSM dump`);
  return o.lngLat;
};

const routeFeatures = [];
for (const route of ROUTES) {
  const walkable = route.stops.filter((s) => s.travel !== "auto");
  const legs = [];
  let totalM = 0;
  for (let i = 1; i < walkable.length; i++) {
    const a = coordFor(walkable[i - 1].monument);
    const b = coordFor(walkable[i].monument);
    const na = nearestNode(a);
    const nb = nearestNode(b);
    // If a stop is far from any mapped footway, or the network is
    // disconnected between two stops, say so — never draw a straight line
    // through a hill and call it a walking route.
    const tooFar = na.distance > 250 || nb.distance > 250;
    const sp = tooFar ? null : shortestPath(na.key, nb.key);
    if (!sp) {
      legs.push({ from: walkable[i - 1].monument, to: walkable[i].monument, gap: true, coords: [a, b] });
      console.warn(
        `  WARN ${route.id}: no mapped footpath ${walkable[i - 1].monument} -> ${walkable[i].monument}` +
          (tooFar ? ` (nearest way ${Math.round(Math.max(na.distance, nb.distance))} m away)` : " (network disconnected)")
      );
      continue;
    }
    totalM += sp.metres;
    legs.push({ from: walkable[i - 1].monument, to: walkable[i].monument, gap: false, coords: [a, ...sp.coords, b] });
  }
  for (const leg of legs) {
    routeFeatures.push({
      type: "Feature",
      properties: { route: route.id, from: leg.from, to: leg.to, gap: leg.gap },
      geometry: { type: "LineString", coordinates: leg.coords },
    });
  }
  console.log(`  route ${route.id}: ${legs.length} legs, ${Math.round(totalM)} m on mapped paths` +
    (legs.some((l) => l.gap) ? `, ${legs.filter((l) => l.gap).length} unmapped` : ""));
}

fs.writeFileSync(
  path.join(dataDir, "mahabalipuram-routes.geojson"),
  JSON.stringify({ type: "FeatureCollection", features: routeFeatures })
);
console.log(`wrote data/mahabalipuram-routes.geojson  legs ${routeFeatures.length}`);

/* ---------- Assertions — fail loudly, never ship a quiet lie ---------- */
let failed = 0;
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  failed++;
};

for (const m of MONUMENTS) {
  if (!osmById.has(m.osm)) fail(`monument "${m.id}" references ${m.osm}, which is not in the OSM response`);
}
for (const m of osmDoc.monuments) {
  if (!inBox(m.lngLat[0], m.lngLat[1], WIDE)) fail(`${m.id} outside WIDE bbox`);
}
for (const a of osmDoc.amenities) {
  if (!inBox(a.lngLat[0], a.lngLat[1], CORE)) fail(`${a.id} outside CORE bbox`);
}
const ids = new Set();
for (const r of [...osmDoc.monuments, ...osmDoc.amenities]) {
  const k = `${r.id}:${r.category || "monument"}`;
  if (ids.has(k)) fail(`duplicate record ${k}`);
  ids.add(k);
}

/* ---- Footprints: every extrusion must be cited, closed, and the same object
 * as its flat pin. ---- */
for (const h of HEIGHTS) {
  if (h.height != null && !h.source) fail(`height for ${h.osm} (${h.label}) has no source`);
  if (h.height != null && !osmById.has(h.osm)) {
    fail(`${h.osm} (${h.label}) has a cited height but is not in the OSM monument dump`);
  }
}
if (!OFFLINE || fs.existsSync(footprintsPath)) {
  const fpDoc = JSON.parse(fs.readFileSync(footprintsPath, "utf8"));
  const fpById = new Map(fpDoc.features.map((f) => [f.properties.id, f]));
  for (const h of EXTRUDABLE) {
    if (!fpById.has(h.osm)) fail(`footprint ${h.osm} (${h.label}) not returned by Overpass — deleted upstream?`);
  }
  const TERRAIN_DRIFT_MAX = 2.0;
  const groups = new Map();
  for (const f of fpDoc.features) {
    if (!groups.has(f.properties.id)) groups.set(f.properties.id, []);
    groups.get(f.properties.id).push(f);
  }

  for (const f of fpDoc.features) {
    const p = f.properties;
    if (!(p.top_m > p.base_m)) fail(`${p.id} tier ${p.tier}: top_m ${p.top_m} <= base_m ${p.base_m}`);
    if (!p.source) fail(`${p.id}: extruded without a source`);
    const ring = f.geometry.coordinates[0];
    if (ring.length < 4) fail(`${p.id} tier ${p.tier}: ring has only ${ring.length} positions`);
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) fail(`${p.id} tier ${p.tier}: ring not closed`);
  }

  for (const [id, feats] of groups) {
    feats.sort((x, y) => x.properties.tier - y.properties.tier);
    const spec = byOsmId.get(id);
    const p0 = feats[0].properties;

    // The 10 m downward skirt that closes the gap under a block on a slope is
    // granted by the shader ONLY when base is 0.
    if (p0.tier !== 1 || p0.base_m !== 0) fail(`${id}: bottom tier has base_m ${p0.base_m} (must be exactly 0)`);
    if (feats.length !== p0.tierCount) fail(`${id}: ${feats.length} tiers emitted, tierCount says ${p0.tierCount}`);

    const storeys = feats.filter((f) => f.properties.tierKind === "storey").length;
    if (storeys !== spec.tiers) fail(`${id}: ${storeys} storey tiers but ${spec.tiers} documented`);
    let seenCap = false;
    for (const f of feats) {
      if (f.properties.tierKind === "cap") seenCap = true;
      else if (seenCap) fail(`${id}: a documented storey sits above a stylised cap`);
    }

    const rings = feats.map((f) => localFrame(f.geometry.coordinates[0]).xy);
    const baseMean = vertexMean(rings[0]);
    const baseSign = Math.sign(signedArea(rings[0]));

    for (let i = 0; i < feats.length; i++) {
      const p = feats[i].properties;
      if (i > 0 && p.base_m !== feats[i - 1].properties.top_m) {
        fail(`${id} tier ${p.tier}: base_m ${p.base_m} != previous top_m ${feats[i - 1].properties.top_m}`);
      }
      if (p.top_m - p.base_m < 0.4) fail(`${id} tier ${p.tier}: only ${(p.top_m - p.base_m).toFixed(2)} m thick`);
      if (Math.sign(signedArea(rings[i])) !== baseSign) fail(`${id} tier ${p.tier}: winding flipped`);
      if (i > 0) {
        const prevArea = Math.abs(signedArea(rings[i - 1]));
        const area = Math.abs(signedArea(rings[i]));
        if (!(area > 0) || area >= prevArea) fail(`${id} tier ${p.tier}: area ${area.toFixed(1)} not inside ${prevArea.toFixed(1)}`);
        // The check that actually proves the stack does not overhang thin air.
        // Automatic for convex rings; NOT for Draupadi/Arjuna/Butterball,
        // which each carry a reflex vertex.
        for (const v of rings[i]) {
          if (!pointInRing(v, rings[i - 1])) {
            fail(`${id} tier ${p.tier}: a vertex falls outside the tier below`);
            break;
          }
        }
      }
      // MapLibre samples terrain once per polygon at its vertex mean. Bound the
      // drift between tiers so a stack on a slope tilts as one object instead
      // of shearing — and so a lopsided footprint is caught mechanically.
      const drift = Math.hypot(vertexMean(rings[i])[0] - baseMean[0], vertexMean(rings[i])[1] - baseMean[1]);
      if (drift > TERRAIN_DRIFT_MAX) {
        fail(`${id} tier ${p.tier}: terrain-sample drift ${drift.toFixed(2)} m exceeds ${TERRAIN_DRIFT_MAX} m`);
      }
    }

    const top = feats[feats.length - 1].properties;
    if (top.top_m !== spec.height) fail(`${id}: top tier ends at ${top.top_m} m, cited height is ${spec.height} m`);

    // Proves we fetched the polygon of the SAME element the flat pin uses.
    // Tier 1 only — on an inset ring the bbox centre has moved.
    const ring = feats[0].geometry.coordinates[0];
    const xs = ring.map((c) => c[0]);
    const ys = ring.map((c) => c[1]);
    const mid = [round6((Math.min(...xs) + Math.max(...xs)) / 2), round6((Math.min(...ys) + Math.max(...ys)) / 2)];
    const committed = osmById.get(id);
    if (committed) {
      const d = metres(mid, committed.lngLat);
      if (d > 25) fail(`${id}: polygon bbox centre is ${Math.round(d)} m from the committed pin — different element?`);
    }
  }

  const expectedTiers = EXTRUDABLE.reduce((n, h) => n + (ROOF[h.roof].caps ? ROOF[h.roof].caps.length : h.tiers), 0);
  if (fpDoc.features.length !== expectedTiers) {
    fail(`${fpDoc.features.length} tier features but ${expectedTiers} expected from the heights table`);
  }
  console.log(
    `  footprints: ${groups.size} monuments, ${fpDoc.features.length} tiers, all cited, closed and stacked  ok`
  );
}

// Cross-check against the two points already verified in sites.geojson.
const sites = JSON.parse(fs.readFileSync(path.join(dataDir, "sites.geojson"), "utf8"));
for (const [siteId, monumentId] of [["TM-018", "shore-temple"], ["TM-015", "pancha-rathas"]]) {
  const f = sites.features.find((x) => x.properties.id === siteId);
  if (!f) continue;
  const d = metres(f.geometry.coordinates, coordFor(monumentId));
  const line = `${siteId} vs OSM ${monumentId}: ${Math.round(d)} m`;
  if (d > 150) fail(`${line} — disagreement over 150 m, check which is right`);
  else console.log(`  ${line}  ok`);
}

console.log("\ncounts", JSON.stringify(osmDoc.counts));
const zero = CATEGORIES.filter((c) => !osmDoc.counts[c]);
if (zero.length) console.log(`no OSM data for: ${zero.join(", ")} — the guide shows these as "0 recorded"`);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("validation passed");
