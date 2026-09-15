/* Mahabalipuram in 3D — the viewer.
 *
 * Reads data/pois.json and nothing else. No monument, coordinate, price or
 * caption is hardcoded here; swapping the data file swaps the scene.
 *
 * Written as a plain ES module against vendored three.js rather than React +
 * r3f, because this site has no build step and adding one for a single page
 * would change how everything deploys. Every behaviour the brief asks for —
 * damped orbit, clamped polar angle, eased camera flights, DOM-projected POI
 * buttons, occlusion culling, render-on-demand, progressive loading — is plain
 * three.js; r3f and drei are conveniences over exactly these APIs.
 *
 * GEOMETRY. There are no placeholder boxes any more. The ground is measured
 * elevation (js/scene-terrain.js) and the monuments, town and granite are
 * extruded from the same cited GeoJSON the guide map uses
 * (js/scene-massing.js). What is still missing is DETAIL, not shape: a ~30 m
 * DEM and an extruded footprint give you a real landform and a real silhouette,
 * never a carved pillar. Photoreal needs scans, and scans need a camera on site.
 *
 * To drop real meshes in later, load them in js/scene-massing.js and keep the
 * scene contract: origin at the centre of the site, Y-up, 1 unit = 1 metre,
 * +X east, -Z north.
 */
import * as THREE from "../assets/vendor/three.module.js";
import { OrbitControls } from "../assets/vendor/three-orbitcontrols.js";
import { buildTerrain, HAZE } from "./scene-terrain.js";
import { buildSea } from "./scene-sea.js";
import { buildSky } from "./scene-sky.js";
import { buildMassing, makeProjector } from "./scene-massing.js";
import { buildGlobe, lngLatToVec3, R as GLOBE_R } from "./scene-globe.js";
import { buildPalms } from "./scene-palms.js";
import { buildRoads } from "./scene-roads.js";
import { buildInfill } from "./scene-infill.js";
import { buildPenance } from "./scene-penance.js";
import { GLTFLoader } from "../assets/vendor/three-gltfloader.js";
import { MeshoptDecoder } from "../assets/vendor/meshopt_decoder.module.js";
import { buildTour } from "./scene-tour.js";
import { buildHover, hoverRadius } from "./scene-hover.js";
import { el, esc, directionsLink, setStatus } from "./scene-boot.js";

const stage = el("s3-stage");
const markersEl = el("s3-markers");
const panel = el("s3-panel");
const panelBody = el("s3-panel-body");

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Data. The list is already on screen; this is the scene's own. ---------- */
let DATA = null;
/* Which tier scene-boot.js probed: "lite" or "full" ("list" never gets here). */
let TIER = "full";

/* Terrain and massing are progressive: the scene is still worth having with a
 * flat ground and no town, so they resolve to null rather than taking the page
 * down with them. */
const optional = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

let TERRAIN = null;
let MASSING = null;
let OSM = null;
let WORLD = null;
let SCENERY = null;
let PATHS = null;
let COASTLINE = null;
/* The satellite ground's provenance sidecar (assets/textures/ground-s2.json).
 * Optional like the rest: without it the ground is a flat measured tone and
 * the provenance line says nothing about a photograph, which is honest. */
let GROUND = null;
let dataReady = null;
let dataLoaded = false;

/* Entry point, called by js/scene-boot.js once pois.json is on screen and the
 * device has been judged able to run the scene. The optional fetches start
 * immediately — not inside the IntersectionObserver callback, or they would
 * serialise behind the script graph — and start3D() waits on them.
 *
 * world-land.geojson (26 KB) is only for the opening globe, so it is skipped
 * when a #site link asks to land straight on the site. */
