#!/usr/bin/env node
/* Proportions of the Shore Temple, read off photographs — and written down.
 *
 * WHY THIS EXISTS
 * ---------------
 * assets/models/shore-temple.glb is a reconstruction: its one cited dimension is
 * the 18 m height of the Kshatriyasimhesvara vimana, its one measured outline is
 * the OpenStreetMap compound wall, and every other proportion — how tall each
 * storey is, how far each eave overhangs, how many kudu arches sit on a tier —
 * is read off photographs. This script is how that reading is done in the open:
 *
 *   --rulers          ffmpeg writes gridded, numbered copies and zoomed crops of
 *                     the reference photographs into assets/reference/shore-temple/
 *                     measure/. Pixel rows and columns are then picked BY EYE off
 *                     those crops and transcribed into measure/picks.json, each
 *                     pick with the image it came from and a ± in pixels.
 *   --fetch-prakara   fetches OSM way 370135158 (the compound wall) from Overpass
 *                     once and commits it as data/research/3d/shore-temple-
 *                     prakara.geojson, with its minimum-area rectangle and its
 *                     axis-aligned box both printed — the two earlier figures in
 *                     this repo (46.4 x 21.5 and 49.0 x 31.4 m) are one of each.
 *   --derive          turns picks.json into data/research/3d/shore-temple-
 *                     proportions.json: pixels to metres through the cited 18 m,
 *                     widths from paired picks, counts copied through, and where
 *                     two photographs give the same quantity BOTH values are kept
 *                     and their spread is the stated uncertainty. Disagreement is
 *                     a finding, not something to average away.
 *
 * WHAT IS AND IS NOT A MEASUREMENT
 * --------------------------------
 * A pixel row on a photograph is a measurement of the photograph. Turning it into
 * metres needs a scale and a flat view: the scale is the cited 18 m, which the
 * source does not say includes the plinth, so 18.0 m is DEFINED here as court
 * level to kalasha tip and that definition is written into the output. The views
 * are distant and near-square-on but not corrected for camera tilt; the error
 * that leaves is a few per cent and is stated per pick. Nothing here is a survey.
 *
 * Node builtins and ffmpeg only, like every script in this folder.
 *
 * Usage:  node scripts/build-shore-temple-measure.js --rulers
 *         node scripts/build-shore-temple-measure.js --fetch-prakara
 *         node scripts/build-shore-temple-measure.js --derive
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

/* --set picks the monument: "shore-temple" (default) or "pancha-rathas". Each
 * set has its own reference folder, photograph list, picks file and output
 * JSON; the mechanics are identical. */
const SET = (process.argv.find((a) => a.startsWith("--set=")) || "--set=shore-temple").slice(6);
const root = path.join(__dirname, "..");
const refDir = path.join(root, "assets", "reference", SET);
const outDir = path.join(refDir, "measure");
const researchDir = path.join(root, "data", "research", "3d");
const PICKS = path.join(outDir, "picks.json");
const PRAKARA = path.join(researchDir, "shore-temple-prakara.geojson");
const PROPORTIONS = path.join(researchDir, SET + "-proportions.json");

/* The reference photographs, and what each is allowed to answer. Licences are
 * copied from SOURCES.md; only the PD/CC0 ones may be reproduced in the docs,
 * all of them may be read — a measurement is a fact about the building. */
