#!/usr/bin/env node
/* Register the Descent of the Ganges photograph against the modelled rock.
 *
 * PHASE A (this file, today): measure where the photograph sits on the 29.26 m
 * run, and write a QA page a human must look at before any pixels ship.
 * PHASE B (later): warp, high-pass, Sobel, and emit the normal map.
 *
 * ---- WHAT THIS IS ALLOWED TO CLAIM ----
 * Three different things, and they must never be blurred together:
 *   EVIDENCE  — there is carving here, and it is these figures in this layout.
 *               A public-domain photograph shows it.
 *   INFERENCE — how deep the surface is. Derived from light and shade. Not
 *               measured. Every number this script derives is in this class.
 *   ABSENCE   — the rest of the panel. No photograph here covers it. Left bare.
 *
 * ---- WHY ffmpeg + NODE BUILTINS ----
 * This repo has no npm and no package.json; scripts/build-terrain.js hand-decodes
 * PNG with zlib for exactly that reason. ffmpeg does only what Node cannot (JPEG
 * decode); every decision that has to be reviewable is plain arithmetic here.
 * Do NOT shell out to `convert` — on Windows that resolves to the NTFS filesystem
 * converter, not ImageMagick, and will do something else entirely.
 *
 * Usage:  node scripts/build-relief-plate.js
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets/reference/penance/bpl-penance-cleft-nagas.jpg");
const QA_OUT = join(ROOT, "assets/reference/penance/plate-qa.html");

/* Geometry constants. These MUST match js/scene-penance.js — if they drift, the
 * plate lands in the wrong place on the rock and every figure sits somewhere it
 * is not. Kept as literals with the source named rather than imported, because
 * scene-penance.js is a browser module that pulls in three.js. */
const RUN_TOTAL = 29.26;   // scene-penance.js:71
const MAX_H = 13.1;        // SOUTH.height — the v datum
const CLEFT_W = 0.56;      // scene-penance.js:72 — AN ESTIMATE, not published
const NORTH_RUN = 15.1;    // NORTH.run
/* Distance from the north end (u=0) to the centre of the cleft. */
const CLEFT_RUN_M = NORTH_RUN + CLEFT_W / 2;

/* Sanity gate. My hand measurement of this frame put it at ~6 m of run, from two
 * independent references that agreed: the cleft slot read ~400 px against 0.56 m,
 * and the life-size elephant read ~2200 px against ~3 m. If the script's own
 * derivation lands outside this window something is wrong with the detection and
 * it must write NOTHING rather than a quiet nonsense plate. Same rule as
 * scripts/fetch-site-data.js: fail loudly, do not ship a guess. */
const RUN_MIN_M = 3.0;
const RUN_MAX_M = 14.0;

function die(msg) {
  console.error("build-relief-plate: " + msg);
  process.exit(1);
}

function haveFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
    return true;
  } catch (_) {
    return false;
  }
}

/* ---------- decode ---------- */

function probe(path) {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
     "-of", "csv=p=0", path],
    { encoding: "utf8" }
  ).trim();
  const [w, h] = out.split(",").map(Number);
  if (!w || !h) die("could not read dimensions from " + path);
  return { w, h };
}

function decodeGray(path, w, h) {
  const buf = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", path, "-vf", "format=gray", "-f", "rawvideo", "-"],
    { maxBuffer: 1 << 30 }
  );
  if (buf.length !== w * h) die(`gray decode gave ${buf.length} bytes, expected ${w * h}`);
  return buf;
}

/* ---------- measurement ---------- */

/* The print is mounted on cream card that reads ~226-227 in gray, against image
 * content in the 60-150 range. A flat threshold separates them cleanly; this was
 * measured on the actual file, not assumed. */
const MOUNT_GRAY = 220;

function contentBox(g, w, h) {
  const colMean = (x) => { let s = 0; for (let y = 0; y < h; y++) s += g[y * w + x]; return s / h; };
  const rowMean = (y) => { let s = 0; for (let x = 0; x < w; x++) s += g[y * w + x]; return s / w; };
  let x0 = 0; while (x0 < w && colMean(x0) > MOUNT_GRAY) x0++;
  let x1 = w - 1; while (x1 > x0 && colMean(x1) > MOUNT_GRAY) x1--;
  let y0 = 0; while (y0 < h && rowMean(y0) > MOUNT_GRAY) y0++;
  let y1 = h - 1; while (y1 > y0 && rowMean(y1) > MOUNT_GRAY) y1--;
  return { x0, x1, y0, y1 };
}

