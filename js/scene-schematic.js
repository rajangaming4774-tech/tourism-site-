/* Mahabalipuram — the SCHEMATIC layer.
 *
 * A massing study, not a render. This is the drawing you approve BEFORE anyone
 * models a monument: it fixes the site layout, the relative proportions, and
 * the twelve camera compositions, using only what the data actually cites.
 *
 * It is a separate page from mahabalipuram-3d.html on purpose. The finished
 * view keeps its own look; nothing here touches it. What the two share is
 * data and the scene contract — origin at the site centre (80.1915 E,
 * 12.6168 N), Y-up, 1 unit = 1 m, +X east, -Z north — so anything approved on
 * this drawing lands in the same place when it is built.
 *
 * WHY IT LOOKS LIKE A DRAWING. A schematic that is merely an ugly render
 * invites the wrong conversation — people review the shading. Flat unlit fills,
 * ink edges, contour lines and visible drawing furniture (grid, scale bar,
 * north point) say plainly that this is a study, so the review stays on layout
 * and proportion, which is what is actually being decided.
 *
 * WHAT IT REFUSES TO DRAW. The honest core of the whole project applies here
 * with more force than anywhere else, because a schematic is exactly where an
 * invented dimension would slip through unnoticed and then get built:
 *
 *   - Five monuments have cited heights and a cited storey count. Only those
 *     five are drawn as MASSING.
 *   - Every other monument is drawn as a POSITION only — a ground mark, no
 *     height, no volume — and the page states, per monument, why there is no
 *     figure. Those reasons are real and various: rock-cut monuments have no
 *     extrudable outline; one OSM way covers two separate monoliths; several
 *     outlines are enclosures rather than buildings; one is a bare node.
 *   - Nothing is proportioned "to look right". A monument with no published
 *     dimension stays flat.
 *
 * So the drawing doubles as the scope document: the massing you can see is the
 * work that can be modelled from sources today, and the flat marks are the work
 * that needs a measurement before it can be modelled at all.
 */
import * as THREE from "../assets/vendor/three.module.js";
import { OrbitControls } from "../assets/vendor/three-orbitcontrols.js";
import { makeProjector } from "./scene-massing.js";
import { SCENES, buildTour } from "./scene-tour.js";
import { buildSheets } from "./schematic-sheets.js";

const el = (id) => document.getElementById(id);
const stage = el("sch-stage");
const markersEl = el("sch-markers");
const statusEl = el("sch-status");

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* The drawing's palette. Deliberately cool and low-chroma against the warm
 * finished view, so a screenshot of this page can never be mistaken for one of
 * that one. */
const INK = 0x2b3f54;        // principal line weight
const INK_LIGHT = 0x8ba0b4;  // context, secondary
const INK_FAINT = 0xc2cedb;  // grid, index lines
const FILL = 0xf0e6d6;       // massing fill — warm, so the five subjects sit forward of the ink
const ACCENT = 0xa8742c;     // cited massing — the one warm note, used sparingly
const SEA = 0xdfe8ef;

const CONTOUR_STEP_M = 2;    // metres between contour lines
const INDEX_EVERY = 5;       // every 5th contour drawn heavier, as on a map

let scene, camera, renderer, controls;
let needsRender = true;
let tour = null;
let heightAt = () => 0;
let monumentMarks = [];      // {label, pos: Vector3, cited, note}

/* ---------- Data ---------- */

const optional = (url) =>
  fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

let DATA = null;
let TERRAIN = null;
let FOOTPRINTS = null;
let CONTEXT = null;
let OSM = null;
let PARK = null;

Promise.all([
  fetch("data/pois.json").then((r) => {
    if (!r.ok) throw new Error(`pois.json: HTTP ${r.status}`);
    return r.json();
  }),
  optional("data/mahabalipuram-terrain.json"),
  optional("data/mahabalipuram-footprints.geojson"),
  optional("data/mahabalipuram-context.geojson"),
  optional("data/mahabalipuram-osm.json"),
  optional("data/mahabalipuram-park.geojson"),
])
  .then(([doc, terrain, footprints, context, osm, park]) => {
    DATA = doc;
    TERRAIN = terrain;
    FOOTPRINTS = footprints;
    CONTEXT = context;
    OSM = osm;
    PARK = park;
    renderSchedule();
    start();
  })
  .catch((err) => {
    console.error("[schematic]", err);
    setStatus(`The drawing could not load (${err.message}).`);
  });