const PHOTO_SETS = {};
PHOTO_SETS["shore-temple"] = [
  {
    file: "shore-temple-mamallapuram-d150f51.jpg",
    licence: "Public domain", author: "Kavita modi",
    view: "from the south-west, low, whole compound",
    used_for: "the tall tower's full tier stack on its south flank; the west shrine beside it; the tank in front",
    crops: [
      { name: "towers", x: 440, y: 180, w: 1000, h: 760, scale: 2 },
      { name: "tank", x: 380, y: 860, w: 1400, h: 420, scale: 1.4 },
    ],
  },
  {
    file: "front-view-mahabalipuram.jpg",
    licence: "CC BY-SA 3.0", author: "see SOURCES.md",
    view: "from the west, near square-on; the lower storey of the tall tower is hidden behind the west shrine",
    used_for: "the west shrine's elevation and both towers' widths tier by tier",
    crops: [
      { name: "upper", x: 200, y: 180, w: 1300, h: 1000, scale: 1.5 },
      { name: "lower", x: 0, y: 1100, w: 1920, h: 1000, scale: 1 },
    ],
  },
  {
    file: "shore-temple-detail-of-north-face-2011-05-28.jpg",
    licence: "CC BY-SA 3.0", author: "see SOURCES.md",
    view: "from the north-east, both towers and the nandi wall",
    used_for: "COUNTS: pilasters per face, kudus per eave, the kuta/sala/panjara rhythm per tier, lion-base columns, nandis per wall length",
    crops: [
      { name: "east-tower", x: 220, y: 60, w: 760, h: 960, scale: 2 },
      { name: "west-tower", x: 900, y: 200, w: 640, h: 800, scale: 2 },
      { name: "wall", x: 0, y: 860, w: 1920, h: 415, scale: 1 },
    ],
  },
  {
    file: "shore-temple-ariel.jpg",
    licence: "CC BY-SA 4.0", author: "Karthik Easvur",
    view: "aerial, from the west, the sea behind",
    used_for: "where the tank and its shrine sit against the compound; nandi count along the visible wall",
    crops: [{ name: "compound", x: 500, y: 560, w: 800, h: 420, scale: 2 }],
  },
  {
    file: "02mahabalipuramshoretemplebullstatues.jpg",
    licence: "CC BY 2.0", author: "see SOURCES.md",
    view: "the nandi wall, close",
    used_for: "nandi height and length against the wall coping",
    crops: [{ name: "bulls", x: 0, y: 300, w: 1920, h: 900, scale: 1 }],
  },
  {
    file: "shore-temple-floor-plan-mahabalipuram-tamil-nadu.jpg",
    licence: "CC0", author: "Ms Sarah Welch",
    view: "schematic plan; the file page itself says relative dimensions are close but neither exact nor complete",
    used_for: "RELATIONSHIPS ONLY: the order of the three shrines east-west, which way each faces, where the wall opens. Never a dimension.",
    crops: [],
  },
];
/* Filled in once the Commons fetch for the rathas has been looked at:
 * node scripts/fetch-shore-temple-photos.js --category="Pancha Rathas" --out=pancha-rathas --max-files=60 */
PHOTO_SETS["pancha-rathas"] = [
  { file: "dharmaraja-ratha-mahabalipuram-kanjipuram-tamil-nadu-dsc00039.jpg", licence: "see SOURCES.md", author: "see SOURCES.md",
    view: "Dharmaraja from the south-west corner, low", used_for: "Dharmaraja: storey and eave lines, open pillared ground storey, dome", crops: [] },
  { file: "mahabalipuram-pancha-rathas-arjunas-ratha-draupadis-ratha-wus01904.jpg", licence: "see SOURCES.md", author: "see SOURCES.md",
    view: "Arjuna and Draupadi together from the west", used_for: "Arjuna: two storeys, dome; Draupadi: wall/roof split, width against Arjuna", crops: [] },
  { file: "mahabalipuram-pancha-rathas-arjunas-ratha-bhimas-ratha-wus01911.jpg", licence: "see SOURCES.md", author: "see SOURCES.md",
    view: "Bhima's long side with Arjuna beyond", used_for: "Bhima: colonnade, upper storey, vault rise, gable", crops: [] },
  { file: "n-tn-c54-sahadevas-nakhulas-ratha.jpg", licence: "see SOURCES.md", author: "see SOURCES.md",
    view: "Nakula-Sahadeva", used_for: "the apsidal ratha: storeys, vault, apse", crops: [] },
  { file: "mahabalipuram-pancha-rathas-arjunas-ratha-nakula-sahadeva-ratha-elephant-sculpture-wus01898.jpg", licence: "see SOURCES.md", author: "see SOURCES.md",
    view: "the elephant beside Nakula-Sahadeva and Arjuna", used_for: "elephant size against the rathas", crops: [] },
];
const PHOTOS = PHOTO_SETS[SET];
if (!PHOTOS) { console.error("unknown --set " + SET); process.exit(1); }

const FONT = "C\\:/Windows/Fonts/arial.ttf";

