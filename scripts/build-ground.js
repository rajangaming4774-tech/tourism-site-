#!/usr/bin/env node
/* Bake the satellite ground texture for the 3D scene.
 *
 * WHAT THIS PRODUCES
 *   assets/textures/ground-s2.jpg   400 x 400 px, one pixel = 10 m, the 4 km
 *                                   board centred on the scene origin
 *   assets/textures/ground-s2.json  provenance sidecar the page reads
 *
 * WHERE THE PIXELS COME FROM
 *   Copernicus Sentinel-2 L2A "visual" (true colour, TCI) — free, open, no API
 *   key. Found through the Earth Search STAC (earth-search.aws.element84.com)
 *   and read straight off Element 84's public cloud-optimised GeoTIFF bucket by
 *   HTTP range request, so only the two 1 MB tiles under the board are fetched,
 *   never the 292 MB file. Nothing here runs in the browser; the browser gets
 *   the JPEG from assets/, served from 'self', so vercel.json's CSP is
 *   untouched.
 *
 * WHY NO GDAL, NO NPM
 *   Same posture as build-terrain.js, which hand-decodes PNG with zlib "because
 *   this repo has no npm". The TCI is a classic TIFF with DEFLATE + horizontal
 *   predictor, 8-bit RGB, 1024 px tiles — Node's builtin zlib inflates it and
 *   the predictor is one addition per byte. Anything else in the header (JPEG-
 *   compressed, BigTIFF, 16-bit, striped) makes this script refuse loudly
 *   rather than write quiet nonsense.
 *
 * WHAT IS DELIBERATELY NOT DONE
 *   No sharpening, no contrast stretch, no gamma, no gain, no upscaling. The
 *   file is evidence and ships at native 10 m. Sharpening invents edges the
 *   sensor did not see; a stretch misrepresents how dark the coastal scrub is.
 *   The one unavoidable decision — the TCI is linearly scaled reflectance and
 *   the page loads it as sRGB, like every viewer of this product does — is
 *   written into the sidecar so it is on the record.
 *
 * GEOMETRY
 *   Per output pixel: scene (x, z) -> lng/lat by inverting the scene's own
 *   projector (scene-massing.js makeProjector: +X east, -Z north, metres by
 *   111320*cos(lat0) and 110574) -> UTM zone 44N -> source pixel, bilinear.
 *   Not a rectangular crop: UTM grid convergence at this longitude is ~6 m
 *   across the board, below a pixel but real, and per-pixel costs nothing.
 *
 * Usage:
 *   node scripts/build-ground.js            # pinned scene below
 *   node scripts/build-ground.js --search   # re-query STAC for the newest
 *                                           # 0%-cloud scene over the site
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "assets/textures");
const OUT_JPG = join(OUT_DIR, "ground-s2.jpg");
const OUT_JSON = join(OUT_DIR, "ground-s2.json");
const TMP_PPM = join(ROOT, "scripts/.ground-s2.ppm");

/* Pinned. The repo's convention is that a diff means the world changed, not
 * that a search ranked differently today. --search overrides. */
const SCENE_ID = "S2C_44PMV_20260305_0_L2A";
const STAC = "https://earth-search.aws.element84.com/v1/search";

/* Must equal build-terrain.js / makeProjector's origin, or the photo lands
 * beside the terrain instead of on it. */
const ORIGIN = { lng: 80.1915, lat: 12.6168 };
const HALF_M = 2000;
const OUT_PX = 400;                 // 4000 m / 10 m. 400, not 401: pixel CENTRES then sit
                                    // exactly on 10 m sample centres, no half-texel fudge.
const M_PER_DEG_LAT = 110574;       // scene-massing.js
const M_PER_DEG_LNG = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

/* Self-test target: the scene origin in UTM 44N, computed independently. If
 * the forward formula below drifts by more than a metre from this, the whole
 * bake is misplaced and it must not run. */
const ORIGIN_UTM = { E: 412189.9, N: 1394895.0 };

