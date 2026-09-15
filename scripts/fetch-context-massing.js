#!/usr/bin/env node
/* Context massing for the 3D site map — the town around the monuments.
 *
 * WHY THIS IS A SEPARATE SCRIPT AND A SEPARATE FILE
 * -------------------------------------------------
 * scripts/fetch-site-data.js builds the MONUMENT massing, and it is built so
 * that an uncited height cannot ship: the Overpass query is generated from
 * content/mahabalipuram-heights.js, so "no citation" and "no polygon" are the
 * same condition. That guarantee is worth keeping absolutely.
 *
 * This file is the opposite case, and it must not be able to contaminate that
 * one. Measured on 6 September 2026, OpenStreetMap holds, inside the core
 * bbox, 136 buildings of which exactly ONE carries a `height` tag and NONE
 * carry `building:levels`. There is no surveyed height for the town. So the
 * blocks this script writes are NOT measurements. They are nominal massing by
 * tag — the same convention every 3D basemap uses for untagged buildings —
 * and every feature carries `measured: false` plus the reason, so the map can
 * and does draw them differently from the monuments.
 *
 * The rule the rest of the project runs on is "never invent data". Nominal
 * massing does not break it, but only because the invention is DECLARED: in
 * the feature properties, in the colour on the map, in the provenance line
 * under the map, and in the README. Remove any of those and it does break it.
 *
 * The one building with a real `height` tag keeps it and is flagged
 * `measured: true`, so the honest case is not thrown away for uniformity.
 *
 * Usage:  node scripts/fetch-context-massing.js
 * Output: data/mahabalipuram-context.geojson
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

/* ---------- Never mass a monument ---------- */
/* A monument is EITHER cited and extruded from its measured height, OR
 * deliberately left flat. It must never also appear here as a nominal box.
 *
 * This is not a tidiness rule, it is a correctness one, and both failure modes
 * were observed before this filter existed:
 *
 *  - The five rathas are extruded from cited heights as stacked tiers. OSM also
 *    tags them `building=temple`, so they were being drawn a SECOND time as
 *    flat 6.4 m nominal boxes punched through the middle of the real forms.
 *    That is what made the rathas look boxy rather than stepped.
 *  - The Shore Temple is deliberately NOT extruded: its OSM way is the walled
 *    enclosure, 46.4 x 21.5 m against a cited ~15 m square platform, so
 *    extruding it builds a slab on the shoreline instead of a temple. The
 *    nominal pass happily rebuilt exactly that slab.
 *
 * The id list is read from the content files rather than typed here, so adding
 * a monument automatically removes it from the nominal pass. */
function loadGlobalFile(rel, key) {
  const src = fs.readFileSync(path.join(root, rel), "utf8");
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  const value = sandbox.window[key];
  if (!value) throw new Error(`${rel} did not define window.${key}`);
  return value;
}
const MONUMENT_IDS = new Set(
  [
    ...loadGlobalFile("content/mahabalipuram-monuments.js", "MAHABALIPURAM_MONUMENTS"),
    ...loadGlobalFile("content/mahabalipuram-heights.js", "MAHABALIPURAM_HEIGHTS"),
  ]
    .map((x) => x.osm)
    .filter(Boolean)
);
const dataDir = path.join(root, "data");
const outPath = path.join(dataDir, "mahabalipuram-context.geojson");

/* Same CORE bbox as fetch-site-data.js — the walkable site. Deliberately not
 * WIDE: massing 5 km of coast road adds no orientation value and a lot of
 * geometry to parse on a phone. */
const CORE = [12.6, 80.179, 12.631, 80.201];
const UA = "india-heritage-map/1.0 (static site build script; contact via repo)";
const ENDPOINT = "https://overpass-api.de/api/interpreter";

/* Nominal storey heights. 3.2 m per storey is the figure OSM's own wiki uses
 * for a residential storey where none is surveyed; the storey COUNTS below are
 * a convention chosen to match what is visible in the town, not a survey.
 * `why` is carried into the file so the guess is legible at the point of use. */