export function boot({ doc, tier }) {
  DATA = doc;
  TIER = tier === "lite" ? "lite" : "full";
  const wantsGlobe = !/(^|[#&])site\b/.test(location.hash);
  dataReady = Promise.all([
    optional("data/mahabalipuram-terrain.json"),
    optional("data/mahabalipuram-footprints.geojson"),
    optional("data/mahabalipuram-context.geojson"),
    optional("data/mahabalipuram-osm.json"),
    wantsGlobe ? optional("data/world-land.geojson") : Promise.resolve(null),
    optional("data/mahabalipuram-scenery.geojson"),
    optional("data/mahabalipuram-paths.geojson"),
    optional("data/mamallapuram-coastline.geojson"),
    optional("assets/textures/ground-s2.json"),
  ]).then(([terrain, footprints, context, osm, world, scenery, paths, coastline, groundMeta]) => {
    TERRAIN = terrain;
    MASSING = { footprints, context };
    OSM = osm;
    WORLD = world;
    SCENERY = scenery;
    PATHS = paths;
    COASTLINE = coastline;
    GROUND = groundMeta;
    dataLoaded = true;
    appendGroundProvenance(groundMeta);
  });
  wireChrome();
  maybeStart3D();
}

/* A reconstructed monument, declared — from the extras its GLB carries, so
 * the sentence cannot drift from the file it describes. `what` names the
 * monument; `basis` is the file's own one-line account of its dimensions. */
function appendReconstructionProvenance(meta, what) {
  if (!meta || !meta.note) return;
  el("s3-prov").innerHTML +=
    ` ${esc(what)} in the 3D scene ${what.endsWith("s") ? "are" : "is"} a reconstruction, not a scan: ` +
    `${esc(meta.basis || "shape from cited dimensions and proportions read from photographs")} ` +
    `(${esc(meta.proportions || "data/research/3d/")}); the carved detail is representative and the ` +
    `stone colour is measured from photographs. Nothing on ${what.endsWith("s") ? "them" : "it"} should be ` +
    `read as a record of any particular relief.`;
}
function appendShoreTempleProvenance(meta) {
  appendReconstructionProvenance(Object.assign({ basis: `its shape comes from the cited ${meta.apex_m || 18} m height, the mapped compound wall and proportions read from photographs` }, meta), "The Shore Temple");
}

/* The ground photograph, declared. Interpolated from the sidecar the build
 * script wrote — scene id, date, resolution, attribution — never typed here,
 * so the sentence cannot drift from the file it describes. Real data gets a
 * declaration; the sky, sea and haze are optical and do not. */
function appendGroundProvenance(g) {
  if (!g || !g.scene_id) return;
  const d = new Date(g.datetime);
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const when = `${ist.getUTCDate()} ${ist.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })} ${ist.getUTCFullYear()} at about ${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")} IST`;
  el("s3-prov").innerHTML +=
    ` The ground in the 3D scene is a real satellite photograph: Copernicus Sentinel-2 true-colour ` +
    `scene ${esc(g.scene_id)}, captured ${esc(when)}, ${esc(String(g.m_per_px))} m per pixel — a 20 m monument ` +
    `is two pixels of it, and nothing finer is in it. ${esc(g.attribution)}. It is reprojected onto the ` +
    `terrain and otherwise unaltered: no sharpening, no colour change. The scene's own sun is a ` +
    `late-afternoon one, chosen for legibility, and does not match the mid-morning shadows baked into ` +
    `the photograph. The sea surface, sky and haze are drawn, not photographed.`;
}

/* ---------- Chrome that works with or without the canvas ---------- */
function wireChrome() {
  // The list toggle is wired by js/scene-boot.js, which owns the list.
  el("s3-panel-close").addEventListener("click", closePanel);
  el("s3-reset").addEventListener("click", () => { stopTour(); noteInput(); resetView(); });
  const fly = el("s3-fly");
  if (REDUCED) fly.hidden = true;
  else fly.addEventListener("click", () => (tour ? (stopTour(), setStatus("")) : startTour()));
  el("s3-globe").addEventListener("click", backToGlobe);
  el("s3-cine").addEventListener("click", () => {
    if (cineOn) return exitCine();
    stopTour();
    enterCine();
    // Start from the top of the track, or the camera jumps to wherever the
    // page happens to be scrolled.
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });
}

let lastFocus = null;
/* The element to hand focus back to when the panel closes. Passed in rather
 * than read from document.activeElement: a mouse click does not reliably focus
 * a button in every browser, so activeElement can still be <body> by the time
 * the handler runs, and focus would be dumped at the top of the document. */
function openPanel(poi, invoker) {
  lastFocus = invoker || document.activeElement;
  const t = poi.ticket;
  const ph = poi.placeholder;
  panelBody.innerHTML = `
    <h2 id="s3-panel-title">${esc(poi.name)}</h2>
    ${poi.nameTamil ? `<p class="s3-tamil" lang="ta">${esc(poi.nameTamil)}</p>` : ""}
    ${poi.period ? `<span class="s3-when">${esc(poi.period)}</span>` : ""}
    ${poi.summary ? `<p>${esc(poi.summary)}</p>` : ""}
    ${(poi.history || []).map((h) => `<p>${esc(h)}</p>`).join("")}
    ${
      poi.facilities.length
        ? `<div class="s3-row">${poi.facilities
            .map((f) => `<span class="s3-chip">${esc(f.label)} · ${f.metres} m</span>`)
            .join("")}</div>`
        : `<p class="s3-note">No facilities recorded within 250 m.</p>`
    }
    <p class="s3-note">${
      t.ticketed
        ? "Ticketed by the ASI. This dataset holds no verified price, so none is shown — check at the gate."
        : "No ticket recorded for this monument."
    }</p>
    ${
      /* `modelNote` wins over both generic branches, and it exists because they
       * were both WRONG for one monument. The Descent of the Ganges is not an
       * extruded footprint at any height — it is authored geometry from
       * js/scene-penance.js — but pois.json carries heightIsCited:false for it,
       * so every visitor was told it was a footprint pushed up to a nominal 8 m.
       * The note is written by whoever builds the real geometry (see
       * replacePenance) and read from that geometry's own userData, so the
       * sentence on screen and the mass on screen cannot drift apart. */
      poi.modelNote
        ? `<p class="s3-note">${esc(poi.modelNote)}</p>`
        : ph && ph.heightIsCited
        ? `<p class="s3-note">In the scene this monument stands at its cited height (${ph.height_m} m). The shape is its real footprint extruded — a true silhouette, not carved detail.</p>`
        : `<p class="s3-note">In the scene this is its real footprint extruded to a nominal height. The outline is surveyed; the height is not.</p>`
    }
    <p>${directionsLink(poi, "s3-directions")}</p>
    ${
      (poi.sources || []).length
        ? `<p class="s3-src">Source: ${poi.sources
            .map((s) => (s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.text)}</a>` : esc(s.text)))
            .join("; ")}</p>`
        : ""
    }`;
  panel.hidden = false;
  el("s3-panel-close").focus();
}

function closePanel() {
  panel.hidden = true;
  if (lastFocus && lastFocus.isConnected) lastFocus.focus();
}

/* ---------- 3D, only where it can actually help ---------- */
/* WebGL and the low-end check both happened in js/scene-boot.js (probeTier);
 * a "list" device never reaches this file at all. */
let stageOnScreen = true;
function maybeStart3D() {
  // Lazy-init: nothing is built until the stage is actually on screen.
  let started = false;
  const go = () => { if (!started) { started = true; io.disconnect(); start3D(); } };
  const io = new IntersectionObserver(
    (entries) => { if (entries.some((e) => e.isIntersecting)) go(); },
    { rootMargin: "200px" }
  );
  io.observe(stage);
  /* A second observer stays on for the life of the page: the ambient water
   * tick (see tick()) must not run while a reader has scrolled down into the
   * list and the stage is off screen. */
  new IntersectionObserver((entries) => {
    stageOnScreen = entries.some((e) => e.isIntersecting);
  }).observe(stage);
  /* Development fallback, localhost only. An embedded preview pane can report
   * document.visibilityState === "hidden", and a hidden document's elements
   * never intersect anything — so the observer above never fires and the
   * scene never builds, which looks exactly like a broken page. If the stage
   * geometrically overlaps the viewport 1.5 s after load and nothing has
   * started, start anyway. Never on the deployed site: there the observer is
   * the right gate and this branch does not exist. */
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    setTimeout(() => {
      if (started) return;
      const r = stage.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight + 200) go();
    }, 1500);
  }
}

let renderer, scene, camera, controls, ground;
/* The SSAO composer, or null when postprocessing is off or unavailable.
 * Every render site must branch on it — see tick(). */
let post = null;
/* The hover highlight. `hovered` is the pois[] record under the cursor, or
 * null; hoverRing draws the ring for it. Both the 3D scene and the marker
 * pills write through setHovered(), so the two can never disagree about which
 * monument is lit. */
let hoverRing = null;
let hovered = null;
/* Flat world until the heightmap says otherwise — every consumer can just call
 * this without checking whether terrain loaded. */
let globeScene = null;
let descending = false;
let heightAt = () => 0;
let monumentBounds = new Map();
let needsRender = true;
let frame = 0;
/* Things that move on their own — today, the water. Each entry is fn(tSeconds).
 * The render loop, and only the render loop, decides when `t` advances; a
 * frozen scene is a frozen, correct frame. */
const animated = [];
function registerAnimated(fn) { animated.push(fn); }
const pois = [];

/* Derived from the POIs once they load, not hardcoded — the establishing shot
 * should frame whatever is in the data file, not a guess baked in here. */
const HOME_TARGET = new THREE.Vector3(120, 0, 180);
const HOME_POS = new THREE.Vector3(-620, 430, 900);

/* The establishing shot is a HERO of the Shore Temple, not a survey of the
 * whole site — and that is arithmetic, not taste. At fov 45 on a ~720 px stage,
 * an 18 m tower only reaches 46 px if the camera is within about 390 m of it;
 * the Pancha Rathas are 1,467 m away. No single view frames the site AND shows
 * a monument as a shape. So the camera sits where the tower is 46 px tall at
 * any stage height, with the ridge, the town and the rest of the core behind
 * it, the sea in the foreground and the sky above.
 *
 * HOME_YAW_DEG swings the camera round the temple. Zero would put it straight
 * out to sea looking west — INTO the low afternoon sun, backlit, the temple's
 * east face in shade. 50° brings it round to the south-east, so the sun is
 * well off-axis behind the camera's left shoulder and the lit south face is in
 * view with the shaded east face turning away: the three-quarter view every
 * photograph of this temple is taken from. Recomputed in finish() once the
 * GLB's measured height exists. */
const HOME_YAW_DEG = 50;
const HOME_PITCH_DEG = 14;
const HOME_TOWER_PX = 46;

function frameAll() {
  if (!pois.length) return;
  const shore = pois.find((p) => p.data.id === "shore-temple") || pois[0];
  const T = shore.anchor;
  const groundY = heightAt(T.x, T.z);
  // Measured off the GLB once it lands (rec.groundY is the model's top);
  // until then the cited 18 m.
  const H = Math.max(6, shore.groundY > groundY + 1 ? shore.groundY - groundY : 18);
  const S = stage.clientHeight || 720;
  const fovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const d = THREE.MathUtils.clamp((H * S) / (2 * fovTan * HOME_TOWER_PX), 220, 420);

  // Seaward: opposite the direction from the temple to the rest of the site.
  const others = pois.filter((p) => p !== shore);
  const c = new THREE.Vector3();
  for (const p of others) c.add(p.anchor);
  c.divideScalar(Math.max(1, others.length));
  const inland = Math.atan2(c.x - T.x, -(c.z - T.z));            // bearing to the site core
  const bearing = inland + Math.PI + THREE.MathUtils.degToRad(HOME_YAW_DEG);

  const pitch = THREE.MathUtils.degToRad(HOME_PITCH_DEG);
  HOME_TARGET.set(T.x, groundY + 0.4 * H, T.z);
  HOME_POS.set(
    T.x + Math.sin(bearing) * d * Math.cos(pitch),
    HOME_TARGET.y + d * Math.sin(pitch),
    T.z - Math.cos(bearing) * d * Math.cos(pitch)
  );
  HOME_POS.y = Math.max(HOME_POS.y, floorAt(HOME_POS.x, HOME_POS.z, 14));
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    const towerPx = (H / (2 * d * fovTan)) * S;
    console.log("[3d] home pose", { d: Math.round(d), pitch: HOME_PITCH_DEG, yaw: HOME_YAW_DEG, towerPx: Math.round(towerPx) });
  }
}

/* The floor under every camera. A CLAMP, never a follower: the joystick that
 * once SET the camera's height from the terrain pumped it over the 26 m ridge
 * and was rightly thrown out; this only refuses to let a camera go below the
 * ground plus a clearance, and below a monument's measured top plus 12 m when
 * it is within that monument's ring. Applied to the sampled pose, so
 * OrbitControls re-derives its own spherical from the corrected position on
 * the next update and the clamp sticks. */
function floorAt(x, z, clear) {
  let y = Math.max(heightAt(x, z), 0) + clear;
  for (const p of pois) {
    const r = hoverRadius(p.data.id);
    if ((x - p.anchor.x) ** 2 + (z - p.anchor.z) ** 2 < r * r) y = Math.max(y, p.groundY + 12);
  }
  return y;
}
function clampCameraFloor(clear) {
  const f = floorAt(camera.position.x, camera.position.z, clear);
  if (camera.position.y < f) { camera.position.y = f; return true; }
  return false;
}

/* ---------- Act one: the globe ----------
 *
 * The scene opens on Earth and descends to the site. Both acts share ONE
 * renderer and camera — swapping scenes rather than pages keeps the transition
 * continuous and avoids paying for a second WebGL context.
 *
 * If the world outline file is missing the globe is skipped entirely and the
 * page opens on the site, because an opening act that cannot draw the Earth is
 * worse than no opening act.
 */
const INDIA_BOX = [68, 6, 90, 34]; // generous bbox: a highlight, not a border
let globe = null;
let phase = "site";
/* 0 -> 1 over the intro turn. Held at 1 once settled so the globe stays put.
 *
 * Driven by the CLOCK, not by a frame counter. It was `spinT += 1/210` per
 * frame, which is 3.5s only if you get 60fps — measured at 1.5fps in a
 * backgrounded tab, that intro takes over four minutes, and because the "click
 * India" prompt waits for it, the instruction never appeared at all. Any
 * animation whose duration is counted in frames is really a bet on the frame
 * rate. */
const SPIN_MS = 3500;
let spinT = 0;
let spinStart = 0;

/* How far back the globe has to sit to fit the frame with margin.
 *
 * Not a fixed multiple of the radius: fov is VERTICAL, so in a portrait pane
 * the horizontal field is narrower and a distance that frames the sphere on a
 * wide screen crops it on a tall one. Solved from whichever half-angle is
 * smaller, so it is framed the same at every aspect. */
function globeDistance() {
  const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
  const half = Math.min(vHalf, hHalf);
  return (GLOBE_R / Math.sin(half)) * 1.55; // 1.55 = breathing room around the rim
}

function buildGlobeAct() {
  if (!WORLD || !WORLD.rings) return false;
  globe = buildGlobe({
    world: WORLD,
    siteLngLat: [DATA.origin.lng, DATA.origin.lat],
    indiaBounds: INDIA_BOX,
  });
  globeScene = new THREE.Scene();
  globeScene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f7a, 1.25));
  const key = new THREE.DirectionalLight(0xfff1d4, 1.1);
  key.position.set(-1, 0.6, 1.4);
  globeScene.add(key);
  globeScene.add(globe.group);

  /* Under prefers-reduced-motion the globe does not turn in at all — it starts
   * settled, with the prompt already showing. */
  if (REDUCED) {
    spinT = 1;
    globe.group.rotation.y = 0;
  }

  // Start looking at India, so the thing you are meant to click is facing you.
  const v = lngLatToVec3(78, 20, globeDistance());
  camera.position.copy(v);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.minDistance = GLOBE_R * 1.35;
  controls.maxDistance = GLOBE_R * 7;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  phase = "globe";
  spinT = 0;
  spinStart = performance.now();
  globe.group.rotation.y = -0.9;
  /* No instruction yet. The intro turns the globe for ~3.5s, and telling
   * someone to click India while India is still sliding across the screen is
   * how the target ends up feeling impossible to hit — which is exactly what
   * happened. The prompt appears when the globe stops. */
  setStatus("");
  return true;
}

/* The descent. Not a cut: the globe keeps spinning and shrinking under a wash
 * that covers the swap, so it reads as one continuous move rather than two
 * scenes with a jump between them. */
function descendToSite() {
  if (phase !== "globe" || descending) return;
  descending = true;
  setStatus("Descending…");
  stage.classList.add("is-descending");

  const from = camera.position.clone();
  const to = globe.siteVec.clone().multiplyScalar(1.03);
  const t0 = performance.now();
  const dur = REDUCED ? 0 : 1500;

  (function zoom() {
    const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
    camera.position.lerpVectors(from, to, easeOut(k));
    camera.lookAt(0, 0, 0);
    needsRender = true;
    if (k < 1) return requestAnimationFrame(zoom);
    enterSite();
  })();
}

function enterSite() {
  phase = "site";
  descending = false;
  // Site-scene control limits, replacing the globe's.
  controls.maxDistance = 2600;
  controls.minPolarAngle = THREE.MathUtils.degToRad(15);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
  /* Arrive on a glide, not a cut: from an approach pose on the same bearing,
   * well out and well up, easing in to the hero over 3.8 s. The 1.5 s descent
   * wash covers the scene swap; the glide starts under it. */
  controls.minDistance = 45;
  frameAll();
  const away = HOME_POS.clone().sub(HOME_TARGET);
  const approach = HOME_TARGET.clone().add(away.clone().multiplyScalar(4.5));
  approach.y = HOME_TARGET.y + away.length() * 2.2;
  camera.position.copy(approach);
  controls.target.copy(HOME_TARGET);
  flyToPose(HOME_TARGET, HOME_POS, { dur: 3800, ease: easeInOut });
  stage.classList.remove("is-descending");
  el("s3-globe").hidden = false;
  setStatus("");
  needsRender = true;
  /* Arrive in YOUR hands, not on a rail. The twelve-scene flight is now
   * something you choose from the controls; landing straight into it took the
   * camera away from the visitor before they had looked at anything. */
  el("s3-cine").hidden = false;
}

function backToGlobe() {
  if (!globe) return;
  exitCine();
  el("s3-cine").hidden = true;
  stopTour();
  closePanel();
  buildGlobeAct();
  el("s3-globe").hidden = true;
  needsRender = true;
}

function start3D() {
  if (!dataLoaded) {
    setStatus("Loading the site…");
    dataReady.then(start3D);
    return;
  }
  setStatus("Building the scene…");

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TIER === "full" ? 2 : 1.5));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  /* The shadow map is drawn ON DEMAND. The sun never moves and nothing that
   * casts a shadow ever moves, so re-rendering ~722 monument meshes plus the
   * terrain into the shadow buffer on every drawn frame was pure waste — it
   * only needs redoing when geometry arrives (invalidateSceneCaches sets
   * shadowsDirty). If anything animated ever casts shadows, it must set
   * shadowsDirty itself. */
  renderer.shadowMap.autoUpdate = false;
  /* Filmic tone mapping. Set here, before any material compiles, and read by
   * both render paths: in-material on the direct path, by OutputPass on the
   * composer path. The photograph is dark (median land luminance 85/255) and
   * a low sun is bright; ACES holds the highlights and lifts the midtones the
   * way a camera would. Exposure is CALIBRATED, not eyeballed: rendered top-
   * down at 300 m with the fog off, the ground must come out within 15 % of
   * the photograph's own pixels — the photo renders as the photo. Measured
   * over eight open-ground points: exposure 0.8 with the first lights gave a
   * median of 0.63 (too dark by a third); this exposure with the hemisphere
   * at 1.2 and the environment at 0.6 gives 0.95. The lights carried most of
   * the correction rather than the exposure so the drawn sky and the sun's
   * glitter did not brighten with the ground. */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  stage.insertBefore(renderer.domElement, markersEl);
  stage.classList.add("is-live");

  scene = new THREE.Scene();
  /* Aerial perspective. Without it the 4 km terrain reads as a flat cutout to
   * the horizon; with it the far shore recedes. Tuned to the sky gradient in
   * css/scene-3d.css so the terrain meets the backdrop instead of ending. */
  /* Pushed well out now that the terrain ends in a board edge and a table. The
   * earlier near plane was greying out the very edge the diorama depends on;
   * depth is carried by the vignette instead, as it is on the guide map. */
  /* Haze. Must match C.haze in js/scene-terrain.js or the apron fades to one
   * colour and the air to another, which draws the ring it is meant to hide.
   * Pulled in now that the ground runs 6 km out: the far apron has to actually
   * dissolve, not merely tint. */
  /* Exponential haze — 16 % at 1 km, 30 % at 2 km, 51 % at 4 km, 83 % at
   * 10 km — so the ridge a kilometre off is crisp and the far apron actually
   * dissolves. It began at 0.00024 (64 % at 4 km) and from 300 m up the sea
   * beyond the board was a pale sheet with the coast lost inside it; at this
   * density the far shore still reads, and the horizon veil (js/scene-sky.js)
   * closes the last of the distance. The colour is set once the composer is
   * decided (see setFogColour), because the two render paths mix fog in
   * different colour spaces. */
  scene.fog = new THREE.FogExp2(HAZE.getHex(), 0.00018);

  /* Far plane clears the apron (6 km) and the sea plane beyond it; at 6000 the
   * horizon was being clipped off mid-apron. */
  camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 1, 30000);
  camera.position.copy(HOME_POS);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  /* Full 360 azimuth, never under the terrain: 15deg keeps the camera off the
   * ground plane, 80deg stops it tipping over the top. */
  controls.minPolarAngle = THREE.MathUtils.degToRad(15);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
  controls.minDistance = 90;
  controls.maxDistance = 2600;
  controls.target.copy(HOME_TARGET);
  // One finger orbits; two fingers pinch-zoom and pan.
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.addEventListener("change", () => {
    needsRender = true;
  });
  // Any hand on the controls ends the tour — the user is driving now.
  controls.addEventListener("start", () => { stopTour(); noteInput(); });

  /* Ambient occlusion. Built here rather than in the loader chain because it
   * needs the camera's near/far to convert its distances (js/scene-post.js),
   * and those are final by this line.
   *
   * A composer is a second, separate way for the scene to fail — a lost
   * context, an unsupported multisampled target — so it is optional by
   * construction: if it throws, `post` stays null and every render site falls
   * back to renderer.render(). The scene is never held hostage to the polish. */
  if (wantsPost()) {
    /* Dynamic, so the composer chain (~19 KB gzipped) never downloads on a
     * viewport that will not use it, and is off the critical path everywhere.
     * Until it lands the direct path renders — same tone mapping, no AO — and
     * the fog colour is re-set for the composer's colour space when it does. */
    import("./scene-post.js")
      .then(({ buildPost }) => {
        post = buildPost({ renderer, scene, camera, width: stage.clientWidth, height: stage.clientHeight });
        skyRig.setFogColour(scene.fog, HAZE.getHex(), true);
        needsRender = true;
      })
      .catch((err) => {
        console.warn("[s3] ambient occlusion unavailable, rendering without it", err);
        post = null;
      });
  }

  /* The hover ring. heightAt is passed as a thunk rather than by value because
   * the terrain replaces it when the heightmap lands — a ring built against
   * the flat-world stand-in would float. */
  hoverRing = buildHover({ heightAt: (x, z) => heightAt(x, z) });
  scene.add(hoverRing.mesh);

  /* Local dev only: a console handle, the same convention js/app.js and
   * js/guide-mount.js use. Lets a camera be driven to an exact pose so a fix
   * can be checked from a repeatable viewpoint instead of by hand-orbiting. */
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    window.__s3 = {
      get scene() { return scene; },
      get camera() { return camera; },
      get controls() { return controls; },
      get renderer() { return renderer; },
      get post() { return post; },
      /* Tuning aid: __s3.ao("SSAO") shows the raw AO term, __s3.ao("Default")
       * puts it back. Names are the keys of SSAOPass.OUTPUT. */
      ao(mode) {
        if (!post) return "no composer";
        post.ssao.output = post.ssao.constructor.OUTPUT[mode];
        needsRender = true;
        return mode;
      },
      get heightAt() { return heightAt; },
      look(pos, target) {
        camera.position.set(pos[0], pos[1], pos[2]);
        controls.target.set(target[0], target[1], target[2]);
        controls.update();
        needsRender = true;
      },
    };
  }
  /* Grabbing the scene ends the scripted camera. Deliberate: a reader who
   * reaches for the model wants to look at it, not be carried onward. */
  renderer.domElement.addEventListener("pointerdown", () => { if (cineOn) exitCine(); });
  /* The tilt-shift blur is dropped while the camera moves — the same
   * precaution the guide map takes, and for the same reason: backdrop-filter
   * over a WebGL canvas is a known cost that this environment cannot measure
   * reliably, and nobody studies a scene mid-drag. */
  controls.addEventListener("start", () => stage.classList.add("is-moving"));
  controls.addEventListener("end", () => stage.classList.remove("is-moving"));

  /* Lighting. The brief asks for an HDRI for ambient; there is no HDRI asset
   * yet, so a hemisphere light stands in for it — same role, nothing to
   * download. Swap a PMREM environment in here when one exists.
   *
   * These were 1.05 / 1.5 and were tuned while the monument GLB was smuggling
   * in two Blender lights of its own (see the load handler below), so the scene
   * was really being lit at about 1.05 / 6.8 and everything was tuned against
   * that. With the foreign lights stripped the site went flat and brown, and
   * these are the honest replacements for what the accident was contributing —
   * the diorama warmth without the blowout that was hiding the weathering. */
  /* Contrast, not hue. The scene was beige on beige because the fill was doing
   * most of the work: a 1.4 hemisphere against a 2.55 sun leaves shadow sides
   * nearly as bright as lit ones, so relief and building heights disappear.
   * Dropping the fill and keeping the key gives the ridge and the massing real
   * shading; the palette is unchanged. */
  /* THE SKY, and the light it throws. js/scene-sky.js renders a physical sky
   * once into an environment map; every Standard material is lit by it. The
   * hemisphere light stays as the ambient the remaining Lambert objects
   * (parked cars, poles) can see — sky colour from the Sky's zenith, ground
   * colour from the measured land mean. Its intensity, and the environment's,
   * were set by the ground calibration described at toneMappingExposure
   * above, not by eye: a hazy coastal afternoon has a lot of sky light. */
  const skyRig = buildSky({ renderer, bearingDeg: 230, elevationDeg: 26 });
  scene.add(skyRig.sky);
  scene.add(skyRig.veil);
  scene.environment = skyRig.envTexture;
  scene.environmentIntensity = 0.6;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.log(`[3d] sky: bearing 230 elev 26, env ${skyRig.envMs.toFixed(0)} ms`);
  }
  scene.add(new THREE.HemisphereLight(0xc9d6e2, 0x5e5a48, 1.2));
  /* The sun. Same direction as the disc in the sky and the environment map,
   * by construction — one vector drives all three. Intensity up from 2.5:
   * ACES compresses the highlights and the photograph's albedo is dark.
   * Bearing 230, elevation 26: the same low south-west afternoon sun the
   * scene already had, kept because long raking shadows are what make a 26 m
   * ridge and a row of 8 m buildings read as relief from the air. */
  const sun = new THREE.DirectionalLight(0xffe9c4, 3.0);
  sunRef = sun;
  sun.position.copy(skyRig.sunDir).multiplyScalar(1400);
  sun.castShadow = true;
  /* The shadow camera has to cover the site, not the whole apron — 1200 m was
   * cropping shadows at the edge of town. Bigger map to keep them sharp at the
   * wider extent. */
  sun.shadow.mapSize.set(TIER === "full" ? 2048 : 1024, TIER === "full" ? 2048 : 1024);
  sun.shadow.camera.left = -1800;
  sun.shadow.camera.right = 1800;
  sun.shadow.camera.top = 1800;
  sun.shadow.camera.bottom = -1800;
  sun.shadow.camera.far = 5000;
  sun.shadow.bias = -0.0006;      // stops the terrain shadow-acneing on itself
  sun.shadow.normalBias = 0.6;
  scene.add(sun);

  /* The composer was decided above, so we know which path renders: give the
   * fog its colour in the space that path mixes it in (js/scene-sky.js,
   * setFogColour). Must come after buildSky(), which is why it is here. */
  skyRig.setFogColour(scene.fog, HAZE.getHex(), Boolean(post));

  /* Development handle, localhost only. The verification steps in the README
   * drive the camera and read frame times through this; nothing on the
   * deployed site defines it. `render()` draws a frame synchronously so a
   * caller can read the canvas back in the same task (the drawing buffer is
   * not preserved between frames). */
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    window.__s3 = {
      renderer, scene, camera, controls,
      get post() { return post; },
      heightAt: (x, z) => heightAt(x, z),
      render() { if (post) post.render(); else renderer.render(scene, camera); },
      look(pos, target) {
        camera.position.set(pos[0], pos[1], pos[2]);
        controls.target.set(target[0], target[1], target[2]);
        camera.lookAt(controls.target);
        needsRender = true;
      },
      get home() { return { pos: HOME_POS.toArray(), target: HOME_TARGET.toArray() }; },
      renders: 0,
      stats() { const r = [...WATCHDOG.ring].sort((a, b) => a - b); return { samples: r.length, median: r.length ? r[r.length >> 1] : null, rung: WATCHDOG.rung }; },
      watchdog: { force: (rung) => watchdogStep(rung, 0) },
    };
  }

  /* Terrain from measured elevation, not a modelled mesh — see
   * js/scene-terrain.js. If the heightmap failed to load we fall back to a flat
   * plane so the scene still works; heightAt() then answers 0 everywhere, which
   * is exactly what a flat world means, so nothing downstream needs a branch. */
  if (TERRAIN) {
    /* Sea first: the terrain wants its signed distance to the smoothed coast,
     * so the DEM can be pulled to sea level where OpenStreetMap says there is
     * water (js/scene-sea.js, js/scene-terrain.js). The two guards logged
     * below are the Shore Temple and Pancha Rathas ground heights the GLB
     * bases are baked to — both stand more than 60 m inland, so the
     * correction must leave them exactly alone. */
    const sea = buildSea({
      coastline: COASTLINE,
      project: makeProjector(DATA.origin),
      half: TERRAIN.halfExtent_m,
      far: camera.far,
      colours: GROUND && GROUND.calibration && GROUND.calibration.sea_far
        ? { deep: GROUND.calibration.sea_far, shallow: 0x1e403b, foam: 0xe6e2d6, wet: 0x7d7660 }
        : undefined,
    });
    const t = buildTerrain(TERRAIN, { coastDist: sea.distanceTo });
    if (window.__s3) window.__s3.coastDist = sea.distanceTo;
    ground = t.mesh;
    heightAt = t.heightAt;
    scene.add(ground);
    scene.add(sea.mesh);
    registerAnimated(sea.animate);
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.log(`[3d] coast: ${sea.points} pts @5 m, DEM corrected ${t.corrected} cells, ` +
        `heightAt(shore-temple) ${heightAt(840.27, 35.38).toFixed(2)} m, heightAt(rathas) ${heightAt(-207.49, 867.9).toFixed(2)} m`);
      console.log(`[3d] sea: ${sea.triangles} tris`);
    }
    /* The apron carries the ground 4 km past the survey so the land does not
     * end in mid-air. The old board edge and table are gone: they are what
     * made the terrain read as a cut tile floating over a background. */
    scene.add(t.apron);

    /* The satellite photograph, dropped onto the ground when it arrives. The
     * scene is complete without it (flat measured tone) and simply gains the
     * photo. sRGB, because that is how every viewer of this product reads it. */
    new THREE.TextureLoader().load(
      "assets/textures/ground-s2.jpg",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        t.setGroundTexture(tex);
        needsRender = true;
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          console.log(`[3d] ground drape: ${GROUND ? GROUND.scene_id : "(no sidecar)"} ${GROUND ? GROUND.datetime.slice(0, 10) : ""} 10 m/px ${tex.image.width}x${tex.image.height}`);
        }
      },
      undefined,
      () => console.warn("[3d] ground photograph failed to load; the terrain stays a flat measured tone")
    );
  } else {
    ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x686247, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    setStatus("Elevation data unavailable — showing flat ground.");
  }

  /* Sites where a properly modelled monument replaces the extruded footprint.
   * Centres are the pois.json anchors; radii cover each monument's own
   * enclosure, so nothing of the model is shadowed by a slab underneath it. */
  const MODELLED = [
    { id: "shore-temple",          x: 840.27,  z: 35.38,   r: 46 },
    { id: "pancha-rathas",         x: -207.49, z: 867.9,   r: 58 },
    { id: "descent-of-the-ganges", x: 130.03,  z: -122.63, r: 30 },
  ];

  /* Real massing, extruded from the cited GeoJSON — for everything the
   * modelled GLB does not cover. */
  if (MASSING && (MASSING.footprints || MASSING.context)) {
    const m = buildMassing({
      footprints: MASSING.footprints,
      context: MASSING.context,
      origin: DATA.origin,
      heightAt,
      exclude: MODELLED,
    });
    scene.add(m.group);
    monumentBounds = m.monumentBounds;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.log("[3d] massing", m.counts);
    }
  }

  /* Town infill. OSM maps 238 buildings here and the real core is far denser,
   * so the town was reading as open sand. Every block is invented and says so —
   * see js/scene-infill.js. Placed after the massing so it can avoid the real
   * footprints rather than pile on top of them. */
  if (PATHS && MASSING) {
    const inf = buildInfill({
      paths: PATHS,
      context: MASSING.context,
      project: makeProjector(DATA.origin),
      heightAt,
    });
    if (inf) {
      scene.add(inf);
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        console.log("[3d] town infill (invented):", inf.userData.infill);
      }
    }
  }

  /* The OSM road network: width by highway class, a dusty shoulder each side,
   * parked vehicles, and pole/wire detail that only appears under 60 m. */
  if (PATHS) {
    const r = buildRoads({ paths: PATHS, project: makeProjector(DATA.origin), heightAt });
    if (r) {
      scene.add(r);
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        console.log("[3d] roads", r.userData.roads);
      }
    }
  }

  placeMonumentMarkers();
  placeAmenityMarkers(OSM);

  /* The modelled monuments: Shore Temple, the five rathas, the relief.
   *
   * Authored in Blender to published measurements and exported at the SAME
   * scene frame this viewer uses — origin at the site centre, Y-up, 1 unit =
   * 1 m, +X east, -Z north — with each monument's base already set to its DEM
   * ground height. So it loads at the origin with no transform at all; if it
   * ever needs nudging, the fix belongs in the source scene, not here.
   *
   * Progressive, like everything else heavy: the scene is complete without it
   * and simply gains the monuments when they arrive. */
  /* The GLB is meshopt-compressed (EXT_meshopt_compression + the
   * KHR_mesh_quantization it implies), so the decoder MUST be set before the
   * load or GLTFLoader throws outright — both extensions are in
   * `extensionsRequired`, which is the case the loader refuses to fall back on.
   * Compression bought 301,375 -> 169,034 B gzipped (-43.9%) against a 6,435 B
   * gzipped decoder: a ~123 KB net saving, with all 722 primitives, 53
   * materials and every node name preserved byte-for-byte in structure.
   * `assets/models/mamallapuram-monuments.glb.bak` is the uncompressed original;
   * meshopt is lossless for topology but quantizes attributes, so the .bak is
   * what any re-export should start from, not this file. */
  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(
    "assets/models/mamallapuram-monuments.glb",
    (gltf) => {
      const g = gltf.scene;
      g.name = "monuments";

      /* Strip the authoring scene's own lights and camera before anything else.
       *
       * Blender exports its lights as KHR_lights_punctual and GLTFLoader duly
       * adds them to OUR scene, where they are not wanted: this file arrived
       * carrying a 4.2-intensity sun and a 1.1 fill, on top of the page's own
       * hemisphere 1.05 and sun 1.5. The result was roughly four times the
       * intended illumination on the monuments alone, which drove them past
       * white and flattened every tonal difference in the stone — the granite
       * weathering was in the materials the whole time and simply could not be
       * seen through the blowout.
       *
       * Removed here rather than in the source scene on purpose: the authoring
       * scene NEEDS lights to render previews, and a re-export would quietly
       * reintroduce them. The viewer owns its own lighting. */
      const foreign = [];
      g.traverse((o) => {
        if (o.isLight || o.isCamera) foreign.push(o);
      });
      for (const o of foreign) o.removeFromParent();

      g.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        o.receiveShadow = true;
      });
      scene.add(g);
      invalidateSceneCaches();   // markers must now hide behind real geometry

      /* Everything that has to happen AFTER the last piece of monument geometry
       * is in `g`. Split out of the callback so the Shore Temple swap below can
       * defer it: marker re-anchoring and the stand-in coverage test both
       * measure what is standing, so running them while a monument is still in
       * flight measures the wrong thing. */
      const finish = () => {
        /* Re-anchor the markers for the modelled sites.
         *
         * Those monuments were excluded from the extruded massing, so
         * monumentBounds knows nothing about them and their labels had dropped to
         * ground level — the Shore Temple's marker sitting at the foot of an 18 m
         * tower instead of above it. Measure the real model instead: take the
         * highest point of any mesh standing within each site's radius. */
        const box = new THREE.Box3();
        for (const site of MODELLED) {
          let top = -Infinity;
          g.traverse((o) => {
            if (!o.isMesh) return;
            box.setFromObject(o);
            const cx = (box.min.x + box.max.x) / 2;
            const cz = (box.min.z + box.max.z) / 2;
            if ((cx - site.x) ** 2 + (cz - site.z) ** 2 > site.r * site.r) return;
            if (box.max.y > top) top = box.max.y;
          });
          if (top === -Infinity) continue;
          const rec = pois.find((q) => q.data.id === site.id);
          if (!rec) continue;
          rec.groundY = top;
          rec.anchor.y = top + 10;
        }
        replacePenance(g);
        placeStandIns(g);
        frameAll();   // the Shore Temple's measured height is known now
        shadowsDirty = true;

        needsRender = true;
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          let meshes = 0;
          g.traverse((o) => { if (o.isMesh) meshes++; });
          console.log(`[3d] modelled monuments: ${meshes} meshes`);
        }
      };

      replaceShoreTemple(g, () => replaceRathas(g, finish));
    },
    undefined,
    (err) => {
      // Not fatal: the cited extrusions still stand everywhere else, and the
      // three modelled sites simply show bare ground rather than nothing.
      console.warn("[3d] monument model failed to load:", err && err.message);
      setStatus("The detailed monument models could not load. The rest of the site is unaffected.");
    }
  );

  /* Descent of the Ganges — the granite, rebuilt from zero.
   *
   * What stood here was 405 nodes of procedurally placed elephants and figure
   * blocks, and it read as a stepped mass of boxes. It is DELETED, not hidden.
   * An invented composition is worse than an uncarved rock: a visitor cannot
   * tell which parts of it are evidence and which are guesswork, and this one
   * was entirely guesswork.
   *
   * js/scene-penance.js builds the two natural masses and the cleft between
   * them at the published size — 29.26 m along the relief, 13.10 m at the
   * tallest point. It carves NOTHING, and its header says why: the hundred-odd
   * figures are a fact about a real surface, recoverable from an orthophoto
   * plate or a scan and from nothing else. The UVs it lays down are the channel
   * that plate drops into.
   *
   * assets/models/arjunas-penance-base.glb and scripts/build-penance.py stay in
   * the repo as the Python route to the same geometry, for whenever numpy and
   * trimesh are installed. Neither is loaded at runtime. */
  function replacePenance(monuments) {
    /* Measure the old relief before removing it — its bounding box is the only
     * record of where the face plane and centre line sat. */
    const span = new THREE.Box3();
    const box = new THREE.Box3();
    const doomed = [];
    monuments.traverse((o) => {
      if (!/^relief_/.test(o.name || "")) return;
      doomed.push(o);
      if (o.isMesh) { box.setFromObject(o); span.union(box); }
    });
    if (span.isEmpty()) return;

    const anchor = { x: span.max.x, z: (span.min.z + span.max.z) / 2 };

    for (const o of doomed) {
      if (o.parent) o.parent.remove(o);
      if (o.isMesh && o.geometry) o.geometry.dispose();
    }

    const rock = buildPenance({ heightAt, anchor });
    scene.add(rock);

    /* Human scale. Two figures at the foot of the face, because 13 m of stone
     * only reads as 13 m when there is something 1.7 m beside it. */
    const people = new THREE.Group();
    people.name = "penance-scale-figures";
    const geo = new THREE.CapsuleGeometry(0.26, 1.18, 4, 8);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.9, metalness: 0 });
    for (const [dx, dz] of [[7.5, -4.5], [10.5, 3.0]]) {
      const px = anchor.x + dx;
      const pz = anchor.z + dz;
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, heightAt(px, pz) + 0.85, pz);
      m.castShadow = true;
      people.add(m);
    }
    scene.add(people);

    /* Hand the geometry's own description to the panel.
     *
     * data/pois.json is GENERATED by scripts/build-pois.js, so the correction
     * cannot live there — it would be overwritten on the next build. And it
     * should not live there anyway: the record says heightIsCited:false with a
     * nominal 8 m, which made openPanel tell every visitor this relief was "its
     * real footprint extruded to a nominal height". It is not a footprint, not
     * an extrusion, and not 8 m. Copying the note off userData means the only
     * place the sentence is authored is beside the code that builds the mass. */
    const reliefRec = pois.find((q) => q.data.id === "descent-of-the-ganges");
    if (reliefRec) reliefRec.data.modelNote = rock.userData.penance.note;

    invalidateSceneCaches();
    needsRender = true;
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.log("[3d] penance rebuilt", { deletedNodes: doomed.length, anchor, ...rock.userData.penance });
    }
  }

  /* Stand-in volumes, so no pin points at bare ground.
   *
   * Four of the seven POIs have real geometry: the Shore Temple and the rathas
   * from the GLB, the Butterball from the cited massing, the relief from
   * js/scene-penance.js. Three do not — Varaha, Mahishasuramardini and
   * Olakkanneshwara. The first two are rock-cut, excavated INTO the hill rather
   * than built on it, which is exactly why the massing pipeline refuses them:
   * there is no footprint to extrude.
   *
   * These boxes are PLACEHOLDERS and are dimensioned by eye from the monuments'
   * general description, not from any cited measurement. They are deliberately
   * plain grey and flagged in userData so nothing downstream mistakes them for
   * surveyed geometry. A right-sized box at the right place is more useful than
   * a label hovering over nothing; a box pretending to be a monument is not. */
  const STAND_INS = {
    "varaha-cave": { w: 12, h: 5, d: 8 },
    "mahishasuramardini-mandapa": { w: 16, h: 6, d: 10 },
    olakkanneshwara: { w: 9, h: 7, d: 9 },
  };

  /* Swaps the Shore Temple in the monuments GLB for the architectural
   * reconstruction in assets/models/shore-temple.glb.
   *
   * WHAT IT IS. A reconstruction, not a scan — and it says so on screen, from
   * its own extras. Its one cited dimension is the 18 m height of the tall
   * vimana; its one measured outline is the OSM compound wall (way 370135158,
   * committed as data/research/3d/shore-temple-prakara.geojson: a 46.3 x 21.6 m
   * rectangle at bearing 105°, which the root node carries). Every other
   * proportion was read off photographs and is recorded, pick by pick, in
   * data/research/3d/shore-temple-proportions.json. The vocabulary is the real
   * one — pilasters on lion bases, kapota eaves with kudu arches, hara rows of
   * kuta/sala/panjara shrines on each of the five storeys, griva, octagonal
   * shikhara, kalasha, the moulded plinth, the coped prakara with its seated
   * nandis, the stepped tank with its well and pillar — but no figure, panel or
   * lion on it is a portrait of any real carving. The carved-looking surface is
   * a baked cavity/grain shader, colour and normal, over the measured granite
   * chromaticity. Generated by scripts/blender/shore-temple/ in the cloud
   * Blender; see data/research/3d/06-shore-temple-rebuild.md.
   *
   * It is meshopt-compressed like the monuments GLB, so the decoder is set here
   * too. Its textures are embedded, which GLTFLoader turns into blob: URLs —
   * vercel.json's img-src and connect-src allow blob: for exactly this.
   *
   * FRAME. Authored X=east, Y=up, -Z=north with its origin at the compound's
   * centre, which is the point pois.json pins, so it needs a position and no
   * rotation of its own. Court level is local y=0; the sunken tank goes below
   * it, as it does in the ground.
   *
   * FAILURE IS NOT FATAL. If the file is missing the old Shore Temple stays and
   * the scene is exactly what it was; `done` runs either way, so nothing
   * downstream waits on it. */
  function replaceShoreTemple(g, done) {
    const site = MODELLED.find((s) => s.id === "shore-temple");
    if (!site) { done(); return; }

    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      "assets/models/shore-temple.glb",
      (gltf) => {
        const model = gltf.scene;

        // The authoring scene's sun and camera come along in the file and are
        // not wanted here, exactly as with the monuments GLB above.
        const foreign = [];
        model.traverse((o) => { if (o.isLight || o.isCamera) foreign.push(o); });
        for (const o of foreign) o.removeFromParent();

        // Drop the old one only once the new one is in hand, so a partial
        // failure can never leave the site empty.
        const old = g.getObjectByName("ShoreTemple_root");
        if (old) old.removeFromParent();

        /* The declaration rides in the file. The exporter puts the root
         * empty's custom properties on the node named "ShoreTemple"; the panel
         * note and the provenance sentence are interpolated from them, never
         * typed here, so the text cannot drift from the model it describes. */
        const meta = (model.getObjectByName("ShoreTemple") || model).userData || {};
        model.name = "ShoreTemple_root";
        model.position.set(site.x, heightAt(site.x, site.z), site.z);
        const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const textures = [];
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          for (const key of ["map", "normalMap"]) {
            const t = o.material && o.material[key];
            if (t && !textures.includes(t)) { t.anisotropy = maxAniso; textures.push(t); }
          }
        });
        g.add(model);   // into the monuments group: `finish` measures that group
        invalidateSceneCaches();
        if (meta.note) {
          const rec = pois.find((q) => q.data.id === "shore-temple");
          if (rec) rec.data.modelNote = meta.note;
          appendShoreTempleProvenance(meta);
        }

        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          /* Base and apex, against the DEM. A monument floating above the ground
           * or sunk into it is the failure mode this swap can produce and the
           * eye misses at map scale — the numbers do not. Expect base ~= ground
           * and apex ~= ground + 19 m. */
          const b = new THREE.Box3().setFromObject(model);
          const ground = heightAt(site.x, site.z);
          let tris = 0, meshes = 0;
          model.traverse((o) => { if (o.isMesh) { meshes++; const idx = o.geometry.index; tris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3; } });
          console.log("[3d] shore temple swapped in", {
            ground_m: +ground.toFixed(2),
            base_m: +b.min.y.toFixed(2),
            apex_m: +b.max.y.toFixed(2),
            height_m: +(b.max.y - b.min.y).toFixed(2),
            footprint_m: [+(b.max.x - b.min.x).toFixed(1), +(b.max.z - b.min.z).toFixed(1)],
            meshes, triangles: tris,
            textures: textures.map((t) => (t.image ? `${t.image.width}x${t.image.height}` : "?")),
            reconstruction: meta.reconstruction === true,
          });
          if (meta.reconstruction === true) console.info("[3d] shore temple: reconstruction, carving representative (data/research/3d/06-shore-temple-rebuild.md)");
        }
        done();
      },
      undefined,
      (err) => {
        console.warn("[3d] shore temple model failed to load:", err && err.message);
        done();
      }
    );
  }

  /* Swaps the five rathas (and their elephant, lion and nandi) in the
   * monuments GLB for the architectural reconstruction in
   * assets/models/pancha-rathas.glb — the same treatment as the Shore Temple,
   * with the same declarations, see data/research/3d/07-pancha-rathas-rebuild.md.
   *
   * The old rathas are the top-level nodes of the monuments file whose names
   * begin with the five ratha names or `rathas_`; they are dropped only once
   * the new file is in hand. Its origin is the pancha-rathas anchor (the OSM
   * compound centre pois.json pins), court level at local y=0, no rotation of
   * its own — each ratha is placed inside the file at its OSM centroid. */
  function replaceRathas(g, done) {
    const site = MODELLED.find((s) => s.id === "pancha-rathas");
    if (!site) { done(); return; }
    const OLD = /^(dharmaraja|bhima|arjuna|draupadi|nakula|rathas)_/;
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      "assets/models/pancha-rathas.glb",
      (gltf) => {
        const model = gltf.scene;
        const foreign = [];
        model.traverse((o) => { if (o.isLight || o.isCamera) foreign.push(o); });
        for (const o of foreign) o.removeFromParent();
        for (const o of [...g.children]) if (OLD.test(o.name)) o.removeFromParent();
        const meta = (model.getObjectByName("PanchaRathas") || model).userData || {};
        model.name = "PanchaRathas_root";
        model.position.set(site.x, heightAt(site.x, site.z), site.z);
        const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        const textures = [];
        model.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.receiveShadow = true;
          for (const key of ["map", "normalMap"]) {
            const t = o.material && o.material[key];
            if (t && !textures.includes(t)) { t.anisotropy = maxAniso; textures.push(t); }
          }
        });
        g.add(model);
        invalidateSceneCaches();
        if (meta.note) {
          const rec = pois.find((q) => q.data.id === "pancha-rathas");
          if (rec) rec.data.modelNote = meta.note;
          appendReconstructionProvenance(meta, "The Pancha Rathas");
        }
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
          const b = new THREE.Box3().setFromObject(model);
          const ground = heightAt(site.x, site.z);
          let tris = 0, meshes = 0;
          model.traverse((o) => { if (o.isMesh) { meshes++; const idx = o.geometry.index; tris += idx ? idx.count / 3 : o.geometry.attributes.position.count / 3; } });
          console.log("[3d] pancha rathas swapped in", {
            ground_m: +ground.toFixed(2),
            base_m: +b.min.y.toFixed(2),
            apex_m: +b.max.y.toFixed(2),
            height_m: +(b.max.y - b.min.y).toFixed(2),
            footprint_m: [+(b.max.x - b.min.x).toFixed(1), +(b.max.z - b.min.z).toFixed(1)],
            meshes, triangles: tris,
            textures: textures.map((t) => (t.image ? `${t.image.width}x${t.image.height}` : "?")),
            reconstruction: meta.reconstruction === true,
          });
          if (meta.reconstruction === true) console.info("[3d] pancha rathas: reconstruction, carving representative (data/research/3d/07-pancha-rathas-rebuild.md)");
        }
        done();
      },
      undefined,
      (err) => {
        console.warn("[3d] pancha rathas model failed to load:", err && err.message);
        done();
      }
    );
  }

  function placeStandIns(monuments) {
    const project = makeProjector(DATA.origin);
    const box = new THREE.Box3();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8d8577, roughness: 0.95, metalness: 0 });
    const group = new THREE.Group();
    group.name = "stand-ins";
    const placed = [];

    for (const rec of pois) {
      const spec = STAND_INS[rec.data.id];
      if (!spec || !rec.data.lngLat) continue;
      const [x, z] = project(rec.data.lngLat);

      /* Is anything actually standing here? Test it the way the eye does —
       * cast down and see what you hit — rather than by bounding-box proximity.
       * Proximity said all three were covered; a ray showed two of them sitting
       * over open ground between real monuments and one over nothing at all.
       *
       * Five samples, because a single ray down the middle of the Pancha Rathas
       * drops through the gap BETWEEN the rathas and reports bare earth next to
       * five buildings. */
      const targets = [];
      scene.traverse((o) => {
        if (o.isMesh && o.geometry && o.visible && o.name !== "sea" && !o.userData.placeholder) targets.push(o);
      });
      const g0 = heightAt(x, z);
      const probe = new THREE.Raycaster();
      const DOWN = new THREE.Vector3(0, -1, 0);
      const covered = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6]].some(([ox, oz]) => {
        probe.set(new THREE.Vector3(x + ox, g0 + 150, z + oz), DOWN);
        let hits = [];
        try { hits = probe.intersectObjects(targets, false); } catch { /* sprite in the way */ }
        return hits.some((hit) => hit.point.y > heightAt(x + ox, z + oz) + 0.8);
      });
      if (covered) continue;

      const m = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mat);
      // Sat on the ground from the heightfield, not floated at a guessed Y.
      m.position.set(x, heightAt(x, z) + spec.h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `stand-in:${rec.data.id}`;
      m.userData.placeholder = true;
      group.add(m);
      placed.push(rec.data.id);

      // Lift the label to the top of the box it now has.
      rec.groundY = heightAt(x, z) + spec.h;
      rec.anchor.y = rec.groundY + 10;
    }

    if (placed.length) {
      scene.add(group);
      invalidateSceneCaches();
      needsRender = true;
    }
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
      console.log("[3d] stand-in volumes (placeholders, not surveyed):", placed);
    }
  }

  /* Palms arrive asynchronously (the sprite is rasterised from a data: URI) and
   * are pure ornament, so they are never awaited — the scene is complete
   * without them and simply gains them a frame later. */
  buildPalms({ scenery: SCENERY, project: makeProjector(DATA.origin), heightAt })
    .then((g) => {
      if (!g) return;
      scene.add(g);
      needsRender = true;
    })
    .catch(() => { /* ornament; never worth breaking the scene over */ });
  frameAll();
  camera.position.copy(HOME_POS);
  controls.target.copy(HOME_TARGET);
  renderer.domElement.addEventListener("pointerdown", () => {
    controls.__dragging = true;
    if (phase === "globe" && spinT < 1) {
      spinT = 1; // hand the globe over mid-intro
      setStatus("Click India to descend to Mahabalipuram");
    }
  });
  addEventListener("pointerup", () => { controls.__dragging = false; });
  /* Click India. An angular test against the globe, not a hit on a flat disc —
   * see hitTestIndia in js/scene-globe.js for why. */
  const ndcFrom = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
  };
  renderer.domElement.addEventListener("click", (e) => {
    if (phase === "site") {
      /* A highlight you cannot click is a lie about what is clickable, so the
       * ring is a hit target too — the same monument, the same panel, the same
       * flight as its marker pill. */
      if (hovered) {
        openPanel(hovered.data, hovered.btn);
        flyTo(hovered.data);
      }
      return;
    }
    if (phase !== "globe" || !globe) return;
    ray.setFromCamera(ndcFrom(e), camera);
    if (globe.hitTestIndia(ray)) descendToSite();
  });

  /* Site hover: ray down the cursor, resolve where it lands to a monument.
   *
   * Throttled to one raycast per frame like the globe's, and skipped outright
   * while the camera is flying — during the cinematic tour the pointer is not
   * driving anything and a raycast per frame against every mesh in the scene
   * is pure cost. */
  let siteHoverFrame = 0;
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (phase !== "site") return;
    cancelAnimationFrame(siteHoverFrame);
    siteHoverFrame = requestAnimationFrame(() => {
      /* Not mid-drag: the frame budget is already spoken for and nobody reads
       * labels while swinging the camera.
       *
       * NOT also gated on cineOn, which was the first version of this line and
       * was wrong — the page opens in cinematic mode (body.is-cine, set before
       * the reader touches anything), so that guard switched the highlight off
       * for the default way of viewing the site and left it working only after
       * someone had grabbed the scene. */
      if (controls.__dragging) return;
      ray.setFromCamera(ndcFrom(e), camera);
      const hits = ray.intersectObjects(hoverTargetList(), false);
      setHovered(hits.length ? poiAt(hits[0].point) : null);
      renderer.domElement.style.cursor = hovered ? "pointer" : "";
    });
  });

  /* Hover: light the target and switch the cursor, so it is findable before it
   * is clicked. Throttled to every other frame — a raycast per mousemove on a
   * 64x48 sphere is more work than it needs to be. */
  let hoverFrame = 0;
  let hovering = false;
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (phase !== "globe" || !globe) return;
    cancelAnimationFrame(hoverFrame);
    hoverFrame = requestAnimationFrame(() => {
      ray.setFromCamera(ndcFrom(e), camera);
      const on = globe.hitTestIndia(ray);
      if (on === hovering) return;
      hovering = on;
      globe.setHover(on);
      renderer.domElement.style.cursor = on ? "pointer" : "";
      needsRender = true;
    });
  });
  renderer.domElement.addEventListener("pointerleave", () => {
    setHovered(null);
    renderer.domElement.style.cursor = "";
    if (!globe || !hovering) return;
    hovering = false;
    globe.setHover(false);
    needsRender = true;
  });
  // The site scene is on demand, so anything that can invalidate the buffer has
  // to ask for a frame explicitly.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) needsRender = true;
  });
  addEventListener("resize", onResize);
  onResize();
  /* Local dev only: a handle for verifying camera poses and tour progress, the
   * same affordance js/guide-mount.js exposes as window.__guide. */
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    window.__scene3d = {
      get camera() { return camera; },
      get scene() { return scene; },
      get controls() { return controls; },
      get cineOn() { return cineOn; },
      progress: () => cineProgress(),
      get globe() { return globe; },
      get phase() { return phase; },
      get spinT() { return spinT; },
      raycaster: () => ray,
      THREE,
      tour: () => tourPath,
    };
  }
  setStatus("");
  /* Opens on the globe when the world outlines are available, otherwise
   * straight into the site.
   *
   * A link from the site map arrives with #site and skips the globe: that
   * visitor is already looking at Mahabalipuram, so the "where in the world"
   * act is redundant and only puts a click between them and the flight. It goes
   * through enterSite() rather than merely not building the globe, because
   * enterSite is what hands over to the scroll camera — skip it and you land on
   * a static scene with no flythrough at all. */
  wireJoystick();
  if (/(^|[#&])site\b/.test(location.hash)) {
    enterSite();
    el("s3-globe").hidden = true;   // there is no globe to go back to
    /* `#site&poi=<id>` — from the destination page's site plan — lands on
     * that monument: its panel opens and the arrival glide goes there instead
     * of the home pose, at the same duration so it reads as one flight. Only
     * the POIs this scene knows (data/pois.json); anything else is a stale
     * link and is ignored. */
    const want = (/(?:^|[#&])poi=([^&]+)/.exec(location.hash) || [])[1];
    const poi = want && DATA.pois.find((d) => d.id === decodeURIComponent(want));
    if (poi) {
      openPanel(poi, null);
      flyTo(poi, { dur: 3800, ease: easeInOut });
    }
  } else if (!buildGlobeAct()) {
    el("s3-globe").hidden = true;
  }
  tick();
}

/* Markers only — the geometry now comes from the massing module.
 *
 * Each anchor sits on top of whatever is actually there: the monument's own
 * extruded top where the cited massing includes it, otherwise the terrain
 * surface. That is why a marker no longer floats over sloping ground. */
function placeMonumentMarkers() {
  for (const p of DATA.pois) {
    const x = p.anchor[0];
    const z = p.anchor[2];
    const b = monumentBounds.get(p.osm);
    const y = (b ? b.top : heightAt(x, z)) + 12;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "s3-marker";
    btn.innerHTML = `<span class="s3-dot" aria-hidden="true">•</span><span>${esc(p.name)}</span>`;
    /* Labelled up front. placeMarkers() rewrites this when the marker becomes a
     * cluster, but a marker must never exist without a name — otherwise a
     * screen reader can reach one in the gap before the first layout pass. */
    btn.setAttribute("aria-label", p.name);
    btn.addEventListener("click", () => {
      openPanel(p, btn);
      flyTo(p);
    });
    markersEl.appendChild(btn);
    // Measured once; see the clustering note in placeMarkers().
    const w0 = btn.getBoundingClientRect().width || 140;

    const rec = {
      w: w0,
      data: p,
      btn,
      anchor: new THREE.Vector3(x, y, z),
      groundY: b ? b.top : heightAt(x, z),
      occluded: false,
      cluster: [],
    };
    pois.push(rec);

    /* Hovering the pill lights the monument, not just the pill. The label sits
     * above the thing it names and often well off to one side of it once the
     * camera tilts, so without this the reader has no way to tell which of
     * seven names belongs to which shape. Same state as the 3D hover — see
     * setHovered(). */
    btn.addEventListener("pointerenter", () => {
      if (phase === "site" && !rec.cluster.length) setHovered(rec);
    });
    btn.addEventListener("pointerleave", () => {
      if (hovered === rec) setHovered(null);
    });
  }
  needsRender = true;
}

/* Facility markers — parking, toilets, ticket counters, food.
 *
 * Straight from data/mahabalipuram-osm.json, the same committed OSM extract the
 * guide map's legend counts, so the two pages cannot disagree about where the
 * toilets are. Community-mapped, hence the "check on site" line in the UI.
 *
 * These are deliberately quieter than the monument markers and only appear when
 * the camera is close enough to be useful: 135 amenities drawn at the
 * establishing zoom is confetti, not information. */
const AMENITY_CATS = {
  parking: { label: "Parking", glyph: "P" },
  toilets: { label: "Toilets", glyph: "WC" },
  tickets: { label: "Tickets", glyph: "T" },
  food: { label: "Food", glyph: "F" },
};
const AMENITY_VISIBLE_DIST = 1100;
const amenities = [];

function placeAmenityMarkers(osm) {
  if (!osm || !osm.amenities) return;
  const project = makeProjector(DATA.origin);
  for (const a of osm.amenities) {
    const cat = AMENITY_CATS[a.category];
    if (!cat) continue;
    const [x, z] = project(a.lngLat);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "s3-amenity";
    btn.textContent = cat.glyph;
    btn.setAttribute("aria-label", `${cat.label}${a.name ? `: ${a.name}` : ""}`);
    btn.title = a.name || cat.label;
    markersEl.appendChild(btn);
    amenities.push({ btn, cat, name: a.name, anchor: new THREE.Vector3(x, heightAt(x, z) + 4, z) });
  }
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.log(`[3d] ${amenities.length} facility markers`);
  }
}

function placeAmenities() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const shown = [];
  for (const a of amenities) {
    const d = camera.position.distanceTo(a.anchor);
    if (d > AMENITY_VISIBLE_DIST) {
      a.btn.hidden = true;
      continue;
    }
    v.copy(a.anchor).project(camera);
    if (v.z > 1) {
      a.btn.hidden = true;
      continue;
    }
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    if (x < -30 || x > w + 30 || y < -30 || y > h + 30) {
      a.btn.hidden = true;
      continue;
    }
    /* Thin them out when they pile up; these are orientation, not a list.
     * Distance alone was not enough: a 22px pin 26px from its neighbour still
     * overlaps it, and neither test knew anything about the monument labels,
     * so facility pins were landing on top of monument names. Both are now
     * rectangle tests, and the monument label always wins. */
    const AR = 13;                       // amenity pin half-extent, ~26px across
    const r = { left: x - AR, right: x + AR, top: y - AR, bottom: y + AR };
    const clash = (b, pad) =>
      r.left < b.right + pad && r.right > b.left - pad && r.top < b.bottom + pad && r.bottom > b.top - pad;
    if (labelRects.some((b) => clash(b, 4)) || shown.some((b) => clash(b, 3))) {
      a.btn.hidden = true;
      continue;
    }
    shown.push(r);
    a.btn.hidden = false;
    a.btn.style.left = `${Math.round(x)}px`;
    a.btn.style.top = `${Math.round(y)}px`;
    a.btn.style.opacity = String(Math.max(0.3, 1 - d / AMENITY_VISIBLE_DIST));
  }
}

function onResize() {
  if (!renderer) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h);
  if (post) post.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (phase === "globe" && globe) {
    // Keep the same framing when the pane changes shape.
    camera.position.setLength(globeDistance());
  }
  needsRender = true;
}

/* Whether to run ambient occlusion at all. Three extra fullscreen passes and
 * a second geometry pass: fine on a desktop that renders on demand, not worth
 * it on a phone where the monuments are a few hundred pixels tall. Off on the
 * lite tier, on small viewports, and under the body.no-ssao escape hatch. */
function wantsPost() {
  if (document.body.classList.contains("no-ssao")) return false;
  if (TIER !== "full") return false;
  return window.innerWidth >= 720;
}

/* ---------- Camera flights: eased, never a jump ---------- */
let flight = null;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* `arc` lifts the path in the middle (sin), so a hop between monuments cranes
 * up and over the town instead of tracking straight through it. */
function flyToPose(toT, toP, opts = {}) {
  if (REDUCED) {
    controls.target.copy(toT);
    camera.position.copy(toP);
    needsRender = true;
    return;
  }
  flight = {
    t0: performance.now(),
    dur: opts.dur || 1200,
    ease: opts.ease || easeOut,
    arc: opts.arc || 0,
    fromT: controls.target.clone(),
    toT: toT.clone(),
    fromP: camera.position.clone(),
    toP: toP.clone(),
  };
  needsRender = true;
}

/* Hero poses. Per monument: a distance that scales with the monument's own
 * ring (the same radii the hover highlight uses), a 24° look-down, the target
 * at 40 % of the monument's measured height, and the camera on the SUN side so
 * the lit faces are the ones in view. `HERO` overrides for monuments whose
 * shape needs a specific angle — the great relief is a 13 m east-facing rock
 * face, so it is viewed from the east, low and close. Same convention as
 * STAND_INS: pois.json is generated, so per-monument tuning lives here. */
const SUN_BEARING_DEG = 230;
const HERO = {
  "descent-of-the-ganges": { bearingDeg: 90, pitchDeg: 10, d: 70 },
};
function heroPose(poi) {
  const rec = pois.find((q) => q.data.id === poi.id);
  const gx = poi.anchor[0], gz = poi.anchor[2];
  const ground = heightAt(gx, gz);
  const top = rec && rec.groundY > ground + 1 ? rec.groundY : ground + 8;
  const o = HERO[poi.id] || {};
  const d = o.d || THREE.MathUtils.clamp(3.2 * hoverRadius(poi.id), 100, 240);
  const pitch = THREE.MathUtils.degToRad(o.pitchDeg || 24);
  const bearing = THREE.MathUtils.degToRad(o.bearingDeg !== undefined ? o.bearingDeg : SUN_BEARING_DEG - 35);
  const target = new THREE.Vector3(gx, ground + 0.4 * (top - ground), gz);
  const pos = new THREE.Vector3(
    gx + Math.sin(bearing) * d * Math.cos(pitch),
    target.y + d * Math.sin(pitch),
    gz - Math.cos(bearing) * d * Math.cos(pitch)
  );
  pos.y = Math.max(pos.y, floorAt(pos.x, pos.z, 14));
  return { target, pos };
}

function flyTo(poi, opts) {
  const { target, pos } = heroPose(poi);
  const hop = camera.position.distanceTo(pos);
  flyToPose(target, pos, Object.assign({ dur: 1200, ease: easeOut, arc: Math.min(120, 0.12 * hop) }, opts || {}));
}

function resetView() {
  if (!controls) return;
  flyToPose(HOME_TARGET, HOME_POS);
}

/* ---------- The twelve-scene scroll camera ----------
 *
 * Scroll drives the camera along one continuous spline through the site; see
 * js/scene-tour.js for the path and why it is a spline rather than twelve cuts.
 *
 * It engages automatically once the descent from the globe lands, because that
 * is the brief's flow — globe, descend, then scroll through the site. Any drag
 * on the controls hands the camera back to the reader, which matters: a scene
 * you cannot stop and look at is a video, not a model.
 */
let tourPath = null;
let cineOn = false;
let cineFrame = 0;
let lastScene = null;

function enterCine() {
  if (cineOn || phase !== "site") return;
  if (!tourPath) tourPath = buildTour();
  cineOn = true;
  document.body.classList.add("is-cine");
  el("s3-cine").hidden = false;
  el("s3-cine").setAttribute("aria-pressed", "true");
  el("s3-scene").hidden = false;
  // The reader drives; the orbit controls must not also be writing the camera.
  controls.enabled = false;
  onResize();
  cineStart = performance.now();
  applyCine();
  setStatus("Playing the twelve scenes — touch the scene or the stick to take over");
}

function exitCine(keepStatus) {
  if (!cineOn) return;
  cineOn = false;
  document.body.classList.remove("is-cine");
  el("s3-cine").setAttribute("aria-pressed", "false");
  el("s3-scene").hidden = true;
  controls.enabled = true;
  onResize();
  if (!keepStatus) setStatus("");
  needsRender = true;
}

/* Progress along the track: how far the sticky stage has travelled through it. */
/* Progress through the twelve scenes, measured in TIME rather than in scroll
 * offset. Same curve, same keyframes; it simply plays. */
const CINE_MS = 66000;
let cineStart = 0;

function cineProgress() {
  if (!cineOn) return 0;
  return Math.min(1, (performance.now() - cineStart) / CINE_MS);
}

function applyCine() {
  if (!cineOn || !tourPath) return;
  const t = cineProgress();
  const scene = tourPath.apply(t, camera, controls, { floor: (x, z) => floorAt(x, z, 14), reduced: REDUCED });
  if (scene !== lastScene) {
    lastScene = scene;
    const cap = el("s3-scene");
    cap.classList.add("is-changing");
    setTimeout(() => {
      el("s3-scene-n").textContent = `Scene ${String(scene.n).padStart(2, "0")} of 12`;
      el("s3-scene-t").textContent = scene.title;
      cap.classList.remove("is-changing");
    }, REDUCED ? 0 : 250);
  }
  // The hint is only useful before you have started.
  if (t > 0.02) setStatus("");
  needsRender = true;
}

/* The scroll listener that used to drive this camera is gone.
 *
 * Scrolling a twelve-screen track was a fine way to SCRUB a fixed flight, but
 * it is a bad way to look around: you can only go where the rail goes, the page
 * grew to 1200vh, and on a phone every attempt to look at something moved you
 * somewhere else. The joystick below replaces it — you drive, the camera does
 * not. The twelve scenes survive as a tour you can PLAY, on a timer, because
 * nothing about them needed a scrollbar. */

/* ---------- Cinematic flythrough ----------
 *
 * Visits each monument in turn, holding long enough to read the panel that
 * opens with it. Not an idle auto-spin — it starts only when asked and any
 * interaction cancels it, because a camera that moves on its own while you are
 * trying to look at something is the most irritating thing a scene like this
 * can do. Under prefers-reduced-motion the button is hidden entirely.
 */
let tour = null;

function startTour() {
  if (!pois.length) return;
  exitCine();
  const order = DATA.pois.map((d) => pois.find((p) => p.data.id === d.id)).filter(Boolean);
  tour = { order, i: -1, nextAt: 0 };
  document.body.classList.add("is-touring");
  el("s3-fly").setAttribute("aria-pressed", "true");
  advanceTour();
}

function stopTour(silent) {
  if (!tour) return;
  tour = null;
  document.body.classList.remove("is-touring");
  el("s3-fly").setAttribute("aria-pressed", "false");
  if (!silent) setStatus("");
}

function advanceTour() {
  if (!tour) return;
  tour.i++;
  if (tour.i >= tour.order.length) {
    stopTour();
    resetView();
    return;
  }
  const p = tour.order[tour.i];
  openPanel(p.data, null);
  flyTo(p.data, { dur: 2600, ease: easeInOut });
  setStatus(`${tour.i + 1} of ${tour.order.length} — ${p.data.name}`);
  // 2.6 s flight, then a beat to read.
  tour.nextAt = performance.now() + 6000;
}

/* ---------- Frame loop: renders on demand, not continuously ---------- */
const ray = new THREE.Raycaster();
const v = new THREE.Vector3();

/* Cached: assembling this list per marker per frame showed up as garbage. */
/* Cleared whenever geometry is added or replaced. Both caches list scene
 * objects, so both go stale together; the ring goes with them because it is
 * built against terrain heights that may just have changed. */
let shadowsDirty = true;
function invalidateSceneCaches() {
  occluderCache = null;
  hoverTargets = null;
  shadowsDirty = true;   // geometry changed, so the on-demand shadow map must redraw
  watchdogQuiet(performance.now(), 3000);
  if (hoverRing) hoverRing.invalidate();
}

/* What the hover ray may hit.
 *
 * Deliberately NOT occluders(): that list is terrain plus the merged massing,
 * because a marker must not be occluded by the monument it labels. Hover wants
 * the opposite — the Shore Temple's own spire has to register, or pointing
 * straight at it finds the ground somewhere behind it instead.
 *
 * Nor is it every mesh in the scene, which is what this was first. That list is
 * 332 meshes and 131k triangles, and three.js tests them by brute force: 23 ms
 * a ray, measured, which is more than a whole rendered frame costs. The terrain
 * alone was 16 ms of it — 73k triangles of heightfield that hover has no use
 * for, since pointing at bare ground is not pointing at a monument.
 *
 * So: only the groups that can actually contain a monument, named as
 * js/scene-3d.js adds them to the scene. Everything else in there — terrain,
 * apron, sea, roads, the invented town infill, the palms, the scale figures —
 * is scenery, and a ray that hits scenery has missed.
 */
const HOVERABLE = ["massing", "monuments", "penance", "stand-ins"];

let hoverTargets = null;
function hoverTargetList() {
  if (!hoverTargets) {
    hoverTargets = [];
    for (const name of HOVERABLE) {
      const g = scene.getObjectByName(name);
      if (!g) continue;   // built progressively; some may not exist yet
      g.traverse((o) => {
        if (o.isMesh && o.geometry && o.visible) hoverTargets.push(o);
      });
    }
  }
  return hoverTargets;
}

/* Which monument, if any, is under a point on the ground.
 *
 * Nearest anchor within that monument's own ring radius, so the answer agrees
 * with what the ring will draw — resolving by one rule and drawing by another
 * is how you get a highlight that sits next to the thing you are pointing at.
 * Distance is measured in XZ only: the ray may land on a roof or at its foot,
 * and both mean the same monument. */
function poiAt(point) {
  let best = null;
  let bestD = Infinity;
  for (const rec of pois) {
    const r = hoverRadius(rec.data.id);
    const dx = point.x - rec.anchor.x;
    const dz = point.z - rec.anchor.z;
    const d = dx * dx + dz * dz;
    if (d <= r * r && d < bestD) {
      bestD = d;
      best = rec;
    }
  }
  return best;
}

/* The single writer for the hover state. Both the 3D raycast and the marker
 * pills call this, which is what keeps the ring and the lit pill in step. */
function setHovered(rec) {
  if (rec === hovered) return;
  if (hovered) hovered.btn.classList.remove("is-hot");
  hovered = rec;
  if (rec) {
    rec.btn.classList.add("is-hot");
    hoverRing.show(rec.data);
  } else {
    hoverRing.hide();
  }
  needsRender = true;
}

let occluderCache = null;
function occluders() {
  if (!occluderCache) {
    occluderCache = [ground];
    const g = scene.getObjectByName("massing");
    if (g) for (const child of g.children) occluderCache.push(child);
  }
  return occluderCache;
}

/* ---------- The joystick ----------
 *
 * Replaces the scroll rail. Push the knob and you travel over the site; let go
 * and you stop. Two decisions worth keeping:
 *
 *  - IT MOVES, IT DOES NOT TURN. Dragging the scene already orbits, and a
 *    stick that also rotated would fight that gesture for the same intent. So
 *    the stick translates and the drag turns, which is the division every
 *    third-person camera uses.
 *  - MOVEMENT IS HORIZONTAL ONLY. Following the terrain sounded better than it
 *    looked: the ridge is 26 m over a 4 km board, so riding it pumped the
 *    camera up and down while the visitor was trying to read a monument.
 *    Altitude belongs to zoom, which the wheel and pinch already own.
 *
 * Speed scales with how far out you are — a nudge when you are close to a
 * monument, real distance when you are looking at the whole coast — because one
 * fixed metres-per-second is either unusable close in or glacial far out.
 */
let stickX = 0;                    // -1..1, right positive
let stickY = 0;                    // -1..1, down positive (screen sense)
let stickAt = performance.now();
const STICK_R = 34;                // how far the knob travels, px
const SITE_LIMIT = 1900;           // keep the pivot on the surveyed board
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _rgt = new THREE.Vector3();
const _move = new THREE.Vector3();

function wireJoystick() {
  const pad = el("s3-stick");
  const knob = el("s3-stick-knob");
  if (!pad || !knob) return;
  let pointer = null;

  const set = (dx, dy) => {
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    stickX = (dx * k) / STICK_R;
    stickY = (dy * k) / STICK_R;
    knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
    pad.classList.add("is-active");
    // Taking the stick means you are driving, so the scripted cameras stand down.
    if (cineOn) exitCine(true);
    stopTour();
  };
  const clear = () => {
    stickX = 0;
    stickY = 0;
    knob.style.transform = "";
    pad.classList.remove("is-active");
  };
  const fromEvent = (e) => {
    const r = pad.getBoundingClientRect();
    set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };

  pad.addEventListener("pointerdown", (e) => {
    pointer = e.pointerId;
    // Capture can throw when the pointer is no longer active (and for synthetic
    // events); losing capture only costs us the drag-outside-the-pad case, so it
    // must not take the whole gesture down with it.
    try { pad.setPointerCapture(pointer); } catch (_) { /* keep going uncaptured */ }
    fromEvent(e);
    e.preventDefault();
  });
  pad.addEventListener("pointermove", (e) => {
    if (e.pointerId === pointer) fromEvent(e);
  });
  const release = (e) => {
    if (pointer === null || (e && e.pointerId !== pointer)) return;
    try { pad.releasePointerCapture(pointer); } catch (_) { /* already gone */ }
    pointer = null;
    clear();
  };
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);

  /* Arrow keys, because a drag-only control is the one route around this site
   * that a keyboard could not take. */
  const KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
  };
  pad.addEventListener("keydown", (e) => {
    const v = KEYS[e.key];
    if (!v) return;
    e.preventDefault();
    set(v[0] * STICK_R, v[1] * STICK_R);
  });
  pad.addEventListener("keyup", (e) => { if (KEYS[e.key]) clear(); });
  pad.addEventListener("blur", clear);
}

