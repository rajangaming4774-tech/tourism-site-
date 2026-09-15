# Geospatial, terrain and aerial data sources — Mahabalipuram / Mamallapuram

Site centre used throughout: 12.6167 N, 80.1928 E. Project bboxes (from `scripts/fetch-site-data.js`):
CORE `[12.6, 80.179, 12.631, 80.201]`, WIDE `[12.6, 80.179, 12.662, 80.212]`. This audit's OSM query (section D)
used the task's own bbox, `12.60,80.17,12.64,80.21`, which is a superset of both.

Full machine-readable version of everything below: `data/research/3d/geospatial.json`.

## The one DEM upgrade worth making, and how to fetch it

**Swap the SRTM-sourced Terrarium tiles `scripts/build-terrain.js` currently decodes for Copernicus DEM
GLO-30 — same 30 m posting, no API key, no registration, and a real, published accuracy improvement over
the coastal/vegetated terrain this project already says it's mis-rendering.**

- Current source: `s3://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, which for India is oversampled
  **SRTM** — C-band radar flown in Feb 2000, public domain, but with well-documented vegetation-canopy and
  coastal-noise artifacts. Published accuracy: LE90 ≈ 8.5 m, RMSE ≈ 5.4 m.
- Recommended replacement: **Copernicus DEM GLO-30**, built by ESA/Airbus from 2011–2015 TanDEM-X bistatic
  X-band interferometry, edited and void-filled. Published accuracy: LE90 ≈ 7.7 m, RMSE ≈ 4.9 m, and
  independent DEM intercomparisons rank it the most accurate freely available global DEM (some report
  ~±4 m absolute vertical accuracy against ~±9 m for SRTM). Free, worldwide, commercial-use-permitted
  licence; only requirement is a citation line, which `build-terrain.js` already has a pattern for
  (`attribution` field in the output JSON).
- **Verified live, today**: the exact 1°×1° tile covering the whole 4 km build square (12–13 N, 80–81 E)
  is reachable with no AWS account and no key —

  ```
  curl -I https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N12_00_E080_00_DEM/Copernicus_DSM_COG_10_N12_00_E080_00_DEM.tif
  → HTTP/1.1 200 OK
  ```

  (also reachable via `aws s3 cp --no-sign-request s3://copernicus-dem-30m/...`).
- **The catch**: it ships as a Cloud-Optimized GeoTIFF (single-band float32, ~3600×3600 px), not a PNG.
  `build-terrain.js`'s hand-rolled decoder (`decodePNG`, ~40 lines, chosen specifically because Terrarium
  tiles are "the simplest possible case") does not read this format. Reading a COG by hand is bounded but
  real work — TIFF IFD parsing plus DEFLATE/LZW-tiled float32 decode — more than the current PNG path, and
  worth scoping as its own task rather than folding into this research pass.
- **What this upgrade does and does not buy you**: it does *not* raise the resolution — 30 m posting is
  still 30 m posting, still no plinths, still not enough to resolve individual monument platforms. It *does*
  remove a real, measured noise source in exactly the low-relief coastal terrain (the granite ridge, the
  beach edge, the flat hinterland) that the README already singles out as where the current DEM goes wrong.
  If the goal is a materially higher-resolution ridge (sub-10 m), no key-free source clears that bar for
  this location — see the DEM table below.

No key-free source available today beats 30 m posting for this coordinate. Getting below that means
ALOS AW3D30 (JAXA registration), CartoDEM sub-10 m (ISRO High Resolution Image Clearance Committee approval),
or a site-specific LiDAR/drone survey — none of which exist as open downloads for this site (see below).

## A. Elevation data

