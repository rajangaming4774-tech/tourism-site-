/* Procedural town infill — the buildings OpenStreetMap has not mapped yet.
 *
 * WHAT IS TRUE HERE AND WHAT IS NOT
 * ---------------------------------
 * OSM has 238 building footprints inside this scene. Mamallapuram's built-up
 * core is a great deal denser than 238 buildings; the gap is survey coverage,
 * not empty ground. So the town renders as a scatter of blocks on open sand,
 * which is a false impression of the place in the opposite direction — it makes
 * a busy town look abandoned.
 *
 * This module fills that gap, and every block it adds is INVENTED. Individually
 * they are fiction: no block here corresponds to a specific building, and none
 * should ever be measured, counted or pointed at. What is true is the claim the
 * mass makes collectively — that these streets are built up — and the frontages
 * they line, which are real OSM ways.
 *
 * Three rules keep the fiction honest:
 *   1. Nothing is placed where OSM already has a footprint. Real geometry always
 *      wins; the infill only occupies ground the survey left blank.
 *   2. Nothing is placed in the heritage zone. That ground is archaeology and
 *      inventing buildings on it would be a lie a visitor could act on.
 *   3. Every block is flagged `userData.invented = true`, and they are one
 *      InstancedMesh named "town-infill" so they can be switched off wholesale.
 *
 * The scatter is SEEDED, so a reload reproduces the same town rather than
 * reshuffling it — a diff means the inputs changed, not the dice.
 */
import * as THREE from "../assets/vendor/three.module.js";

const STOREY_M = 3.2;
const SETBACK_M = 4.5;        // from the road centreline to the frontage
const SPACING_MIN = 9;
const SPACING_MAX = 15;
const MAX_BLOCKS = 1400;

/* Streets that front buildings. A trunk road through open country does not, and
 * a footpath through the rocks certainly does not. */
const FRONTED = new Set([
  "residential", "living_street", "unclassified", "tertiary", "tertiary_link",
  "secondary", "secondary_link", "service",
]);

/* The heritage zone: no invented buildings inside this radius of the rock. The
 * centre is the archaeological core, not the town. */
const HERITAGE = { x: -190, z: -60, r: 430 };

/* Darkened ~35 % from the cream-board values, for the same reason as the
 * massing palette in scene-massing.js: over the satellite ground the old
 * tones floated. Same tints, lower level. */
const ROOFS = [0x847b69, 0x7e7460, 0x898170, 0x786e5b, 0x827865];
const WALLS = [0x918b7e, 0x8c8576, 0x958f84, 0x877f70];

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Axis-aligned bounds of the real footprints, so infill never lands on one.
 * A grid bucket keeps the test O(1) instead of 1400 x 238. */
function occupancyIndex(context, project, cell = 40) {
  const buckets = new Map();
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  if (!context || !context.features) return { hit: () => false };

  for (const f of context.features) {
    if (!f.properties || f.properties.kind !== "building" || !f.geometry) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const walk = (c) => {
      if (typeof c[0] === "number") {
        const [x, z] = project(c);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      } else c.forEach(walk);
    };
    walk(f.geometry.coordinates);
    for (let gx = Math.floor((minX - 6) / cell); gx <= Math.floor((maxX + 6) / cell); gx++)
      for (let gz = Math.floor((minZ - 6) / cell); gz <= Math.floor((maxZ + 6) / cell); gz++) {
        const k = `${gx},${gz}`;
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push([minX - 6, minZ - 6, maxX + 6, maxZ + 6]);
      }
  }
  return {
    hit(x, z) {
      const b = buckets.get(key(x, z));
      if (!b) return false;
      return b.some((r) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
    },
  };
}

export function buildInfill({ paths, context, project, heightAt, townCentre, seed = 20260907 }) {
  if (!paths || !paths.features) return null;

  const rand = rng(seed);
  const occupied = occupancyIndex(context, project);
  const town = townCentre || project([80.19444, 12.61972]);
  const placed = [];   // own footprints, so infill does not collide with itself

  const tooClose = (x, z, r) =>
    placed.some((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 < (r + p[2]) ** 2);

  for (const f of paths.features) {
    if (!f.geometry || f.geometry.type !== "LineString") continue;
    const cls = (f.properties && f.properties.highway) || "";
    if (!FRONTED.has(cls)) continue;

    const pts = f.geometry.coordinates.map((c) => project(c));
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      if (len < 4) continue;
      const ux = dx / len;
      const uz = dz / len;
      const nx = -uz;      // frontage normal
      const nz = ux;

      let travelled = SPACING_MIN * rand();
      while (travelled < len) {
        travelled += SPACING_MIN + rand() * (SPACING_MAX - SPACING_MIN);
        if (travelled >= len) break;
        const cx = ax + ux * travelled;
        const cz = az + uz * travelled;

        /* Density falls off from the town centre. Beyond ~900 m the ground is
         * genuinely open and filling it would be the same error in reverse. */
        const dTown = Math.hypot(cx - town[0], cz - town[1]);
        const density = Math.max(0, 1 - dTown / 950);
        if (rand() > 0.25 + density * 0.7) continue;

        // Both sides of the street, independently.
        for (const side of [1, -1]) {
          if (placed.length >= MAX_BLOCKS) break;
          if (rand() > 0.82) continue;

          const depth = 6 + rand() * 6;
          const width = 5 + rand() * 6;
          const off = SETBACK_M + depth / 2;
          const x = cx + nx * off * side;
          const z = cz + nz * off * side;

          if (Math.hypot(x - HERITAGE.x, z - HERITAGE.z) < HERITAGE.r) continue;
          if (occupied.hit(x, z)) continue;
          const radius = Math.max(width, depth) / 2;
          if (tooClose(x, z, radius)) continue;

          const g = heightAt(x, z);
          if (g < 0.6) continue;             // do not build in the water or on the beach
          const storeys = rand() < 0.72 + density * 0.2 ? 1 : 2;
          placed.push([x, z, radius, width, depth, storeys * STOREY_M, Math.atan2(ux, uz), rand(), g]);
        }
      }
    }
    if (placed.length >= MAX_BLOCKS) break;
  }

  if (!placed.length) return null;

  const group = new THREE.Group();
  group.name = "town-infill";
  group.userData.invented = true;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const wallMesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 }),
    placed.length
  );
  wallMesh.name = "town-infill-walls";
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  placed.forEach(([x, z, , width, depth, height, rot, r, g], i) => {
    dummy.position.set(x, g + height / 2, z);
    dummy.rotation.set(0, rot, 0);
    dummy.scale.set(width, height, depth);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(i, dummy.matrix);
    const pal = r < 0.45 ? WALLS : ROOFS;
    wallMesh.setColorAt(i, col.setHex(pal[Math.floor(r * pal.length) % pal.length]));
  });
  wallMesh.instanceMatrix.needsUpdate = true;
  if (wallMesh.instanceColor) wallMesh.instanceColor.needsUpdate = true;
  group.add(wallMesh);

  group.userData.infill = { blocks: placed.length, invented: true };
  return group;
}
