#!/usr/bin/env node
/* Turns the Shore Temple reference photographs into a Structure-from-Motion
 * dataset, ready to hand to COLMAP.
 *
 * WHY THIS EXISTS
 * ---------------
 * data/research/3d/00-baseline-gaps.md, gap G4: the Shore Temple cannot be
 * extruded. The OSM way is the prakara (46.4 × 21.5 m), the one cited height —
 * 18 m — belongs to the Kshatriyasimhesvara vimana alone, and applying the
 * second to the first would stand a 46 × 21 × 18 m slab on the shoreline. The
 * gap list says the unblock is published plan dimensions of the vimana.
 *
 * data/research/3d/scans-photogrammetry.md then established that no free scan
 * of this monument exists: the two real captures are Sketchfab view-only, and
 * their author will not release them.
 *
 * So there is a third way in, and this prepares it. Roughly nine hundred
 * freely-licensed photographs of one monument, from every side and distance, is
 * a Structure-from-Motion dataset — the "Building Rome in a Day" case, at the
 * scale of one temple. A solve over them yields geometry MEASURED FROM THE REAL
 * MONUMENT rather than guessed, which is the only kind this project's own rules
 * let it stand on.
 *
 * WHAT THIS SCRIPT DOES AND DOES NOT DO
 * -------------------------------------
 * It does NOT reconstruct anything. It selects, it reports what the photographs
 * actually carry (camera, focal length, GPS — read from the files themselves,
 * not from what Commons says it holds), it hard-links the chosen images into a
 * COLMAP-shaped folder, and it writes the recipe. The solve is GPU work that
 * belongs on the machine that has one.
 *
 * Hard links, not copies: the dataset costs no extra disk, and editing an image
 * in one place edits it in the other. Delete the folder freely; the originals
 * in the parent directory are untouched.
 *
 * THUMBNAILS ARE NOT ENOUGH FOR A REAL SOLVE
 * ------------------------------------------
 * The reference images are 1920 px renditions, and Wikimedia's thumbnailer
 * rewrites EXIF as it renders: measured over six files here, every ORIGINAL
 * carried the camera model and the Exif sub-IFD with the focal length, and every
 * thumbnail had them stripped — four of the six had no EXIF segment at all.
 * Across the whole selection only 79 of 859 still name a camera.
 *
 * That matters because COLMAP reads intrinsics from the files it is handed. With
 * no focal length it falls back to guessing one from the image width, and a bad
 * initial guess is where reconstructions of unordered internet photographs
 * usually fail. So the default folder — hard links to the thumbnails — is for
 * looking at and for a cheap trial solve. Before a real one, re-fetch the
 * selection at full resolution:
 *
 *   WIKI_CONTACT=you@example.com node scripts/build-shore-temple-sfm.js --originals
 *
 * Usage:  node scripts/build-shore-temple-sfm.js [--originals] [--tiers=core,detail]
 * Input:  assets/reference/shore-temple/manifest.json
 * Output: assets/reference/shore-temple/photogrammetry/
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const refDir = path.join(root, "assets", "reference", "shore-temple");
const outDir = path.join(refDir, "photogrammetry");
const imgDir = path.join(outDir, "images");

const ORIGINALS = process.argv.includes("--originals");
const TIERS = ((process.argv.find((a) => a.startsWith("--tiers=")) || "").split("=")[1] || "core")
  .split(",")
  .filter(Boolean);

/* Originals average four megabytes, so this throttles on BYTES where the
 * thumbnail fetch throttled on requests: Wikimedia answered a 400 ms cadence
 * with "Your bot is making too many requests". Slower cadence, and a ladder to
 * climb when it still says no. */
const PACE_MS = 900;
const BACKOFF_MS = [3e3, 15e3, 45e3, 90e3, 180e3, 300e3];

const CONTACT = process.env.WIKI_CONTACT || "";
const UA = "india-heritage-map/1.0 (" + CONTACT + ") node/" + process.versions.node;

/* ------------------------------------------------------------------ *
 * A minimal EXIF reader.
 *
 * COLMAP reads intrinsics out of the image files it is handed, so what matters
 * is what OUR files carry, not what Commons holds in its database. Commons
 * thumbnails keep EXIF for some uploads and drop it for others, and the only
 * way to know which is to open them.
 *
 * This walks JPEG segments to APP1, then the TIFF header, IFD0 and the Exif
 * sub-IFD, for the six tags that decide whether a photograph can be calibrated.
 * Written out rather than taken from a package because the project has no
 * dependencies and no build step, and this is eighty lines.
 * ------------------------------------------------------------------ */