function die(msg) {
  console.error("build-ground: " + msg);
  process.exit(1);
}

/* ---------- WGS84 -> UTM 44N (Snyder transverse Mercator) ---------- */
function utmForward(lng, lat, zone = 44) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const lam0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = lat * Math.PI / 180, lam = lng * Math.PI / 180;
  const sp = Math.sin(phi), cp = Math.cos(phi), tp = Math.tan(phi);
  const N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * (lam - lam0);
  const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * phi
    - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
    + (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
  const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const Nn = k0 * (M + N * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
    + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { E, N: Nn };
}

/* ---------- HTTP ---------- */
async function range(url, a, b) {
  const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } });
  if (r.status !== 206) die(`range ${a}-${b} on ${url} gave HTTP ${r.status}, expected 206`);
  return Buffer.from(await r.arrayBuffer());
}

async function stacItem(id) {
  const body = id
    ? { collections: ["sentinel-2-l2a"], ids: [id] }
    : {
        collections: ["sentinel-2-l2a"],
        intersects: { type: "Point", coordinates: [ORIGIN.lng, ORIGIN.lat] },
        query: { "eo:cloud_cover": { lt: 2 } },
        sortby: [{ field: "properties.datetime", direction: "desc" }],
        limit: 10,
      };
  const r = await fetch(STAC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) die(`STAC search HTTP ${r.status}`);
  const j = await r.json();
  const f = (j.features || [])[0];
  if (!f) die(id ? `scene ${id} not found in STAC` : "no cloud-free scene found over the site");
  const vis = f.assets && f.assets.visual;
  if (!vis || !vis.href) die(`scene ${f.id} has no 'visual' asset`);
  return {
    id: f.id,
    href: vis.href,
    datetime: f.properties.datetime,
    platform: f.properties.platform,
    cloud: f.properties["eo:cloud_cover"],
    sunAz: f.properties["view:sun_azimuth"],
    sunEl: f.properties["view:sun_elevation"],
  };
}

/* ---------- classic TIFF IFD ---------- */
function parseIFD(b) {
  const le = b.toString("latin1", 0, 2) === "II";
  if (!le && b.toString("latin1", 0, 2) !== "MM") die("not a TIFF");
  const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const f64 = (o) => (le ? b.readDoubleLE(o) : b.readDoubleBE(o));
  if (u16(2) !== 42) die(`TIFF magic ${u16(2)} — BigTIFF (43) is not handled here`);
  const ifd = u32(4), n = u16(ifd);
  const tags = {};
  let need = 0;
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12, tag = u16(e), typ = u16(e + 2), cnt = u32(e + 4);
    const sz = { 1: 1, 2: 1, 3: 2, 4: 4, 12: 8 }[typ];
    if (!sz) continue;
    const inline = sz * cnt <= 4;
    const off = inline ? e + 8 : u32(e + 8);
    if (!inline && off + sz * cnt > b.length) { need = Math.max(need, off + sz * cnt); continue; }
    const rd = (k) => (typ === 3 ? u16(off + k * 2) : typ === 4 ? u32(off + k * 4) : typ === 12 ? f64(off + k * 8) : b[off + k]);
    tags[tag] = Array.from({ length: cnt }, (_, k) => rd(k));
  }
  return { tags, need };
}

function assertTag(tags, tag, want, name) {
  const v = tags[tag] && tags[tag][0];
  if (v !== want) die(`${name} is ${v}, this reader only handles ${want}`);
}

/* ---------- main ---------- */
const search = process.argv.includes("--search");
const item = await stacItem(search ? null : SCENE_ID);
console.log(`scene   ${item.id}  ${item.datetime}  cloud ${item.cloud}%  sun az ${item.sunAz?.toFixed(1)} el ${item.sunEl?.toFixed(1)}`);

