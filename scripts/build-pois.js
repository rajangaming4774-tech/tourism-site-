#!/usr/bin/env node
/* Builds data/pois.json — the only thing the 3D viewer reads. Nothing about
 * Mahabalipuram is hardcoded in the viewer.
 *
 * WHAT IS FILLED IN AND WHAT IS LEFT EMPTY
 * ----------------------------------------
 * Everything here is derived from data already committed and cited:
 * content/mahabalipuram-monuments.js (text, period, sources) and
 * data/mahabalipuram-osm.json (coordinates, facilities).
 *
 * Three fields the brief asks for are NOT filled, and that is deliberate:
 *
 *  - `ticket` prices. The repo records only WHETHER a monument is ticketed, not
 *    how much. ASI fares change, and the brief itself says never to present a
 *    stale price as current — inventing a plausible number would be exactly
 *    that failure. Prices stay null with lastVerified null, and the viewer
 *    renders "price not verified" rather than a figure.
 *  - `timings`. Not recorded anywhere in this repo. Left null.
 *  - `nameTamil`. Real Tamil names exist, but not in any file here, and this is
 *    a script that derives — it does not author. Left null; the viewer omits
 *    the second line rather than showing a transliteration nobody checked.
 *
 * Fill any of these by adding sourced values to the content files; this script
 * will carry them through automatically.
 *
 * Usage:  node scripts/build-pois.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "pois.json");

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
const heightByOsm = new Map(HEIGHTS.filter((h) => h.height != null).map((h) => [h.osm, h]));
const osm = JSON.parse(fs.readFileSync(path.join(root, "data", "mahabalipuram-osm.json"), "utf8"));

/* The seven the brief names, in the order it names them. */
const WANTED = [
  "shore-temple",
  "pancha-rathas",
  "descent-of-the-ganges",
  "krishnas-butterball",
  "varaha-cave",
  "mahishasuramardini-mandapa",
  "olakkanneshwara",
];

/* Scene origin: the centre of the walkable site, so the peninsula sits around
 * [0,0,0] as the brief requires. Y-up, 1 unit = 1 metre, X east, Z SOUTH —
 * three.js is right-handed with -Z forward, so north maps to -Z. Getting this
 * wrong mirrors the whole scene, which is invisible until you place a real
 * mesh and the coastline is on the wrong side. */
const ORIGIN = { lng: 80.1915, lat: 12.6168 };
const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function toScene(lngLat) {
  const x = (lngLat[0] - ORIGIN.lng) * mPerDegLng(ORIGIN.lat);
  const z = -(lngLat[1] - ORIGIN.lat) * M_PER_DEG_LAT;
  // y = 0: every anchor sits on the ground plane. Real elevation belongs to the
  // terrain mesh when it exists; baking a guess in here would fight it.
  return [+x.toFixed(2), 0, +z.toFixed(2)];
}

const byOsmId = new Map(osm.monuments.map((m) => [m.id, m]));

/* Facilities are REAL: OSM amenities within walking distance, not a wish list.
 * Anything with nothing nearby gets an empty array, which the viewer renders as
 * "none recorded nearby" — the same idiom the guide's legend already uses. */
const FACILITY_LABEL = {
  toilets: "Restrooms",
  water: "Drinking water",
  parking: "Parking",
  tickets: "Ticket counter",
  info: "Information",
  food: "Food",
  shop: "Shops",
  transport: "Transport",
  health: "Medical",
  money: "ATM / bank",
  shelter: "Shelter",
  green: "Garden",
};
const FACILITY_RADIUS_M = 250;

function metres(a, b) {
  const dx = (a[0] - b[0]) * mPerDegLng(a[1]);
  const dy = (a[1] - b[1]) * M_PER_DEG_LAT;
  return Math.hypot(dx, dy);
}

function facilitiesNear(lngLat) {
  const found = new Map();
  for (const a of osm.amenities) {
    const d = metres(lngLat, a.lngLat);
    if (d > FACILITY_RADIUS_M) continue;
    const label = FACILITY_LABEL[a.category];
    if (!label) continue;
    if (!found.has(label) || found.get(label) > d) found.set(label, d);
  }
  return [...found.entries()]
    .sort((p, q) => p[1] - q[1])
    .map(([label, d]) => ({ label, metres: Math.round(d) }));
}

const pois = [];
const problems = [];

for (const id of WANTED) {
  const m = MONUMENTS.find((x) => x.id === id);
  if (!m) { problems.push(`${id}: not in the monuments file`); continue; }
  const rec = byOsmId.get(m.osm);
  if (!rec) { problems.push(`${id}: OSM id ${m.osm} not in the committed dump`); continue; }

  pois.push({
    id: m.id,
    name: m.title,
    // Not authored here — see the header.
    nameTamil: null,
    anchor: toScene(rec.lngLat),
    lngLat: rec.lngLat,
    osm: m.osm,
    period: m.when || null,
    summary: m.text || null,
    history: Array.isArray(m.detail) ? m.detail : [],
    timings: null,
    ticket: {
      ticketed: Boolean(m.ticketed),
      indian: null,
      foreign: null,
      childrenUnder15: null,
      lastVerified: null,
      source: null,
      note: m.ticketed
        ? "This monument is ticketed. The price is not recorded in this dataset and is not shown rather than shown stale."
        : "No ticket recorded for this monument.",
    },
    /* The placeholder box the viewer draws until a real mesh exists. Where this
     * repo already has a CITED height for the monument it is used, with its
     * source carried along — a placeholder that happens to be the right height
     * is strictly better than an arbitrary one, and it means swapping in real
     * geometry changes the silhouette, not the scale. Footprint stays a neutral
     * square: we have outlines for some of these, but not for all, and a mix of
     * real and invented footprints would be worse than an honest uniform one. */
    placeholder: (() => {
      const h = heightByOsm.get(m.osm);
      return {
        height_m: h ? h.height : 8,
        footprint_m: 12,
        heightSource: h ? h.source : null,
        heightIsCited: Boolean(h),
      };
    })(),
    facilities: facilitiesNear(rec.lngLat),
    sources: m.sources || [],
    wiki: m.wiki || null,
  });
}

if (problems.length) {
  console.error("FAILED:\n  " + problems.join("\n  "));
  process.exit(1);
}

const doc = {
  _note:
    "Generated by scripts/build-pois.js from content/mahabalipuram-monuments.js and " +
    "data/mahabalipuram-osm.json. Do not edit by hand. Ticket prices, opening times " +
    "and Tamil names are null because no sourced value for them exists in this repo — " +
    "they are omitted in the UI rather than guessed.",
  generated: new Date().toISOString().slice(0, 10),
  origin: { lng: ORIGIN.lng, lat: ORIGIN.lat, note: "scene origin; Y-up, 1 unit = 1 m, +X east, -Z north" },
  attribution: "Coordinates and facilities © OpenStreetMap contributors (ODbL)",
  pois,
};

fs.writeFileSync(outPath, JSON.stringify(doc, null, 1));
console.log(`wrote ${path.relative(root, outPath)}  ${pois.length} POIs`);
for (const p of pois) {
  console.log(`  ${p.id.padEnd(28)} anchor ${String(p.anchor[0]).padStart(8)},${String(p.anchor[2]).padStart(8)}  ${p.facilities.length} facilities  ticketed=${p.ticket.ticketed}`);
}