/* Applies the stick to the camera. Returns true when it actually moved, so the
 * caller can mark the frame dirty without redrawing a still scene. */
function applyStick() {
  const now = performance.now();
  // Clamped: a backgrounded tab returns with a huge dt and would teleport you.
  const dt = Math.min(0.05, (now - stickAt) / 1000);
  stickAt = now;
  if ((!stickX && !stickY) || cineOn || phase !== "site" || flight) return false;

  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-6) return false;   // looking straight down
  _fwd.normalize();
  _rgt.crossVectors(_fwd, _up).normalize();

  const speed = THREE.MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.55, 45, 700);
  _move.set(0, 0, 0)
    .addScaledVector(_fwd, -stickY * speed * dt)
    .addScaledVector(_rgt, stickX * speed * dt);

  controls.target.add(_move);
  camera.position.add(_move);

  /* Stay on the board. Past the survey there is only apron, and a visitor who
   * wanders off it cannot tell whether they have broken the page. Camera and
   * target are corrected together so the framing never shears. */
  const cx = THREE.MathUtils.clamp(controls.target.x, -SITE_LIMIT, SITE_LIMIT);
  const cz = THREE.MathUtils.clamp(controls.target.z, -SITE_LIMIT, SITE_LIMIT);
  if (cx !== controls.target.x || cz !== controls.target.z) {
    camera.position.x += cx - controls.target.x;
    camera.position.z += cz - controls.target.z;
    controls.target.x = cx;
    controls.target.z = cz;
  }
  return true;
}

