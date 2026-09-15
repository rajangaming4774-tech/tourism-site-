# G4, third route: reconstructing the Shore Temple from crowd photographs

Built 2026-09-07/08. Companion to `scans-photogrammetry.md`, which established
that no free scan of this monument exists. This records what was done about that.

## Verdict, up front

**G4 is still open, but it is no longer blocked on finding a source.** It is
blocked on GPU time, which is a thing that can be bought.

`00-baseline-gaps.md` framed G4 as needing published plan dimensions of the
Kshatriyasimhesvara vimana, and `scans-photogrammetry.md` closed off the scan
route: the two real captures of this temple are Sketchfab view-only and their
author has refused to release them. Both assumed the measurement has to come
from somebody else.

It does not have to. **922 freely-licensed photographs of this one monument
exist on Wikimedia Commons**, taken from every side and distance over roughly
two decades. That is a Structure-from-Motion dataset. A solve over it produces
geometry triangulated from the real fabric — which, scaled against a known
ground dimension, yields the vimana's plan and height as *measurements* rather
than as citations found or not found.

The dataset is built and verified. The solve is not run, and cannot be run on
the machine it was built on. See **The blocker** below.

## What was built

`scripts/fetch-shore-temple-photos.js` → `assets/reference/shore-temple/`

| | |
|---|---|
| Files | 922, being all of `Category:Shore Temple` and its seven subcategories |
| Size | 564 MB at 1920 px |
| Licences | CC BY-SA 4.0 ×531, CC BY-SA 3.0 ×254, CC BY 4.0 ×31, CC BY 3.0 ×28, CC BY-SA 2.0 ×26, CC BY 2.0 ×26, public domain ×20, CC0 ×3, CC BY 2.5 ×2, CC BY-SA 2.5 ×1 |
| Non-free found | **None.** Every file in the tree is reusable. |
| Integrity | 922/922 verified complete (JPEG SOI + EOI, or PNG). 15 carry a Samsung SEF trailer after EOI, which is normal and not corruption. |

Per-file author, licence and Commons page: `assets/reference/shore-temple/SOURCES.md`.
Most of this set is **CC BY-SA**, so attribution is a licence condition, not
courtesy — and see **The licensing question** below, which is not a footnote.

`scripts/build-shore-temple-sfm.js` → `.../photogrammetry/`

| Tier | Images | What |
|---|---|---|
| core | 479 | Full views, remote views, the vimana, the temple tank |
| detail | 251 | Sculpture and fabric close-ups, and the uncategorised root |
| context | 129 | People at the temple — occluded, off-axis, first to drop |
| **excluded** | **63** | 13 historical prints, 45 too small to match, 2 composites, a floor plan, a postcard, an information board, a TIFF |

The 13 historical images are excluded on purpose and it is worth saying why:
they predate the modern conservation and the sea wall, so they record a
different surface, and an engraving is a drawing rather than a measurement.
They remain valuable — for change over time — but not in a solve.

## Finding: Wikimedia's thumbnailer strips EXIF

This is the practical discovery of the exercise and it is not documented
anywhere obvious.

Commons renders thumbnails on demand and rewrites EXIF as it does. Checked
directly against six files, **every original carried the camera model and the
Exif sub-IFD holding the focal length; every 1920 px rendition had them
removed** — four of the six retained no EXIF segment at all.

| | 1920 px renditions | full-resolution originals |
|---|---|---|
| Images naming a camera | 79 of 859 (9%) | **642 of 859 (75%)** |
| Images with a focal length | 72 (8%) | **636 (74%)** |
| — core tier | 39 of 479 (8%) | **410 of 479 (86%)** |
| — detail tier | 33 of 251 (13%) | **220 of 251 (88%)** |
| Images with a GPS fix | 26 (3%) | **123 (14%)** |
| Distinct cameras identifiable | 48 | **217** |

(738 of the 859 are full-resolution: the core and detail tiers were re-fetched,
and 8 of the 129 context images were already original because they were smaller
than 1920 px to begin with. The remaining 121 context photographs were left as
renditions — that is the tier to drop first, so re-fetching it was not worth
paying for. Within the two tiers that will actually carry the solve, focal-length
coverage is 86% and 88%.)

COLMAP reads intrinsics from the files it is handed. Given no focal length it
guesses one from the image width, and a bad initial guess is the usual reason a
reconstruction from unordered internet photographs fails to converge. So the
solve must be run on originals, and `build-shore-temple-sfm.js --originals`
re-fetches them.

Two related traps, both cost an hour each:

