# Mahabalipuram / Mamallapuram — Open-License Photography & Measured Drawings

Research pass for the tourism-main Blender pipeline. Companion machine-readable file: `imagery-plates.json` (array of the same records, one object per source). Every URL below was fetched with WebFetch during this research session unless marked **UNVERIFIED**; nothing here is invented. "Verified" means the URL resolved and returned real content — it does not by itself mean the license claim is airtight, so read the license column carefully.

---

## 0. Bottom line

**No single verified photograph confirmed to be a genuine, one-frame, face-on capture of the *entire* 29.26 x 13.10 m Descent of the Ganges panel was found.** The panel is too large for a normal lens at normal shooting distance to cover in one frame without either standing very far back (open ground in front of the relief may allow this) or stitching multiple frames. What *does* exist, in rough order of promise:

1. A 2025 systematic photo-survey of the relief by photographer **Rainer Halama** (Wikimedia Commons, CC BY‑SA 4.0, 6000x4000 px, four sequential frames found: WUS01847/48/56/57) — frontal, high resolution, openly licensed, but coverage of the *full* panel in a single frame is unconfirmed; likely needs to be treated as a stitching set. **This is the best lead to chase first** — download the whole `Category:Descent of the Ganges` (196 files) and check which Halama frames overlap to cover the complete panel edge to edge.
2. A **19th-century Boston Public Library / James Fergusson plate**, "Descent of the Ganges, or Arjuna's Penance, Mamallapuram, India" — public domain, titled (unlike its sibling item) without a "central portion" qualifier, suggesting a wider/fuller view, shot the way period survey photographers usually worked (large-format camera, set back for the whole tableau). 68.5 MB TIFF available. **Best historic candidate** but its actual pixel dimensions and precise coverage were not confirmed — download and inspect before committing.
3. Everything else found is either historic-but-low-resolution (1868 Lyon photo, 853x667 px), a hand sketch rather than a photograph (Mackenzie Collection, 976x402 px), an explicitly partial/detail shot (elephant group, Kinnara figure, "central portion"), or rights-restricted (ANU Basham photo).

**Recommendation:** treat this as "no confirmed single-frame plate yet" and either (a) download and stitch the Halama 2025 set, (b) commission/plan a same-session photogrammetry-style multi-frame shoot (drone or ladder + telephoto from across the plaza), or (c) fall back to (2) as the flat reference plate and accept it may need moderate upscaling/cleanup.

---

## 1. Best candidate orthophoto plates for the Descent of the Ganges relief

