/* Road network for the Mamallapuram 3D scene — Phase 1.
 *
 * Geometry comes from data/mahabalipuram-paths.geojson: 339 real OSM ways,
 * already tagged with `highway`, fetched by scripts/fetch-site-data.js. Nothing
 * here is drawn freehand; if a lane is in the scene, OpenStreetMap put it there.
 *
 * WHAT MAKES A ROAD READ FROM THE AIR
 * -----------------------------------
 * At 200 m up, roadside props are sub-pixel — 500 utility poles would cost
 * frames and change nothing. Three things actually carry a road at that height,
 * and this module builds exactly those:
 *
 *   1. Width hierarchy, straight off the `highway` tag. If everything is one
 *      width the network reads as a mesh of scratches.
 *   2. Edge bands — a dusty shoulder each side of the carriageway, a shade
 *      lighter than it. This used to be the "big one", with a near-black
 *      centre against a cream margin, and it was what made the roads the
 *      loudest thing in the scene. The ground is a satellite photograph now,
 *      and in that photograph the real roads are LIGHTER than the town around
 *      them (measured: the ECR's pixels average #a18b6d against a town core
 *      of #73634a). So the roads are calibrated to sit IN the photo, and the
 *      band is a hint, not a stripe.
 *   3. Vehicles, as colour dots on the surface.
 *
 * Detail arrives by LOD as the camera drops — poles and overhead wires only
 * under 60 m, because thin geometry aliases badly at distance and wires are the
 * worst offender.
 *
 * Vehicles are PARKED, not driving. The scene renders on demand (scene-3d.js
 * only draws when `needsRender` is set), so anything animating continuously
 * would force a render every frame and burn battery on a static view. Parked
 * cars read identically from above and cost nothing.
 *
 * Coordinate frame: the scene's own, via makeProjector(pois.json origin) —
 * +X east, -Z north, +Y up, 1 unit = 1 m. Note this origin is the site centre
 * (80.1915, 12.6168), NOT the Shore Temple origin used by data/anchors.json;
 * see the crossReference block in that file for the offset between them.
 */
import * as THREE from "../assets/vendor/three.module.js";

/* Metres. Trunk/primary/secondary/residential/service are the specified
 * hierarchy; the rest are filled in around them so nothing defaults to zero. */
const WIDTH = {
  trunk: 10,
  trunk_link: 7,
  primary: 10,        // the ECR is the main corridor and must read as one
  primary_link: 7,
  secondary: 7,
  secondary_link: 5.5,
  tertiary: 5.5,
  tertiary_link: 4.5,
  unclassified: 4,
  residential: 4,
  living_street: 4,
  service: 3,
  track: 3,
  pedestrian: 3,
  footway: 1.8,
  path: 1.5,
  steps: 1.5,
};

const DEFAULT_WIDTH = 3;

/* Only these carry a dusty shoulder and parked vehicles. A footpath with a
 * 1.75 m band each side would be mostly band. */
const DRIVABLE = new Set([
  "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link", "unclassified", "residential", "living_street",
  "service", "track",
]);

const BAND_M = 1.2;         // shoulder width each side
const Y_BAND = 0.17;        // the verge sits PROUD of the asphalt
const Y_ROAD = 0.13;        // carriageway, a few cm below the verge
const Y_FOOT = 0.10;
const MAX_SEG_M = 10;       // resample below the 20.9 m terrain grid so roads follow it
const CLIP_M = 1250;        // matches BOARD_HALF in scene-terrain.js
const MITER_LIMIT = 2.5;
const SEA_Y = 0.15;         // the water plane in scene-terrain.js — never drape below it

/* Albedos calibrated against the satellite ground, not against cream sand.
 * Luminance targets: carriageway about 1.05x the town core and 1.3x the land
 * mean; band about 1.3x the town core; footways between. The old asphalt was
 * 0x46423b — L~66, about a third of the old sand's — which is why every road
 * read as a black line drawn on top of the scene. */
const COLOR = {
  asphalt: 0x877d70,
  band: 0xab9e87,
  foot: 0x9a8f7c,
  pole: 0x6b6155,
  wire: 0x2e2a25,
};
const CAR_COLORS = [0xf2f0eb, 0xc9ccd2, 0x8d2f2a, 0x2f4f76, 0xd8a13a, 0x3f5f43];

/* ---------- geometry helpers ---------- */

function resample(pts, maxLen) {
  if (pts.length < 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / maxLen));
    for (let s = 1; s <= steps; s++) out.push([a[0] + (dx * s) / steps, a[1] + (dz * s) / steps]);
  }
  return out;
}

/* Split a way wherever it leaves the board, so a road that passes through the
 * scene is kept as the piece that is actually inside it. */