/* The sand at the foot of the rock is bright and near-featureless. Its top edge
 * is the ground line, which is localY = 0, which is v = 1 — so this single
 * measurement gives the vertical datum.
 *
 * Cropping here also removes the curator's pencil marks ("722" and "14") that sit
 * on the sand INSIDE the printed area. Left in, a luminance-gradient pass turns
 * a 19th-century accession number into carved inscription on a Pallava monument. */
function groundLine(g, w, box) {
  const width = box.x1 - box.x0 + 1;
  const mean = (y) => { let s = 0; for (let x = box.x0; x <= box.x1; x++) s += g[y * w + x]; return s / width; };
  const start = Math.floor(box.y0 + (box.y1 - box.y0) * 0.6);
  for (let y = start; y < box.y1 - 30; y++) {
    let ok = true;
    for (let k = 0; k < 30; k++) if (mean(y + k) <= 165) { ok = false; break; }
    if (ok) return y;
  }
  return null;
}

/* Find the cleft: a dark, vertically continuous channel. NOT simply the darkest
 * column — the broad shadowed relief on the south side is darker on average over
 * a wide span, and taking a plain minimum lands there instead. A matched filter
 * for a band of roughly the expected width, scored against its own surroundings,
 * finds the channel rather than the shadow.
 *
 * Returns the centre and the width at which the profile climbs back out, so the
 * width is measured rather than assumed. */
function findCleft(g, w, box, ground) {
  const by0 = Math.floor(box.y0 + (ground - box.y0) * 0.30);
  const by1 = Math.floor(box.y0 + (ground - box.y0) * 0.75);
  const n = box.x1 - box.x0 + 1;
  const prof = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let y = by0; y <= by1; y++) s += g[y * w + box.x0 + i];
    prof[i] = s / (by1 - by0 + 1);
  }
  // light smoothing, ~0.5% of frame width
  const r = Math.max(3, Math.round(n * 0.005));
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -r; k <= r; k++) { const j = i + k; if (j >= 0 && j < n) { s += prof[j]; c++; } }
    sm[i] = s / c;
  }
  /* Matched filter: mean inside a band of width `bw`, minus mean of the two
   * flanks of the same width either side. Most negative = darkest narrow
   * channel relative to its own neighbourhood. Scan a range of plausible widths
   * so the width is found, not fixed. */
  let best = { score: Infinity, centre: -1, bw: 0 };
  /* Width range deliberately narrow. An earlier version searched 4-16% of the
   * frame and always chose the widest band, because the broad shadowed relief on
   * the south side out-scores the actual slot on total darkness. The QA page
   * caught it: the derived scale said a life-size elephant should be 3,830 px
   * tall in a frame where it measures about 2,200. Prefer narrow. */
  for (let bw = Math.round(n * 0.06); bw <= Math.round(n * 0.12); bw += 4) {
    for (let c = bw; c + bw < n - bw; c++) {
      let inSum = 0, lSum = 0, rSum = 0;
      for (let k = 0; k < bw; k++) {
        inSum += sm[c - (bw >> 1) + k];
        lSum += sm[c - (bw >> 1) - bw + k];
        rSum += sm[c + (bw >> 1) + k];
      }
      const score = inSum / bw - (lSum + rSum) / (2 * bw);
      if (score < best.score) best = { score, centre: c, bw };
    }
  }
  return { ...best, xFull: box.x0 + best.centre, band: [by0, by1], profile: Array.from(sm) };
}

/* ---------- main ---------- */

if (!haveFfmpeg()) die("ffmpeg is not on PATH. Install it, or run this where it is.");
if (!existsSync(SRC)) die("missing source photograph: " + SRC);

const { w, h } = probe(SRC);
const g = decodeGray(SRC, w, h);
const box = contentBox(g, w, h);
const ground = groundLine(g, w, box);
if (ground === null) die("could not find the ground line — the sand at the foot of the rock was not detected.");