| # | Source | License | Resolution | Angle | Notes |
|---|--------|---------|------------|-------|-------|
| 1 | [Mahabalipuram-Descent_of_the_Ganges-WUS01847.jpg](https://commons.wikimedia.org/wiki/File:Mahabalipuram-Descent_of_the_Ganges-WUS01847.jpg) | CC BY-SA 4.0 | 6000x4000 | face-on | Rainer Halama, 2025-02-20 19:55, Sony ILCE-6600 + Tamron 17-70mm@17mm |
| 2 | [Mahabalipuram-Descent_of_the_Ganges-WUS01848.jpg](https://commons.wikimedia.org/wiki/File:Mahabalipuram-Descent_of_the_Ganges-WUS01848.jpg) | CC BY-SA 4.0 | 6000x4000 | face-on | Same session, 1 min later |
| 3 | [Mahabalipuram-Descent_of_the_Ganges-WUS01856.jpg](https://commons.wikimedia.org/wiki/File:Mahabalipuram-Descent_of_the_Ganges-WUS01856.jpg) | CC BY-SA 4.0 | 6000x4000 | face-on | Same session |
| 4 | [Mahabalipuram-Descent_of_the_Ganges-WUS01857.jpg](https://commons.wikimedia.org/wiki/File:Mahabalipuram-Descent_of_the_Ganges-WUS01857.jpg) | CC BY-SA 4.0 | 6000x4000 | face-on | Same session |
| 5 | ["Descent of the Ganges, or Arjuna's Penance, Mamallapuram, India"](https://www.digitalcommonwealth.org/search/commonwealth:vh541018k) (Boston Public Library / Fergusson Collection) | Public Domain — no known copyright restrictions | 68.5 MB TIFF (px dims not stated; download to check) | face-on (likely — untitled as "central portion" unlike its sibling) | c. 1850-1886, James Fergusson Collection. **Direct TIFF:** `digitalcommonwealth.org/downloads/commonwealth:qj72sb53w?filestream_id=image_primary` |
| 6 | ["Central portion of Arjuna's Penance..."](https://www.digitalcommonwealth.org/search/commonwealth:rx916s10q) (same collection) | Public Domain | 70 MB TIFF | detail | Explicitly the central/elephant-cleft section only — good detail/normal-map source for that zone, not the whole plate |
| 7 | [1868 photo by Edmund David Lyon](https://commons.wikimedia.org/wiki/File:An_1868_photograph_of_Arjuna's_Penance,_Mahabalipuram,_Tamil_Nadu.jpg) | Public Domain (PDM 1.0) | 853x667 | face-on (album context) | Earliest photo found; resolution too low for displacement use, documentation value only |

None of rows 1-4 were confirmed by visual inspection (tool constraints) to individually cover edge-to-edge; they are the single best lead because they are recent, high-resolution, consistently licensed, and clearly a deliberate multi-frame documentation pass of the same subject on the same day. **Action item:** pull the full `Category:Descent of the Ganges` (196 files) and `Category:Group of elephants (Descent of the Ganges)` (89 files) listings, identify every Halama/WUS-numbered frame, and either find one that covers the full panel or mosaic several.

Detail plate of the elephant group specifically: [2025 - Mahabalipuram - 05.jpg](https://commons.wikimedia.org/wiki/File:2025_-_Mahabalipuram_-_05.jpg), 7238x5428 px — license not individually verified in this pass, confirm on file page before use.

---

## 2. General monument photography (open license)

A single photographer/survey ("WUS" file-naming, associated with Rainer Halama and Wiki Loves Monuments 2025) appears to have systematically shot many Mahabalipuram monuments in February 2025 at 6000x4000 px under CC BY-SA 4.0. This is a strong, consistent, high-resolution modern dataset if the license holds across the set (confirmed directly for the Descent of the Ganges frames; inferred but not individually re-verified for the others below — check each file page before use).

| Monument | Wikimedia Commons category | Sample file(s) verified | License |
|---|---|---|---|
| Shore Temple | [Category:Shore Temple](https://commons.wikimedia.org/wiki/Category:Shore_Temple) | [Shore_Temple_Mahabalipuram.jpg](https://commons.wikimedia.org/wiki/File:Shore_Temple_Mahabalipuram.jpg), 3456x3740 | CC BY-SA 3.0 (Mkamath1976) |
| Pancha Rathas (all 5) | [Category:Pancha Rathas](https://commons.wikimedia.org/wiki/Category:Pancha_Rathas) — subcats: [Arjuna's Ratha](https://commons.wikimedia.org/wiki/Category:Arjuna%27s_Ratha) (46 files), [Bhima's Ratha](https://commons.wikimedia.org/wiki/Category:Bhima%27s_Ratha) (103), [Dharmaraja Ratha](https://commons.wikimedia.org/wiki/Category:Dharmaraja_Ratha) (87), [Draupadi's Ratha](https://commons.wikimedia.org/wiki/Category:Draupadi%27s_Ratha) (54), [Nakula Sahadeva Ratha](https://commons.wikimedia.org/wiki/Category:Nakula_Sahadeva_Ratha) (31) | up to 8064x6048 in the 2025 series (category browse, not individually opened) | Mixed — verify per file |
| Krishna's Butterball | [Category:Krishna's Butterball](https://commons.wikimedia.org/wiki/Category:Krishna%27s_Butterball) (116 files) | [Krishna's_Butter_Ball,_Mamallapuram.JPG](https://commons.wikimedia.org/wiki/File:Krishna's_Butter_Ball,_Mamallapuram.JPG), 4000x3000 | CC BY-SA 3.0 (Viswa2625) |
| Varaha Cave | [Category:Varaha Cave Temple](https://commons.wikimedia.org/wiki/Category:Varaha_Cave_Temple) + subcats for the Varaha and Durga relief panels inside | Mahabalipuram-Varaha Cave Temple-WUS02038.jpg, 5552x3701 | UNVERIFIED at file level (WUS series) |
| Mahishasuramardini Mandapa | [Category:Mahishasuramardini Cave Temple](https://commons.wikimedia.org/wiki/Category:Mahishasuramardini_Cave_Temple) (31 files, 3 subcats) | [File (37426086116)](https://commons.wikimedia.org/wiki/File:Mahishasuramardini_Mandapam,_Pallave_period,_7th_century,_Mahabalipuram_(30)_(37426086116).jpg) | UNVERIFIED — likely CC BY 2.0 (Richard Mortel series) |
| Krishna Mandapam | [Category:Krishna Mandapam](https://commons.wikimedia.org/wiki/Category:Krishna_Mandapam) (124 files) | not individually opened | UNVERIFIED |
| Trimurti Cave | [Category:Trimurti cave temple in Mahabalipuram](https://commons.wikimedia.org/wiki/Category:Trimurti_cave_temple_in_Mahabalipuram) (70 files) | not individually opened | UNVERIFIED |
| Ganesha Ratha | [Category:Ganesha Ratha](https://commons.wikimedia.org/wiki/Category:Ganesha_Ratha) (65 files) | Mahabalipuram-Ganesha_Ratha-WUS02037.jpg, 6000x4000 | UNVERIFIED at file level (WUS series) |
| Olakkanneshwara | [Category:Olakkanesvara Temple](https://commons.wikimedia.org/wiki/Category:Olakkanesvara_Temple) | Mahabalipuram-Olakkanesvara_Temple-WUS01952.jpg, 4000x6000; also IMG_20250221_093524.jpg, 5245x6999 | UNVERIFIED at file level |
| Tiger Cave, Saluvankuppam | [Category:Tiger Cave](https://commons.wikimedia.org/wiki/Category:Tiger_Cave) (33 files) | Tiger Cave, Mahabalipuram.jpg, 7360x4912; panorama variant 5159x1939 | UNVERIFIED at file level |
| Adivaraha Cave | not found as a distinct Commons category in this pass | — | — |
| Lighthouse | [Category:Mahabalipuram lighthouse](https://commons.wikimedia.org/wiki/Category:Mahabalipuram_lighthouse) (61 files, listed as redirect target — check Olakkanesvara category too, the old lighthouse sits atop that temple) | not individually opened | UNVERIFIED |

**Follow-up needed:** none of the WUS-series category-level files above were opened at the individual file-page level except the four Descent-of-the-Ganges frames — the license is very likely CC BY-SA 4.0 across the whole 2025 survey (same uploader pattern) but this must be confirmed per file before use, per the project's stated care about license precision.

---

## 3. Historic / public-domain photography and survey plates

| Source | Status | License | Notes |
|---|---|---|---|
| [Boston Public Library — James Fergusson Collection of Photographs of Indian Architecture](https://www.digitalcommonwealth.org/search/commonwealth:vh541018k) | Verified | Public Domain | Two items found (full view + central portion, see section 1). This is the strongest PD historic photo lead — the collection likely has more Mahabalipuram plates (Shore Temple, rathas) not individually searched in this pass. Worth a dedicated Digital Commonwealth search for "Fergusson Mahabalipuram" / "Fergusson Mamallapuram" beyond the two items found. |
| [1868 photograph by Edmund David Lyon](https://commons.wikimedia.org/wiki/File:An_1868_photograph_of_Arjuna's_Penance,_Mahabalipuram,_Tamil_Nadu.jpg) | Verified | Public Domain (PDM 1.0) | British Library source, low-res (853x667) digitization on Commons. |
| [19th c. Mackenzie Collection sketch, "Ancient Sculptures on the Rocks at Mavelliporum"](https://commons.wikimedia.org/wiki/File:19th_century_sketch_of_Descent_of_the_Ganges_Arjuna_Penance_Mamallapuram_monuments,_Tamil_Nadu_India.jpg) | Verified | Public Domain (PDM 1.0) | Pen-and-ink, not a photo, low-res (976x402), part of a 37-sheet Mackenzie Collection album covering multiple Mahabalipuram monuments (see below). |
| Mackenzie Collection album (37 drawings/plans of Mahabalipuram temples & sculptures, c. 1816) | UNVERIFIED at the album/catalogue level | Individual extracted sheets found on Commons are PD; the British Library catalogue record itself (`searcharchives.bl.uk/catalog/032-003288785`) was not independently fetched | Best pre-photographic "surveyed" record set found — includes a Krishna Mandapa relief sketch. Worth pulling the rest of the 37 sheets via Commons' `Category:History of the group of monuments at Mahabalipuram`. |
| British Library "Images Online" (1880 photo by Nicholas & Co., 1880s anonymous photo, 1825 J. Gantz sketch) | **UNVERIFIED — could not fetch** | Likely rights-managed / commercial, NOT open | The direct `ogimages.bl.uk` URLs cited secondhand by a blog are dead (DNS failure); `imagesonline.bl.uk` returned HTTP 403 to automated fetch and is in any case the British Library's *commercial* picture-purchase site, distinct from any open archive. Do not treat as open-license without manually re-checking on the BL's current site/catalogue. |
| Alkazi Collection of Photography | Verified (existence/access model only) | Not online / not openly licensed | 100,000+ 19th-20th c. South Asia photos, strong in archaeology, but the collection is only browsable digitized on-site at their New Delhi office (M-141 Greater Kailash-2); no specific Mahabalipuram holding confirmed. A research-trip or written-inquiry lead, not a downloadable source. |
| ANU Archives — A.L. Basham photo, "general view from left" | Verified | **All rights reserved / permission required** | Explicitly not for reuse without contacting ANU Archives. Listed for completeness; do not use. |
| Endangered Archives Programme (British Library) | Partially verified | Varies by project | Search confirmed "59 items indexed under Mahabalipuram" exist in the EAP/BL system, but individual items/licenses were not opened in this pass — follow up at `eap.bl.uk`. |

---

## 4. Measured drawings / plans

| Source | Status | License | Notes |
|---|---|---|---|
| [Alexander Rea, *Pallava Architecture* (ASI New Imperial Series vol. 34), 1909](https://archive.org/details/in.ernet.dli.2015.35686) | Verified | Public Domain | 310 pages @ 600 DPI. Full-view download confirmed: PDF (16.2/32.7 MB), JP2 zip (284.5 MB), EPUB, DAISY, OCR text. Specific plate numbers for Mahabalipuram monuments not enumerated by automated fetch — open the PDF directly and search for plate captions. Alternate scan: [archive.org/details/in.gov.ignca.21629](https://archive.org/details/in.gov.ignca.21629) (not independently re-verified but same title/author). |
| [James Fergusson & James Burgess, *The Cave Temples of India*, 1880](https://archive.org/details/cavetemplesofind00ferguoft) | Verified | Public Domain | Full PDF (52.3 MB), EPUB, JP2, DAISY, OCR text all downloadable. Description confirms 150+ maps/plans/drawings across the book covering Mahabalipuram among other sites; specific plate/page numbers for Mahabalipuram were not extracted in this pass — search the OCR text for period spellings ("Mahavellipore", "Mamallapuram", "Seven Pagodas"). Other copies: [dli.csl.7221](https://archive.org/details/dli.csl.7221), [cavetemplesindia00burg](https://archive.org/details/cavetemplesindia00burg) — cross-check scan quality. |
| Shore Temple floor plan (Wikimedia Commons, Sarah Welch) | Verified | **CC0 1.0** | 5100x3300 px. File page explicitly warns this is an *approximate schematic*, not a precise survey — "relative scale and relative dimensions ... are close to the actual but neither exact nor complete." Use as a first-pass footprint reference only. |
| ASI Annual Report 1935-36 | Partially verified | Likely Public Domain | Only the raw OCR text stream was fetched (`.../..._djvu.txt`); go to the parent item page (`archive.org/details/in.ernet.dli.2015.35507`) to check image/plate formats. |
| [archive.org/details/MAHABALIPURAM](https://archive.org/details/MAHABALIPURAM) ("MAHABALIPURAM: Archaeological Survey of India") | Verified (existence) | Likely Public Domain (ASI publication) | 58 pages, PDF 7.7 MB, EPUB, JP2 zip 74 MB, 600 PPI. Automated fetch could not confirm specific contents (image titles) or explain a reported "Malay" language tag (probably an OCR-detection artifact) — open directly to verify. |
| UNESCO WHC nomination dossier / documents (site 249) | **UNVERIFIED — 403 on fetch** | Unknown | `whc.unesco.org/en/list/249/documents/` blocked automated fetch. Visit manually; the 1984-era original nomination dossier may not be in the online document system at all and could require a direct request to UNESCO. Also check `/en/list/249/` (main record) and `/en/list/249/gallery/`, neither fetched in this pass. |

---

## 5. Sources checked but not useful / dead ends

- `ogimages.bl.uk` direct image URLs (cited by a third-party blog for BL Nicholas & Co. and Mackenzie Collection images) — DNS failure, the British Library has since restructured its online systems.
- `bl.uk/onlinegallery/...` legacy path — 404.
- `imagesonline.bl.uk` — 403 to automated fetch; also a commercial/rights-managed picture library, not an open archive, so even if accessible it would not satisfy the project's open-license requirement without a paid clearance.
- University of Washington Digital Collections Tiger Cave item — page resolves but is a CONTENTdm shell that didn't yield metadata to automated fetch; needs a manual browser visit.

---

## 6. Suggested next actions

1. **Download the full Halama/WUS 2025 Descent-of-the-Ganges set** (and check `Category:Group of elephants (Descent of the Ganges)`, 89 files) and visually determine whether any single frame — or a straightforward 2-4 frame mosaic — covers the complete 29.26 x 13.10 m panel edge to edge. This is CC BY-SA 4.0, high-res, and recent — by far the easiest path to a usable displacement plate if coverage checks out.
2. **Download the Boston Public Library / Fergusson TIFF** (`commonwealth:qj72sb53w`, 68.5 MB) and check its actual pixel dimensions and coverage — it is public domain and titled as the fuller view, making it the best fallback if the modern photos don't cover the whole panel.
3. Individually verify license on every "UNVERIFIED at file level" entry in the JSON before using it in production — this pass confirmed the categories exist and sampled resolutions, but did not open every file page.
4. Open the Rea 1909 and Fergusson & Burgess 1880 PDFs directly and locate plate numbers for Mahabalipuram's individual monuments (rathas, Shore Temple, mandapas) — both are full public domain and were confirmed downloadable, but per-plate indexing was not completed in this research pass.
5. Manually (browser, not automated fetch) check `whc.unesco.org/en/list/249/documents/` and the British Library's current catalogue system, since both blocked automated access in this session.
