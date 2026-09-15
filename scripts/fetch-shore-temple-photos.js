#!/usr/bin/env node
/* Reference photographs of the Shore Temple, Mamallapuram.
 *
 * WHAT THIS IS
 * ------------
 * The Descent of the Ganges relief already has reference plates under
 * assets/reference/penance/ so the carving can be built from evidence rather
 * than invention. This does the same job for the Shore Temple: it pulls every
 * freely-licensed photograph Wikimedia Commons holds of the monument, at the
 * largest sensible size, together with the author and licence of each one.
 *
 * These are REFERENCE MATERIAL, not shipped assets. Nothing under
 * assets/reference/ is loaded by the site. Anything that ever does ship must
 * carry the credit line this script records in SOURCES.md — most of these are
 * CC BY-SA, where attribution is a licence condition, not courtesy.
 *
 * WHAT IS COLLECTED
 * -----------------
 * Category:Shore Temple and its subcategories, one level down (full views,
 * remote views, the vimana, the sculptures, the temple tank, people, and the
 * historical images). Commons categorisation is human and imperfect: a few
 * files in the tree are of other monuments entirely. They are fetched anyway
 * and listed in SOURCES.md with the category that placed them there, because
 * a silent drop based on a filename is still a guess.
 *
 * SIZE CAP
 * --------
 * Originals run past 80 megapixels. Anything wider than MAX_WIDTH is fetched
 * through the Commons thumbnailer instead. Nothing is lost that matters: the
 * full-resolution original stays one URL away, recorded per file in
 * SOURCES.md, if a plate ever needs re-pulling at native size.
 *
 * Usage:  node scripts/fetch-shore-temple-photos.js [--survey] [--max-width=N]
 * Output: assets/reference/shore-temple/  (images, manifest.json, SOURCES.md)
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
/* --category and --out point the same fetcher at another monument; defaults
 * keep the original Shore Temple behaviour. --max-files caps a large category
 * (the Pancha Rathas tree is several hundred files and a handful of square-on
 * views is all a proportion reading needs; the manifest still lists everything
 * enumerated so the choice is visible). */
const argOf = (name, dflt) => (process.argv.find((a) => a.startsWith(name + "=")) || "").split("=").slice(1).join("=") || dflt;
const outDir = path.join(root, "assets", "reference", argOf("--out", "shore-temple"));
const CACHE = path.join(__dirname, "." + argOf("--out", "shore-temple") + "-cache.json");

const API = "https://commons.wikimedia.org/w/api.php";

/* REQUIRED. Wikimedia's robot policy wants a User-Agent that says who to contact
 * when a script misbehaves, and it enforces that: measured on this category, a
 * vague UA was answered 429 for nine requests in ten, while the same client with
 * a contact in the header was served ten in ten. The failure does not look like
 * a policy failure — it looks like rate limiting — so it is easy to spend an
 * afternoon tuning delays that were never the problem.
 *
 * Supply a real address or project URL you actually read:
 *   WIKI_CONTACT=you@example.com node scripts/fetch-shore-temple-photos.js
 */
const CONTACT = process.env.WIKI_CONTACT || "";
if (!CONTACT) {
  console.error(
    [
      "Set WIKI_CONTACT to an email address or project URL first.",
      "",
      "Wikimedia's robot policy requires a contact in the User-Agent and throttles",
      "requests without one to roughly one file every sixteen seconds.",
      "",
      "  WIKI_CONTACT=you@example.com node scripts/fetch-shore-temple-photos.js",
    ].join("\n")
  );
  process.exit(1);
}
const UA = "india-heritage-map/1.0 (" + CONTACT + ") node/" + process.versions.node;

const ROOT_CAT = "Category:" + argOf("--category", "Shore Temple");
const MAX_FILES = Number(argOf("--max-files", "0")) || 0;
const SURVEY = process.argv.includes("--survey");

/* Wikimedia no longer renders a thumbnail at any width you ask for. Since 2025
 * only a fixed ladder of sizes is served and everything else is answered
 *   400 "Use thumbnail sizes listed on https://w.wiki/GHai"
 * — which is easy to mistake for a broken URL, because that is what it looks
 * like. These four are the ones verified against upload.wikimedia.org for this
 * category; a request between two rungs is snapped DOWN to the rung below so a
 * cap is never quietly exceeded. */
const THUMB_WIDTHS = [960, 1280, 1920, 3840];

const asked = Number(
  (process.argv.find((a) => a.startsWith("--max-width=")) || "").split("=")[1] || 1920
);
const MAX_WIDTH =
  [...THUMB_WIDTHS].reverse().find((w) => w <= asked) || THUMB_WIDTHS[0];