function rulers() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const p of PHOTOS) {
    const src = path.join(refDir, p.file);
    if (!fs.existsSync(src)) { console.warn(`missing ${p.file}`); continue; }
    const base = p.file.replace(/\.(jpe?g|png)$/i, "");
    /* Grid every 50 px, brighter every 200, numbered every 200 along both edges
     * so a row can be read off any crop without counting from the corner. */
    const grid =
      "drawgrid=width=50:height=50:color=white@0.25:thickness=1," +
      "drawgrid=width=200:height=200:color=yellow@0.6:thickness=1";
    const labelsX = Array.from({ length: 12 }, (_, i) => i * 200)
      .map((x) => `drawtext=fontfile='${FONT}':text='${x}':x=${x + 3}:y=4:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.5`)
      .join(",");
    const labelsY = Array.from({ length: 18 }, (_, i) => i * 200)
      .map((y) => `drawtext=fontfile='${FONT}':text='${y}':x=4:y=${y + 3}:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.5`)
      .join(",");
    const full = path.join(outDir, `${base}.grid.png`);
    run(["-y", "-loglevel", "error", "-i", src, "-vf", `${grid},${labelsX},${labelsY}`, full]);
    console.log(`wrote ${path.relative(root, full)}`);
    for (const c of p.crops) {
      const out = path.join(outDir, `${base}.${c.name}.png`);
      // crop the GRIDDED image so the numbers travel with the crop
      run(["-y", "-loglevel", "error", "-i", full, "-vf", `crop=${c.w}:${c.h}:${c.x}:${c.y},scale=iw*${c.scale}:ih*${c.scale}:flags=neighbor`, out]);
      console.log(`wrote ${path.relative(root, out)}`);
    }
  }
  if (!fs.existsSync(PICKS)) {
    fs.writeFileSync(PICKS, JSON.stringify({ _note: "Pixel picks transcribed by eye from measure/*.png (1920 px renditions). Each pick: image, label, x and/or y in pixels of the 1920 px file, pm (± px).", picks: [] }, null, 2));
    console.log(`wrote empty ${path.relative(root, PICKS)} — fill it in`);
  }
}

function run(args) {
  execFileSync("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
}

/* ---------- the compound wall, from OSM ---------- */
function fetchPrakara() {
  const contact = process.env.WIKI_CONTACT || process.env.OSM_CONTACT;
  if (!contact) {
    console.error("Set WIKI_CONTACT=you@example.com — Overpass and Wikimedia both want a contact in the User-Agent.");
    process.exit(1);
  }
  const query = `[out:json][timeout:25];way(370135158);out geom;`;
  const body = "data=" + encodeURIComponent(query);
  const req = https.request(
    { method: "POST", host: "overpass-api.de", path: "/api/interpreter",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), "User-Agent": `india-heritage-map/1.0 (${contact})` } },
    (res) => {
      let s = "";
      res.on("data", (d) => (s += d));
      res.on("end", () => {
        if (res.statusCode !== 200) { console.error(`Overpass HTTP ${res.statusCode}: ${s.slice(0, 300)}`); process.exit(1); }
        const j = JSON.parse(s);
        const way = j.elements.find((e) => e.type === "way");
        if (!way || !way.geometry) { console.error("way 370135158 not returned"); process.exit(1); }
        const ring = way.geometry.map((g) => [g.lon, g.lat]);
        const feature = {
          type: "FeatureCollection",
          _note: "OSM way 370135158, the Shore Temple compound wall (prakara). Fetched once for the 3D reconstruction; see scripts/build-shore-temple-measure.js. © OpenStreetMap contributors, ODbL.",
          fetched: new Date().toISOString().slice(0, 10),
          features: [{ type: "Feature", properties: Object.assign({ id: `way/${way.id}` }, way.tags || {}), geometry: { type: "Polygon", coordinates: [ring] } }],
        };
        fs.writeFileSync(PRAKARA, JSON.stringify(feature, null, 1));
        const m = ringMetrics(ring);
        console.log(`wrote ${path.relative(root, PRAKARA)} (${ring.length} nodes)`);
        console.log(`axis-aligned box  ${m.bbox.w.toFixed(1)} x ${m.bbox.d.toFixed(1)} m (E-W x N-S)`);
        console.log(`min-area rectangle ${m.rect.w.toFixed(1)} x ${m.rect.d.toFixed(1)} m, long axis bearing ${m.rect.bearing.toFixed(1)} deg`);
        console.log(`area ${m.area.toFixed(0)} m2, centroid ${m.centroid.map((v) => v.toFixed(6)).join(", ")}`);
      });
    }
  );
  req.on("error", (e) => { console.error(e.message); process.exit(1); });
  req.end(body);
}

