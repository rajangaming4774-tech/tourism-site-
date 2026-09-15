# Existing 3D scans / photogrammetry of the Mahabalipuram monuments — research findings

Researched 2026-09-07. Full structured data: `scans-photogrammetry.json` (same directory).

## Verdict, up front, no hedging

**Nothing found in this search is usable, as-is, for a published open-source or commercial heritage project without further negotiation.** Specifically:

- **A real scan of the Descent of the Ganges relief exists and was found**: [`Descent of the Ganges (Mahabalipuram)`](https://sketchfab.com/3d-models/descent-of-the-ganges-mahabalipuram-0b67258142634592949281094ca48b38) by Jules Morel, a Toulouse-based researcher whose stated specialty is "Surface Reconstruction from 3D points" and whose other Sketchfab uploads are terrestrial-LiDAR forest scans — strong circumstantial evidence this is a genuine photogrammetric/LiDAR capture, not a hand model. It is **2.2M triangles / 1.1M vertices**, and its description quotes the relief's dimensions as "96 by 43 feet (29 m × 13 m)" — matching this project's own 29.26 × 13.10 m plate almost exactly. **But it carries no license, no download option, and no stated capture method or coverage extent.** It sits behind Sketchfab's default "Standard" (all-rights-reserved, view-only) terms. This is a lead to chase by contacting the author (Sketchfab handle `@jules.morel`, personal site `julesmorel.com`), not a resource you can use today.
- **Two small fragments are genuinely open-licensed and downloadable**: two Harex-Studio mobile-LiDAR/photogrammetry scans (a temple boundary-wall carving, and a single-stone Yazhi/lion figure) under **CC BY-NC**. They are tiny (15k–28k triangles), not tied to a single named monument, and the NonCommercial clause means they cannot go into anything monetized — but if this project is strictly non-commercial and gives attribution, they are legally clean to use as detail reference or texture fragments.
- **A full, systematic photogrammetry survey of five separate Mamallapuram monuments exists** (Shore Temple, Varaha Cave Temple panel, two Mahishasuramardini Mandapa panels, Tiger Cave) by a Chennai photographer, Suresh Babu — but every single model is locked under Sketchfab's Standard license, and the author states outright in the comments that he will not share the files ("Hard work! can't give easy/free. Sorry!"; "if you want buy call me!" with a phone number). This proves the monuments **have** been scanned to a usable standard by a working professional — it is a paid-licensing lead, not a free resource.
- **No major heritage-documentation body has published Mahabalipuram data.** CyArk's full public project catalog (~140 projects, directly enumerated) includes exactly two India sites — the Elephanta Caves and the Gateway of India, both in Mumbai — and nothing in Tamil Nadu. Open Heritage 3D's full 62-project catalog (directly enumerated) has zero India entries at all. Google/CyArk's "Open Heritage" 3D-scan program (26 sites, 18 countries) does not include Mahabalipuram either. Zamani Project's public scope is Africa (plus a few Middle East sites); nothing indicates Indian work.
- **The Google Arts & Culture pages for Shore Temple, Olakkanesvara Temple, Krishna Mandapam, and the Seven Pidaris are Street-View-style photo panoramas, not 3D models** — do not mistake these for the CyArk-powered "Open Heritage" 3D viewer; they are a different, older Google feature and carry no 3D geometry at all.
- **Smithsonian Open Access 3D (3d.si.edu) could not be checked** — the site is behind a Cloudflare bot-verification challenge that blocked both the fetch tool and the browser tool. Per this task's rules, no attempt was made to solve/bypass it. This is a genuine gap in the research, not a negative result — a human should check it directly.
- **Krishna's Butterball, the Pancha Rathas (individually or as a group), Ganesha Ratha, Krishna Mandapam, and Olakkanneshwara Temple: nothing found anywhere** — not on Sketchfab, not at any of the named heritage-documentation bodies, not in academic literature, not on 3D marketplaces. Honest empty result.
- Two commercial/institutional leads (a $999 CGTrader Shore Temple asset; a Dassault Systèmes/Kural Aram Foundation "parametric" Shore Temple model) show no evidence of being built from real scan data — both read as **hand-built reconstructions**, not measured captures, and neither publishes data or licensing terms.
- The best **free, legally-clean 2D reference** for the Descent of the Ganges relief is a set of CC-BY-SA/GFDL panoramic photographs on Wikimedia Commons (up to 7,003×2,972 px) — not a scan or true orthophoto, but usable as texture reference under attribution, with the caveat that perspective photographs are not rectified plates and will show projection distortion if mapped directly onto a UV plane.

---

## Per-monument summary

| Monument | Scan found? | Best lead | License status |
|---|---|---|---|
| Shore Temple | Yes (2 independent captures) | Suresh Babu (Sketchfab, 5M tris) — professional quality | Standard/no-download; phone contact only for licensing |
| | | CGTrader "3Debuy" model ($999) | Reconstruction, not confirmed scan; paid commercial license |
| Pancha Rathas (all 5, individually) | **Nothing found** | — | — |
| Arjuna's Penance / Descent of the Ganges | Yes — the key find | Jules Morel (Sketchfab, 1.1M vertices) | Standard/no-download; author not yet contacted |
| | | Théo Derory "Relief at Mahabalipuram" (98-photo photogrammetry, 751.8k vertices) — coverage unclear, may be a detail, not the full panel | Standard/no-download |
| | | Wikimedia Commons panoramic photos (2D only) | CC BY-SA / GFDL, free to use as texture reference |
| Krishna's Butterball | **Nothing found** | — | — |
| Varaha Cave | Yes | Suresh Babu, Varaha Panel (106k tris) | Standard/no-download |
| Mahishasuramardini Mandapa | Yes | Suresh Babu, 2 panels (Anantha Sayana + Mahishasuramardini-Panel-1) | Standard/no-download |
| Krishna Mandapam | **Nothing found** (only a Street-View photo page on Google Arts & Culture, not a 3D model) | — | — |
| Olakkanneshwara | **Nothing found** (only a Street-View photo page on Google Arts & Culture, not a 3D model) | — | — |
| Ganesha Ratha | **Nothing found** | — | — |
| Tiger Cave / Saluvankuppam | Yes (2 independent captures) | Suresh Babu (35.2k tris) and volkerku (126.9k tris) | Both Standard/no-download; Suresh Babu explicitly refuses to share |

Two bonus items found outside the 12-monument list, for completeness: a downloadable CC BY-NC scan of a generic temple boundary-wall carving, and a scan of the free-standing stone elephant sculpture near the Five Rathas complex — neither tied to one specific named monument.

---

## Detailed findings by source

### Sketchfab (searched directly, and via Sketchfab's own site search)

Sketchfab's tag-browse pages (`/tags/mahabalipuram`, `/tags/shore-temple`) are JavaScript-rendered and did not return content through the automated fetch tool; Sketchfab's own site search (`/search?q=mahabalipuram`) did render via the browser tool and is the source of most results below. Every individual model URL listed was opened directly and its page text extracted to confirm title, author, triangle/vertex counts, publish date, description, and — critically — whether a "Download 3D Model" button and license panel were present (their absence means Sketchfab's default "Standard," all-rights-reserved, view-only license applies).

**Downloadable, CC-licensed (usable within license terms):**
- [Photogrammetry of mahabalipuram temple wall](https://sketchfab.com/3d-models/photogrammetry-of-mahabalipuram-temple-wall-801e36b73d6b49078d8914cb3cb0b73d) — Harex-Studio, **CC Attribution-NonCommercial**, 15.3k tris, captured with the Laan Labs "3D Scanner App" (mobile LiDAR), 1,028 downloads recorded.
- [Photogrammetry of Tamil -Simma Yazhi](https://sketchfab.com/3d-models/photogrammetry-of-tamil-simma-yazhi-d6e483e0dced4c0fafff33f406d49e73) — Harex-Studio, **CC Attribution-NonCommercial**, 27.6k tris, same method, 553 downloads recorded.

Both are small architectural/sculptural fragments (a boundary-wall carving and a single carved lion figure), not full monuments, and the NonCommercial clause rules out any commercialized use of the resulting site.

**View-only, Standard license (real scans, but not obtainable):**
- [Shore Temple, Mamallapuram(Mahabalipuram)](https://sketchfab.com/3d-models/shore-temple-mamallapurammahabalipuram-4a6a5c0795034b7fa91bbbd384b5ab28) — Suresh Babu, 5M tris/2.5M verts. Author: *"Why all are asking download, if you want buy call me! +919445516016"*
- [Varaha Panel | Varaha Cave Temple | Mamallapuram](https://sketchfab.com/3d-models/varaha-panel-varaha-cave-temple-mamallapuram-da44b2b4d459477c9338e27f892ac909) — Suresh Babu, 106k tris.
- [ANANTHA SAYANA PANEL @ Mamallapuram Cave Temple](https://sketchfab.com/3d-models/anantha-sayana-panel-mamallapuram-cave-temple-795383f9725e42419df2fd03a4edb5c0) — Suresh Babu, 377.1k tris (Mahishasuramardini Mandapa relief).
- [Mahishasuramardini-Panel-1](https://sketchfab.com/3d-models/mahishasuramardini-panel-1-8e89f8a1c8cf499bad2e32179aedfa80) — Suresh Babu, 508.7k tris. A commenter directly asks "which software you used?" for the photogrammetry — confirming the method — and is not answered.
- [Tiger Cave - Hindu Temple](https://sketchfab.com/3d-models/tiger-cave-bf5c3d3ced7d4e03a7c16dbeb80ef699) — Suresh Babu, 35.2k tris. Author explicitly refuses two separate download requests: *"Hard work! can't give easy/free. Sorry!"*
- [Rock Carvings Mahabalipuram, Tamil nadu India](https://sketchfab.com/3d-models/rock-carvings-mahabalipuram-tamil-nadu-india-510ad47a389c4c8780a1468719e4b339) — volkerku, 354k tris, published 2016. Method unstated; six different users ask for the file over nine years and are never answered.
- [Tiger Cave Mahabalipuram, Tamil nadu India](https://sketchfab.com/3d-models/tiger-cave-mahabalipuram-tamil-nadu-india-78ba4f358235443cb5ca216fee7ad561) — volkerku, 126.9k tris. Notes the cave "was discovered after the 2002 tsunami washed away the top soil."
- **[Descent of the Ganges (Mahabalipuram)](https://sketchfab.com/3d-models/descent-of-the-ganges-mahabalipuram-0b67258142634592949281094ca48b38)** — Jules Morel, 2.2M tris/1.1M verts, published 2016. **The single most important find of this research** — see verdict above.
- [Relief at Mahabalipuram](https://sketchfab.com/3d-models/relief-at-mahabalipuram-953db08928bc4587b29769834a40b2d4) — Théo Derory, 1.5M tris/751.8k verts, published 2022. Page states directly: *"Model made by photogrammetry with 98 photos."* Description text is a generic Wikipedia paste and doesn't clearly identify which relief section was captured; with only 98 source photos this is likely a partial capture rather than the full 29 m panel.
- [Stone Elephant from Tamil Nadu, India](https://sketchfab.com/3d-models/stone-elephant-from-tamil-nadu-india-3e3ec9fa01924dd2b0ce21d20efbea48) — Lisa Lokshina, 1.6M tris, tagged "agisoft/photoscan/photogrammetry." The free-standing stone elephant near the Five Rathas, not one of the 12 named monuments.

No Sketchfab results were found for: Pancha Rathas (as a group or any individual ratha — Dharmaraja, Bhima, Arjuna, Nakula-Sahadeva, or Draupadi Ratha), Krishna's Butterball, Ganesha Ratha, Krishna Mandapam, or Olakkannesvara Temple, despite multiple targeted searches for each.

### CyArk (cyark.org) — verified, nothing for Mahabalipuram

Fetched `cyark.org/projects/` directly and enumerated its full public project list (~140 titles across ~60 countries). India appears exactly twice: **Elephanta Caves** and **Gateway of India**, both in Mumbai. No Tamil Nadu site, and no Mahabalipuram/Mamallapuram monument, appears anywhere in the list.

### Open Heritage 3D (openheritage3d.org) — verified, nothing for Mahabalipuram

Fetched `openheritage3d.org/data.php` and enumerated the full 62-project catalog. Countries represented: Saudi Arabia, Myanmar, USA, Maldives (13 separate sites), Indonesia, Ukraine, Scotland, Turkey, Italy, Bangladesh, Spain, Mexico, Peru, Greece, Japan, San Marino, Turkmenistan, Australia, Canada. **Zero India entries of any kind.**

### Google Arts & Culture "Open Heritage" (CyArk-powered 3D program) — verified, nothing for Mahabalipuram

This is Google's dedicated 3D-laser-scan viewer program built on CyArk data (26 sites, 18 countries: e.g. Bagan, Chichen Itza, Rapa Nui, Temple of Apollo, Thomas Jefferson Memorial). Since it draws directly from CyArk's catalog (already confirmed to have no Mahabalipuram entry), and no search turned up a Mahabalipuram-specific Open Heritage page, this is confirmed absent.

**Important distinction:** Google Arts & Culture separately hosts *Street View–style panoramic photography* for [The Shore Temple](https://artsandculture.google.com/streetview/the-shore-temple-mahabalipuram/OgGy1o29AAfiVg?hl=en), [Olakkanesvara Temple](https://artsandculture.google.com/streetview/olakkanesvara-temple-mahabalipuram/KAFy9ejWfIz_0w), [Krishna Mandapam](https://artsandculture.google.com/streetview/krishna-mandapam-mahabalipuram/IwGbozp7sNQ1Rw?hl=en), and [The Seven Pidaris](https://artsandculture.google.com/streetview/the-seven-pidaris-mahabalipuram/5AH7fcGMdoWhJA), credited to the Archaeological Survey of India as partner. **These are NOT 3D models** — they are pannable 360° photos, the same technology as Google Street View indoor tours. Do not confuse them with the Open Heritage 3D-scan program above.

### Zamani Project (zamaniproject.org) — UNVERIFIED by direct fetch; "nothing found" with high confidence

The site's "explore sites" page did not render usable content through either the fetch tool or the browser tool (empty body both times — likely a JS-heavy SPA the automated tools couldn't execute fully). Falling back to independently-sourced descriptions of the project's scope (Wikipedia and third-party heritage-tech press), Zamani's stated mission is "The African Cultural Heritage Sites and Landscapes Database," founded by Prof. Heinz Rüther at the University of Cape Town, with all cited project work in Africa (plus some Middle East, e.g. Petra). No source consulted mentions Indian sites. This is marked UNVERIFIED in the JSON because the primary source could not be directly confirmed, but treat it as a real negative.

### Smithsonian Open Access 3D (3d.si.edu) — genuinely could not be checked

Both the fetch tool and the browser tool hit a Cloudflare "Just a moment... / Request Verification" bot-check page. Per the task's explicit rule against bypassing CAPTCHAs/bot-detection, no further attempt was made. A site-restricted web search (`site:3d.si.edu Mahabalipuram`) returned no indexed matches, which is weak supporting evidence but not a real check of Smithsonian's internal search. **This is a genuine gap — a human should search 3d.si.edu directly.**

### MyMiniFactory "Scan the World" — nothing found, moderate confidence

Two targeted web searches returned no connection between the "Scan the World" campaign and Mahabalipuram/Mamallapuram. The platform's own internal search was not queried directly via browser (time-boxed); treat this as a probable but not fully certain negative.

### IGNCA / Indian Digital Heritage / ASI — no dedicated 3D-scanning project of Mahabalipuram found

- **IGNCA** (Indira Gandhi National Centre for the Arts): search surfaced only its manuscript/document digitisation partnership with IHUB Drishti Foundation (IIT Jodhpur) — no mention of physical-monument 3D scanning at Mahabalipuram. IGNCA's own website was not directly crawled for a 3D archive section; a gap worth closing manually.
- **ASI** (Archaeological Survey of India): its Mahabalipuram and Chennai Circle pages (asi.nic.in, asichennai.gov.in) were found in search results but show no public 3D-documentation deliverable; general commentary elsewhere says ASI has been "recommended" to adopt LiDAR/3D scanning, not that it has published Mahabalipuram data.
- **IIT Madras, "Indian Digital Heritage" programme** (Prof. A. N. Rajagopalan, researcher Pratyush Sahay): a student-magazine article ([t5eiitm.org/from-the-ruins](https://www.t5eiitm.org/from-the-ruins/)) shows a before/after figure captioned "A lion face from Mahabalipuram and its reconstruction" — this is an **AI/algorithmic in-painting reconstruction** of a damaged carving (i.e., the group's broader published work is on Hampi; the Mahabalipuram lion face appears only as one illustrative example). Not a raw scan, not publicly downloadable, specific carving/monument unidentified. Classified as RECONSTRUCTION. Worth a direct research inquiry to the lab.

### Academic literature (Google Scholar / ResearchGate / ISPRS / Nature / Emerald, via web search)

No paper specifically about Mahabalipuram/Mamallapuram photogrammetry, laser scanning, or point-cloud documentation was located. Two papers that looked promising on first search were fetched and ruled out:
- A Nature *Scientific Reports* paper on "Digital documentation and virtual representation of built heritage using terrestrial LiDAR" — actually about the **Old Law College, Chennai** (a different, colonial-era building), not Mahabalipuram; data explicitly stated as not publicly available.
- An Emerald *Journal of Cultural Heritage Management and Sustainable Development* paper on photogrammetry 3D modeling for heritage preservation — actually about **Bamuni Hill, Assam** (10th–12th century ruins), not Mahabalipuram.

ISPRS Archives searches for Mahabalipuram/Mamallapuram terrestrial laser scanning returned no matching papers.

### Commercial 3D marketplaces (CGTrader, TurboSquid, Thingiverse, 3D Warehouse, ArtStation)

- [CGTrader — "mamallapuram shore temple 3D model"](https://www.cgtrader.com/3d-models/architectural/floor/mamallapuram-shore-temple) — seller "3Debuy," $999, Royalty Free License, Maya/FBX/Blender formats, 8192×8192 textures. **No mention of photogrammetry, scanning, or site reference anywhere in the listing** — classified as a likely hand-built RECONSTRUCTION, not a scan, with unverifiable dimensional accuracy.
- SketchUp 3D Warehouse and 3dmdb.com list a "Shore Temple at Mahabalipuram" model and an ArtStation "Vishnu Shrine from Shore Temple... ReArk 3D" piece — surfaced in search but not individually fetched/verified in depth; both read as artist works from their titles/platforms rather than scan-derived assets. Flagged for follow-up if pursued further.
- No Thingiverse, TurboSquid, or MyMiniFactory results were found for the Pancha Rathas, Shore Temple, or any other named monument.

### Dassault Systèmes Foundation / Kural Aram Foundation — a live but opaque initiative

[Sea Shore Temple: Reviving Ancient Techniques](https://www.lafondation3ds.org/projects/sea-shore-temple-reviving-ancient-techniques/) — the Chennai-based Kural Aram Foundation, backed by La Fondation Dassault Systèmes India, states it is building "a full parametric 3D model rooted in historical research" of the Shore Temple, intended to eventually export CNC/waterjet/3D-print-ready files for craft education. The phrase "rooted in historical research" (rather than "scanned" or "captured") suggests this is architectural/parametric modeling informed by scholarship, not a direct photogrammetric or LiDAR capture of the standing structure — classified as RECONSTRUCTION. No public data link, no license terms, and no clear evidence the carved figural reliefs (as opposed to the temple's architectural form) are even part of the scope. Worth a direct outreach email; not usable today.

### Wikimedia Commons — the best free 2D reference (not a scan)

[Category:Descent of the Ganges](https://commons.wikimedia.org/wiki/Category:Descent_of_the_Ganges) holds roughly 196 files. One file was individually verified: [Descent of the Ganges 01.jpg](https://commons.wikimedia.org/wiki/File:Descent_of_the_Ganges_01.jpg) by Bernard Gagnon, dated 2006-01-29, 3,933×1,703 px, dual-licensed **CC BY-SA (1.0/2.0/2.5/3.0) + GFDL 1.2+**. Several wider panoramic stitches exist in the same category and are worth a closer look for use as reference/texture imagery (none independently license-verified beyond the one file above — recheck before use):
- `Descent of Ganges panorama.jpg` — 6,564 × 1,585 px
- `Arjuna's penance - 2009.jpg` — 7,003 × 2,972 px
- `Mahab Pano1.jpg` — 6,108 × 3,550 px
- `Arjunas penance Panorama.jpg` — 4,531 × 2,161 px

**Caveat:** these are perspective photographs/stitches, not rectified orthophotos. Mapped straight onto a flat UV plate they will show projection distortion (parallax, lens distortion, non-uniform scale across the panel) — usable as reference/inpainting source, not as a metrically accurate plate, without further rectification work.

---

## Recommended next actions, in priority order

1. **Contact Jules Morel** (Sketchfab `@jules.morel`, `julesmorel.com`) about the Descent of the Ganges model — ask for capture method, coverage (full panel or partial), resolution, and licensing/release terms. This is the only located capture that is both scan-quality and specifically of the target relief.
2. **Contact Suresh Babu** (Sketchfab `@sureshbabu`, phone number published on his Shore Temple listing: +91 9445516016) about commercial licensing for his five-monument survey (Shore Temple, Varaha Cave panel, two Mahishasuramardini panels, Tiger Cave) — he has explicitly invited paid inquiries.
3. **Manually search 3d.si.edu** (Smithsonian) directly — this tool could not get past its bot-check.
4. **Email the Kural Aram Foundation / La Fondation Dassault Systèmes India** about the Sea Shore Temple parametric model's scope and data availability.
5. **Query IGNCA and ASI Chennai Circle directly** (rather than via web search) for any unpublished or restricted-access 3D documentation of Mahabalipuram.
6. If none of the above yield a releasable full-panel capture, the fallback path is: commission new photogrammetry of the Descent of the Ganges relief (a 29 m panel is a tractable DSLR/drone photogrammetry job), or use the Wikimedia Commons CC-licensed panoramas as a projected reference texture with manual rectification, clearly documented as an approximation rather than a measured plate.
