# India Heritage Tourism Map — Project Plan

An interactive map on the homepage of the tourism site. The map always shows the
**current** map of India, but a **time slider** below it moves through history
from **2000 BC to 2026**. As the slider moves, the sites and stories visible on
the map change: rock paintings, temple architecture, ASI (Archaeological Survey
of India) protected sites, excavation sites, and — after 1947 — the documented
public record year by year. Content is built and released **one subdivision at
a time** (states/regions of India).

**Decisions locked (2026-08-04):** scope = all India; timeline = 20 periods of
200 years.

---

## 1. The core concept

| Element | Decision |
|---|---|
| Base map | Present-day map of India (current state boundaries, cities) — history is overlaid on it, the base never changes |
| Time range | 2000 BC → 2026 AD |
| Time steps | **20 periods of 200 years** (locked) |
| Modern track | From **1947 → 2026**, a fine-grained year-by-year track using the public record |
| Content layers | Rock paintings · Temple architecture · ASI/UNESCO sites · Excavation sites · Post-1947 records |
| Per-site story | "What happened before" and "what happened till now" — each site's narrative runs from its origin period to the present |
| Rollout | Subdivision by subdivision — state/UT by state/UT |

## 2. The timeline model (locked: 20 × 200 years)

```
P01  2000–1800 BC        P11  1–200 AD
P02  1800–1600 BC        P12  200–400 AD
P03  1600–1400 BC        P13  400–600 AD
P04  1400–1200 BC        P14  600–800 AD
P05  1200–1000 BC        P15  800–1000 AD
P06  1000–800 BC         P16  1000–1200 AD
P07  800–600 BC          P17  1200–1400 AD
P08  600–400 BC          P18  1400–1600 AD
P09  400–200 BC          P19  1600–1800 AD
P10  200–1 BC            P20  1800–2026 AD
```

- Each site has `period_start`/`period_end`; the map shows every site whose
  lifespan overlaps the selected period.
