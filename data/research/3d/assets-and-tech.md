# CC0 3D assets and web-3D delivery — research for the Mahabalipuram scene

Researched against the live project: `assets/models/mamallapuram-monuments.glb` (1.60 MB
raw / 295 KB gzip, 722 mesh primitives, 53 materials, **zero textures**, no geometry
compression applied), `js/scene-3d.js` (vendored three.js **r169**, Sept 2024), and the
README's own statement of the gap — *"No PBR textures. Granite is flat Principled
material — no roughness maps, no normal maps, no moss."*

Every number below marked with a source was fetched live (Poly Haven / ambientCG APIs,
npm registry, GitHub, or — for the compression numbers — run directly against the
project's actual `.glb` file with `@gltf-transform/cli@4.5.0` via `npx`, no install, no
repo changes). Nothing here is invented; anything I could not verify is marked
**UNVERIFIED**.

---

## Shortlist: what to actually download, and what it costs

Ranked by leverage. "Web KB" for textures is **empirically measured** (I downloaded the
real files and re-encoded them with ffmpeg — see method note under §A), not a guess.

| # | Asset | License | As-published (1K) | Re-encoded for web (512px, 3 maps) | Verdict |
|---|---|---|---|---|---|
| 1 | **ambientCG `Granite004A`** | CC0 | Color 1.76 MB + NormalGL 336 KB + Roughness 546 KB (+ Displacement 211 KB, skip) | **≈109 KB** (measured: 92+3.3+13.8 KB) | Ship this **once**, tile it across the existing 53-material weathering scheme (multiply, don't replace) |
| 2 | Poly Haven `lichen_rock` | CC0 | Diffuse 1.05 MB + NormalGL 1.23 MB + ARM 784 KB (1k) | ~80–150 KB (est., same recipe) | Base-of-monument lichen accent, optional |
| 3 | ambientCG `Granite001A` | CC0 | 5.15 MB 1K zip, all maps (not unpacked) | ~100–150 KB (est.) | Second granite tone if one tiling texture reads too uniform |
| 4 | Poly Haven `mossy_rock` | CC0 | Diffuse 1.12 MB + NormalGL 996 KB + ARM 927 KB (1k) | ~80–150 KB (est.) | Alternate to #2, do not ship both |
| 5 | Poly Haven `coast_sand_03` | CC0 | Diffuse 1.16 MB + NormalGL 1.52 MB + ARM 1.13 MB (1k) | ~80–150 KB (est.) | Only if the sand plane stops being a flat colour |
| 6 | Poly Haven `red_laterite_soil_stones` | CC0 | Diffuse 907 KB + NormalGL 1.49 MB + AO 1.11 MB (1k) | ~80–150 KB (est.) | Inland ground accent, low priority |
| 7 | Poly Haven `red_sandstone_pavement` | CC0 | Diffuse 663 KB + NormalGL 816 KB + ARM 575 KB (1k) | ~60–100 KB (est.) | Decorative only — not the monuments' actual granite |
| 8 | Poly Haven `square_cobblestone` | CC0 | Diffuse 999 KB + NormalGL 930 KB + ARM 801 KB (1k) | ~70–110 KB (est.) | Town/plaza paving, low priority |
| 9 | Poly Haven `secluded_beach` HDRI | CC0 | **1.51 MB** (.hdr, 1k — smallest they offer) | not tested; see §B caution | Only for a Blender lighting *reference*, not for shipping |
| 10 | Quaternius "Palm Tree" (via Poly Pizza) | CC0 | Not stated | n/a (would replace a **0 KB** procedural sprite) | See §C — probably don't |

**If you ship exactly one thing:** #1, ambientCG Granite004A, re-encoded to 512×512 JPG
(Color+Normal+Roughness only, skip Displacement) — **≈109 KB added**, applied once as a
shared tiling material multiplied against the existing per-part base-colour weathering
tint, not as 53 separate texture sets.

**Realistic total if you take #1 + #2 (base granite + one lichen accent):** roughly
**190–260 KB** added to the site's 3D payload — which would **nearly double** the
current 295 KB gzipped 3D budget. That is the actual trade-off, stated plainly, not
softened.

### Method note — how the "web KB" column was measured

Poly Haven and ambientCG publish only their **source-quality** JPGs (1k Diffuse maps run
0.9–1.8 MB each — this is normal for them, not a mistake). None of that is web-ready.
I downloaded `ambientCG/Granite004A_1K-JPG.zip` for real, unzipped it, and re-encoded the
three maps that matter (Color, NormalGL, Roughness — Displacement was dropped, this mesh
has no tessellation) with `ffmpeg -vf scale=512:512 -q:v 5`:

| Map | Original 1K JPG | Web 512px JPG (q≈80) |
|---|---|---|
| Color | 1,841,772 B | 91,733 B |
| NormalGL | 343,990 B | 3,295 B |
| Roughness | 558,816 B | 13,757 B |
| **Total** | **2.74 MB** | **108,785 B ≈ 106 KB** |

One non-obvious finding from actually testing it: **WebP was not smaller than JPEG
here.** Re-encoding the same Color map to WebP at libwebp quality 80 produced 100,566 B
— *larger* than the 91,733 B JPEG at equivalent settings. WebP's advantage is real for
flat/illustrative art; it is not guaranteed on high-frequency granite grain. Benchmark
before assuming WebP wins.

The normal map shrinking to 3.3 KB is real, not an error — downsampling a 4K-native scan
to 512px already averages out most of the fine crystalline grain that a normal map
exists to encode. If the monuments are ever viewed close-up (not true today, this is a
diorama-scale scene), keep the normal map at 1024px (**≈12.5 KB** measured) rather than
512px.

---

## A. CC0 PBR texture sets for weathered granite / charnockite

Both Poly Haven and ambientCG are confirmed CC0 (checked their license pages directly:
`polyhaven.com/license` → "CC0 / Public Domain"; ambientCG list page → "Public Domain").

### ambientCG — granite specifically

Search for "granite" on ambientCG returns **14 real variants**: `Granite001A/B` through
`Granite007A/B`. Full per-map breakdown pulled for **Granite004A**:

| Map | 1K JPG size | Notes |
|---|---|---|
| Color | 1,841,772 B | |
| NormalDX | 343,730 B | |
| NormalGL | 343,990 B | three.js/glTF wants GL convention |
| Roughness | 558,816 B | |
| Displacement | 216,605 B | skip — no tessellation shader here |

No AO or Metalness map ships with this one (granite is fully dielectric — metalness=0 is
correct anyway, so nothing lost). Full 1K JPG zip bundle: **4,928,908 B**. 2K zip:
**14,580,540 B**. `Granite001A` 1K zip: **5,151,099 B** (not unpacked further).

URL: https://ambientcg.com/view?id=Granite004A — CC0, verified via API
(`ambientcg.com/api/v2/full_json?q=granite`).

### Poly Haven — weathered/lichen/moss rock (verified via `api.polyhaven.com/files/<id>`)

All CC0. All offered at 1k/2k/4k(/8k), JPG or PNG, plus glTF/Blend/MaterialX bundles.
Exact 1K and 2K JPG byte counts, per map:

| Asset | Diffuse 1k / 2k | NormalGL 1k / 2k | ARM 1k / 2k | Displacement 1k / 2k |
|---|---|---|---|---|
| `lichen_rock` | 1,070,311 / 4,010,129 | 1,259,569 / 4,844,348 | 802,718 / 2,978,561 | 322,057 / 961,417 |
| `mossy_rock` | 1,124,438 / 4,535,360 | 995,727 / 4,033,031 | 926,941 / 3,799,947 | 208,904 / 644,550 |
| `rock_pitted_mossy` | 1,087,680 / 4,272,323 | 1,137,508 / 4,510,263 | 774,539 / 3,034,281 | 237,335 / 725,941 |
| `red_laterite_soil_stones` | 906,764 / 3,593,564 | 1,494,933 / 5,924,499 | 1,056,919 / 4,050,156 | 686,915 / 2,169,376 |
| `coast_sand_03` | 1,164,522 / 4,278,557 | 1,522,963 / 5,636,070 | 1,126,675 / 3,989,281 | 442,632 / 1,317,229 |
| `red_sandstone_pavement` | 662,808 / 2,722,687 | 815,891 / 3,573,918 | 575,483 / 2,354,240 | 310,295 / 1,005,796 |
| `square_cobblestone` | 998,595 / 4,454,725 | 929,523 / 3,990,570 | 800,557 / 3,593,615 | 368,318 / 1,159,975 |
| `seaside_rock` | 954,872 / 3,883,057 | 1,158,486 / 4,527,854 | 640,203 / 2,590,567 | 289,531 / 870,843 |

ARM = one texture packing AO + Roughness + Metalness in R/G/B — use it instead of three
separate files; that alone cuts the map count from 4-5 down to 3 (Diffuse, Normal, ARM).

URLs: `https://polyhaven.com/a/<id>` for each id above (e.g.
https://polyhaven.com/a/lichen_rock). All confirmed present via the live Poly Haven
assets API.

**What's missing:** neither service has a texture literally labelled "wet dark stone at
a base" — the closest are `seaside_rock` and the dark end of the `lichen_rock` /
`rock_pitted_mossy` diffuse maps. The project already solves "damp, dark, near-black
tones at the foot" procedurally (six tonal steps × three tints, per the README) — a
texture pass would need to either replace that system or be layered under it via the
same height-based vertex mask, not fight it.

---

## B. HDRI environment maps — Poly Haven, coastal / tropical light

Poly Haven has **no HDRI tagged "Mahabalipuram" or "Tamil Nadu"** obviously, but its
`outdoor`/`nature`/`skies` category has plausible coastal-light stand-ins. Verified via
`api.polyhaven.com/files/<id>`:

| Asset | Mood | 1k .hdr | 2k .hdr | 4k .hdr |
|---|---|---|---|---|
| `secluded_beach` | clear, high-contrast morning-afternoon | 1,582,472 B | 6,315,212 B | 25,375,378 B |
| `fish_hoek_beach` | overcast beach, low contrast | 1,433,636 B | 5,687,874 B | 22,759,214 B |
| `small_harbour_morning` | clear morning, high contrast | 1,496,732 B | 6,066,806 B | 24,777,977 B |
| `small_harbour_sunset` | golden hour, medium contrast | 1,499,733 B | 6,109,792 B | 24,904,563 B |
| `blue_lagoon` | tropical, high contrast, partly cloudy | 1,559,027 B | 6,081,109 B | 23,710,295 B |

None of these are labelled "hazy afternoon" specifically — `fish_hoek_beach` (overcast,
low contrast) is the closest available stand-in.

**Caution, stated plainly:** Poly Haven's smallest published HDRI resolution is **1k**,
and even that is **1.4–1.6 MB as a single file** — five times the entire current 3D
payload of this site (295 KB gzipped). `.hdr`/`.exr` also do not gzip well (they're
already fairly dense floating-point data). There is no "small" tier to fall back to
from Poly Haven directly. For a scene this size-disciplined, the realistic path is
**not** to ship the HDRI at all: either (a) use it only as a **Blender lighting
reference** when re-tuning the scene's existing hemisphere/sun lights (which is free —
no runtime cost), or (b) if IBL reflections are genuinely wanted, pre-filter it offline
to a tiny baked equirect (e.g. 128×64 or 256×128, heavily blurred, exported as a
compressed PNG/JPEG of a few KB) rather than shipping the source file. I did not test
that offline bake — flagging it as the honest next step, not a verified number.

---

## C. CC0 vegetation — palms, casuarina, coastal shrubs

**Poly Haven has no coconut palm model at all.** I fetched the full Poly Haven models
API (`api.polyhaven.com/assets?type=models`, 63 nature-tagged entries) and searched for
palm/coconut/casuarina/tree — the only "coastal" trees are `island_tree_01/02/03`, which
are gnarled wind-swept broadleaf trees (1.76M–4.76M polygons, 8K textures) — not palms,
wrong silhouette entirely, and wildly too heavy regardless.

**Quaternius** (itch.io, aggregated on Poly Pizza): confirmed **CC0** for its "Palm
Tree" models (5 variants, e.g. https://poly.pizza/m/A6cKJYFsIb — license shown as
"Public Domain (CC0)", author Quaternius, FBX/GLTF format). Generic stylized low-poly
palm, not species-accurate.

