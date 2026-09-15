/* Palms for the 3D scene — the same planting the guide map draws, from the
 * same file, so the two views agree about where there is vegetation.
 *
 * DECORATIVE, and the same honesty line applies here as there: OpenStreetMap
 * maps no individual trees in Mahabalipuram's core, so these positions are
 * invented. What is real is the land cover — every palm in
 * data/mahabalipuram-scenery.geojson falls inside a polygon OSM tags as grass,
 * park, garden or scrub. The claim "this ground is vegetated" is sourced; the
 * trunk position is not, and the page says so.
 *
 * Drawn as camera-facing billboards, which is both what the guide does under
 * pitch and what a physical diorama's card trees actually look like.
 */
import * as THREE from "../assets/vendor/three.module.js";

/* Same silhouette as the guide's sprite (js/guide-map.js), redrawn here rather
 * than shared because that one is built for MapLibre's addImage and this needs
 * a texture. Keep them in step if either changes. */
const PALM_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="80" viewBox="0 0 64 80">' +
  '<path d="M32 79 C30 60 30 48 31 35 L36 35 C37 48 37 60 35 79 Z" fill="#7c6547"/>' +
  '<g fill="#6d7a46">' +
  '<path d="M33 36 C22 30 12 28 3 33 C11 23 24 23 34 32 Z"/>' +
  '<path d="M34 36 C45 30 55 28 63 33 C55 23 42 23 33 32 Z"/>' +
  '<path d="M33 34 C26 22 18 14 9 11 C22 11 30 21 35 31 Z"/>' +
  '<path d="M34 34 C41 22 49 14 58 11 C45 11 37 21 32 31 Z"/>' +
  '<path d="M33 32 C31 20 32 10 34 1 C39 11 38 23 36 33 Z"/>' +
  "</g>" +
  '<circle cx="33" cy="36" r="2.6" fill="#5d6a3c"/>' +
  "</svg>";

function palmTexture() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 160;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      resolve(tex);
    };
    img.onerror = () => reject(new Error("palm sprite failed to decode"));
    // data: URI — no network, and CSP already allows img-src data:.
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(PALM_SVG);
  });
}

export async function buildPalms({ scenery, project, heightAt }) {
  if (!scenery || !scenery.features || !scenery.features.length) return null;
  const tex = await palmTexture();

  const group = new THREE.Group();
  group.name = "palms";

  /* One shared material across every sprite. 142 sprites with 142 materials
   * would be 142 shader programs; shared, it is one. */
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });

  for (const f of scenery.features) {
    if (f.properties.kind !== "palm") continue;
    const [x, z] = project(f.geometry.coordinates);
    // The scatter varies size per feature; carry that through so the planting
    // does not look stamped.
    const scale = 9 * (f.properties.size || 1);
    const s = new THREE.Sprite(mat);
    s.position.set(x, heightAt(x, z) + scale * 0.5, z);
    s.scale.set(scale * 0.8, scale, 1);
    group.add(s);
  }

  return group.children.length ? group : null;
}
