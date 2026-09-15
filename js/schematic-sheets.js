/* Elevations and sections — the per-monument drawing set.
 *
 * Drawn as SVG, not in the 3D scene, and that is the point. An elevation is an
 * orthographic drawing you scale things off; rendering one through a
 * perspective camera would be a picture of an elevation rather than an
 * elevation. SVG also prints, survives with WebGL switched off, and stays crisp
 * at any zoom.
 *
 * EVERY LINE HERE IS DERIVED, NOT DRAWN BY HAND. The footprints file carries
 * one polygon PER TIER, each already inset, so the stepped silhouette is a
 * projection of the same geometry the 3D massing extrudes.
 *
 * DRAWN IN THE BUILDING'S OWN FRAME, WHICH IS NOT OPTIONAL.
 * ------------------------------------------------------------------
 * None of these footprints is aligned to north — Dharmaraja sits at 119
 * degrees, Bhima at 125. A first version of this file projected each tier onto
 * the east-west axis and called the result an elevation. It was not one: for a
 * footprint at 45 degrees to the axis you are projecting onto, you get the
 * diagonal across the building, so the silhouette comes out too wide and the
 * dimensions with it. Dharmaraja's plan was being reported as 14.2 x 14.4 m
 * when its sides are 10.3 x 10.7 m, which turned a 21% difference from the
 * cited plan into an apparent 67% one — an argument about OSM accuracy that the
 * data does not actually support.
 *
 * So each monument gets a local frame from the minimum-area rectangle of its
 * ground tier. Plans are drawn square to the page in that frame with a north
 * point showing the true bearing; the elevation looks at the long face and the
 * section cuts across it. That is what "elevation" and "section" mean.
 *
 * ONE SCALE FOR ALL FIVE SHEETS. Drawing each monument to fit its own box would
 * make an 11 m tower and a 5.5 m hut the same size on the page, which is the
 * one comparison this set exists to support.
 *
 * WHAT THESE DRAWINGS MUST NOT BE READ AS
 * ---------------------------------------
 *  1. THE PLAN IS THE OSM WAY, AND IT RUNS WIDE. Measured against the minimum
 *     area rectangle, the outlines are roughly a fifth to a quarter larger than
 *     the published plans (Bhima 15.9 x 9.1 m against a cited 12.8 x 7.3 m).
 *     That is consistent with OSM tracing the visible footing and apron rather
 *     than the building line. Both numbers are printed on the sheet.
 *  2. THE HEIGHT IS CITED, THE SPLIT IS NOT. The total and the storey count come
 *     from sources. How the total divides between storeys, and how far each one
 *     steps in, is a constant-slope convention tuned by eye, so tier lines are
 *     drawn as construction lines rather than as measured levels.
 *  3. THERE IS NO INTERIOR. The section is a cut through solid mass because no
 *     interior dimension is published for any of these. The rathas are monoliths
 *     and largely are solid, but each has a small shrine cell that is NOT drawn.
 *     A blank section is honest; an invented cell would not be.
 */

const PX_PER_M = 11;          // shared by every sheet, so the five compare
const PAD = 26;
const DIM_OFF = 16;

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const round = (n, d = 1) => Number(n.toFixed(d));

/* ---------- frame ---------- */

function ringMetres(feature, project) {
  const g = feature.geometry;
  if (!g) return [];
  const poly = g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates[0] : null;
  return poly ? poly[0].map(project) : [];
}

/* Andrew's monotone chain. The minimum-area rectangle of a polygon is the
 * minimum-area rectangle of its convex hull, and it always shares an edge with
 * that hull — which is what makes the search below a short loop rather than an
 * optimisation. */
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/* The building's own frame: angle of the long axis, its centre, and the size of
 * the tightest rectangle around it. */
function principalFrame(ring) {
  const pts = ring.slice(0, -1).length >= 3 ? ring.slice(0, -1) : ring;
  const hull = convexHull(pts);
  if (hull.length < 3) {
    return { angle: 0, cx: 0, cz: 0, long: 1, short: 1 };
  }

  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cos = Math.cos(-ang);
    const sin = Math.sin(-ang);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of hull) {
      const x = p[0] * cos - p[1] * sin;
      const z = p[0] * sin + p[1] * cos;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const area = (maxX - minX) * (maxZ - minZ);
    if (!best || area < best.area) {
      best = { area, ang, minX, maxX, minZ, maxZ };
    }
  }

  // Centre of that rectangle, carried back to world coordinates.
  const mx = (best.minX + best.maxX) / 2;
  const mz = (best.minZ + best.maxZ) / 2;
  const cos = Math.cos(best.ang);
  const sin = Math.sin(best.ang);
  const cx = mx * cos - mz * sin;
  const cz = mx * sin + mz * cos;

  let w = best.maxX - best.minX;
  let d = best.maxZ - best.minZ;
  let angle = best.ang;
  // Keep the long side along local X, so "elevation" always faces the long face.
  if (d > w) {
    [w, d] = [d, w];
    angle += Math.PI / 2;
  }
  return { angle, cx, cz, long: w, short: d };
}

