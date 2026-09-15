/* The Bay of Bengal, and where the land stops.
 *
 * WHAT WAS WRONG. The old sea was a strip hung off the raw OpenStreetMap
 * coastline with one rung per node running due east at constant Z. Three
 * things made its edge a staircase: the way has only 47 nodes inside the board
 * (median 62 m apart, some 277 m); constant-Z rungs can shear but never follow
 * a bay; and the terrain painted a "foam" band wherever a vertex fell below
 * 0.4 m on a 21 m grid — and 35 % of the grid does, because the ~30 m DEM and
 * the OSM shoreline disagree by about 70 m. That band, not the sea mesh, was
 * most of the stair-step.
 *
 * WHAT THIS DOES.
 *   1. Smooths the OSM coastline (Chaikin ×3, resampled to 5 m) so the
 *      shoreline is a curve, not a 47-segment polyline.
 *   2. Builds the nearshore as a regular grid with a SIGNED DISTANCE to that
 *      curve baked into every vertex, drops the triangles that are wholly on
 *      land, and hands the same distance function to the terrain so the DEM
 *      is pulled to sea level where OSM says there is water. The shoreline is
 *      then drawn by the survey that is accurate to 5–10 m, not by the one
 *      accurate to 30.
 *   3. Shades the water with a MeshStandardMaterial and a small shader patch:
 *      three directional swells and two octaves of noise perturb the normal,
 *      colour deepens with distance from shore, a foam band sits on the last
 *      70 m, and the last 30 m fade out so the satellite photograph's own
 *      beach shows through under the mesh edge. Standard rather than a
 *      hand-rolled ShaderMaterial or the Water/Water2 addons: it inherits
 *      shadows (the Shore Temple still casts onto the water), fog, tone
 *      mapping on both render paths, sun glint and Fresnel sky reflection from
 *      the environment map — and, unlike Water/Water2, it does not re-render
 *      the whole scene into a reflection texture every frame, which the
 *      on-demand render loop could not afford.
 *
 * WHAT IT CLAIMS. Nothing about the place. The shoreline is OSM; the colours
 * are sampled from the satellite image; the waves are optical. No declaration
 * needed (README, "where the honesty line falls").
 *
 * FROZEN FRAMES LOOK RIGHT BY CONSTRUCTION. The scene renders on demand and
 * most frames on most devices are still. The swell sum and the noise are
 * non-zero at t = 0, so glint, Fresnel, depth colour and foam are all present
 * without motion; `animate(t)` only advances them. The loop decides when.
 */
import * as THREE from "../assets/vendor/three.module.js";

const SMOOTH_PASSES = 3;     // Chaikin: 62 m median spacing -> ~7 m
const RESAMPLE_M = 5;
const COAST_KEEP_M = 6000;   // how far along the shore to smooth; beyond is fogged
const GRID_STEP = 20;        // nearshore grid, metres
const GRID_X0 = -400;        // west edge of the nearshore grid (the shore never runs west of -188 in the board)
const LAND_DROP_M = -60;     // a triangle wholly this far inland is not water
const HASH_M = 100;

/* ---------- coastline ---------- */
function longestWay(coastline) {
  let line = null;
  for (const f of coastline.features || []) {
    const c = f.geometry && f.geometry.coordinates;
    if (c && (!line || c.length > line.length)) line = c;
  }
  return line;
}

