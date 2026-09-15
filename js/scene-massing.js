/* Buildings, monuments and granite for the 3D scene — extruded from the same
 * GeoJSON the guide map uses, so both views are built from one set of facts.
 *
 * This is what replaces the placeholder boxes. No Blender asset was needed for
 * it: the massing already exists as data, generated and assertion-gated by
 * scripts/fetch-site-data.js and scripts/fetch-context-massing.js. Extruding it
 * here means the monument you orbit is the cited height, not a stand-in.
 *
 * WHAT IS AND IS NOT REAL, carried over unchanged from those pipelines:
 *  - Monument tiers come from measured, cited heights. A monument with no
 *    citation is not in the file at all.
 *  - Town buildings are NOMINAL: OSM records a height for one of 119 of them.
 *    They are massed by tag and painted to read as scene-setting.
 *  - Granite outcrops are real OSM outlines at a nominal, size-scaled height.
 * Nothing here upgrades a guess into a fact by rendering it more prettily.
 */
import * as THREE from "../assets/vendor/three.module.js";

const M_PER_DEG_LAT = 110574;

export function makeProjector(origin) {
  const mPerDegLng = 111320 * Math.cos((origin.lat * Math.PI) / 180);
  return (lngLat) => [
    (lngLat[0] - origin.lng) * mPerDegLng,
    -(lngLat[1] - origin.lat) * M_PER_DEG_LAT, // -Z is north
  ];
}

/* One ring -> one extruded slab standing on the terrain.
 *
 * ExtrudeGeometry builds along +Z, so the whole thing is rotated flat
 * afterwards. Doing it that way rather than hand-rolling side walls keeps the
 * winding and the normals ExtrudeGeometry already gets right — the guide map
 * had a bug where inconsistently wound OSM rings lit one group inside-out, and
 * this avoids re-fighting it.
 */
function slab(ring2d, base, top) {
  /* MIRROR FIX. The shape is authored in its own XY plane and then rotated by
   * -90deg about X, which maps shape +Y onto world -Z. Feeding it (x, z)
   * directly therefore drew every footprint at -z: the whole massing — 238
   * buildings, 55 rock masses and the cited monuments — was mirrored north to
   * south. It was invisible because the town is roughly symmetrical about the
   * origin, but Krishna's Butterball sat 500 m from where OSM puts it, and its
   * POI pin pointed at bare ground on the opposite side of the site.
   *
   * Negating z here undoes the rotation's flip. Mirroring a polygon also
   * reverses its winding, so the ring is reversed to put it back — this module
   * already had one fight with inside-out normals from inconsistent OSM ring
   * order and there is no need for another.
   *
   * Note the ground sample in the caller was always taken at the TRUE x/z, so
   * before this the geometry and the height it stood on disagreed. */
  const pts = ring2d.map(([x, z]) => [x, -z]).reverse();
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.05, top - base),
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, base, 0);
  return geo;
}

/* Terrain-following: a slab sits on the ground under its own centroid. The
 * whole stack of one monument must use ONE sample, or the tiers shear apart on
 * a slope — the guide map asserts the same thing for the same reason. */
function centroid(ring2d) {
  let x = 0;
  let z = 0;
  for (const p of ring2d) {
    x += p[0];
    z += p[1];
  }
  return [x / ring2d.length, z / ring2d.length];
}

function ringsOf(feature, project) {
  const g = feature.geometry;
  if (!g) return [];
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  // Outer ring only. Holes would need Shape.holes, and none of this data has any.
  return polys.map((p) => p[0].map(project)).filter((r) => r.length >= 4);
}

/* Merges every feature of one kind into a single geometry. 400+ separate meshes
 * would be 400+ draw calls; merged, the town is one. This is the single biggest
 * thing keeping the scene at frame rate on a phone. */
function mergeAll(geos) {
  if (!geos.length) return null;
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    pos.set(p, o * 3);
    nor.set(n, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return out;
}

/* Standard, not Lambert, so the massing takes the same sky light as the ground
 * and the GLB monuments (only Standard receives scene.environment in r169).
 * Albedos are the old cream-sand values darkened ~35 %: those were tuned
 * against a sand-coloured board, and over the satellite photograph — median
 * land luminance 85/255 — they floated as pale paper boxes. The relative
 * tints are kept; only the level moved. */
const MATERIALS = {
  monument: () => new THREE.MeshStandardMaterial({ color: 0x837052, roughness: 0.95, metalness: 0 }),
  rock: () => new THREE.MeshStandardMaterial({ color: 0x767063, roughness: 0.95, metalness: 0 }),
  building: () => new THREE.MeshStandardMaterial({ color: 0x8d8575, roughness: 0.95, metalness: 0 }),
};

/* Where real modelled geometry exists, the extruded footprint must not also be
 * drawn or the two fight for the same space — z-fighting, doubled silhouettes,
 * and a monument that is both a cited tiered mass and a carved building at
 * once. `exclude` names the sites the GLB covers; anything whose centroid falls
 * inside one is dropped here and comes from the model instead. */
function inExcluded(cx, cz, exclude) {
  for (const z of exclude) {
    if ((cx - z.x) ** 2 + (cz - z.z) ** 2 < z.r * z.r) return true;
  }
  return false;
}

/* Builds one merged mesh per kind, plus a per-monument lookup so a click can
 * still fly to a specific monument even though they share one draw call. */
export function buildMassing({ footprints, context, origin, heightAt, exclude = [] }) {
  const project = makeProjector(origin);
  const group = new THREE.Group();
  group.name = "massing";
  const monumentBounds = new Map(); // osm id -> {cx, cz, top}

  const bucket = { monument: [], rock: [], building: [] };

  if (footprints && footprints.features) {
    for (const f of footprints.features) {
      const p = f.properties;
      for (const ring of ringsOf(f, project)) {
        const [cx, cz] = centroid(ring);
        if (inExcluded(cx, cz, exclude)) continue;
        const ground = heightAt(cx, cz);
        bucket.monument.push(slab(ring, ground + (p.base_m || 0), ground + (p.top_m || 1)));
        const b = monumentBounds.get(p.id) || { cx, cz, top: 0 };
        b.cx = cx;
        b.cz = cz;
        b.top = Math.max(b.top, ground + (p.top_m || 1));
        monumentBounds.set(p.id, b);
      }
    }
  }

  if (context && context.features) {
    for (const f of context.features) {
      const p = f.properties;
      const kind = p.kind === "rock" ? "rock" : "building";
      for (const ring of ringsOf(f, project)) {
        const [cx, cz] = centroid(ring);
        if (inExcluded(cx, cz, exclude)) continue;
        const ground = heightAt(cx, cz);
        bucket[kind].push(slab(ring, ground + (p.base_m || 0), ground + (p.top_m || 3)));
      }
    }
  }

  const counts = {};
  for (const kind of Object.keys(bucket)) {
    const merged = mergeAll(bucket[kind]);
    counts[kind] = bucket[kind].length;
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, MATERIALS[kind]());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = kind;
    group.add(mesh);
  }

  return { group, monumentBounds, counts };
}
