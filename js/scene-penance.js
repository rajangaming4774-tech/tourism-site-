/* Descent of the Ganges / Arjuna's Penance — the granite.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 * ---------------------------------------------
 * This builds the two natural granite masses and the fissure between them. It
 * does NOT carve the relief, and nothing here should ever pretend to.
 *
 * The monument is roughly a hundred figures — elephants, ascetics, nagas, deer,
 * monkeys, the whole narrative — cut into the rock in four or five depths of
 * relief. That composition is a historical fact about a real surface. It cannot
 * be recovered from a written description, and a procedural scatter of
 * primitive "elephants" is not an approximation of it, it is an invention that
 * happens to be elephant-shaped. The previous model in this scene did exactly
 * that with 405 nodes and read as a stepped mass of blocks, which is why it is
 * gone rather than improved.
 *
 * The carving arrives one of two honest ways, and the geometry here is built to
 * take either:
 *   1. An orthographic photo plate of the real face, projected through the UVs
 *      below and driven into the surface as a displacement/normal map.
 *   2. A photogrammetry or lidar scan, dropped in as a GLB.
 * Until then the face carries the rock's own weathering and nothing else. An
 * uncarved rock of the right shape and size is honest; a wrong carving is not.
 *
 * SHAPE. Two masses, north and south of a natural cleft: 29.26 m along the
 * relief, 13.10 m at the tallest point. Those two numbers are widely repeated
 * but uncited at source — see the note on the constants below, which also
 * records the 1880 field measurement they should be read against. They are
 * generated as
 * deformed ellipsoids rather than boxes — the granite here is weathered
 * whaleback outcrop, and a subdivided box keeps its silhouette no matter how
 * much noise you add to it, which is what made the earlier base read as two
 * walls. The east face is pulled toward a plane because that face really is
 * broadly flat (it is what the sculptors worked), but it keeps its undulation:
 * a perfectly flat face reads as sawn concrete.
 *
 * Local frame matches the rest of the scene: +X east, -Z north, +Y up, metres.
 */
import * as THREE from "../assets/vendor/three.module.js";

/* Dimensions — and where they actually come from, which is not "published".
 *
 * 29.26 m and 13.10 m are the exact metric forms of 96 ft and 43 ft. That
 * "96 x 43 ft" figure is repeated all over the web, including in the caption of
 * the highest-poly Sketchfab capture of this relief, but every instance traces
 * back to one sentence in the Wikipedia article that CARRIES NO CITATION. It is
 * a tertiary figure, not a survey.
 *
 * The oldest traceable field measurement is Fergusson & Burgess, The Cave
 * Temples of India (London, 1880), "Great Bas-relief", p. 155:
 *
 *   "a great bas-relief carved in two great masses of rock, and extending
 *    nearly 90 feet north and south, with an average height of about 30 feet"
 *
 * Note "AVERAGE height" — 30 ft is not comparable to the 13.10 m peak below.
 * Integrating the silhouette this file actually builds gives a run-weighted
 * mean of 10.91 m (35.8 ft) against Fergusson's ~30 ft, and a length 6.7% over
 * his "nearly 90 feet". Those are the honest deltas; the 44% gap you get by
 * comparing his average to our peak is an artefact of comparing unlike things.
 *
 * CLEFT_W is NOT published. Fergusson (1880), Longhurst (1928), Wikipedia and
 * Puratattva all describe the fissure only qualitatively — "a large vertical
 * cleft", "narrow fissure". No source gives a width. 0.56 m is a modelling
 * estimate and is labelled as one here rather than inheriting the word
 * "published" from its neighbours.
 *
 * The depths are massing of the outcrop, not measurements of anything.
 */
const RUN_TOTAL = 29.26;
const CLEFT_W = 0.56;   // ESTIMATE — no published width exists. See above.

const NORTH = { run: 15.1, height: 11.4, depth: 9.0, seed: 17 };
const SOUTH = { run: 13.6, height: 13.1, depth: 10.2, seed: 43 };

const FACE_UNDULATION = 0.22;  // how far the worked face is allowed to wander
const BODY_RELIEF = 1.35;      // boulder irregularity on back, sides and crown
const SUBDIV = 4;              // icosphere subdivisions -> 5120 tris per mass

/* ---------- deterministic noise (no dependency, reproducible) ---------- */

