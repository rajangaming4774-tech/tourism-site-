#!/usr/bin/env node
/* Camera stations for the Shore Temple photogrammetry set, from EXIF GPS.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS
 * -----------------------------------
 * A Structure-from-Motion solve recovers shape but never SIZE: the result is
 * correct up to one unknown multiplier, so no height can be read off it until
 * something external fixes the scale.
 *
 * The photographs fix it themselves. Many carry a GPS position in EXIF, and
 * COLMAP will align a sparse model to known camera positions:
 *
 *   colmap model_aligner --input_path sparse/0 --output_path sparse/geo \
 *     --ref_images_path geo.txt --ref_is_gps 0 --alignment_type ecef \
 *     --robust_alignment 1 --robust_alignment_max_error 8
 *
 * After that the model is in metres and roughly north-aligned, which is also
 * the scene contract js/scene-3d.js states (1 unit = 1 metre, +X east, -Z north).
 *
 * HOW GOOD IS IT, HONESTLY
 * ------------------------
 * Consumer EXIF GPS is good to something like 5–10 m, and these are phones and
 * compacts held by visitors, not survey receivers. One fix is worthless for
 * scaling a 46 m compound. A hundred and fifty of them, fitted robustly, are
 * not: the errors are largely independent, so the scale factor they agree on is
 * far better than any single station.
 *
 * It is still a SECOND-BEST scale, and it exists to be cross-checked against the
 * first: the OSM prakara footprint at 46.4 × 21.5 m, which is a measured ground
 * truth this project already cites. If the GPS-aligned model and the prakara fit
 * disagree by more than a few per cent, that disagreement is the finding and
 * must be reported, not averaged away.
 *
 * Usage:  node scripts/build-shore-temple-geo.js
 * Input:  assets/reference/shore-temple/photogrammetry/images/
 * Output: photogrammetry/geo.txt          (COLMAP model_aligner reference)
 *         photogrammetry/camera-stations.geojson  (for looking at on a map)
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets", "reference", "shore-temple", "photogrammetry");
const imgDir = path.join(outDir, "images");

/* The monument, from data/pois.json — the same coordinate the site's own map
 * pins. Used only to reject fixes that cannot be of this temple. */
const SITE = { lng: 80.199235, lat: 12.61648 };
const MAX_KM = 1.5; // a photograph of the Shore Temple is not taken 2 km inland

const WGS84_A = 6378137.0;
const WGS84_E2 = 6.69437999014e-3;

/* Geodetic -> ECEF. model_aligner wants one consistent metric frame; ECEF is
 * the one that needs no projection choice and no zone. */
function toECEF(lat, lng, alt) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lng * Math.PI) / 180;
  const s = Math.sin(phi);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s);
  const h = alt || 0;
  return [
    (N + h) * Math.cos(phi) * Math.cos(lam),
    (N + h) * Math.cos(phi) * Math.sin(lam),
    (N * (1 - WGS84_E2) + h) * s,
  ];
}

/* ---------------- EXIF, far enough in to reach the GPS IFD ---------------- */

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

function gpsOf(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let p = 2;
  let app1 = -1;
  while (p + 4 <= buf.length && buf[p] === 0xff) {
    const marker = buf[p + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.toString("latin1", p + 4, p + 10) === "Exif\0\0") {
      app1 = p + 10;
      break;
    }
    p += 2 + len;
  }
  if (app1 < 0 || app1 + 8 > buf.length) return null;

  const tiff = app1;
  const le = buf.toString("latin1", tiff, tiff + 2) === "II";
  const u16 = (o) => (o + 2 <= buf.length ? (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o)) : 0);
  const u32 = (o) => (o + 4 <= buf.length ? (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o)) : 0);
  if (u16(tiff + 2) !== 42) return null;

  const rational = (o) => {
    const d = u32(o + 4);
    return d ? u32(o) / d : 0;
  };

  // Find the GPS IFD pointer (0x8825) in IFD0.
  const ifd0 = tiff + u32(tiff + 4);
  const n0 = u16(ifd0);
  if (n0 > 512) return null;
  let gpsOff = 0;
  for (let i = 0; i < n0; i++) {
    const e = ifd0 + 2 + i * 12;
    if (u16(e) === 0x8825) {
      gpsOff = tiff + u32(e + 8);
      break;
    }
  }
  if (!gpsOff || gpsOff + 2 > buf.length) return null;

  const g = {};
  const n = u16(gpsOff);
  if (n > 256) return null;
  for (let i = 0; i < n; i++) {
    const e = gpsOff + 2 + i * 12;
    if (e + 12 > buf.length) return null;
    const tag = u16(e);
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = (TYPE_SIZE[type] || 0) * count;
    const off = size <= 4 ? e + 8 : tiff + u32(e + 8);
    if (off + Math.min(size, 4) > buf.length) continue;

    // 1/3 = lat ref/value, 2/4 = lon ref/value, 5/6 = altitude ref/value.
    if (tag === 1 || tag === 3) g[tag === 1 ? "latRef" : "lngRef"] = buf.toString("latin1", off, off + 1);
    else if (tag === 2 || tag === 4) {
      if (count < 3 || off + 24 > buf.length) continue;
      const deg = rational(off);
      const min = rational(off + 8);
      const sec = rational(off + 16);
      g[tag === 2 ? "lat" : "lng"] = deg + min / 60 + sec / 3600;
    } else if (tag === 5) g.altRef = buf[off];
    else if (tag === 6) g.alt = rational(off);
  }

  if (typeof g.lat !== "number" || typeof g.lng !== "number") return null;
  if (!isFinite(g.lat) || !isFinite(g.lng)) return null;
  const lat = g.latRef === "S" ? -g.lat : g.lat;
  const lng = g.lngRef === "W" ? -g.lng : g.lng;
  if (lat === 0 && lng === 0) return null; // a null island fix is not a fix
  const alt = typeof g.alt === "number" && isFinite(g.alt) ? (g.altRef === 1 ? -g.alt : g.alt) : 0;
  return { lat, lng, alt };
}