if (MAX_WIDTH !== asked) {
  console.log("--max-width " + asked + " is not a served size; using " + MAX_WIDTH);
}

// Commons is a free-media repository but does host a few tagged-non-free
// files. Refuse anything whose licence does not clearly permit reuse.
// `cc` unanchored to a separator on purpose: CC0 has no separator.
const FREE = /^(cc|public domain|pd-|no restrictions|attribution|fal|gfdl)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 429 is the one this hits in practice — Commons rate-limits an anonymous
 * client well before 900 files are enumerated — so it must be retried with a
 * growing pause, not treated as a hard 4xx failure. */
const RETRYABLE = (status) => status === 429 || status >= 500;

/* Commons meters an anonymous client over a rolling window, and enumerating
 * ~950 files with metadata exhausts it partway through. The window is minutes
 * wide, not seconds, so the backoff has to climb into minutes too — a 30-second
 * ceiling just fails six times in a row and throws away the run. */
const BACKOFF_MS = [2e3, 10e3, 30e3, 60e3, 120e3, 240e3, 300e3, 300e3];

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
  for (let attempt = 0; ; attempt++) {
    let wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) return await res.json();
      if (!RETRYABLE(res.status)) throw new Error(res.status + " " + res.statusText);
      const ra = Number(res.headers.get("retry-after"));
      if (ra > 0) wait = Math.max(wait, ra * 1000);
      if (attempt >= BACKOFF_MS.length) throw new Error(res.status + " " + res.statusText);
      console.log("  " + res.status + ", waiting " + Math.round(wait / 1000) + "s");
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
    }
    await sleep(wait);
  }
}

async function members(cat, type) {
  const out = [];
  let cont;
  do {
    const d = await api({
      action: "query",
      list: "categorymembers",
      cmtitle: cat,
      cmtype: type,
      cmlimit: "500",
      ...(cont ? { cmcontinue: cont } : {}),
    });
    out.push(...((d.query && d.query.categorymembers) || []).map((m) => m.title));
    cont = d.continue && d.continue.cmcontinue;
  } while (cont);
  return out;
}

/* Walks one category and returns [title, imageinfo] for every file in it.
 *
 * This uses categorymembers as a GENERATOR rather than listing the category and
 * then asking about the titles separately. Listing first costs two passes over
 * ~950 files, and Commons answers the second one with 429 for an anonymous
 * client. As a generator it is a single pass, 50 files per request, and the
 * whole tree fits in about twenty calls. */
async function catFiles(cat) {
  const out = [];
  let cont = {};
  do {
    const d = await api({
      action: "query",
      generator: "categorymembers",
      gcmtitle: cat,
      gcmtype: "file",
      gcmlimit: "50",
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata|user",
      iiextmetadatafilter:
        "LicenseShortName|Artist|Credit|DateTimeOriginal|ImageDescription|UsageTerms|LicenseUrl",
      ...cont,
    });
    for (const p of Object.values((d.query && d.query.pages) || {})) {
      const ii = p.imageinfo && p.imageinfo[0];
      if (ii) out.push([p.title, ii]);
    }
    cont = d.continue || null;
    await sleep(400);
  } while (cont);
  return out;
}

const text = (v) =>
  v == null
    ? ""
    : String(v.value != null ? v.value : v)
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim();

