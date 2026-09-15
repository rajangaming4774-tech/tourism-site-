/* Terrain for the 3D scene, built from measured elevation and dressed in a
 * real satellite photograph.
 *
 * The heights come from data/mahabalipuram-terrain.json, sampled from the
 * Mapzen/AWS terrarium DEM by scripts/build-terrain.js. Nothing here is
 * modelled by hand — the ridge is the shape the survey says it is.
 *
 * The DEM is ~30 m source data, so this is a real landform at coarse
 * resolution, NOT photogrammetry. It will not show you a boulder.
 *
 * THE GROUND IS A PHOTOGRAPH NOW. assets/textures/ground-s2.jpg is a
 * Copernicus Sentinel-2 true-colour frame — free, open, 10 m per pixel —
 * reprojected onto exactly this 4 km board by scripts/build-ground.js, and
 * otherwise untouched: no sharpening, no colour change. It replaces the
 * per-vertex tint that used to be synthesised from height and slope, which was
 * the "flat blurry sand" the scene had instead of ground, and it removes the
 * four hard height thresholds (foam / beach / rock / scrub) whose edges on a
 * 21 m grid were the stair-stepped coastline. Real data, declared on screen
 * (see the provenance line in js/scene-3d.js) — the one honest limit is that
 * a 20 m monument is two pixels of it; detail comes from the models standing
 * on top.
 *
 * The material is MeshStandardMaterial, not Lambert, for one verified reason:
 * in the vendored r169 only Standard materials receive scene.environment, and
 * the monuments, sea and roads are Standard — a Lambert ground beside them
 * would shade differently at every contact edge.
 */
import * as THREE from "../assets/vendor/three.module.js";

/* The colour the world resolves into at distance. Must match the fog set in
 * js/scene-3d.js or the apron fades to one colour and the air to another. */
export const HAZE = new THREE.Color("#d9d3c6");

/* Measured mean of the land pixels in the satellite frame (build-ground.js
 * writes the live value into the sidecar). Used before the JPEG arrives and if
 * it never does, so the ground is at least the right tone. */
const LAND_MEAN = 0x686247;

/* Beyond the DEM. The survey covers ±2000 m and then stops; an apron carries
 * the ground out another 4 km so the land does not end in mid-air.
 *
 * BE CLEAR ABOUT WHAT THIS IS: the apron is NOT measured and NOT photographed.
 * Its inner rim is pinned to the real DEM edge height so there is no seam,
 * and from there it relaxes toward sea level over 4 km — about a 0.4 % grade,
 * which is what this coastal plain actually does, but the shape is inferred,
 * not surveyed. Its colour is the photograph's own border pixel, faded into
 * the haze — never the photograph extended or mirrored, because that would
 * claim land that was never imaged. Nothing should ever be measured off it. */
const APRON_M = 4000;
const APRON_RINGS = 14;

/* Smooth the DEM before meshing.
 *
 * 42 % of the sampled heights land on an exact whole metre, because the source
 * is integer-metre elevation resampled to a 20.9 m grid. Meshed raw that reads
 * as stacked contour terracing — the landform arrives in 1 m steps, and every
 * step catches the light as a visible shelf. A texture does not hide that: a
 * 26° sun rakes the shelves in the SHADING.
 *
 * Two passes of a separable 5-tap binomial kernel (≈ Gaussian, sigma ~1 cell),
 * spanning about 84 m — far narrower than the ridge, far wider than the steps.
 *
 * The result feeds BOTH the mesh and heightAt(). It has to: heightAt is what
 * every building, road, monument and marker asks for its Y. */
