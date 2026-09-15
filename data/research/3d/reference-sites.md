# Reference sites for the Mahabalipuram 3D tour — what's actually worth copying

Every URL below was fetched or curled directly (or, where that failed, marked
`SECONDARY`/`UNVERIFIED` and explained why) rather than described from memory.
Full machine-readable detail, including every `notes` field, is in
`reference-sites.json`; this file is the read-it-once version, ranked by what to
steal rather than by prettiness.

## The six references most worth copying from

1. **Zamani Project** (zamaniproject.org) — the closest working precedent to
   this project's own constraints anywhere found. Static HTML + jQuery, no
   build step, Sketchfab iframes for the 3D, and — the thing to copy — **each
   site page keeps "3D Models", "Plans & Sections" (real measured drawings) and
   "Panorama Tour" in separate tabs**, instead of trying to encode "this bit is
   measured, this bit isn't" inside the viewer itself. This project already
   makes that distinction (measured monuments vs. nominal massing); Zamani
   shows a free, no-code way to make it *visually obvious* too.
2. **Smithsonian Voyager's `document.json` manifest** — a live scene manifest
   (fetched directly) that declares **LOD tiers with byte sizes as data**: Thumb
   215KB → Low 986KB → Medium 1.95MB → High 4.97MB. Quality/size is a first-class
   field in the format, not a hidden implementation detail. This project's
   295KB-gzipped monuments GLB is one hard-coded asset for everyone; a small
   JSON table alongside it (this project already asserts file sizes in its own
   README) would let a future version choose a tier honestly, or let a visitor
   choose one.