function hashDir(seed, i) {
  // xorshift on the integer pair, then a unit vector from it
  let h = (seed * 374761393 + i * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const z = ((h >>> 16) / 0xffff) * 2 - 1;
  const s = Math.sqrt(Math.max(0, 1 - z * z));
  return [Math.cos(a) * s, Math.sin(a) * s, z];
}

/* Sum of directional sines: cheap, smooth, seeded, and identical every run. */
function noise3(x, y, z, seed, octaves = 4, freq = 0.1) {
  let out = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let o = 0; o < octaves; o++) {
    for (let k = 0; k < 3; k++) {
      const d = hashDir(seed + o * 31, k);
      const phase = seed * 0.37 + o * 1.7 + k * 2.3;
      out += amp * Math.sin((x * d[0] + y * d[1] + z * d[2]) * f * 2 * Math.PI + phase);
    }
    norm += amp * 3;
    amp *= 0.52;
    f *= 2.13;
  }
  return out / norm;
}

const smoothstep = (t) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/* ---------- icosphere ---------- */
/* An ellipsoid-derived boulder keeps an organic outline under displacement; a
 * subdivided cube does not — its silhouette stays square however hard you push
 * the vertices, which is the whole reason the previous base looked built. */
function icosphere(subdiv) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  for (let s = 0; s < subdiv; s++) {
    const mid = new Map();
    const next = [];
    const midpoint = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (mid.has(key)) return mid.get(key);
      const va = verts[a];
      const vb = verts[b];
      const m = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2];
      const l = Math.hypot(m[0], m[1], m[2]);
      verts.push([m[0] / l, m[1] / l, m[2] / l]);
      const idx = verts.length - 1;
      mid.set(key, idx);
      return idx;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { verts, faces };
}

/* ---------- one granite mass ---------- */
/* `zStart` is where this mass begins along the relief run (world -Z is north,
 * so the run is laid out along +Z and the caller offsets it). `faceX` is the
 * plane the worked face is pulled toward. */
function buildMass({ run, height, depth, seed }, zStart, faceX, heightAt, originX, originZ) {
  const { verts, faces } = icosphere(SUBDIV);
  const pos = [];

  /* The worked face is a slice taken off the east side of the boulder, so the
   * ellipsoid is built oversize in X and then cut: radius 0.62 of the depth
   * plus a 0.30 cut keeps ~0.92 of the published depth as standing rock. Cut
   * the sphere at its own centre instead and you lose half the mass. */
  const cut = depth * 0.3;

  /* A plain ellipsoid domes away in every direction and reads as a river
   * cobble. This outcrop is a whaleback: steep for most of its height, rounded
   * only across the crown, and blunt at the ends where the cleft splits it. So
   * push the sphere toward a superellipsoid — the exponents flatten the top and
   * square the ends while leaving the corners round. */
  const superY = 0.55; // < 1 = steeper sides, flatter crown
  const superZ = 0.72; // blunter ends, so the cleft is a slot and not a V
  const shape = (t, e) => Math.sign(t) * Math.pow(Math.abs(t), e);

  for (const v of verts) {
    // Long along the run, tall in Y, deep in X (into the rock).
    let x = v[0] * (depth * 0.62);
    let y = shape(v[1], superY) * (height / 2);
    let z = shape(v[2], superZ) * (run / 2);

    /* Weathered granite: strong irregularity everywhere except the worked face.
     * `faceness` is 1 on the east face and falls off into the mass. */
    const faceness = smoothstep(x / (depth * 0.62));
    const amp = FACE_UNDULATION + (BODY_RELIEF - FACE_UNDULATION) * (1 - faceness);

    const n1 = noise3(x, y, z, seed, 4, 0.085);
    const n2 = noise3(x * 2.1, y * 2.1, z * 2.1, seed + 5, 3, 0.26);
    const d = amp * (0.7 * n1 + 0.3 * n2);

    const len = Math.hypot(v[0], v[1], v[2]) || 1;
    x += (v[0] / len) * d;
    y += (v[1] / len) * d;
    z += (v[2] / len) * d;

    /* Crown: granite whalebacks are rounded and lopsided, not domed evenly.
     * Push the top over toward the back so the face reads as a steep scarp. */
    const up = Math.max(0, y / (height / 2));
    x -= up * up * depth * 0.13;

    // The worked face: broadly planar, never flat. Slice, then bring the face
    // to local x = 0 so the caller's anchor is the face plane.
    if (x > cut) {
      const over = x - cut;
      x = cut + Math.min(over, FACE_UNDULATION * (0.5 + 0.5 * noise3(y, z, 0, seed + 11, 2, 0.4)));
    }
    x -= cut;

    pos.push([x, y, z + run / 2 + zStart]);
  }

  /* Sit it on the ground: an outcrop meets the soil, it does not float on it.
   * The mesh itself sits at y = 0, so each vertex carries the terrain height
   * under its own footprint — on a slope the rock follows the slope. */
  let minY = Infinity;
  for (const p of pos) minY = Math.min(minY, p[1]);
  const out = [];
  const localY = [];  // height above this mass's own base, for the UV plate
  for (const p of pos) {
    const ground = heightAt(originX + p[0], originZ + p[2]);
    const h = p[1] - minY;
    localY.push(h);
    out.push([p[0], h + ground, p[2]]);
  }
  return { pos: out, localY, faces };
}