/* ---------- Motion policy ----------
 * Two kinds of frame. A frame the CAMERA moved (flight, stick, tour, drift,
 * orbit damping) redraws everything including marker placement. An AMBIENT
 * frame — nothing moved but the water is allowed to — redraws at a low fixed
 * rate and skips the marker work, because nothing on screen has moved. Both
 * advance the water clock; nothing else does, so a still scene is a still,
 * correct frame and costs nothing.
 *
 * Ambient frames run only when the tier allows, the user has not asked for
 * reduced motion, the tab is visible, the stage is on screen and the site is
 * showing. On the Iris Xe baseline that is ~22 % GPU duty with AO and ~5 %
 * without: a power question, not a smoothness one, which is what the gates
 * and the watchdog are for. */
const AMBIENT_FPS = { full: 12, lite: 8 };
let waterT = 0;
let lastTick = performance.now();
let lastAmbient = 0;
let ambientEnabled = true;   // the watchdog can switch it off

/* Idle drift — a deliberate reversal, chosen by the user. css/scene-3d.css
 * used to say "no auto-rotate idle spin" and the README that the flythrough
 * "is not an idle auto-spin"; both are updated. What ships is a very slow,
 * BOUNDED orbit: after 20 s with no input it turns at 0.6°/s, any input stops
 * it, and it gives up after 90 s (one ~54° swing) so an idle page does not
 * render forever. Full tier only, never under reduced motion. */