- **Commons image URLs now carry `?utm_source=…` query parameters.** Harmless
  when fetching an original; fatal when building a thumbnail URL, because the
  filename is a path segment there and the query string ends up buried mid-path.
  `upload.wikimedia.org` answers 400.
- **Only a fixed ladder of thumbnail widths is served** — 960, 1280, 1920, 3840
  verified. Anything else is 400 with "Use thumbnail sizes listed on
  https://w.wiki/GHai". A request for 2000 px looks like a broken URL.

And one that cost several: **Wikimedia's robot policy is enforced through the
User-Agent.** A UA with no contact was answered 429 for nine requests in ten,
even at one request every 1.5 seconds; the same client with a contact address in
the header was served ten in ten. It presents as rate limiting, so the instinct
is to slow down, and slowing down does not help. `WIKI_CONTACT` is now required
by both scripts rather than optional.

## The blocker: this is CUDA work

| | |
|---|---|
| GPU | Intel Iris Xe (integrated) |
| CUDA | **None** |
| CPU | i5-1235U |
| RAM | 7.7 GB |

COLMAP's dense stage — `patch_match_stereo`, which is what actually produces a
surface — **requires CUDA**. It is not slow without it; it does not run. The
same is true of AliceVision/Meshroom's depth-map stage.

What this machine *can* do is the sparse stage: feature extraction, matching and
the mapper, all CPU-capable. Exhaustive matching over 479 images is ~114,000
pairs, which is many hours here and near the RAM limit, but it is possible. And
the sparse result is not a consolation prize — **camera poses plus a sparse
point cloud are already enough to measure the monument.** The vimana's footprint
and height can be read off a scaled sparse cloud. A mesh is what the *scene*
wants; a measurement is what *G4* wants, and the sparse stage delivers that one.

Realistic paths, in order of cost:

1. **A rented CUDA hour.** The full dataset through COLMAP dense on a mid-range
   cloud GPU is a few hours of compute. This is the shortest line to a mesh.
2. **CPU sparse here, dense elsewhere.** Run the mapper locally over days, hand
   `sparse/0` to a GPU only for the dense stage.
3. **OpenMVS for dense on CPU.** `DensifyPointCloud` has a CPU path. On this
   laptop, expect days, and 7.7 GB of RAM is the real constraint rather than
   patience.

## Scale: the part that is easy to get wrong

An SfM solve recovers shape and **never size**. The result is correct up to one
unknown multiplier, and no dimension may be read off it until that multiplier is
fixed. This is the specific way a photogrammetric answer to G4 could be wrong
while looking completely convincing.

Two independent constraints are available, and the point of having two is that
they check each other:

**1. The prakara footprint.** OSM's way for the compound wall, already cited in
`data/mahabalipuram-footprints.geojson`, is 46.4 × 21.5 m. Fitting the
reconstruction's compound wall to that rectangle fixes the multiplier against a
measured ground truth this project already stands behind.

**2. EXIF GPS.** `scripts/build-shore-temple-geo.js` extracts camera positions
from GPS EXIF and writes `photogrammetry/geo.txt` in the format
`colmap model_aligner` consumes, plus a GeoJSON for inspection. Consumer GPS is
good to perhaps 5–10 m and these are visitors' phones, so a single fix is
worthless for scaling a 46 m compound — but the errors are largely independent,
so a robust fit over many of them is not.

Measured, over the 738 full-resolution originals now on disk:

| | |
|---|---|
| Stations with a usable fix | **123** |
| Rejected as further than 1.5 km | 3 |
| Median distance from the temple | 31 m (range 2–1319 m) |

Distribution around the monument, which is the more interesting number:

| N | NE | E | SE | S | SW | W | NW |
|---|---|---|---|---|---|---|---|
| 23 | 9 | **33** | **6** | 9 | 9 | 17 | 17 |

East is the seaward side and the busiest; the **south-east and north-east are
thin**, and the whole southern half is under-represented. Read that as a hint
rather than a measurement — it describes only the 123 photographs that recorded
a position, not all 859 — but it is the cheapest available warning about which
face of the vimana will come out worst, and it is worth checking against the
contact sheet before committing GPU time. If the south-east really is that thin,
the honest outcome is a hole in the model on that side, not a filled-in guess.

If the two disagree by more than a few per cent, **that disagreement is the
finding** and belongs in this file, not averaged away. If they agree, the vimana
height that falls out can be checked against the cited 18 m, and G4 closes on a
measurement carrying its own provenance.

## The licensing question, which must be answered before anything ships