/* World metres to the building's frame, centred and square to the page. */
function toFrame(ring, frame) {
  const cos = Math.cos(-frame.angle);
  const sin = Math.sin(-frame.angle);
  return ring.map(([x, z]) => {
    const dx = x - frame.cx;
    const dz = z - frame.cz;
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  });
}

function extent(ring, axis) {
  const v = ring.map((p) => p[axis]);
  return { min: Math.min(...v), max: Math.max(...v) };
}

/* ---------- drawing primitives ---------- */

function dimH(x1, x2, y, label, cited) {
  const mid = (x1 + x2) / 2;
  return (
    `<g class="dim${cited ? " is-cited" : ""}">` +
    `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>` +
    `<line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}"/>` +
    `<line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}"/>` +
    `<text x="${mid}" y="${y - 5}" text-anchor="middle">${esc(label)}</text>` +
    `</g>`
  );
}

function dimV(y1, y2, x, label, cited) {
  const mid = (y1 + y2) / 2;
  return (
    `<g class="dim${cited ? " is-cited" : ""}">` +
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>` +
    `<line x1="${x - 4}" y1="${y1}" x2="${x + 4}" y2="${y1}"/>` +
    `<line x1="${x - 4}" y1="${y2}" x2="${x + 4}" y2="${y2}"/>` +
    `<text x="${x + 6}" y="${mid}" dominant-baseline="middle">${esc(label)}</text>` +
    `</g>`
  );
}

function panelTitle(x, y, text, sub) {
  return (
    `<text class="p-title" x="${x}" y="${y}">${esc(text)}</text>` +
    (sub ? `<text class="p-sub" x="${x}" y="${y + 12}">${esc(sub)}</text>` : "")
  );
}

/* The plan is square to the page but the building is not square to the world,
 * so the sheet has to say where north actually is or the drawing is a lie by
 * omission. */
function northPoint(x, y, angle) {
  // The needle turns with the building's frame; the letter must not turn with
  // it, or at most bearings it ends up sideways or upside down and the whole
  // mark reads as a scribble. Counter-rotated, it stays upright at any bearing.
  const deg = round((-angle * 180) / Math.PI, 1);
  return (
    `<g class="north" transform="translate(${x},${y})">` +
    `<g transform="rotate(${deg})">` +
    `<line x1="0" y1="8" x2="0" y2="-6"/>` +
    `<path d="M0,-10 L2.6,-3.5 L-2.6,-3.5 Z"/>` +
    `</g>` +
    `<text x="0" y="20" text-anchor="middle">N</text>` +
    `</g>`
  );
}

/* ---------- panels ---------- */

function planPanel(tiers, frame, ox, oy, w, h) {
  const X = (m) => ox + w / 2 + m * PX_PER_M;
  const Y = (m) => oy + h / 2 + m * PX_PER_M;

  let out = "";
  tiers.forEach((t, i) => {
    const pts = t.local.map((p) => `${round(X(p[0]), 2)},${round(Y(p[1]), 2)}`).join(" ");
    out += `<polygon class="plan-ring${i === 0 ? " is-base" : ""}${t.cap ? " is-cap" : ""}" points="${pts}"/>`;
  });

  const ex = extent(tiers[0].local, 0);
  const ez = extent(tiers[0].local, 1);

  // Section cut A-A, across the long axis.
  const xm = X(0);
  out +=
    `<g class="cut">` +
    `<line x1="${xm}" y1="${Y(ez.min) - 12}" x2="${xm}" y2="${Y(ez.max) + 12}"/>` +
    `<text x="${xm - 5}" y="${Y(ez.min) - 14}" text-anchor="end">A</text>` +
    `<text x="${xm - 5}" y="${Y(ez.max) + 20}" text-anchor="end">A</text>` +
    `</g>`;

  out += northPoint(ox + w - 26, oy + 16, frame.angle);
  // Clear of the cut label, which the first version collided with.
  out += dimH(X(ex.min), X(ex.max), Y(ez.max) + DIM_OFF + 20, `${round(frame.long)} m`, false);
  return out;
}

/* axis 0 = the long face (ELEVATION); axis 1 = across it (SECTION). */
function facePanel(tiers, ox, oy, w, h, axis, opts) {
  const ex = extent(tiers[0].local, axis);
  const topM = tiers[tiers.length - 1].top;

  const X = (m) => ox + w / 2 + m * PX_PER_M;
  const groundY = oy + h - PAD - 18;
  const Y = (m) => groundY - m * PX_PER_M;

  let out = `<line class="ground" x1="${ox + 8}" y1="${groundY}" x2="${ox + w - 8}" y2="${groundY}"/>`;

  tiers.forEach((t) => {
    const e = extent(t.local, axis);
    out +=
      `<rect class="face${t.cap ? " is-cap" : ""}${opts.hatch ? " is-cut" : ""}" ` +
      `x="${round(X(e.min), 2)}" y="${round(Y(t.top), 2)}" ` +
      `width="${round((e.max - e.min) * PX_PER_M, 2)}" height="${round((t.top - t.base) * PX_PER_M, 2)}"/>`;
  });

  tiers.forEach((t, i) => {
    if (i === 0) return;
    out += `<line class="tier-line" x1="${ox + 10}" y1="${Y(t.base)}" x2="${ox + w - 26}" y2="${Y(t.base)}"/>`;
  });

  out += dimV(Y(topM), groundY, ox + w - 22, `${opts.total} m`, true);
  out += dimH(X(ex.min), X(ex.max), groundY + DIM_OFF + 6, `${round(ex.max - ex.min)} m`, false);
  return out;
}

/* AXONOMETRIC — the 3D schematic.
 *
 * A true axonometric projection of the same per-tier prisms, so the sheet
 * carries the whole set: plan, elevation, section, and the massing seen as a
 * solid. It is built from the identical rings, which is what stops it from
 * becoming a flattering sketch of a monument the other three panels describe
 * differently.
 *
 * NOT FOR SCALING, and labelled so. The horizontal axes are foreshortened by
 * cos 30 while the vertical is true, so a ruler on this panel gives three
 * different answers depending on which way you hold it. Dimensions live on the
 * elevation; this panel is for reading the form.
 *
 * Hidden surfaces are handled without a depth buffer, which an SVG has no way
 * to provide:
 *  - only side faces turned toward the viewer are drawn, tested per edge
 *    against the view direction, so the far walls never show through;
 *  - tiers are painted from the ground up, so an upper storey correctly covers
 *    the roof of the one below.
 * That is exact for the stacked convex prisms here. It would not survive a
 * genuinely concave form, and the Butterball's traced outline is the one to
 * watch if these ever change.
 */
const AXO_C = Math.cos(Math.PI / 6);
const AXO_S = Math.sin(Math.PI / 6);

/* The axonometric gets its own scale, smaller than the orthographic panels.
 * A projection spreads a plan across BOTH screen axes, so Bhima's 16 x 9.1 m
 * footprint came out about 238px wide in a 210px panel and ran off the sheet.
 * Shrinking only this panel is the right trade: it is already labelled "not for
 * scaling", so the one thing it must preserve is comparability between the five
 * sheets, and a single shared factor preserves exactly that. */
const AXO_PX = PX_PER_M * 0.72;

/* Ring orientation decides which way "outward" points, and OSM winding is not
 * dependable once a projection has flipped an axis — so it is measured here
 * rather than assumed. */
function signedArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return a / 2;
}

function axoPanel(tiers, ox, oy, w, h) {
  const P = (x, y, z) => [(x - z) * AXO_C * AXO_PX, (x + z) * AXO_S * AXO_PX - y * AXO_PX];

  // Bounds over every corner, so the form is centred in its panel.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const t of tiers) {
    for (const p of t.local) {
      for (const yy of [t.base, t.top]) {
        const [sx, sy] = P(p[0], yy, p[1]);
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }
  }
  const dx = ox + w / 2 - (minX + maxX) / 2;
  const dy = oy + h / 2 - (minY + maxY) / 2;
  const at = (x, y, z) => {
    const [sx, sy] = P(x, y, z);
    return [round(sx + dx, 2), round(sy + dy, 2)];
  };

  let out = "";
  for (const t of tiers) {
    const ring = t.local;
    const n = ring.length - 1;
    if (n < 3) continue;
    const ccw = signedArea(ring) > 0;

    /* Which side walls face the viewer. Toward the viewer is increasing (x + z)
     * in this projection, so the outward normal decides it — and the normal
     * depends on the ring's actual winding, which is measured, not assumed. */
    const front = [];
    for (let i = 0; i < n; i++) {
      const ex = ring[i + 1][0] - ring[i][0];
      const ez = ring[i + 1][1] - ring[i][1];
      const nx = ccw ? ez : -ez;
      const nz = ccw ? -ex : ex;
      front[i] = nx + nz > 0;
    }

    // Walls first, painted back to front, as fill only — the linework is drawn
    // separately below so that not every seam becomes a visible edge.
    const faces = [];
    for (let i = 0; i < n; i++) {
      if (!front[i]) continue;
      const a = ring[i];
      const b = ring[i + 1];
      faces.push({
        depth: a[0] + a[1] + b[0] + b[1],
        d: `${at(a[0], t.base, a[1])} ${at(b[0], t.base, b[1])} ${at(b[0], t.top, b[1])} ${at(a[0], t.top, a[1])}`,
      });
    }
    faces.sort((m, o) => m.depth - o.depth);
    for (const f of faces) {
      out += `<polygon class="axo-side${t.cap ? " is-cap" : ""}" points="${f.d}"/>`;
    }

    /* Vertical edges, but only real ones.
     *
     * Krishna's Butterball is a 28-point traced outline, so drawing an edge at
     * every vertex turned a round boulder into a fluted column — a worse
     * likeness than the plain box the elevation shows. Those 13-degree turns
     * are tracing resolution, not corners. An edge is drawn only where the plan
     * genuinely turns, or where the silhouette is (a front wall meeting a back
     * one), which is the same rule EdgesGeometry applies in the 3D scene.
     * Rectangular rathas turn 90 degrees at every corner and are unaffected. */
    const EDGE_DEG = 24;
    for (let i = 0; i < n; i++) {
      const prev = (i - 1 + n) % n;
      if (!front[i] && !front[prev]) continue;          // vertex is round the back
      const silhouette = front[i] !== front[prev];
      const a = ring[prev];
      const b = ring[i];
      const c = ring[i + 1];
      const v1x = b[0] - a[0], v1z = b[1] - a[1];
      const v2x = c[0] - b[0], v2z = c[1] - b[1];
      const turn = Math.abs(Math.atan2(v1x * v2z - v1z * v2x, v1x * v2x + v1z * v2z)) * (180 / Math.PI);
      if (!silhouette && turn < EDGE_DEG) continue;
      out +=
        `<line class="axo-edge${t.cap ? " is-cap" : ""}" ` +
        `x1="${at(b[0], t.base, b[1])[0]}" y1="${at(b[0], t.base, b[1])[1]}" ` +
        `x2="${at(b[0], t.top, b[1])[0]}" y2="${at(b[0], t.top, b[1])[1]}"/>`;
    }

    // The ground contact, along the front walls only.
    for (let i = 0; i < n; i++) {
      if (!front[i]) continue;
      const p1 = at(ring[i][0], t.base, ring[i][1]);
      const p2 = at(ring[i + 1][0], t.base, ring[i + 1][1]);
      out += `<line class="axo-edge${t.cap ? " is-cap" : ""}" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}"/>`;
    }

    const top = ring.map((p) => at(p[0], t.top, p[1]).join(",")).join(" ");
    out += `<polygon class="axo-top${t.cap ? " is-cap" : ""}" points="${top}"/>`;
  }
  return out;
}