const STOREY_M = 3.2;
const NOMINAL = {
  hotel: { storeys: 3, why: "Mamallapuram's guesthouses and beach hotels are low-rise" },
  temple: { storeys: 2, why: "village temple hall, no gopuram tower mapped" },
  church: { storeys: 2, why: "nave height, assumed" },
  college: { storeys: 2, why: "assumed" },
  school: { storeys: 2, why: "assumed" },
  roof: { storeys: 1, why: "a roof structure with no walls — one storey clear" },
  stone: { storeys: 1, why: "assumed" },
  house: { storeys: 1, why: "assumed" },
  residential: { storeys: 1, why: "assumed" },
  yes: { storeys: 1, why: "untyped building — lowest assumption, so it never overstates" },
};
const DEFAULT_NOMINAL = NOMINAL.yes;

/* Bare rock is the reason the site exists. The DEM already models the ridge as
 * a landform; this lifts the mapped outcrop rings a little above it so the
 * granite reads as rock standing out of the ground rather than as a tint. */
/* SHAPE. A single flat-topped extrusion made the outcrops read as cardboard
 * plateaus with sheer walls — the opposite of granite. Each rock ring is now a
 * short stack of tiers stepping inward as it rises, using the same affine-inset
 * taper the monument pipeline uses for the Butterball's boulder profile.
 *
 * Insets are FRACTIONS of the ring's half short axis, not absolute metres: the
 * outcrops here run from a few metres across to over a hundred, and one fixed
 * inset would either do nothing to the big ones or swallow the small ones. */
/* Five tiers, and the insets accelerate rather than step evenly. An even step
 * produced something that read as rice terracing: each tier traced the full
 * outline like a contour line and the top stayed a broad plateau. Granite
 * domes narrow FAST near the crest, so most of the inset is spent in the top
 * third, leaving roughly a tenth of the short axis at the summit. */
const ROCK_CAPS = [
  { top: 0.36, inset: 0 },
  { top: 0.62, inset: 0.22 },
  { top: 0.82, inset: 0.5 },
  { top: 0.94, inset: 0.76 },
  { top: 1.0, inset: 0.9 },
];

/* Buildings are stacked too, for the same reason the rock is: a plain box with
 * a flat top reads as a box, and the reference's little houses read as MODELS
 * because they have a plinth at the foot and a roof slab that oversails the
 * walls. Three tiers is enough to say that and cheap enough to triple.
 *
 * A NEGATIVE inset is an outset — insetRing is an affine scale, so d < 0 grows
 * the ring. That is what gives the plinth its lip and the roof its overhang.
 * Without an overhang the wall and the roof share an edge and the whole thing
 * collapses back into a box. */
const BUILDING_CAPS = [
  { top: 0.88, inset: 0 },   // walls, on the real OSM outline
  { top: 1.0, inset: -0.1 }, // roof slab, oversailing
];

/* TWO tiers, not three. A plinth tier was tried and dropped: on a 3.2 m nominal
 * house it is a few centimetres of geometry nobody can see at any zoom this map
 * offers, and it pushed the committed file from 127 KB to 443 KB — real mobile
 * data for an invisible detail, on a file now loaded on every visit. The roof
 * overhang is the part that actually reads. */

/* HEIGHT stays nominal, but is no longer one number for every outcrop: a
 * boulder field and the main ridge shoulder are not the same height, and giving
 * them a single value was its own small fiction. Height grows with the square
 * root of area — i.e. with linear size — and is clamped at both ends. The ridge
 * LANDFORM still comes from the DEM; this is only the rock standing proud of
 * it, which is why the cap is single-figure metres. */
const ROCK_MIN_M = 2.5;
const ROCK_MAX_M = 8;
function rockHeight(area) {
  const h = ROCK_MIN_M + (Math.sqrt(area) - 15) * 0.09;
  return +Math.min(ROCK_MAX_M, Math.max(ROCK_MIN_M, h)).toFixed(2);
}
const ROCK_WHY =
  "nominal: granite outcrop lifted above the DEM, height scaled by footprint size, " +
  "stepped in 4 tiers. The ridge landform itself comes from the DEM, not from this";

const QUERY = `[out:json][timeout:120];
(
  way["building"](${CORE.join(",")});
  way["natural"="bare_rock"](${CORE.join(",")});
  way["natural"="stone"](${CORE.join(",")});
);
out geom tags;`;

async function overpass(q) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    body: "data=" + encodeURIComponent(q),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return (await res.json()).elements || [];
}