const IDLE_MS = 20000;
const IDLE_MAX_MS = 90000;
let lastInput = performance.now();
let driftOn = false;
function noteInput() { lastInput = performance.now(); if (driftOn) { driftOn = false; controls.autoRotate = false; } }

/* Frame-time watchdog. Samples the rAF-to-rAF delta on frames whose
 * predecessor also rendered (a GPU-bound frame shows up as the NEXT frame's
 * stall). Thirty samples; when the median passes 33 ms, step down one rung,
 * then refuse another step for 2 s. MONOTONIC within a session — no stepping
 * back up, because a throttling integrated GPU oscillates (js/scene-post.js
 * records exactly that). Rungs: 1 drop AO, 2 shadows to 1024², 3 pixel ratio
 * 1, 4 ambient off, 5 shadows off. */
const WATCHDOG = { rung: 0, ring: [], lastStep: 0, prevRendered: false, prevTime: 0, quietUntil: 0 };
/* Frames right after geometry lands are slow for reasons that do not last —
 * shader compiles, the on-demand shadow map redrawing, buffers uploading — and
 * the arrival glide runs through exactly that window. Measured on this
 * machine: a 47 ms median during load on a scene that settles to 16 ms. So
 * every arrival (invalidateSceneCaches) opens a 3 s quiet window in which
 * nothing is sampled, and the ring is cleared. */
