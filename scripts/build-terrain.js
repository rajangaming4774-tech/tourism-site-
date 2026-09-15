#!/usr/bin/env node
/* Bakes a real elevation heightmap for the 3D scene.
 *
 * The terrain in mahabalipuram-3d.html was a flat plane — a stand-in waiting on
 * a Blender asset. It does not need one: the site already has a real elevation
 * source (the Mapzen/AWS terrarium DEM the guide map uses for its 3D terrain),
 * so the ground can come from measured data instead of being modelled by hand.
 * That is strictly better than a stylised mesh: nobody has to trust that the
 * ridge is the right shape, because it is the surveyed shape.
 *
 * WHY THE PNG IS DECODED BY HAND
 * Terrarium tiles are PNGs and this repo has no npm, so there is no pngjs to
 * lean on. Decoding is only viable because these tiles are the simplest
 * possible case, verified before writing this: 256x256, 8-bit, colour type 2
 * (RGB), no interlacing. That is zlib.inflateSync plus PNG's five row filters —
 * about forty lines. If a tile ever arrives interlaced or paletted this script
 * fails loudly rather than writing quiet nonsense.
 *
 * Terrarium encoding: height_m = (R * 256 + G + B / 256) - 32768.
 *
 * Output: data/mahabalipuram-terrain.json — a grid of heights in DECIMETRES
 * (integers, to keep the file small), in the same scene frame pois.json uses:
 * origin at the centre of the site, +X east, -Z north, 1 unit = 1 metre.
 *
 * Usage:  node scripts/build-terrain.js
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "mahabalipuram-terrain.json");

/* Same origin as scripts/build-pois.js. These two must agree or the monuments
 * float away from the ground they stand on. */
const ORIGIN = { lng: 80.1915, lat: 12.6168 };
const HALF_M = 2000; // a 4 km square, so the scene has coast and hinterland
const GRID = 192; // 4000 / 192 ~ 21 m per sample; the DEM itself is ~30 m
const ZOOM = 14; // terrarium is interpolated above this — no detail to gain
const UA = "india-heritage-map/1.0 (static site build script; contact via repo)";

/* Terrarium carries real bathymetry to about -240 m offshore. Left raw it digs
 * a canyon beside the beach that dwarfs the 50 m ridge and wrecks the scene's
 * scale. Clamped shallow: the sea still reads as below land, without the hole. */
const SEA_FLOOR_M = -6;

const M_PER_DEG_LAT = 110574;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

/* ---------- Pure-Node PNG decode (8-bit RGB, non-interlaced only) ---------- */
function decodePNG(buf) {
  if (buf.slice(1, 4).toString() !== "PNG") throw new Error("not a PNG");
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || colorType !== 2 || interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, colour type ${colorType}, interlace ${interlace}`);
  }

  // Concatenate every IDAT chunk before inflating — tiles are often split.
  const idat = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.slice(off + 4, off + 8).toString();
    if (type === "IDAT") idat.push(buf.slice(off + 8, off + 8 + len));
    if (type === "IEND") break;
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));

  const bpp = 3;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0; // left
      const b = prev ? prev[i] : 0; // up
      const c = prev && i >= bpp ? prev[i - bpp] : 0; // upper-left
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        // Paeth
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unknown PNG filter ${filter}`);
      cur[i] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

/* ---------- Web-mercator tile maths ---------- */
const lngToX = (lng, z) => ((lng + 180) / 360) * Math.pow(2, z);
function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z);
}

const tiles = new Map();
async function tile(tx, ty) {
  const key = `${tx}/${ty}`;
  if (tiles.has(key)) return tiles.get(key);
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ZOOM}/${tx}/${ty}.png`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`tile ${key}: HTTP ${res.status}`);
  const img = decodePNG(Buffer.from(await res.arrayBuffer()));
  tiles.set(key, img);
  return img;
}

/* Bilinear sample, so a 21 m grid over a ~9 m/px tile does not stair-step. */
async function elevationAt(lng, lat) {
  const fx = lngToX(lng, ZOOM);
  const fy = latToY(lat, ZOOM);
  const px = (fx - Math.floor(fx)) * 256;
  const py = (fy - Math.floor(fy)) * 256;
  const img = await tile(Math.floor(fx), Math.floor(fy));

  const x0 = Math.max(0, Math.min(255, Math.floor(px)));
  const y0 = Math.max(0, Math.min(255, Math.floor(py)));
  const x1 = Math.min(255, x0 + 1);
  const y1 = Math.min(255, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;

  const at = (x, y) => {
    const i = (y * img.width + x) * 3;
    return img.data[i] * 256 + img.data[i + 1] + img.data[i + 2] / 256 - 32768;
  };
  const a = at(x0, y0);
  const b = at(x1, y0);
  const c = at(x0, y1);
  const d = at(x1, y1);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

(async () => {
  console.log(`Sampling ${GRID}x${GRID} elevations over ${(HALF_M * 2) / 1000} km at z${ZOOM}…`);
  const heights = new Array(GRID * GRID);
  let min = Infinity;
  let max = -Infinity;
  let sea = 0;

  for (let j = 0; j < GRID; j++) {
    // Row 0 is the NORTH edge, so -Z maps to north as the scene frame requires.
    const z = -HALF_M + (j / (GRID - 1)) * HALF_M * 2;
    const lat = ORIGIN.lat - z / M_PER_DEG_LAT;
    for (let i = 0; i < GRID; i++) {
      const x = -HALF_M + (i / (GRID - 1)) * HALF_M * 2;
      const lng = ORIGIN.lng + x / mPerDegLng(ORIGIN.lat);
      let h = await elevationAt(lng, lat);
      if (h < SEA_FLOOR_M) {
        h = SEA_FLOOR_M;
        sea++;
      }
      min = Math.min(min, h);
      max = Math.max(max, h);
      heights[j * GRID + i] = Math.round(h * 10); // decimetres
    }
    if (j % 32 === 0) process.stdout.write(`  row ${j}/${GRID}\r`);
  }

  if (max - min < 3) throw new Error(`terrain is flat (${min}..${max} m) — the DEM fetch is probably wrong`);

  const doc = {
    _note:
      "Elevation grid for mahabalipuram-3d.html, sampled from the Mapzen/AWS terrarium DEM " +
      "(~30 m source). Heights are DECIMETRES above sea level, row 0 = north edge. Scene frame: " +
      "origin at the site centre, +X east, -Z north, 1 unit = 1 m. Seafloor clamped to " +
      SEA_FLOOR_M + " m — the raw DEM reaches about -240 m offshore, which dwarfs the ridge.",
    generated: new Date().toISOString().slice(0, 10),
    origin: ORIGIN,
    halfExtent_m: HALF_M,
    grid: GRID,
    unit: "decimetres",
    seaFloor_m: SEA_FLOOR_M,
    attribution: "Elevation: Mapzen / AWS Terrain Tiles (SRTM et al.)",
    min_m: +min.toFixed(1),
    max_m: +max.toFixed(1),
    heights,
  };

  fs.writeFileSync(outPath, JSON.stringify(doc));
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(
    `\nwrote ${path.relative(root, outPath)}  ${GRID}x${GRID}, ${min.toFixed(1)}..${max.toFixed(1)} m, ` +
      `${((sea / (GRID * GRID)) * 100).toFixed(0)}% at sea floor, ${tiles.size} tiles, ${kb} KB`
  );
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
