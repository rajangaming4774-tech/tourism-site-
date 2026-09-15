# The Shore Temple, rebuilt as architecture — what was read, from where, and what is still a guess

Built 2026-09-12/13. Supersedes the "What is in the map today" section of
`05-shore-temple-photogrammetry.md`, which described the first massing model.

## What this is, in one paragraph

`assets/models/shore-temple.glb` is a **reconstruction, not a scan**. Its one cited
dimension is the 18 m height of the Kshatriyasimhesvara vimana; its one measured outline
is the OpenStreetMap compound wall (way 370135158, fetched and committed as
`shore-temple-prakara.geojson`); every other proportion — how tall each storey is, how
wide each eave, how many kudu arches a tier carries, where the tank sits — was **read off
photographs** with a ruler script, and the readings are in
`shore-temple-proportions.json` with the photograph, the pixel and the ± of each one.
The architectural vocabulary (pilasters, lion-base columns, kapota eaves with kudus, hara
rows of kuta/sala/panjara shrines, griva, octagonal shikhara, kalasha, moulded plinth,
coped prakara with seated nandis) is the real one; **no figure, panel or lion on the model
is a portrait of a real carving.** Stone colour is measured (05-md); brightness is chosen.

The user asked for "the exact temple", and this is as exact as the free evidence allows
without a surface scan. The scan route is prepared (05-md) and should replace this when a
CUDA machine is available.

## The prakara, resolved

Two figures for the compound had been living in this repo:

| figure | where | what it actually was |
|---|---|---|
| 46.4 × 21.5 m | `content/mahabalipuram-heights.js`, README | the **minimum-area rectangle** of the OSM ring |
| 49.0 × 31.4 m | the first massing build, 05-md | its **axis-aligned bounding box** |

Measured now from the committed ring (`--fetch-prakara`): min-area rectangle
**46.3 × 21.6 m**, long axis at bearing **105.2°**, area 933 m², 11 nodes. So the
compound is rotated about 15° off east-west, the towers face east-south-east toward the
sea, and the earlier build stood an unrotated box in the bounding box's footprint. The
model is built on the rectangle and the root node carries the bearing.

## What was read from which photograph

| Photograph (assets/reference/shore-temple/) | Licence | Used for |
|---|---|---|
| `shore-temple-mamallapuram-d150f51.jpg` | PD | The whole tier stack of the tall tower: every eave and hara line, griva, dome, kalasha; the west shrine's apex and two eave lines in the same frame; the tank in front |
| `front-view-mahabalipuram.jpg` | CC BY-SA 3.0 | Tier widths from the west; dome and griva widths; the two apexes' difference |
| `shore-temple-detail-of-north-face-2011-05-28.jpg` | CC BY-SA 3.0 | Counts only: 5 and 3 storeys, 6 pilasters per aditala face, 7 kudus on the aditala eave, K-P-S-P-K on the first tier and K-S-K above, lion bases at the corners |
| `shore-temple-ariel.jpg` | CC BY-SA 4.0 | Where the tank and small shrine sit; nandi spacing |
| `02mahabalipuramshoretemplebullstatues.jpg` | CC BY 2.0 | Nandi length/height (1.9) |
| `shore-temple-floor-plan-…jpg` | CC0 | Relationships only: shrine order, facing, openings. The file page says it is approximate, so never a dimension |

Method (`scripts/build-shore-temple-measure.js`): ffmpeg writes gridded copies and
zoomed crops; pixel rows and columns are picked **by eye** and transcribed into
`measure/picks.json` with a ±; `--derive` converts through the scale.

### The scale, and the one assumption under it

18.0 m is **defined** as court level to the tip of the kalasha, plinth included — the
source (Wikipedia, "60 feet (18 m) high on a 50 feet (15 m) square platform") does not
say. No frame shows the court floor beside the plinth, so the base reference is the **top
of the plinth**, and the plinth's own height is an assumption: **1.2 m**. Every height
in the JSON is (reading above plinth top) + 1.2.

### The stack, as read (tall tower, metres above court)

| | eave | hara top |
|---|---|---|
| aditala | 5.54 | 7.39 |
| tala 2 | 7.59 | 8.96 |
| tala 3 | 9.13 | 10.49 |
| tala 4 | 10.74 | 11.98 |
| tala 5 | 12.35 | 13.42 |
| griva base / dome base / dome top / tip | 14.18 / 14.93 / 16.32 / 18.00 |

Widths from the west elevation: tala 2–5 eave slabs 8.3 / 6.7 / 4.2 / 3.25 m, griva
1.29 m, dome 1.67 m. **The aditala is hidden** in that frame; its 10.4 m is extrapolated
from the tala-2/tala-3 ratio and is marked so in the parameter file.

### Disagreements, kept

- The west elevation's eave rows, scaled through its dome height, disagree with the
  south-west frame's by up to 1.5 m on the upper tiers (tip − eave 5: 4.07 vs 5.65 m),
  while the two frames agree on tip − dome base (2.96 vs 3.07) and on the two apexes'
  difference (5.39 vs 5.33). Most likely the picks on the west view sit one hara row off;
  the south-west frame, which has the plinth reference, carries the vertical stack, and the
  spread is recorded in `uncertainty`.