**Poly by Google** (ex-Google Poly, mirrored on Poly Pizza): has a genuine "Coconut palm
tree" model (https://poly.pizza/m/bXUTyfiwqBb) — but its license is **CC-BY 3.0, not
CC0** — attribution to "Poly by Google" required. Also has Royal, Fishtail, Ivory-cane
and Umbrella palm variants, all under the same CC-BY 3.0 terms. Since this project wants
CC0, these are usable only with attribution recorded, which the project's whole design
philosophy (declared provenance, `decorative: true` flags) would probably want anyway —
but it is not CC0, so flagging it as a **deliberate exception** if used.

**Casuarina — the actual dominant coastal species at Mahabalipuram — has no CC0 model I
could find anywhere** (Poly Haven, ambientCG has no models at all, Quaternius, Kenney,
or a Sketchfab CC0-tag search). This is a real, confirmed gap, not a missed search: the
species is niche enough that free asset libraries default to generic "palm" or "pine"
stand-ins. A search on Sketchfab returned only generic low-poly pine/tree packs and
non-CC0 or paid casuarina-specific models (e.g. a RenderHub listing that requires
payment). If casuarina is wanted, the honest options are (a) a real license purchase, or
(b) model it, same as the monuments were.

**The stronger point, from reading the actual code:** `js/scene-palms.js` currently
draws its 142 palms as **camera-facing sprites from a hand-authored inline SVG data
URI** — a 128×160 canvas texture with **zero network cost**, one shared
`SpriteMaterial`. Any of the GLB options above (Quaternius or Poly-by-Google) would be a
**strict payload regression** against a system that currently costs 0 KB, unless used
sparingly for a handful of hero foreground trees rather than the full 142-tree scatter.
Given the project's own stated "honesty line" — palms are already flagged as the *only*
invented thing on the map, fenced to real vegetated polygons — swapping in a
non-botanically-accurate generic CC0 palm model would not improve honesty, only cost.
**Recommendation: don't, unless a specific close-up shot demands it.**