function clipRuns(pts) {
  const runs = [];
  let run = [];
  for (const p of pts) {
    if (Math.abs(p[0]) <= CLIP_M && Math.abs(p[1]) <= CLIP_M) {
      run.push(p);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs.filter((r) => r.length >= 2);
}

/* Perpendicular offsets with a mitred join, so a corner keeps a constant road
 * width instead of pinching. */
function normals(pts) {
  const n = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    // perpendicular in the XZ plane
    let nx = -dz;
    let nz = dx;

    // Mitre scale: widen the offset at a bend so the outer edge stays parallel.
    if (i > 0 && i < pts.length - 1) {
      const ax = pts[i][0] - prev[0];
      const az = pts[i][1] - prev[1];
      const bx = next[0] - pts[i][0];
      const bz = next[1] - pts[i][1];
      const la = Math.hypot(ax, az) || 1;
      const lb = Math.hypot(bx, bz) || 1;
      const cos = (ax / la) * (bx / lb) + (az / la) * (bz / lb);
      const half = Math.sqrt(Math.max(0.0001, (1 + cos) / 2));
      const scale = Math.min(MITER_LIMIT, 1 / half);
      nx *= scale;
      nz *= scale;
    }
    n.push([nx, nz]);
  }
  return n;
}

/* One flat ribbon, draped on the terrain. Pushes into shared arrays so a whole
 * road class ends up as a single mesh — 300-odd ways would otherwise be 300
 * draw calls. */
function ribbon(pts, halfWidth, y, heightAt, pos, idx) {
  const ns = normals(pts);
  const base = pos.length / 3;
  /* The DEM is sampled every 20.9 m, so a road beside a tank or a backwater can
   * land in a cell whose interpolated height is a few centimetres under zero.
   * Four vertices out of ~2000 do, and the sea plane sits at y=0.15 — so
   * without this clamp a stretch of lane 400 m inland renders underwater. */
  const drape = (x, z) => Math.max(heightAt(x, z), SEA_Y) + y;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [nx, nz] = ns[i];
    const lx = x + nx * halfWidth;
    const lz = z + nz * halfWidth;
    const rx = x - nx * halfWidth;
    const rz = z - nz * halfWidth;
    pos.push(lx, drape(lx, lz), lz);
    pos.push(rx, drape(rx, rz), rz);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = base + i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
}

/* A road is a decal on the terrain: same surface, a few centimetres proud. Over
 * a 1-6000 depth range that offset is below the depth buffer's resolution, so
 * the two z-fight and — drawn in the wrong order — the ground wins and the road
 * vanishes. polygonOffset biases the depth test in the rasteriser instead of
 * moving the geometry, which is the fix for coplanar surfaces; renderOrder
 * alone is not, and lifting the road half a metre would make an embankment. */
function meshFrom(pos, idx, color, name, renderOrder, offsetFactor, heightAt) {
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  /* The TERRAIN's normal, not the ribbon's own. A ribbon's winding flips with
   * the sign of the mitre at a hairpin, so its computed normals point down on
   * some spans and the road renders black — that is why the normals used to be
   * forced straight up. But a road IS ground: it should shade exactly like the
   * slope it lies on, or a lane climbing the ridge glows flat while the ridge
   * beside it darkens. So each vertex takes the gradient of heightAt() under
   * it, and DoubleSide still makes the winding moot. */
  const nrm = new Float32Array(pos.length);
  const E = 4;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2];
    const dx = (heightAt(x + E, z) - heightAt(x - E, z)) / (2 * E);
    const dz = (heightAt(x, z + E) - heightAt(x, z - E)) / (2 * E);
    const l = Math.hypot(dx, 1, dz);
    nrm[i] = -dx / l; nrm[i + 1] = 1 / l; nrm[i + 2] = -dz / l;
  }
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  const m = new THREE.Mesh(
    g,
    /* Standard, so the roads receive the same sky light as the ground they lie
     * on. Transparent from the start, because opacity is driven by camera
     * altitude below (a uniform change, no recompile). */
    new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 1,
      polygonOffset: true,
      polygonOffsetFactor: offsetFactor,
      polygonOffsetUnits: offsetFactor,
    })
  );
  m.name = name;
  m.receiveShadow = true;
  m.renderOrder = renderOrder;
  return m;
}

/* Deterministic PRNG — the same repo convention as scripts/fetch-scenery.js.
 * Math.random() would reshuffle every parked car on each reload. */
function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- main ---------- */

/* Mamallapuram bus stand / main bazaar junction — the densest part of town, and
 * what the vehicle scatter is biased toward. Projected rather than hardcoded in
 * scene units, so it stays correct whatever origin the scene is built on. */