- The west shrine is read as **three storeys** (aditala + two). The research index records
  a dvitala/tritala conflict in the literature; the model shows what the photograph shows
  and says so.
- Perspective is uncorrected: distant, near-square-on views, a few per cent.

## What the model is made of

`scripts/blender/shore-temple/st_lib.py` (generators) + `st_params.py` (the numbers,
copied from the JSON) run in the cloud Blender worker (3D Jutsu project
`84e482a0-bfab-45e5-b0f9-9c13100ffce2`). Every repeated part is one shared mesh —
pilaster, lion base, kudu, kuta, sala, panjara, nandi, kalasha — placed as linked
duplicates: 464 objects, **36,408 triangles**, 58 nandis. The two towers are built from
their parameter stacks and then **uniformly scaled about their base so the highest vertex
lands exactly on the cited apex** (18.000 / 12.670 m); the scale factor is asserted to be
1.000, which it is, because the parameters already sum to it.

Detail rule: anything that changes the silhouette at 40–400 m is geometry (pilasters,
eaves, kudus, hara shrines, nandis); anything finer is shading, baked to a colour and a
normal map from a procedural cavity/grain shader. Nothing figurative.

## Shipped (2026-09-13)

`assets/models/shore-temple.glb` — **641,516 B raw, 343,778 B gzipped** (budget 400 KB).
8 draw calls, 36,408 triangles, 2 materials, 4 embedded JPEGs: towers colour 1024², towers
normal 512², compound colour 512², compound normal 256². `scripts/check-shore-temple-glb.js`
passes every assertion: root `ShoreTemple` with `reconstruction: true` and the note, no
camera or light, apex 18.000 m, base at court level with only the sunken tank below it
(−1.70 m), meshopt + quantization required, no PNG.

The pipeline from the worker's committed export (4.29 MB, PNG textures, vertex normals):

1. `scripts/repack-glb-images.js rev16.glb shore-temple.glb.bak --q 4 --q-normal 8
   --scale-normal 0.5 --drop-normals --base-color-scale 0.65` — JPEG textures (normal maps
   4:4:4, halved: they are nearly flat, the bump was subtle), vertex normals dropped (every
   hard edge is already a split vertex, so the loader's recomputed normals are the same flat
   shading), and the **albedo scaled to 0.65** — the "one number to turn": chromaticity
   measured, brightness chosen, and at 1.0 the stone read paler than the sand it stands on
   where every photograph shows it darker.
2. `npx @gltf-transform/cli@4.5.0 meshopt … --level high` (1.82 MB → 642 KB).
3. The check script.

Bakes: colour 8 samples with an ambient-occlusion node, normal 1 sample; 9 s and 3.5 s
on the worker's two CPU cores. The first bake used a 4 px margin and the smart-projected
atlas — thousands of small islands — showed black borders that mipmaps smeared across the
stone; 32 px (towers) / 16 px (compound) with `EXTEND` cured it. Texel density on the
towers is roughly 4–6 cm, which is the screen texel at the 40 m closest approach.

In the scene: `[3d] shore temple swapped in {ground_m: 4.29, base_m: 2.59, apex_m: 22.29,
height_m: 19.7, meshes: 8, triangles: 36408, reconstruction: true}` — apex = ground +
18.00, base = ground − 1.70 (the tank). The hero pose still frames the tower at 46 px
(it derives its distance from the measured 18 m); the panel shows the reconstruction note
from the file's extras; the provenance line carries the sentence. Loaded under the
production CSP (a `<meta http-equiv>` copy of `vercel.json`'s policy, external module,
real loader): textures decode — `blob:` in `img-src` and `connect-src` is what allows it.

### Known limits, in order of visibility

- **Representative carving.** The niches carry no figures, the kudus no faces, the walls no
  panels. This is the honest floor: the real surface needs the scan.
- **The west shrine's tower is three storeys as read**; the literature disagrees with
  itself. The tank is placed from an oblique aerial, ±3 m.
- **Fragmented UVs.** Smart projection splits ~30 k faces into thousands of islands; the
  bake is correct but the per-face texel budget is uneven. A hand-laid atlas would look
  better up close and is not worth doing before the scan replaces this.
- **The plinth is 1.2 m by assumption**; every height above court moves with it.

### To replace this with the real surface

`05-shore-temple-photogrammetry.md` has the dataset (859 photographs, EXIF originals
re-fetched), the pilot solve (84 images registered at 0.90 px), and the blocker: dense
reconstruction needs CUDA. On a rented GPU: `colmap patch_match_stereo` + `stereo_fusion` +
`poisson_mesher` over `sparse/1`, scale by the committed prakara ring, decimate to ~60 k,
bake the photo texture, and drop it in through the same `replaceShoreTemple` — the loader,
the declarations and the check script are already written for a file named the same.