/* MapLibre needs a closed ring wound consistently; OSM ways are not guaranteed
 * to be either. Same normalisation the monument pipeline does — without it one
 * group lights inside-out, which is what happened to the five rathas. */
/* --- Local metric frame, so insets can be expressed in metres --- */
function toXY(ring, lat0, lng0) {
  const mLat = 110574;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  return ring.map(([lng, lat]) => [(lng - lng0) * mLng, (lat - lat0) * mLat]);
}
function toLngLat(xy, lat0, lng0) {
  const mLat = 110574;
  const mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
  // 6 dp is ~11 cm here. Tripling the tier count tripled the file, and
  // this claws most of it back without any visible change to the shapes.
  return xy.map(([x, y]) => [+(lng0 + x / mLng).toFixed(6), +(lat0 + y / mLat).toFixed(6)]);
}

function ringAreaM2(xy) {
  let a = 0;
  for (let i = 0; i < xy.length - 1; i++) a += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  return Math.abs(a / 2);
}

/* Minimum-area bounding rectangle by rotating calipers over the edge
 * directions. Same pair of helpers scripts/fetch-site-data.js uses to step the
 * monument tiers — kept in step deliberately, so rock and monuments taper by
 * the same rule. */
function minAreaRect(p) {
  let best = { area: Infinity, long: 0, short: 0, theta: 0 };
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i];
    const [x2, y2] = p[(i + 1) % p.length];
    const th = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(-th);
    const sn = Math.sin(-th);
    const xs = p.map(([x, y]) => x * c - y * sn);
    const ys = p.map(([x, y]) => x * sn + y * c);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w * h < best.area) best = { area: w * h, long: Math.max(w, h), short: Math.min(w, h), theta: th };
  }
  return best;
}

/* An affine map with positive determinant: it cannot self-intersect, and it
 * PRESERVES WINDING, so side-face normals never flip between tiers. */
function insetRing(xy, origin, rect, d) {
  const su = Math.max((rect.long - 2 * d) / rect.long, 0.04);
  const sv = Math.max((rect.short - 2 * d) / rect.short, 0.04);
  const c = Math.cos(-rect.theta);
  const sn = Math.sin(-rect.theta);
  const ci = Math.cos(rect.theta);
  const si = Math.sin(rect.theta);
  return xy.map(([x, y]) => {
    const dx = x - origin[0];
    const dy = y - origin[1];
    const u = (dx * c - dy * sn) * su;
    const v = (dx * sn + dy * c) * sv;
    return [origin[0] + (u * ci - v * si), origin[1] + (u * si + v * ci)];
  });
}

function ringOf(el) {
  if (!el.geometry || el.geometry.length < 3) return null;
  const pts = el.geometry.map((p) => [p.lon, p.lat]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) pts.push([first[0], first[1]]);
  if (pts.length < 4) return null;
  let area = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
  }
  if (area < 0) pts.reverse(); // force counter-clockwise
  return pts;
}