/* "File:Mahabalipuram Shore Temple 23.07.2025.jpg" -> a safe, sortable name. */
function localName(title) {
  return title
    .replace(/^File:/, "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 7);

/* Assigns every row its local filename, over the whole set at once.
 *
 * Two different Commons titles routinely sanitise to one local name — "Mahabalipuram
 * Shore Temple.jpg", "Mahabalipuram shore temple.JPG", "Mahabalipuram-Shore Temple.jpg"
 * and two more all reduce to mahabalipuram-shore-temple.jpg — and a title written
 * wholly in Tamil or Malayalam, of which this category has several, reduces to
 * nothing at all.
 *
 * Left alone that overwrites SILENTLY, and the silence is the dangerous part: the
 * first full run reported "922 files, 0 failed" with 843 images on disk, because
 * each collision looked like a successful download of a file that was then
 * replaced by the next one.
 *
 * Every member of a colliding group takes a hash suffix, not just the second and
 * later ones, so that a photograph added to the category next year cannot rename
 * files that are already on disk and already cited in SOURCES.md. */
function assignNames(rows) {
  const groups = new Map();
  for (const r of rows) {
    const b = localName(r.title);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(r);
  }
  for (const [b, group] of groups) {
    const dot = b.lastIndexOf(".");
    const ext = dot > 0 ? b.slice(dot) : "";
    const stem = dot > 0 ? b.slice(0, dot) : b;
    const degenerate = !/[a-z0-9]/.test(stem);
    for (const r of group) {
      r.file =
        group.length === 1 && !degenerate
          ? b
          : (degenerate ? "commons" : stem) + "-" + hash(r.title) + ext;
    }
  }
}

/* imageinfo returns the file URL with analytics query parameters bolted on
 * (?utm_source=commons.wikimedia.org&...). They are harmless when fetching the
 * original, and poison when building a thumbnail URL: the filename is a PATH
 * segment there, so the query string ends up buried mid-path and upload.
 * wikimedia.org answers 400. Strip it before doing anything with the URL. */
const clean = (url) => url.split("?")[0];

/* Commons thumbnailer URL for an oversized original. Formats a browser cannot
 * display inline (TIFF and friends) come back rendered to JPEG, and the
 * thumbnailer signals that by appending .jpg to the name — so the local file
 * has to take the same extension or it lies about its own contents. */
function scaled(rawUrl, mime, width) {
  const url = clean(rawUrl);
  const file = url.slice(url.lastIndexOf("/") + 1);
  const asJpeg = mime !== "image/jpeg" && mime !== "image/png";
  return {
    url: url.replace("/commons/", "/commons/thumb/") + "/" + width + "px-" + file + (asJpeg ? ".jpg" : ""),
    ext: asJpeg ? ".jpg" : "",
  };
}

/* upload.wikimedia.org answers with
 *   429 "Your request does not comply with our robot policy"
 * and it means exactly what it says: the client was not identified. Measured on
 * this category, a UA with no contact was refused nine requests in ten even at
 * one request every 1.5 seconds, while the same client with a contact in the
 * header was served ten in ten. Slowing down does not fix it — CONTACT does.
 *
 * These values are for a client that IS identified: modest, and enough to move
 * nine hundred files in a few minutes rather than a few hours. */
const PACE_MS = 400;
const WORKERS = 3;

async function download(url, dest) {
  for (let attempt = 0; attempt < BACKOFF_MS.length; attempt++) {
    try {
      // Without a deadline a stalled thumbnail render hangs a worker forever,
      // and four hung workers look exactly like a finished run.
      const res = await fetch(url, {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(dest, buf);
        return buf.length;
      }
      if (!RETRYABLE(res.status) || attempt === BACKOFF_MS.length - 1) {
        throw new Error(res.status + " " + res.statusText);
      }
    } catch (e) {
      if (attempt === BACKOFF_MS.length - 1) throw e;
    }
    await sleep(BACKOFF_MS[attempt]);
  }
  throw new Error("unreachable");
}

/* A fixed pool of workers over one shared cursor. Commons tolerates a handful
 * of parallel reads from one client; 900 sequential round trips it would
 * tolerate too, but not in a time anyone waits through. */
async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    })
  );
}

/* The credit record. Most of this set is CC BY-SA: attribution is a licence
 * CONDITION, not courtesy, and a photograph used without the line below is used
 * in breach. So the table carries author, licence and the Commons file page for
 * every single file, and it is generated rather than written by hand because a
 * hand-kept list of 900 credits drifts out of date the first time this re-runs. */
