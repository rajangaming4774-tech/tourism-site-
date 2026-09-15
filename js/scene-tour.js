/* The twelve-scene cinematic camera.
 *
 * Scroll position drives the camera along one continuous path through the site.
 * The twelve scenes of the brief are keyframes ON that path, not twelve
 * separate shots — which is the whole point: the requirement is "no
 * teleportation, no abrupt camera cuts", and cutting between twelve poses is
 * precisely what that forbids.
 *
 * So both the camera position and its look-at target are Catmull-Rom splines
 * through the keyframes. A spline is C1-continuous: velocity carries through
 * each keyframe instead of stopping and restarting, so the move reads as one
 * flight rather than a slideshow. Lerping pose-to-pose would satisfy "smooth"
 * frame by frame and still visibly hitch at every keyframe.
 *
 * Every coordinate is in the scene frame the rest of the viewer uses — origin
 * at the site centre, 1 unit = 1 m, +X east, -Z north — and the monument
 * positions come from pois.json, not from taste.
 */
import * as THREE from "../assets/vendor/three.module.js";

/* Site anchors, from data/pois.json, with the DEM ground height at each. */
const SHORE = { x: 840.27, z: 35.38, g: 4.12 };
/* g is the terrain height at the rathas as the scene measures it — the
 * `[3d] coast:` log prints heightAt(rathas) on every load, and it read 9.27
 * both before and after the DEM's coast correction. The 9.62 that sat here
 * was earlier drift; the keyframes are offsets from this, so they moved with
 * it. */
const RATHAS = { x: -207.49, z: 867.9, g: 9.27 };
const RELIEF = { x: 130.03, z: -122.63, g: 14.25 };

/* The twelve scenes. `pos` is where the camera is, `at` is what it looks at.
 *
 * Scene 5 orbits the Shore Temple, which needs more than one keyframe to
 * describe an arc, so it contributes three — the spline reads them as one
 * continuous swing. Scene numbering below is the brief's; several scenes share
 * a stretch of the same curve, which is what makes it a flight. */
export const SCENES = [
  /* The first and last scenes sit at the ends of the spline, so they would each
   * get only HALF an interval of scroll — about 3.8% against 7.7% for everything
   * between. Each therefore has a second keyframe, slightly displaced, which
   * restores a full share and adds a slow drift into the opening and out of the
   * closing shot rather than a dead hold. Offset, not duplicated: a repeated
   * control point makes a zero-length segment. */
  {
    n: 1, title: "The Coromandel Coast",
    pos: [2260, 1660, 2170], at: [250, 0, 240],
  },
  {
    n: 1, title: "The Coromandel Coast",
    pos: [2100, 1500, 2000], at: [250, 0, 240],
  },
  {
    n: 2, title: "Descending",
    pos: [1620, 760, 1500], at: [520, 0, 200],
  },
  {
    n: 3, title: "Toward the Shore Temple",
    pos: [1320, 380, 760], at: [SHORE.x, SHORE.g + 12, SHORE.z],
  },
  {
    n: 4, title: "Shore Temple",
    pos: [1010, 130, 250], at: [SHORE.x, SHORE.g + 12, SHORE.z],
  },
  // Scene 5: three keyframes describing one slow orbit, close and low.
  {
    n: 5, title: "Kshatriyasimhesvara", orbit: true,
    pos: [SHORE.x + 96, SHORE.g + 52, SHORE.z + 92], at: [SHORE.x, SHORE.g + 11, SHORE.z],
  },
  {
    n: 5, title: "Kshatriyasimhesvara", orbit: true,
    pos: [SHORE.x - 78, SHORE.g + 46, SHORE.z + 74], at: [SHORE.x, SHORE.g + 11, SHORE.z],
  },
  {
    n: 5, title: "Kshatriyasimhesvara", orbit: true,
    pos: [SHORE.x - 92, SHORE.g + 44, SHORE.z - 66], at: [SHORE.x, SHORE.g + 10, SHORE.z],
  },
  {
    n: 6, title: "Inland",
    pos: [420, 300, 430], at: [40, 14, 430],
  },
  {
    n: 7, title: "Pancha Rathas",
    pos: [-30, 150, 1020], at: [RATHAS.x, RATHAS.g + 8, RATHAS.z],
  },
  {
    // Down onto the plinth and along the row, which is the only way to see that
    // the five are five different buildings.
    n: 8, title: "Five Rathas, five roofs",
    pos: [RATHAS.x + 44, RATHAS.g + 20, RATHAS.z - 40], at: [RATHAS.x, RATHAS.g + 6, RATHAS.z + 6],
  },
  {
    n: 9, title: "Toward the great relief",
    pos: [330, 210, 240], at: [RELIEF.x, RELIEF.g + 10, RELIEF.z],
  },
  {
    n: 10, title: "Descent of the Ganges",
    pos: [RELIEF.x + 88, RELIEF.g + 34, RELIEF.z - 26], at: [RELIEF.x, RELIEF.g + 8, RELIEF.z],
  },
  {
    // Close on the cleft — the fissure the whole composition is built around.
    n: 11, title: "The cleft",
    pos: [RELIEF.x + 34, RELIEF.g + 11, RELIEF.z - 4], at: [RELIEF.x - 2, RELIEF.g + 7, RELIEF.z],
  },
  {
    n: 12, title: "Where stone meets the sea",
    pos: [1850, 980, 1180], at: [520, 0, 220],
  },
  {
    n: 12, title: "Where stone meets the sea",
    pos: [2040, 1120, 1360], at: [520, 0, 220],
  },
];