function watchdogQuiet(now, ms) {
  WATCHDOG.quietUntil = Math.max(WATCHDOG.quietUntil, now + ms);
  WATCHDOG.ring.length = 0;
}
function watchdogSample(now, rendered) {
  if (now < WATCHDOG.quietUntil) { WATCHDOG.prevRendered = false; WATCHDOG.prevTime = now; return; }
  if (rendered && WATCHDOG.prevRendered) {
    WATCHDOG.ring.push(now - WATCHDOG.prevTime);
    if (WATCHDOG.ring.length >= 30) {
      const sorted = [...WATCHDOG.ring].sort((a, b) => a - b);
      const median = sorted[15];
      WATCHDOG.ring.length = 0;
      if (median > 33 && now - WATCHDOG.lastStep > 2000 && WATCHDOG.rung < 5) {
        WATCHDOG.lastStep = now;
        watchdogStep(WATCHDOG.rung + 1, median);
      }
    }
  }
  WATCHDOG.prevRendered = rendered;
  WATCHDOG.prevTime = now;
}
function watchdogStep(rung, median) {
  WATCHDOG.rung = rung;
  if (rung >= 1 && post) { post.dispose(); post = null; }
  if (rung >= 2 && sunRef && sunRef.shadow.mapSize.x > 1024) {
    sunRef.shadow.mapSize.set(1024, 1024);
    if (sunRef.shadow.map) { sunRef.shadow.map.dispose(); sunRef.shadow.map = null; }
    shadowsDirty = true;
  }
  if (rung >= 3) { renderer.setPixelRatio(1); onResize(); }
  if (rung >= 4) ambientEnabled = false;
  if (rung >= 5 && renderer.shadowMap.enabled) {
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }
  needsRender = true;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.log(`[3d] watchdog: rung ${rung} (median ${median ? median.toFixed(1) : "forced"} ms)`);
  }
}
let sunRef = null;

