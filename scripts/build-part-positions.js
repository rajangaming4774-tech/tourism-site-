#!/usr/bin/env node
/* Where the parts of a monument stand, as map coordinates — so the site map
 * (js/guide-map.js) can put the card's numbers on the real spots when a
 * monument is tapped. Writes data/mahabalipuram-part-positions.json.
 *
 * Only two monuments have part positions a source can back:
 *
 *   Shore Temple   The compound is OSM way 370135158, committed as
 *                  data/research/3d/shore-temple-prakara.geojson. Its minimum-
 *                  area rectangle (46.3 × 21.6 m, long axis at 105.2°) is the
 *                  frame the 3D reconstruction is built in, and the positions
 *                  of the towers, the shrine between them and the tank in that
 *                  frame are the reconstruction's recorded layout
 *                  (scripts/blender/shore-temple/st_params.py, from
 *                  data/research/3d/shore-temple-proportions.json and
 *                  06-shore-temple-rebuild.md). They are copied below, not
 *                  re-read, and the rectangle is recomputed and must match.
 *   Pancha Rathas  Each ratha is the centroid of its own OSM outline
 *                  (data/mahabalipuram-plan.geojson). The lion, the bull and
 *                  the elephant have no OSM record; they are placed from
 *                  Wikipedia's description ("lion west of the Arjuna-Draupadi
 *                  platform, a seated bull on its east and a standing elephant
 *                  on its southwest") at the offsets the 3D build uses
 *                  (st_rathas_params.py POS), and marked approximate.
 *
 * Every part carries `how` (in words) and `accuracy_m`; the guide prints them.
 * Node builtins only. `--check` re-reads the committed file and re-validates.
 *
 * Usage:  node scripts/build-part-positions.js
 *         node scripts/build-part-positions.js --check
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "mahabalipuram-part-positions.json");
const CHECK = process.argv.includes("--check");

const anchors = JSON.parse(fs.readFileSync(path.join(root, "data", "anchors.json"), "utf8"));
const M_LAT = anchors.projection.mPerLat;   // 110574
const M_LON = anchors.projection.mPerLon;   // 108632.08 at this latitude
const round7 = (v) => Math.round(v * 1e7) / 1e7;
const toLngLat = ([lng0, lat0], east, north) => [round7(lng0 + east / M_LON), round7(lat0 + north / M_LAT)];
const toMetres = ([lng0, lat0], [lng, lat]) => [(lng - lng0) * M_LON, (lat - lat0) * M_LAT];

/* ---------- geometry ---------- */
function convexHull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
/* Minimum-area rectangle of points in metres (east, north): centre, long and
 * short side, and the compass bearing of the long axis (0–180). */
function minAreaRect(pts) {
  const h = convexHull(pts);
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    const u = h.map(([x, y]) => x * c + y * s), v = h.map(([x, y]) => -x * s + y * c);
    const [u0, u1, v0, v1] = [Math.min(...u), Math.max(...u), Math.min(...v), Math.max(...v)];
    const area = (u1 - u0) * (v1 - v0);
    if (!best || area < best.area) {
      const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
      const long = u1 - u0 >= v1 - v0;
      const axis = long ? ang : ang + Math.PI / 2; // math angle of the long axis
      best = { area, cx: um * c - vm * s, cy: um * s + vm * c, long: Math.max(u1 - u0, v1 - v0), short: Math.min(u1 - u0, v1 - v0), axis };
    }
  }
  // Compass bearing of the long axis, pointed so it has an eastward component (toward the sea here).
  let bearing = (90 - (best.axis * 180) / Math.PI + 360) % 360;
  if (bearing > 180) bearing -= 180;
  best.bearing = bearing;
  return best;
}
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/* Area centroid. Worked relative to the first vertex: at lng 80 / lat 12 the
 * shoelace products of raw degrees cancel to noise for an 8 m outline. */