export function buildTour() {
  const posCurve = new THREE.CatmullRomCurve3(
    SCENES.map((s) => new THREE.Vector3(...s.pos)),
    false,
    "catmullrom",
    0.5
  );
  const atCurve = new THREE.CatmullRomCurve3(
    SCENES.map((s) => new THREE.Vector3(...s.at)),
    false,
    "catmullrom",
    0.5
  );

  /* Scroll is mapped UNIFORMLY across the keyframes — each interval gets an
   * equal slice — not by arc length.
   *
   * Arc length was the first instinct and it is wrong for this. It makes scroll
   * distance proportional to distance travelled, so the two-kilometre transits
   * swallow the timeline and the close approaches get nothing: measured, scenes
   * 10 and 11 (up to the relief, then into the cleft) occupied about 5% of the
   * scroll between them and flashed past, while the final pull-back had a
   * quarter of it. Those close-ups are scenes the brief asks for by name.
   *
   * Uniform mapping gives every scene the same dwell. The camera then moves
   * fast over long legs and slowly at the subjects — which is what a flight
   * does anyway, so the cinematic cost is nil and the reading is much better.
   *
   * It also removes the desynchronisation trap entirely: both curves are
   * sampled at the same `c`, so they cannot drift apart the way they did when
   * each had its own arc-length table. */

  const _p = new THREE.Vector3();
  const _a = new THREE.Vector3();

  /* Which of the brief's twelve scenes a given progress falls in. Keyframes are
   * evenly spaced along the path, so the label follows the nearest one. */
  function sceneAt(t) {
    const i = Math.min(SCENES.length - 1, Math.max(0, Math.round(t * (SCENES.length - 1))));
    return SCENES[i];
  }

  /* Feel, on top of the same path.
   *
   * Global ease: the flight departs from rest over the first 4 s and comes to
   * rest over the last 5 s, linear between — no dead hold at either end.
   *
   * Per-segment ease, PARTIAL: velocity dips to ~65 % through each keyframe
   * rather than to zero — zero would recreate exactly the hitch this file's
   * header warns about. Off across the Shore Temple orbit, whose swing must
   * stay even.
   *
   * Look-ahead: the gaze samples the path ~0.8 s ahead of the position, so
   * the camera turns INTO a bend like a vehicle rather than swinging after it.
   *
   * Bank: a little roll from the yaw rate (max 2.5°), smoothed over 0.25 s.
   * Stateless — camera.up is untouched, so the next controls.update() resets it.
   *
   * Floor: the sampled pose is clamped to the terrain floor the rest of the
   * scene uses. The keyframes already clear it; this is the net for the
   * 9→10→11 approach and any future edit. */
  const N = SCENES.length - 1;
  const SEG_EASE = 0.35;
  const LOOK_AHEAD = 0.012;
  const smooth = (x) => x * x * (3 - 2 * x);
  const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);
  const TOTAL_S = 66;
  let lastDir = null, roll = 0;
  const _d = new THREE.Vector3();

  return {
    /* t is 0..1 progress. Writes straight into the camera and the orbit
     * target so the same controls keep working the moment the tour is left. */
    apply(t, camera, controls, opts = {}) {
      let c = Math.min(1, Math.max(0, t));
      if (!opts.reduced) {
        // global ease-in over 4 s and ease-out over 5 s of the 66 s
        const a = 4 / TOTAL_S, b = 1 - 5 / TOTAL_S;
        if (c < a) c = a * smoother(c / a);
        else if (c > b) c = b + (1 - b) * (1 - smoother((1 - c) / (1 - b)));
        // partial per-segment ease
        const i = Math.min(N - 1, Math.floor(c * N));
        const f = c * N - i;
        const orbitSeg = SCENES[i].orbit && SCENES[i + 1].orbit;
        const k = orbitSeg ? 0 : SEG_EASE;
        c = (i + f + k * (smooth(f) - f)) / N;
      }
      // One parameter, both curves. getPoint spreads t evenly over the segments.
      posCurve.getPoint(c, _p);
      atCurve.getPoint(Math.min(1, c + (opts.reduced ? 0 : LOOK_AHEAD)), _a);
      if (opts.floor) _p.y = Math.max(_p.y, opts.floor(_p.x, _p.z));
      camera.position.copy(_p);
      controls.target.copy(_a);
      camera.lookAt(_a);
      if (!opts.reduced) {
        _d.subVectors(_a, _p).setY(0).normalize();
        if (lastDir) {
          const yawRate = Math.atan2(lastDir.x * _d.z - lastDir.z * _d.x, lastDir.dot(_d)) * 60; // rad/s at 60 fps
          const target = THREE.MathUtils.clamp(15 * yawRate, -2.5, 2.5) * (Math.PI / 180);
          roll += (target - roll) * 0.066;   // EMA, tau ~0.25 s at 60 fps
          camera.rotateZ(roll);
        }
        lastDir = lastDir || new THREE.Vector3();
        lastDir.copy(_d);
      }
      return sceneAt(c);
    },
    sceneAt,
    count: SCENES.length,
  };
}
