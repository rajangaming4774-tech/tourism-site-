# India Heritage Tourism Map

A static site (no build step, no npm) — plain HTML/CSS/vanilla JS, served
locally by `scripts/serve.py`. See [PLAN.md](PLAN.md) for the project's
overall scope (the map, timeline, and per-state content rollout).

```bash
python scripts/serve.py       # serves the project root at http://localhost:5500
```

> There is no `package.json`, so the "npm scripts" below are plain bash:
> `stitch:video` → `bash scripts/stitch-video.sh`,
> `encode:video` → `bash scripts/encode-video.sh`.

## 3D on the national map

`index.html` stays flat and on the globe at country zooms, then tilts into 3D on its
own once you pass **z13.2** (and drops back out at **z12.8** — the gap is deliberate,
so a map sitting on the line can't flap). Terrain needs a mercator projection, so
entering 3D swaps the globe out and leaving it puts the globe back. The `#terrain-btn`
still forces either state, and a deliberate press outranks the zoom rule for the rest
of the visit. `prefers-reduced-motion` keeps the map flat and button-only.

Terrain exaggeration now slides with zoom — 1.8 at z6, 1.0 by z13. The old fixed 1.8
was tuned for Himalayan relief seen from far out; held that high close in, it turns a
25 m coastal ridge into a mountain. The `dem` source went from maxzoom 12 to 14 for
the same reason.

**Two classes of mass, and they are not equally trustworthy** — the same split the
guide map documents:

- **City massing** (`massing` layer) is the *basemap's* building footprints stood up
  from CARTO's OpenMapTiles `render_height`. It is **not measurement**. OpenMapTiles
  fills that field from an OSM `height` tag where one exists, from levels where it
  doesn't, and from a default where neither does — and the three are indistinguishable
  once baked into a tile. A tall tower really is tall; a 5 m shop may just be untagged.
  The `#massing-note` card on screen says so whenever massing is visible.
- **Mahabalipuram's monuments** (`monument-extrusion` layer) are the guide map's own
  `data/mahabalipuram-footprints.geojson` — five monuments, each from a real OSM
  outline, a published height and a published storey count. Loaded lazily, only when
  the viewport is over the site at z14+. Clicking a tier opens the height, what it
  measures, the storey count and both citations, and repeats the guide map's admission
  that the *step shape* is stylised even though the height and storey count are cited.

The Shore Temple is **not** extruded, on either map. Its OSM way is the walled prakara
around both shrines — 46 × 21 m against a cited ~15 m platform — and the published 18 m
belongs to the Kshatriyasimhesvara tower alone, so standing that outline up would put a
46 × 21 × 18 m slab on the shoreline. Its detail card says this rather than staying
silent. It qualifies with no code change the day OSM carries a separate way for the
vimana; the full reasoning is with the height table in
`content/mahabalipuram-heights.js`.

## Descent of the Ganges — the granite, and why it is not carved

The relief that used to stand here was 405 nodes of procedurally placed elephants,
calves and figure blocks. It read as a stepped mass of boxes, and it is now **deleted**
(`js/scene-3d.js` → `replacePenance`, which removes the nodes and disposes their
geometry; the scene's mesh count drops 722 → 317). It was not hidden and not improved.
An invented composition is worse than an uncarved rock, because a visitor cannot tell
which parts are evidence.

`js/scene-penance.js` replaces it with the two natural granite masses and the fissure
between them, at the published size: **29.26 m along the relief, 13.10 m at the tallest
point, a 0.56 m cleft**. The masses are superellipsoids rather than boxes or plain
ellipsoids — a subdivided box keeps a square silhouette however much noise you add
(which is what made the earlier base read as two walls), and a plain ellipsoid domes
away into a river cobble. The exponents give a whaleback: steep for most of its height,
rounded across the crown, blunt at the ends so the cleft is a slot rather than a V. The
east side is sliced to a broadly planar scarp, because that face is what the sculptors
worked, but it keeps its undulation — a perfectly flat face reads as sawn concrete.

**Nothing here is carved, deliberately.** The hundred-odd figures are a fact about a
real surface. They are recoverable from an orthographic photo plate or a photogrammetry
scan and from nothing else — not from a written description, however detailed. The
geometry lays down a planar UV projection matched to a 29.26 × 13.10 m plate, so the
carving drops in one of two ways with no change to the shape:

1. An orthophoto of the real face, as a displacement + normal map through those UVs.
2. A scan, dropped in as a GLB replacing the group.

Two human figures stand at the foot of the face, because 13 m of stone only reads as
13 m when there is something 1.7 m beside it.

`assets/models/arjunas-penance-base.glb` and `scripts/build-penance.py` remain as the
Python route to the same geometry (numpy + trimesh), for whenever those are installed.
Neither is loaded at runtime.

## Superseded: the imported base GLB

`assets/models/arjunas-penance-base.glb` is the two monolithic granite masses at true
scale — 29.26 m across, 13.10 m at the highest point — with the natural fissure the
sculptors used as the river between them. Built by `scripts/build-penance.py`
(numpy + trimesh; `python scripts/build-penance.py` rewrites the GLB in place).

The carved face is deliberately left **planar and UV-mapped** for an orthographic photo
projection. The relief itself is a texture and displacement job: 
you cannot author Pallava carving from a text description, so the model provides the
rock and stops there.

Placement in `js/scene-3d.js` is derived, never typed in. The model's local frame is X
along the relief, Y up from the ground, +Z into the rock with the carved face at Z = 0.
The monument really runs north–south, so a −90° turn about Y maps local X to world Z and
leaves the carved face looking **east**; the rest — centre line, face plane and base
height — is measured off the procedural relief already in
`mamallapuram-monuments.glb`, so the two occupy the same ground exactly.

That procedural relief (405 nodes of elephants, calves and figure blocks) is **hidden,
not deleted** — this base carries no carving yet, so it is a trade, not an upgrade. Set
`SHOW_PENANCE_BASE = false` in `js/scene-3d.js` to put it back.

Two things about the asset are corrected at load rather than in the file, so it survives
being regenerated as-is: the export carries only `POSITION` and `TEXCOORD_0`, so normals
are computed on load (without them the mass lights as pure black), and glTF's default
`metallicFactor` of 1.0 is forced to 0. The 2×2 grey stub trimesh writes as
`baseColorTexture` is dropped in favour of the granite the rest of the site uses —
but only while it is a stub, so a real photo plate is honoured automatically.

## Mahabalipuram scroll tours

[mahabalipuram.html](mahabalipuram.html) opens with a full-bleed,
scroll-scrubbed 3D video tour before the title card. Scrolling drives the
video's `currentTime` directly; a big title + one-line caption changes as
each part of the model comes into frame.

There are **two layouts over the same engine**, chosen by `TOUR_MODE` at the
top of [js/tours-mount.js](js/tours-mount.js) — flip it and reload to compare:

| `TOUR_MODE` | What it does | Content file |
|---|---|---|
| `'combined'` *(current)* | One stitched master video, one scroll track. Chapters grouped by monument; heading + section number cross-fade during each dip-to-black. | `content/mahabalipuram-tour.js` |
| `'sections'` | One section per monument, each with its own ladder, and a numbered transition band between them. | `js/monuments-content.js` |

### The pieces

| File | Role |
|---|---|
| `js/scroll-tour.js` | The engine, no monument content in it. `create()` builds one section (sections mode); `createCombined()` builds the single grouped track. Handles tier/codec selection, scrub, captions, and the right-hand rail. |
| `scripts/stitch-video.sh` | Joins the individual clips into one master with the right transitions, and prints the clip offsets. |
| `scripts/encode-video.sh` | Builds the ladder (2160p/1440p/1080p/720p; HEVC + AV1 + H.264 fallback) and posters from one source. |

### Combined mode: stitching

```bash
bash scripts/stitch-video.sh --trim-corner --encode
```

Takes `assets/video/{shore-exterior,shore-interior,arjuna,rathas}.mp4` in that
order, normalises them to one size / frame rate / pixel format / colour space,
and joins them — a soft 0.4s `fade` between the two Shore Temple clips so they
read as one move, a 0.6s `fadeblack` at every monument boundary. `--encode`
then runs the ladder on the result.

It prints a **`CLIP_OFFSETS` block ready to paste** into
`content/mahabalipuram-tour.js`. Each number is where that clip is *fully*
visible (i.e. where its transition ends), and chapter times in the content
file are written relative to their own clip and offset by it — so after any
re-stitch, paste the new block and every chapter moves with it.

A missing clip is skipped with a warning and the offsets close up around it,
so you can stitch what you have and re-run later.

### Adding a monument (~5 minutes)

**Combined mode:**
1. Drop the clip in as `assets/video/<name>.mp4` and add it to `ALL_CLIPS`
   / `ALL_MONUMENTS` in `scripts/stitch-video.sh` (in timeline order).
2. `bash scripts/stitch-video.sh --trim-corner --encode`
3. Paste the printed `CLIP_OFFSETS` block into
   `content/mahabalipuram-tour.js`.
4. Add a `groups` entry there: `{ monument, number, heading, subheading,
   chapters: [{ start: at(CLIP_OFFSETS.<name>, 0), end: …, title, body }] }`.

**Sections mode:** encode the clip on its own
(`bash scripts/encode-video.sh assets/video/<name>-source.mp4 --trim-corner`),
add an entry to `js/monuments-content.js`, and add it to `ORDER` in
`js/tours-mount.js`.

## Mahabalipuram on-site visitor guide

[mahabalipuram-guide.html](mahabalipuram-guide.html) is the map you open **while
standing at the site**: where you are, a walking route between the monuments, and
where the facilities are. It is a separate, deliberately light page — someone on
mobile data at the site should not have to download the ~300 MB of video the main
guide carries.

| File | Role |
|---|---|
| `scripts/fetch-site-data.js` | Fetches monuments, facilities, the footpath network and the ASI boundary from OpenStreetMap, and generates the route geometry. |
| `data/mahabalipuram-osm.json` | Generated. Monuments + facilities, with `fetched` date, per-category counts and an OSM id on every record. |
| `data/mahabalipuram-paths.geojson` | Generated. The walkable network — also what the route is traced along. |
| `data/mahabalipuram-routes.geojson` | Generated. One LineString per leg. |
| `data/mahabalipuram-park.geojson` | Generated. The protected-area outline. |
| `content/mahabalipuram-monuments.js` | Hand-authored. The 23 monuments, shared with `js/place.js`. Each carries an `osm` id (its coordinate reference), a `photo` flag and `sources[]`. |
| `js/wiki-photo.js` | Shared Wikipedia photo lookup — memoised, rejects disambiguation pages, credits the source. Used by both pages. |
| `content/mahabalipuram-routes.js` | Hand-authored. Stop **order and notes only** — the line on the map is generated. |
| `js/guide-map.js` / `js/guide-mount.js` | The map engine and its mount. |
| `js/monument-pictures.js` | Hand-drawn. The 24 × 24 top-down picture of each *kind* of monument (stepped pyramid roof, wagon vault, cave mouth, boulder, walled compound…), shared by the guide's pins and the destination page's site plan so both draw the same thing for the same monument. Type pictures, not portraits — the provenance line and the plan's legend say so. Which picture: `picture` → `roof` → `form` on the content entry. |
| `js/monument-diagrams.js` | Hand-drawn. The labelled sketch for each main monument's card — "What you will see here". A part is placed only where a source says where it is; otherwise it is listed under `also` and the caption says it is not placed. |
| `scripts/build-part-positions.js` | Computes where the numbered parts of the Shore Temple and the Pancha Rathas stand, for the site map. `--check` re-validates. |
| `data/mahabalipuram-part-positions.json` | Generated. Per part: `lngLat`, `how` (in words), `accuracy_m`, and `approximate` where placed from a description. |
| `assets/photos/` | Two small copies of 1860s public-domain prints of the Descent of the Ganges (James Fergusson Collection, Boston Public Library), served locally because the library's host is not in the CSP. |
| `content/mahabalipuram-heights.js` | Hand-authored. One entry per candidate monument: height, what it measures, and a **required** source citation. `height: null` records *why* something is not extruded. |
| `data/mahabalipuram-footprints.geojson` | Generated. One feature per **tier** — OSM outlines for exactly the monuments with a cited height, stacked into their documented storeys, with the height and citations baked in. |
| `data/mahabalipuram-plan.geojson` | Generated by `scripts/fetch-plan-areas.js`. The areas on the destination page's site plan: the OSM outline of every monument that is an OSM way (13 of 24), water bodies (the Temple pond, the Kanhari tank, the backwaters) and landcover (grass, park, garden, scrub, beach) in the core bbox — OSM geometry as mapped, with `counts` recording what OSM has and has not. |

### The 3D view

## The schematic layer (`mahabalipuram-schematic.html`)

A **massing study for approval**, and the step that comes before any modelling. It fixes
the site layout, the relative proportions and the twelve camera compositions, so those can
be signed off before anyone spends time on geometry.

It is a **separate page**. `mahabalipuram-3d.html` is not touched by it — the finished view
keeps its own look and its own behaviour. What the two share is data and the scene contract
(origin at the site centre, Y-up, 1 unit = 1 m, +X east, −Z north), so anything approved on
the drawing lands in the same place when it is built. It imports `js/scene-massing.js` for
the projector and `js/scene-tour.js` for the keyframes, both unchanged, which is what stops
the drawing and the finished view from disagreeing about where a monument is or what the
camera does.

**It looks like a drawing on purpose.** Cool paper, flat unlit fills, ink edges, 2 m
contours and visible drawing furniture. A schematic that is merely an ugly render invites
the wrong conversation — people start reviewing the shading. It also means a screenshot of
this page can never be mistaken for one of the finished view, so an approval cannot get
attached to the wrong thing.

**What it refuses to draw is the point.** A schematic is exactly where an invented
dimension would pass unnoticed and then get built, so:

| Drawn as | What it means | Count |
|---|---|---|
| Massing (warm fill, accent edges) | A published height **and** a published storey count | 5 monuments, 12 tiers |
| Ground cross | OSM records a position and nothing else | 34 marks in the sheet |
| Faint outline | Town and granite, for context only | 293 rings |

The page carries two tables generated from the data, not typed: the **cited** monuments
with their sources, and the **modelling backlog** — 10 monuments with the specific reason
each one has no height. Those reasons are real and various: the Shore Temple's OSM way is
the enclosure, not the temple; Nakula-Sahadeva has no published dimensions at all;
rock-cut mandapas are excavated *into* a cliff so their outline cannot be extruded; one way
covers two separate monoliths; Olakkanneshwara is a bare node. The drawing therefore doubles
as the scope document — the massing is what can be modelled from sources today, and the flat
marks are what needs a measurement first.

**Where it is linked from.** The footer of `mahabalipuram.html`, under "In review" —
deliberately *not* the "Going today?" band alongside the site map and the 3D view. Those two
are visitor features; this is a working document, and listing it as a third one would
misrepresent it. The page is also `noindex`.

**Reviewing it.** Overview and Plan frame the cited monuments (computed from their bounding
box against the real frustum, so it is right on any viewport). Prev/Next step the twelve
scenes; Play flies them. Stepping beats scrolling for a review — a reviewer wants to go
straight to scene 7 and argue about it.

Three bugs worth recording, because two are the kind that look like something else:

- **A zero-width start produced a NaN camera and a permanently blank drawing.** If the page
  starts in a container with no width — a hidden tab, a `display:none` parent — then the
  aspect is 0, the horizontal field of view is 0, and dividing by its tangent sends the
  camera to infinity and then to NaN. Nothing rendered, and nothing reframed afterwards, so
  it never recovered. The fitter now detects a degenerate size, skips framing, and retries
  from a `ResizeObserver` on the element itself — `window`'s `resize` never fires for an
  element becoming visible.
- **Decluttered labels stayed on screen, stacked in the top-left corner.** `.sch-label` sets
  `display: grid`, which beats the user agent's `[hidden] { display: none }` — same
  specificity, and this sheet loads later. It looked exactly like a label attached to the
  wrong monument. Fixed with an explicit `.sch-label[hidden] { display: none }`.
- **The key contradicted the drawing.** Accent was promised to mean "cited massing", but
  tier 1 was inked and only upper tiers accented, so every monument's base was a different
  colour from its own storeys.

### Elevations, sections and the 3D schematic (`js/schematic-sheets.js`)

Five drawing sheets — **plan, elevation, section A–A and axonometric** for every monument with cited
dimensions — built as **SVG**, not in the 3D scene. An elevation is an orthographic drawing
you scale things off; rendering one through a perspective camera would be a picture of an
elevation rather than an elevation. SVG also prints, stays crisp at any zoom, and works with
WebGL off, so the sheets are generated in `renderSchedule()` alongside the tables rather than
in `start()`.

All five are drawn at **one shared scale** (`PX_PER_M`), with a scale bar on each. Fitting
each monument to its own box would put an 11 m tower and a 5.5 m hut at the same size on the
page, and comparing them is the main thing the set is for.

**The footprints are not aligned to north, and that broke the first version.** Dharmaraja
stands at 61°, Bhima at 55°. The first pass projected each tier onto the east–west axis and
called it an elevation. It wasn't one — projecting a rotated building onto an arbitrary axis
gives you the diagonal across it, so the silhouette came out too wide and the dimensions with
it. Dharmaraja's plan was being reported as **14.2 × 14.4 m when its sides are 10.8 × 10.3 m**,
which inflated a 21% difference from the cited plan into an apparent 67% one — an argument
about OSM accuracy the data does not support.

Each monument now gets a local frame from the **minimum-area rectangle** of its ground tier
(convex hull by monotone chain, then the rotating-calipers fact that the min-area rectangle
shares an edge with the hull). Plans are drawn square to the page in that frame with a north
point showing the true bearing; the elevation faces the long side and the section cuts across
it. The frame comes from the *ground* tier and every tier is drawn in it, so the storeys stay
aligned instead of each finding its own angle.

Measured against those true axes, the OSM outlines run **roughly a fifth to a quarter wider
than the published plans** (Bhima 16 × 9.1 m against a cited 12.8 × 7.3 m) — consistent with
OSM tracing the visible footing and apron rather than the building line. Both numbers are
printed on every sheet.

**The drafting grammar carries the honesty**, which is the point of drawing them this way:

| Convention | Means |
|---|---|
| Solid heavy line | Measured — the OSM plan outline, the ground line |
| Dashed thin line | A construction line: a convention, not a level |
| Accent dimension | The one figure straight from a source (overall height) |
| Dashed tier outline | A `cap` — a shape step, never a storey |
| Hatched fill | Cut material in section |

So tier lines are dashed because the storey *count* is cited but the *split* between storeys
is a constant-slope convention; and the sections are **solid** because no interior dimension
is published for any of these. The rathas are monoliths and largely are solid, but each has a
small shrine cell that is not drawn. A blank section is honest; an invented cell would not be.

A north needle that rotates with the frame has to have its **letter counter-rotated**, or at
most bearings the "N" ends up sideways and the whole mark reads as a scribble.

**The axonometric is the 3D schematic**, and it is a projection of the same per-tier prisms
rather than a separate sketch — which is what stops it becoming a flattering picture of a
monument the other three panels describe differently. It is labelled **not for scaling**:
the horizontal axes are foreshortened by cos 30° while the vertical is true, so a ruler
gives three different answers depending on how you hold it. Dimensions live on the elevation.

Hidden surfaces are resolved without a depth buffer, which an SVG cannot provide: only side
walls whose outward normal faces the viewer are drawn, and tiers are painted from the ground
up so an upper storey covers the roof below. That is exact for stacked convex prisms. It is
*not* general — a genuinely concave form would break it.

It also gets **its own scale** (0.72 of the orthographic one). A projection spreads a plan
across both screen axes, so Bhima's 16 × 9.1 m footprint came out ~238 px wide in a 210 px
panel and ran off the sheet. Shrinking only this panel is the right trade, since it is
already not for scaling, and one shared factor keeps the five comparable with each other.

**Edges are only drawn where the plan actually turns** (threshold 24°, plus the silhouette).
Krishna's Butterball is a 28-point traced outline, and stroking every vertex turned a round
boulder into a fluted column — a worse likeness than the plain box on its elevation. Those
13° turns are tracing resolution, not corners. Rectangular rathas turn 90° and are
unaffected: a two-tier ratha draws 10 edges, the boulder 47.

**Still not done:** no dimension strings beyond overall height and plan extents, no titled
sheet borders or revision block, and no elevations for the 10 monuments in the backlog —
those have no cited height, so there is nothing to draw them against.

## Mahabalipuram in 3D (`mahabalipuram-3d.html`)

Opens on a rotating globe; click India and the camera descends to the site. Real
terrain under a real satellite photograph, a physical sky with the sun that lights it,
a moving sea on the mapped coastline, real massing, clickable monuments, facility
markers, a cinematic flythrough. What it looks like, and what it costs, is in
[Sky, sea and satellite ground](#sky-sea-and-satellite-ground) and
[Tiers, the watchdog and what downloads](#tiers-the-watchdog-and-what-downloads) below.

### You drive: the joystick

The 3D scene is **navigated, not scrolled**. An on-screen joystick sits bottom-left; push it
and you travel over the site, release and you stop.

Scrolling a twelve-screen track was a reasonable way to *scrub* a fixed flight and a poor way
to look around: you could only go where the rail went, the page was 1200vh tall, and on a
phone every attempt to look at something moved you somewhere else. The scroll listener is
gone, and the page is an ordinary height again.

Two decisions inside it:

- **The stick moves; it does not turn.** Dragging the scene already orbits, so a stick that
  also rotated would fight that gesture for the same intent. Stick translates, drag turns —
  the division every third-person camera uses.
- **Movement is horizontal only.** Following the terrain sounded better than it looked: the
  ridge is 26 m over a 4 km board, so riding it pumped the camera up and down while you were
  trying to read a monument. Altitude belongs to zoom, which the wheel and pinch already own.

Speed scales with how far out you are (clamped 45–700 m/s) — a nudge beside a monument, real
distance over the whole coast — because one fixed speed is either unusable close in or
glacial far out. The pivot is clamped to the surveyed board (±1900 m), camera and target
corrected together so the framing never shears. `dt` is capped at 50 ms, or a backgrounded
tab would return and teleport you.

It is focusable and answers the arrow keys (and WASD), because a drag-only control would be
the one route around the site a keyboard could not take. Taking the stick cancels whatever
scripted camera is running — you are driving now.

**There is now a floor under every camera, and it is a clamp, not a follower.** The
terrain-following stick above was rejected because it *set* the camera's height from the
ground and pumped it over the ridge. `floorAt(x, z)` in `js/scene-3d.js` does the opposite
job: it never raises the camera to track the ground, it only refuses to let one go below
ground plus a clearance (6 m under your control, 14 m for any scripted flight), and below a
monument's measured top plus 12 m inside that monument's ring. It is applied to the sampled
pose after `OrbitControls.update()`, which re-derives its own spherical from the corrected
position on the next frame, so the clamp sticks without fighting the controls. That is what
let `minDistance` drop from 90 m to 45 m.

**Verified in the live scene**, not just by reading: a 900 ms push travelled 204 m and
stopped dead on release (0 m coast), with altitude and camera–target distance both unchanged;
scrolling the page moved the camera 0 m; grabbing the stick mid-tour cancelled the tour. The
direction maths is covered by a headless harness against the vendored three.js — stick-up
tracks the view direction to a dot product of 1.0, strafe is the camera's true right, the
board clamp holds without shearing, and a straight-down view is refused rather than producing
NaN.

### The twelve scenes, now on a clock

The twelve-scene flight survives as something you **play** from *Cinematic tour*, on a 66 s
timer, because nothing about those keyframes ever needed a scrollbar. It is no longer entered
automatically on arrival — landing straight into it took the camera away before the visitor
had looked at anything.

The camera still follows **one continuous spline** through the site
(`js/scene-tour.js`). The brief's twelve scenes are keyframes *on* that path, not twelve
shots cut between — which is the point, since the requirement is "no teleportation, no
abrupt camera cuts". Position and look-at are both Catmull-Rom curves, which are
C1-continuous: velocity carries through each keyframe instead of stopping and restarting.
Scene 5's orbit of the Shore Temple is three keyframes so the spline reads it as one
swing. Verified: all twelve reachable in strict order, no skips.

It engages once the descent from the globe lands, and any drag hands the camera back —
someone reaching for the model wants to look at it, not be carried onward.

**Scroll is mapped uniformly across the keyframes, not by arc length.** Arc length was
the first instinct and it is wrong here: it makes scroll distance proportional to distance
travelled, so the two-kilometre transits swallow the timeline and the close approaches get
nothing. Measured, scenes 10 and 11 — up to the relief, then into the cleft — held about
**5% of the scroll between them** and flashed past, while the final pull-back took a
quarter. Those are scenes the brief asks for by name. Under uniform mapping every scene
gets at least **6.6%**, scene 5's orbit 20%, and the opening and closing shots 10% each
(they sit at the ends of the spline, so each has a second slightly-offset keyframe to
restore a full share and add a slow drift rather than a dead hold — offset, not
duplicated, because a repeated control point makes a zero-length segment).

The camera then moves fast over long legs and slowly at the subjects, which is what a
flight does anyway. Verified headlessly: no scene starved, and the largest single-step
camera move over 1000 samples of the path is 43 m across several kilometres — continuous,
no jumps.

**The feel, on top of the same path.** The keyframes and the uniform mapping are
untouched; `apply()` in `js/scene-tour.js` now shapes the parameter and the gaze:

- A global ease — the flight departs from rest over the first 4 s and settles over the
  last 5 s, linear between, so it neither lurches off nor stops dead.
- A *partial* ease through each keyframe (`K = 0.35`): velocity dips to about 65 % at
  each scene rather than to zero, because zero would recreate the very hitch the file's
  header warns about. Off across the Shore Temple orbit, whose swing must stay even.
- Look-ahead: the gaze samples the target curve about 0.8 s ahead of the position, so
  the camera turns *into* a bend the way a vehicle does instead of swinging after it.
- Bank: a little roll from the yaw rate, at most 2.5°, smoothed over 0.25 s. Stateless —
  `camera.up` is never touched, so the first `controls.update()` after the tour resets it.
- The terrain floor above, at 14 m. The keyframes already clear it; this is the net for
  the 9→10→11 approach into the cleft and for any future edit.

Sampled at 10 Hz over the whole 66 s in the live scene: the camera never comes within
14 m of the ground, roll never exceeds 2.5°, and the twelve captions arrive in order.
The presentation goes with it: letterbox bars, the label pills hidden (a trailer has no
pills), captions that fade between scenes, and the joystick dimmed but present, because it
is the documented way out. All of it is instant under `prefers-reduced-motion`.

**FLY THROUGH stops dead ahead no longer.** Each monument now has a hero pose: distance
scaled to the monument's own ring (the same radii the hover highlight uses), a 24°
look-down, the target at 40 % of the measured height, and the camera on the *sun* side so
the lit faces are the ones in view. The great relief is the one override — a 13 m
east-facing rock face is viewed from the east, low and close. Between monuments the dolly
takes 2.6 s and cranes up and over (an arc of up to 120 m) instead of tracking through the
town, then holds 3.4 s to read.

**Arrival is a glide, not a cut.** Landing from the globe used to set the camera at a
fixed multiple of the home pose. It now starts from an approach pose on the same
bearing, well out and well up, and eases into the hero shot over 3.8 s under the descent
wash. And the hero shot itself is *derived*, not typed: at fov 45 the Shore Temple's
measured 19.25 m tower is framed at 46 px whatever the stage height — the distance
comes out of `d = H·S / (2·tan(fov/2)·46)`, clamped to 220–420 m — pitched 14° with the
horizon high in the frame, from 50° round to the south-east of straight-out-to-sea. That
last number is the sun: dead out to sea looks west, *into* a low south-west sun, with the
temple's east face in shade. Fifty degrees round puts the sun behind the camera's left
shoulder and the lit south face in view — the three-quarter view every photograph of this
temple is taken from. "Frame the whole site with the temple legible" was tried first and
is arithmetic-impossible: 46 px needs the camera within 390 m and the rathas are 1,467 m
away.

Three bugs worth remembering, all found by looking rather than by reading:

- **`OrbitControls.update()` rewrites `camera.position` every frame whether or not
  `enabled` is false.** It was overwriting each pose the instant the tour set it. It is
  skipped entirely while the tour drives.
- **Arc-length parametrising the two curves independently desynchronises them.** The
  position curve is kilometres long and the target curve a few hundred metres, so
  `getPointAt(0.32)` landed on scene 5 along one and near scene 2 along the other — the
  camera stood correctly beside the Shore Temple and stared inland at the ridge. Both now
  sample the *same* curve parameter, with arc length applied only to the position so the
  speed stays even. The captions come from scroll progress, so they looked right the whole
  time the camera was 500 m wrong.

### Sky, sea and satellite ground

The scene used to end against flat cream with a sandy blur for ground, a teal plane for
sea and near-black lines for roads. What it has now, and what each part claims:

**The ground is a real satellite photograph.** `scripts/build-ground.js` — Node builtins
and `zlib` only, the same posture as `build-terrain.js` — asks the Earth Search STAC API
(no key) for the newest cloud-free Sentinel-2 L2A true-colour scene over the site, pinned
to `S2C_44PMV_20260305_0_L2A` (5 March 2026, 0 % cloud; `--search` re-queries), reads the
two 1024 px tiles it needs from the public COG with HTTP range requests (2.9 MB at build
time), inflates the DEFLATE + predictor-2 rows itself, reprojects every output pixel
scene → WGS84 → UTM 44N with a self-tested forward formula, and writes a **400 × 400 px
board at native 10 m per pixel** — `assets/textures/ground-s2.jpg`, **49 KB**, plus a
sidecar `ground-s2.json` carrying the scene id, capture time, sun position, attribution
and the three colour means the look was calibrated against. 400, not 401 or 1024: at
400 the GPU's texel centres land exactly on 10 m sample centres, and upsampling in the
bake is byte-for-byte what the GPU's bilinear filter already produces. **No sharpening, no
contrast, no colour change** — the file is evidence and ships as-is; the one unavoidable
decision (the TCI is linearly scaled reflectance, loaded as sRGB like every viewer does)
is written into the sidecar's `processing` field. The provenance line under the scene is
interpolated from that sidecar, never typed, and says the rest: a 20 m monument is two
pixels of it, and the photo's own morning shadows do not match the scene's afternoon
sun. Attribution required and present: *Contains modified Copernicus Sentinel data 2026*.

**The sky is physical.** `js/scene-sky.js` renders a Preetham sky (`Sky.js`, vendored into
`assets/vendor/three-post/` with the same one-line import rewrite the post passes got)
with the sun at 230° / 26° — the low south-west afternoon sun the scene already had, kept
because long raking shadows are what make a 26 m ridge and a row of 8 m buildings read as
relief from the air. One vector drives the sun disc, the environment map and the
`DirectionalLight`, so they agree by construction. The environment is generated **once**
with `PMREMGenerator` from a *second* sky with the 19000× sun-disc line cut from its
shader — the light already *is* the sun, and a disc in the environment lit everything
twice and smeared into a glow the sea reflected as a milky sheet. ACES filmic tone mapping
at exposure 0.9, and the exposure is calibrated, not eyeballed: rendered top-down at
300 m with the fog off, eight open-ground points are compared pixel-for-pixel with the
photograph itself, and the median luminance ratio must sit within 15 % of 1. The first
pass (exposure 0.8, hemisphere 0.45, environment 0.35) gave **0.63** — the photo was
rendering a third too dark, and an earlier "within 2 %" reading had been fog, sampled
from 1.4 km up. The lights carried the correction (hemisphere 1.2, environment 0.6,
exposure 0.9 → **0.95**) rather than the exposure alone, so the drawn sky and the sun's
glitter did not brighten with the ground. Exponential haze (`FogExp2` at 0.00018: 16 % at 1 km, 51 % at 4 km, 83 % at 10 km —
it began denser, and from 300 m up the sea beyond the board was a pale sheet with the
coast lost inside it), and a horizon veil — one cylinder, vertex-alpha 1 → 0, drawn in the fog colour — so the far apron and
sea always meet the sky exactly, on both render paths. That last clause matters: the
direct path mixes fog after tone mapping in sRGB and the composer path before it in
linear, so one hex looks different on the two, and `setFogColour()` converts for
whichever is running.

**The sea is drawn on the mapped coastline.** `js/scene-sea.js` takes the OSM coastline
(47 nodes inside the board, up to 277 m apart), smooths it with three Chaikin passes,
resamples to 5 m, bakes a signed distance to it into every vertex of a 20 m nearshore
grid, and carries a coarse strip out to the camera's far plane. That distance also
**corrects the DEM**: the 30 m terrain and the OSM line disagreed by up to 70 m, which
is why a third of the board's cells sat below the old foam threshold and the coast was a
staircase. Cells seaward of the line are held at 0 m, and so is a 30 m wet-sand band
inland of it, with a lerp back to the DEM by 70 m — exactly as wide as the Shore Temple
allows. It stands 76.8 m from the line and its bilinear ground sample reads cells at
−70.8, −73.8, −77.3 and −83.8 m; a band to −75 m moved it from 4.29 to 4.03 m, one to
−100 m to 2.45 m. The `[3d] coast:` log prints both monuments' ground heights on every
load and they must be **4.29 m and 9.27 m, unchanged**, because the GLB bases are baked to
them. The water itself is a `MeshStandardMaterial` with `onBeforeCompile` — not
`Water.js`, which re-renders the whole scene into a reflection texture every frame — so
it gets shadows, fog, ACES and Fresnel from the same code as everything else: three small
swells plus two octaves of noise perturb the normal (the first swell slopes were three
times larger and the sea read as corduroy under the low sun), colour goes deep → shallow
over 250 m, surf lines come from a sine of the distance to shore itself (13 m apart,
running shoreward, wobbled by noise), and water's real 2 % Fresnel base replaces the 4 %
Standard assumes. Two GLSL facts learned the hard way and recorded in the shader:
`smoothstep(a, b, x)` is *undefined* when `a > b` (a reversed call painted foam across
the whole nearshore on this GPU), and the noise had to be broken up by shore-distance
lines rather than axis-aligned scaling, or it tiled.

**Roads sit in the photograph instead of on it.** In the satellite frame the real
highway is *lighter* than the town around it (`#a18b6d` against `#73634a`), so the old
near-black asphalt (`#46423b`, a third of the sand's luminance) and cream shoulders were
inverted from reality. `js/scene-roads.js` is calibrated to the photo — carriageway
`#877d70`, a 1.2 m shoulder a shade lighter — takes its normals from the terrain gradient
so a lane on the ridge shoulder shades like the shoulder, and fades with altitude: the
photo already carries every road at 10 m, so above 900 m the ribbons drop to 55 % and only
crisp it, while footways are invisible above 400 m as they are in any real aerial. The
massing and infill palettes (`scene-massing.js`, `scene-infill.js`) were darkened about
35 % for the same reason: tuned against cream sand, they floated as paper boxes over a
ground whose median luminance is 85/255.

Everything in this section except the photograph is optical and carries no declaration —
the sky, sea, haze, colours and roads say "this is a place", not "there is something at
this spot". The photograph is data, so it is declared, with its date and its limits.

### Modelled monuments (Shore Temple, the five rathas, the relief)

Three sites are no longer extruded footprints — they are **authored geometry**, built in
Blender to published measurements and exported as one GLB
(`assets/models/mamallapuram-monuments.glb`, 800 KB raw / **165 KB gzipped**, 722 meshes,
53 materials — it roughly doubled when the relief gained its courses and carving, and grew
again when the stone was aged, then halved again when it was compressed).

**It is meshopt-compressed, and that is why the decoder is wired in.** The file shipped
uncompressed until 2026-09-07 — `extensionsUsed` was `KHR_lights_punctual` and nothing
else. `gltf-transform meshopt --level high` took it from **301,375 to 169,034 bytes
gzipped, −43.9%**, against a decoder costing 6,435 bytes gzipped: a **~123 KB net saving**
on a file every visit to this page loads.

Draco was measured against the same file for comparison and **rejected**: it nets only
about 10.5 KB, because its 75–100 KB decoder eats almost the whole gain on 722 small
architectural primitives rather than a few dense meshes. `gltf-transform optimize` — the
one-liner that does everything — was also tried and **must not be used here**: it welds
the 722 meshes into 1, which would break both the `exclude` list in `buildMassing` and the
marker re-anchoring, since both find monuments *by node name*.

Verified in the browser rather than assumed, by loading both files side by side through
the vendored loader: 722 meshes and 12,367 triangles in each, **zero node names lost**,
and a **maximum per-mesh bounding-box deviation of 1.3 mm** (worst case `plinth_lower`).
Meshopt quantizes attributes, so that millimetre is real but is three orders of magnitude
below anything this scene resolves. Compression is lossless for topology; it is the
*attributes* that quantize.

`assets/models/mamallapuram-monuments.glb.bak` is the uncompressed original and is the
file any re-export or re-edit should start from — recompressing an already-quantized file
would stack the error. It is in `.vercelignore`: nothing loads it at runtime and it is
1.6 MB. Because both extensions land in `extensionsRequired`, GLTFLoader **throws** rather
than falling back if the decoder is missing, so `js/scene-3d.js` calls
`.setMeshoptDecoder(MeshoptDecoder)` before `.load()`. Removing that line does not degrade
the scene; it blanks the monuments entirely.

**The CSP had to change, and this is the trap worth remembering.** The meshopt decoder is
WebAssembly — it calls `WebAssembly.instantiate`. Chrome blocks that under
`script-src 'self'` unless `'wasm-unsafe-eval'` is present, so `vercel.json` now carries
it. `scripts/serve.py` sends **no CSP header at all**, which means this failed *only in
production*: the scene worked perfectly on localhost and the monuments vanished on the
deployed site, with

```
WebAssembly.instantiate(): Compiling or instantiating WebAssembly module violates
the following Content Security policy directive because 'unsafe-eval' is not an
allowed source of script in the following Content Security Policy directive:
"script-src 'self'"
```

Reproduced by serving a page with the production CSP in a `<meta http-equiv>` and loading
the GLB through the real loader — first `GLB FAILED`, then after the fix
`GLB LOADED: ok, 722 meshes`. Note `'wasm-unsafe-eval'` permits WebAssembly compilation
and **nothing else** — it does not enable `eval()` on strings the way `'unsafe-eval'`
does, so the policy stays as tight as it was for JavaScript.

Anything else WASM-backed added later — a KTX2/Basis transcoder is the obvious candidate —
needs no further CSP change, but **will** need testing against the deployed headers rather
than against `serve.py`, because `serve.py` cannot catch this class of bug.

**Nothing was taken off a shelf.** The model catalogue was searched first, as it should
be; it returned two "temple" assets, both Egyptian desert-kingdom stock. Using them would
have meant replacing real Pallava monuments with visually similar temples, so they were
rejected and the monuments were modelled from sources instead.

Everything dimensional is cited:

| | From the sources |
|---|---|
| Shore Temple | Main vimana **18 m, five talas**, on a **15 m square platform**, octagonal shikhara, tiers with overhanging eaves, facing east. Second Shiva shrine **dvitala**, facing the opposite way. Vishnu shrine between them, **deliberately towerless** — its tower is recorded as missing. Nandi along the compound wall. **Structural granite blocks**, not rock-cut. |
| Dharmaraja | 11 m, three talas, 8.5 m square, pyramidal. Nandi beside it. |
| Bhima | 7.6 m over two floors, 12.8 × 7.3 m, barrel *sala* vault with gable ends. |
| Arjuna | 6.1 m, 3.5 × 4.9 m, two talas. |
| Nakula-Sahadeva | **4.88 m high, 5.49 m N–S × 3.35 m** (18 × 11 × ~16 ft). Apsidal *gajaprishtha* vault, dvitala, its own monolithic elephant. Rear cell 3 ft deep × 4 ft 6 in wide. |
| Draupadi | 5.5 m, square, thatched-hut roof built as genuinely curved faces. |

The rathas share one continuous plinth in pink granite, as recorded.

**Both of these used to be stated as convention. Both are now sourced** (2026-09-07), from
the oldest survey of the site — Fergusson & Burgess, *The Cave Temples of India* (London,
1880), read directly from the archive.org scan rather than quoted secondhand
(`cavetemplesofind00ferguoft`).

- **The order is not convention.** p. 113: "the most southern of the Raths is called that
  of Dharmaraja, the next that of Bhima, the third that of Arjuna, and the fourth that of
  Draupadi … These four are situated in one line, extending about 160 feet north and
  south. The fifth … is situated **a little to the westward of the other four, and quite
  detached**." Corroborated at p. 116 and by Longhurst (1928) p. 22. So north→south is
  Draupadi, Arjuna, Bhima, Dharmaraja — **and Nakula-Sahadeva is not in the row at all**.
  Checked three ways and all three agree: the 1880 text, OSM centroids (which put it 7.1 m
  west), and this GLB's own accessor bounds (15.3 m west). The model was already right in
  kind; the 2× difference in the offset is the one thing worth reconciling in the source
  scene.
- **Nakula-Sahadeva has a published dimension after all.** p. 135: "Its dimensions are 18
  feet in length north and south, by 11 feet across, and the height is about 16 feet." It
  is no longer proportioned against its neighbours. Note that Longhurst (1928) pp. 21–22
  describes the same ratha in detail and conspicuously gives **no** measurements for it,
  while measuring its neighbours — which is why this looked like a genuine gap for so long.

One caution the 1880 text forces, in the other direction: **"one continuous plinth … as
recorded" is stronger than Fergusson supports.** His own sentence is that whether the
rathas were cut from a continuous ridge "cannot now be ascertained. My impression is that
it originally was a single ridge…" — an explicitly flagged impression, not a finding. His
160 ft also describes the natural ridge, not a built plinth, and no source gives a plinth
width or a footprint covering all five.

An unresolved conflict, recorded rather than silently resolved: Fergusson (p. 135) says
Nakula-Sahadeva's front faces **north**; Longhurst (1928, p. 21) says **south**. No
orientation claim should be made from either.

**The scene frame is the integration.** The GLB is authored at the viewer's own frame —
origin at the site centre, Y-up, 1 unit = 1 m, +X east, −Z north — with each monument's
base already set to its DEM ground height. It therefore loads at the origin with **no
transform at all**. If it ever needs nudging, the fix belongs in the source scene.

Where a model exists, the extruded footprint is **suppressed** (`exclude` in
`buildMassing`), or the two would z-fight and double the silhouette. That drops the
extruded monument tier count from 12 to 3 — the remaining three are Krishna's Butterball,
correctly kept because it is not modelled. Markers for modelled sites re-anchor to the
**measured top of the real model** after it loads, or the Shore Temple's label would sit
at the foot of an 18 m tower instead of above it.

#### The Shore Temple, rebuilt as architecture (2026-09-13)

`assets/models/shore-temple.glb` replaced the massing model with an **architectural
reconstruction** — the real Dravidian vocabulary, at the real proportions, declared on
screen as what it is. It is not a scan: the two real scans are locked on Sketchfab and the
free 859-photograph photogrammetry solve (`05-shore-temple-photogrammetry.md`) needs a CUDA
machine this project does not have. The user chose the rebuild now over waiting.

What is measured, what is read, what is assumed — every number is in
`data/research/3d/shore-temple-proportions.json` with the photograph it came from and a ±,
and the story is in `data/research/3d/06-shore-temple-rebuild.md`:

- **Cited:** 18 m and five storeys for the tall Kshatriyasimhesvara vimana. 18.0 m is
  *defined* as court level to kalasha tip, plinth included, because the source does not say.
- **Measured:** the compound wall, OSM way 370135158, fetched once and committed
  (`shore-temple-prakara.geojson`). Its minimum-area rectangle is **46.3 × 21.6 m at
  bearing 105°** — which finally reconciles the two figures this repo had been carrying:
  46.4 × 21.5 m was that rectangle, 49.0 × 31.4 m was its axis-aligned bounding box. The
  root node carries the bearing; the towers face east-south-east, toward the sea.
- **Read off photographs** (`scripts/build-shore-temple-measure.js` writes gridded crops,
  the picks are transcribed by eye): every eave and parapet line of the tall tower from
  the PD south-west view, tier widths from the west elevation, counts — 6 pilasters a
  face, 7 kudu arches on the aditala eave, kuta-panjara-sala-panjara-kuta on the first
  tier, kuta-sala-kuta above — from the north-face photograph, nandi proportions from
  the bulls photograph, the tank's position from the aerial. The west shrine is read as
  three storeys; the literature has both dvitala and tritala, and the note says which the
  photograph shows. Where two photographs disagree (the west view's upper eave rows, by
  up to 1.5 m) both readings are kept and the spread is recorded.
- **Assumed, and said so:** the 1.2 m plinth, the aditala's 10.4 m width (hidden in the
  west view; extrapolated from the tiers above), the wall's 2 m, the tank's size.

The geometry is generated by `scripts/blender/shore-temple/st_lib.py` from
`st_params.py` in the cloud Blender (3D Jutsu project `84e482a0-…`, revisions 11–16):
pilasters on lion bases, kapota eaves with kudu arches, hara rows of miniature shrines,
griva, octagonal shikhara, kalasha, the moulded plinth, the coped prakara with 58 seated
nandis, the stepped tank with its well and pillar, the small shrine beside it. 464
objects from eight shared meshes, joined to **8 draw calls, 36,408 triangles**. Each tower
is built from its parameter stack and then scaled uniformly about its base so the highest
vertex lands on the cited apex — the scale factor comes out at exactly 1.000, and the
build asserts it. **No figure, panel or lion on it is a portrait of any real carving.**

The surface is baked, not modelled: a Cycles shader of measured granite chromaticity,
a height ramp from the dark damp foot to the bleached top, grain, block variation,
cavity from pointiness and local ambient occlusion, and a block-joint bump — baked to a
1024² colour + 512² normal atlas for the towers and 512²/256² for the compound. Two
lessons from it: smart-projected UVs on ~30 k faces are thousands of islands, and a
4 px bake margin left black borders that mipmaps smeared into the stone — 32 px with
`EXTEND` fixed it; and the exporter writes packed images as PNG (a 1024² normal map is
800 KB alone), so `scripts/repack-glb-images.js` re-encodes them as JPEG and drops the
vertex normals (the exporter has already split every hard edge, so the loader's
recomputed flat normals are identical) before `scripts/check-shore-temple-glb.js` asserts
the contract: root `ShoreTemple` with its extras, no camera or light, apex 18.00, base
at 0, and the size. **Shipped: 641 KB raw, 344 KB gzipped**, against the 400 KB budget.

Two production traps, both recorded because `serve.py` sends no CSP and cannot catch them:
the swap loader needs `.setMeshoptDecoder()` like the monuments file, and embedded
textures become `blob:` URLs in GLTFLoader, so `vercel.json` now allows `blob:` in
`img-src` and `connect-src`.

#### The Pancha Rathas, rebuilt the same way (2026-09-13)

`assets/models/pancha-rathas.glb` replaces the five rathas, their elephant, lion and
nandi and the rock in the monuments file — `replaceRathas()` drops those nodes at load,
exactly as the Shore Temple swap does — with the same kind of reconstruction, built by the
same generators plus three new roof forms: Bhima's **sala** (colonnade, upper block,
wagon vault with gable arches and ridge finials), Nakula-Sahadeva's **apsidal
gajaprishtha** (a half-lathe apse, the vault turning into a half-dome) and Draupadi's
**hut** (a bell-curved four-sided loft). Dharmaraja and Arjuna reuse the vimana
generator. The record is `data/research/3d/07-pancha-rathas-rebuild.md`.

What each number is: heights and plans are the cited ones (11 / 7.6 / 6.1 / 5.5 m, and
Fergusson & Burgess's 18 × 11 × 16 ft for the twins' ratha); **positions are the OSM
footprint centroids**, which put the row at 35° east of north with Nakula-Sahadeva 7 m
west of it — the first model had it 15 m west; storeys and eaves are read off five
Commons photographs (`pancha-rathas-proportions.json`, picks with a ±); the widths of the
upper tiers, the animals' sizes and the rock are assumptions and say so. Each ratha is
scaled to its cited apex and the build asserts the factor (1.000 for four; 0.957 for the
twins', whose read eaves overshoot). **Shipped: 24,352 triangles, 7 draw calls, one
1024² colour + 512² normal atlas, 415 KB raw / 242 KB gzipped.**

Representative, not portrait: the open colonnades of Dharmaraja and Arjuna carry
sculpted figures in life; here they are pilastered walls with lion-based corner columns,
and the elephant, lion and nandi are low-poly stand-ins at plausible size.

**Not done, and not pretended otherwise:**

- **No PBR textures on the relief.** Its granite is flat Principled material — no
  roughness maps, no normal maps, no moss. The stone *is* aged, but by base colour alone
  — see below. The Shore Temple and the rathas are the exceptions since 2026-09-13: baked
  colour and normal maps, procedural, declared above.
- **No carved figures.** The Descent of the Ganges has its rock mass, its 29 m span and
  its central cleft, but not the hundreds of gods, ascetics and animals. That needs
  photogrammetry of the actual relief; it cannot be modelled from a description.
**The relief took five attempts, and the fourth fixed a mistake of kind rather than
degree.** Flat slabs with a protruding cleft; stacked contour layers that read as a
stepped ziggurat; a smooth lofted dome that read as a loaf of bread. The dome failed
because I had taken "whale-backed" to describe the whole rock — it describes the CROWN.
The carved face is a near-vertical wall of granite about 29 m long and 13 m high, split
by the natural fissure, with the relief cut across it. A 45° dome is a hill; this is a
cliff. The section is now explicit control points: a face rising almost straight with a
slight batter, a rounded crown, a steep fall to the back, and a little surface wobble so
it is not machined.

The fifth attempt fixed a placement bug worth remembering. Each mass falls from full
height beside the cleft to about half that at its outer end, but the courses and carving
were placed at a fixed fraction of the FULL height — so at the far end they floated clear
of the stone and hung in the sky. The relief now shares `local_h()` with the mass builder,
which is the only way the two cannot drift apart again, and the courses are segmented so
they follow the crown. Asserted numerically: **0 relief pieces standing above the rock**.

**What the relief massing is, and is not.** The panel is densely carved — that is the fact
about it, and a blank wall would be as wrong as a dome. It is represented as shallow
ABSTRACT relief: nothing on the face is a portrait of any real carving and none of it
should be read as one. The four free-standing elephants at the base *are* placed
deliberately, because their position and scale are documented and they are the passage
everyone recognises. Actual figures need photogrammetry of the real relief.

### Ageing the stone — and the bug that had been hiding it

The monuments read as freshly quarried. They are 1,300 years old on a salt coast, so the
granite now carries a weathering palette: **53 materials**, six tonal steps × three
tints per site, assigned by height above each monument's own base. Damp, dark, near-black
tones at the foot; bleached ones on the exposed upper tiers; a seeded ±1-step jitter so
courses at the same height are not identical and the whole thing does not look
machine-made. Span is 2.64× from darkest to lightest.

**Honest about the method.** Variation is per PART, not per vertex, so there are no runoff
streaks down a single large face — a wall is one tone, not a gradient. The right tool is a
vertex-colour or texture pass; this is base colour only.

Two things went wrong on the way and are worth recording, because both wasted real effort:

- **Vertex colours never rendered, four times.** The attribute was verified correct at
  every step — spread 0.34–1.19, active and render index set, `Attribute("Col") →
  Mix(MULTIPLY) → Base Color` confirmed — and the render came back byte-identical at
  489,485 bytes each time. The cause was never established; the per-material route
  replaced it because it cannot silently fail.
- **The GLB was smuggling in its own lights.** Blender exports lights as
  `KHR_lights_punctual` and `GLTFLoader` adds them to whatever scene you load into, so the
  file arrived carrying a **4.2-intensity sun and a 1.1 fill** on top of the page's own
  hemisphere 1.05 and sun 1.5. The monuments were being lit at roughly four times the
  intended level, which drove the stone past white and flattened every tonal difference
  in it. The weathering had been in the materials the whole time and was invisible — two
  successive albedo changes produced *pixel-identical* screenshots, which is what finally
  gave it away. The loader now strips lights and cameras from the GLB on arrival (in the
  viewer, not the source scene, which needs its lights to render previews and would
  reintroduce them on any re-export), and the page's own lights were retuned from
  1.05 / 1.5 to **1.4 / 2.55** — they had been tuned against the inflated total.

**One draw call was not lost.** An earlier version of this pass produced 532 materials.
That is a real cost and it was cut to 53 — though note the monuments were already 722
separate meshes, so materials were never what set the draw-call count here.

**The diorama design is shared with the guide map.** Both 3D views of Mahabalipuram now
read as the same physical model: the same warm sand palette (lifted verbatim from the
guide's `D` table — this scene had drifted toward olive), the same tilt-shift vignette,
the same decorative palms from the same `mahabalipuram-scenery.geojson`, and the same
stepped granite and oversailing-roof buildings, because both extrude the same GeoJSON.

Two things are done differently here because 3D allows it:

- **Surf costs nothing.** The guide draws it as offset lines along the mapped coastline.
  Here the coastline *is* wherever the terrain crosses sea level, so a bright band in the
  first 40 cm of elevation traces the same line for free — and follows every inlet
  exactly, because it is the same surface.
- **The board is real geometry.** The guide masks everything outside the site with cream;
  here the terrain fades to table tone past 1250 m, and a skirt hangs from the mesh rim
  down to a base plane, so the model has actual thickness and sits on an actual table.
  The fade is deliberate rather than a hard cut: a hard boundary on a displaced mesh
  slices through hills at odd angles and reads as a clipping bug.

Two bugs the merge surfaced, both worth knowing:

- **The globe renders every frame; the site scene does not.** Render-on-demand is right
  for hundreds of extruded meshes, and wrong for the globe: once its intro turn settled
  nothing redrew, and a WebGL drawing buffer that is not redrawn can be dropped by the
  compositor — leaving a blank canvas with "Click India" floating over nothing. Observed,
  not theorised. A sphere and 98 line strips are cheap enough to just keep drawing.
- **Globe framing is computed from the aspect ratio.** `fov` is vertical, so a fixed
  multiple of the radius frames the sphere on a wide pane and crops it on a tall one.
  The distance now solves from whichever half-angle is smaller.

**On "photorealistic".** It isn't, and it can't be from code alone — photoreal needs
licensed satellite imagery, HDRIs and photogrammetry scans of the monuments, which are
assets, not logic. What was possible instead was to make everything here *real* rather
than modelled by hand:

| Element | Where it comes from | How real |
|---|---|---|
| Terrain | Mapzen/AWS terrarium DEM, baked by `scripts/build-terrain.js` | **Measured.** 192×192 grid over 4 km, −6 m to 26.3 m. The ridge is the surveyed shape. |
| Coastline, beach, sea | The same DEM plus a sea plane at the 0 m datum | **Measured.** East is water at 0 m, west is inland at 9 m — verified, not assumed. |
| Monuments | `mahabalipuram-footprints.geojson`, extruded | **Cited heights**, real OSM footprints. |
| Granite outcrops | `mahabalipuram-context.geojson` | Real outlines, nominal heights. |
| Town | Same | Real outlines, **nominal** heights — OSM has one real height in 119. |
| Globe coastlines | Natural Earth 110m, public domain | **Real**, simplified to ~1.1 km. |
| Facilities | The committed OSM extract | **Real**, community-mapped. |
| Ground texture | Copernicus Sentinel-2 L2A true-colour scene `S2C_44PMV_20260305_0_L2A`, via `scripts/build-ground.js` | **A real photograph**, 10 m per pixel, reprojected onto the terrain and otherwise unaltered. Declared on screen with its date; the sun in the scene does not match the sun in the photo, and that is said too. Sentinel data is free and open — the earlier note here that "there is no satellite imagery to drape" was wrong about the world, not just the code. |
| Sky, sea surface, haze | Drawn — a Preetham sky, a perturbed-normal water shader, exponential fog | **Optical.** They claim nothing about the place and carry no declaration; the sea's *edge* is the OSM coastline, which is real. |

So: a real landform at ~30 m resolution and real silhouettes at true scale. It will never
show you a carved pillar. That gap is a camera on site, not more code.

**The placeholder boxes are gone.** They were only ever standing in for data that already
existed in this repo — 12 monument tiers, 55 rock tiers and 238 building tiers are now
extruded straight from the cited GeoJSON, merged into three meshes so the whole town is
three draw calls rather than 305.

**Clicking India.** The target is an angular test against the globe, not a hit on a mesh:
a ray is cast at the sphere, the hit point is transformed into the globe's own rotated
frame, and it counts if it lies within 23° of India's axis. That matters because the
globe turns — a flat disc shrinks to a sliver near the limb, and testing a mesh means
testing it in whatever pose it happens to be in. What you *see* is a spherical cap at 17°
with a drawn rim ring, hugging the surface; the clickable area is deliberately a little
wider than the drawing. Hovering lights the cap and switches the cursor. Measured: the
target sits dead centre and covers about 28% × 20% of the canvas.

**The intro is timed by the clock, not by frames.** It was `spinT += 1/210` per frame,
which is 3.5 s only at 60fps. Measured at 1.5fps in a backgrounded tab that intro runs
for over four minutes — and since the "click India" prompt waits for the globe to stop
moving, the instruction never appeared at all. Any animation whose duration is counted in
frames is a bet on the frame rate. Under `prefers-reduced-motion` the globe starts
settled with the prompt already showing.

**The prompt waits for the target to stop.** Telling someone to click India while India is
still sliding across the screen is most of why the hotspot felt impossible to hit.

**The globe is line-drawn, deliberately.** A textured Earth needs a licensed basemap, and
a low-resolution stand-in would look cheaper than an honest drawing. India is picked out
by bounding box, not by name, because the 110m layer is *land*, not countries — the
subcontinent is one ring shared with its neighbours. It is a highlight, not a border
claim. Clicking raycasts a single hotspot disc rather than the coastlines.

**Total payload**, gzipped as the deployed host serves it (Vercel's brotli lands ~10 %
lower; the deltas hold). Measured on the files each path actually requests:

| path | KB gz | what it is |
|---|---|---|
| `list` tier (no WebGL, or a phone that would crawl) | **22** | HTML, two stylesheets, `scene-boot.js`, `pois.json`. Nothing else downloads. |
| phone / small viewport, `#site` deep link | **646** | + three.js, the loaders, the scene modules, all site data, both GLBs, the 49 KB photograph |
| phone, via the globe | 672 | + `world-land.geojson` (26 KB), fetched only when the globe act will run |
| desktop ≥ 720 px | **664–690** | + the SSAO composer chain (19 KB), as a dynamic import off the critical path |

The list path used to cost the full 650 KB to decide to render nothing: the page loaded
`scene-3d.js` directly, which statically imported everything and fetched nine data files
at module top level before the low-end check ran. `js/scene-boot.js` now owns the list,
the status line and the tier probe, and the scene graph is `import("./scene-3d.js")`
behind it. The 10 MB budget from the earlier brief is not close to being troubled.

Notes on the pieces that could have gone wrong quietly:

- **Terrain and monuments must share an origin.** `build-terrain.js` and `build-pois.js`
  both key off 80.1915 E, 12.6168 N. If they drift, monuments float above or sink into
  the ground with nothing to warn you.
- **Seafloor is clamped to −6 m.** Raw terrarium reaches about −240 m offshore, which digs
  a canyon beside the beach that dwarfs the 26 m ridge and wrecks the scene's scale.
- **The PNG decoder is hand-rolled** in `build-terrain.js` — no npm, so no pngjs. It is
  only viable because terrarium tiles are the simplest case (256×256, 8-bit RGB,
  non-interlaced), which is checked before decoding; anything else fails loudly.
- **The flythrough is not an idle auto-spin.** It starts only when asked, any touch of
  the controls cancels it, and it is hidden entirely under `prefers-reduced-motion`.
  There *is* now a separate idle drift, and it was a deliberate reversal of the earlier
  "no auto-rotate" rule, chosen by the site's owner: after 20 s without input the camera
  turns at 0.6°/s, any input stops it, and it gives up after 90 s — one ~54° swing — so an
  idle page does not render forever. Full tier only, never under reduced motion, never
  while the tab is hidden or the stage is scrolled off. See the tiers section below.

### Tiers, the watchdog and what downloads

The old gate was binary — WebGL or not, `deviceMemory ≤ 2` or not. `probeTier()` in
`js/scene-boot.js` now sorts devices into three tiers **without touching the GPU** (a
benchmark on load costs the frames it is trying to save):

| | `full` | `lite` | `list` |
|---|---|---|---|
| when | everything else | `deviceMemory ≤ 4`, `≤ 4` cores, `pointer: coarse`, viewport < 720 px, or `saveData` | no WebGL, `deviceMemory ≤ 2` or `≤ 2` cores |
| SSAO composer | yes, dynamic import | no | — |
| shadow map | 2048², PCF soft | 1024² | — |
| pixel ratio cap | 2 | 1.5 | — |
| ambient water tick | 12 fps | 8 fps | — |
| idle drift | yes | no | — |

`deviceMemory` and `hardwareConcurrency` are absent on Safari and Firefox; absent means
*unknown*, not low, so there the phone signal is `pointer: coarse` and the viewport.
`?tier=lite|full|list` overrides for testing and the tier is written onto `<body>` as
`tier-*`, the same convention as the `no-ssao` / `no-tiltshift` hatches.

**The render loop draws two kinds of frame.** A frame the *camera* moved — flight, stick,
tour, drift, orbit damping — redraws everything including marker placement. An *ambient*
frame, where nothing moved but the water is allowed to, redraws at the tier's low fixed
rate and skips the marker work, since nothing on screen has moved and the occlusion
raycasts against 73k terrain triangles are the expensive part. Both advance the water
clock; nothing else does, so a still scene is a still, correct frame that costs nothing
(the water shader looks right at any frozen time by construction — the swell and noise
are non-zero at `t = 0`). Ambient frames run only when the tier allows, reduced motion is
off, the tab is visible, the stage is on screen (a second `IntersectionObserver` that
stays alive) and the site is showing. `body.no-ambient` turns them off for testing.

**The shadow map is drawn on demand.** The sun never moves and nothing that casts a
shadow ever moves, so `renderer.shadowMap.autoUpdate = false` and the map is redrawn only
when geometry arrives (`invalidateSceneCaches()` sets it dirty). Before this, every drawn
frame re-rendered ~722 monument meshes plus the terrain into the shadow buffer for
nothing.

**A frame-time watchdog steps quality down before it drops frames.** It samples the
rAF-to-rAF delta on frames whose predecessor also rendered (a GPU-bound frame shows up as
the *next* frame's stall), thirty at a time; when the median passes 33 ms it steps down
one rung and refuses another step for 2 s. Rungs: 1 drop AO, 2 shadows to 1024², 3 pixel
ratio 1, 4 ambient off, 5 shadows off. **Monotonic within a session** — no stepping back
up, because a throttling integrated GPU oscillates (`js/scene-post.js` records exactly
that). It also keeps quiet for 3 s after every geometry arrival: shader compiles and the
first shadow-map draw made the arrival glide read as a 47 ms median on a machine that
settles to 16 ms, and the first version stepped down on every load. `__s3.stats()`,
`__s3.renders` and `__s3.watchdog.force(n)` on localhost drive and read all of this.

**Do not "switch to the min build".** `assets/vendor/three.module.min.js` looks like an
unused 83 KB saving. Measured: in this vendored set it is an r185 file (the addons are
r169) that `export * from "./three.core.min.js"`, and the two together gzip to 188,355 B
against 170,475 B for the one `three.module.js` in use — **17.5 KB larger**, and it would
also mean rewriting the `./three.module.js` specifier in every vendored addon. Both min
files are in `.vercelignore` so they never deploy; they are kept only so this note has
something to point at.

### Earlier brief: the POI viewer


A rotatable three.js scene with clickable monuments, separate from the guide map and
leaving it untouched. **The monument shapes are placeholder boxes** — see the asset
handoff below.

**Built vanilla, not React.** The brief specified React + TypeScript + r3f + Vite. This
repo has no build step at all, and adding one for a single page changes how everything
deploys, so three.js is vendored beside MapLibre and the viewer is a plain ES module.
Every behaviour asked for is plain three.js — damped orbit, polar clamp, eased camera
flights, DOM-projected POI buttons, occlusion culling, render-on-demand, lazy init;
r3f and drei are conveniences over exactly these APIs. OrbitControls' bare `'three'`
import is rewritten to a relative path at vendoring time, because the usual fix — an
import map — is an inline `<script>` and CSP `script-src 'self'` blocks it.

What is implemented: orbit with damping 0.05, full 360° azimuth, polar clamped 15–80°,
distance clamped, one-finger orbit and two-finger pinch/pan, 1.2 s ease-out camera
flights (instant under `prefers-reduced-motion`), reset view, POI markers as real
focusable `<button>`s projected each frame, occlusion raycast every third frame,
distance opacity fade, cluster-into-"+N", side sheet on desktop and bottom sheet on
mobile, render-on-demand, WebGL and low-end detection, `IntersectionObserver` lazy init,
and a complete plain list that works with the scene switched off — which is also the
no-WebGL fallback. No auto-rotate, no fade-and-slide-up, no spinner over black.

**Clustering needed more than the brief's rule.** A 40 px anchor-distance test is
necessary but not sufficient, because these labels are monument names:
"Mahishasuramardini Mandapa" renders ~260 px wide and collides with a neighbour whose
anchor is 200 px away. The test is anchor proximity *or* an actual overlap of the
rendered label boxes, with widths measured once at mount rather than per frame.

### What `pois.json` does and does not claim

Generated by `scripts/build-pois.js` from data already committed and cited — never
authored by hand. Three fields the brief asks for are deliberately **null**:

- **Ticket prices.** This repo records only *whether* a monument is ticketed, not the
  fare. ASI prices change, and the brief's own rule is never to present a stale price as
  current — a plausible invented number would be exactly that failure. The UI says
  "ticketed by the ASI, price not verified here" and shows no figure.
- **Opening times.** Not recorded anywhere in this repo.
- **Tamil names.** Real ones exist, but not in any file here, and `build-pois.js`
  derives, it does not author. The second line is omitted rather than showing an
  unchecked transliteration.

Add sourced values to the content files and the script carries them through
automatically. What *is* real: coordinates from OSM, periods and descriptions from the
cited monument entries, and facilities computed as actual OSM amenities within 250 m —
Shore Temple honestly shows none.

Placeholder boxes use each monument's **cited height** where this repo has one (only
Krishna's Butterball, 6 m, today) and say so in the panel. They are drawn 3× oversized:
the site spans ~1.1 km, so a true-scale 12 m box is a two-pixel speck at the establishing
zoom. Real meshes will be true scale.

### Asset handoff

The viewer is finished; the geometry is not. Replace `loadPlaceholders()` in
`js/scene-3d.js` with a GLTF load that parents each mesh at the same anchor — markers,
occlusion, flights and the panel all read `poi.mesh` and need no changes.

**Scene contract:** origin at the centre of the site (80.1915 E, 12.6168 N), **Y-up,
1 unit = 1 metre, +X east, −Z north**. Getting the Z sign wrong mirrors the scene, which
is invisible until the coastline appears on the wrong side. Anchors in `pois.json` are
already in this frame.

**Budgets** (from the brief): terrain one mesh under 60k triangles with lighting baked
into the texture; each monument 15–40k triangles with one 2K atlas; Draco geometry,
KTX2/Basis textures; under 10 MB total.

**Terrain** is the one stand-in inside the scene — currently a flat sand plane, present
so shadows have something to fall on and markers have something to be occluded by. Drop
`terrain.glb` in its place.

Of the three asset routes, Option C (stylised Blender diorama) is the one that matches
this site: no coverage gaps, no API cost, no licence risk, and the palette already
exists here. Note the capture constraint if you go the photogrammetry route —
Mahabalipuram is ASI-protected and UNESCO-listed, drone flight needs written permission,
and every downloaded scan needs its licence checked, since much of Sketchfab is
view-only or non-commercial.

### The diorama view

In 3D the map is styled as a **physical tabletop model**: a sand board with a visible
edge sitting on a cream table, cream buildings, a sculpted granite ridge, palms, warm
raking sun and long cast shadows. Flat mode is deliberately untouched — it is the
high-contrast map people actually use standing at the site in glare, and the 3D button
returns to it.

Built against what MapLibre 5.24 can actually do, which is less than it sounds:

- **There are no shadows in MapLibre.** No shadow map, no ambient occlusion, no
  `cast-shadows` — every "shadow" string in the bundle is a hillshade colour, a hillshade
  uniform, or a Canvas2D/DOM API. The long shadows are faked: each footprint is drawn a
  second time as a flat dark fill, offset away from the sun and under the massing. It is
  not a real projection — a tall block and a low one cast the same length — but it reads
  as contact with the ground, which is the job.
- **One sun.** `setLight`, the fake shadows and the hillshade all read a single
  `SUN_AZIMUTH`, so they cannot drift apart. A shadow falling toward the light is the
  fastest way to stop a scene looking like a physical object.
- **The board.** A diorama is a model that *ends*. The site bbox is cut as a hole in a
  cream mask, so everything beyond the walkable core is table. Without that edge the sand
  just runs to the horizon and it reads as a map with an odd palette.
- **The basemap is CARTO's, and it is borrowed, not owned.** Entering 3D repaints
  CARTO Positron's own layers into diorama tones and restores every one of them exactly
  on the way out. Rules match on `source-layer` (OpenMapTiles schema) rather than layer
  id (CARTO's private naming). If fewer than 20 layers match — i.e. CARTO restyled under
  us — the whole pass rolls back and the basemap ships as-is rather than half-painted.
- **Two rendering quirks worth knowing**, both of which cost a debugging round trip:
  a mask at `fill-opacity: 1` draws in the opaque pass and so cannot cover anything in
  the translucent pass (0.999 fixes lines; symbols are hidden instead, as they draw last
  regardless of order), and a `zoom` interpolate nested inside another expression is
  rejected, so the layer silently fails to add.

Palette sampled from the reference: eleven warm tones from `#473622` to `#e7d6bb`, in
which even the sea is desaturated nearly to grey.

### The sea

Flat turquoise read as a coloured hole in the board, so the water gets two things:
**surf breaking in bands parallel to the shore**, and a repeating **wave texture** across
open water (a small canvas-drawn tile of summed sines, so the crests do not repeat on an
obvious beat).

The surf is derived from real geometry, not painted on. CARTO's vector source carries
`water` as polygons, so drawing that same source-layer as a *line* gives the actual
shoreline, and `line-offset` steps three copies of it out to sea for successive breakers.
Nothing here invents where the coast is — it follows every curve of the mapped one.

Two details that had to be got right:

- **Offset sign.** Which way a polygon ring winds decides whether the bands fall on the
  water or on the land, and the first attempt hid them under the beach. Positive is
  seaward here, and `SURF_SIDE` exists so it can be flipped if the source ever changes.
- **Only the ocean breaks.** CARTO tags each water body with a `class`, and without a
  filter the first pass put surf around the temple tank and, absurdly, around hotel
  swimming pools. Surf is now `class == "ocean"` alone; the wave texture also takes the
  lagoon, which is open water, but never a pool or a river channel.

Like the vignette, this is optical ornament — it says "this is sea", not "there is
something at this spot" — so by the rule below it carries no disclosure.

### Palms, and where the honesty line falls

The palms are the **only invented thing on this map**, and they are fenced in.

OpenStreetMap maps **zero individual trees** in the core (checked 6 September 2026). What
it does map is which ground is vegetated. So `scripts/fetch-scenery.js` scatters palms
strictly inside polygons tagged `landuse=grass`, `leisure=park|garden`, `natural=scrub`
and similar — 142 palms across 16 real polygons. The claim the map makes, *"this ground
is vegetated"*, is true and sourced; the individual trunk positions are not, and every
feature carries `decorative: true` plus the `within` way id that justified it. The
provenance line under the map says so too.

The line being held: **ornament that says something about a place must be declared;
ornament that is purely optical need not be.** Palms could be mistaken for shade that
isn't there, so they are declared. The vignette, the tilt-shift blur and the board edge
make no claim about anywhere, so they are not.

The scatter is seeded (`SEED` in the script), so re-running reproduces the file exactly —
a diff means the world changed, not the random number generator.

### What is 3D, and which parts are measured

The 3D view has **two classes of mass, and they are not equally trustworthy** — so
they are drawn differently and labelled differently.

**Monuments — measured.** Six monuments, twelve stacked tiers, built from
`content/mahabalipuram-heights.js`, where every height and storey count carries a
source, a URL and an access date. The Overpass query is generated *from* that table,
so a monument with no citation is never even fetched: "no citation" and "no polygon"
are the same condition. These are the warm stone blocks.

**The town and the granite — nominal, not measured.** 119 buildings (238 tiers) and 11
bare-rock outcrops (55 tiers) from OpenStreetMap. The outlines are real mapped geometry; the
heights are not. Checked 6 September 2026, OSM records a `height` for **exactly one** of
those 119 buildings and `building:levels` for **none**.

**Buildings are layered too.** A plain box with a flat top reads as a box; the
reference's little houses read as *models* because the roof slab oversails the walls. So
each building is two tiers — walls on the real OSM outline, then a roof slightly
**outset** over them. The outset is the point: `insetRing` is an affine scale, so a
negative inset grows the ring, and without that overhang the wall and roof share an edge
and it collapses back into a box.

A three-tier version with a plinth at the foot was tried and dropped. On a 3.2 m nominal
house the plinth is a few centimetres nobody can see at any zoom this map offers, and it
pushed the committed file from 127 KB to 443 KB — real mobile data for an invisible
detail, on a file now loaded on every visit. Two tiers land at 329 KB raw, **26 KB
gzipped**.

Adding the roof also forced two knock-on fixes. `fill-extrusion-vertical-gradient` had
to go **off** for buildings: it was what stopped flat tan boxes reading as paper cutouts,
but the upper tier now has `base > 0`, so the gradient turned into visible banding
exactly at the eaves. The geometry does that job properly now. And the shadow layer had
to be filtered to `tier == 1`, or every tier laid down its own offset copy and the
shadows piled up several deep.

The rock is built as a **stepped stack, not a slab**. Extruded flat it looked like a
cardboard plateau with sheer walls — the opposite of granite — so each outcrop ring is
tiered with the same affine-inset taper the monument pipeline uses for the Butterball's
boulder profile. The insets accelerate toward the top: stepping evenly produced
something that read as rice terracing, because every tier traced the full outline like a
contour, and granite domes narrow fast near the crest. Rock height also now scales with
the square root of footprint area rather than being one number for every outcrop — a
boulder field and the main ridge shoulder are not the same height, and pretending
otherwise was its own small fiction. Still nominal, still declared.

Rock lives in its own layer for a forced reason: `fill-extrusion-vertical-gradient` is
what stops the flat buildings reading as paper cutouts, but it becomes visible banding
at every tier line once `base > 0`. Stacked rock needs it off, base-0 buildings want it
on, and one layer cannot do both. There is no survey to draw on, so these
are massed by tag at 3.2 m per nominal storey — the convention every 3D basemap uses
for untagged buildings. They are painted flat, pale and semi-transparent so they read
as scene-setting, they carry `measured: false` and a plain-English `why` in the data,
and the sentence admitting it ships in the provenance line under the map, not only
here. The one building with a real height keeps it and is flagged `measured: true`.

**A monument is never also massed nominally.** The context pass skips every OSM id
named in the monument content files — 11 of them. Without that filter it double-drew
the monuments and produced two specific wrong pictures: the five rathas got a flat
6.4 m `building=temple` box punched through the middle of their cited tiered forms,
which is what made them look boxy instead of stepped; and the Shore Temple got back
exactly the 46 x 21 m enclosure slab that was deliberately rejected earlier, because
its OSM way is the wall, not the temple. The id list is read from the content files,
so adding a monument removes it from the nominal pass automatically.

This is the project's "never invent data" rule held, not bent: the invention is
declared at every layer — in the properties, in the paint, on screen, and in this file.
Remove any of those and it stops being true. Rebuild with
`node scripts/fetch-context-massing.js`; it is a separate script writing a separate
file precisely so it can never contaminate the cited monument pipeline.

**The map opens in 3D**, framed on the Pancha Rathas — tilted, with terrain on and the
monuments standing as solid masses. The **3D** button flattens it again.

It opens on a **site overview** — the ridge, the town and the coast together. That is a
reversal of an earlier decision, and the reason it changed is that the earlier reason
went away: the view used to open tight on the Pancha Rathas because they were the only
cluster with enough extruded mass to look like anything at all, and a wide view read as
flat. Now that the whole core stands up, the wide view is the one that shows the 3D
*and* answers "where am I and what is around me", which is this page's actual job. The
camera is chosen by measurement rather than taste: the rendered mass spans 16–66% of
the viewport height on a desktop pane and 22–72% on a 375 px phone, clearing the
control row above and the legend below in both.

The trade-off this costs: every visit now loads the footprints file and the terrain
tiles, which the old flat-by-default path deferred until the button was pressed. Flip
`DEFAULT_3D` in `js/guide-map.js` to get the lazy behaviour back. The choice is also
shareable — the URL records `d=1` or `d=0`, and an explicit one always beats the
default.

Five monuments extrude, each from a real OSM outline, a published height and a
documented storey count: Dharmaraja Ratha (11 m, 3 storeys), Bhima Ratha (7.6 m, 2,
barrel-vaulted), Arjuna Ratha (6.1 m, 2), Draupadi Ratha (5.5 m, 1 + a shape-only roof
cap) and Krishna's Butterball (6 m, a boulder with two shape-only caps). Tapping any of
them opens a card with the height, what that height measures, the storey count and both
citations — for the four rathas that is their only detail card, since they are not in
`content/mahabalipuram-monuments.js`.

The Shore Temple is **not** extruded; see the limitations below.

### Adding a 3D monument

1. Find a **published** height and record it in `content/mahabalipuram-heights.js` with
   its `source`, `sourceUrl` and — importantly — `measure`, saying what the number
   measures (above the plinth? including the finial?).
   Also record `tiers` (storey count), `roof` (`pyramidal` / `barrel` / `hut` /
   `boulder`) and `tiersSource`. **A storey count needs a citation exactly like a
   height** — it is the number of steps a reader can count on screen. If you cannot cite
   one, use `tiers: 1` and get a plain box rather than a guessed silhouette.
2. Confirm the OSM element is a `way`. A node has no outline, so there is nothing to
   extrude at any height.
3. Confirm it is a free-standing mass, not a rock-cut excavation and not a boundary
   fence.
4. Re-run `node scripts/fetch-site-data.js`.

The footprint query is built *from* the heights table, so **there is no way to ship an
uncited extrusion** — and the script fails if a height has no source, if a requested way
has vanished upstream, or if a fetched polygon turns out to sit more than 25 m from the
pin it is supposed to belong to.

### Regenerating the data

```bash
node scripts/fetch-site-data.js            # re-fetch from OSM + rebuild routes
node scripts/fetch-site-data.js --offline  # rebuild routes + 3D tiers, no network
node scripts/fetch-plan-areas.js           # the site plan's areas (monument outlines, water, landcover)
node scripts/fetch-plan-areas.js --offline # re-check the committed file, no network
```

Re-run it when OSM gains something (the four empty categories below), or every
few months so the provenance line does not go stale. It exits non-zero if a
monument's `osm` id has vanished upstream, if a coordinate falls outside the
bbox, or if it disagrees with `data/sites.geojson` by more than 150 m.

### The monument card: "What you will see here" (2026-09-17)

Tapping a monument used to open a sentence, a photo, a table and then paragraphs of
history. It now opens **short and visual first**: photo, one sentence, chips (period,
ticket, cited height), then **a labelled sketch of the monument** with a number on each
part and one plain line per number (about twelve words), then the way there ("Road
directions", and "See it in 3D" for the seven monuments the 3D scene has a panel for). The
history, the five-monoliths list, the sources and the links are all still there under
**Read more** — and for a monument with no sketch yet the fold is rendered open, so nothing
that used to show is hidden. A card with a sketch opens at the sheet's tall height, because
at the 40vh peek the picture would sit below the fold.

- **The words** are `inside.parts` on the entry in `content/mahabalipuram-monuments.js`
  (the 8 featured monuments so far). Every part is from the entry's own cited section, from
  `inside.source` (a second Wikipedia article, fetched and read 2026-09-17), or from a
  research note named in the comment above it. Nothing else may be listed.
- **The sketches** are `js/monument-diagrams.js`: from above for the Shore Temple, the
  rathas and the two caves; from the front or side for the great relief, the Butterball,
  Olakkanesvara and Tiger Cave. Every caption says "a simple sketch of what is where — not
  to scale, not a survey". **A part is placed only where a source states where it is**:
  the Varaha cave's panels are on the walls Wikipedia names (Varaha north, Trivikrama south,
  Gajalakshmi and Durga either side of the shrine); the Mahishasuramardini panels likewise.
  At the Descent of the Ganges the article's text and the photographs disagree about which
  side of the cleft the ascetic, Shiva and the cat are on, so they are listed but **not
  placed**, and the caption says so; the same for the Shore Temple's stone lion and Tiger
  Cave's brick shrine.
- A number on the sketch and its line in the list are one control (`aria-pressed`, one lit
  at a time, 40 px targets); the list alone is the complete non-visual version. On
  localhost the guide warns in the console if a part has words but no place in the sketch,
  or the reverse.

#### The parts on the map, a note and a photo for each (2026-09-17)

- **Numbers on the real map.** For the two monuments whose parts stand at known places, the
  card's numbers also go on the map when it opens: the map fits them, the sheet stops at
  half height (54vh) so both are in view, and the monument's pin — and the five rathas'
  pins — hide until the card closes, a route is chosen or another card opens. A number on
  the map, its number on the sketch and its line in the card are **one control**: lighting
  one lights all three and opens that part's note; from the map the card scrolls to the line
  (a direct `scrollTo` on the sheet body — `scrollIntoView` did nothing inside the
  overflow-hidden sheet), from the card the map pans if the part is off screen.
- **Where the positions come from** (`scripts/build-part-positions.js`): the Shore Temple's
  towers, the shrine between them and the tank are the 3D reconstruction's recorded layout
  (`st_params.py`) placed in the frame of the OSM compound outline — the script recomputes
  that outline's minimum-area rectangle and refuses to run unless it is still 46.3 × 21.6 m
  at 105.2°; each part says ±2 or ±3 m. The rathas are their own OSM outlines' centroids
  (each checked to lie inside its outline). The lion, bull and elephant have no survey:
  they are placed from Wikipedia's description, drawn with a **dashed ring**, and labelled
  "approximate position". The two Wikipedia articles disagree about where the bull stands,
  and its note says so.
- **More parts and a longer note.** Each part now has `more` — two or three plain sentences
  shown when it is tapped — and the Shore Temple gained the linga, the Somaskanda panel and
  the Varaha image found in 1990; Tiger Cave the elephant-head cells. Every one was read in
  the monument's own Wikipedia article on 2026-09-17, which is added to the card's sources.
- **A photo per part, only where one clearly shows it.** 13 Commons photos from the two
  credited reference manifests, each looked at before use (a "Vishnu mandapa" photo showed a
  different ruin and a lion photo showed the lion too small to see — both rejected), plus
  two public-domain 1860s prints for the relief. Commons serves only fixed thumbnail widths:
  480 px returns HTTP 400, so the links use 500 px. Each photo is credited with author,
  licence and a link to its file page. Caves without a matching photo get none.

### Pins are pictures, and monuments have areas (2026-09-14)

The same treatment as the destination page's site plan, on the live map:

- **Every pin is the picture of its monument's kind** (`js/monument-pictures.js`) on a
  paper tile, with a number badge — the monument's number in the destination page's
  list, so "04" here is "04" there, or the stop number while a route is on (the badge
  turns ink). The 44 px target, the crowded-pin shrink and the label collision pass are
  untouched; the old "un-numbered pin gets an inner dot" rule is gone because every pin
  now carries a number. The provenance line says the pictures are type pictures.
- **The 13 monument outlines** from `data/mahabalipuram-plan.geojson` are drawn as
  `area-fill` / `area-line` between the park tint and the footpaths, so the Shore Temple
  compound and the rathas' plinths read as areas rather than a dot each. Water and
  landcover from that file are deliberately NOT drawn here: the CARTO basemap already
  carries OSM's water and parks, and two copies would disagree at the edges. The file is
  optional to the page (`guide-mount.js` catches a failed fetch).

### Monument coverage

The guide covers **24 monuments**, up from the original 8 — the five rathas
individually, Ganesha Ratha, Krishna Mandapam, Panchapandava, and the cave temples
along the ridge. Tapping any one opens a card with a description, its period, ticket
status, height where the 3D view has one, a photo, and the source for every claim.

**16 have a photo**, pulled from their own Wikipedia article. The other **8 have no
article of their own**, so they carry a description and say plainly that no photograph
is available rather than showing an empty frame.

**The 24th was found by checking the list against the ASI and UNESCO records**
(2026-09-12). **Mukunda Nayanar Temple** — a small structural shrine 750 m north of the
hill, early 8th century, attributed to Rajasimha, ASI-protected as **N-TN-C66** — was
sitting in `data/mahabalipuram-osm.json` all along as `node/5096205107`, used by nothing
and listed in no exclusion note. Its coordinate is corroborated to under 5 m by two
sources independent of OSM.

Three other things that check turned up, all now recorded in
`content/mahabalipuram-monuments.js`:

- **The "known gap" note was half wrong.** It said Atiranachanda Mandapa had no OSM
  record "anywhere in either bbox". It has one — `node/2334799038` — and Saluvankuppam
  is inside the wide bbox, where Tiger Cave already sits. The node is tagged only
  `amenity=place_of_worship; name=Shiva Temple`, so it matches none of `isMonument()`'s
  clauses and is never fetched: the Ganesha Ratha failure mode recurring. Adivaraha, the
  other half of that note, **is** genuinely absent — confirmed by Nominatim and an
  Overpass sweep of the whole hill — and is also the one monument here still in active
  worship, which is why the ASI does not protect it either.
- **Two "unnamed" OSM records were never unnamed.** `node/4433895791` and
  `node/4453036789` carry `name:en` but no `name`, and `scripts/fetch-site-data.js` read
  `tags.name` only, so they were written into the dump as nameless and read as
  mysterious. They are Devaneri beach and a surf club. The fetch now falls back to
  `name:en`, which stops that recurring.
- **One title was a fourth-order spelling.** Wikipedia's section heading and the ASI list
  both say *Olakkanesvara*; the file said *Olakkanneshwara*. The title now follows them.
  The `wiki` field keeps the article's own double-n spelling, because the photo lookup
  matches on it, and the `id` is unchanged — ids are never renamed here, since `#stop=`
  links in the wild use them.

**What the guide does not cover, stated rather than left blank.** The ASI protects about
35 items at Mamallapuram; this guide carries 24. The difference is sculptures and
unfinished cuttings — Draupadi's Bath, the Dolotsava Mandapa, the Seven Pidaris, the
monkey and elephant groups, several unfinished excavations — none of which has an OSM
element to place a pin on, and none of which the Wikipedia article treats as a monument
in its own right. **UNESCO enumerates nothing at all**: site 249's page and the 1984
ICOMOS evaluation give categories and six exemplars, and the property's own page still
says the georeferenced polygons will be published "once the GIS data will be received".
There is no authoritative list to be complete against, and this file says so rather than
implying one.

One caveat on all of the above: **`asichennai.gov.in` was unreachable** on every attempt,
so every ASI monument number here is cited from the ASI list as transcribed on Wikipedia,
not from the primary. The entries say so in their own `sources[]`.

Descriptions are written from Wikipedia's *Group of Monuments at Mahabalipuram* — that
text is CC BY-SA, so it is **paraphrased, never pasted**, and every entry carries a
section-anchored source URL and an access date.

Because 24 pins on a phone would be unreadable — four monuments sit within 54 m on the
hilltop, and Draupadi and Arjuna Rathas are **6 m apart** — pins are decluttered by
authored zoom tiers plus a collision pass. Nothing is lost: the **All** button lists
every monument, and an active route's stops are never culled.

**A crowded pin now shrinks. It is never removed** (changed 2026-09-12). The rule used
to be `display:none` for any pin within 30 px of an already-accepted one below z17.5,
and that quietly deleted real monuments: at the opening camera it removed Varaha Cave
and Olakkanneshwara outright, leaving them unclickable and, to a reader, simply not
there. Hiding a *name* is a legible compromise; hiding a *monument* is a false statement
about the site. The shrink is a CSS `transform`, deliberately not a width change, so the
44 px touch target survives at every crowding level — measured at **46 px** minimum.

Three other things were wrong at the same time, and together they are why the map read
as empty:

- **It opened tilted, and tilt hides every label.** `DEFAULT_3D` was `true`, and
  `css/guide.css` hides all monument labels in 3D. The pin's own text is
  `activeRoute ? idx + 1 : ""`. So a first visit — tilted, no route — showed
  twenty-three identical blank gold circles and not one name. The site map now opens
  **flat**; tilt is one tap away and `#d=1` still wins.
- **Ten monuments were gated at `zoomFrom: 16.5`** against an opening camera of 15.7, so
  they were absent rather than crowded. Relaxed to 15.5. The Pancha Rathas `zoomTo: 18`
  → five children `zoomFrom: 18` handover is untouched; it is the right answer to six
  monuments inside 15 px.
- **Facility icons painted over monument labels**, because markers are DOM siblings
  stacked by insertion order and amenities render second. Fixed with `z-index` (3 over
  2), *not* by swapping the render order — that would put every facility ahead of every
  monument in the tab order.

At the opening camera this takes the map from **5 labels and 15 monuments with no marker
at all** to **23 pins, 18 visible, 11 labelled**. Twenty-three labels at once is not the
goal and is not achievable: at z15.7 one metre is 0.35 px, so Arjuna and Draupadi Ratha
are 2 px apart and 27 monument pairs sit within 60 m. The honest target is every
monument *present*, with names as they fit.

**The footpaths are drawn for the first time, and only the footpaths.**
`data/mahabalipuram-paths.geojson` holds 339 ways, and they were all drawn as one
uniform hairline at **0.22 opacity** — about 1.33:1 against Positron's page white, which
is invisible in glare. But 265 of those 339 are vehicle roads the basemap already draws
correctly to z18, so raising them all would have double-stroked every road in town. The
layer is now filtered to the **74 pedestrian-class ways** (footway 45, path 18, steps 4,
track 4, pedestrian 3) — the ones Positron draws at ~1.15:1 or not at all — with a cream
casing, because these cross three different grounds (page white, our sand park fill, the
3D diorama board) and no single ink holds contrast against all three. The route line
already used that trick; this follows it.

**The camera stayed at z15.7, and that was measured rather than assumed.** Positron's
`roadname_minor` has `minzoom: 16`, so moving the opening camera three tenths of a zoom
looked like it would buy every minor street name for free. Counted live at both: z15.7
renders **0** road labels, z16.0 renders **2**. Two names is not worth widening the
default framing and falsifying the measured span figures recorded above.

### Adding a monument to the guide

Add an entry to `content/mahabalipuram-monuments.js` with its `osm` id (find it
on openstreetmap.org), add it to a route's `stops` in
`content/mahabalipuram-routes.js`, then re-run the fetch script. The route line
re-traces itself along real footpaths.

### Road directions are handed to Google, deliberately

Every monument card carries a **"Road directions on Google Maps →"** link
(`https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>&travelmode=driving`).

This guide draws its own routes from the OSM **footpath** network, which is the right
answer for walking between monuments once you are on site and the wrong one for getting
there by road from wherever you happen to be — that needs live traffic, the full road
network and the visitor's own position. Google already does it; duplicating it badly would
help nobody.

The destination is the monument's real OSM coordinate in Maps' own lat,lng order, and
**nothing about the visitor is sent** — the link carries a destination and nothing else.
Verified in the browser: 23 monument pins produce 23 links with 23 distinct destinations,
all inside the site bbox.

### "3D" opens the flythrough; "Tilt" tilts the map

The site map's **3D** control is a link to `mahabalipuram-3d.html#site` — the twelve-scene
cinematic scene — not a toggle. Before this the flythrough was unreachable from the site
map: the guide had no link to it anywhere.

Splitting it into two controls was forced by two things that would otherwise have broken:

- **The map already opens in 3D.** `DEFAULT_3D = true`, and `restoreFromHash()` bootstraps it
  with `threeDBtn.click()`. Turning that same button into a link would have navigated away
  during page load. The bootstrap now clicks `#g-tilt`, which still owns the diorama.
- **Flattening is a real feature, not decoration.** This page is used on site in glare, where
  the plan view is the legible one, so the way back to flat has to stay on screen. That is
  why the tilt toggle survives rather than being replaced.

**`#site` skips the globe.** The 3D page normally opens on a spinning globe you must click
India on. A visitor arriving from the site map is already looking at Mahabalipuram, so that
act is redundant and only puts a click between them and the flight. The hash goes through
`enterSite()` rather than merely not building the globe — `enterSite()` is what hands over to
the site camera after 1.4 s, so skipping it would land you on a half-initialised scene with no
flythrough at all. `enterCine()` builds its own tour path lazily and guards only on
`phase === "site"`, so nothing the flight needs was ever globe-specific. The "Back to globe"
button is hidden in this mode, because there is no globe to go back to.

The hash test is `/(^|[#&])site/`, so it matches `#site` and `#site&x=1` but not
`#cats=site` or `#stop=shore-temple`.

The two controls are distinguished by icon as well as label, because at phone widths
`.g-btn-text` collapses and they would otherwise be two identical cubes: Tilt keeps the cube,
3D takes a play glyph. 3D also carries the gold the toggles only take when pressed — it is a
destination, not a state.

### Honest limitations of the guide

- **Nothing is ever placed on the map that OSM did not supply.** OSM has no
  ticket counter and no lockers here, so those categories show **"0 recorded"**
  with an explanation rather than a guessed pin. A wrong toilet pin walks a real
  person to the wrong place.
- **Coordinates come from OSM, not Wikidata.** Wikidata's points for this site
  are bad — Varaha Cave is ~18 km out, and three monuments share one rounded
  placeholder ~200 m off.
- **This data deliberately bypasses `scripts/build-data.js`**, which scatters
  co-located markers by ~1.5 km to de-overlap the national map. Here,
  Mahishasuramardini and Olakkanneshwara are 37 m apart.
- **The basemap tiles cap at zoom 14** while the guide works at 16–18, so the
  footpath network and park boundary are drawn from OSM data rather than relied
  on from the basemap.
- **GPS is ambiguous on the hill.** Under tree cover accuracy runs 20–40 m and
  two of the cave monuments are 37 m apart, so the guide always shows the
  accuracy circle and never auto-selects a "nearest" stop.
- **No compass.** The vendored MapLibre has no `showUserHeading`, so you get a
  dot but not a facing direction.
- **Geolocation needs HTTPS.** `http://192.168.x.x:5500` on a phone will not
  work — browsers withhold `navigator.geolocation` on non-localhost HTTP and the
  control disables itself. Use a deploy preview or an HTTPS tunnel. Production
  also needs `Permissions-Policy: geolocation=(self)` in `vercel.json`; an empty
  `geolocation=()` disables it for the site's own origin too.
- **Two monuments cannot be shown at all.** Adivaraha Cave Temple and
  Atiranachanda Mandapa have their own Wikipedia sections but **no OpenStreetMap
  record anywhere**, and the guide places monuments only by OSM id — so there is
  no coordinate to put them at. They are left out rather than invented.
- **The destination page's flythrough deliberately shows only 8 of the 23.** Its
  height is `calc(100vh + steps * 60vh)`, so flying all 23 would take that page
  from ~6 screens of scroll to ~15. The flythrough is the cinematic intro; the
  grid below it is the full index.
- **The flythrough's heading carries a map card** (`js/site-map-card.js`, 2026-09-13):
  the 8 featured monuments as numbered pins, drawn as SVG from the site's own OSM
  extracts (roads, coastline, protected areas). There's no map library and no tile
  host: CARTO's free raster tiles now stamp "KEY REQUIRED" on every tile. Pins join
  `osm` ids against `data/mahabalipuram-osm.json`, and a monument with no OSM record
  gets no pin. Tiger Cave (4.7 km out) is an edge pin labelled with its distance.
  The pin for the card flying past is highlighted. Every label is shown. A label that
  can't sit next to its pin moves to the nearest free spot, with a hairline back to
  the pin. Pins closer together than a pin's width are nudged apart, with a dot and
  tick marking the true spot.
  - **At 860 px and wider** (computers), `place.js` moves the slot into the stage and
    adds `has-dock`. The map sits in a column left of the cards, aligned to `.wrap`,
    and stays open for the whole tour, highlighting each monument as its card
    passes. 860 px is the narrowest width that fits a 320 px map beside a 440 px card.
  - **Narrower** (phones), it stays in the head between the heading and the skip
    link. The map is tall (44 vh), so it folds away once the tour starts
    (`map-folded` + `inert`) and comes back when you scroll to the start. Crossing
    860 px on resize or rotation moves it live.
  Pins open `mahabalipuram-guide.html#stop=<id>`. With reduced motion the card heads
  the flat list instead.
- **Chapter II is an illustrated site plan** (`js/site-plan.js`, helpers and the zoom
  engine in `js/site-geo.js`; 2026-09-14) — the site from above, as a park board draws it,
  full width, zoomable. Drawn from the site's OSM extracts: roads, coastline and protected
  areas (the card's files), the tier-1 granite outcrops and buildings of
  `data/mahabalipuram-context.geojson` (the upper tiers are generated insets and are never
  drawn), and `data/mahabalipuram-plan.geojson` — the 13 monument outlines OSM has as ways,
  10 water bodies (the Temple pond, the Kanhari tank, the backwaters west of town), and
  landcover as mapped (grass 10, park 2, garden 3, scrub 1, beach 2; no forest, wetland or
  bare sand polygon exists in OSM here, so none is drawn). The "Everything" walking route
  comes from `data/mahabalipuram-routes.geojson`. All 24 monuments are numbered as the grid
  numbers them; every label is always shown (leader lines where a label has to move; nudged
  pins get a dot and tick at the true spot). What is declared on screen, and why:
  - **Each monument is a picture of its kind, not a portrait.** The 24 px pictures
    (stepped pyramid roof, wagon vault, hut, apsidal, walled compound with two towers, cave
    mouth, carved face, boulder, built temple, gateway, plain monolith, group) are the same
    drawing for every monument of that kind, not to scale and not turned to the real
    building. Which picture: `picture = m.picture || ROOF_PIC[m.roof] || FORM_PIC[m.form]`,
    where `form` is the hand-authored classification, `roof` is added **only where the repo
    documents it** (the five in `content/mahabalipuram-heights.js`; Ganesha Ratha barrel and
    Nakula-Sahadeva apsidal from `data/research/3d/03-rathas-resolved.md`; each with a
    `// source:` comment) and `picture` overrides only where `form` cannot say (the Shore
    Temple compound, the Rayala gopuram). The legend lists every picture used and says all
    of this.
  - **Where an outline is drawn it is the OSM area**; a monument with no outline is a point
    in OSM (the 11 nodes — mostly the cave temples).
  - **The five rathas are drawn to shape in an inset** ("The five rathas"): at site scale
    they are 2–6 px across. Roof lines follow the documented `roof` — a stepped pyramid as
    the file's own tier rings, a wagon vault as a ridge between the short sides, a hut as
    its diagonals — and are labelled drafting convention. Nakula-Sahadeva has no outline in
    the footprints file and is marked "position only".
  - **What the plan frames is the protected site**: a monument more than 400 m outside
    every polygon in `data/mahabalipuram-park.geojson` is a hollow edge pin with a
    straight-line distance, labelled as such (Tiger Cave 4.8 km, Mukunda Nayanar 1.1 km;
    Pidari at 374 m is in). Distance from the median of the group was tried first and
    put the rathas (1.0 km south of the hill) on the edge.
  - **Walking times** are the route's footpath legs at 4 km/h, printed with the speed
    and the metres; the first stop says that no ticket gate is mapped in OSM, so no time
    "from the entrance" exists; the five rathas say they are visited with stop 02; Tiger
    Cave quotes the route's own "by auto-rickshaw" note; Mukunda Nayanar gets a
    straight-line figure and says no footpath was used.
  - **"See in 3D" appears only for the 7 monuments in `data/pois.json`** — the 3D scene
    has no panel for the others. The link is `mahabalipuram-3d.html#site&poi=<id>`;
    `scene-3d.js` opens that panel and points the arrival glide at it, and on the list
    tier `scene-boot.js` scrolls to `#item-<id>`.
  - **Zoom is a redraw, not a transform.** `SiteGeo.zoomView(v0, s, cx, cy)` makes a new
    view (scale k·s, a world point at the box centre, clamped to the s = 1 frame) and the
    plan draws it crisp — base SVG with a half-box margin all round, pins, labels, scale bar.
    `SiteGeo.zoomable()` puts a CSS transform on `.spl-world` only while a gesture is in
    progress (pins counter-scale through `--zs`), then reports the settled view. Gestures:
    +/−/⟲ buttons and the +/−/0/arrow keys when the box has focus; wheel **only with ctrl or
    ⌘** (a macOS trackpad pinch arrives that way; a plain wheel scrolls the page and shows a
    hint); pinch; a one-finger drag only once zoomed in (`touch-action` is `pan-y` at s = 1,
    so a phone still scrolls the page over the map, and a non-passive `touchmove` stops iOS
    page-zoom during a pinch); double-click. Pointer capture is taken late — first real
    movement or second pointer — so a tap on a pin still reaches the pin, and a click left
    behind by a drag is swallowed for 350 ms. Pins outside the box at a zoom are hidden,
    never dragged to the edge; the popover closes when a gesture starts.
  - The popover is one `role="dialog"`: anchored beside its pin on a computer, a bottom
    sheet under 640 px or on any coarse pointer; Escape / outside click / close return
    focus to the pin. On phones the inset moves out from under the map (DOM move, so
    label layout only avoids it when it is on the map) and the map grows to 1 : 1.32.
  - The data (about 560 KB, mostly the context file) is fetched only when the section
    is within 600 px of the viewport.
- **On phones (≤ 640 px) the resting card sits in the middle of the screen.** Once
  the map folds, the heading hides and "Skip ↓" moves into the progress rail
  (`.fly-skip-hud`). The frame above the card is then about as tall as the rail
  below it. Measured at 437×696: card centre (219, 349) against a screen centre of
  (219, 348). The sideways swing of an arriving card scales with width
  (`min(155px, 20vw)`), so it doesn't start half off screen.
- **No offline support yet.** This is the page that most deserves a service
  worker; it would have to precache only this page's assets and never touch
  `assets/video/*`.

**3D view specifically:**

- **The blocks are massing, not models.** A real OpenStreetMap outline extruded
  to a published height, and stepped into the monument's **documented** number
  of storeys. The count is cited per monument (`tiersSource`); **how the height
  splits between the storeys and how far each one steps in are stylised** — a
  constant-slope tower stepped at the storey lines, tuned by eye against
  photographs, not surveyed. Draupadi Ratha's curved hut roof and the
  Butterball's rounded top are extra steps for shape only, marked
  `tierKind: "cap"` in the data so they can never be mistaken for storeys. The
  carving, the finials and the true plan of each storey are not in the geometry.
- **Every OSM outline here is larger than the monument's published plan.**
  Measured: Bhima 16.0 × 9.1 m against a cited 12.8 × 7.3; Dharmaraja
  10.8 × 10.3 against a cited 8.5 m square; the Butterball 8.0 × 7.3 against a
  cited ~5 m width. The ways trace the plinth or the surrounding rock, not the
  wall line, so **every ground tier is generous by roughly a quarter to a half**.
  The massing card says so on every monument.
- **The Shore Temple is deliberately not extruded.** Its one OSM way is
  46.4 × 21.5 m — 933 m², against a cited ~15 m square platform of 225 m². At
  4.1× the platform it is the walled prakara enclosing *both* shrines and the
  courtyard, not the vimana, and the cited 18 m belongs to the tall tower alone.
  Extruding it would put a 46 × 21 × 18 m slab on the shoreline. Same rule as
  the Pidari & Valayankuttai rathas: one outline with one height would be a lie
  about all of it. It qualifies the moment OSM carries a separate way for the
  vimana, or `building:part` polygons. It keeps its pin, card and map link.
- **Every tier of a monument sits level at the same point.** MapLibre samples
  terrain once per polygon at its vertex mean; the tiers are inset about the
  area centroid and the build script asserts the two stay within 2 m — well
  inside one ~30 m DEM sample — so a stack on a slope tilts as one object
  rather than shearing apart.
- **"Height" is ambiguous, so every record stores what it measures.** Above the
  plinth, above the surrounding rock, and including the finial are three
  different numbers.
- **A monument with no cited height is not extruded, and that is not a bug** —
  nor is one with no polygon. 23 of the 39 OSM records here are nodes with no
  outline upstream, Olakkanneshwara among them. Nakula Sahadeva Ratha is
  un-extruded purely because no published dimensions could be found for it.
- **Rock-cut monuments are excluded by design.** Krishna Mandapam and the Tiger
  Cave are excavated *into* the cliff; extruding their outlines upward would
  draw a building where the rock is hollowed inward.
- **Terrain gives the hill, never the rock.** The DEM is ~30 m posting. It
  renders the granite ridge (measured: ~4 m at the Shore Temple against ~19–23 m
  on the hill) but cannot resolve a boulder or a step. Two points 37 m apart on
  the hill fall inside one DEM sample, so their *relative* heights are not
  meaningful — only the broad shape is.
- **Blocks are level at their footprint centroid** — the renderer samples
  elevation once per polygon, so a monument on a slope sits flat, not stepped.
- **Pins are hidden by hills but not by monuments.** MapLibre's marker occlusion
  tests against the terrain depth buffer, which contains only the terrain mesh,
  so a pin behind a ratha draws on top of it. No fix exists in 5.24.0.
- **The sea sinks.** The DEM carries real bathymetry to about −240 m in this
  coastal tile and it is exaggerated along with the land; terrarium encoding
  offers no clamp. Fog in paper tones hides the far field — the near dip is real
  data drawn honestly, and it looks like a hole.

### Notes / honest limitations

- **The sources are 720p AI renders (Veo/Flow), not real 4K — and they
  carry heavy depth-of-field blur baked in by the renderer.** The
  2160p/1440p tiers are a Lanczos upscale of that footage: same detail,
  much bigger files. Nothing in this pipeline can make the page genuinely
  4K-sharp. Getting there needs either a higher-resolution render from
  Flow, or a real AI upscaler (Topaz Video AI / Real-ESRGAN) run on the
  clips before `stitch:video` — neither is available in this repo.
  The stitched master is written at the clips' own cropped size rather than
  upscaled, so the ladder resamples once per tier instead of twice.
- **The watermark trim is right-edge only (12%), not a 15% corner crop.**
  Measured on the 1280×720 clips, the mark occupies `x 1137–1183,
  y 575–625` — it starts 11.2% in from the right but only 20% up from the
  bottom, so trimming the right alone clears it. The earlier 15%-both-sides
  crop threw away 28% of the frame, and with it real resolution. Override
  per-edge with `--trim-right=` / `--trim-bottom=`; `--trim-corner=N` still
  sets both. Preview the boundary with `?debugFrame=1` before an encode.
- **`delogo` was tried and rejected.** Painting the mark out keeps the full
  frame, but on the Pancha Rathas sand it leaves a visibly smeared patch —
  worse than losing the edge.
- `?debugFrame=1` draws the crop safe-area box over the video.
- In dev (localhost), the rail shows a second, dimmer bar for the buffered
  range, and tier/duration decisions are logged to the console.
- The combined track's height is `150vh per 8s` of master, re-applied once
  real metadata lands. Loading starts at `preload="metadata"` so first paint
  never waits on the video body.
- **Arjuna's Penance has no source clip yet.** Its chapters are written and
  commented out in `content/mahabalipuram-tour.js` (and
  `js/monuments-content.js`); supply `assets/video/arjuna.mp4`, re-stitch,
  paste the offsets, and uncomment.