const TAGS = {
  0x010f: "make",
  0x0110: "model",
  0x8769: "exifIFD", // pointer
  0x8825: "gpsIFD", // pointer
  0x829a: "exposure",
  0x920a: "focalLength",
  0xa405: "focal35",
  0xa002: "exifWidth",
  0xa003: "exifHeight",
  0x9003: "dateTaken",
};

function readExif(file) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null; // not JPEG

  // Walk the segment chain to APP1/Exif. Scanning for the bytes "Exif\0\0"
  // instead would find them inside a thumbnail or a comment just as happily.
  let p = 2;
  let app1 = -1;
  while (p + 4 <= buf.length && buf[p] === 0xff) {
    const marker = buf[p + 1];
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end
    const len = buf.readUInt16BE(p + 2);
    if (marker === 0xe1 && buf.toString("latin1", p + 4, p + 10) === "Exif\0\0") {
      app1 = p + 10;
      break;
    }
    p += 2 + len;
  }
  if (app1 < 0) return null;

  const tiff = app1;
  if (tiff + 8 > buf.length) return null;
  const le = buf.toString("latin1", tiff, tiff + 2) === "II";
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  if (u16(tiff + 2) !== 42) return null;

  const out = {};
  const readIFD = (offset, depth) => {
    if (depth > 2 || offset + 2 > buf.length) return;
    const n = u16(offset);
    if (n > 512) return; // corrupt; a real IFD is dozens of entries
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > buf.length) return;
      const name = TAGS[u16(e)];
      if (!name) continue;
      const type = u16(e + 2);
      const count = u32(e + 4);
      const inline = count * [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8][type] <= 4;
      const valOff = inline ? e + 8 : tiff + u32(e + 8);
      if (valOff + 4 > buf.length) continue;

      if (name === "exifIFD" || name === "gpsIFD") {
        if (name === "exifIFD") readIFD(tiff + u32(e + 8), depth + 1);
        else out.hasGPS = true;
        continue;
      }
      if (type === 2) {
        out[name] = buf.toString("latin1", valOff, valOff + Math.max(0, count - 1)).trim();
      } else if (type === 3) {
        out[name] = u16(valOff);
      } else if (type === 4) {
        out[name] = u32(valOff);
      } else if (type === 5 && valOff + 8 <= buf.length) {
        const den = u32(valOff + 4);
        out[name] = den ? u32(valOff) / den : null;
      }
    }
  };
  readIFD(tiff + u32(tiff + 4), 0);
  return out;
}

/* ------------------------------------------------------------------ *
 * Selection.
 *
 * SfM matches features between photographs of THE SAME SURFACE. What breaks a
 * solve is not a bad photograph, it is a photograph of something else: an
 * engraving, an information board, another monument. Those do not merely fail
 * to register — they can register wrongly and drag geometry with them.
 * ------------------------------------------------------------------ */

// Categories, in the order they earn their place in a solve.
const TIER = {
  "Full views of the Shore Temple": "core",
  "Vimana of the Shore Temple": "core",
  "Remote views of the Shore Temple": "core",
  "Temple tank at the Shore Temple": "core",
  "Sculptures at the Shore Temple": "detail",
  "Shore Temple": "detail",
  "People at the Shore Temple": "context",
};

/* Excluded outright, with the reason recorded rather than left implicit. */
const EXCLUDE_CAT = {
  "Historical images of the Shore Temple":
    "19th-century prints, engravings and albumen plates. They predate the modern " +
    "conservation, the sea wall and the replaced stonework, so they describe a " +
    "different surface — and an engraving is a drawing, not a measurement.",
};

const EXCLUDE_TITLE = [
  [/floor.?plan|ground.?plan|\bplan\b|schematic|diagram|map of/i, "a plan or diagram, not a photograph"],
  [/postcard|advertis/i, "a postcard or advertisement, not a photograph of the fabric"],
  [/description about|information board|signboard|notice board/i, "a photograph of an information board"],
  [/collage|montage|\d ?scenes/i, "a composite of several photographs"],
];

