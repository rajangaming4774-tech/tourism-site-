#!/usr/bin/env node
/* A contact sheet for the Shore Temple photogrammetry set.
 *
 * Eight hundred and fifty-nine photographs is past the point where a file
 * listing tells you anything. The question that decides whether a solve is worth
 * running is visual and cannot be answered from a manifest: does this set
 * actually see the monument from all round, or is it four hundred versions of
 * the postcard view from the south-east?
 *
 * So this writes one page that shows them, grouped by tier, with what each file
 * carries stamped on it. Open it and scroll.
 *
 * The data is INLINED rather than fetched, because the page has to work from
 * file:// — where fetch() of a sibling JSON is blocked as a cross-origin read,
 * and the page would come up empty with an error only visible in the console.
 * The <img> tags load fine from file://; only fetch is restricted.
 *
 * The thumbnails come from the PARENT directory, not from images/. They are the
 * same photographs — images/ is hard-linked from there — but after --originals
 * has run, images/ holds full-resolution files averaging four megabytes. Pointing
 * 859 cards at those makes a page that is several gigabytes of decode work for a
 * browser, to draw them all at 210 px wide. The 1920 px renditions next door are
 * the identical picture at a tenth the cost, and they are always present, since
 * images/ is a subset of that folder.
 *
 * Usage:  node scripts/build-shore-temple-contactsheet.js
 * Output: assets/reference/shore-temple/photogrammetry/contact-sheet.html
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outDir = path.join(root, "assets", "reference", "shore-temple", "photogrammetry");

const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

function main() {
  const dsPath = path.join(outDir, "dataset.json");
  if (!fs.existsSync(dsPath)) {
    console.error("No dataset.json — run build-shore-temple-sfm.js first.");
    process.exit(1);
  }
  const ds = JSON.parse(fs.readFileSync(dsPath, "utf8"));

  const stationsPath = path.join(outDir, "camera-stations.geojson");
  const stations = fs.existsSync(stationsPath)
    ? new Set(
        JSON.parse(fs.readFileSync(stationsPath, "utf8")).features.map((f) => f.properties.file)
      )
    : new Set();

  const rows = ds.images.map((r) => ({
    f: r.file,
    t: r.tier,
    o: r.source === "original" ? 1 : 0,
    c: r.camera || "",
    l: r.focalLength || null,
    g: stations.has(r.file) ? 1 : 0,
  }));

  const TIERS = [
    ["core", "Core — full views, remote views, the vimana, the tank. These are the reconstruction."],
    ["detail", "Detail — sculpture and fabric close-ups. Register after the core solves."],
    ["context", "Context — people at the temple. Mostly occluded; first to drop if matching stalls."],
  ];

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Shore Temple — photogrammetry contact sheet</title>
<style>
  :root {
    --bg: #f3ebdc; --ink: #241d16; --muted: #6b6055; --line: #d9cdb8;
    --card: #fffdf8; --core: #2f6b4f; --detail: #8a5a2b; --context: #6b6055;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#181410; --ink:#efe6d6; --muted:#a2968a; --line:#3a322a; --card:#221c16; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif; }
  header { padding:28px 24px 18px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 6px; font-size:22px; font-weight:600; letter-spacing:-.01em; }
  .sub { color:var(--muted); max-width:70ch; }
  .stats { display:flex; flex-wrap:wrap; gap:20px; margin-top:14px; }
  .stat b { display:block; font-size:20px; font-variant-numeric:tabular-nums; }
  .stat span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.05em; }
  .bar { position:sticky; top:0; z-index:2; background:var(--bg);
    border-bottom:1px solid var(--line); padding:10px 24px; display:flex;
    gap:8px; flex-wrap:wrap; align-items:center; }
  button { font:inherit; padding:5px 12px; border:1px solid var(--line);
    background:var(--card); color:var(--ink); border-radius:999px; cursor:pointer; }
  button[aria-pressed="true"] { background:var(--ink); color:var(--bg); border-color:var(--ink); }
  h2 { margin:26px 24px 4px; font-size:16px; font-weight:600; }
  h2 .n { color:var(--muted); font-weight:400; }
  .note { margin:0 24px 12px; color:var(--muted); font-size:13px; max-width:80ch; }
  .grid { display:grid; gap:10px; padding:0 24px 24px;
    grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); }
  figure { margin:0; background:var(--card); border:1px solid var(--line);
    border-radius:8px; overflow:hidden; display:flex; flex-direction:column; }
  img { width:100%; aspect-ratio:4/3; object-fit:cover; display:block; background:var(--line); }
  figcaption { padding:7px 9px; font-size:11px; color:var(--muted); line-height:1.35;
    word-break:break-word; }
  .tags { display:flex; gap:4px; margin-top:4px; flex-wrap:wrap; }
  .tag { font-size:10px; padding:1px 6px; border-radius:999px; border:1px solid var(--line); }
  .tag.o { border-color:var(--core); color:var(--core); }
  .tag.g { border-color:var(--detail); color:var(--detail); }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<header>
  <h1>Shore Temple — photogrammetry contact sheet</h1>
  <p class="sub">Every photograph selected for the Structure-from-Motion solve, grouped by tier.
  The question this page answers is coverage: does the set see the monument from all round, or is it
  hundreds of versions of one view? Scroll, and look at how the angles are distributed.</p>
  <div class="stats">
    <div class="stat"><b>${ds.selected}</b><span>selected</span></div>
    <div class="stat"><b>${ds.excluded}</b><span>excluded</span></div>
    <div class="stat"><b>${ds.originals}</b><span>full-resolution</span></div>
    <div class="stat"><b>${ds.withFocalLength}</b><span>with focal length</span></div>
    <div class="stat"><b>${stations.size}</b><span>with GPS</span></div>
    <div class="stat"><b>${ds.distinctCameras}</b><span>distinct cameras</span></div>
  </div>
</header>

<div class="bar">
  <button id="f-all" aria-pressed="true">All</button>
  <button id="f-orig" aria-pressed="false">Full-resolution only</button>
  <button id="f-gps" aria-pressed="false">Has GPS</button>
  <button id="f-focal" aria-pressed="false">Has focal length</button>
</div>

${TIERS.map(([tier, note]) => {
  const list = rows.filter((r) => r.t === tier);
  return `<section data-tier="${tier}">
  <h2>${tier} <span class="n">— ${list.length} images</span></h2>
  <p class="note">${esc(note)}</p>
  <div class="grid">
${list
  .map(
    (r) => `    <figure data-o="${r.o}" data-g="${r.g}" data-l="${r.l ? 1 : 0}">
      <img loading="lazy" src="../${encodeURIComponent(r.f)}" alt="${esc(r.f)}">
      <figcaption>${esc(r.f)}
        <div class="tags">${r.o ? '<span class="tag o">original</span>' : ""}${
      r.g ? '<span class="tag g">gps</span>' : ""
    }${r.l ? `<span class="tag">${r.l} mm</span>` : ""}${
      r.c ? `<span class="tag">${esc(r.c.slice(0, 24))}</span>` : ""
    }</div>
      </figcaption>
    </figure>`
  )
  .join("\n")}
  </div>
</section>`;
}).join("\n")}

<script>
  // Filters are AND-ed, and "All" clears them. Kept deliberately small: this is
  // a working sheet, not a product.
  var state = { o: false, g: false, l: false };
  function apply() {
    var figs = document.querySelectorAll("figure");
    for (var i = 0; i < figs.length; i++) {
      var f = figs[i];
      f.hidden =
        (state.o && f.dataset.o !== "1") ||
        (state.g && f.dataset.g !== "1") ||
        (state.l && f.dataset.l !== "1");
    }
    document.getElementById("f-all").setAttribute(
      "aria-pressed", String(!state.o && !state.g && !state.l));
    document.getElementById("f-orig").setAttribute("aria-pressed", String(state.o));
    document.getElementById("f-gps").setAttribute("aria-pressed", String(state.g));
    document.getElementById("f-focal").setAttribute("aria-pressed", String(state.l));
    // Hide a whole tier once nothing in it survives the filter.
    var secs = document.querySelectorAll("section");
    for (var j = 0; j < secs.length; j++) {
      secs[j].hidden = !secs[j].querySelector("figure:not([hidden])");
    }
  }
  document.getElementById("f-all").onclick = function () {
    state = { o: false, g: false, l: false }; apply();
  };
  document.getElementById("f-orig").onclick = function () { state.o = !state.o; apply(); };
  document.getElementById("f-gps").onclick = function () { state.g = !state.g; apply(); };
  document.getElementById("f-focal").onclick = function () { state.l = !state.l; apply(); };
</script>
</body>
</html>
`;

  const out = path.join(outDir, "contact-sheet.html");
  fs.writeFileSync(out, html);
  console.log(
    rows.length +
      " images (" +
      ds.originals +
      " full-resolution, " +
      stations.size +
      " with GPS) -> " +
      out
  );
}

main();
