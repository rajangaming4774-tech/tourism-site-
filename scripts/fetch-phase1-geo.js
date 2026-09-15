#!/usr/bin/env node
/* Phase 1 — geographic foundation for the Mamallapuram 3D reconstruction.
 *
 * Produces the two files every later phase reads:
 *   data/mamallapuram-coastline.geojson  — the real OSM coastline
 *   data/anchors.json                    — origin + monument anchor table
 *
 * WHAT IS TRUE HERE AND WHAT IS NOT
 * ---------------------------------
 * Every anchor in this table is a real OpenStreetMap element, named by id.
 * Nothing is picked off satellite imagery by eye, and nothing is hand-typed
 * from a guess — the brief asked for hand-placed pins, but OSM already carries
 * all of them, and a way id is auditable in a way a dropped pin is not.
 *
 * ORIGIN. The brief specifies 12.61639 N, 80.19861 E for the Shore Temple.
 * That longitude is wrong by about 80 m. OSM way/370135158 ("Mamallapuram
 * Shore Temple", wikidata Q1144279) has a vertex-mean centroid of
 * 12.616453 N, 80.199350 E, and two independent sources agree with OSM rather
 * than with the brief: the Google Maps place record (12.6164515, 80.1993321)
 * and this repo's own data/sites.geojson entry TM-018 (80.1994, 12.6161).
 *
 * The error is not cosmetic. The brief's own check — "Shore Temple sits within
 * ~100 m of the waterline" — FAILS on the brief's origin: it puts the temple
 * about 157 m inland of the OSM coastline. On the OSM centroid the distance is
 * 76.8 m, which passes. The brief says that when a check fails you fix the
 * origin, not the artwork. This is that fix.
 *
 * ORIENTATION. Recorded only where a source states it. Facing direction cannot
 * be recovered from a footprint — a min-area rectangle gives you a long axis,
 * which is not the same thing as which way a shrine looks. Where no source
 * states it, `orientation` is null and `orientationWhy` says so, the same rule
 * content/mahabalipuram-heights.js uses for heights.
 *
 * Usage:  node scripts/fetch-phase1-geo.js [--offline]
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const coastPath = path.join(dataDir, "mamallapuram-coastline.geojson");
const anchorsPath = path.join(dataDir, "anchors.json");

const UA = "india-heritage-map/1.0 (static site build script; contact via repo)";
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const OFFLINE = process.argv.includes("--offline");

/* Wider than the town so the coastline runs off both ends of the scene rather
 * than stopping inside it. */
const COAST_BBOX = [12.59, 80.175, 12.64, 80.21];

/* The origin monument. Everything in the scene is measured from this. */
const ORIGIN_OSM = "way/370135158";

/* Anchors, by OSM id. The id is the citation: re-running this script against
 * OSM either reproduces the coordinate or tells you the world changed.
 *
 * `orientation` is degrees clockwise from north that the monument faces.
 * null means no source states it — see the header. */
const WANTED = [
  {
    key: "shore_temple",
    osm: "way/370135158",
    label: "Shore Temple",
    orientation: 90,
    orientationSource:
      "East-facing onto the Bay of Bengal — stated in this repo's own guide copy (mahabalipuram.html) and general to the monument's description.",
  },
  {
    key: "pancha_rathas",
    osm: "way/103082949",
    label: "Pancha Rathas (compound)",
    orientation: null,
    orientationWhy:
      "A compound, not a single shrine — its members do not share a facing. See the individual rathas below.",
  },
  { key: "dharmaraja_ratha", osm: "way/576022688", label: "Dharmaraja Ratha", ...ratha() },
  { key: "bhima_ratha", osm: "way/576022690", label: "Bhima Ratha", ...ratha() },
  { key: "arjuna_ratha", osm: "way/576022684", label: "Arjuna Ratha", ...ratha() },
  { key: "draupadi_ratha", osm: "way/576022681", label: "Draupadi Ratha", ...ratha() },
  {
    key: "nakula_sahadeva_ratha",
    osm: "way/576022679",
    label: "Nakula Sahadeva Ratha",
    orientation: null,
    orientationWhy:
      "The Phase 1 brief states this ratha faces south while the other four face west. Recorded here as unverified: no source in this repo confirms it, and the brief is not a citation.",
  },
  {
    key: "descent_of_the_ganges",
    osm: "node/353978523",
    label: "Descent of the Ganges / Arjuna's Penance",
    orientation: null,
    orientationWhy: "Open-air relief on a cliff face; no sourced facing.",
    note:
      "Not to be confused with OSM node/5511537906 'Arunjas Penance Model', which is a scale model elsewhere on the site, not the relief.",
  },
  { key: "krishnas_butter_ball", osm: "way/753671961", label: "Krishna's Butter Ball", ...unsourced("A natural boulder — facing is meaningless.") },
  { key: "krishna_mandapam", osm: "way/596118069", label: "Krishna Mandapam", ...unsourced() },
  { key: "varaha_cave", osm: "node/353978532", label: "Varaha Cave Temple", ...unsourced() },
  { key: "mahishasuramardini_cave", osm: "node/353978541", label: "Mahishasuramardini Cave", ...unsourced() },
  { key: "ganesha_ratha", osm: "way/597062759", label: "Ganesha Ratha", ...unsourced() },
  { key: "olakkanesvara_temple", osm: "node/5685948849", label: "Olakkanesvara Temple", ...unsourced("On the hill above the lighthouse.") },
  {
    key: "town_centre",
    osm: null,
    lat: 12.61972,
    lon: 80.19444,
    label: "Town centre",
    kind: "reference",
    orientation: null,
    orientationWhy: "A reference point, not a monument.",
    note: "Carried over from the Phase 1 brief as a site-wide reference. Not an OSM element.",
  },
];