function classify(r) {
  for (const c of r.cats) {
    if (EXCLUDE_CAT[c]) return { keep: false, why: EXCLUDE_CAT[c] };
  }
  for (const [re, why] of EXCLUDE_TITLE) {
    if (re.test(r.title)) return { keep: false, why };
  }
  if (r.mime !== "image/jpeg" && r.mime !== "image/png") {
    return { keep: false, why: "not a photographic raster (" + r.mime + ")" };
  }
  // Below roughly a megapixel there are too few features to match reliably.
  if (r.localWidth < 900) {
    return { keep: false, why: "too small to match (" + r.localWidth + " px wide)" };
  }
  let tier = "context";
  for (const c of r.cats) {
    const t = TIER[c];
    if (t === "core") tier = "core";
    else if (t === "detail" && tier !== "core") tier = "detail";
  }
  return { keep: true, tier };
}

/* ------------------------------------------------------------------ *
 * Full-resolution re-fetch, for the tiers actually going into a solve.
 * Same politeness rules as the fetch script: identify the client, pace it.
 * ------------------------------------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOriginals(rows, byFile) {
  if (!CONTACT) {
    console.error(
      [
        "--originals needs WIKI_CONTACT set to an email address or project URL.",
        "Wikimedia's robot policy requires a contact in the User-Agent.",
        "",
        "  WIKI_CONTACT=you@example.com node scripts/build-shore-temple-sfm.js --originals",
      ].join("\n")
    );
    process.exit(1);
  }
  const wanted = rows.filter((r) => TIERS.includes(r.tier));
  const bytes = wanted.reduce((a, r) => a + (byFile.get(r.file).originalBytes || 0), 0);
  console.log(
    "fetching " +
      wanted.length +
      " originals (" +
      TIERS.join("+") +
      "), about " +
      (bytes / 1e9).toFixed(1) +
      " GB"
  );

  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of wanted) {
    const meta = byFile.get(r.file);
    const dst = path.join(imgDir, r.file);

    /* Resume. An original already on disk is identifiable by its size — the
     * hard link it replaced is the 1920 px rendition and is far smaller. This
     * run WILL be interrupted (originals average four megabytes, and Wikimedia
     * throttles on bytes as well as on requests), so re-fetching what is
     * already here would make each attempt start from zero. */
    if (fs.existsSync(dst) && fs.statSync(dst).size === meta.originalBytes) {
      r.source = "original";
      skipped++;
      done++;
      continue;
    }

    let ok = false;
    for (let attempt = 0; attempt < BACKOFF_MS.length && !ok; attempt++) {
      try {
        const res = await fetch(meta.originalUrl, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(180000),
        });
        if (!res.ok) {
          if (res.status !== 429 && res.status < 500) throw new Error(res.status + " " + res.statusText);
          const wait = BACKOFF_MS[attempt];
          console.log("  " + res.status + ", waiting " + Math.round(wait / 1000) + "s");
          await sleep(wait);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        fs.rmSync(dst, { force: true }); // unlink first: it is a hard link to the reference copy
        fs.writeFileSync(dst, buf);
        r.source = "original";
        ok = true;
      } catch (e) {
        if (attempt === BACKOFF_MS.length - 1) {
          console.log("FAIL " + r.file + ": " + e.message);
        } else {
          await sleep(BACKOFF_MS[attempt]);
        }
      }
    }
    if (!ok) failed++;
    if (++done % 25 === 0) console.log(done + "/" + wanted.length);
    await sleep(PACE_MS);
  }
  console.log(
    done - failed + " originals in place" + (skipped ? " (" + skipped + " already there)" : "") +
      (failed ? ", " + failed + " failed" : "")
  );
}

/* ------------------------------------------------------------------ */