function tick() {
  requestAnimationFrame(tick);
  frame++;
  const now = performance.now();
  // Clamped: a backgrounded tab returns with a huge dt and would teleport the water.
  const dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  let cameraMoved = false;

  if (flight) {
    const k = Math.min(1, (now - flight.t0) / flight.dur);
    const e = flight.ease(k);
    controls.target.lerpVectors(flight.fromT, flight.toT, e);
    camera.position.lerpVectors(flight.fromP, flight.toP, e);
    if (flight.arc) camera.position.y += Math.sin(Math.PI * e) * flight.arc;
    clampCameraFloor(14);
    if (k >= 1) {
      flight = null;
      stage.classList.remove("is-moving");
    } else stage.classList.add("is-moving");
    cameraMoved = true;
    needsRender = true;
  }

  if (tour && !flight && now > tour.nextAt) advanceTour();

  if (applyStick()) { cameraMoved = true; needsRender = true; noteInput(); }

  // The twelve scenes advance on their own clock.
  if (cineOn) {
    applyCine();
    cameraMoved = true;
    if (cineProgress() >= 1) exitCine();
  }

  /* Idle drift (see above). */
  if (phase === "site" && TIER === "full" && !REDUCED && !flight && !tour && !cineOn && !document.hidden && stageOnScreen) {
    const idle = now - lastInput;
    if (!driftOn && idle > IDLE_MS && idle < IDLE_MAX_MS) { driftOn = true; controls.autoRotate = true; controls.autoRotateSpeed = 0.1; }
    if (driftOn && idle >= IDLE_MAX_MS) { driftOn = false; controls.autoRotate = false; }
  } else if (driftOn) { driftOn = false; controls.autoRotate = false; }

  /* OrbitControls.update() rewrites camera.position from its own spherical
   * offset every frame, whether or not `enabled` is false. So during the
   * cinematic tour it must not run at all — with it running, the tour wrote
   * a pose and the controls immediately overwrote it. Skipping it leaves the
   * tour the only writer. `dt` feeds autoRotate. */
  if (!cineOn && controls.update(dt)) { cameraMoved = true; needsRender = true; }
  if (!cineOn && !flight && phase === "site" && clampCameraFloor(6)) needsRender = true;

  if (phase === "globe") {
    if (!descending && !controls.__dragging && spinT < 1) {
      spinT = Math.min(1, (now - spinStart) / SPIN_MS);
      globe.group.rotation.y = -0.9 * (1 - easeOut(spinT));
      needsRender = true;
      if (spinT >= 1) setStatus("Click India to descend to Mahabalipuram");
    }
    /* The globe renders EVERY frame — a WebGL buffer that is not redrawn can
     * be dropped by the compositor, leaving a blank canvas under the prompt.
     * Observed, not theorised; the globe is cheap enough to just keep drawing. */
    controls.update();
    renderer.render(globeScene, camera);
    needsRender = false;
    watchdogSample(now, false);
    return;
  }

  /* Ambient frames. */
  const ambientOn = ambientEnabled && !REDUCED && !document.hidden && stageOnScreen && phase === "site" && !document.body.classList.contains("no-ambient");
  let ambientDue = false;
  if (ambientOn && !cameraMoved && now - lastAmbient >= 1000 / AMBIENT_FPS[TIER]) {
    lastAmbient = now;
    ambientDue = true;
    needsRender = true;
  }
  if (cameraMoved || ambientDue) {
    waterT += dt;
    for (const fn of animated) fn(waterT);
  }

  const rendered = needsRender;
  if (needsRender) {
    if (shadowsDirty) { renderer.shadowMap.needsUpdate = true; shadowsDirty = false; }
    if (post) post.render();
    else renderer.render(scene, camera);
    if (window.__s3) window.__s3.renders = (window.__s3.renders || 0) + 1;
    /* Marker work only when something moved: on an ambient frame every
     * projection and occlusion answer is unchanged, and the raycasts against
     * 73k terrain triangles are the expensive part. */
    if (cameraMoved || !ambientDue) {
      placeMarkers(frame % 3 === 0);
      placeAmenities();
    }
    needsRender = false;
  }
  watchdogSample(now, rendered);
}