// Self-test the projection before touching any pixel.
const o = utmForward(ORIGIN.lng, ORIGIN.lat);
const dE = Math.abs(o.E - ORIGIN_UTM.E), dN = Math.abs(o.N - ORIGIN_UTM.N);
if (dE > 1 || dN > 1) die(`UTM self-test failed: origin -> E ${o.E.toFixed(1)} N ${o.N.toFixed(1)}, expected E ${ORIGIN_UTM.E} N ${ORIGIN_UTM.N}`);

// Header. 16 KB is enough for the IFD; refetch if a tag array lands beyond it.
let head = await range(item.href, 0, 16383);
let { tags, need } = parseIFD(head);
if (need) {
  head = await range(item.href, 0, need + 1024);
  ({ tags, need } = parseIFD(head));
  if (need) die("tag arrays beyond " + need + " bytes — header larger than expected");
}
assertTag(tags, 259, 8, "Compression (8 = DEFLATE)");
assertTag(tags, 277, 3, "SamplesPerPixel");
assertTag(tags, 284, 1, "PlanarConfig (1 = chunky)");
if (!tags[258] || tags[258].some((v) => v !== 8)) die("BitsPerSample is not 8,8,8");
const pred = (tags[317] || [1])[0];
if (pred !== 1 && pred !== 2) die("Predictor " + pred + " unsupported");
const W = tags[256][0], TW = tags[322]?.[0], TH = tags[323]?.[0];
if (!TW) die("striped TIFF, not tiled — this reader expects tiles");
const [sx, sy] = tags[33550], tp = tags[33922];
const E0 = tp[3], N0 = tp[4];
const tilesX = Math.ceil(W / TW);
console.log(`source  ${W}px  tile ${TW}x${TH}  predictor ${pred}  origin E${E0} N${N0}  ${sx} m/px`);
if (sx !== 10 || sy !== 10) die(`expected 10 m/px, got ${sx}/${sy}`);

/* Output pixel -> source pixel, per pixel, through the scene's own projector. */
function sourcePx(i, j) {
  const x = -HALF_M + (i + 0.5) * (2 * HALF_M / OUT_PX);
  const z = -HALF_M + (j + 0.5) * (2 * HALF_M / OUT_PX);
  const lng = ORIGIN.lng + x / M_PER_DEG_LNG;
  const lat = ORIGIN.lat - z / M_PER_DEG_LAT;          // -Z is north
  const u = utmForward(lng, lat);
  return [(u.E - E0) / sx - 0.5, (N0 - u.N) / sy - 0.5]; // pixel-centre space
}

// Which tiles does the board touch?
const needTiles = new Set();
for (const [i, j] of [[0, 0], [OUT_PX - 1, 0], [0, OUT_PX - 1], [OUT_PX - 1, OUT_PX - 1], [OUT_PX / 2, OUT_PX / 2]]) {
  const [px, py] = sourcePx(i, j);
  for (const dx of [0, 1]) for (const dy of [0, 1])
    needTiles.add(Math.floor((py + dy) / TH) * tilesX + Math.floor((px + dx) / TW));
}
const tiles = new Map();
let fetched = 0;
for (const t of needTiles) {
  const off = tags[324][t], len = tags[325][t];
  if (off === undefined) die("tile " + t + " outside the image — board is off the scene");
  const raw = inflateSync(await range(item.href, off, off + len - 1));
  fetched += len;
  if (raw.length !== TW * TH * 3) die(`tile ${t} inflated to ${raw.length} B, expected ${TW * TH * 3}`);
  if (pred === 2) for (let r = 0; r < TH; r++) {
    const row = r * TW * 3;
    for (let c = 3; c < TW * 3; c++) raw[row + c] = (raw[row + c] + raw[row + c - 3]) & 255;
  }
  tiles.set(t, raw);
}
console.log(`tiles   ${[...needTiles].join(", ")}  (${(fetched / 1e6).toFixed(2)} MB fetched)`);