const TOWN_CENTRE_LNGLAT = [80.19444, 12.61972];

export function buildRoads({ paths, project, heightAt, townCentre = null, seed = 20260907 }) {
  if (!paths || !paths.features || !paths.features.length) return null;
  const town = townCentre || project(TOWN_CENTRE_LNGLAT);

  const group = new THREE.Group();
  group.name = "roads";

  const roadPos = [];
  const roadIdx = [];
  const bandPos = [];
  const bandIdx = [];
  const footPos = [];
  const footIdx = [];

  /* Kept for vehicle and pole placement: the centreline of every drivable way
   * that survived clipping, with its class. */
  const drivable = [];

  let kept = 0;
  let skipped = 0;

  for (const f of paths.features) {
    if (!f.geometry || f.geometry.type !== "LineString") continue;
    const cls = (f.properties && f.properties.highway) || "";
    const width = WIDTH[cls] ?? DEFAULT_WIDTH;
    const isDrivable = DRIVABLE.has(cls);

    const projected = f.geometry.coordinates.map((c) => project(c));
    for (const run of clipRuns(projected)) {
      const pts = resample(run, MAX_SEG_M);
      kept++;

      if (isDrivable) {
        // Band first and wider; the carriageway sits on top of it.
        ribbon(pts, width / 2 + BAND_M, Y_BAND, heightAt, bandPos, bandIdx);
        ribbon(pts, width / 2, Y_ROAD, heightAt, roadPos, roadIdx);
        drivable.push({ pts, cls, width });
      } else {
        ribbon(pts, width / 2, Y_FOOT, heightAt, footPos, footIdx);
      }
    }
    if (!projected.length) skipped++;
  }

  /* Drawn after the terrain, each biased a little harder than the thing it sits
   * on: ground < band < carriageway. */
  /* Small offsets. The old -2/-4 (and 2x that in units) bought nothing
   * visible over -1/-2 — polygonOffset scales with depth slope — but they did
   * guarantee the road always won against the terrain at every distance, which
   * was part of why it never sat IN the ground. */
  const band = meshFrom(bandPos, bandIdx, COLOR.band, "road-bands", 1, -1, heightAt);
  const road = meshFrom(roadPos, roadIdx, COLOR.asphalt, "road-surface", 2, -2, heightAt);
  const foot = meshFrom(footPos, footIdx, COLOR.foot, "footways", 1, -1, heightAt);
  for (const m of [band, road, foot]) if (m) group.add(m);

  /* ---------- vehicles ---------- */
  /* Colour dots on a dark surface — the one prop that does read from above.
   * Biased toward the town centre and the big roads, which is where they are. */
  /* Collect every plausible kerbside slot with a weight, then draw a fixed
   * number of them. Tuning a per-vertex probability instead makes the final
   * count depend on how densely OSM happened to node each way, which is not a
   * fact about traffic. */
  const rand = rng(seed);
  const TARGET_CARS = 300;
  const candidates = [];
  for (const { pts, cls, width } of drivable) {
    if (cls === "service" || cls === "track") continue; // back lanes stay empty
    const weightClass = cls === "primary" || cls === "trunk" ? 1 : cls === "secondary" || cls === "tertiary" ? 0.7 : 0.35;
    for (let i = 1; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [px, pz] = pts[i - 1];
      const dTown = Math.hypot(x - town[0], z - town[1]);
      const townPull = Math.max(0.12, 1 - dTown / 900);
      const ang = Math.atan2(x - px, z - pz);
      const side = rand() < 0.5 ? 1 : -1;
      const off = (width / 2) * 0.55 * side;
      candidates.push({
        x: x + Math.cos(ang) * off,
        z: z - Math.sin(ang) * off,
        ang,
        w: weightClass * (0.35 + townPull),
      });
    }
  }

  // Weighted draw without replacement, and never two cars on the same metre.
  const spots = [];
  let pool = candidates;
  let total = pool.reduce((s, c) => s + c.w, 0);
  while (spots.length < TARGET_CARS && pool.length) {
    let r = rand() * total;
    let pick = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].w;
      if (r <= 0) { pick = i; break; }
    }
    const chosen = pool[pick];
    if (!spots.some((s) => Math.hypot(s.x - chosen.x, s.z - chosen.z) < 5.5)) spots.push(chosen);
    total -= chosen.w;
    pool = pool.slice(0, pick).concat(pool.slice(pick + 1));
  }

  if (spots.length) {
    const carGeo = new THREE.BoxGeometry(1.8, 1.5, 4.1);
    const carMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const cars = new THREE.InstancedMesh(carGeo, carMat, spots.length);
    cars.name = "vehicles";
    cars.castShadow = true;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    spots.forEach((s, i) => {
      // A third of them are autos/small — a little size variety reads as traffic.
      const small = rand() < 0.34;
      dummy.position.set(s.x, heightAt(s.x, s.z) + (small ? 0.62 : 0.75), s.z);
      dummy.rotation.set(0, s.ang, 0);
      dummy.scale.set(small ? 0.72 : 1, small ? 0.82 : 1, small ? 0.62 : 1);
      dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
      cars.setColorAt(i, col.setHex(CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]));
    });
    cars.instanceMatrix.needsUpdate = true;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    group.add(cars);
  }

  /* ---------- poles and wires (close range only) ---------- */
  /* Overhead cable is one of the strongest signals that a street is an Indian
   * one, and one of the worst things to draw at distance: a 3 cm line aliases
   * into crawling dashes. Both of these are hidden above CLOSE_M. */
  const poleSpots = [];
  for (const { pts, cls } of drivable) {
    if (cls === "service" || cls === "track") continue;
    let since = 999;
    for (let i = 1; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [px, pz] = pts[i - 1];
      since += Math.hypot(x - px, z - pz);
      if (since < 34) continue; // ~34 m spacing
      since = 0;
      if (Math.hypot(x, z) > 950) continue; // only the core, or it is thousands
      const ang = Math.atan2(x - px, z - pz);
      const off = 4.2 * (rand() < 0.5 ? 1 : -1);
      poleSpots.push({ x: x + Math.cos(ang) * off, z: z - Math.sin(ang) * off });
    }
  }

  const close = new THREE.Group();
  close.name = "road-detail-close";
  close.visible = false;

  if (poleSpots.length) {
    const POLE_H = 7.5;
    const poleGeo = new THREE.CylinderGeometry(0.11, 0.16, POLE_H, 5);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: COLOR.pole }), poleSpots.length);
    poles.name = "poles";
    poles.castShadow = true;
    const dummy = new THREE.Object3D();
    poleSpots.forEach((p, i) => {
      p.y = heightAt(p.x, p.z);
      dummy.position.set(p.x, p.y + POLE_H / 2, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    close.add(poles);

    /* Wires: join consecutive poles that are near enough to be one run, with a
     * slack midpoint so the span hangs rather than ruling a straight line. */
    const wirePts = [];
    for (let i = 1; i < poleSpots.length; i++) {
      const a = poleSpots[i - 1];
      const b = poleSpots[i];
      const span = Math.hypot(b.x - a.x, b.z - a.z);
      if (span > 46) continue; // different street; do not wire across town
      const ay = a.y + 6.9;
      const by = b.y + 6.9;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const my = (ay + by) / 2 - Math.min(0.9, span * 0.035); // sag
      wirePts.push(a.x, ay, a.z, mx, my, mz);
      wirePts.push(mx, my, mz, b.x, by, b.z);
    }
    if (wirePts.length) {
      const wg = new THREE.BufferGeometry();
      wg.setAttribute("position", new THREE.Float32BufferAttribute(wirePts, 3));
      const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: COLOR.wire, transparent: true, opacity: 0.75 }));
      wires.name = "wires";
      close.add(wires);
    }
  }
  group.add(close);

  /* ---------- LOD ----------
   * scene-3d.js has no per-frame hook and renders on demand, so hanging the
   * check on onBeforeRender is both free and correctly timed: it fires only on
   * frames that are actually drawn, which is exactly when the camera moved.
   * Nothing is added to tick(). */
  const CLOSE_M = 60;
  let closeOn = false;
  /* Presence by altitude. The satellite photograph already carries every
   * road at 10 m per pixel; from high up it is the better picture and the
   * ribbons only need to crisp it, so they fade to 55 % above 900 m. Low down
   * the photo is soft and the ribbons carry the road. Footways are invisible
   * from the air in any real photograph and appear only under 400 m. */
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  if (road || band) {
    const host = road || band;
    host.onBeforeRender = (renderer, scene, camera) => {
      const alt = camera.position.y - heightAt(camera.position.x, camera.position.z);
      const want = alt < CLOSE_M;
      if (want !== closeOn) {
        closeOn = want;
        close.visible = want;
      }
      const main = 1 - 0.45 * clamp01((alt - 300) / 600);
      if (road) road.material.opacity = main;
      if (band) band.material.opacity = main;
      if (foot) {
        const f = 0.8 * (1 - clamp01((alt - 120) / 280));
        foot.material.opacity = f;
        foot.visible = f > 0.01;
      }
    };
  }

  group.userData.roads = {
    ways: kept,
    skipped,
    vehicles: spots.length,
    poles: poleSpots.length,
    lod: { closeUnder: CLOSE_M, fadeFrom: 300, footwaysUnder: 400 },
  };
  return group;
}