function smoothHeights(heights, grid, passes = 2) {
  const K = [1, 4, 6, 4, 1];
  const KS = 16;
  let src = Float32Array.from(heights);
  const tmp = new Float32Array(src.length);
  const clamp = (i) => (i < 0 ? 0 : i > grid - 1 ? grid - 1 : i);
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += src[j * grid + clamp(i + k)] * K[k + 2];
      tmp[j * grid + i] = s / KS;
    }
    const out = new Float32Array(src.length);
    for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
      let s = 0;
      for (let k = -2; k <= 2; k++) s += tmp[clamp(j + k) * grid + i] * K[k + 2];
      out[j * grid + i] = s / KS;
    }
    src = out;
  }
  return src; // still decimetres
}

/* Pull the DEM to sea level where the coastline says there is water.
 *
 * The ~30 m DEM and the OSM shoreline disagree by about 70 m here, and 35 % of
 * the grid sits below 0.4 m — which is why the old foam band ran across the
 * whole backwater. `coastDist` is the signed distance to the smoothed OSM
 * coast (positive = sea) from js/scene-sea.js. Sea-side vertices are clamped to
 * ≤ 0; the 60 m inland of the line blends from that clamp back to the survey.
 * The shoreline is then drawn by the source accurate to 5–10 m rather than the
 * one accurate to 30. Returns how many cells moved, for the console. */
function correctCoast(heights, grid, half, coastDist) {
  const size = half * 2;
  let moved = 0;
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    const x = -half + (i / (grid - 1)) * size;
    const z = -half + (j / (grid - 1)) * size;
    const d = coastDist(x, z);
    const k = j * grid + i;
    const h = heights[k];
    let nh = h;
    /* Sea level out to 30 m inland of the line, not just to the line: the
     * sea mesh continues that far up the beach as a wet-sand band (see
     * js/scene-sea.js) and must stay above the ground there. Then a lerp back
     * to the DEM over the next 40 m, done by -70 m. The band is exactly as
     * wide as the Shore Temple allows: it stands 76.8 m from the OSM line and
     * its bilinear ground sample reads cells at -70.8, -73.8, -77.3 and
     * -83.8 m (measured). A band to -75 m moved it from 4.29 to 4.03 m, one to
     * -100 m to 2.45 m. It, and the rathas, must print exactly as measured. */
    if (d >= -30) nh = Math.min(h, 0);
    else if (d > -70) nh = THREE.MathUtils.lerp(Math.min(h, 0), h, (-d - 30) / 40);
    if (nh !== h) { heights[k] = nh; moved++; }
  }
  return moved;
}