/* ---------- public ---------- */

export function buildPenance({ heightAt, anchor }) {
  const group = new THREE.Group();
  group.name = "penance";

  /* The run is laid north-south. anchor.z is the centre of the whole monument,
   * anchor.x the plane of the worked face. */
  const runStart = -RUN_TOTAL / 2;
  const faceX = 0; // local: the face sits at x = 0, the mass extends west (-x)

  const masses = [
    buildMass(NORTH, runStart, faceX, heightAt, anchor.x, anchor.z),
    buildMass(SOUTH, runStart + NORTH.run + CLEFT_W, faceX, heightAt, anchor.x, anchor.z),
  ];

  const position = [];
  const uv = [];
  const index = [];
  const heightAboveBase = [];
  let base = 0;
  for (const m of masses) {
    m.pos.forEach((p, i) => {
      position.push(p[0], p[1], p[2]);
      /* Planar projection from the front, matched to a 29.26 x 13.10 plate —
       * this is the channel a real orthophoto of the relief drops into. Driven
       * off height above the rock's own base, not world Y, so the plate does
       * not slide when the ground under the monument slopes. */
      uv.push((p[2] - runStart) / RUN_TOTAL, 1 - m.localY[i] / 13.1);
      heightAboveBase.push(m.localY[i]);
    });
    for (const f of m.faces) index.push(base + f[0], base + f[1], base + f[2]);
    base += m.pos.length;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();

  /* Weathered granite. Warm grey with enough roughness that the sun reads the
   * form rather than glazing it; vertex colour varies it so the mass does not
   * look injection-moulded. */
  const colors = new Float32Array(position.length);
  const c = new THREE.Color();
  for (let i = 0; i < position.length; i += 3) {
    const y = position[i + 1];
    const n = noise3(position[i], y, position[i + 2], 91, 3, 0.22);
    // Lower stone sits in dirt and shadow; crowns bleach in the sun. Measured
    // from the rock's base, not sea level, or every vertex saturates.
    const lift = smoothstep(heightAboveBase[i / 3] / 12) * 0.1;
    c.setHSL(0.09, 0.1, 0.46 + lift + n * 0.05);
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false })
  );
  mesh.name = "penance-granite";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(anchor.x, 0, anchor.z);
  group.add(mesh);

  /* `note` is not decoration — js/scene-3d.js copies it onto the POI record and
   * openPanel prints it, so this string IS what a visitor is told about this
   * monument. It replaced two generic sentences that were both false here:
   * pois.json marks this POI heightIsCited:false, so the panel used to say the
   * relief was "its real footprint extruded to a nominal height", when it is
   * neither a footprint nor an extrusion. Keep the numbers interpolated from the
   * constants above so the sentence cannot drift from the geometry. */
  group.userData.penance = {
    run_m: +RUN_TOTAL.toFixed(2),
    maxHeight_m: SOUTH.height,
    cleft_m: CLEFT_W,
    triangles: index.length / 3,
    /* The MESH is bare. Renamed from `carved` because a later normal map will
     * shade this rock without carving it, and a boolean called `carved` would
     * then be answering a different question than the one it appears to answer. */
    geometryCarved: false,
    note:
      `Modelled as two granite masses at the size this relief is usually given — ` +
      `${RUN_TOTAL.toFixed(2)} m along the face, ${SOUTH.height} m at the tallest point. ` +
      `That figure is a conversion of 96 × 43 ft, which is repeated everywhere but ` +
      `traces to an uncited sentence rather than a survey; the oldest field ` +
      `measurement is Fergusson & Burgess (1880), “nearly 90 feet north and south, ` +
      `with an average height of about 30 feet”. The rock is not carved: the ` +
      `hundred-odd figures are a fact about a real surface and cannot be recovered ` +
      `from a description, so nothing is invented here.`,
  };
  return group;
}
