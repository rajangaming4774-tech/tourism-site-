// Merges data/research/*.json into app-ready data/sites.geojson.
// Run: node scripts/build-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const researchDir = path.join(root, "data", "research");

const LAYERS = [
  { file: "rock_art.json", type: "rock_art" },
  { file: "temples.json", type: "temple" },
  { file: "asi_unesco.json", type: "asi_site" },
  { file: "excavations.json", type: "excavation" },
];

// The slider spans 2000 BC - 2026 AD; older true dates are kept in
// `true_period_start` and the display value clamps to the slider range.
const CLAMP_MIN = -2000;

const features = [];
for (const layer of LAYERS) {
  const raw = JSON.parse(fs.readFileSync(path.join(researchDir, layer.file), "utf8"));
  for (const site of raw) {
    const { lat, lng, ...props } = site;
    if (typeof lat !== "number" || typeof lng !== "number") {
      throw new Error(`${site.id} (${site.name}): missing coordinates`);
    }
    const clampedStart = Math.max(site.period_start, CLAMP_MIN);
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: {
        ...props,
        type: layer.type,
        true_period_start: site.period_start,
        period_start: clampedStart,
      },
    });
  }
}

// De-overlap markers that share (almost) the same coordinates — Hampi, Sanchi,
// Dholavira etc. exist in multiple layers. Spread co-located markers in a small
// ring (~1.5 km) so every dot stays hoverable and clickable.
const cells = new Map();
for (const f of features) {
  const [lng, lat] = f.geometry.coordinates;
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (!cells.has(key)) cells.set(key, []);
  cells.get(key).push(f);
}
for (const group of cells.values()) {
  if (group.length < 2) continue;
  group.forEach((f, i) => {
    const angle = (2 * Math.PI * i) / group.length;
    f.geometry.coordinates = [
      f.geometry.coordinates[0] + 0.015 * Math.cos(angle),
      f.geometry.coordinates[1] + 0.015 * Math.sin(angle),
    ];
  });
}

const collection = { type: "FeatureCollection", features };
fs.writeFileSync(path.join(root, "data", "sites.geojson"), JSON.stringify(collection, null, 1));

const counts = {};
for (const f of features) counts[f.properties.type] = (counts[f.properties.type] || 0) + 1;
console.log(`sites.geojson written: ${features.length} sites`, counts);

// Sanity checks: unique ids, coordinates inside India's bounding box.
const ids = new Set();
for (const f of features) {
  const p = f.properties;
  if (ids.has(p.id)) throw new Error(`duplicate id ${p.id}`);
  ids.add(p.id);
  const [lng, lat] = f.geometry.coordinates;
  if (lat < 6 || lat > 37 || lng < 68 || lng > 98) {
    console.warn(`WARN ${p.id} ${p.name}: coordinates outside India bbox (${lat}, ${lng})`);
  }
}
console.log("validation passed");