function setStatus(msg) {
  statusEl.textContent = msg || "";
  statusEl.hidden = !msg;
}

/* ---------- The written schedule ----------
 *
 * Written from the data, not typed out, so it cannot drift from what the
 * drawing shows. This is the half of the deliverable that survives without
 * WebGL, and the half a reviewer can actually check line by line. */
function renderSchedule() {
  const heights = window.MAHABALIPURAM_HEIGHTS || [];
  const byOsm = new Map(heights.map((h) => [h.osm, h]));

  // Cited massing: one row per monument, from the footprints actually drawn.
  const cited = new Map();
  if (FOOTPRINTS && FOOTPRINTS.features) {
    for (const f of FOOTPRINTS.features) {
      const p = f.properties;
      const rec = cited.get(p.id) || { name: p.name, tiers: 0, total: p.total_m, form: p.form, source: p.source, url: p.sourceUrl, measure: p.measure };
      rec.tiers++;
      cited.set(p.id, rec);
    }
  }

  const citedRows = [...cited.entries()]
    .sort((a, b) => (b[1].total || 0) - (a[1].total || 0))
    .map(
      ([id, r]) => `<tr>
        <td>${esc(r.name)}</td>
        <td class="sch-num">${r.total != null ? `${esc(r.total)} m` : "—"}</td>
        <td class="sch-num">${r.tiers}</td>
        <td>${esc(r.form || "")}</td>
        <td class="sch-src">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source || "source")}</a>` : esc(r.source || "")}</td>
      </tr>`
    )
    .join("");

  el("sch-cited-body").innerHTML = citedRows;
  el("sch-cited-count").textContent = String(cited.size);

  /* Everything with a recorded REASON for having no height. This table is the
   * point of the exercise: it is the modelling backlog, and every row says what
   * would have to be established before that monument can be built. */
  const blocked = heights
    .filter((h) => !cited.has(h.osm) && h.note)
    .map(
      (h) => `<tr>
        <td>${esc(h.label || h.osm)}</td>
        <td>${esc(h.form || "—")}</td>
        <td class="sch-why">${esc(h.note)}</td>
      </tr>`
    )
    .join("");
  el("sch-blocked-body").innerHTML = blocked;
  el("sch-blocked-count").textContent = String(heights.filter((h) => !cited.has(h.osm) && h.note).length);

  const total = (OSM && OSM.monuments && OSM.monuments.length) || 0;
  el("sch-positions-count").textContent = String(total);

  /* Elevations and sections. Built here rather than in start() because they are
   * SVG and belong to the written half of the page — they must survive with the
   * 3D drawing switched off entirely. */
  if (FOOTPRINTS) {
    const n = buildSheets({
      footprints: FOOTPRINTS,
      project: makeProjector((TERRAIN && TERRAIN.origin) || DATA.origin),
      mount: el("sch-sheets"),
    });
    el("sch-sheets-count").textContent = String(n);
  }

  el("sch-intro").innerHTML =
    `This drawing carries <b>${cited.size} monuments as massing</b> — the only ones with both a ` +
    `published height and a published storey count — and <b>${total} monument positions</b> from ` +
    `OpenStreetMap. Everything without a cited dimension is drawn flat, on purpose. ` +
    `Approve the layout, the proportions and the twelve camera scenes here; modelling starts after that.`;
}

/* ---------- Geometry helpers ---------- */

/* One ring to one extruded slab, the same construction the finished view uses
 * (js/scene-massing.js) so the two cannot disagree about a monument's mass.
 * ExtrudeGeometry builds along +Z and is rotated flat afterwards, which keeps
 * the winding and normals it already gets right. */
function slab(ring2d, base, top) {
  const shape = new THREE.Shape();
  ring2d.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
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
  return polys.map((p) => p[0].map(project)).filter((r) => r.length >= 4);
}

/* A closed outline laid on the ground, following the terrain so it does not
 * sink into a slope. */
function groundOutline(ring2d, colour, lift, opacity) {
  const pts = ring2d.map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + lift, z));
  pts.push(pts[0].clone());
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: colour, transparent: opacity < 1, opacity })
  );
}

/* ---------- Contours ----------
 *
 * Marching squares over the DEM grid. Contours are the schematic idiom for
 * terrain and they are also the honest one: a contour is a measured level line,
 * so the drawing shows the survey rather than a shaded interpretation of it.
 * Each line sits at its own elevation, which is what puts them on the landform
 * in 3D without any height lookup.
 *
 * Every segment for every level goes into ONE LineSegments per weight, so the
 * whole terrain is two draw calls rather than several hundred.
 */
function buildContours(doc) {
  const n = doc.grid;
  const half = doc.halfExtent_m;
  const step = (half * 2) / (n - 1);
  const toM = doc.unit === "decimetres" ? 0.1 : 1;
  const h = (ix, iz) => doc.heights[iz * n + ix] * toM;

  // Grid index to world. Row 0 is the NORTH edge and north is -Z.
  const wx = (ix) => -half + ix * step;
  const wz = (iz) => -half + iz * step;

  const plain = [];
  const index = [];

  const lo = Math.ceil(doc.min_m / CONTOUR_STEP_M) * CONTOUR_STEP_M;
  const hi = Math.floor(doc.max_m / CONTOUR_STEP_M) * CONTOUR_STEP_M;

  for (let L = lo; L <= hi; L += CONTOUR_STEP_M) {
    const out = Math.round(L / CONTOUR_STEP_M) % INDEX_EVERY === 0 ? index : plain;
    for (let iz = 0; iz < n - 1; iz++) {
      for (let ix = 0; ix < n - 1; ix++) {
        const a = h(ix, iz);
        const b = h(ix + 1, iz);
        const c = h(ix + 1, iz + 1);
        const d = h(ix, iz + 1);
        // Corner mask: which corners are above the level.
        const m = (a > L ? 1 : 0) | (b > L ? 2 : 0) | (c > L ? 4 : 0) | (d > L ? 8 : 0);
        if (m === 0 || m === 15) continue;

        // Crossing point on each edge, linearly interpolated.
        const t = (p, q) => (L - p) / (q - p);
        const top = () => [wx(ix) + step * t(a, b), wz(iz)];
        const right = () => [wx(ix + 1), wz(iz) + step * t(b, c)];
        const bottom = () => [wx(ix) + step * t(d, c), wz(iz + 1)];
        const left = () => [wx(ix), wz(iz) + step * t(a, d)];

        // Saddles (5 and 10) are split the same way both times; with a 2 m
        // interval on a ~30 m DEM the ambiguity is far below the data's own
        // resolution, so a consistent choice is enough.
        const pairs = {
          1: [left, top], 2: [top, right], 3: [left, right],
          4: [right, bottom], 5: [left, top, right, bottom], 6: [top, bottom],
          7: [left, bottom], 8: [bottom, left], 9: [bottom, top],
          10: [left, bottom, top, right], 11: [bottom, right], 12: [right, left],
          13: [right, top], 14: [top, left],
        }[m];

        for (let k = 0; k < pairs.length; k += 2) {
          const p0 = pairs[k]();
          const p1 = pairs[k + 1]();
          out.push(p0[0], L, p0[1], p1[0], L, p1[1]);
        }
      }
    }
  }

  const make = (arr, colour, opacity) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity })
    );
  };

  const group = new THREE.Group();
  group.name = "contours";
  group.add(make(plain, INK_LIGHT, 0.55));
  group.add(make(index, INK, 0.8));

  /* heightAt for everything else on the drawing — bilinear over the same grid,
   * matching js/scene-terrain.js so marks land at the same elevation here as
   * they do in the finished view. */
  const at = (x, z) => {
    const fx = (x + half) / step;
    const fz = (z + half) / step;
    const ix = Math.max(0, Math.min(n - 2, Math.floor(fx)));
    const iz = Math.max(0, Math.min(n - 2, Math.floor(fz)));
    const tx = Math.max(0, Math.min(1, fx - ix));
    const tz = Math.max(0, Math.min(1, fz - iz));
    const h00 = h(ix, iz);
    const h10 = h(ix + 1, iz);
    const h01 = h(ix, iz + 1);
    const h11 = h(ix + 1, iz + 1);
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  };

  return { group, heightAt: at, levels: Math.round((hi - lo) / CONTOUR_STEP_M) + 1 };
}

/* ---------- Drawing furniture ----------
 *
 * A grid, a scale bar and a north point. On a render these would be clutter; on
 * a schematic they are the difference between a picture and a drawing you can
 * measure something against. */
function buildFurniture(half) {
  const group = new THREE.Group();
  group.name = "furniture";

  // 200 m grid on the sea-level plane.
  const GRID = 200;
  const pts = [];
  for (let v = -half; v <= half; v += GRID) {
    pts.push(-half, 0, v, half, 0, v);
    pts.push(v, 0, -half, v, 0, half);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  group.add(
    new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: INK_FAINT, transparent: true, opacity: 0.5 }))
  );

  /* Sea, as a flat tint at 0 m rather than a surface. The coastline that
   * matters is the 0 m contour, which the terrain already draws. */
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(half * 2, half * 2),
    new THREE.MeshBasicMaterial({ color: SEA, transparent: true, opacity: 0.55, depthWrite: false })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.05;
  sea.renderOrder = -1;
  group.add(sea);

  return group;
}

/* ---------- The massing ---------- */

function buildMassingStudy(project) {
  const group = new THREE.Group();
  group.name = "massing";
  const counts = { cited: 0, tiers: 0, context: 0 };

  /* Town and granite, as ground outlines only. They are context for judging the
   * monuments' position and scale, and drawing them as volumes would compete
   * with the five that are actually being decided. */
  if (CONTEXT && CONTEXT.features) {
    const segs = [];
    for (const f of CONTEXT.features) {
      for (const ring of ringsOf(f, project)) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          segs.push(a[0], heightAt(a[0], a[1]) + 0.4, a[1], b[0], heightAt(b[0], b[1]) + 0.4, b[1]);
        }
        counts.context++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
    group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: INK_LIGHT, transparent: true, opacity: 0.42 })));
  }

  /* The site boundary, if the park outline is there. Worth its own weight: it
   * is the edge of what the whole drawing is about. */
  if (PARK && PARK.features) {
    for (const f of PARK.features) {
      for (const ring of ringsOf(f, project)) group.add(groundOutline(ring, INK_LIGHT, 0.8, 0.7));
    }
  }

  /* The five. Flat fill plus ink edges — a massing model, which is exactly the
   * level of commitment the data supports: a real outline swept to a real
   * height, with no claim about what the surface looks like. */
  if (FOOTPRINTS && FOOTPRINTS.features) {
    const seen = new Set();
    for (const f of FOOTPRINTS.features) {
      const p = f.properties;
      for (const ring of ringsOf(f, project)) {
        const [cx, cz] = centroid(ring);
        const ground = heightAt(cx, cz);
        const geo = slab(ring, ground + (p.base_m || 0), ground + (p.top_m || 1));

        const mesh = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            color: FILL,
            transparent: true,
            opacity: 0.9,
            // Keeps the fill from z-fighting the edges drawn on top of it.
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          })
        );
        group.add(mesh);

        /* thresholdAngle 1 deg: every real corner, none of the triangulation.
         *
         * Every cited tier is drawn in the accent, including the ground one.
         * An earlier version inked tier 1 and accented the rest, which
         * contradicted the key on the sheet — the key promises that accent
         * means "cited massing", so a monument's own base cannot be a
         * different colour from its upper storeys. */
        group.add(
          new THREE.LineSegments(
            new THREE.EdgesGeometry(geo, 1),
            new THREE.LineBasicMaterial({ color: ACCENT })
          )
        );
        counts.tiers++;

        if (!seen.has(p.id)) {
          seen.add(p.id);
          counts.cited++;
          const total = p.total_m || 6;
          const anchorY = ground + total + 22;
          monumentMarks.push({
            label: p.name,
            pos: new THREE.Vector3(cx, anchorY, cz),
            cited: true,
            detail: `${p.total_m} m · ${p.tierCount} ${p.tierCount === 1 ? "tier" : "tiers"}`,
          });

          /* A leader line from the top of the monument up to its label anchor.
           *
           * This is the fix for the drawing's one real legibility problem: the
           * tallest thing here is 11 m on a 4 km sheet, so at any view that
           * shows the whole site the five subjects are sub-pixel and the
           * drawing looks like contours and nothing else. A leader is the
           * draughtsman's answer — it makes a small object findable without
           * drawing it bigger than it is, which is the one thing a massing
           * study must never do. */
          const leader = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(cx, ground + total, cz),
            new THREE.Vector3(cx, anchorY, cz),
          ]);
          group.add(
            new THREE.Line(leader, new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.55 }))
          );
        }
      }
    }
  }

  return { group, counts };
}

/* Monument POSITIONS with no cited mass. Drawn as a small ground cross — no
 * height, no volume, nothing that could be mistaken for a measurement. The
 * cross is the surveyor's mark for "a thing is here", which is precisely and
 * only what OSM gives us for these. */
function buildPositions(project) {
  const group = new THREE.Group();
  group.name = "positions";
  if (!OSM || !OSM.monuments) return { group, count: 0 };

  const heights = window.MAHABALIPURAM_HEIGHTS || [];
  const noteFor = new Map(heights.map((h) => [h.osm, h.note]));
  const citedIds = new Set(
    (FOOTPRINTS && FOOTPRINTS.features ? FOOTPRINTS.features : []).map((f) => f.properties.id)
  );

  const segs = [];
  const ARM = 7;
  let count = 0;

  for (const m of OSM.monuments) {
    if (!m.lngLat || citedIds.has(m.id)) continue;
    const [x, z] = project(m.lngLat);
    if (Math.abs(x) > 2000 || Math.abs(z) > 2000) continue;   // outside the drawn sheet
    const y = heightAt(x, z) + 0.6;
    segs.push(x - ARM, y, z, x + ARM, y, z, x, y, z - ARM, x, y, z + ARM);
    count++;

    monumentMarks.push({
      label: m.name || m.id,
      pos: new THREE.Vector3(x, y + 3, z),
      cited: false,
      detail: noteFor.get(m.id) ? "no cited height" : "position only",
    });
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
  group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.75 })));
  return { group, count };
}

/* ---------- Scene ---------- */

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (_) {
    return false;
  }
}

function start() {
  if (!webglOK()) {
    setStatus("This drawing needs WebGL. The schedule below is the same information in writing.");
    return;
  }
  setStatus("Drawing…");

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  stage.insertBefore(renderer.domElement, markersEl);
  stage.classList.add("is-live");

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, stage.clientWidth / stage.clientHeight, 1, 30000);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minPolarAngle = THREE.MathUtils.degToRad(8);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(86);
  controls.minDistance = 60;
  controls.maxDistance = 4200;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.addEventListener("change", () => { needsRender = true; });
  controls.addEventListener("start", stopPlay);

  const project = makeProjector((TERRAIN && TERRAIN.origin) || DATA.origin);

  let half = 2000;
  if (TERRAIN) {
    const c = buildContours(TERRAIN);
    heightAt = c.heightAt;
    half = TERRAIN.halfExtent_m;
    scene.add(c.group);
  } else {
    setStatus("Elevation data unavailable — the drawing has no contours.");
  }

  scene.add(buildFurniture(half));

  const m = buildMassingStudy(project);
  scene.add(m.group);
  const p = buildPositions(project);
  scene.add(p.group);

  tour = buildTour();
  buildSceneStepper();
  wireChrome();

  /* A three-quarter aerial framed on the monuments themselves, not scene 1.
   * Scene 1 is a 2 km establishing shot — right for the flight, useless as a
   * landing view, because the things being approved are 6 to 11 m tall. */
  frameCited();
  /* buildSceneStepper primes the readout on scene 1, but the landing view is
     the framed overview, not that scene. Say which it is rather than leaving a
     scene number the camera is not actually at. */
  onScene = false;
  el("sch-scene-n").textContent = "Overview";
  el("sch-scene-t").textContent = "All cited massing";

  setStatus("");
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    console.log("[schematic]", { cited: m.counts.cited, tiers: m.counts.tiers, context: m.counts.context, positions: p.count });
    window.__sch = {
      get scene() { return scene; },
      get camera() { return camera; },
      get controls() { return controls; },
      counts: { ...m.counts, positions: p.count },
      goScene,
    };
  }
  tick();
}

/* Frame the cited monuments, computed rather than typed.
 *
 * Hand-picked camera positions were wrong on the first two viewports I tried:
 * the monuments span about a kilometre each way, so whether they fit depends on
 * the canvas aspect, and a pose tuned on a wide window puts the ratha labels off
 * the edge of a narrow one. Fitting the real bounding box to the real frustum
 * fixes it for every viewport and survives a resize.
 *
 * It must also survive being framed at NO size. A page can start in a container
 * of zero width - a hidden tab, a display:none parent, a print layout - and
 * then aspect is 0, the horizontal field of view is 0, and dividing by its
 * tangent puts the camera at infinity and then at NaN. Nothing renders, and
 * because nothing reframed afterwards it stayed blank forever. So a degenerate
 * size is detected, left un-framed, and retried on the first resize that gives
 * real numbers.
 */
let framed = false;   // has the view been framed at a usable canvas size?

function stageSize() {
  return { w: stage.clientWidth || 0, h: stage.clientHeight || 0 };
}

const THREE_QUARTER = new THREE.Vector3(0.42, 0.62, 0.66).normalize();
const PLAN = new THREE.Vector3(0, 1, 0.0001).normalize();   // a hair off vertical, or OrbitControls gimbals

function frameCited(dirIn) {
  const { w, h } = stageSize();
  const cited = monumentMarks.filter((m) => m.cited);
  if (!cited.length) {
    framed = true;
    camera.position.set(640, 760, 940);
    controls.target.set(250, 0, 300);
    controls.update();
    return;
  }

  const box = new THREE.Box3();
  for (const m of cited) box.expandByPoint(m.pos);
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 120);

  // Fit on whichever axis is tighter — vertical unless the canvas is narrow.
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const aspect = w > 0 && h > 0 ? w / h : 0;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const half = Math.min(vfov, hfov) / 2;
  const dist = half > 0 ? (radius / Math.tan(half)) * 1.25 : radius * 3;

  // A 38-degree three-quarter view from the south-east, matching the sun side
  // the finished view is lit from, so the two read as the same place.
  const dir = new THREE.Vector3(0.42, 0.62, 0.66).normalize();
  controls.target.copy(centre).setY(0);
  camera.position.copy(controls.target).addScaledVector(dir, dist);
  controls.update();
  needsRender = true;

  // Only a framing done at a real size counts; otherwise retry on resize.
  framed = half > 0;
}

/* ---------- The twelve scenes ----------
 *
 * The same keyframes the finished view flies, from js/scene-tour.js — one
 * source, so approving a composition here approves the one that gets built.
 * Stepping beats scrolling for a review: a reviewer wants to go straight to
 * scene 7 and argue about it, not hunt for it with a scrollbar. */
let sceneStops = [];
let current = 0;
let playing = false;
/* The stepper primes itself on scene 1, but Plan and Overview move the camera
 * off the scene list entirely. Without this the first Next after an overview
 * went to scene 2, silently skipping scene 1. */
let onScene = false;
let playT = 0;
let playFrom = 0;

function buildSceneStepper() {
  const order = [];
  SCENES.forEach((s, i) => {
    const t = i / (SCENES.length - 1);
    const found = order.find((o) => o.n === s.n);
    if (found) found.ts.push(t);
    else order.push({ n: s.n, title: s.title, ts: [t] });
  });
  // A scene with several keyframes is represented by its middle one, which is
  // the pose that actually characterises the shot.
  sceneStops = order.map((o) => ({ n: o.n, title: o.title, t: o.ts[Math.floor(o.ts.length / 2)] }));
  goScene(0);
}

function applyT(t) {
  const s = tour.apply(t, camera, controls);
  controls.update();
  needsRender = true;
  return s;
}

function goScene(i) {
  if (!sceneStops.length) return;
  onScene = true;
  current = Math.max(0, Math.min(sceneStops.length - 1, i));
  const s = sceneStops[current];
  applyT(s.t);
  el("sch-scene-n").textContent = `Scene ${String(s.n).padStart(2, "0")} of 12`;
  el("sch-scene-t").textContent = s.title;
  el("sch-prev").disabled = current === 0;
  el("sch-next").disabled = current === sceneStops.length - 1;
}

function startPlay() {
  if (REDUCED) {
    // Honour the preference: step, do not fly.
    goScene(current + 1 >= sceneStops.length ? 0 : current + 1);
    return;
  }
  playing = true;
  playFrom = performance.now();
  playT = current === sceneStops.length - 1 ? 0 : sceneStops[current].t;
  el("sch-play").setAttribute("aria-pressed", "true");
  el("sch-play").textContent = "Stop";
  needsRender = true;
}

function stopPlay() {
  if (!playing) return;
  playing = false;
  el("sch-play").setAttribute("aria-pressed", "false");
  el("sch-play").textContent = "Play the twelve scenes";
}

function wireChrome() {
  el("sch-prev").addEventListener("click", () => { stopPlay(); goScene(onScene ? current - 1 : 0); });
  el("sch-next").addEventListener("click", () => { stopPlay(); goScene(onScene ? current + 1 : 0); });
  el("sch-play").addEventListener("click", () => (playing ? stopPlay() : startPlay()));
  el("sch-plan").addEventListener("click", () => {
    stopPlay();
    // Straight down over the same centre the overview frames, so switching
    // between them is a change of angle and not of subject.
    frameCited(PLAN);
    onScene = false;
    el("sch-scene-n").textContent = "Plan";
    el("sch-scene-t").textContent = "Layout, from above";
  });
  el("sch-home").addEventListener("click", () => {
    stopPlay();
    frameCited();
    onScene = false;
    el("sch-scene-n").textContent = "Overview";
    el("sch-scene-t").textContent = "All cited massing";
  });

  const labels = el("sch-labels");
  labels.addEventListener("change", () => {
    markersEl.hidden = !labels.checked;
    needsRender = true;
  });
}

/* ---------- Labels ----------
 *
 * Projected to the DOM rather than drawn in the scene, so they stay crisp text
 * at any zoom and can be read by a screen reader. Only the cited five are
 * labelled by default; the position crosses would bury the drawing in 37 more. */
const _v = new THREE.Vector3();

/* Declutter. The rathas stand within a few metres of each other, so at any
 * pulled-back view their labels land on top of one another and the drawing
 * reads as a smear of overlapping boxes. Nearer labels win — the reviewer is
 * looking at what is in front — and a label that would collide with one already
 * placed is simply dropped for that frame rather than nudged, because a moved
 * label points at the wrong monument. */
const LABEL_W = 132;
const LABEL_H = 30;

function placeLabels() {
  if (markersEl.hidden) return;
  const w = stage.clientWidth;
  const h = stage.clientHeight;

  const shown = [];
  const candidates = [];
  for (const mk of monumentMarks) {
    if (!mk.el) continue;
    _v.copy(mk.pos).project(camera);
    const on = _v.z < 1 && _v.x > -1 && _v.x < 1 && _v.y > -1 && _v.y < 1;
    if (!on) {
      mk.el.hidden = true;
      continue;
    }
    candidates.push({ mk, x: ((_v.x + 1) / 2) * w, y: ((-_v.y + 1) / 2) * h, depth: _v.z });
  }
  candidates.sort((a, b) => a.depth - b.depth);

  for (const c of candidates) {
    const clash = shown.some(
      (s) => Math.abs(s.x - c.x) < LABEL_W && Math.abs(s.y - c.y) < LABEL_H
    );
    c.mk.el.hidden = clash;
    if (clash) continue;
    c.mk.el.style.transform = `translate(-50%,-100%) translate(${c.x}px, ${c.y}px)`;
    shown.push(c);
  }
}

function makeLabels() {
  for (const mk of monumentMarks) {
    if (!mk.cited) continue;   // the flat marks are listed in the schedule instead
    const d = document.createElement("div");
    d.className = "sch-label";
    d.innerHTML = `<b>${esc(mk.label)}</b><span>${esc(mk.detail)}</span>`;
    markersEl.appendChild(d);
    mk.el = d;
  }
}

/* ---------- Loop ---------- */

const PLAY_MS = 42000;   // the whole flight, about as long as a reviewer will sit still

function tick() {
  requestAnimationFrame(tick);

  if (playing) {
    const t = playT + (performance.now() - playFrom) / PLAY_MS;
    if (t >= 1) {
      applyT(1);
      goScene(sceneStops.length - 1);
      stopPlay();
    } else {
      const s = applyT(t);
      if (s) {
        el("sch-scene-n").textContent = `Scene ${String(s.n).padStart(2, "0")} of 12`;
        el("sch-scene-t").textContent = s.title;
      }
    }
    needsRender = true;
  } else if (controls && controls.update()) {
    needsRender = true;
  }

  if (!needsRender || !renderer) return;
  needsRender = false;
  if (!monumentMarks.some((m) => m.el) ) makeLabels();
  placeLabels();
  renderer.render(scene, camera);
}

function onResize() {
  if (!renderer) return;
  const { w, h } = stageSize();
  if (w <= 0 || h <= 0) return;      // nothing sane to compute from yet
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  // The first usable size is also the first chance to frame properly.
  if (!framed) frameCited();
  needsRender = true;
}

/* clientWidth is 0 in a hidden or not-yet-laid-out container and the window
 * never fires `resize` for that, so a window listener alone is not enough to
 * notice the element becoming visible. ResizeObserver watches the element
 * itself, which is what actually changed. */
if (typeof ResizeObserver !== "undefined") new ResizeObserver(onResize).observe(stage);
addEventListener("resize", onResize);