| Source | Resolution | Vertical accuracy | Licence | Key/registration? | Verified download route |
|---|---|---|---|---|---|
| **SRTM** (current, via Terrarium) | 30 m posting | LE90 ≈ 8.5 m, RMSE ≈ 5.4 m | Public domain | No | `s3://elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, verified HTTP 200 for the z14 tile over the site |
| **Copernicus DEM GLO-30** | 30 m posting | LE90 ≈ 7.7 m, RMSE ≈ 4.9 m (best of the free global DEMs in published comparisons) | Free, attribution required | **No** | `s3://copernicus-dem-30m/Copernicus_DSM_COG_10_N12_00_E080_00_DEM/...tif`, verified HTTP 200 for the tile covering the whole build square |
| Copernicus DEM GLO-90 | 90 m | Same family as GLO-30 | Same | No | `s3://copernicus-dem-90m`, same tile-naming pattern |
| ALOS World 3D AW3D30 (JAXA) | ~30 m, optical stereo | Not itemised on the fetched JAXA page | Free, JAXA Terms of Use | **Yes — account registration required**, verified: signup at `eorc.jaxa.jp/ALOS/en/aw3d30/registration.htm`, then manual tile download after login | Blocked by registration for this project |
| NASADEM | 30 m, SRTM + ICESat/ASTER blend | Not itemised on the fetched NASA page | Public domain / open | **Yes — NASA Earthdata Login required**; no anonymous AWS bucket found (`registry.opendata.aws/nasadem` → 404) | Blocked by registration |
| ASTER GDEM v3 (ASTGTM v003) | 30 m, optical stereo, 2000–2013 | Not quantified on fetched page; generally noisier than SRTM/Copernicus per published comparisons | Open, DOI citation requested | **Yes — Earthdata Login required** | Blocked by registration |
| CartoDEM (ISRO/NRSC, Cartosat-1) | 30 m free tier; 10 m priced; <10 m needs ISRO clearance | Not published on fetched NRSC page | NRSC open-data policy for the 30 m tier | **Yes — Bhuvan account required even for the free 30 m tier**, plus a 20-tiles/day cap | Blocked by registration, and not a resolution upgrade anyway |
| Open LiDAR / drone survey of the monuments | — | — | — | — | **None found.** ASI is reported generally using LiDAR/drone/photogrammetry for monument documentation, and its Underwater Archaeology Wing resumed offshore survey work here in 2025, but no open, downloadable point cloud, DTM or orthomosaic for this specific site turned up on ASI, NRSC/Bhuvan, or academic sources. |
| Mapbox Terrain-RGB | Varies | — | Proprietary | **Yes — API key** | Not fetched/verified; ruled out on the key requirement alone |
| MapTiler terrain | Varies | — | Proprietary | **Yes — API key** | Not fetched/verified; ruled out on the key requirement alone |

## B. Satellite / aerial imagery

| Source | Resolution | Licence | Key? | Route |
|---|---|---|---|---|
| **Sentinel-2 L2A** | 10 m (visible/NIR), 20/60 m other bands | Free/open Copernicus data policy, attribution | **No** | `s3://sentinel-s2-l2a` anonymous; scene search via Element 84's Earth Search STAC API, also key-free |
| **ESA WorldCover 10 m** | 10 m land-cover classes | CC BY 4.0 | **No** for the S3 bucket (`aws s3 sync s3://esa-worldcover/v200/2021/map ... --no-sign-request`); viewer/Terrascope access does need login | S3 |
| Bhuvan imagery | Varies (LISS-III ~24 m to Cartosat ~2.5 m in places) | Bhuvan portal terms, not a clean open licence | **Yes**, portal login for download | Open Data Archive / Bhoonidhi VISTA |
| OpenAerialMap | Per-contribution, often sub-metre where available | Openly licensed per image | No | Coverage for this exact site is **UNVERIFIED** — the fetched landing page gave no site-specific info; the OAM catalog itself was not queried |

For ground texture, Sentinel-2 at 10 m and ESA WorldCover at 10 m (as a material mask: bare rock vs.
vegetation vs. built-up) are both immediately usable with zero registration.

## C. Coastline and bathymetry

- **GEBCO_2024 Grid**: 15 arc-second global bathymetry (~460 m at this latitude), **public domain**,
  attribution requested, explicitly not for navigation use. Download via `download.gebco.net`'s Grid
  Subsetting App, no login, netCDF/GeoTIFF/ASCII output. Coarse relative to the project's ~21 m onshore
  grid, but that's standard for shelf-scale bathymetry and is the right grain for a Bay-of-Bengal sea
  base if the scene's sea plane is ever extended offshore. The project currently clamps its own DEM's
  sea floor to -6 m rather than using real bathymetry at all.
- **OSM coastline**: already fetched — `data/mamallapuram-coastline.geojson`, `natural=coastline`, a
  299-node way, ODbL, credited. No action needed.
- **NIO / ASI offshore findings**: real and well-documented as history (a submerged wall, steps and
  chiselled blocks found ~800 m offshore at ~8 m depth by NIO divers after the sea withdrew ahead of the
  Dec 2004 tsunami; an earlier 2002 SES/NIO expedition found a separate submerged ruin complex; ASI's
  Underwater Archaeology Wing restarted offshore survey work in 2025) — but **none of it exists as a
  downloadable geospatial dataset**. It's citable narrative content, not a data layer.