---

## D. Web-3D delivery techniques — with real numbers from this project's own file

### D.1 The project's GLB, as it exists today (verified)

```
assets/models/mamallapuram-monuments.glb
  raw:  1,598,932 B  (1.60 MB, matches README)
  gzip: 301,860 B    (≈295 KB, matches README)
  722 mesh primitives, 53 materials, 0 textures, 0 animations
  NO KHR_draco_mesh_compression, NO EXT_meshopt_compression, NO KHR_texture_basisu
```
(Confirmed by byte-searching the file for those extension strings — none present — and
by `gltf-transform inspect`, which reports "No textures found" / "No animations found."
`extensionsUsed` is only `KHR_lights_punctual`, which the loader already strips.)

**This means: the model currently ships with zero geometry compression of any kind.**
That is the single largest lever available, and I tested it directly.

### D.2 Draco vs. Meshopt — tested on the real file, not a benchmark blog

Ran both, via `npx @gltf-transform/cli@4.5.0`, no install, no repo changes:

```bash
npx @gltf-transform/cli@4.5.0 meshopt input.glb output-meshopt.glb --level high
npx @gltf-transform/cli@4.5.0 draco   input.glb output-draco.glb
```

| | raw | gzip | mesh primitives preserved |
|---|---|---|---|
| Original | 1,598,932 B | 301,860 B | 722 |
| **Meshopt** (`--level high`) | 818,656 B (−49%) | **167,796 B (−44%)** | **722 — unchanged** |
| **Draco** (defaults) | 923,408 B (−42%) | 216,591 B (−28%) | 722 — unchanged |