(async () => {
  console.log("Fetching context massing from Overpass…");
  const els = await overpass(QUERY);
  console.log(`  ${els.length} elements`);

  const features = [];
  let measuredCount = 0;
  let rockCount = 0;

  let skippedMonuments = 0;
  for (const el of els) {
    const tags = el.tags || {};
    const ring = ringOf(el);
    if (!ring) continue;

    if (MONUMENT_IDS.has(`way/${el.id}`)) {
      skippedMonuments++;
      continue;
    }

    const isRock = tags.natural === "bare_rock" || tags.natural === "stone";
    let height, measured, why, kind;

    if (isRock) {
      /* Rock is emitted as a STACK, not one feature, so it steps like a mound
       * instead of standing as a flat-topped slab. Handled here and `continue`s,
       * because unlike a building it produces several features from one way. */
      rockCount++;
      const lat0 = ring.reduce((a, p) => a + p[1], 0) / ring.length;
      const lng0 = ring.reduce((a, p) => a + p[0], 0) / ring.length;
      const xy = toXY(ring, lat0, lng0);
      const area = ringAreaM2(xy);
      const total = rockHeight(area);
      const rect = minAreaRect(xy);
      const origin = [
        xy.reduce((a, p) => a + p[0], 0) / xy.length,
        xy.reduce((a, p) => a + p[1], 0) / xy.length,
      ];
      let base = 0;
      ROCK_CAPS.forEach((cap, i) => {
        // Inset as a fraction of the half short axis — see ROCK_CAPS.
        const d = (cap.inset * rect.short) / 2;
        const tierXY = d > 0 ? insetRing(xy, origin, rect, d) : xy;
        const top = +(total * cap.top).toFixed(2);
        features.push({
          type: "Feature",
          properties: {
            id: `way/${el.id}`,
            kind: "rock",
            name: tags.name || null,
            building: null,
            tier: i + 1,
            tierCount: ROCK_CAPS.length,
            base_m: base,
            top_m: top,
            height_m: total,
            measured: false,
            why: ROCK_WHY,
          },
          geometry: { type: "Polygon", coordinates: [toLngLat(tierXY, lat0, lng0)] },
        });
        base = top;
      });
      continue;
    }

    kind = "building";
    const tagged = parseFloat(tags.height);
    if (Number.isFinite(tagged) && tagged > 0) {
      height = tagged;
      measured = true;
      why = "height tag present in OpenStreetMap";
      measuredCount++;
    } else {
      const n = NOMINAL[tags.building] || DEFAULT_NOMINAL;
      height = +(n.storeys * STOREY_M).toFixed(1);
      measured = false;
      why = `${n.storeys} nominal storey${n.storeys > 1 ? "s" : ""} at ${STOREY_M} m — ${n.why}`;
    }

    {
      const lat0 = ring.reduce((a, q) => a + q[1], 0) / ring.length;
      const lng0 = ring.reduce((a, q) => a + q[0], 0) / ring.length;
      const xy = toXY(ring, lat0, lng0);
      const rect = minAreaRect(xy);
      const origin = [
        xy.reduce((a, q) => a + q[0], 0) / xy.length,
        xy.reduce((a, q) => a + q[1], 0) / xy.length,
      ];
      let base = 0;
      BUILDING_CAPS.forEach((cap, i) => {
        const d = (cap.inset * rect.short) / 2;
        const tierXY = d !== 0 ? insetRing(xy, origin, rect, d) : xy;
        const top = +(height * cap.top).toFixed(2);
        features.push({
          type: "Feature",
          properties: {
            id: `way/${el.id}`,
            kind,
            name: tags.name || null,
            building: tags.building || null,
            tier: i + 1,
            tierCount: BUILDING_CAPS.length,
            base_m: base,
            top_m: top,
            height_m: height,
            measured,
            why,
          },
          geometry: { type: "Polygon", coordinates: [toLngLat(tierXY, lat0, lng0)] },
        });
        base = top;
      });
    }
  }

  const doc = {
    type: "FeatureCollection",
    note:
      "Context massing for the 3D site map. NOT a survey. Building outlines are real " +
      "OpenStreetMap geometry; heights are nominal by tag except where `measured` is true. " +
      "Monument heights are cited separately in data/mahabalipuram-footprints.geojson.",
    generated: new Date().toISOString().slice(0, 10),
    bbox: CORE,
    convention: `${STOREY_M} m per nominal storey`,
    attribution: "© OpenStreetMap contributors (ODbL)",
    features,
  };

  if (!features.length) throw new Error("no context features — refusing to write an empty file");

  fs.writeFileSync(outPath, JSON.stringify(doc, null, 1));
  /* Count the features, do not derive them: rock now emits four tiers per
   * outcrop, so "everything that is not rock" stopped equalling a subtraction. */
  const buildingTiers = features.filter((f) => f.properties.kind === "building").length;
  const buildings = new Set(
    features.filter((f) => f.properties.kind === "building").map((f) => f.properties.id)
  ).size;
  const rockTiers = features.filter((f) => f.properties.kind === "rock").length;
  console.log(
    `wrote ${path.relative(root, outPath)}  ${buildings} buildings ` +
      `(${measuredCount} measured, ${buildings - measuredCount} nominal) in ${buildingTiers} tiers, ` +
      `${rockCount} rock outcrops in ${rockTiers} tiers`
  );
  console.log(`  skipped ${skippedMonuments} monuments — those are cited elsewhere or deliberately flat`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