3. **The London Charter** (londoncharter.org) — not a website to copy, the
   *academic standard* this project's practice already matches without having
   cited it. Its "paradata" principle — the nature and degree of factual
   uncertainty in a reconstruction must be communicated — is exactly what the
   README's measured/nominal split, `tierKind: "cap"`, and `decorative: true`
   flags already do, and arguably do more rigorously than the Charter's own
   cited example (TroiaVR's blunt on/off toggle). Worth citing by name in this
   project's own documentation.
4. **Codrops' Blender-camera-path tutorial** (tympanus.net) — the single most
   directly portable *code* technique found. Author the camera path visually in
   Blender, export sampled points; drive scroll via GSAP's `Observer` plugin;
   smooth the live parameter with `gsap.quickTo()` for free momentum/inertia.
   Three.js + GSAP from a CDN, no bundler. Worth layering onto
   `js/scene-tour.js`'s existing uniform mapping — while keeping this project's
   own arc-length correction, which the tutorial itself lacks and would need.
5. **scrollama.js** (The Pudding / Russell Samora) — the best no-build,
   vanilla-JS match in the whole survey (confirmed live on unpkg). It solves 2D
   DOM-reveal, not 3D camera progress, so it shouldn't replace `scene-tour.js`'s
   own scroll math — but its `IntersectionObserver`-driven step-progress events
   are exactly right for a **decoupled per-scene citation overlay**: fade a
   small sourcing card in and out per scene without touching the camera-drive
   listener.
6. **Reuters Graphics' "Inside Ukraine's Kill Zone"** — confirmed by direct
   fetch to be built from discrete pre-rendered `<video>` clips per step, not
   real-time WebGL. This isn't a technique to copy so much as **validation**:
   a flagship newsroom graphics desk reaches for scroll-scrubbed video over
   WebGL for exactly the kind of "flight through a place" sequence this
   project's own combined-mode video tour already is. That page is not cutting
   a corner; it's doing what Reuters does.

Runner-up worth a one-line mention: **Pannellum / Marzipano** (open-source,
~21–55KB gzipped, no build step, WebGL 360 panorama viewers with hotspots).
Neither is used by anything inspected in this research for Mahabalipuram
specifically, but they are a genuine, cheap answer to the README's own stated
gap — "[the relief] needs photogrammetry of the actual relief; it cannot be
modelled from a description" — because a single real, high-resolution
face-on *photograph* of the actual carving, dropped into a Pannellum hotspot
next to the abstract 3D massing, lets a visitor see the real thing without
this project ever pretending its geometry is more than it is.

## A. Institutional heritage 3D platforms

Two parallel research passes fetched these directly (DOM/script inspection
where the browser tool was available, curl/WebFetch otherwise); see
`reference-sites.json` for exact URLs and verification status per entry.

- **Zamani Project** — VERIFIED, static site, Sketchfab + a bundled 3DVista
  (three.js-based) panorama player, zero build step. See above.
- **CyArk** (cyark.org) — VERIFIED. Sketchfab iframes for individual sites;
  a proprietary guided-tour product ("Tapestry") for multi-scene experiences
  whose internals weren't inspectable. Cites real methodology in prose next to
  models ("documented in 2016... through 3D laser scanning and high resolution
  imagery") but does **not** visually distinguish scanned from interpretive
  content anywhere inspected — this project's own measured/nominal split is
  stricter than CyArk's own public presentation.
- **Google Arts & Culture Open Heritage** — VERIFIED via direct DOM inspection.
  Google Poly (the original 2018 viewer) is dead; live pages now render
  through the **`<model-viewer>` web component** with `camera-controls`,
  `loading="lazy"`, and a custom `environment-image` for HDR lighting — a
  standalone custom element, CDN-loadable, zero build step. Checked directly
  for Mahabalipuram: **not present** in the collection. The only Indian site
  found in it is the Gateway of India, Mumbai — that page gates the model
  behind an explicit "Loading 3D model" click and a separate AR-export step,
  and credits CyArk with no scan-methodology disclosure on the page itself.
- **Sketchfab + Smithsonian Voyager** — VERIFIED, exact embed markup captured
  for both. British Museum's Sketchfab profile: 263 models, iframe embed
  (`sketchfab.com/models/{id}/embed?...`), triangle/vertex counts and licence
  shown, but no structured scan-vs-restoration field — captions are free text.
  Voyager: real, open source (Apache 2.0, three.js + lit-element), embeddable
  with one custom element + one script tag; its `document.json` manifest is
  this survey's strongest single find (see above).
- **Iconem** (iconem.com) — VERIFIED. Project microsites embed Iconem's own
  platform via a plain iframe; inside, the UI literally states "3D Powered by
  Potree" (point-cloud/mesh WebGL viewer, webpack bundle, keyboard controls
  S/R/L/G). The best/most recent project data sits behind a partner gate, not
  public by default. The iframe-embed pattern for a heavy external viewer fits
  a static site fine; Potree's own build does not, without a build step.
- **Europeana / 3D-ICONS** — VERIFIED for the project deliverables (pre-glTF
  era, X3D/VRML/COLLADA tooling now largely unviewable); live europeana.eu item
  pages are UNVERIFIED (Cloudflare bot challenge, not bypassed). The honest
  lesson is cautionary, not technical: betting on a bespoke pre-standard format
  makes a heritage 3D project unviewable within a decade — an argument *for*
  the plain-glTF convergence seen in every other entry here.
- **Sahapedia / IGNCA / "Virtual Hampi" / Indian Digital Heritage** — searched
  directly and via web search. **No live 3D-viewer equivalent exists for any
  Indian institution**, Mahabalipuram or otherwise, beyond the dead
  Digital Hampi placeholder (digitalhampi.in, confirmed live-but-empty: "Currently
  website is under construction") and the single Gateway-of-India model in
  Google's CyArk collection. This is a genuine, checked-for negative finding —
  there is no Indian-institutional 3D precedent for this specific site to
  benchmark against or plausibly get data from.

## B. Scrollytelling 3D journalism and explainers

- **NYT — Notre-Dame fire 3D fly-through** — real three.js/WebGL scroll-driven
  camera through a glTF cathedral, built in under 24 hours by the AR team.
  SECONDARY: the live page itself is gated by a DataDome bot-challenge
  (confirmed directly — the fetched body is a captcha shell, not the article).
  No documented no-WebGL fallback found anywhere for it either.
- **NYT — Notre-Dame acoustics piece (2024)** — SECONDARY via a Storybench
  interview. Confirms the team deliberately chose a "restricted camera path"
  over free exploration for narrative control — the same choice this project
  already made.
- **Reuters — "Inside Ukraine's Kill Zone"** — VERIFIED by direct fetch:
  Svelte-built, individual pre-rendered `<video>` clips per step with a
  per-step progress bar, not WebGL. Validates this project's own video-scrub
  page. Reuters also maintains an open-source Svelte `Scroller` component
  (VERIFIED repo, thin docs) implementing the same sticky-panel +
  `IntersectionObserver` pattern scrollama.js gives you for free without a
  build step.
- **Washington Post — Notre-Dame before/after** — UNVERIFIED. Both WebFetch and
  a direct curl attempt failed to connect at all; no secondary source found
  either. Recorded as a named miss rather than dropped silently.
- **The Pudding** — VERIFIED for their own process essays. **No Pudding piece
  does real-time 3D camera scrollytelling** — searched multiple ways, found
  none. Their actual contribution is scrollama.js itself (see the shortlist
  above) plus a genuinely useful comparison of six 2D scrollytelling libraries,
  none of them 3D-relevant.
- **National Geographic** — no verifiable 3D scroll piece found; the one
  historical candidate ("Killing Kennedy," 2013) is SECONDARY-described as
  parallax photo/video panels, not WebGL.
- **Awwwards — UNESCO Museum of Stolen Cultural Objects** — VERIFIED case-study
  page (live site itself 403'd to WebFetch). Tagged 3D/WebGL, infinite-scroll
  room navigation. Its own jury score — **7.0/10 on both accessibility and
  responsiveness** — is the useful data point: even Site-of-the-Day-caliber
  heritage WebGL work doesn't reliably nail mobile or accessibility either.
- **Google/British Museum "Museum of the World"** — UNVERIFIED (not
  independently fetched), but multiple independent secondary sources agree it
  is **desktop-only, no mobile version**. Confirms this project's own
  mobile-first video-scrub page is doing something a well-funded institutional
  3D piece simply chose to skip.
- **Codrops Blender/GSAP tutorial** and **scrollama.js** — see the shortlist
  above; these are the two genuinely portable technique finds in this whole
  category.

**What `js/scene-tour.js` is still missing, compared to the best of the
above:** nobody in this survey — NYT, Reuters, WaPo, Awwwards, the Codrops
tutorial, or The Pudding's own best-practices writeups — documents a
no-WebGL fallback, a `prefers-reduced-motion` path, or keyboard-driven scene
stepping. That's not a list of things to copy; it's confirmation these are
open industry-wide gaps, so solving even one would put this project ahead of
every reference checked, not just catching up.

## C. UX patterns worth stealing

- **Measured vs. reconstructed, drawn differently on purpose.** The academic
  precedent is the **London Charter**'s "paradata" principle (2006, extended by
  the Seville Charter 2017) — see the shortlist above. The Charter explicitly
  does *not* prescribe a visual convention, which is why practice varies: some
  papers use a red/extant vs. blue/hypothetical colour code, others a
  Primary/Secondary/Guesswork three-tier split. TroiaVR's toggle (cited by the
  Charter itself) is the one concrete precedent for a **time-slider/toggle
  between "as excavated" and "as reconstructed"** — cruder than this project's
  own per-tier sourcing, worth noting as the closest real analogue to a
  "measured vs. nominal" switch.
- **Information-architecture separation, not viewer cleverness.** Zamani's
  tabbed 3D/Plans/Panorama split (shortlist #1) does the same honesty work as
  a colour code, for free, with no rendering complexity.
- **Declared LOD/quality tiers as data.** Smithsonian Voyager's
  `document.json` (shortlist #2) — the strongest, most portable idea found.
- **Audio guides.** No concrete, inspectable audio-guide implementation was
  found attached to any 3D viewer in this research (Voyager's docs mention
  "sonification" annotations on some datasets as a stated feature, not
  independently confirmed working). This remains an open gap with no
  reference implementation to copy from, not a place this project is behind.
- **Accessibility of 3D content.** `<model-viewer>`'s keyboard rotation support
  was an *open GitHub feature request* (google/model-viewer#187, filed 2018);
  its current shipped status could not be confirmed either way from the live
  docs — reported honestly as unverified rather than assumed. Iconem's Potree
  viewer does have keyboard controls (S/R/L/G) but they're undocumented as
  accessibility features, not labelled or discoverable. **No example anywhere
  in this research pairs a 3D heritage viewer with confirmed, working keyboard
  navigation AND screen-reader support.** `prefers-reduced-motion` for
  JS-driven (not CSS) animation has a simple, well-documented pattern
  (`window.matchMedia`, see JSON note `note-prefers-reduced-motion`) — but zero
  uses of it were found anywhere in this survey, including the pieces that are
  otherwise the most sophisticated (the Codrops tutorial, NYT's Notre-Dame
  piece). This is the single cheapest, most confirmed-open gap this project
  could close first.

## D. Tamil Nadu / Indian tourism sites — what they get right and wrong

- **UNESCO World Heritage Centre, site 249** (whc.unesco.org/en/list/249/) —
  VERIFIED by direct curl (WebFetch itself was 403'd). Gets right: rigorous,
  citable Statement of Outstanding Universal Value with exact criteria, dates,
  and legal protections (see JSON for the full extracted text — AMASR Act 1958,
  100m/200m prohibited/regulated zones). Gets wrong, or rather admits: **no
  georeferenced polygon data for this specific property yet** ("will be made
  available once the GIS data will be received by UNESCO"), and its own
  interactive map is bolted-on Esri ArcGIS with a plain-text WebGL-required
  fallback message — worth copying the *fallback message pattern*, not the
  GIS stack.
- **ASI ticketing** — entry fee Rs 35 (Indian/SAARC) / Rs 550 (foreign), hours
  6:00 AM–6:00 PM, timed-slot booking only. VERIFIED only via a third-party
  mirror (ticketprice.in); the **official ASI portal itself
  (eticket.webfront.in/asi/quick/mam) is JS-only and returned nothing but a
  "Loading.." shell**, and **ASI's own Chennai Circle site
  (asichennai.gov.in) was completely unreachable** from this research
  environment — both a standard fetch and a direct curl against its resolved
  IP timed out, consistent with a government site that firewalls non-Indian
  traffic. Spot-check these figures against a live visit or a recent traveller
  report before citing them as current fact.
- **Tamil Nadu Tourism** (tamilnadutourism.tn.gov.in) — VERIFIED. Does the
  standard things (carousel, embedded YouTube 360 video, Google Maps, live
  weather) with nothing native 3D. Measured directly: **8.8 seconds** just for
  the initial HTML to return over a plain request — a real problem for the
  on-site mobile-data visitor this project's own guide page is built for.
- **Incredible India** (incredibleindia.gov.in) — VERIFIED. Modern CMS,
  per-monument sub-pages, Adobe Scene7 image CDN, no 3D. Its stated "16-foot"
  figure for Krishna's Butterball is uncited editorial copy, not a primary
  source — do not treat it as citable without independent confirmation.
- **Sahapedia** — has scholarly-quality prose on the Pallava dynasty and
  Mahabalipuram's monument count (roughly 14 cave temples, nine monolithic
  shrines, three structural temples, four relief panels, per a Sahapedia
  article surfaced via search) but no 3D or interactive content of any kind
  found.
- **Google Arts & Culture's own Mahabalipuram content** — a plain
  text-plus-archival-photography exhibit authored by ASI ("Sculpture by the
  Sea," VERIFIED, fetched directly) naming a useful three-period stylistic
  classification (Mahendra / Mamalla / Rajasimha styles) — citable if that
  framing isn't already in this project's period data, but zero 3D or
  interactivity.

## E. Performance and accessibility benchmarks observed

| Site | Measured directly | Note |
|---|---|---|
| Tamil Nadu Tourism | 8.8s to first byte / full HTML (curl) | Server-side, not asset weight — still a real mobile-data problem |
| Incredible India | 0.88s response, ~594KB raw HTML | Fast server, heavy initial markup |
| Reuters "Kill Zone" | 436KB HTML shell + per-step MP4s loaded on demand | Video-per-step, not one big preload |
| Awwwards jury score, UNESCO Stolen Objects Museum | 7.0/10 accessibility, 7.0/10 responsiveness | Best-in-class heritage WebGL site, still mediocre on both axes this project cares about |
| Google/British Museum "Museum of the World" | Desktop-only per multiple secondary sources | No mobile path at all |
| Smithsonian Voyager | Explicit LOD byte sizes: 215KB / 986KB / 1.95MB / 4.97MB | Declared, not hidden |
| model-viewer | `loading="lazy"` only | No user-facing quality tier control found |
| Iconem | No visible file-size/progress UI | Potree handles its own progressive load internally, opaque to the visitor |

No site in this entire survey — institutional or journalistic — was found to
gate its 3D behind an explicit "this will download N MB, continue?" prompt.
This project's own README-level honesty about file sizes (295KB gzipped GLB,
329KB raw / 26KB gzipped buildings, etc.) is already unusual by the standard
of everything inspected here; it just isn't surfaced to the *visitor*
anywhere yet.

## What would NOT fit this project's constraints

- Iconem's Potree viewer, Europeana/EUreka3D's Data Hub, CyArk's Tapestry,
  and Reuters' Svelte Scroller all need a build step or a heavy vendor bundle
  — none are portable to a static, no-npm, vanilla-JS site without
  substantial rework or simply linking out to them.
- 3D-ICONS' X3D/VRML/COLLADA-era tooling is the cautionary tale, not an
  option: it's largely unviewable today, a decade on.
- Esri ArcGIS (UNESCO's own map) is a heavy commercial GIS stack, not
  something to adopt for its 3D — only its plain-text WebGL fallback message
  is worth copying.

## What does fit, cleanly, and isn't in the project yet

- `<model-viewer>` (Google, open source, CDN script tag, zero build step) for
  any future single-object inspection view.
- A Sketchfab iframe embed, if this project ever wants one high-fidelity
  artefact close-up without hosting the viewer itself.
- scrollama.js for a decoupled per-scene citation-overlay layer.
- Pannellum or Marzipano (both ~20-55KB gzipped, no build step) for a real
  photograph of the Descent of the Ganges relief as a 360/hotspot view,
  directly addressing the README's own stated "cannot be modelled from a
  description" gap without inventing geometry.
- A `prefers-reduced-motion` gate on the scroll-camera listener — the single
  cheapest fix, and confirmed absent from every reference checked in this
  research, not just this project.