A mesh reconstructed from CC BY-SA photographs is plausibly a **derivative** of
them. If it is, ShareAlike binds the mesh — and the site that embeds it — to
CC BY-SA, with an attribution list several hundred names long.

This has not been resolved and should not be resolved by assumption. Three
honest options:

1. **Solve from the public-domain and CC0 subset only** (23 files). Avoids the
   question entirely; almost certainly too sparse to converge.
2. **Accept CC BY-SA on the mesh**, and render the credits. The list exists
   already in `SOURCES.md`.
3. **Get an opinion** on whether measurement extracted from a photograph is a
   derivative of it. There is a real argument that geometry is fact rather than
   expression, and facts are not copyrightable — but this project does not get to
   assert its preferred reading of that without saying it is doing so.

Nothing here is deployed: `assets/reference/` is excluded from Vercel by
`.vercelignore` and its pixels from git by `.gitignore`, with the manifest,
credits and dataset metadata still tracked.

## Status of the gap

| | |
|---|---|
| **G4 before** | Open. Blocked on published plan dimensions no source isolates. |
| **G4 now** | Open. Unblocked as research: the raw material to measure it directly is on disk, selected and verified. Blocked on CUDA. |

`Longhurst 1930, Part III (Memoir 40)` remains the outstanding documentary lead
per this folder's index — its archive.org scan has corrupt OCR and no text layer.
A photogrammetric measurement and a 1930 survey plate would corroborate each
other, and neither makes the other unnecessary.

## What was in the map from 2026-09-08 to 2026-09-13 — superseded

**Superseded by `06-shore-temple-rebuild.md`**: the massing model described below was
replaced on 2026-09-13 by an architectural reconstruction built to the same cited 18 m
and to the committed OSM ring (whose 49.0 x 31.4 m figure below turned out to be the
axis-aligned box of a 46.3 x 21.6 m rectangle at bearing 105°). The section is kept as
the record of the first build.

`assets/models/shore-temple.glb` — a massing reconstruction built in Blender via
3D Jutsu, swapped in for `ShoreTemple_root` by `replaceShoreTemple()` in
`js/scene-3d.js`. 4,556 triangles, 3 draw calls, 49 KB gzipped.

Measured inputs, and only these:

| | |
|---|---|
| Prakara ring | OSM way 370135158 via Overpass, 49.0 x 31.4 m |
| Tall vimana height | **exactly 18.0 m**, the project's cited figure, asserted at build time |
| Storeys | five (aditala + four talas), cited |

Everything else — tier setbacks, the second shrine's 11 m, the mandapa, where
the shrines sit inside the compound — is read off a near-square-on elevation
photograph (`front-view-mahabalipuram.jpg`) and scaled by that 18 m. The three
ratios that decide whether a Dravidian tower reads correctly were measured
rather than invented: dome 0.25 of the tower base, top tala 0.36, griva 0.18.

**It carries no carving, and it cannot.** Pilasters, panels, dvarapalas, the
seated lions, 1,300 years of salt weathering: none of that comes out of a
script. A visitor asking for the real surface is asking for the photogrammetry
above. The massing model is what stands in the map until that solve is run, and
it should be replaced by the result, not defended against it.

Two bugs worth recording, both caught by measuring rather than by looking:

1. **It shipped floating.** `bmesh.ops.solidify` on the platform extruded along
   a face normal that wound the opposite way to the assumption, so the platform
   occupied 1.25-2.50 m and nothing occupied 0-1.25. Invisible in an isolated
   render; obvious the moment it stood on a DEM (`base_m` 5.54 against
   `ground_m` 4.29). The build now asserts min z == 0.
2. **The cited height was 4% over.** The kalasha spike is positioned from the
   bulb and given its own length, so it finished above the height the schedule
   allotted it, and the builder's return value never saw it. Each tower is now
   measured after building and scaled uniformly about its base so the apex lands
   exactly on the cited figure. The build asserts that too.

## The pilot solve was run, on CPU, and it worked (2026-09-08)

COLMAP 4.2.0 no-CUDA, entirely on the i5-1235U. 120 core images, all
full-resolution originals with a focal length, 68 of them GPS-tagged.

| Stage | Result | Time |
|---|---|---|
| Feature extraction | 120/120, median 8,144 features | ~7 min |
| Exhaustive matching | 1,162 of 7,140 pairs verified (16.3%); 113 images in at least one pair | ~26 min |
| Mapper | **84 images registered into ONE model** | ~4 min |

The model: 7,821 points, 41,099 observations, mean track length 5.25, **mean
reprojection error 0.90 px**. A second model appeared with 2 images and 97
points — ordinary debris, ignore it.