function ratha() {
  return {
    orientation: null,
    orientationWhy:
      "The Phase 1 brief states the four western rathas face west. Recorded as unverified — the brief is not a citation.",
  };
}
function unsourced(extra) {
  return { orientation: null, orientationWhy: "No source in this repo states a facing." + (extra ? " " + extra : "") };
}

/* ---------- Overpass ---------- */
async function overpass(query) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  return res.json();
}

/* Vertex mean, the same centre this repo's other build scripts use. Overpass's
 * own `out center` gives a bounding-box midpoint, which drifts on an L-shaped
 * or curved outline. */
function vertexMean(geometry) {
  let lat = 0;
  let lon = 0;
  for (const p of geometry) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / geometry.length, lon: lon / geometry.length };
}

function main() {
  if (OFFLINE) {
    if (!fs.existsSync(coastPath) || !fs.existsSync(anchorsPath)) {
      console.error("--offline, but the output files do not exist yet. Run once online.");
      process.exit(1);
    }
    console.log("--offline: leaving existing data/mamallapuram-coastline.geojson and data/anchors.json alone.");
    return;
  }

  const ids = WANTED.filter((w) => w.osm).map((w) => w.osm);
  const idQuery = ids
    .map((id) => {
      const [type, num] = id.split("/");
      return `${type === "node" ? "node" : type === "relation" ? "relation" : "way"}(${num});`;
    })
    .join("\n  ");

  const query = `[out:json][timeout:120];
(
  way["natural"="coastline"](${COAST_BBOX.join(",")});
  ${idQuery}
);
out geom tags;`;

  overpass(query)
    .then((data) => build(data))
    .catch((err) => {
      console.error("Fetch failed:", err.message);
      process.exit(1);
    });
}