function sample(px, py, ch) {
  const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
  const at = (x, y) => {
    const t = tiles.get(Math.floor(y / TH) * tilesX + Math.floor(x / TW));
    if (!t) die(`sample outside fetched tiles at ${x},${y}`);
    return t[((y % TH) * TW + (x % TW)) * 3 + ch];
  };
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

const out = Buffer.alloc(OUT_PX * OUT_PX * 3);
let nodata = 0, sum = [0, 0, 0];
for (let j = 0; j < OUT_PX; j++) for (let i = 0; i < OUT_PX; i++) {
  const [px, py] = sourcePx(i, j);
  const d = (j * OUT_PX + i) * 3;
  let black = true;
  for (let c = 0; c < 3; c++) { const v = Math.round(sample(px, py, c)); out[d + c] = v; sum[c] += v; if (v) black = false; }
  if (black) nodata++;
}
if (nodata) die(`${nodata} nodata pixels on the board — pick another scene`);

/* Calibration samples the page uses to tune exposure: "the photo renders as
 * the photo". Town core is a 600 m box round the bus stand. */
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
function meanBox(x0, z0, x1, z1) {
  const s = [0, 0, 0]; let n = 0;
  for (let j = 0; j < OUT_PX; j++) for (let i = 0; i < OUT_PX; i++) {
    const x = -HALF_M + (i + 0.5) * 10, z = -HALF_M + (j + 0.5) * 10;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    const d = (j * OUT_PX + i) * 3; s[0] += out[d]; s[1] += out[d + 1]; s[2] += out[d + 2]; n++;
  }
  return n ? hex(s[0] / n, s[1] / n, s[2] / n) : null;
}
const nPx = OUT_PX * OUT_PX;
const calibration = {
  board_mean: hex(sum[0] / nPx, sum[1] / nPx, sum[2] / nPx),
  town_core: meanBox(-100, -200, 500, 400),    // around the bus stand / bazaar
  sea_far: meanBox(1200, -1800, 1900, 1800),   // 1-2 km offshore
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(TMP_PPM, Buffer.concat([Buffer.from(`P6\n${OUT_PX} ${OUT_PX}\n255\n`), out]));
try {
  // 4:4:4 chroma: at 10 m/px colour IS the information; 4:2:0 would halve it.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", TMP_PPM, "-q:v", "3", "-pix_fmt", "yuvj444p", OUT_JPG]);
} catch (e) {
  die("ffmpeg failed or is not on PATH — it is the repo's JPEG encoder (see scripts/encode-video.sh): " + e.message);
} finally {
  if (existsSync(TMP_PPM)) unlinkSync(TMP_PPM);
}

const sidecar = {
  _note: "Generated by scripts/build-ground.js — do not hand-edit. Real satellite imagery; see README.",
  scene_id: item.id,
  platform: item.platform,
  datetime: item.datetime,
  cloud_cover: item.cloud,
  sun: { azimuth_deg: item.sunAz, elevation_deg: item.sunEl },
  m_per_px: 10,
  px: OUT_PX,
  halfExtent_m: HALF_M,
  origin: ORIGIN,
  row0: "north",
  crs_source: "EPSG:32644",
  source_url: item.href,
  attribution: "Contains modified Copernicus Sentinel data " + item.datetime.slice(0, 4),
  processing:
    "Per-pixel reprojection scene -> WGS84 -> UTM 44N, bilinear resample to 10 m. " +
    "No sharpening, contrast, gamma or colour change. JPEG q3 4:4:4. The TCI is " +
    "linearly scaled reflectance and is loaded as sRGB, as every viewer of this product does.",
  calibration,
  generated: new Date().toISOString().slice(0, 10),
};
writeFileSync(OUT_JSON, JSON.stringify(sidecar, null, 2) + "\n");

const bytes = (await import("node:fs")).statSync(OUT_JPG).size;
console.log(`wrote   ${OUT_JPG}  ${bytes} B  (${OUT_PX}x${OUT_PX})`);
console.log(`wrote   ${OUT_JSON}`);
console.log(`colour  board ${calibration.board_mean}  town ${calibration.town_core}  sea ${calibration.sea_far}`);