**This answers the question the dataset was built to ask.** Crowd-sourced
Commons photographs of this monument do register into a single connected
reconstruction, at sub-pixel reprojection error, on a laptop CPU. The full
479-image core tier is sixteen times the matching work, not a different problem.

### The GPS scale route is dead

`geo.txt` was tested against the solved model with `model_aligner
--alignment_type ecef`. 48 of the 84 registered images carry a fix — ample for a
7-parameter fit, so this is not a conditioning failure:

> Alignment error: 60.76 (mean), 41.28 (median)

**41 m median residual on a monument 49 m across.** The alignment reports
success and the number is worthless: the scatter is the size of the thing being
measured. Visitors' phones beside a large granite mass on a coast, many of them
geotagged approximately, are not a survey network.

So of the two scale constraints this file proposed, the second has now failed
its own test and is withdrawn. **Scale must come from the OSM prakara footprint**
— and that is now the single point on which a measured vimana height depends,
with nothing left to cross-check it against. That is a weaker position than this
file previously claimed, and it should be recorded as such rather than quietly
dropped.

For what little it is worth: the reconstruction's robust horizontal aspect ratio
is 1.73 against the prakara's 1.56. The same ballpark, which is mild evidence the
shape is not deranged — but the point cloud contains ground, visitors and
surroundings as well as the compound, so its extent is **not** the prakara's
extent and this is not a measurement. Fitting the actual wall is the next step.

### Reproducing it

Workspace, database, models and `pilot-sparse.ply` are in this session's
scratchpad, not the repo — a 142 MB COLMAP database has no business in an
OneDrive-synced project directory. The commands are in the photogrammetry
README, in the 4.2.0 option spelling: the `SiftExtraction.use_gpu` /
`SiftMatching.use_gpu` flags that nearly every tutorial still shows are rejected
outright by 4.2.0, which moved them to `FeatureExtraction.*` and
`FeatureMatching.*`.

## Stone colour, measured (2026-09-08)

The model's three granite tones were originally picked by eye. They are now
derived from the photographs by `scripts/measure-shore-temple-colour.ps1`:
145 core-tier full-resolution originals, every pixel classified as stone —
sky, vegetation, clothing, blown highlights and blacks rejected on rules about
what those things ARE, not about the colour wanted — then a median per
photograph and a median across photographs.

| | |
|---|---|
| Photographs used | 145 of 150 sampled |
| Median stone pixel | sRGB **123, 108, 92** = **#7B6C5C** |
| Brightness spread | p10 = 60, p90 = 191 |

### What this does and does not measure

**Measured: the chromaticity.** A photographed pixel is albedo multiplied by
illumination, so no photograph yields reflectance. Across 145 of them spanning
years, cameras, hours and skies, the lighting varies around neutral and the
median cancels it. The spread above is the proof this is the right way round —
the stone's apparent brightness ranges more than three to one across the set
while its hue barely moves.

**Not measured: absolute brightness.** The albedo levels below are CHOSEN, from
published reflectance for granite (roughly 0.20–0.35), taking the weathered
coastal end. Three levels, one hue, so the storeys read apart at map scale.

### The trap worth recording

Chromaticity had to be taken in **linear** space. sRGB compresses the darks, so
the two disagree badly:

| | R | G | B |
|---|---|---|---|
| ratio from sRGB values | 1.142 | 1.003 | 0.854 |
| ratio in linear space | **1.306** | **0.989** | **0.706** |

glTF `baseColorFactor` and Blender's Base Color are both linear. The old
eyeballed values happened to sit near the sRGB ratio, which is exactly why the
stone had been rendering too grey and too cold.

Shipped in `assets/models/shore-temple.glb`:

| Material | linear baseColorFactor | as sRGB | albedo Y |
|---|---|---|---|
| `granite_dark` | 0.2522, 0.1909, 0.1363 | #8A7967 | 0.200 |
| `granite` | 0.3152, 0.2387, 0.1703 | #988673 | 0.250 |
| `granite_light` | 0.3720, 0.2816, 0.2010 | #A4917C | 0.295 |

Roughness 0.94 and specular 0.16 throughout: salt and lichen kill what little
sheen fresh-cut granite has.

Per-photograph measurements are kept in `shore-temple-stone-colour.json` beside
this file, so the medians can be recomputed or the classifier's thresholds
argued with.

**One number to turn.** If the stone reads too pale in the scene, it is the
albedo luminance and not the hue: scale all three triples together and the
measured colour is preserved. The hue is evidence; the level is a judgement.