- Sites older than 2000 BC (Bhimbetka's Mesolithic paintings, Harappan cities)
  simply appear from P01 onward — their true earlier dates are stated in the
  detail panel.
- A site still standing (most temples, all ASI monuments) stays visible from
  its origin period to the end; abandoned cities (e.g. Harappan sites) drop off
  the map after their `period_end` but reappear as **excavation sites** in P20
  when they were dug up.
- **P20 (1800–2026) opens the modern track**: the slider expands into a finer
  scale, and from **1947 to 2026 a year-by-year record** (laws, UNESCO
  inscriptions, excavations, discoveries, conservation, tourism milestones)
  scrolls alongside the map, each entry linked to its site.
- Each period also carries a one-paragraph India-wide caption ("what was
  happening in India in this period") shown under the slider.

## 3. Content layers

Each layer is a toggleable overlay with its own icon and colour:

1. **Rock paintings / prehistoric art** — Bhimbetka, Edakkal, Lakhudiyar,
   Konkan petroglyphs, and other painted shelters/petroglyph fields across the
   states. Fields: estimated age, style, discovery, protection status.
2. **Temple architecture** — a chronological story of Indian temple building:
   rock-cut caves → Gupta beginnings → Pallava/Chalukya/Chola/Hoysala Dravida
   and Vesara → Nagara (Khajuraho, Odisha Kalinga) → Vijayanagara/Nayaka →
   regional styles (Kerala, Himalayan, Northeast) → modern temples. Tagged
   with style + dynasty so the map can show architecture evolving as the
   slider moves.
3. **ASI / UNESCO sites** — UNESCO World Heritage Sites plus flagship ASI
   monuments (forts, tombs, mosques, stepwells, ancient universities, colonial
   monuments), with protection status and inscription years.
4. **Excavation sites** — Harappan cities, early historic capitals, and modern
   digs (Keeladi, Rakhigarhi, Sinauli…). Two lives on the timeline: the
   ancient occupation (early periods) and the excavation story (P20).
5. **Post-1947 record** — the year-by-year modern track (§2).

Every site gets a **detail panel**: photos, the two-part narrative ("before" /
"till now"), and source citations — every date must trace to a source.

## 4. Research

Primary research is **done** (2026-08-04) — five parallel research passes, one
per layer, each producing structured JSON verified against ASI, UNESCO, state
archaeology departments, and academic/press sources:

- `data/research/rock_art.json` — 38 major rock art sites
- `data/research/temples.json` — 60 landmark temples across styles/periods
- `data/research/asi_unesco.json` — 59 flagship monuments incl. full UNESCO list (through Sarnath, 2026)
- `data/research/excavations.json` — 41 major excavation sites
- `data/research/post1947.json` — 80 dated entries, 1947–2026

`scripts/build-data.js` merges the four site files into the app-ready
`data/sites.geojson` (198 sites; run `node scripts/build-data.js` after any
research edit). `data/periods.json` holds the 20 period definitions and captions.

**Political geography (done 2026-08-04):** six parallel research passes mapped
who ruled which land in every period — 149 polities across P01–P20, each with
dynasty, kings and reigns, capital, summary, sources, and territory expressed
as modern states (`data/research/dynasties_*.json`, merged and validated into
`data/dynasties.json`). Rendered as the "Kingdoms" choropleth overlay using
`data/india_states_min.geojson` (36 state polygons, 30 KB, dissolved from
district boundaries). Territory-by-state is an intentional approximation; each
state is assigned to its dominant power per 200-year period.

Standing reference sources for later state-by-state deepening: ASI's list of
~3,600 centrally protected monuments (per-circle lists), *Indian Archaeology:
A Review* annual volumes, state archaeology departments, INTACH chapters,
district gazetteers.

## 5. Data model

```
sites.geojson  — one Feature per site:
  id              "RA-001" (rock art) / "TM-…" (temple) / "AS-…" (ASI/UNESCO) / "EX-…" (excavation)
  name, state, coordinates [lng, lat]
  type            rock_art | temple | asi_site | excavation
  period_start    signed integer year (negative = BC)
  period_end      signed integer year (2026 if extant)
  style, dynasty, protection, summary
  narrative_before / narrative_now
  images[]        with credit and rights status
  sources[]       citations

periods.json         — the 20 period definitions + India-wide caption each
records.json         — post-1947 entries (year, category, text, related sites)
subdivisions.geojson — state/UT boundaries + released yes/no flag
```

Research JSON → a small build script → these app-ready files. Content is never
hand-edited inside the app.

## 6. Technical architecture

- **Frontend:** React + **MapLibre GL JS** (free, no API key) over
  OpenStreetMap tiles; India-extent default view.
- **Time slider:** snaps to the 20 periods; expands into the year-by-year
  track on P20. Period changes filter GeoJSON client-side — no server needed.
- **Layer toggles**, **state selector** (unreleased states greyed out as
  "coming soon"), **detail panel** on site click.
- **Hosting:** fully static (GitHub Pages / Netlify / Vercel).
- **Mobile-first:** most tourist traffic is on phones.

## 7. Homepage layout

```
+--------------------------------------------------------------+
|  Site header                                                 |
+----------------------------------------------+---------------+
|                                              |  Detail panel |
|          MAP OF INDIA (current-day base)     |  (opens on    |
|   ▲ rock art  ● temples  ■ ASI  ◆ excavation |   site click) |
|                                              |               |
+----------------------------------------------+---------------+
|  ◄ P01 ▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ P20 ►                     |
|  "800–1000 AD — [one-line India-wide caption]"               |
+--------------------------------------------------------------+
|  Layer toggles   |   State selector                          |
+--------------------------------------------------------------+
```

## 8. Subdivision rollout (state by state)

The national launch ships with the curated all-India dataset (§4) so the map
is meaningful everywhere from day one. Then each state gets a **deepening
pass** — adding its full ASI circle list, state-protected monuments, lesser
rock art sites, and local narratives:

1. Rank states by heritage density and tourism priority; pick a pilot
   (Tamil Nadu or Madhya Pradesh are natural pilots — both dense in all four
   layers).
2. Pilot state: full research from ASI circle lists + state archaeology dept +
   gazetteers → spreadsheet → GeoJSON → release.
3. Review pass each time: verify coordinates, verify dates against citations,
   secure photo rights.
4. Repeat state by state; unreleased states still show the national-tier sites.

## 9. Phases and milestones

| Phase | Work | Output |
|---|---|---|
| 0. Decisions | ~~Scope, timeline~~ — done (all India, 20×200) | Plan locked |
| 1. Research | ~~Five parallel research passes (§4)~~ — done | `data/research/*.json`, `data/sites.geojson` |
| 2. Skeleton | Map + slider + layers with the researched national dataset | Working homepage demo |
| 3. Periods & narratives | 20 period captions; "before/now" narratives per site | Full content pass |
| 4. Post-1947 track | Year-by-year timeline UI wired to records.json | Modern record browsable |
| 5. Review & publish | Fact check, coordinate check, mobile polish | National launch |
| 6. State rollout loop | Deepening pass per state (§8) | One release per state |