Both preserve every mesh (verified: `TRIANGLES` row count in `gltf-transform inspect`
stayed at 722 for the meshopt output). Neither touches the 53 materials.

**Now the decoder cost — this is where it actually gets decided.** Downloaded the exact
files three.js r169 ships for each, from jsdelivr, and measured them for real:

| Decoder | raw | gzip |
|---|---|---|
| `meshopt_decoder.module.js` | 24,850 B | **6,460 B** |
| `draco/gltf/draco_decoder.wasm` + `gltf/draco_wasm_wrapper.js` (glTF-optimized pair) | 192,420 + 58,456 B | 63,245 + 11,529 B = **74,774 B** |
| `draco/draco_decoder.wasm` + `draco_wasm_wrapper.js` (general pair) | 285,747 + 58,763 B | 88,206 + 11,686 B = **99,892 B** |
| `draco/draco_decoder.js` (asm.js fallback, no WASM) | 719,410 B | 147,016 B |
| `basis_transcoder.js` + `.wasm` (for KTX2, separate concern) | 57,529 + 527,333 B | 15,066 + 245,414 B = **260,480 B** |

Net effect, first visit:

- **Meshopt: −134,064 B payload for +6,460 B decoder ≈ 127.6 KB net win**, and the
  decoder is cacheable across every page on the site that loads a glTF.