const cleft = findCleft(g, w, box, ground);
if (cleft.centre < 0) die("could not find the cleft.");

/* Scale, and the honest label on it.
 *
 * This is the weakest link in the whole pipeline and it must stay visible.
 * CLEFT_W is 0.56 m, which js/scene-penance.js already declares as a modelling
 * ESTIMATE — no published width exists in Fergusson (1880), Longhurst (1928),
 * Wikipedia or Puratattva; all four describe the fissure only qualitatively.
 * So the plate's entire horizontal scale inherits that estimate: a 20% error in
 * the cleft width is a 20% error in how wide the shaded band appears. That is one
 * traceable inference, stated once, and far better than an eyeballed crop. */
/* THE SCALE IS NOT RELIABLY MACHINE-MEASURABLE, AND PRETENDING OTHERWISE IS THE
 * MOST DANGEROUS THING THIS SCRIPT COULD DO.
 *
 * Two independent weaknesses compound. First, CLEFT_W is an estimate, so even a
 * perfect slot measurement inherits an unpublished number. Second, the slot's
 * edges are not crisply separable from the shadowed relief either side of it, so
 * the measurement itself is soft: the first version of this detector picked a
 * 715 px band where hand measurement and the life-size elephant both say ~420.
 *
 * So the auto value is a SUGGESTION, and phase B refuses to run on it. A human
 * looks at plate-qa.html, measures something whose size is actually cited —
 * Fergusson & Burgess 1880 p. 156 give the Naga Raja "above 5 feet in height"
 * and the Nagi "about 7 feet", both visible in the cleft, and call the elephants
 * "life size" — and passes the result back in:
 *
 *     node scripts/build-relief-plate.js --m-per-px=0.00127
 *
 * That way the number that sets where every figure lands on a 29 m monument is
 * one a person decided from a cited dimension, and the QA page records it. */
const OVERRIDE = (() => {
  const a = process.argv.find((s) => s.startsWith("--m-per-px="));
  return a ? Number(a.split("=")[1]) : null;
})();
if (OVERRIDE !== null && !(OVERRIDE > 0)) die("--m-per-px must be a positive number");
const scaleConfirmed = OVERRIDE !== null;
/* Whoever overrides the scale must also say what they measured it against. An
 * unexplained magic number is not an improvement on a bad automatic one. */
const SCALE_NOTE = (() => {
  const a = process.argv.find((s) => s.startsWith("--scale-note="));
  return a ? a.slice("--scale-note=".length) : null;
})();
if (scaleConfirmed && !SCALE_NOTE) {
  die("--m-per-px requires --scale-note=\"what you measured, and against which source\"");
}
const mPerPx = scaleConfirmed ? OVERRIDE : CLEFT_W / cleft.bw;
const frameRunM = (box.x1 - box.x0 + 1) * mPerPx;
const frameHeightM = (ground - box.y0) * mPerPx;

/* Independent cross-check, from a CITED figure rather than an estimate.
 * Fergusson & Burgess 1880 p. 156 give the Naga Raja "above 5 feet in height"
 * and the Nagi "about 7 feet". They also call the elephants "life size". None is
 * automatically detectable, so this is not used to set the scale — it is printed
 * on the QA page so a human can judge whether the derived metre grid is credible
 * against something whose size they can recognise. */
const elephantPx = 3.0 / mPerPx;

const runCentre = CLEFT_RUN_M;
const run0 = runCentre - ((cleft.xFull - box.x0) * mPerPx);
const run1 = run0 + frameRunM;
const u0 = run0 / RUN_TOTAL;
const u1 = run1 / RUN_TOTAL;
/* v: the frame bottom is the ground (localY = 0 → v = 1); the frame top is
 * frameHeightM above it. v = 1 - localY/13.1, so the top edge is the smaller v. */
const v1 = 1;
const v0 = 1 - frameHeightM / MAX_H;