function chaikin(pts) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    out.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25]);
    out.push([ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    let d = step - carry;
    while (d <= len) {
      const k = d / len;
      out.push([ax + (bx - ax) * k, az + (bz - az) * k]);
      d += step;
    }
    carry = len - (d - step);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/* Signed distance to the smoothed coast: positive on the sea side. The way is
 * digitised south→north (296 of its 298 segments have z decreasing, checked),
 * so with -Z north the sea lies on its right, which is +X — and the 2D cross
 * product of segment direction with the vector to the point is positive there. */
function makeDistance(pts) {
  const segs = pts.length - 1;
  const hash = new Map();
  const key = (x, z) => `${Math.floor(x / HASH_M)},${Math.floor(z / HASH_M)}`;
  for (let i = 0; i < segs; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    for (let cx = Math.floor(Math.min(ax, bx) / HASH_M); cx <= Math.floor(Math.max(ax, bx) / HASH_M); cx++)
      for (let cz = Math.floor(Math.min(az, bz) / HASH_M); cz <= Math.floor(Math.max(az, bz) / HASH_M); cz++) {
        const k = `${cx},${cz}`;
        if (!hash.has(k)) hash.set(k, []);
        hash.get(k).push(i);
      }
  }
  const segDist = (i, x, z) => {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const px = ax + dx * t, pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    const cross = dx * (z - az) - dz * (x - ax);
    return cross >= 0 ? d : -d;
  };
  return function distanceTo(x, z) {
    const cx = Math.floor(x / HASH_M), cz = Math.floor(z / HASH_M);
    let best = Infinity, bestSigned = 0;
    for (let r = 0; r <= 60; r++) {
      // ring r of cells; once a hit is closer than the ring's inner radius, stop
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const cell = hash.get(`${cx + i},${cz + j}`);
        if (!cell) continue;
        for (const s of cell) {
          const d = segDist(s, x, z);
          if (Math.abs(d) < best) { best = Math.abs(d); bestSigned = d; }
        }
      }
      if (best < r * HASH_M) break;
    }
    if (best === Infinity) {
      // nothing within 6 km of hashed coast: sign by the nearest raw endpoint
      const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
      return Math.hypot(x - ax, z - az) < Math.hypot(x - bx, z - bz) ? segDist(0, x, z) : segDist(segs - 1, x, z);
    }
    return bestSigned;
  };
}

/* ---------- material ---------- */
const GLSL_HEAD = /* glsl */ `
  uniform float uTime;
  uniform vec3 uWet;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  varying float vDist;
  varying vec3 vWp;

  float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  /* Slope of a sum of gravity waves: three swells of 38 / 21 / 9 m arriving
   * from the east-south-east (they break on this coast from the sea), slopes
   * 0.020 / 0.016 / 0.014, deep-water dispersion for the speeds; plus two
   * octaves of drifting noise for the chop. The swell slopes were 0.06 / 0.05 /
   * 0.04 at first and the first capture read as corduroy: under a 26° sun
   * every 38 m crest was a specular stripe. Real swell is a few percent of
   * slope; the chop is what the eye reads as water. Returns d(height)/d(x,z). */
  vec2 waveSlope(vec2 p, float t) {
    vec2 s = vec2(0.0);
    vec2 d1 = normalize(vec2(-0.92, -0.38)); float k1 = 6.28318 / 38.0;
    vec2 d2 = normalize(vec2(-0.85, -0.53)); float k2 = 6.28318 / 21.0;
    vec2 d3 = normalize(vec2(-0.97, -0.24)); float k3 = 6.28318 / 9.0;
    s += d1 * 0.020 * cos(dot(p, d1) * k1 - t * 1.27);
    s += d2 * 0.016 * cos(dot(p, d2) * k2 - t * 1.71);
    s += d3 * 0.014 * cos(dot(p, d3) * k3 - t * 2.62);
    vec2 q1 = p / 6.0 + vec2(t * 0.25, -t * 0.11);
    vec2 q2 = p / 2.7 + vec2(-t * 0.18, t * 0.14);
    float e = 0.15;
    s += 0.06 * vec2(vnoise(q1 + vec2(e, 0.0)) - vnoise(q1 - vec2(e, 0.0)), vnoise(q1 + vec2(0.0, e)) - vnoise(q1 - vec2(0.0, e))) / (2.0 * e * 6.0);
    s += 0.04 * vec2(vnoise(q2 + vec2(e, 0.0)) - vnoise(q2 - vec2(e, 0.0)), vnoise(q2 + vec2(0.0, e)) - vnoise(q2 - vec2(0.0, e))) / (2.0 * e * 2.7);
    return s;
  }
`;

function seaMaterial(colours) {
  const mat = new THREE.MeshStandardMaterial({
    color: colours.deep,
    roughness: 0.36,
    /* Less of the sky in the water than a mirror would give. At the 14° hero
     * pitch the whole nearshore is at a grazing angle, Fresnel is near 1, and
     * a full-strength reflection of a hazy sky turned the sea into a milky
     * sheet. This is the one knob for it; the sky itself is tuned for the
     * sky. */
    envMapIntensity: 0.5,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  });
  mat.name = "sea";
  mat.customProgramCacheKey = () => "sea-v6";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uDeep = { value: new THREE.Color(colours.deep) };
    shader.uniforms.uShallow = { value: new THREE.Color(colours.shallow) };
    shader.uniforms.uFoam = { value: new THREE.Color(colours.foam) };
    shader.uniforms.uWet = { value: new THREE.Color(colours.wet) };
    mat.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\n attribute float dist; varying float vDist; varying vec3 vWp;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n vDist = dist; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;");

    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + GLSL_HEAD)
      /* Colour by distance from shore, foam on the last 70 m, and a fade over
       * the last 30 m so the photograph's own beach shows through the mesh
       * edge instead of the mesh drawing a line across the surf. */
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float shallow = 1.0 - smoothstep(0.0, 250.0, vDist);
        vec3 seaBase = mix(uDeep, uShallow, shallow);
        /* Note the 1.0 - smoothstep(a, b, x) form throughout: GLSL leaves
         * smoothstep(edge0, edge1, x) UNDEFINED when edge0 > edge1, and the
         * reversed form that was here first, smoothstep(70.0, 0.0, vDist),
         * came out as foam across the whole nearshore on this machine's GPU —
         * a milky sheet from the beach to 300 m out. */
        /* Surf LINES, parallel to the shore, not a 70 m white sheet. The first
         * version was a solid band and at the 14° hero pitch, where 100 m of
         * nearshore fills a third of the frame, it read as fog on the water;
         * the second was axis-aligned noise blobs, which read as tiles. Lines
         * come from a sine of the distance to shore itself — ~13 m apart,
         * running shoreward at 1.2 m/s, wobbled by low-frequency noise so no
         * two are alike — broken up by finer noise, over the last 40 m, and
         * never more than 60 % white. */
        float fz = 1.0 - smoothstep(0.0, 36.0, vDist);
        float n1 = vnoise(vWp.xz * 0.03 + vec2(uTime * 0.05, -uTime * 0.04));
        float n2 = vnoise(vWp.xz * 0.12 - vec2(uTime * 0.08, uTime * 0.05));
        /* ~20 m between lines and a big noise phase term, so at any point along
         * the beach there are one or two breakers, not a contour map of four. */
        float lines = 0.5 + 0.5 * sin(vDist * 0.32 - uTime * 0.5 + 6.0 * n1);
        float foam = fz * smoothstep(0.6, 0.95, lines * (0.45 + 0.55 * n2));
        diffuseColor.rgb = mix(seaBase, uFoam, foam * 0.55);
        /* Landward of the line the mesh keeps going, as wet sand: the
         * photograph's own surf sits up to ~70 m inland of the OpenStreetMap
         * line in places, and a hard fade there let its dark water pixels
         * show as a stepped band on the beach. The terrain under this band is
         * held at sea level (js/scene-terrain.js) so the mesh stays above it. */
        float wet = 1.0 - smoothstep(-28.0, 0.0, vDist);
        diffuseColor.rgb = mix(diffuseColor.rgb, uWet, wet);
        diffuseColor.a *= smoothstep(-40.0, -10.0, vDist);`
      )
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\n roughnessFactor = mix(mix(0.36, 0.55, foam), 0.7, wet); roughnessFactor = mix(roughnessFactor, 0.62, smoothstep(300.0, 2500.0, length(vViewPosition)));")
      /* Far water is ROUGHER (0.36 -> 0.62 from 300 m to 2.5 km), the reverse
       * of the normal-perturbation fade above, and for the same eye: the
       * perturbation is texture and aliases at range, while roughness is the
       * lobe. A glassy far sea at a grazing angle reflected the sun as a
       * saturated white sheet across half the frame; a wider, dimmer lobe is
       * the broad sheen real glitter has from a height.
       *
       * Water's Fresnel base is 2 %, not the 4 % Standard assumes for every
       * dielectric. Half the base reflectance is half the sun glitter, and
       * the glitter was a white sheet across the frame looking sunward. */
      .replace("#include <lights_physical_fragment>", "#include <lights_physical_fragment>\n material.specularColor = vec3(0.02);")
      /* The perturbed normal. Injected AFTER normal_fragment_begin so the
       * chunk's own variables exist; there is no normalMap on this material,
       * so nothing later overwrites it. The sea is flat and unrotated, so the
       * object-space normal IS the world normal; only the view transform is
       * needed. */
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        {
          vec2 sl = waveSlope(vWp.xz, uTime);
          /* Fade the perturbation with distance: a 9 m chop evaluated per
           * pixel 2 km away is aliasing, not detail, and far water reads as
           * a glassy sheet under a low sun anyway. */
          sl *= 1.0 / (1.0 + length(vViewPosition) / 1400.0);
          vec3 nW = normalize(vec3(-sl.x, 1.0, -sl.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`
      );
  };
  return mat;
}

