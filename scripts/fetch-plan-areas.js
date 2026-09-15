#!/usr/bin/env node
/* The areas on the illustrated site plan (js/site-plan.js), fetched once from
 * OpenStreetMap and committed as data/mahabalipuram-plan.geojson.
 *
 * WHAT IT HOLDS
 *   kind "monument"  the outline of every monument in
 *                    content/mahabalipuram-monuments.js whose `osm` id is a
 *                    WAY (13 of 24 today). data/mahabalipuram-osm.json keeps
 *                    only their centres; this is the ring. A monument that is
 *                    an OSM node has no ring here — the plan draws a picture
 *                    at its position and says so.
 *   kind "water"     ponds, tanks and basins in the core bbox.
 *   kind "land"      landcover: grass, park, garden, scrub, wood, sand, beach…
 *                    with `cover` = the OSM tag value.
 *
 * All of it is OSM geometry exactly as mapped (ODbL). Nothing is drawn that
 * is not here, and what is NOT here is recorded in `counts` — if OSM has no
 * beach polygon, the plan has no beach, and the README says why.
 *
 * Same conventions as scripts/fetch-site-data.js: Node builtins only, the
 * same endpoint, User-Agent, retry and backoff; `--offline` skips the network,
 * re-reads the committed file and re-runs every check; any FAIL exits 1.
 *
 * Usage:  node scripts/fetch-plan-areas.js
 *         node scripts/fetch-plan-areas.js --offline
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const OFFLINE = process.argv.includes("--offline");
const outPath = path.join(dataDir, "mahabalipuram-plan.geojson");

const CORE = [12.6, 80.179, 12.631, 80.201]; // [south, west, north, east]
const bbox = CORE.join(",");
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const UA = "india-heritage-map/1.0 (static site build script; contact via repo)";

const COVER = ["grass", "forest", "meadow", "village_green", "orchard", "park", "garden", "scrub", "wood", "sand", "beach", "wetland", "heath"];
const round6 = (v) => Math.round(v * 1e6) / 1e6;

function loadGlobalFile(rel, key) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const value = sandbox.window[key];
  if (!value) throw new Error(`${rel} did not define window.${key}`);
  return value;
}

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
    } finally {
      clearTimeout(timer);
    }
  }
}

/* ---------- Geometry helpers ---------- */
const closeRing = (ring) => {
  const a = ring[0], b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([...a]);
  return ring;
};
const area = (ring) => {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
};
const metres = (a, b) => {
  const r = Math.PI / 180;
  const x = (b[0] - a[0]) * r * Math.cos(((a[1] + b[1]) / 2) * r) * 6371000;
  const y = (b[1] - a[1]) * r * 6371000;
  return Math.hypot(x, y);
};
const wayRing = (el) => closeRing(el.geometry.map((p) => [round6(p.lon), round6(p.lat)]));

/* A multipolygon relation: stitch its outer members end to end into rings,
 * keep its inner members as holes. A run that fails to close is dropped and
 * reported rather than closed by guesswork. */
function relationRings(el, warn) {
  const rings = { outer: [], inner: [] };
  for (const role of ["outer", "inner"]) {
    const segs = (el.members || [])
      .filter((m) => m.type === "way" && (m.role || "outer") === role && Array.isArray(m.geometry))
      .map((m) => m.geometry.map((p) => [round6(p.lon), round6(p.lat)]));
    while (segs.length) {
      let run = segs.shift();
      let grew = true;
      while (grew && !(run[0][0] === run[run.length - 1][0] && run[0][1] === run[run.length - 1][1])) {
        grew = false;
        const end = run[run.length - 1];
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          const same = (p, q) => p[0] === q[0] && p[1] === q[1];
          if (same(s[0], end)) { run = run.concat(s.slice(1)); segs.splice(i, 1); grew = true; break; }
          if (same(s[s.length - 1], end)) { run = run.concat(s.slice(0, -1).reverse()); segs.splice(i, 1); grew = true; break; }
        }
      }
      if (run[0][0] === run[run.length - 1][0] && run[0][1] === run[run.length - 1][1] && run.length > 3) rings[role].push(run);
      else warn(`relation/${el.id}: an ${role} ring does not close — dropped`);
    }
  }
  return rings;
}