/* Local metres around the ring's own centroid; the same equirectangular
 * projector the scene uses (js/scene-3d.js makeProjector). */
function ringMetrics(ring) {
  const pts = ring.slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const lng0 = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const xy = pts.map(([lng, lat]) => [(lng - lng0) * 111320 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * 110574]);
  let area = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; area += x1 * y2 - x2 * y1; }
  area = Math.abs(area) / 2;
  const xs = xy.map((p) => p[0]), ys = xy.map((p) => p[1]);
  const bbox = { w: Math.max(...xs) - Math.min(...xs), d: Math.max(...ys) - Math.min(...ys) };
  // minimum-area rectangle: try every edge direction (rotating calipers, brute force)
  let best = null;
  for (let i = 0; i < xy.length; i++) {
    const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length];
    const th = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(-th), s = Math.sin(-th);
    const r = xy.map(([x, y]) => [x * c - y * s, x * s + y * c]);
    const rx = r.map((p) => p[0]), ry = r.map((p) => p[1]);
    const w = Math.max(...rx) - Math.min(...rx), d = Math.max(...ry) - Math.min(...ry);
    if (!best || w * d < best.w * best.d) best = { w, d, th };
  }
  const long = best.w >= best.d ? best.th : best.th + Math.PI / 2;
  // bearing of the long axis, clockwise from north, folded to [0, 180)
  let bearing = ((90 - (long * 180) / Math.PI) % 180 + 180) % 180;
  const rect = { w: Math.max(best.w, best.d), d: Math.min(best.w, best.d), bearing };
  return { area, bbox, rect, centroid: [lng0, lat0] };
}

/* ---------- picks -> metres, the generic form ----------
 * For sets other than the Shore Temple: every monument X has X_base and X_apex
 * picks, the apex carrying cited_m; that fixes px/m per monument per image, and
 * every other X_* pick becomes metres above X_base. count_* and ratio_* pass
 * through. */
function deriveGeneric() {
  const picksDoc = JSON.parse(fs.readFileSync(PICKS, "utf8"));
  const picks = picksDoc.picks;
  const out = {
    _note: `Generated by scripts/build-shore-temple-measure.js --set=${SET} --derive from assets/reference/${SET}/measure/picks.json.`,
    measured: new Date().toISOString().slice(0, 10),
    method: "Pixel rows picked by eye off gridded 1920 px renditions of Commons photographs; per monument, base and apex picks fix the scale through the cited height; camera tilt uncorrected.",
    photos: PHOTOS.map((p) => ({ file: p.file, licence: p.licence, view: p.view, used_for: p.used_for })),
    picks,
    derived: {},
    counts: {},
    ratios: {},
  };
  const byImg = {};
  for (const p of picks) (byImg[p.image] = byImg[p.image] || []).push(p);
  for (const [img, ps] of Object.entries(byImg)) {
    const names = new Set(ps.map((p) => (p.label.match(/^([a-z]+)_apex$/) || [])[1]).filter(Boolean));
    for (const name of names) {
      const apex = ps.find((p) => p.label === `${name}_apex`), base = ps.find((p) => p.label === `${name}_base`);
      if (!apex || !base || !apex.cited_m) continue;
      const pxm = (base.y - apex.y) / apex.cited_m;
      const rows = { cited_height_m: apex.cited_m, px_per_m: +pxm.toFixed(1), image: img };
      for (const p of ps) if (p.label.startsWith(name + "_") && p.y !== undefined) rows[p.label.slice(name.length + 1)] = +((base.y - p.y) / pxm).toFixed(2);
      out.derived[name] = Object.assign(out.derived[name] || {}, rows);
    }
  }
  for (const p of picks) if (/^count_/.test(p.label)) out.counts[p.label.slice(6)] = { value: p.n, image: p.image, note: p.note };
  for (const p of picks) if (/^ratio_/.test(p.label)) out.ratios[p.label.slice(6)] = { value: p.value, image: p.image, note: p.note };
  fs.writeFileSync(PROPORTIONS, JSON.stringify(out, null, 2));
  console.log(`wrote ${path.relative(root, PROPORTIONS)}`);
  console.log(JSON.stringify(out.derived, null, 1));
}