/* Where the monument pills ended up this frame. placeAmenities() reads it so
 * a facility pin never lands on a monument name — the monument wins. */
let labelRects = [];

function placeMarkers(testOcclusion) {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  const camDist = camera.position.distanceTo(controls.target);
  const onScreen = [];

  for (const p of pois) {
    v.copy(p.anchor).project(camera);
    const behind = v.z > 1;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    const visible = !behind && x > -80 && x < w + 80 && y > -40 && y < h + 40;

    if (testOcclusion && visible) {
      // Is anything between the camera and the anchor? Its own mesh does not
      // count — the anchor floats just above it.
      const dist = camera.position.distanceTo(p.anchor);
      ray.set(camera.position, v.copy(p.anchor).sub(camera.position).normalize());
      /* Against the terrain and the merged massing. The 6 m slack matters: the
       * anchor floats above the monument's own roof, and without it every
       * marker would occlude itself on the building it labels. */
      const hits = ray.intersectObjects(occluders(), false);
      p.occluded = hits.some((hit) => hit.distance < dist - 6);
    }

    p.screen = { x, y };
    p.cluster = [];
    if (visible && !p.occluded) onScreen.push(p);
    else p.btn.hidden = true;
  }

  /* Fold overlapping markers into one "+N" button.
   *
   * The 40px anchor-distance rule the brief describes is necessary but not
   * sufficient: these labels are monument names, so "Mahishasuramardini
   * Mandapa" is ~260px wide and collides with a neighbour whose anchor is 200px
   * away. So the test is anchor proximity OR an actual overlap of the rendered
   * label boxes. Widths are measured once at mount and cached — measuring per
   * frame would force layout on every render. */
  /* THE BUG THIS FIXES: the old pass tested collisions at the raw projected
   * anchor, then rendered the pill CLAMPED inside the frame. Two anchors 400px
   * apart near the right edge both clamp to the same place and overlap, having
   * passed a proximity test that never looked at where they would actually be
   * drawn. So: resolve on the final clamped rectangle, not the anchor.
   *
   * A pill that swallows others also grows — " +N more" is about 92px — so the
   * rectangle is recomputed at the wider size or the merged pill collides again
   * with whatever it just cleared. */
  const MAX_LABELS = 6;
  const CLUSTER_EXTRA = 92;
  const PAD = 8;
  const HALF_H = 17;

  const rectFor = (p, place, extraW) => {
    const wide = p.w + extraW;
    const halfW = wide / 2 + 6;
    const x = Math.max(halfW, Math.min(w - halfW, place.x));
    const y = Math.max(28, place.y);
    return { x, y, left: x - halfW, right: x + halfW, top: y - HALF_H, bottom: y + HALF_H };
  };
  const hits = (a, b) =>
    a.left < b.right + PAD && a.right > b.left - PAD && a.top < b.bottom + PAD && a.bottom > b.top - PAD;

  // Nearest first: a monument in front should keep its name, not lose it to
  // something a kilometre behind it.
  onScreen.sort(
    (a, b) => camera.position.distanceTo(a.anchor) - camera.position.distanceTo(b.anchor)
  );

  const shown = [];
  for (const p of onScreen) {
    p.place = { x: p.screen.x, y: p.screen.y };
    const r = rectFor(p, p.place, 0);

    let host = shown.find((t) => hits(r, t.rect));

    /* Over budget. Past 5-6 names the scene stops reading as a place and starts
     * reading as a legend, so the rest fold into whichever pill is nearest. */
    if (!host && shown.length >= MAX_LABELS) {
      host = shown.reduce((best, t) =>
        !best || Math.hypot(t.rect.x - r.x, t.rect.y - r.y) < Math.hypot(best.rect.x - r.x, best.rect.y - r.y)
          ? t
          : best
      , null);
    }

    if (host) {
      host.cluster.push(p);
      p.btn.hidden = true;
      // The pill sits at the centroid of everything it represents.
      const members = [host, ...host.cluster];
      host.place = {
        x: members.reduce((s, m) => s + m.screen.x, 0) / members.length,
        y: members.reduce((s, m) => s + m.screen.y, 0) / members.length,
      };
      host.rect = rectFor(host, host.place, CLUSTER_EXTRA);
    } else {
      p.rect = r;
      shown.push(p);
    }
  }

  labelRects = shown.map((t) => t.rect);

  /* Measured backstop.
   *
   * Everything above works on an ESTIMATED pill width — the cached label width
   * plus an allowance for " +N more". The real width is whatever the font
   * renders, and when the estimate falls a few pixels short two pills touch
   * despite passing every test. So after they are positioned, measure what is
   * actually on screen and hide the loser. Only runs when more than one label
   * survives, so the usual single-pill case costs no layout. */
  if (shown.length > 1) {
    queueMicrotask(() => {
      const kept = [];
      for (const p of shown) {
        if (p.btn.hidden) continue;
        const r = p.btn.getBoundingClientRect();
        const clash = kept.some(
          (k) => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top
        );
        if (clash) p.btn.hidden = true;
        else kept.push(r);
      }
    });
  }

  for (const p of shown) {
    const n = p.cluster.length;
    p.btn.hidden = false;
    p.btn.style.left = `${Math.round(p.rect.x)}px`;
    p.btn.style.top = `${Math.round(p.rect.y)}px`;
    // Far markers recede rather than competing with near ones.
    const d = camera.position.distanceTo(p.anchor);
    p.btn.style.opacity = String(Math.max(0.35, Math.min(1, 1.25 - d / (camDist * 2.2))));
    p.btn.classList.toggle("is-cluster", n > 0);
    const label = n > 0 ? `${p.data.name} +${n} more` : p.data.name;
    p.btn.lastElementChild.textContent = label;
    p.btn.setAttribute("aria-label", n > 0 ? `${label}. Opens ${p.data.name}.` : p.data.name);
  }
}
