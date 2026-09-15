#!/usr/bin/env node
/* World coastlines for the opening globe.
 *
 * Natural Earth 110m land — public domain, so no licence question, and 110m is
 * the right scale for a globe you look at from 20,000 km up. Anything finer is
 * detail the sphere is too small to show.
 *
 * Coordinates are rounded to 2 decimal places (~1.1 km). On a globe rendered a
 * few hundred pixels across that is far below one pixel, and it roughly halves
 * the file. Rings shorter than 4 points, and specks below a minimum area, are
 * dropped — at this scale they are single invisible dots that still cost a draw.
 *
 * Usage:  node scripts/build-globe.js
 * Output: data/world-land.geojson
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "data", "world-land.geojson");
const SRC = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const MIN_AREA_DEG2 = 0.9; // roughly a 100 km island at the equator

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
}
const round = (ring) => ring.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);

(async () => {
  console.log("Fetching Natural Earth 110m land…");
  const res = await fetch(SRC, { headers: { "User-Agent": "india-heritage-map/1.0 (build script)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const src = await res.json();

  const rings = [];
  let dropped = 0;
  for (const f of src.features) {
    const g = f.geometry;
    if (!g) continue;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      // Outer ring only — a globe outline does not need lakes.
      const r = round(poly[0]);
      if (r.length < 4 || ringArea(r) < MIN_AREA_DEG2) {
        dropped++;
        continue;
      }
      rings.push(r);
    }
  }

  if (rings.length < 20) throw new Error(`only ${rings.length} rings survived — the source or filter is wrong`);

  const doc = {
    _note:
      "Coastline rings for the opening globe in mahabalipuram-3d.html. Natural Earth 110m land, " +
      "outer rings only, coordinates rounded to 2 dp (~1.1 km) and specks under " +
      MIN_AREA_DEG2 + " deg^2 dropped.",
    generated: new Date().toISOString().slice(0, 10),
    attribution: "Natural Earth (public domain)",
    rings,
  };
  fs.writeFileSync(outPath, JSON.stringify(doc));
  console.log(
    `wrote ${path.relative(root, outPath)}  ${rings.length} rings (${dropped} specks dropped), ` +
      `${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`
  );
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