const derived = {
  source: "assets/reference/penance/bpl-penance-cleft-nagas.jpg",
  imagePx: { w, h },
  contentBox: box,
  groundLineY: ground,
  cleft: { xFull: cleft.xFull, widthPx: cleft.bw, score: +cleft.score.toFixed(2) },
  mPerPx: +mPerPx.toFixed(6),
  frame_m: { run: +frameRunM.toFixed(2), height: +frameHeightM.toFixed(2) },
  coverage: {
    run_m: [+run0.toFixed(2), +run1.toFixed(2)],
    u: [+u0.toFixed(4), +u1.toFixed(4)],
    v: [+v0.toFixed(4), +v1.toFixed(4)],
  },
  bare_m: { north: +run0.toFixed(2), south: +(RUN_TOTAL - run1).toFixed(2) },
  scaleConfirmed,
  scaleFrom: scaleConfirmed
    ? SCALE_NOTE
    : `SUGGESTION ONLY — cleft width ${CLEFT_W} m, itself a modelling estimate`,
  crossCheck: { lifeSizeElephantShouldBePx: Math.round(elephantPx) },
};

console.log(JSON.stringify(derived, null, 2));

/* The gate. */
if (frameRunM < RUN_MIN_M || frameRunM > RUN_MAX_M) {
  die(
    `derived frame width ${frameRunM.toFixed(2)} m is outside the sanity window ` +
    `${RUN_MIN_M}-${RUN_MAX_M} m. Detection is wrong; writing nothing. ` +
    `Check plate-qa.html reasoning by hand before widening this gate.`
  );
}

/* ---------- QA page ---------- */

const scale = 900 / (box.x1 - box.x0 + 1);
const dispW = Math.round((box.x1 - box.x0 + 1) * scale);
const dispH = Math.round((ground - box.y0) * scale);

const proxy = join(dirname(QA_OUT), "plate-qa-proxy.jpg");
execFileSync("ffmpeg", [
  "-v", "error", "-y", "-i", SRC,
  "-vf", `crop=${box.x1 - box.x0 + 1}:${ground - box.y0}:${box.x0}:${box.y0},scale=${dispW}:${dispH}`,
  "-q:v", "4", proxy,
]);

const metreLines = [];
for (let m = Math.ceil(run0); m <= run1; m++) {
  const px = ((m - run0) / mPerPx) * scale;
  metreLines.push(
    `<div class="m" style="left:${px.toFixed(1)}px"><span>${m} m</span></div>`
  );
}
const cleftX = ((cleft.xFull - box.x0) * scale).toFixed(1);
const cleftW = (cleft.bw * scale).toFixed(1);

