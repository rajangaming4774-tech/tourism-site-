# The Pancha Rathas, rebuilt as architecture — the same treatment as the Shore Temple

Built 2026-09-13, immediately after `06-shore-temple-rebuild.md`, with the same
generators, the same measuring script, the same declarations and the same honesty
line. Read that note first; this one records only what is specific to the five rathas.

## What this is

`assets/models/pancha-rathas.glb` replaces the five rathas, their elephant, lion and
nandi, and the rock they stand on in `mamallapuram-monuments.glb` (those nodes are
dropped at load by `replaceRathas()` in `js/scene-3d.js`). It is a **reconstruction, not
a scan**: cited heights and plans, mapped positions, storeys and eaves read off
photographs, representative carving, measured stone chromaticity, chosen brightness.

## What is cited, what is mapped, what is read, what is assumed

| Ratha | Cited (source in `content/mahabalipuram-heights.js`, `03-rathas-resolved.md`) | Read from photographs (`pancha-rathas-proportions.json`) | Assumed |
|---|---|---|---|
| Dharmaraja | 11 m, three storeys, 8.5 m square | plinth 1.22 m; eaves at 5.2 / 6.7 / 7.9 m; parapets at 5.8 / 7.3 / 8.9; dome base 9.4; 4 pillars a face; the finial is lost, the dome is the apex | tier widths 8.8 / 6.3 / 4.3 m |
| Bhima | 7.6 m over two floors, 12.8 × 7.3 m, wagon vault | plinth 0.41; colonnade to 2.7; eave 3.1; parapet 3.84; upper eave 4.8; vault springs at 5.15; 5 pillars and 7 kudus a long side | upper storey 74 % × 82 % of the plan; 9 ridge finials |
| Arjuna | 6.1 m, two storeys, 3.5 × 4.9 m, octagonal dome | plinth 0.45; eave 2.35; parapet 3.0; upper wall 3.75; eave 4.3; parapet 5.07; dome base 5.33; no finial | tier widths 4.2 / 2.7 m |
| Draupadi | 5.5 m, single cell, hut roof | roof springs at 2.9 m; width/height 0.62 → 3.4 m square | plinth 0.3 m |
| Nakula-Sahadeva | 5.49 × 3.35 × 4.88 m (Fergusson & Burgess 1880 p. 135), apsidal | eave underside 1.9, eave 2.4, upper eave 3.1 (a close, low frame — the least certain stack here) | faces north (Fergusson); Longhurst says south — recorded, not resolved |
| Elephant, lion, nandi | — | the elephant stands about level with Arjuna's colonnade top | 4.5 / 2.2 / 2.4 m long; where the first massing model stood them |
| The rock | Fergusson's ridge is an *impression*, explicitly "not ascertained" | — | a 0.4 m slab under the row, extent not surveyed |

**Positions are the OSM footprint centroids** (ways 576022681 / 84 / 88 / 90 and
576022679), which put the row at a bearing of 35.2° east of north — Draupadi at the
north-east end, Dharmaraja at the south-west, Nakula-Sahadeva 7 m west of the line, as
`03-rathas-resolved.md` established. The first massing model had the twins' ratha 15 m
west; this one uses the map.

Photographs read (assets/reference/pancha-rathas/, fetched by
`scripts/fetch-shore-temple-photos.js --category="Pancha Rathas" --max-files=60`, the
60 largest of 709 free files in the category tree):
`dharmaraja-ratha-mahabalipuram-kanjipuram-tamil-nadu-dsc00039.jpg`,
`mahabalipuram-pancha-rathas-arjunas-ratha-draupadis-ratha-wus01904.jpg`,
`the-pancha-rathas-on-a-bright-sunny-day-2025.jpg`, `n-tn-c54-sahadevas-nakhulas-ratha.jpg`,
`…-nakula-sahadeva-ratha-elephant-sculpture-wus01898.jpg`. Licences per file in
`SOURCES.md`; none is reproduced here.

## What the model is made of

`scripts/blender/pancha-rathas/st_rathas_lib.py` adds to the Shore Temple library the
three roof forms the site is famous for — the **sala** (Bhima: colonnade, upper block,
barrel vault with gable arches and ridge finials), the **apsidal gajaprishtha**
(Nakula-Sahadeva: half-lathe apse, vault turning into a half-dome), the **hut** (Draupadi:
a bell-curved four-sided loft) — plus an elephant and a seated lion, and reuses the vimana
generator for Dharmaraja and Arjuna. Each ratha is built in its own frame and turned to
the row's bearing; each is scaled uniformly to its cited apex (all factors 1.000 except
Nakula-Sahadeva's 0.957, whose read eaves slightly overshoot the cited 4.88 m).

**Shipped:** 24,352 triangles, 7 draw calls, one 1024² colour + 512² normal atlas,
**414,544 B raw / 241,741 B gzipped**. Same pipeline as 06: bake (8 samples, 32 px
`EXTEND` margin), `repack-glb-images.js --q 4 --q-normal 8 --scale-normal 0.5
--drop-normals --base-color-scale 0.65`, meshopt, `check-shore-temple-glb.js
--root=PanchaRathas --apex=11 --min-y=-0.5 --tris=15000-60000`.

In the scene: `[3d] pancha rathas swapped in {apex_m: ground + 11.00, meshes: 7,
triangles: 24352, reconstruction: true}`; the label re-anchors to the measured
Dharmaraja top; the panel shows the note from the file's extras; the provenance line
carries the sentence.

## Known limits

- **Representative carving.** The ground storeys of Dharmaraja and Arjuna are open
  colonnades with sculpted figures in the bays; here they are pilastered walls with
  lion-based corner columns. No dvarapala, no relief panel, no animal is a portrait.
- **Bhima's vault** is a semi-ellipse; the real one is nearer a pointed keel in section.
- **The elephant, lion and nandi** are low-poly stand-ins at plausible size; their exact
  positions are the first model's, not mapped.
- **Nakula-Sahadeva's facing** is unresolved in the sources and the model picks one.
- The scan route (`05-shore-temple-photogrammetry.md`) applies here too: the category has
  709 free photographs.