function scaleBar(x, y) {
  const five = 5 * PX_PER_M;
  return (
    `<g class="scalebar">` +
    `<rect x="${x}" y="${y}" width="${five}" height="4"/>` +
    `<rect class="alt" x="${x + five}" y="${y}" width="${five}" height="4"/>` +
    `<text x="${x}" y="${y + 15}">0</text>` +
    `<text x="${x + five * 2}" y="${y + 15}" text-anchor="middle">10 m</text>` +
    `</g>`
  );
}

/* ---------- one sheet ---------- */

function sheet(mon) {
  const { name, tiers, frame, total, tierCount, measure, source, sourceUrl, form } = mon;

  const PANEL_W = 210;
  const PANEL_H = 205;
  const W = PANEL_W * 4 + 36;
  const H = PANEL_H + 46;
  const planX = 0;
  const elevX = PANEL_W + 12;
  const sectX = (PANEL_W + 12) * 2;
  const axoX = (PANEL_W + 12) * 3;
  const top = 28;

  /* An axis has no direction, only an orientation: 235 degrees and 55 degrees
   * describe the same long face. Normalised to 0-180 so two monuments lying the
   * same way are not reported as 180 degrees apart. */
  const bearing = ((((-frame.angle * 180) / Math.PI) % 180) + 180) % 180;

  const svg =
    `<svg class="sheet-svg" viewBox="0 0 ${W} ${H + 28}" role="img" ` +
    `aria-label="${esc(name)}: plan, elevation, section and axonometric, drawn to a common scale">` +
    `<defs><pattern id="hatch-${esc(mon.slug)}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="6" stroke="#8ba0b4" stroke-width="1"/></pattern></defs>` +
    panelTitle(planX, 12, "PLAN", "OSM outline — measured") +
    panelTitle(elevX, 12, "ELEVATION", "on the long face") +
    panelTitle(sectX, 12, "SECTION A–A", "solid: no interior published") +
    panelTitle(axoX, 12, "AXONOMETRIC", "form only — not for scaling") +
    `<g class="panel">${planPanel(tiers, frame, planX, top, PANEL_W, PANEL_H)}</g>` +
    `<g class="panel">${facePanel(tiers, elevX, top, PANEL_W, PANEL_H, 0, { total, hatch: false })}</g>` +
    `<g class="panel" style="--hatch:url(#hatch-${esc(mon.slug)})">` +
    `${facePanel(tiers, sectX, top, PANEL_W, PANEL_H, 1, { total, hatch: true })}</g>` +
    `<g class="panel">${axoPanel(tiers, axoX, top, PANEL_W, PANEL_H)}</g>` +
    scaleBar(planX + 4, H + 8) +
    `</svg>`;

  return (
    `<figure class="sheet">` +
    `<figcaption class="sheet-head">` +
    `<h4>${esc(name)}</h4>` +
    `<p class="sheet-meta">` +
    `<b>${esc(total)} m</b> overall · <b>${tierCount}</b> ${tierCount === 1 ? "tier" : "tiers"} · ${esc(form || "")} · ` +
    `long axis bears ${round(bearing, 0)}°` +
    `</p>` +
    `</figcaption>` +
    svg +
    `<div class="sheet-notes">` +
    `<p><span class="lbl">Cited</span> ${esc(measure || "—")} ` +
    (sourceUrl
      ? `<a href="${esc(sourceUrl)}" target="_blank" rel="noopener">${esc(source || "source")}</a>`
      : esc(source || "")) +
    `</p>` +
    `<p><span class="lbl">Drawn</span> The plan is the OpenStreetMap way, ` +
    `<b>${round(frame.long)} × ${round(frame.short)} m</b> on its own axes — not a north–south ` +
    `bounding box, which would overstate it, since the building stands at ${round(bearing, 0)}°. ` +
    `Compare that with the cited plan above: OSM traces the visible footing, so it reads wider ` +
    `than the building line.</p>` +
    `<p><span class="lbl">Not measured</span> Tier <i>heights</i> and step-ins are a constant-slope ` +
    `convention, drawn as dashed construction lines. Only the overall height and the tier count are cited. ` +
    `The section is solid because no interior is published.</p>` +
    `</div>` +
    `</figure>`
  );
}