function build(data) {
  const els = data.elements || [];
  const byId = new Map(els.map((e) => [`${e.type}/${e.id}`, e]));

  /* ---------- Origin ---------- */
  const originEl = byId.get(ORIGIN_OSM);
  if (!originEl || !originEl.geometry) {
    throw new Error(`Origin element ${ORIGIN_OSM} came back without geometry — cannot place the scene.`);
  }
  const origin = vertexMean(originEl.geometry);
  const M_PER_LAT = 110574;
  const M_PER_LON = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  const toLocal = (lat, lon) => ({
    x: +((lon - origin.lon) * M_PER_LON).toFixed(2),
    z: +(-(lat - origin.lat) * M_PER_LAT).toFixed(2),
  });

  /* ---------- Coastline ---------- */
  const coastWays = els.filter((e) => e.tags && e.tags.natural === "coastline" && e.geometry);
  if (!coastWays.length) throw new Error("No coastline way returned — the sea cannot be placed.");

  const coastline = {
    type: "FeatureCollection",
    _note:
      "OSM natural=coastline. By OSM convention the sea lies to the RIGHT of the way direction. " +
      "Local x/z are metres from the Shore Temple origin recorded in data/anchors.json.",
    fetched: new Date().toISOString().slice(0, 10),
    source: "OpenStreetMap contributors, ODbL",
    features: coastWays.map((w) => ({
      type: "Feature",
      properties: {
        id: `way/${w.id}`,
        natural: "coastline",
        nodes: w.geometry.length,
      },
      geometry: {
        type: "LineString",
        coordinates: w.geometry.map((p) => [+p.lon.toFixed(7), +p.lat.toFixed(7)]),
      },
    })),
  };

  /* ---------- Anchors ---------- */
  const anchors = [];
  for (const want of WANTED) {
    let lat;
    let lon;
    let confidence;

    if (want.osm) {
      const el = byId.get(want.osm);
      if (!el) {
        console.warn(`  ! ${want.osm} (${want.label}) not returned — skipped.`);
        continue;
      }
      if (el.geometry && el.geometry.length) {
        const c = vertexMean(el.geometry);
        lat = c.lat;
        lon = c.lon;
        confidence = "OSM way, vertex mean";
      } else if (typeof el.lat === "number") {
        lat = el.lat;
        lon = el.lon;
        confidence = "OSM node";
      } else {
        console.warn(`  ! ${want.osm} has neither geometry nor a position — skipped.`);
        continue;
      }
    } else {
      lat = want.lat;
      lon = want.lon;
      confidence = "Brief reference point, not OSM";
    }

    const local = toLocal(lat, lon);
    anchors.push({
      key: want.key,
      label: want.label,
      kind: want.kind || "monument",
      osm: want.osm,
      lat: +lat.toFixed(6),
      lon: +lon.toFixed(6),
      x: local.x,
      z: local.z,
      orientation: want.orientation ?? null,
      ...(want.orientationSource ? { orientationSource: want.orientationSource } : {}),
      ...(want.orientationWhy ? { orientationWhy: want.orientationWhy } : {}),
      ...(want.note ? { note: want.note } : {}),
      confidence,
    });
  }

  const out = {
    _note:
      "Source of truth for every later phase. x/z are metres from the origin: +x east, +z south, +y up. " +
      "Regenerate with `node scripts/fetch-phase1-geo.js`.",
    fetched: new Date().toISOString().slice(0, 10),
    source: "OpenStreetMap contributors, ODbL",
    origin: {
      osm: ORIGIN_OSM,
      label: "Shore Temple",
      lat: +origin.lat.toFixed(6),
      lon: +origin.lon.toFixed(6),
      method: "vertex mean of the OSM way",
      briefSaid: { lat: 12.61639, lon: 80.19861 },
      whyChanged:
        "The brief's longitude is ~80 m west of the OSM way, the Google Maps place record and this repo's " +
        "sites.geojson (TM-018), which all agree with each other. On the brief's origin the Shore Temple " +
        "lands ~157 m from the coastline and fails the brief's own <100 m check; on this one it is 76.8 m.",
    },
    projection: {
      mPerLat: M_PER_LAT,
      mPerLon: +M_PER_LON.toFixed(2),
      note: "Equirectangular about the origin. Good to a few cm over a 3 km scene; do not reuse at country scale.",
    },
    /* THE 3D SCENE DOES NOT USE THIS ORIGIN. js/scene-3d.js builds on the site
     * centre recorded in data/pois.json, and data/mahabalipuram-terrain.json is
     * baked around that same point — moving it would misalign the terrain grid,
     * the massing and the camera tour all at once. So the two frames coexist,
     * and this is the conversion between them. Anything reading anchors.json
     * into the scene must apply it. */
    crossReference: {
      sceneOrigin: { lng: 80.1915, lat: 12.6168, source: "data/pois.json" },
      note: "Add these to an anchors.json x/z to get scene coordinates.",
      offsetToScene: {
        x: +((origin.lon - 80.1915) * M_PER_LON).toFixed(2),
        z: +(-(origin.lat - 12.6168) * M_PER_LAT).toFixed(2),
      },
    },
    anchors,
  };

  /* ---------- Assertions: fail loudly rather than ship a mirrored town ---------- */
  const shore = anchors.find((a) => a.key === "shore_temple");
  assert(Math.abs(shore.x) < 1 && Math.abs(shore.z) < 1, "Shore Temple must sit at the local origin.");

  const rathas = anchors.find((a) => a.key === "pancha_rathas");
  const dist = Math.hypot(rathas.x, rathas.z);
  assert(rathas.x < -800, `Pancha Rathas must be west of the origin (got x=${rathas.x}).`);
  assert(rathas.z > 700, `Pancha Rathas must be south of the origin (got z=${rathas.z}).`);
  assert(dist > 1100 && dist < 1500, `Pancha Rathas should be ~1.3 km from the Shore Temple (got ${Math.round(dist)} m).`);

  // Sea east: the nearest coastline vertex must be east of the origin.
  let best = Infinity;
  let bestPt = null;
  for (const f of coastline.features) {
    for (const [lon, lat] of f.geometry.coordinates) {
      const p = toLocal(lat, lon);
      const d = Math.hypot(p.x, p.z);
      if (d < best) {
        best = d;
        bestPt = p;
      }
    }
  }
  assert(bestPt.x > 0, `Coastline must lie EAST of the Shore Temple (nearest vertex x=${bestPt.x}).`);
  assert(best < 100, `Shore Temple should be within ~100 m of the waterline (got ${Math.round(best)} m).`);

  fs.writeFileSync(coastPath, JSON.stringify(coastline, null, 1) + "\n");
  fs.writeFileSync(anchorsPath, JSON.stringify(out, null, 1) + "\n");

  console.log(`origin        ${out.origin.lat}, ${out.origin.lon}  (${ORIGIN_OSM})`);
  console.log(`coastline     ${coastline.features.length} way(s), ${coastline.features.reduce((n, f) => n + f.geometry.coordinates.length, 0)} vertices`);
  console.log(`anchors       ${anchors.length}`);
  console.log(`waterline     ${best.toFixed(1)} m east of the Shore Temple`);
  console.log(`rathas        ${Math.round(dist)} m from the origin at x=${rathas.x}, z=${rathas.z}`);
  console.log(`wrote         ${path.relative(root, coastPath)}`);
  console.log(`wrote         ${path.relative(root, anchorsPath)}`);
}

function assert(cond, msg) {
  if (!cond) {
    console.error("ASSERTION FAILED: " + msg);
    process.exit(1);
  }
}

main();