- **Historic shoreline change**: multiple academic studies exist (a ScienceDirect paper on 8th-century
  coastal uplift and the Shore Temple; a DSAS shoreline-change study from Mahabalipuram to Odiyur Lake
  reporting up to 7.5 m/yr erosion and up to 119 m of retreat over 17 years in nearby stretches; other
  Tamil Nadu coastal-erosion papers) — confirming the coast genuinely has moved, erosion-dominated near
  Mahabalipuram — but again **no open, reusable GIS file** was found; only journal PDFs.

## D. OpenStreetMap completeness — measured, live

Query executed directly against `https://overpass-api.de/api/interpreter` for bbox
`(12.60,80.17)–(12.64,80.21)` (HTTP 200, 337 elements returned):

- **337 elements total**: 114 nodes, 215 ways, 8 relations.
- **205 features tagged `building=*`**. Of those, **exactly 1** carries a `height` tag, **0** carry
  `building:levels`. (This matches the README's own count almost exactly — it reports "119 buildings...
  exactly one... height... none... `building:levels`" for its smaller CORE bbox; this audit's larger bbox
  picks up more buildings, ~205, but the "1 height, 0 levels" pattern is unchanged.)
- **28 `historic=*` features**: 14 mapped only as **nodes** (points) — Ramanuja Mandapam, Varaha
  Mandapam/Cave, Mahishamadhini Cave, Dharmaraja Mandapam, Five Celled Rock Cave, Keneri Mandapam,
  Panchapandava Mandapam, Olakkannesvara Temple, Tirmurthy Cave, Kodikal Mandapam, plus a few named
  namesakes. 14 mapped as **ways/relations** (real outlines) — the five individual rathas (Nakula-Sahadeva,
  Draupadi, Arjuna, Dharmaraja, Bhima), the Pancha Rathas grouping, Pidari + Valayankuttai ratha, Krishna
  Mandapam, Rayala Gopuram, the Old Lighthouse, the Shore Temple, the Shore Temple Complex boundary, and
  the overall "Group of Monuments" boundary. **Zero** of the 28 carry a `height` tag.
- **125 `tourism=*` features**: museum, information, hotel, attraction, guest_house, viewpoint.
- **11 `natural=bare_rock`/`natural=rock` features, all mapped as ways** (0 as bare nodes) — the granite
  outcrops already have real outlines in OSM, not just point pins.

**Concrete gaps a contribution could fill**: the 14 historic point-only features (caves and mandapams
mapped as nodes rather than their real footprints) are the clearest opportunity — tracing their outlines
from aerial imagery or a site visit would let the project extrude them the way it already does the five
rathas, instead of leaving them as un-massable points. None of the 28 historic features and none of the
205 buildings carry a height, so height-tagging even a handful of well-documented monuments (with a
citation, per this project's own rule) would be a second, smaller win.

## E. 3D building / footprint datasets covering India

| Dataset | India coverage | Heights? | Licence | Key? | Route |
|---|---|---|---|---|---|
| **Google Open Buildings** | Yes (145+ countries incl. India) | **No** — footprint + confidence score only | User's choice of CC BY 4.0 or ODbL 1.0 | No | Interactive map, Colab notebook, HDX, `gsutil`, or Earth Engine asset |
| **Microsoft Global ML Building Footprints** | Yes — dataset notes 110M footprint edits primarily contributed in India | **Yes**, per the fetched repo page | CDLA Permissive 2.0 | No | `dataset-links.csv` indexes tiles by Bing quadkey (no simple bbox download) |
| **Overture Maps buildings theme** | Yes, global (conflates OSM + Microsoft + Google Open Buildings) | Yes, where a source provides one | ODbL | No | Anonymous Parquet on S3/Azure (`s3://overturemaps-us-west-2/release/.../theme=buildings/...`), typically queried with DuckDB's spatial extension |

None of these need a key. For this specific tourist-core bbox, Overture's conflation likely reduces close
to the same OSM data the project already pulls, plus whatever heights Microsoft's ML model adds where OSM
has none — worth a targeted follow-up query against the exact bbox before adopting it, since the project's
own audit above shows OSM height coverage here is essentially zero.

---
*Every URL and figure above marked "verified" was actually fetched or curl'd during this research pass
(2026-09-07); a small number of items are explicitly marked UNVERIFIED where a source page gave no
site-specific answer and a deeper catalog query was out of scope for this pass.*