function writeSources(rows, failed) {
  const cell = (s) => String(s || "—").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

  const byLicence = {};
  for (const r of rows) byLicence[r.licence] = (byLicence[r.licence] || 0) + 1;
  const scaledCount = rows.filter((r) => r.scaled).length;
  const mb = (rows.reduce((a, r) => a + r.bytes, 0) / 1e6).toFixed(0);

  const out = [];
  out.push("# Reference photographs: the Shore Temple, Mamallapuram\n");
  out.push(
    "**These are reference material, not shipped assets.** Nothing in this folder is",
    "loaded by the site. They are here so the Shore Temple can be modelled, textured and",
    "described from evidence rather than from memory — the same reason",
    "`assets/reference/penance/` exists.\n"
  );
  out.push(
    "Generated by `scripts/fetch-shore-temple-photos.js`. Re-run it to refresh; it skips",
    "files already on disk, so a re-run costs only what is new.\n"
  );
  out.push("## What is here\n");
  out.push(
    "| | |",
    "|---|---|",
    "| Files | " + rows.length + " |",
    "| On disk | " + mb + " MB |",
    "| Fetched | " + new Date().toISOString().slice(0, 10) + " |",
    "| Source | Wikimedia Commons, [" + ROOT_CAT + "](https://commons.wikimedia.org/wiki/" + ROOT_CAT.replace(/ /g, "_") + ") and its subcategories" + (MAX_FILES ? " (capped at " + MAX_FILES + " files by --max-files)" : "") + " |",
    "| Longest edge | capped at " + MAX_WIDTH + " px (" + scaledCount + " files were larger and were fetched through the Commons thumbnailer) |\n"
  );
  out.push("Licences present:\n");
  for (const [l, n] of Object.entries(byLicence).sort((a, b) => b[1] - a[1])) {
    out.push("- **" + l + "** — " + n + " files");
  }
  out.push("");
  out.push("## The obligation this folder carries\n");
  out.push(
    "Only the public-domain and CC0 files are free of conditions. Everything under a",
    "**CC BY** or **CC BY-SA** licence must, if it is published in any form, carry the",
    "author's name, the licence name, and a link to the licence — and a BY-SA image",
    "additionally requires that whatever incorporates it is released under the same",
    "licence. That last point matters before any of these is baked into a texture or a",
    "composite: doing so can bind the result to CC BY-SA. Prefer the public-domain",
    "plates for anything that ships, and use the rest for looking at.\n",
    "The per-file credit lines are below. They are the record; do not publish from this",
    "folder without them.\n"
  );
  out.push("## Honest limits\n");
  out.push(
    "1. **Commons categorisation is human.** A handful of files in this tree are of",
    "   other monuments, or of the beach and the stalls rather than the temple. They are",
    "   kept and listed with the category that placed them there rather than dropped on",
    "   a filename guess. Check the picture before trusting the label.",
    "2. **These are snapshots, not surveys.** Almost all are oblique, hand-held, in hard",
    "   coastal sun. They record appearance, weathering and setting well; they are not",
    "   measured, and nothing dimensional should be taken off them. The measurements the",
    "   project uses live in `data/research/`.",
    "3. **The 2020s dominate.** Only the 13 files from *Historical images of the Shore",
    "   Temple* show the monument before its modern conservation, the sea wall and the",
    "   planted windbreak. For change over time, those are the ones that carry it.\n"
  );

  out.push("## Every file\n");
  out.push("| File | Author | Licence | Commons page | Original |");
  out.push("|---|---|---|---|---|");
  for (const r of rows) {
    out.push(
      "| `" +
        r.file +
        "` | " +
        cell(short(r.author, 60)) +
        " | " +
        cell(r.licence) +
        " | [page](" +
        r.page +
        ") | " +
        r.width +
        "×" +
        r.height +
        (r.scaled ? " ([full](" + r.originalUrl + "))" : "") +
        " |"
    );
  }
  out.push("");

  if (failed.length) {
    out.push("## Not downloaded\n");
    for (const f of failed) out.push("- " + f.title + " — " + f.error);
    out.push("");
  }

  fs.writeFileSync(path.join(outDir, "SOURCES.md"), out.join("\n"));
}

