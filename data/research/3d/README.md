# Mahabalipuram 3D research — findings index

Six parallel research passes, 2026-09-07, aimed at the gaps this project already
declares about itself (`00-baseline-gaps.md`). Every finding below was checked
against the codebase or re-verified first-hand before being recorded here.

## Scorecard against the gap list

| Gap | Status | Result |
|---|---|---|
| **G1** Relief has no carving | **Partly open** | Two independent high-poly captures exist, both view-only. No open scan, no confirmed full-panel plate. Path is outreach, not download. |
| **G2** No PBR textures | **Closed** | ambientCG `Granite004A` (CC0), measured at ≈109 KB for 3 maps at 512px. |
| **G3** Nakula-Sahadeva dimensions | **CLOSED** | 18 × 11 ft, ~16 ft high — Fergusson & Burgess 1880 p. 135. |
| **G4** Shore Temple vimana footprint | **Open, proven feasible** | A 120-image CPU pilot solve registered **84 images into one model at 0.90 px**. The photographs reconstruct. Scale is the remaining problem: EXIF GPS failed its test at 41 m median error, leaving the OSM prakara as the only constraint. See `05-`. |
| **G5** Wikipedia-only citations | **Largely closed** | Primary 1880/1928 surveys now supply most dimensions. |
| **G6** Ratha order unsourced | **CLOSED** | Fergusson & Burgess 1880 p. 113. The model was already right. |
| **G7** 30 m terrain | **Closed** | Copernicus GLO-30, key-free, verified HTTP 200. |
| **G8** Nominal building heights | **Confirmed** | Independent Overpass run reproduced 1-of-N. |
| **G9** Missing/shared polygons | **Quantified** | 28 historic features, 14 nodes-only, **0 with any height**. |

## Files

| File | What it holds |
|---|---|
| `00-baseline-gaps.md` | The gap list, written before research, as the grading rubric |
| `01-relief-plate-spec.md` | Exact spec an orthophoto must meet to drop into the existing UVs |
| `02-relief-dimensions-audit.md` | Where 29.26 × 13.10 m actually comes from, and a claim I had to overturn |
| `03-rathas-resolved.md` | G3 and G6 closed from the 1880 survey; cave/mandapa dimensions |
| `05-shore-temple-photogrammetry.md` | G4's third route: the 922-photo SfM dataset, what Commons' thumbnailer does to EXIF, and the scale problem |
| `scans-photogrammetry.md/.json` | 23 records — every 3D capture found, SCAN vs RECONSTRUCTION labelled |
| `imagery-plates.md/.json` | 31 records — open-licence imagery and historic plates |
| `geospatial.md/.json` | 23 records — DEMs, imagery, bathymetry, live OSM counts |
| `assets-and-tech.md/.json` | 30 records — CC0 textures, HDRIs, measured compression results |
| `reference-sites.md/.json` | 23 records — heritage 3D precedent and technique |

`scholarly-dimensions.md/.json` was not written — that agent stalled after
fanning out, but all four of its children reported and their findings are folded
into `02-` and `03-` above.

## The four findings that matter most

### 1. Two independent scans of the relief exist. Neither is downloadable.

| | Jules Morel | Théo Derory |
|---|---|---|
| Captured | 2016-10-31 | 2022-12-19 |
| Triangles | 2,195,220 | 1,500,000 |
| Downloadable | No | No |
| Licence | None listed | None listed |

Verified via the Sketchfab API. Morel specialises in surface reconstruction from
3D points. **G1 closes by email, not by download.**

No institution has documented the site: CyArk (~140 projects — India is
Elephanta and the Gateway of India only), Open Heritage 3D (62 projects, zero
India), Google/CyArk Open Heritage (26 sites, none in India). Google Arts &
Culture has Shore Temple pages, but they are **Street-View panoramas, not 3D**.

Downloadable today: three Harex-Studio mobile-LiDAR fragments, **CC BY-NC**
(15,313 / 4,176 / 27,624 tris). Smithsonian's `3d.si.edu` was blocked by a
Cloudflare check and remains genuinely unchecked.

### 2. Nakula-Sahadeva and the ratha order — both closed from 1880

> "Its dimensions are 18 feet in length north and south, by 11 feet across, and
> the height is about 16 feet." — Fergusson & Burgess 1880, p. 135

> "the most southern of the Raths is called that of Dharmaraja, the next that of
> Bhima, the third that of Arjuna, and the fourth that of Draupadi … The fifth …
> is situated a little to the westward of the other four, and quite detached."
> — same, p. 113

Cross-checked three ways — the 1880 text, OSM centroids, and the shipped GLB's
own accessor bounds — and all three agree on the order and on Nakula-Sahadeva
being detached to the west. **The model was already right.** See `03-`.