/* ---------- Build ---------- */
const monuments = loadGlobalFile("content/mahabalipuram-monuments.js", "MAHABALIPURAM_MONUMENTS");
const ways = monuments.filter((m) => /^way\//.test(m.osm));
const wayIds = ways.map((m) => m.osm.slice(4));
const monumentByWay = new Map(ways.map((m) => [m.osm, m]));

const QUERY = `[out:json][timeout:120];
way(id:${wayIds.join(",")})->.mon;
(
  wr["natural"="water"](${bbox});
  wr["water"](${bbox});
  wr["landuse"~"^(reservoir|basin)$"](${bbox});
  wr["landuse"~"^(grass|forest|meadow|village_green|orchard)$"](${bbox});
  wr["leisure"~"^(park|garden)$"](${bbox});
  wr["natural"~"^(scrub|wood|sand|beach|wetland|heath)$"](${bbox});
)->.cover;
(.mon; .cover;);
out geom tags;`;

const warnings = [];
const warn = (m) => { warnings.push(m); console.warn("  warn: " + m); };

function classify(tags = {}, osmId) {
  if (monumentByWay.has(osmId)) return { kind: "monument" };
  if (tags.natural === "water" || tags.water || ["reservoir", "basin"].includes(tags.landuse)) return { kind: "water" };
  const cover = COVER.find((c) => tags.landuse === c || tags.leisure === c || tags.natural === c);
  if (cover) return { kind: "land", cover };
  return null;
}

let doc;
if (OFFLINE) {
  console.log("--offline: re-reading the committed file");
  doc = JSON.parse(fs.readFileSync(outPath, "utf8"));
  // Reclassify from the kept tags, so a rule change here applies without a fetch.
  for (const f of doc.features) {
    const c = classify(f.properties.tags, f.properties.id);
    if (c) Object.assign(f.properties, c);
  }
} else {
  const res = await overpass(QUERY, "plan areas");
  const features = [];
  for (const el of res.elements) {
    const osmId = `${el.type}/${el.id}`;
    const c = classify(el.tags, osmId);
    if (!c) continue;
    let rings;
    if (el.type === "way") {
      if (!Array.isArray(el.geometry) || el.geometry.length < 4) { warn(`${osmId}: fewer than 4 positions — skipped`); continue; }
      rings = [wayRing(el)];
    } else if (el.type === "relation") {
      const r = relationRings(el, warn);
      if (!r.outer.length) continue;
      // One feature per outer ring; every inner ring becomes a hole of the first (sufficient for a pond).
      rings = [r.outer[0], ...r.inner];
      for (const extra of r.outer.slice(1)) features.push(feature(osmId, el.tags, c, [extra]));
    } else continue;
    features.push(feature(osmId, el.tags, c, rings));
  }
  function feature(osmId, tags, c, rings) {
    const keep = {};
    for (const k of ["name", "natural", "water", "landuse", "leisure", "historic", "building", "tourism"]) if (tags && tags[k]) keep[k] = tags[k];
    const props = { id: osmId, ...c, tags: keep };
    if (c.kind === "monument") props.monument = monumentByWay.get(osmId).id;
    return { type: "Feature", properties: props, geometry: { type: "Polygon", coordinates: rings } };
  }
  features.sort((a, b) => (a.properties.kind + a.properties.id).localeCompare(b.properties.kind + b.properties.id));
  doc = {
    type: "FeatureCollection",
    _note:
      "Areas for the illustrated site plan (js/site-plan.js): the OpenStreetMap outline of every monument that is an OSM way, plus water and landcover polygons in the core bbox — OSM geometry exactly as mapped, ODbL. A monument missing here is an OSM node with no outline; a cover type with count 0 is not mapped in OSM and is therefore not drawn. Regenerate with `node scripts/fetch-plan-areas.js`.",
    fetched: new Date().toISOString().slice(0, 10),
    source: "OpenStreetMap contributors, ODbL",
    bbox: CORE,
    counts: {},
    features,
  };
}

/* ---------- Counts ---------- */
const counts = { monument: 0, water: 0, land: {} };
for (const c of COVER) counts.land[c] = 0;
for (const f of doc.features) {
  const p = f.properties;
  if (p.kind === "land") counts.land[p.cover] = (counts.land[p.cover] || 0) + 1;
  else counts[p.kind] = (counts[p.kind] || 0) + 1;
}
doc.counts = counts;
doc.warnings = warnings;

/* ---------- Validate ---------- */
let failed = 0;
const fail = (m) => { console.error("FAIL " + m); failed++; };
const osm = JSON.parse(fs.readFileSync(path.join(dataDir, "mahabalipuram-osm.json"), "utf8"));
const pinById = new Map(osm.monuments.map((m) => [m.id, m.lngLat]));
const have = new Map(doc.features.filter((f) => f.properties.kind === "monument").map((f) => [f.properties.id, f]));
for (const m of ways) {
  const f = have.get(m.osm);
  if (!f) { fail(`${m.id}: monument way ${m.osm} missing from the response`); continue; }
  const ring = f.geometry.coordinates[0];
  const xs = ring.map((c) => c[0]), ys = ring.map((c) => c[1]);
  const mid = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  const pin = pinById.get(m.osm);
  // Proves this is the polygon of the SAME element the flat pin uses.
  if (pin && metres(mid, pin) > 25) fail(`${m.id}: ring centre is ${Math.round(metres(mid, pin))} m from the committed pin — different element?`);
}
for (const f of doc.features) {
  const p = f.properties;
  for (const ring of f.geometry.coordinates) {
    const a = ring[0], b = ring[ring.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) fail(`${p.id}: ring not closed`);
    if (Math.abs(area(ring)) < 1e-12) fail(`${p.id}: zero-area ring`);
  }
  if (p.kind === "land" && !COVER.includes(p.cover)) fail(`${p.id}: cover "${p.cover}" not in the allowed set`);
  if (!["monument", "water", "land"].includes(p.kind)) fail(`${p.id}: unknown kind ${p.kind}`);
}
// The five rathas' rings should be the tier-1 rings the footprints file carries; an upstream edit is worth knowing about.
const fpPath = path.join(dataDir, "mahabalipuram-footprints.geojson");
if (fs.existsSync(fpPath)) {
  const fp = JSON.parse(fs.readFileSync(fpPath, "utf8"));
  for (const t of fp.features.filter((f) => f.properties.tier === 1)) {
    const here = have.get(t.properties.id);
    if (here && JSON.stringify(here.geometry.coordinates[0]) !== JSON.stringify(t.geometry.coordinates[0])) {
      warn(`${t.properties.id}: ring differs from data/mahabalipuram-footprints.geojson tier 1 — OSM has changed upstream; re-run fetch-site-data.js`);
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify(doc, null, 1));
console.log(`wrote ${path.relative(root, outPath)}  monuments ${counts.monument}/${ways.length}, water ${counts.water}, land ${JSON.stringify(counts.land)}`);
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("validation passed");