/* ---------- picks -> metres ---------- */
function derive() {
  if (SET !== "shore-temple") return deriveGeneric();
  const picksDoc = JSON.parse(fs.readFileSync(PICKS, "utf8"));
  const picks = picksDoc.picks;
  const byImg = {};
  for (const p of picks) (byImg[p.image] = byImg[p.image] || []).push(p);
  const get = (img, label) => (byImg[img] || []).find((p) => p.label === label);

  const CITED_H = 18.0;
  const out = {
    _note: "Generated by scripts/build-shore-temple-measure.js --derive from assets/reference/shore-temple/measure/picks.json. Proportions of the Shore Temple reconstruction; see data/research/3d/06-shore-temple-rebuild.md.",
    measured: new Date().toISOString().slice(0, 10),
    method: "Pixel rows/columns picked by eye off gridded 1920 px renditions of Commons photographs (uncorrected for camera tilt; distant, near-square-on views), converted to metres through the one cited height.",
    scale: {
      cited_height_m: CITED_H,
      definition: "18.0 m is taken as court level to the tip of the kalasha, plinth included. The source gives 60 ft (18 m) without saying whether the plinth is included; this is a definition, declared, not a citation.",
      source: "Wikipedia, Shore Temple: 60 feet (18 m) high on a 50 feet (15 m) square platform",
      sourceUrl: "https://en.wikipedia.org/wiki/Shore_Temple",
    },
    photos: PHOTOS.map((p) => ({ file: p.file, licence: p.licence, author: p.author, view: p.view, used_for: p.used_for })),
    picks,
    derived: {},
    uncertainty: {},
  };

  if (fs.existsSync(PRAKARA)) {
    const g = JSON.parse(fs.readFileSync(PRAKARA, "utf8"));
    const m = ringMetrics(g.features[0].geometry.coordinates[0]);
    out.prakara = {
      osm: "way/370135158", from: path.relative(root, PRAKARA).replace(/\\/g, "/"),
      rect_w_m: +m.rect.w.toFixed(1), rect_d_m: +m.rect.d.toFixed(1), rect_bearing_deg: +m.rect.bearing.toFixed(1),
      bbox_w_m: +m.bbox.w.toFixed(1), bbox_d_m: +m.bbox.d.toFixed(1), area_m2: +m.area.toFixed(0),
      note: "The model's compound is built to the minimum-area rectangle. Earlier figures in this repo: 46.4 x 21.5 m (content/mahabalipuram-heights.js) and 49.0 x 31.4 m (the first massing build) — see 06-shore-temple-rebuild.md for which was which.",
    };
  }

  /* Each derivation names its image and its picks. A quantity read from two
   * images gets both values and the spread. */
  const D = out.derived;
  const U = out.uncertainty;
  /* The court itself is hidden behind the nandi wall in every usable frame, so
   * the base reference is the TOP OF THE PLINTH, and the plinth's own height is
   * an assumption (PLINTH_H) declared in the output: 18.0 m court-to-tip means
   * 18.0 - PLINTH_H from plinth top to tip. Where a frame has no plinth_top
   * either, its scale comes from the dome (dome_base -> dome_top) as read in a
   * frame that has both. */
  const PLINTH_H = 1.2;
  out.scale.plinth_h_m = PLINTH_H;
  out.scale.plinth_note = "The moulded plinth under the aditala is taken as 1.2 m high — an assumption, not a reading: no frame shows the court floor beside it. Every height above court is (reading above plinth top) + 1.2.";
  const scales = {};
  for (const img of Object.keys(byImg)) {
    const c = get(img, "plinth_top"), k = get(img, "kalasha_tip");
    if (c && k) scales[img] = (c.y - k.y) / (CITED_H - PLINTH_H);   // px per metre, this image
  }
  // secondary scale: a frame with the dome but no plinth, scaled by the dome height read in a primary frame
  let domeH = null;
  for (const img of Object.keys(scales)) { const b0 = get(img, "dome_base"), t = get(img, "dome_top"); if (b0 && t) domeH = (b0.y - t.y) / scales[img]; }
  for (const img of Object.keys(byImg)) {
    if (scales[img]) continue;
    const b0 = get(img, "dome_base"), t = get(img, "dome_top");
    if (b0 && t && domeH) { scales[img] = (b0.y - t.y) / domeH; (out.uncertainty.secondary_scale = out.uncertainty.secondary_scale || {})[img] = `scaled through the dome height ${domeH.toFixed(2)} m read in the primary frame`; }
  }
  out.scale.px_per_m = scales;
  const m = (img, y) => (scales[img] ? y / scales[img] : null);

  // tall vimana: storey tops (eave lines) from the court up, on every image that has a plinth_top
  const stack = {};
  for (const img of Object.keys(scales)) {
    const c = get(img, "plinth_top");
    if (!c) continue;
    const rows = {};
    for (const p of byImg[img]) if (/^(eave_\d|hara_top_\d|griva_base|dome_base|dome_top|kalasha_tip|plinth_top|west_\w+)$/.test(p.label) && p.y !== undefined) rows[p.label] = +(m(img, c.y - p.y) + PLINTH_H).toFixed(2);
    stack[img] = rows;
  }
  // a frame without plinth_top still gives DIFFERENCES: tip minus each eave
  for (const img of Object.keys(scales)) {
    if (get(img, "plinth_top")) continue;
    const k = get(img, "kalasha_tip"); if (!k) continue;
    const rows = {};
    for (const p of byImg[img]) if (/^(eave_\d|dome_base|dome_top|west_kalasha_tip)$/.test(p.label) && p.y !== undefined) rows[`tip_minus_${p.label}`] = +m(img, p.y - k.y).toFixed(2);
    stack[img] = rows;
  }
  D.vimana_east = { heights_m_above_court: stack };
  // widths from paired left/right picks at the same tier, on any image with a scale
  const widths = {};
  for (const img of Object.keys(scales)) {
    for (const p of byImg[img]) {
      const mm = /^tower_left_(\w+)$/.exec(p.label);
      if (!mm) continue;
      const r = get(img, `tower_right_${mm[1]}`);
      if (r) (widths[mm[1]] = widths[mm[1]] || {})[img] = +m(img, r.x - p.x).toFixed(2);
    }
  }
  D.vimana_east.widths_m = widths;
  // counts, copied through as picked (label count_<thing>, value n)
  const counts = {};
  for (const p of picks) if (/^count_/.test(p.label)) counts[p.label.slice(6)] = { value: p.n, image: p.image, note: p.note };
  D.counts = counts;
  // anything labelled ratio_* is a direct ratio pick (e.g. west tower height / east tower height on one image)
  for (const p of picks) if (/^ratio_/.test(p.label)) (D.ratios = D.ratios || {})[p.label.slice(6)] = { value: p.value, image: p.image, note: p.note };
  // spread across images for any quantity present twice
  for (const [q, vals] of Object.entries(widths)) {
    const v = Object.values(vals);
    if (v.length > 1) U[`width_${q}`] = { values: vals, spread_m: +(Math.max(...v) - Math.min(...v)).toFixed(2) };
  }
  U.perspective = "Vertical picks are uncorrected for camera tilt. On views from 80–150 m with the camera near eye level the error on relative tier heights is a few per cent; each pick carries its own ± in pixels.";
  U.occlusion = "In front-view-mahabalipuram.jpg the tall tower's ground storey is hidden behind the west shrine; its ground-storey height comes from the south-west view only.";

  fs.writeFileSync(PROPORTIONS, JSON.stringify(out, null, 2));
  console.log(`wrote ${path.relative(root, PROPORTIONS)}`);
  console.log(JSON.stringify(D, null, 1).slice(0, 3000));
}

const arg = process.argv.slice(2).find((a) => a === "--rulers" || a === "--fetch-prakara" || a === "--derive");
if (arg === "--rulers") rulers();
else if (arg === "--fetch-prakara") fetchPrakara();
else if (arg === "--derive") derive();
else { console.log("usage: --rulers | --fetch-prakara | --derive"); process.exit(1); }