- **Draco (glTF-optimized pair): −85,269 B payload for +74,774 B decoder ≈ 10.5 KB net
  win** — real, but marginal, and evaporates if the general (non-glTF-specific) decoder
  pair is used instead (**net loss** at that point: 99,892 > 85,269).

**Meshopt is the correct choice for this specific file**, not a coin-flip between two
similar options. Its decoder is roughly **11–15× smaller** than Draco's, and this
project's own geometry (722 small architectural meshes, not a single dense scan) is
exactly the case where Draco's heavier entropy coding buys comparatively little over
what meshopt's simpler quantization+delta scheme already gets, while gzip transport
compression (already in place) captures a further layer regardless of codec.

**A tested warning, not a suggestion:** `gltf-transform optimize input.glb output.glb
--compress meshopt` (the "just optimize everything" one-liner from the official docs)
was also tested. It produced a startling **118,448 B raw / 30,813 B gzip** — a 10×
reduction — but only because its default pipeline includes `join` (merge meshes to cut
draw calls) and `simplify` (reduce vertex count). Verified: it collapsed all **722 mesh
primitives into 1**. For most scenes that's the point. For this one, it would very
likely break the code that suppresses per-monument extruded footprints by name
(`exclude` in `buildMassing`), and the marker re-anchoring that measures "the top of the
real model" per site after load — both of which depend on mesh/scene structure that
`join` erases. **Use the plain `meshopt` command in isolation, not `optimize`, unless
`join`/`simplify` are explicitly disabled and the site-marker code is re-tested.**

### D.3 KTX2 / Basis Universal — not yet applicable, but here's the toolchain

The current GLB has no textures, so KTX2 compression has nothing to act on today. It
becomes relevant the moment any of §A's granite textures are added. What it costs and
buys, concretely:

- **Cost to ship:** `basis_transcoder.js` + `.wasm`, **260,480 B gzip** total (measured
  above) — this is a large, one-time fixed cost, more than the project's entire current
  gzipped 3D model. It amortizes across every textured asset the site ever adds, but on
  a site this size-disciplined it is a real decision, not a default.
- **What it buys:** KTX2/Basis textures stay **GPU-compressed in video memory** (BC/ETC2
  on-device after transcode) instead of a JPEG/PNG's fully-decoded RGBA8 in VRAM.
  Uncompressed RGBA8 is 32 bits/pixel; ETC1S/UASTC transcode targets are typically 4–8
  bits/pixel on-device — a **4–8× GPU memory reduction**, independent of download size.
  (General, well-established figure from the Basis Universal project — not benchmarked
  against this project's own textures since it has none yet.)
- **Toolchain:** `gltf-transform etc1s input.glb output.glb` (lower quality, smaller) or
  `gltf-transform uastc input.glb output.glb` (higher quality, larger — UASTC quality
  levels documented as 0=43.45dB…4=48.24dB PSNR). **Both require installing
  KTX-Software's `toktx` binary separately** — this is not a pure-npm dependency, it's a
  native tool. That is a meaningfully bigger toolchain lift than Draco/meshopt (pure
  npm/npx, no separate binary), worth knowing before committing to it for a project that
  currently has "no npm, no build step."
- **Verdict for this project, given it has 0 textures today:** worth adopting only when
  and if the §A granite texture actually ships — not before. At that point the fixed
  ~260 KB transcoder cost has to be weighed against how many textured assets it will
  amortize across (currently: one candidate texture, ≈106 KB already-small JPGs — KTX2's
  fixed cost would **exceed** the texture itself for a single small material). It starts
  paying off once there are several textured materials on the page, not for one.

### D.4 three.js version

Confirmed via npm registry (`registry.npmjs.org/three`, `dist-tags.latest` +
publish timestamps):

- **Vendored in this project:** r169 (`assets/vendor/three.module.js`, byte-grepped for
  the REVISION constant), published **2024-09-26**.
- **Current latest:** **r185.1**, published **2026-07-01**.
- The project is **16 minor revisions / ~22 months behind**.

Checked the official migration guide r169→r185 for anything relevant to this project's
actual usage (`GLTFLoader`, `OrbitControls`, `WebGLRenderer`, lights, no WebGPU/TSL
usage found in `scene-3d.js`):

- r173→r174: `Controls.connect()` became **mandatory** with a DOM element argument
  (previously implicit). `OrbitControls` is imported and used here — worth checking
  before any upgrade.
- r177→r178: `OrbitControls` keyboard input now requires an explicit
  `listenToKeyEvents()` call — silently stops working otherwise on upgrade.
  requires an explicit `.connect(domElement)` call now.
- r179→r180: `RGBELoader` renamed to `HDRLoader` — relevant only if §B's HDRI work ever
  ships.
- r184→r185: `Object3D.dispose()` added; not used here today, no impact.

None of these are severe, but an upgrade is not a no-op drop-in either — it needs the
`OrbitControls` call sites checked, minimum.

### D.5 `<model-viewer>` — measured, and not a fit here

Current version **4.3.1** (npm, published 2026-06-04). Downloaded the actual CDN bundle
and measured it: `model-viewer.min.js` is **1,068,903 B raw / 288,543 B gzip**.

That is larger, on its own, than this project's **entire current vendored stack**
(`three.module.min.js` 365,552 B + `three-gltfloader.js` 110,040 B, both uncompressed —
gzip would shrink these, but the comparison direction holds: one web component is
bigger than the whole three.js+loader combo this project already ships). `<model-viewer>`
is a strong choice for a single standalone model embed with built-in AR — it is not a
sensible replacement for this project's custom scroll-driven camera, terrain, globe, and
multi-layer diorama scene, which needs the raw three.js API that `<model-viewer>`
deliberately hides. Worth knowing about only as a complement — e.g. a simple standalone
"view this monument in AR" page elsewhere on the site — not as an alternative to
`scene-3d.js`.

### D.6 LOD / progressive loading for a scroll-driven scene

No new library needed for this — three.js's built-in `THREE.LOD` object switches child
meshes by camera distance, and the project's existing render-on-demand pattern (noted in
the README: "the globe renders every frame; the site scene does not") is already the
right foundation for a scroll-driven scene, since geometry only needs to be at full
resolution when the camera is near it. Concretely, for this project: the monuments
(722 meshes, but individually small) are probably not worth LOD-ing given their total
size is already tiny; the 238-tier town buildings and 55-tier rock outcrops (both
nominal, both nearer the "nice to reduce" end) are the more plausible LOD candidates if
draw-call count ever becomes the bottleneck rather than download size — worth measuring
draw calls before optimizing them, not assumed.