/* ---------- geometry ---------- */
export function buildSea({ coastline, project, half = 2000, far = 30000, colours }) {
  // wet: the photograph's beach (#a7a080) darkened, as wet sand is.
  const C = Object.assign({ deep: 0x1a3036, shallow: 0x1e403b, foam: 0xe6e2d6, wet: 0x7d7660 }, colours || {});
  const line = coastline && project && longestWay(coastline);
  if (!line || line.length < 2) {
    // No coastline file: a plain plane is better than no sea. Nothing to
    // measure distance to, so no terrain correction either.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(far, far), seaMaterial(C));
    mesh.rotation.x = -Math.PI / 2;
    mesh.geometry.setAttribute("dist", new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count).fill(9999), 1));
    return { mesh, distanceTo: null, animate: () => {}, points: 0 };
  }

  // Keep the way's own direction (south -> north); do NOT sort by z.
  let pts = line.map((c) => project(c)).filter(([, z]) => Math.abs(z) <= COAST_KEEP_M);
  if (pts.length < 2) pts = line.map((c) => project(c));
  for (let i = 0; i < SMOOTH_PASSES; i++) pts = chaikin(pts);
  pts = resample(pts, RESAMPLE_M);
  const distanceTo = makeDistance(pts);

  const pos = [], dist = [], idx = [];
  const push = (x, z, d) => { pos.push(x, 0, z); dist.push(d); return pos.length / 3 - 1; };

  /* 1. Nearshore grid, x from GRID_X0 to +half, z across the board. */
  const nx = Math.round((half - GRID_X0) / GRID_STEP) + 1;
  const nz = Math.round((2 * half) / GRID_STEP) + 1;
  const gridBase = pos.length / 3;
  const gd = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = GRID_X0 + i * GRID_STEP, z = -half + j * GRID_STEP;
    const d = distanceTo(x, z);
    gd[j * nx + i] = d;
    push(x, z, d);
  }
  let kept = 0;
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const tri = (p, q, r) => {
      if (gd[p] < LAND_DROP_M && gd[q] < LAND_DROP_M && gd[r] < LAND_DROP_M) return;
      idx.push(gridBase + p, gridBase + r, gridBase + q); kept++;
    };
    // wound to face +Y after the (x,0,z) layout: a-c-b, b-c-d
    tri(a, b, c); tri(b, d, c);
  }

  /* 2. Beyond the board: constant-Z rungs from the coast to x=+half for
   * |z| > half (the shore is monotonic out there, and it is fogged), then one
   * quad from x=+half out to the far plane — the coast never runs east of
   * x≈1400 anywhere, so everything east of the board is water. */
  const rungs = [];
  const coastX = (z) => {
    // x of the smoothed coast at this z (nearest sample); extrapolate past the ends
    let bx = pts[0][0], bd = Infinity;
    for (const [x, pz] of pts) { const d = Math.abs(pz - z); if (d < bd) { bd = d; bx = x; } }
    return bx;
  };
  for (const sign of [-1, 1]) {
    const zs = [];
    for (let z = sign * half; Math.abs(z) <= far; z += sign * 200) zs.push(z);
    const rowIdx = zs.map((z) => [push(Math.min(coastX(z), half), z, 9999), push(half, z, 9999)]);
    for (let r = 0; r < rowIdx.length - 1; r++) {
      const [a0, a1] = rowIdx[r], [b0, b1] = rowIdx[r + 1];
      if (sign < 0) idx.push(a0, b0, a1, a1, b0, b1);
      else idx.push(a0, a1, b0, a1, b1, b0);
    }
    rungs.push(rowIdx.length);
  }
  {
    const a = push(half, -far, 9999), b = push(far, -far, 9999), c = push(half, far, 9999), d = push(far, far, 9999);
    idx.push(a, c, b, b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("dist", new THREE.Float32BufferAttribute(dist, 1));
  geo.setIndex(idx);
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;   // flat water: up, everywhere
  geo.setAttribute("normal", new THREE.BufferAttribute(n, 3));

  const mat = seaMaterial(C);
  mat.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "sea";
  mesh.position.y = 0.15;
  mesh.receiveShadow = true;

  return {
    mesh,
    distanceTo,
    points: pts.length,
    triangles: idx.length / 3,
    /* Advances the water. Called by the render loop, and ONLY by the render
     * loop, when it has decided a frame is being drawn anyway. */
    animate(tSeconds) {
      const s = mat.userData.shader;
      if (s) s.uniforms.uTime.value = tSeconds;
    },
  };
}