/* ---------- entry ---------- */

export function buildSheets({ footprints, project, mount }) {
  if (!footprints || !footprints.features || !mount) return 0;

  const by = new Map();
  for (const f of footprints.features) {
    const p = f.properties;
    const rec = by.get(p.id) || {
      name: p.name,
      slug: String(p.id).replace(/[^a-z0-9]+/gi, "-"),
      total: p.total_m,
      tierCount: p.tierCount,
      measure: p.measure,
      source: p.source,
      sourceUrl: p.sourceUrl,
      form: p.form,
      tiers: [],
    };
    const ring = ringMetres(f, project);
    if (ring.length >= 4) {
      rec.tiers.push({ tier: p.tier, base: p.base_m || 0, top: p.top_m || 1, cap: p.tierKind === "cap", ring });
    }
    by.set(p.id, rec);
  }

  const list = [...by.values()].filter((m) => m.tiers.length);

  for (const m of list) {
    m.tiers.sort((a, b) => a.tier - b.tier);
    // The frame comes from the GROUND tier and every tier is drawn in it, so
    // the storeys stay aligned with one another instead of each finding its own
    // slightly different angle.
    m.frame = principalFrame(m.tiers[0].ring);
    for (const t of m.tiers) t.local = toFrame(t.ring, m.frame);
  }

  list.sort((a, b) => (b.total || 0) - (a.total || 0));
  mount.innerHTML = list.map(sheet).join("");
  return list.length;
}