### D.7 Mobile budgets — general guidance, hedged appropriately

Could not find an authoritative, numerically specific 2025/2026 source (checked
Khronos's own "Asset Creation Guidelines 2.0" announcement — no hard numbers given).
Several practitioner blogs (utsubo.com, low-poly.com, threejsroadmap.com) converge on
similar ranges for 2026 that are directionally useful but **not independently
benchmarked by me** — treat as industry-blog consensus, not spec:

- Mobile web scene triangle budget: roughly 30,000–150,000 triangles total, notably
  lower than native mobile apps due to device diversity.
- Mid-range Android in 2026: reported to sustain 300k–500k on-screen triangles at 60fps
  once shaders/lighting are simple — but the web target should stay well under that for
  headroom.
- Draw calls matter more than triangle count on mobile GPUs; instancing/batching cited
  as capable of 90%+ draw-call reduction where applicable.
- Total download budget for a glTF scene with LODs: "under 15 MB" cited as a common
  guideline, "under 8 MB" for more constrained mobile-streaming contexts.

**The only number that actually matters for this project is its own, and it's already
excellent:** 295 KB gzipped for the entire monument set today, with a demonstrated
willingness to reject anything that grows the budget for invisible detail (the
three-tier plinth that pushed a 127 KB file to 443 KB, rejected in the README). Every
recommendation above is sized against that discipline, not against generic industry
budgets that would consider even the *unoptimized* current file trivially small.

---

## Summary

**Texture shortlist total (if #1 + #2 taken, the realistic pair):** ≈190–260 KB added,
against a current 295 KB gzipped 3D budget — call it **roughly doubling** the site's 3D
payload for one real material variety on the granite plus one weathering accent.

**Single highest-leverage delivery optimization, tested on the actual file:** apply
`gltf-transform meshopt input.glb output.glb --level high` (or the equivalent `gltfpack
-cc`) to `mamallapuram-monuments.glb`. Verified result: **301,860 B → 167,796 B
gzipped, a 44% cut, for a 6,460 B gzipped decoder** — a ~128 KB net win on first load and
every load after, with all 722 meshes and 53 materials provably unchanged. This costs an
afternoon, no textures, no new assets, no license questions, and touches nothing the
README currently claims about the model's fidelity. It is available today, independent
of anything else in this report.