### 3. "Published dimensions" on the relief is not accurate

`js/scene-penance.js:38` labels 29.26 × 13.10 m and `CLEFT_W = 0.56` as
published. 29.26 m is exactly 96 ft and 13.10 m exactly 43 ft — conversions of a
Wikipedia figure that **carries no citation**; the cleft width matches **no
source at all**. The oldest traceable measurement is Fergusson's "nearly 90 feet
… average height of about 30 feet".

A report that this meant a 44% overstatement **did not survive checking** — it
compared a peak to an average. Integrating the built superellipsoid gives a
run-weighted mean of 10.91 m (35.8 ft) against Fergusson's ~30 ft: about 19%,
with length 6.7% over. Nothing needs re-modelling; one comment needs rewording.
See `02-`.

### 4. The GLB ships with no compression at all

Verified directly: `extensionsUsed: ['KHR_lights_punctual']` — no Draco, no
meshopt, no KTX2. 722 meshes, 53 materials, 1.60 MB raw / 294 KB gzipped.

Measured against the real file with `gltf-transform`:

| | Result |
|---|---|
| `meshopt --level high` | 301,860 → **167,796 B gzipped (−44%)**, decoder +6,460 B → **~128 KB net win**. All 722 primitives and 53 materials preserved. |
| Draco | Only ~10.5 KB net — its 75–100 KB decoder eats the gain on 722 small primitives |
| `gltf-transform optimize` | **Unsafe here** — collapses 722 meshes into 1, which would break `exclude` logic and marker re-anchoring |

**meshopt is the single highest-leverage change available**, and it pays for the
granite textures twice over.

## Ready to act on

- **Copernicus DEM GLO-30**, key-free, verified HTTP 200:
  `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N12_00_E080_00_DEM/Copernicus_DSM_COG_10_N12_00_E080_00_DEM.tif`
  Caveat: it is a COG, so `build-terrain.js`'s PNG decoder needs replacing.
- **ambientCG `Granite004A`** (CC0) — ≈109 KB for Colour+Normal+Roughness at
  512px, applied once as a shared tiling material multiplied against the
  existing 53-material tint scheme, **not** as 53 separate sets.
- **Four Rainer Halama photographs** of the relief, CC BY-SA 4.0, 6000 × 4000 px
  each — verified via the Commons API. Frontal, but perspective, so they need
  stitching and rectifying before they are a plate.
- **`prefers-reduced-motion` on the scroll-camera listener** — a trivial
  `matchMedia` check, and it was absent from *every* reference site checked
  (NYT, Reuters, The Pudding, Codrops). This project already honours it on the
  national map; extending it here would put it ahead of the field.

## Corrections this research forced on itself

- **Rea 1909 is not a Mamallapuram source.** Three agents independently confirmed
  it covers Kanchipuram. The relief's ASI monograph is **Longhurst 1928, Part
  II**; the Shore Temple's is likely **Longhurst 1930, Part III (Memoir 40)** —
  whose archive.org scan has corrupt OCR and no text layer, and which remains
  the single most promising unread source.
- **Srinivasan's *Cave-Temples of the Pallavas* covers neither** the open-air
  relief nor the monolithic rathas — it is scoped to cave temples.
- **README's "one continuous plinth… as recorded"** overstates Fergusson, who
  wrote that whether the rathas were cut from a continuous ridge "cannot now be
  ascertained. My impression is…".

## Unresolved conflicts — record, do not pick a winner

- Nakula-Sahadeva faces **north** (Fergusson 1880) or **south** (Longhurst 1928).
- The Shore Temple's second shrine is **dvitala** or **tritala**.
- Varaha Cave hall: **20¼ × 8½ ft** (Longhurst) or **19½ × 9½ ft** (Fergusson).
- Site stone is **charnockite** (heritage-stone literature) or, for the Shore
  Temple specifically, **garnetiferous hornblende biotite granite** (peer-reviewed).
- The "50 ft square platform" is the vimana's own base or the three-shrine
  platform. Proportional reasoning favours the former — Dharmaraja's cited
  11 m/8.5 m gives 1.29, and the vimana reading gives 1.20 while the alternative
  gives 3.60 — but **that is inference, not a citation.**

## Blocked, and honestly so

`whc.unesco.org` (Cloudflare challenge on every dossier-249 document),
Smithsonian `3d.si.edu`, MDPI/ScienceDirect/ResearchGate/NIO full texts (403),
ASI Chennai Circle (connection timeout), British Library `imagesonline`
(rights-managed). The Alkazi Collection is **on-site access only**.
No bot-detection was bypassed anywhere.