mkdirSync(dirname(QA_OUT), { recursive: true });
writeFileSync(QA_OUT, `<!doctype html>
<meta charset="utf-8">
<title>Relief plate — registration QA</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:24px;max-width:1000px;background:#f7f4ee;color:#221}
 h1{font-size:20px;margin:0 0 4px}
 .wrap{position:relative;width:${dispW}px;margin:18px 0;outline:1px solid #333}
 img{display:block;width:${dispW}px;height:${dispH}px}
 .m{position:absolute;top:0;bottom:0;width:1px;background:rgba(220,40,40,.85)}
 .m span{position:absolute;top:2px;left:3px;font:11px monospace;color:#fff;background:rgba(180,20,20,.85);padding:0 3px}
 .cleft{position:absolute;top:0;bottom:0;background:rgba(40,120,255,.25);border-left:2px solid #1a6;border-right:2px solid #1a6}
 .ground{position:absolute;left:0;right:0;bottom:0;height:2px;background:#f90}
 table{border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ccc;padding:4px 9px;text-align:left}
 .warn{background:#fff3cd;border-left:4px solid #e0a800;padding:10px 14px;margin:14px 0}
 .stop{background:#fdecea;border-left:4px solid #c0392b;padding:10px 14px;margin:14px 0}
 .ok{background:#e8f6ec;border-left:4px solid #2e7d32;padding:10px 14px;margin:14px 0}
 .stop ul{margin:6px 0 6px 18px;padding:0}
 code{background:#eee;padding:1px 4px}
</style>
<h1>Descent of the Ganges — plate registration QA</h1>
<p>Generated by <code>scripts/build-relief-plate.js</code>. Nothing ships until a human confirms the marks below.</p>

${scaleConfirmed ? `<div class="ok"><b>Scale set by hand:</b> <code>${OVERRIDE}</code> m/px.<br>
<b>Basis:</b> ${SCALE_NOTE}<br>
Everything below is drawn at that scale. Check it still looks right.</div>`
: `<div class="stop">
<b>SCALE NOT CONFIRMED — the metre grid below is a guess and is probably wrong.</b>
<p>It was derived from the cleft width, which is a bad reference twice over:
<code>CLEFT_W = 0.56</code> is itself an unpublished modelling estimate
(<code>js/scene-penance.js</code> says so), and the slot's edges are not cleanly
separable from the shadowed relief beside them.</p>
<p><b>What to do.</b> Measure something in the picture whose size is actually
<i>cited</i>, then re-run with the result. Fergusson &amp; Burgess 1880 p. 156 give,
for figures in this very frame:</p>
<ul>
<li>the Naga Raja — <b>above 5 feet</b>, with a seven-headed serpent hood</li>
<li>the Nagi below him — <b>about 7 feet</b>, three-headed hood</li>
<li>the elephants — <b>life size</b> (so ~3 m at the head)</li>
</ul>
<p>Divide the metres by the pixels you measure <i>in the full-resolution file</i>
(${w} × ${h}), then:</p>
<p><code>node scripts/build-relief-plate.js --m-per-px=0.00127</code></p>
<p>Phase B will refuse to run until you do. The number that decides where every
carved figure lands on a 29 m monument should be one a person chose from a cited
dimension, not one a matched filter guessed.</p>
</div>`}

<div class="warn">
<b>Check these three things by eye:</b>
<ol>
<li>Is the <b style="color:#1a6">green band</b> actually on the cleft — the dark vertical
    channel with the naga figures in it — and not on a shadow?</li>
<li>Is the <b style="color:#c22">red metre grid</b> credible? The great elephant is recorded
    as <i>life size</i> by Fergusson (1880), so it should be about
    <b>${(elephantPx * scale).toFixed(0)} px</b> tall here, roughly 3 m.</li>
<li>Is the <b style="color:#f90">orange ground line</b> at the foot of the rock, with the
    sand and the pencil marks below it excluded?</li>
</ol>
</div>

<div class="wrap">
  <img src="plate-qa-proxy.jpg" alt="">
  <div class="cleft" style="left:${(+cleftX - +cleftW / 2).toFixed(1)}px;width:${cleftW}px"></div>
  ${metreLines.join("\n  ")}
  <div class="ground"></div>
</div>

<table>
<tr><th>derived</th><th>value</th></tr>
<tr><td>scale</td><td>${mPerPx.toFixed(5)} m/px &nbsp;<i>${scaleConfirmed ? "(set by hand — see basis above)" : "(from the cleft width — an estimate, unconfirmed)"}</i></td></tr>
<tr><td>frame covers</td><td>${frameRunM.toFixed(2)} m of run × ${frameHeightM.toFixed(2)} m of height</td></tr>
<tr><td>run window</td><td>${run0.toFixed(2)} m → ${run1.toFixed(2)} m from the north end</td></tr>
<tr><td>u window</td><td>${u0.toFixed(4)} → ${u1.toFixed(4)}</td></tr>
<tr><td>v window</td><td>${v0.toFixed(4)} (top) → ${v1.toFixed(4)} (ground)</td></tr>
<tr><td>left bare</td><td>${run0.toFixed(2)} m north, ${(RUN_TOTAL - run1).toFixed(2)} m south</td></tr>
</table>

<div class="warn">
<b>Two things this page does not show, and both must reach the visitor.</b><br>
<b>The plate is a mirror.</b> In the model <code>u = 0</code> is at the most-negative z,
which is north. Facing an east-facing wall, north is on the viewer's <i>right</i> — and in
this photograph the shrine (Fergusson's “southern half”) is on the left with the elephants
(his “right half”) on the right, which agrees. So <code>u</code> increases right-to-left and
the rectified image must be flipped horizontally before it becomes the plate.<br>
<b>Perspective is not corrected.</b> One landmark gives translation, not a homography, so
this is an affine fit only. The upper registers recede from the camera and stay that way;
no source records the camera height or standoff that a real rectification would need.
</div>
`);

console.log("\nwrote " + QA_OUT);
console.log("wrote " + proxy);
console.log("\nOPEN IT AND LOOK. Phase B must not run until the marks above are confirmed.");