/* ------------------------------------------------------------------------ */

const M_PER_DEG_LAT = 110574;
const mPerDegLng = 111320 * Math.cos((SITE.lat * Math.PI) / 180);

function main() {
  if (!fs.existsSync(imgDir)) {
    console.error("No " + imgDir + " — run build-shore-temple-sfm.js first.");
    process.exit(1);
  }
  const files = fs.readdirSync(imgDir).filter((f) => /\.(jpe?g|png)$/i.test(f));

  const kept = [];
  let noGps = 0;
  let tooFar = 0;
  for (const f of files) {
    const g = gpsOf(path.join(imgDir, f));
    if (!g) {
      noGps++;
      continue;
    }
    const east = (g.lng - SITE.lng) * mPerDegLng;
    const north = (g.lat - SITE.lat) * M_PER_DEG_LAT;
    const km = Math.hypot(east, north) / 1000;
    if (km > MAX_KM) {
      tooFar++;
      continue;
    }
    kept.push({ file: f, ...g, east, north, km });
  }

  kept.sort((a, b) => a.file.localeCompare(b.file));

  /* geo.txt — IMAGE_NAME X Y Z, one per line, ECEF metres. */
  fs.writeFileSync(
    path.join(outDir, "geo.txt"),
    kept
      .map((r) => {
        const [x, y, z] = toECEF(r.lat, r.lng, r.alt);
        return [r.file, x.toFixed(3), y.toFixed(3), z.toFixed(3)].join(" ");
      })
      .join("\n") + "\n"
  );

  /* GeoJSON, for looking at the stations on the guide map before trusting them.
   * Marked decorative:false — unlike the scattered palms these are measured
   * positions, but they are consumer GPS and the properties say so. */
  fs.writeFileSync(
    path.join(outDir, "camera-stations.geojson"),
    JSON.stringify(
      {
        type: "FeatureCollection",
        properties: {
          what: "EXIF GPS positions of the photographs in photogrammetry/images/",
          accuracy: "consumer GPS, roughly 5-10 m per fix; use in aggregate, never singly",
          source: "Wikimedia Commons uploaders; see ../SOURCES.md for per-file credit",
          generated: new Date().toISOString().slice(0, 10),
        },
        features: kept.map((r) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [r.lng, r.lat] },
          properties: {
            file: r.file,
            altitude_m: r.alt || null,
            metres_from_temple: Math.round(r.km * 1000),
          },
        })),
      },
      null,
      1
    )
  );

  /* A crude but useful check: how far around the monument do the stations
   * actually go? A solve is only as good as its worst-covered side, and this is
   * the cheapest possible warning that one side is missing. */
  const sectors = new Array(8).fill(0);
  for (const r of kept) {
    const bearing = (Math.atan2(r.east, r.north) * 180) / Math.PI;
    sectors[Math.floor((((bearing + 360) % 360) + 22.5) / 45) % 8]++;
  }
  const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

  console.log(
    kept.length +
      " stations written (" +
      noGps +
      " images with no GPS, " +
      tooFar +
      " rejected as further than " +
      MAX_KM +
      " km)"
  );
  console.log("coverage by side of the monument:");
  for (let i = 0; i < 8; i++) {
    console.log("  " + names[i].padEnd(3) + sectors[i]);
  }
  const dists = kept.map((r) => r.km * 1000).sort((a, b) => a - b);
  if (dists.length) {
    console.log(
      "distance from the temple: median " +
        Math.round(dists[Math.floor(dists.length / 2)]) +
        " m, range " +
        Math.round(dists[0]) +
        "-" +
        Math.round(dists[dists.length - 1]) +
        " m"
    );
  }
  console.log("-> " + outDir);
}

main();