function ringCentroid(ring) {
  const [ox, oy] = ring[0];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const x0 = ring[i][0] - ox, y0 = ring[i][1] - oy, x1 = ring[i + 1][0] - ox, y1 = ring[i + 1][1] - oy;
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  a /= 2;
  return [round7(ox + cx / (6 * a)), round7(oy + cy / (6 * a))];
}

let failed = 0;
const fail = (m) => { console.error("FAIL " + m); failed++; };

let doc;
if (CHECK) {
  doc = JSON.parse(fs.readFileSync(outPath, "utf8"));
  console.log("--check: re-validating the committed file");
} else {
  /* ---------- Shore Temple ---------- */
  const prakara = JSON.parse(fs.readFileSync(path.join(root, "data", "research", "3d", "shore-temple-prakara.geojson"), "utf8"));
  const ring = prakara.features[0].geometry.coordinates[0];
  const origin = [anchors.origin.lon, anchors.origin.lat];
  const rect = minAreaRect(ring.map((p) => toMetres(origin, p)));
  console.log(`shore temple compound: ${rect.long.toFixed(2)} × ${rect.short.toFixed(2)} m, long axis ${rect.bearing.toFixed(1)}°`);
  if (Math.abs(rect.long - 46.3) > 0.2 || Math.abs(rect.short - 21.6) > 0.2 || Math.abs(rect.bearing - 105.2) > 0.5) {
    fail(`compound rectangle ${rect.long.toFixed(2)} × ${rect.short.toFixed(2)} @ ${rect.bearing.toFixed(1)}° does not match the reconstruction's 46.3 × 21.6 @ 105.2°`);
  }
  /* The reconstruction frame: +X along the long axis toward the sea (bearing
   * 105.2°), +Y 90° to its left (bearing 15.2°, the north side). */
  const bx = (rect.bearing * Math.PI) / 180;
  const X = [Math.sin(bx), Math.cos(bx)];            // east, north of +X
  const Y = [Math.sin(bx - Math.PI / 2), Math.cos(bx - Math.PI / 2)]; // of +Y
  if (Y[1] < 0) { Y[0] = -Y[0]; Y[1] = -Y[1]; }       // +Y is the north side
  const at = (x, y) => toLngLat(origin, rect.cx + x * X[0] + y * Y[0], rect.cy + x * X[1] + y * Y[1]);
  // Copied from scripts/blender/shore-temple/st_params.py (EAST, WEST, VISHNU, TANK, MINI_SHRINE).
  const LAYOUT = "the 3D reconstruction's recorded layout, in the frame of the OpenStreetMap compound outline";
  const shore = {
    outline: "way/370135158",
    parts: {
      1: { lngLat: at(10.0, 0.0), how: `Centre of the tall tower's platform — ${LAYOUT}`, accuracy_m: 2 },
      2: { lngLat: at(-11.5, 0.0), how: `Centre of the smaller tower — ${LAYOUT}`, accuracy_m: 2 },
      3: { lngLat: at(-2.3, 0.0), how: `The low shrine between the towers — ${LAYOUT}`, accuracy_m: 2 },
      5: { lngLat: at(-30.0, -2.5), how: "The tank outside the west wall — read from an aerial photograph (06-shore-temple-rebuild.md)", accuracy_m: 3 },
    },
  };

  /* ---------- Pancha Rathas ---------- */
  const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "mahabalipuram-plan.geojson"), "utf8"));
  const outlineOf = (id) => plan.features.find((f) => f.properties.monument === id);
  const pois = JSON.parse(fs.readFileSync(path.join(root, "data", "pois.json"), "utf8"));
  const anchor = pois.pois.find((p) => p.id === "pancha-rathas").lngLat;
  const ratha = (id, label) => {
    const f = outlineOf(id);
    if (!f) { fail(`${id}: no OSM outline in mahabalipuram-plan.geojson`); return null; }
    return { lngLat: ringCentroid(f.geometry.coordinates[0]), how: `Centre of ${label}'s OpenStreetMap outline (${f.properties.id})`, accuracy_m: 1, outline: f.properties.id };
  };
  const APPROX = "Approximate — placed from Wikipedia's description, not surveyed";
  // Offsets from st_rathas_params.py POS, metres east/north of the anchor.
  const rathas = {
    parts: {
      1: ratha("draupadi-ratha", "Draupadi's ratha"),
      2: ratha("arjuna-ratha", "Arjuna's ratha"),
      3: ratha("bhima-ratha", "Bhima's ratha"),
      4: ratha("dharmaraja-ratha", "Dharmaraja's ratha"),
      5: ratha("nakula-sahadeva-ratha", "Nakula and Sahadeva's ratha"),
      6: { lngLat: toLngLat(anchor, 4.2, 15.5), how: `The lion — ${APPROX}`, accuracy_m: 8, approximate: true },
      7: { lngLat: toLngLat(anchor, 9.1, -22.0), how: `The bull — ${APPROX}`, accuracy_m: 8, approximate: true },
      8: { lngLat: toLngLat(anchor, -21.4, -2.0), how: `The elephant — ${APPROX}`, accuracy_m: 8, approximate: true },
    },
  };
  doc = {
    _note:
      "Where the numbered parts of a monument stand, for the site map. Shore Temple: the 3D reconstruction's recorded layout placed in the frame of the OSM compound outline. Pancha Rathas: the centroid of each ratha's OSM outline; the three animals are approximate, placed from Wikipedia's description. Every part says how and how accurately. Regenerate with `node scripts/build-part-positions.js`.",
    built: new Date().toISOString().slice(0, 10),
    monuments: { "shore-temple": shore, "pancha-rathas": rathas },
  };
}