export function buildTerrain(doc, opts = {}) {
  const { grid, halfExtent_m: half } = doc;
  const size = half * 2;
  const heights = smoothHeights(doc.heights, grid);
  const corrected = opts.coastDist ? correctCoast(heights, grid, half, opts.coastDist) : 0;

  /* heightAt() is the contract the rest of the scene builds on. Bilinear, so a
   * building on a slope does not pop between grid cells. */
  function heightAt(x, z) {
    const u = ((x + half) / size) * (grid - 1);
    const v = ((z + half) / size) * (grid - 1);
    const i0 = Math.max(0, Math.min(grid - 1, Math.floor(u)));
    const j0 = Math.max(0, Math.min(grid - 1, Math.floor(v)));
    const i1 = Math.min(grid - 1, i0 + 1);
    const j1 = Math.min(grid - 1, j0 + 1);
    const tx = u - i0, tz = v - j0;
    const h = (i, j) => heights[j * grid + i] / 10;
    return h(i0, j0) * (1 - tx) * (1 - tz) + h(i1, j0) * tx * (1 - tz) + h(i0, j1) * (1 - tx) * tz + h(i1, j1) * tx * tz;
  }

  const geo = new THREE.PlaneGeometry(size, size, grid - 1, grid - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let j = 0; j < grid; j++) for (let i = 0; i < grid; i++) {
    // PlaneGeometry's first row is -Z after the rotation, matching row 0 =
    // north in the data file — and v = 1 in its UVs, which is where an image's
    // top row lands with the loader's default flipY. So the photo needs no
    // transform either.
    pos.setY(j * grid + i, heights[j * grid + i] / 10);
  }
  geo.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({ color: LAND_MEAN, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  mesh.name = "terrain";

  /* ---------- the apron ---------- */
  const hAt = (i, j) => heights[j * grid + i] / 10;
  const px = (i) => -half + (i / (grid - 1)) * size;
  const rimAt = (t) => {
    const p = ((t % 1) + 1) % 1;
    const side = Math.floor(p * 4);
    const f = p * 4 - side;
    const n = grid - 1;
    const idx = Math.round(f * n);
    if (side === 0) return { h: hAt(idx, 0), x: px(idx), z: -half, i: idx, j: 0 };
    if (side === 1) return { h: hAt(n, idx), x: half, z: px(idx), i: n, j: idx };
    if (side === 2) return { h: hAt(n - idx, n), x: px(n - idx), z: half, i: n - idx, j: n };
    return { h: hAt(0, n - idx), x: -half, z: px(n - idx), i: 0, j: n - idx };
  };
  const STEPS = (grid - 1) * 2;
  const aPos = [], aCol = [], rimRef = [];
  const land = new THREE.Color(LAND_MEAN);
  for (let r = 0; r < APRON_RINGS; r++) {
    for (const ringIndex of [r, r + 1]) {
      const k = ringIndex / APRON_RINGS;
      const drop = 1 - Math.pow(1 - k, 2.2);
      const out = k * APRON_M;
      for (let s = 0; s <= STEPS; s++) {
        const t = s / STEPS;
        const rim = rimAt(t);
        const len = Math.max(Math.abs(rim.x), Math.abs(rim.z)) || 1;
        aPos.push(rim.x + (rim.x / len) * out, rim.h * (1 - drop), rim.z + (rim.z / len) * out);
        rimRef.push(rim.i, rim.j, k);
        const c = land.clone().lerp(HAZE, 0.25 + 0.75 * k);
        aCol.push(c.r, c.g, c.b);
      }
    }
  }
  const aIdx = [];
  const rowLen = STEPS + 1;
  for (let r = 0; r < APRON_RINGS; r++) {
    const base = r * rowLen * 2;
    for (let s = 0; s < STEPS; s++) {
      const a = base + s, b = base + rowLen + s;
      aIdx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const apronGeo = new THREE.BufferGeometry();
  apronGeo.setAttribute("position", new THREE.Float32BufferAttribute(aPos, 3));
  apronGeo.setAttribute("color", new THREE.Float32BufferAttribute(aCol, 3));
  apronGeo.setIndex(aIdx);
  apronGeo.computeVertexNormals();
  const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
  apron.name = "terrain-apron";
  apron.receiveShadow = true;

  /* Drop the photograph onto the ground, and repaint the apron from its border.
   * Called when the texture arrives; safe to never call. The material's base
   * colour goes to white because three.js MULTIPLIES map by colour — left at
   * the land mean it would darken the photograph by half. */
  function setGroundTexture(tex) {
    material.map = tex;
    material.color.set(0xffffff);
    material.needsUpdate = true;

    const img = tex.image;
    if (!img || !img.width) return;
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const col = apronGeo.attributes.color;
    const c = new THREE.Color();
    for (let v = 0; v < col.count; v++) {
      const i = rimRef[v * 3], j = rimRef[v * 3 + 1], k = rimRef[v * 3 + 2];
      const ix = Math.max(0, Math.min(cv.width - 1, Math.round((i / (grid - 1)) * (cv.width - 1))));
      const iy = Math.max(0, Math.min(cv.height - 1, Math.round((j / (grid - 1)) * (cv.height - 1))));
      const o = (iy * cv.width + ix) * 4;
      c.setRGB(data[o] / 255, data[o + 1] / 255, data[o + 2] / 255, THREE.SRGBColorSpace);
      c.lerp(HAZE, 0.25 + 0.75 * k);
      col.setXYZ(v, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  return { mesh, apron, heightAt, size, setGroundTexture, corrected };
}