(async function main() {
  const subcats = await members(ROOT_CAT, "subcat");
  const cats = [ROOT_CAT, ...subcats];

  /* Cached per category so a rate-limit stall costs the current category, not
   * the whole enumeration. Delete the file to force a fresh listing. */
  const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

  const seen = new Map(); // title -> categories it was found under
  const info = new Map(); // title -> imageinfo
  for (const cat of cats) {
    if (!cache[cat]) {
      cache[cat] = await catFiles(cat);
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    }
    for (const [t, ii] of cache[cat]) {
      if (!seen.has(t)) seen.set(t, []);
      seen.get(t).push(cat.replace(/^Category:/, ""));
      info.set(t, ii);
    }
    console.log("  " + cache[cat].length + "  " + cat);
  }

  const titles = [...seen.keys()].sort();
  console.log(cats.length + " categories -> " + titles.length + " distinct files");

  const rows = [];
  let bytes = 0;
  for (const t of titles) {
    const ii = info.get(t);
    if (!ii) continue;
    const m = ii.extmetadata || {};
    const licence = text(m.LicenseShortName) || text(m.UsageTerms);
    rows.push({
      title: t,
      file: null, // assigned over the whole set below
      cats: seen.get(t),
      width: ii.width,
      height: ii.height,
      mime: ii.mime,
      originalBytes: ii.size,
      originalUrl: clean(ii.url),
      page: ii.descriptionurl,
      licence,
      licenceUrl: text(m.LicenseUrl),
      author: text(m.Artist) || ii.user || "",
      credit: text(m.Credit),
      date: text(m.DateTimeOriginal),
      desc: text(m.ImageDescription),
      free: FREE.test(licence),
    });
    bytes += ii.size || 0;
  }

  assignNames(rows);

  if (SURVEY) {
    const nonfree = rows.filter((r) => !r.free);
    console.log("total original bytes: " + (bytes / 1e6).toFixed(0) + " MB");
    console.log("non-free / unclear licence: " + nonfree.length);
    for (const r of nonfree) console.log("  " + r.title + " -- " + (r.licence || "(none)"));
    const lic = {};
    for (const r of rows) lic[r.licence || "(none)"] = (lic[r.licence || "(none)"] || 0) + 1;
    console.log("licences:", lic);
    const byMime = {};
    for (const r of rows) byMime[r.mime] = (byMime[r.mime] || 0) + 1;
    console.log("mime:", byMime);
    console.log("over " + MAX_WIDTH + "px wide: " + rows.filter((r) => r.width > MAX_WIDTH).length);
    fs.writeFileSync(
      path.join(root, "scripts", ".shore-temple-survey.json"),
      JSON.stringify(rows, null, 2)
    );
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  let free = rows.filter((r) => r.free);
  if (MAX_FILES && free.length > MAX_FILES) {
    /* Largest originals first: the square-on architectural views in these
     * categories are overwhelmingly the high-resolution uploads, and a
     * proportion reading wants pixels. Stated in the manifest. */
    free = [...free].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, MAX_FILES);
    console.log("--max-files " + MAX_FILES + ": keeping the " + MAX_FILES + " largest of " + rows.filter((r) => r.free).length + " free files");
  }
  for (const r of rows) {
    if (!r.free) console.log("SKIP (licence: " + (r.licence || "none") + ") " + r.title);
  }

  const kept = [];
  const failed = [];
  let done = 0;

  /* Written as the run goes, not only at the end. Nine hundred files over a
   * throttled connection is long enough that the run WILL be interrupted at
   * some point, and a manifest that only exists on clean exit means every
   * interruption throws away the record of what is already on disk — while the
   * images themselves survive. Checkpointing keeps the two in step. */
  const checkpoint = () => {
    const sorted = [...kept].sort((a, b) => a.file.localeCompare(b.file));
    writeSources(sorted, failed);
    fs.writeFileSync(
      path.join(outDir, "manifest.json"),
      JSON.stringify(
        {
          fetched: new Date().toISOString().slice(0, 10),
          source: "Wikimedia Commons, " + ROOT_CAT + " and its subcategories",
          maxWidth: MAX_WIDTH,
          expected: free.length,
          count: sorted.length,
          complete: sorted.length + failed.length === free.length,
          failed,
          files: sorted,
        },
        null,
        2
      )
    );
  };

  await pool(free, WORKERS, async (r) => {
    const over = r.width > MAX_WIDTH;
    const s = over ? scaled(r.originalUrl, r.mime, MAX_WIDTH) : { url: r.originalUrl, ext: "" };
    r.file += s.ext;
    const dest = path.join(outDir, r.file);
    try {
      r.bytes =
        fs.existsSync(dest) && fs.statSync(dest).size > 0
          ? fs.statSync(dest).size
          : await download(s.url, dest);
      r.scaled = over;
      r.localWidth = over ? MAX_WIDTH : r.width;
      r.localHeight = over ? Math.round((r.height * MAX_WIDTH) / r.width) : r.height;
      kept.push(r);
    } catch (e) {
      failed.push({ title: r.title, error: e.message });
      console.log("FAIL " + r.title + ": " + e.message);
    }
    if (++done % 25 === 0) {
      console.log(done + "/" + free.length);
      checkpoint();
    }
    await sleep(PACE_MS);
  });

  kept.sort((a, b) => a.file.localeCompare(b.file));
  checkpoint();

  /* Only on a complete run: anything in here that the manifest does not claim is
   * a leftover from an earlier naming scheme, and leaving it would put images in
   * the folder that SOURCES.md carries no credit for. Never on a partial run —
   * there, the unclaimed files are the ones not fetched yet. */
  if (kept.length + failed.length === free.length) {
    const claimed = new Set([...kept.map((r) => r.file), "manifest.json", "SOURCES.md"]);
    let removed = 0;
    for (const name of fs.readdirSync(outDir)) {
      const p = path.join(outDir, name);
      if (claimed.has(name) || fs.statSync(p).isDirectory()) continue;
      fs.unlinkSync(p);
      removed++;
    }
    if (removed) console.log(removed + " uncredited leftover files removed");
  }

  console.log(
    "\n" +
      kept.length +
      " files, " +
      (kept.reduce((a, r) => a + r.bytes, 0) / 1e6).toFixed(0) +
      " MB -> " +
      outDir +
      (failed.length ? "\n" + failed.length + " failed" : "")
  );
})();