/* ---------- Validate ---------- */
const osm = JSON.parse(fs.readFileSync(path.join(root, "data", "mahabalipuram-osm.json"), "utf8"));
global.window = {};
new Function("window", fs.readFileSync(path.join(root, "content", "mahabalipuram-monuments.js"), "utf8"))(global.window);
const monuments = global.window.MAHABALIPURAM_MONUMENTS;
const metres = (a, b) => Math.hypot((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT);
const prakaraRing = JSON.parse(fs.readFileSync(path.join(root, "data", "research", "3d", "shore-temple-prakara.geojson"), "utf8")).features[0].geometry.coordinates[0];
const plan = JSON.parse(fs.readFileSync(path.join(root, "data", "mahabalipuram-plan.geojson"), "utf8"));
for (const [id, mon] of Object.entries(doc.monuments)) {
  const m = monuments.find((x) => x.id === id);
  const pin = m && (osm.monuments.find((o) => o.id === m.osm) || {}).lngLat;
  if (!pin) { fail(`${id}: no pin in mahabalipuram-osm.json`); continue; }
  const names = new Set(((m.inside && m.inside.parts) || []).map((p) => String(p.n)));
  for (const [n, p] of Object.entries(mon.parts)) {
    if (!p || !Array.isArray(p.lngLat)) { fail(`${id} part ${n}: no position`); continue; }
    const d = metres(pin, p.lngLat);
    if (d > 60) fail(`${id} part ${n}: ${Math.round(d)} m from the monument's pin`);
    if (!names.has(n)) fail(`${id} part ${n}: placed on the map but has no words in inside.parts`);
    if (p.outline) {
      const f = plan.features.find((x) => x.properties.id === p.outline);
      if (!f || !pointInRing(p.lngLat, f.geometry.coordinates[0])) fail(`${id} part ${n}: not inside its own outline ${p.outline}`);
    }
  }
  if (id === "shore-temple") {
    for (const n of ["1", "2", "3"]) if (mon.parts[n] && !pointInRing(mon.parts[n].lngLat, prakaraRing)) fail(`shore-temple part ${n}: not inside the compound outline`);
    if (mon.parts["5"] && pointInRing(mon.parts["5"].lngLat, prakaraRing)) fail("shore-temple part 5: the tank should be outside the compound wall");
  }
}

if (!CHECK) {
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 1));
  console.log(`wrote ${path.relative(root, outPath)}  ${Object.entries(doc.monuments).map(([k, v]) => `${k} ${Object.keys(v.parts).length}`).join(", ")}`);
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log("validation passed");
