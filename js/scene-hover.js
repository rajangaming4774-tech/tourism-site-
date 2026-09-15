/* The hover highlight — a ring on the ground around the monument under the
 * cursor.
 *
 * WHY A RING AND NOT A TINTED MONUMENT. The obvious highlight is to light up
 * the monument's own geometry, and it cannot be done consistently here,
 * because the seven POIs do not share a representation. The Shore Temple and
 * the Pancha Rathas are meshes out of the GLB; the Descent of the Ganges is
 * rebuilt by js/scene-penance.js; Varaha, Mahishasuramardini and
 * Olakkanneshwara are the plain stand-in boxes; and Krishna's Butterball has
 * no object of its own at all — it is a handful of triangles inside the single
 * merged `monument` mesh that js/scene-massing.js builds to keep the draw call
 * count down. Tinting that one would mean either splitting the merge (paying
 * back the draw calls the merge exists to save) or carrying a per-vertex
 * monument index and patching the material. Both are real options; neither is
 * worth it to make one of seven monuments behave like the other six.
 *
 * A ring on the ground treats all seven identically, needs nothing from the
 * geometry, and says the true thing anyway: this footprint is what you are
 * pointing at.
 *
 * The ring follows the terrain — each vertex is lifted to the measured ground
 * height under it — so it lies ON the slope rather than cutting into it. That
 * is why it is rebuilt per monument instead of being one ring that gets moved
 * and scaled: a scaled ring carries the wrong heights.
 */
import * as THREE from "../assets/vendor/three.module.js";

/* Ring radius per monument, in metres.
 *
 * These are the extents the rest of the scene already uses, not new
 * measurements: the first three are the MODELLED radii in js/scene-3d.js that
 * clear each enclosure, and the rest are sized to their stand-in boxes and
 * footprints. A ring wants to sit just outside the thing it marks, so it reads
 * as a highlight rather than as part of the monument.
 */
const RADIUS = {
  "shore-temple": 46,
  "pancha-rathas": 58,
  "descent-of-the-ganges": 30,
  "krishnas-butterball": 14,
  "varaha-cave": 13,
  "mahishasuramardini-mandapa": 15,
  olakkanneshwara: 11,
};
/* Anything not listed — a POI added to data/pois.json later — still gets a
 * ring rather than nothing. */
const DEFAULT_RADIUS = 16;

export const hoverRadius = (id) => RADIUS[id] || DEFAULT_RADIUS;

const SEGMENTS = 72;
/* Band thickness as a fraction of the radius, with a floor so the ring around
 * the Butterball does not vanish to a hairline.
 *
 * Was 0.1, which gives the Shore Temple a 4.6 m band — seen from the 90 m the
 * controls allow, that is not a highlight, it is a ring road. Thickness is in
 * metres and the camera is not, so this can only be tuned for one range: it is
 * tuned for close and mid, where the monument is legible and the highlight has
 * something to do. Pulled all the way out the band goes sub-pixel, and at that
 * distance the marker pills are the affordance anyway. */
const BAND = 0.04;
const MIN_BAND = 1.2;
/* Clear of the ground by enough to beat depth precision at this camera range,
 * low enough to still read as painted on it. */
const LIFT = 0.5;

export function buildHover({ heightAt }) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xa67c2e,        // --gold-page, the same accent the marker pills use
    transparent: true,
    opacity: 0.82,
    side: THREE.DoubleSide,
    /* Depth-TESTED, so the ring disappears behind a hill exactly as the
     * monument does — an outline that glows through terrain would misreport
     * where the thing is. Depth-WRITE off, so it never occludes anything
     * itself. */
    depthWrite: false,
  });

  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.name = "hover-ring";
  mesh.visible = false;
  /* Never an occluder, never a hover target, never a shadow caster: this is
   * feedback about the scene, not part of it. The flag is the same one
   * js/scene-3d.js already reads when gathering raycast targets. */
  mesh.userData.overlay = true;
  mesh.renderOrder = 2;

  let shownId = null;

  /* One annulus, every vertex dropped onto the measured ground beneath it. */
  function ringGeometry(cx, cz, r) {
    const outer = r;
    const inner = Math.max(1, r - Math.max(MIN_BAND, r * BAND));
    const pos = [];
    const idx = [];
    for (let i = 0; i <= SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (const rad of [inner, outer]) {
        const x = cx + ca * rad;
        const z = cz + sa * rad;
        pos.push(x, heightAt(x, z) + LIFT, z);
      }
    }
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  return {
    mesh,
    /* Returns true if anything actually changed, so the caller can decide
     * whether the frame needs redrawing. The scene renders on demand and a
     * pointermove that lands on the monument you were already hovering must
     * not cost a frame. */
    show(poi) {
      if (shownId === poi.id) return false;
      shownId = poi.id;
      mesh.geometry.dispose();
      mesh.geometry = ringGeometry(poi.anchor[0], poi.anchor[2], hoverRadius(poi.id));
      mesh.visible = true;
      return true;
    },
    hide() {
      if (shownId === null) return false;
      shownId = null;
      mesh.visible = false;
      return true;
    },
    /* The terrain arrives progressively, so a ring built before the heightmap
     * landed is sitting on a flat world. Cheap to throw away and redraw. */
    invalidate() {
      shownId = null;
    },
  };
}