async function main() {
  const manifestPath = path.join(refDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("No manifest at " + manifestPath + " — run fetch-shore-temple-photos.js first.");
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const manifestFiles = manifest.files;

  const kept = [];
  const dropped = [];
  for (const r of manifest.files) {
    const file = path.join(refDir, r.file);
    if (!fs.existsSync(file)) continue;
    const c = classify(r);
    if (!c.keep) {
      dropped.push({ file: r.file, why: c.why });
      continue;
    }
    const exif = readExif(file) || {};
    kept.push({
      file: r.file,
      tier: c.tier,
      source: "thumbnail",
      cats: r.cats,
      width: r.localWidth,
      height: r.localHeight,
      camera: [exif.make, exif.model].filter(Boolean).join(" ").trim() || null,
      focalLength: exif.focalLength || null,
      focal35: exif.focal35 || null,
      hasGPS: !!exif.hasGPS,
      dateTaken: exif.dateTaken || null,
    });
  }

  const order = { core: 0, detail: 1, context: 2 };
  kept.sort((a, b) => order[a.tier] - order[b.tier] || a.file.localeCompare(b.file));

  /* Hard-link the images into a COLMAP-shaped folder.
   *
   * Deliberately NOT a wipe-and-relink. A file already here is either the link
   * this would recreate or a full-resolution original a previous --originals run
   * paid for, and clearing the folder throws the second away — which is how the
   * first attempt at this turned a resumable download into a restart. Instead:
   * add what is missing, and remove only what the selection no longer claims, so
   * a rule change still drops files that stopped qualifying. */
  fs.mkdirSync(imgDir, { recursive: true });
  const want = new Set(kept.map((r) => r.file));
  let stale = 0;
  for (const name of fs.readdirSync(imgDir)) {
    if (want.has(name)) continue;
    fs.rmSync(path.join(imgDir, name), { force: true });
    stale++;
  }

  const bySize = new Map(manifestFiles.map((r) => [r.file, r.originalBytes]));
  let linked = 0;
  let copied = 0;
  let present = 0;
  for (const r of kept) {
    const src = path.join(refDir, r.file);
    const dst = path.join(imgDir, r.file);
    if (fs.existsSync(dst)) {
      present++;
      if (fs.statSync(dst).size === bySize.get(r.file)) r.source = "original";
      continue;
    }
    try {
      fs.linkSync(src, dst);
      linked++;
    } catch {
      // Hard links need one volume and a filesystem that supports them.
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
  if (stale) console.log(stale + " no-longer-selected files removed from images/");

  if (ORIGINALS) {
    const byFile = new Map(manifest.files.map((r) => [r.file, r]));
    await fetchOriginals(kept, byFile);
    // Re-read EXIF: the whole point of the re-fetch is that the originals carry
    // intrinsics the thumbnails do not, and the report must reflect the files
    // that are now on disk rather than the ones that were.
    for (const r of kept) {
      if (r.source !== "original") continue;
      const exif = readExif(path.join(imgDir, r.file)) || {};
      r.camera = [exif.make, exif.model].filter(Boolean).join(" ").trim() || null;
      r.focalLength = exif.focalLength || null;
      r.focal35 = exif.focal35 || null;
      r.hasGPS = !!exif.hasGPS;
      r.dateTaken = exif.dateTaken || null;
    }
  }

  const stat = (pred) => kept.filter(pred).length;
  const cameras = {};
  for (const r of kept) if (r.camera) cameras[r.camera] = (cameras[r.camera] || 0) + 1;
  const summary = {
    built: new Date().toISOString().slice(0, 10),
    from: "assets/reference/shore-temple/manifest.json",
    selected: kept.length,
    excluded: dropped.length,
    tiers: {
      core: stat((r) => r.tier === "core"),
      detail: stat((r) => r.tier === "detail"),
      context: stat((r) => r.tier === "context"),
    },
    originals: stat((r) => r.source === "original"),
    withCamera: stat((r) => r.camera),
    withFocalLength: stat((r) => r.focalLength),
    withGPS: stat((r) => r.hasGPS),
    distinctCameras: Object.keys(cameras).length,
    linked,
    copied,
    alreadyPresent: present,
    images: kept,
    excludedFiles: dropped,
  };
  fs.writeFileSync(path.join(outDir, "dataset.json"), JSON.stringify(summary, null, 2));
  writeReadme(summary, cameras);

  console.log(
    kept.length +
      " images selected (" +
      summary.tiers.core +
      " core, " +
      summary.tiers.detail +
      " detail, " +
      summary.tiers.context +
      " context), " +
      dropped.length +
      " excluded"
  );
  console.log(
    summary.withCamera +
      " carry a camera model, " +
      summary.withFocalLength +
      " a focal length, " +
      summary.withGPS +
      " a GPS fix, across " +
      summary.distinctCameras +
      " distinct cameras"
  );
  console.log("-> " + outDir);
}

function writeReadme(s, cameras) {
  const top = Object.entries(cameras)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const pct = (n) => Math.round((n / s.selected) * 100) + "%";

  const md = `# Shore Temple — photogrammetry dataset

Built ${s.built} by \`scripts/build-shore-temple-sfm.js\` from the reference
photographs in the parent directory. \`images/\` holds **${s.selected}** hard links,
so this folder costs almost no disk and can be deleted at any time.

This is a **dataset and a recipe, not a reconstruction.** Nothing here has been
solved. The solve is GPU work and belongs on a machine with a GPU.

## Why photogrammetry and not an AI mesh

\`data/research/3d/00-baseline-gaps.md\` (gap **G4**) refuses to extrude the Shore
Temple: the OSM way is the prakara at 46.4 × 21.5 m, the one cited height — 18 m —
belongs to the Kshatriyasimhesvara vimana alone, and combining them would stand a
46 × 21 × 18 m slab on the shoreline.

An image-to-3D model would answer that in a minute with geometry it invented.
It would look like the Shore Temple and it would not BE the Shore Temple, and
this project already declines to render a guess more prettily.

Structure-from-Motion is the other answer. It does not imagine a surface; it
triangulates one, from points seen in two or more real photographs. What comes
out is wrong where the photographs are thin, and it is wrong *visibly* — as
holes, not as invention.

## What is in here

| Tier | Images | What it is | Use |
|---|---|---|---|
| core | ${s.tiers.core} | Full views, remote views, the vimana, the tank | The reconstruction. These see the whole monument from many stations. |
| detail | ${s.tiers.detail} | Sculpture and fabric close-ups, plus the uncategorised root | Adds surface where the core is coarse. Register these after the core solves. |
| context | ${s.tiers.context} | Photographs of people at the temple | Mostly occluded and off-axis. Cheap to include, first to drop if matching stalls. |

**${s.excluded} files were excluded**, each with its reason in \`dataset.json\`.
The largest exclusion is the whole *Historical images* category: 19th-century
prints and engravings predate the modern conservation and the sea wall, so they
record a different surface — and an engraving is a drawing, not a measurement.

## What the files actually carry

Read out of the JPEGs in \`images/\` themselves, not from Commons' database,
because COLMAP reads intrinsics from the files it is handed:

| | |
|---|---|
| Full-resolution originals | ${s.originals} of ${s.selected} (${pct(s.originals)}) |
| Camera make/model | ${s.withCamera} (${pct(s.withCamera)}) |
| Focal length | ${s.withFocalLength} (${pct(s.withFocalLength)}) |
| GPS fix | ${s.withGPS} (${pct(s.withGPS)}) |
| Distinct cameras | ${s.distinctCameras} |

${top.length ? "Most common cameras:\n\n" + top.map(([c, n]) => "- " + c + " — " + n).join("\n") : ""}

### Re-fetch the originals before a real solve

**Wikimedia's thumbnailer strips EXIF.** Checked against six files here, every
original carried the camera model and the Exif sub-IFD holding the focal length,
and every 1920 px rendition had them removed — four of the six had no EXIF
segment left at all.

That is not cosmetic. Given no focal length COLMAP guesses one from the image
width, and a bad initial guess is the usual reason a reconstruction from
unordered internet photographs fails to converge. The linked thumbnails are fine
for browsing and for a cheap trial run; a real solve wants the originals:

\`\`\`bash
WIKI_CONTACT=you@example.com node scripts/build-shore-temple-sfm.js --originals
\`\`\`

That replaces the core tier in \`images/\` with full-resolution files (a few GB —
it prints the total before starting). Add \`--tiers=core,detail\` to take the
close-ups too.

Every image is a different camera at a different time, so **use one camera model
per image** (\`--ImageReader.single_camera 0\`, the default). Sharing intrinsics
across this set would be wrong and would bend the geometry.

### Re-run these two after the originals land

Both read what is actually in \`images/\`, so they are only correct once the
re-fetch has finished:

\`\`\`bash
node scripts/build-shore-temple-geo.js           # geo.txt + camera-stations.geojson
node scripts/build-shore-temple-contactsheet.js  # contact-sheet.html
\`\`\`

The first is what gives the solve its scale (see below). The second is a page
showing every selected photograph, grouped by tier — open it to judge whether the
coverage is really all-round before spending GPU hours on it.

## The recipe

**Option namespaces moved in COLMAP 4.2.0.** The GPU and image-size switches now
live under \`FeatureExtraction.*\` and \`FeatureMatching.*\`; the older
\`SiftExtraction.use_gpu\` / \`SiftMatching.use_gpu\` spellings that most tutorials
still show are rejected outright with "unrecognised option". \`SiftExtraction.*\`
survives, but only for the SIFT parameters themselves. These commands are the
4.2.0 spelling, and they have been run.

\`\`\`bash
cd assets/reference/shore-temple/photogrammetry

colmap feature_extractor \\
  --database_path db.db --image_path images \\
  --ImageReader.camera_model SIMPLE_RADIAL \\
  --ImageReader.single_camera 0 \\
  --FeatureExtraction.use_gpu 1 \\
  --FeatureExtraction.max_image_size 1920

# Exhaustive matching is O(n²) and this is a few hundred images — that is
# tolerable, and it is the right choice here because the photographs arrive in
# no order. Sequential matching assumes a walk-around; a Commons category is not
# one.
colmap exhaustive_matcher --database_path db.db --FeatureMatching.use_gpu 1

mkdir -p sparse && colmap mapper \\
  --database_path db.db --image_path images --output_path sparse

colmap model_analyzer --path sparse/1   # registered images is the number to read
\`\`\`

On CPU (\`use_gpu 0\`) a 120-image pilot took about 40 minutes on an i5-1235U:
7 minutes to extract, 26 to match 7,140 pairs, 4 to map. The full 479-image core
tier is 114,481 pairs — roughly sixteen times the matching — so budget most of a
day and expect memory pressure under 8 GB.

Read \`sparse/0\` before going further: the number of registered images is the
result that matters. If most of the core tier registered into ONE model, the
solve worked. Several disconnected models means the photographs did not overlap
enough, and the fix is more views, not more compute.

Then dense, and a mesh:

\`\`\`bash
colmap image_undistorter --image_path images --input_path sparse/0 --output_path dense
colmap patch_match_stereo --workspace_path dense
colmap stereo_fusion --workspace_path dense --output_path dense/fused.ply
colmap poisson_mesher --input_path dense/fused.ply --output_path mesh.ply
\`\`\`

## The two things that will be wrong

**1. It has no scale.** SfM recovers shape, never size — the result is correct up
to one unknown multiplier. Do not read a height off it until it is scaled.

The scale constraint this project already owns is the **prakara footprint**, the
OSM way at **46.4 × 21.5 m**, cited in \`data/mahabalipuram-footprints.geojson\`.
Fit the reconstruction's compound wall to that rectangle and the multiplier
follows.

That makes the vimana height a **measured output** rather than an assumption —
and it can then be checked against the cited 18 m. If the two agree, G4's real
blocker (no published plan dimensions for the vimana) has been answered by
measurement instead of by guess, and the number carries its own provenance.
If they disagree, that disagreement is itself the finding, and it must be
reported rather than tuned away.

**2. It is a crowd, not a survey.** These photographs span roughly two decades,
dozens of cameras, every season and every hour. Expect: people and scaffolding
fused into the walls, the seaward faces thinner than the landward ones (that is
where visitors stand), the upper vimana thin (nobody is above it), and colour
that averages a hundred different skies. Sun-baked stone with little texture
matches poorly, so flat faces will come out flatter than they are.

None of that is fatal for a massing model at the scale this site renders. All of
it is fatal for a claim of survey accuracy, so do not make one.

## Getting it into the scene

\`js/scene-3d.js\` states the contract for a real mesh:

> origin at the centre of the site, Y-up, 1 unit = 1 metre, +X east, -Z north

Load it in \`js/scene-massing.js\`, alongside the extruded footprints, and keep
the Shore Temple's footprint out of the extrusion once the mesh stands in for it.
Decimate hard first: the site's own budget rejected a change that took one file
from 127 KB to 443 KB, so a raw Poisson mesh at a million triangles is not a
candidate — target a few tens of thousands, Draco or meshopt compressed, which
is what \`assets/vendor/meshopt_decoder.module.js\` is already there for.

## Licence

Every image is CC BY, CC BY-SA, CC0 or public domain — the per-file credits are
in \`../SOURCES.md\`. **A mesh reconstructed from CC BY-SA photographs is a
derivative of them.** Before shipping the result, decide that question
deliberately: it may bind the mesh to CC BY-SA, and the attribution list is
several hundred names long. Building the solve from the public-domain and CC0
subset alone avoids the question entirely, at the cost of most of the coverage.
`;
  fs.writeFileSync(path.join(outDir, "README.md"), md);
}

fs.mkdirSync(outDir, { recursive: true });
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
