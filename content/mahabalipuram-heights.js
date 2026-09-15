/* Hand-authored monument heights for the 3D view.
 *
 * THE RULE — a monument is extruded only if all three hold:
 *   (a) it has a real OpenStreetMap polygon (a node has no outline),
 *   (b) its height comes from a published, citable source, and
 *   (c) its plan outline actually IS its footprint — a free-standing mass,
 *       not an excavation cut into a cliff, and not a boundary fence.
 * Fail any one and it stays a flat pin. This is the same rule the facility
 * layer follows: nothing goes on this map that a source did not supply.
 *
 * `scripts/fetch-site-data.js` builds its footprint query FROM this table, so
 * "no cited height" and "no polygon fetched" are the same condition. There is
 * no way to ship an uncited extrusion.
 *
 * Entries with `height: null` are kept on purpose. Recording WHY something is
 * not extruded is more useful than silently omitting it.
 *
 * `measure` is not decoration. "11 m" means nothing until you say whether that
 * is above the plinth, above the surrounding rock, or includes the finial. The
 * extrusion is drawn from the terrain surface upward, and the terrain here is
 * ~30 m resolution — it does not model plinths.
 *
 * `tiers` NEEDS A CITATION EXACTLY LIKE A HEIGHT. It is the number of steps a
 * reader can count on screen, so a guessed count is as misleading as a guessed
 * height. If you cannot cite one, put `tiers: 1` and get a plain box.
 *
 * What is documented and what is not, stated once so the README and the UI can
 * both point at it: the storey COUNT is cited per monument. How the total
 * height is split between the storeys, and how far each one steps in, are
 * STYLISED — tuned by eye against photographs, not surveyed.
 *
 * Also worth knowing when reading these: every OSM outline here is larger than
 * the monument's published plan (measured: Bhima 16.0 × 9.1 m against a cited
 * 12.8 × 7.3; Dharmaraja 10.8 × 10.3 against a cited 8.5 square). The ways
 * trace the plinth or the surrounding rock, not the wall line, so every ground
 * tier is generous by roughly a quarter to a half.
 */
window.MAHABALIPURAM_HEIGHTS = [
  {
    osm: "way/576022688",
    label: "Dharmaraja Ratha",
    form: "monolith",
    tiers: 3,
    roof: "pyramidal",
    tiersSource: "Wikipedia, “Dharmaraja Ratha” — “It has three floors including the ground floor”; terraced pyramidal tower with an octagonal shikhara",
    height: 11,
    measure: "Ground level to the top of the roof. Ground plan a 28 ft (8.5 m) square.",
    source: "Wikipedia, “Dharmaraja Ratha” — 35 feet (11 m) from ground level to the top of the roof",
    sourceUrl: "https://en.wikipedia.org/wiki/Dharmaraja_Ratha",
    accessed: "2026-09-04",
  },
  {
    osm: "way/576022690",
    label: "Bhima Ratha",
    form: "monolith",
    tiers: 2,
    roof: "barrel",
    tiersSource: "Wikipedia, “Bhima Ratha” — “rising to a height of 25 feet (7.6 m) over two floors”; barrel-vaulted wagon roof",
    height: 7.6,
    measure: "Overall height over two floors. Base plan 42 × 24 ft (12.8 × 7.3 m).",
    source: "Wikipedia, “Bhima Ratha” — “rising to a height of 25 feet (7.6 m) over two floors”",
    sourceUrl: "https://en.wikipedia.org/wiki/Bhima_Ratha",
    accessed: "2026-09-04",
  },
  {
    osm: "way/576022684",
    label: "Arjuna Ratha",
    form: "monolith",
    tiers: 2,
    roof: "pyramidal",
    tiersSource: "Wikipedia, “Arjuna Ratha” — “It has two levels and has one shrine”; octagonal shikhara",
    height: 6.1,
    measure: "Overall height. Base plan 11.5 × 16 ft (3.5 × 4.9 m).",
    source: "Wikipedia, “Arjuna Ratha” — “measures 11.5 by 16 feet … and is 20 feet (6.1 m) in height”",
    sourceUrl: "https://en.wikipedia.org/wiki/Arjuna_Ratha",
    accessed: "2026-09-04",
  },
  {
    osm: "way/576022681",
    label: "Draupadi Ratha",
    form: "monolith",
    tiers: 1,
    roof: "hut",
    tiersSource: "Wikipedia, “Draupadi Ratha” — single-tiered, “in the shape of a bangla (a hut in Bengal)”; curvilinear roof ending in a 2.5 ft (0.76 m) square at the top",
    height: 5.5,
    measure: "Overall height. The smallest of the five, a hut-form roof, so the figure is unambiguous.",
    source: "Wikipedia, “Draupadi Ratha” — smallest of the five rathas, height 5.5 m",
    sourceUrl: "https://en.wikipedia.org/wiki/Draupadi_Ratha",
    accessed: "2026-09-04",
  },
  {
    osm: "way/753671961",
    label: "Krishna's Butterball",
    form: "boulder",
    tiers: 1,
    roof: "boulder",
    tiersSource: "A natural boulder — no storeys. Rendered as a single rounded mass.",
    height: 6,
    measure:
      "The boulder itself, excluding the ~1.2 m natural plinth it rests on. A flat-topped block is a poor likeness of a round boulder — see the massing caveat in the README.",
    source: "Wikipedia, “Krishna's Butterball” — approximately six metres (20 ft) high and five metres (16 ft) wide",
    sourceUrl: "https://en.wikipedia.org/wiki/Krishna%27s_Butterball",
    accessed: "2026-09-04",
  },

  /* ---- Not extruded. Each records why. ---- */
  {
    osm: "way/370135158",
    label: "Shore Temple",
    form: "structural",
    // These stay because they are correct facts about the monument. The
    // blocker is the outline, not the citation.
    tiers: 5,
    roof: "pyramidal",
    tiersSource: "Wikipedia, “Shore Temple” — “the total height of the five-storey structure including that of its vimana”",
    citedHeight: 18,
    source: "Wikipedia, “Shore Temple” — 60 feet (18 m) high on a 50 feet (15 m) square platform",
    sourceUrl: "https://en.wikipedia.org/wiki/Shore_Temple",
    height: null,
    note:
      "MEASURED: the OSM way is 46.4 × 21.5 m — 933 m². The cited platform is a ~15 m " +
      "square, 225 m². The outline is 4.1× that, so it is the walled prakara enclosing " +
      "BOTH shrines and the courtyard between them, not the vimana. The cited 18 m is " +
      "the tall Kshatriyasimhesvara tower; applying it to the whole compound would put " +
      "a 46 × 21 × 18 m slab on the shoreline, and tiering it makes a stepped sea wall. " +
      "Same rule as the Pidari & Valayankuttai rathas: one outline with one height " +
      "would be a lie about all of it. Unblocks upstream — the moment OSM carries a " +
      "separate way for the vimana, or building:part polygons (the standard OSM 3D " +
      "tagging for exactly this case), it qualifies with no code change. The Shore " +
      "Temple keeps its pin, its detail card and its map link either way.",
  },
  {
    osm: "way/576022679",
    label: "Nakula Sahadeva Ratha",
    form: "monolith",
    // The dimensions gap is CLOSED (2026-09-07). It was never a Wikipedia
    // problem — the figure is in the oldest survey of the site, and every
    // modern "18 x 11 x 16 feet" page is repeating this sentence unattributed.
    citedHeight: 4.88,
    plan: "5.49 m N-S x 3.35 m across (18 x 11 ft)",
    measure:
      "Overall external height of the monolith, as surveyed in the field — not above a plinth, and there is no finial to include (Fergusson notes the roof is unfinished). Plan is the external footprint. The apsidal rear cell inside is separately given as 3 ft deep x 4 ft 6 in wide.",
    source:
      "Fergusson, James & Burgess, James, The Cave Temples of India (London: W.H. Allen & Co., 1880), p. 135 — “Its dimensions are 18 feet in length north and south, by 11 feet across, and the height is about 16 feet.”",
    sourceUrl:
      "https://archive.org/details/cavetemplesofind00ferguoft",
    accessed: "2026-09-07",
    height: null,
    note:
      "HAS A CITED HEIGHT, STILL NOT EXTRUDED — and the blocker is now rule (c), " +
      "not rule (b). MEASURED against OSM (api.openstreetmap.org/api/0.6/way/576022679, " +
      "2026-09-07): the way is FIVE nodes — a hand-drawn quad — with a 7.70 m E-W by " +
      "8.00 m N-S bbox and 29.4 m² area. That is 1.60x the cited 18.4 m² plan, which is " +
      "in family with the generosity every other outline here shows (Bhima 1.56x, " +
      "Dharmaraja 1.54x). The SHAPE is the problem: the outline is square (aspect 1.04) " +
      "while the cited plan is an elongated 1.64. Bhima's outline matches its plan's " +
      "aspect to 1.76 vs 1.75 and Dharmaraja's to 1.05 vs 1.00 — this one does not. " +
      "Extruding it would stand a 7.7 x 8.0 m square where the monument is a narrow " +
      "apsidal gajaprishtha hall, so the silhouette would be wrong in plan even with a " +
      "correct height. Unblocks the moment the way is redrawn to the monument's real " +
      "outline upstream; then delete this note and move the figure into `height`. " +
      "Two further facts recorded rather than used: Fergusson (p. 113) places this " +
      "ratha 'a little to the westward of the other four, and quite detached' — it is " +
      "NOT in the north-south row, and OSM centroids put it 7.1 m west, confirming him. " +
      "And Fergusson (p. 135) says its front faces NORTH while Longhurst (Pallava " +
      "Architecture Part II, 1928, p. 21) says SOUTH; that conflict is unresolved, so " +
      "no orientation claim should be made from either.",
  },
  {
    osm: "way/597062775",
    label: "Old lighthouse",
    form: "structural",
    height: null,
    note:
      "Published lighthouse figures are usually focal-plane height above mean sea level, not structure height — and this hill is ~25 m, so using one would make the tower roughly twice its real size. Needs a structure-height figure specifically.",
  },
  {
    osm: "way/596118069",
    label: "Krishna Mandapam",
    form: "rock-cut",
    height: null,
    note:
      "Rock-cut: the mandapa is excavated INTO the cliff face. Extruding its outline upward would draw a building where the rock is actually hollowed inward — wrong in the most misleading direction.",
  },
  {
    osm: "way/123059911",
    label: "Tiger Cave, Saluvankuppam",
    form: "rock-cut",
    height: null,
    note: "Rock-cut, same as Krishna Mandapam. Also 5.4 km north, outside the walkable core.",
  },
  {
    osm: "way/596622866",
    label: "Pidari & Valayankuttai rathas",
    form: "monolith",
    height: null,
    note:
      "One OSM way covers TWO separate monoliths. One outline with one height would be a lie about both. Excluded unless the way is split upstream.",
  },
  {
    osm: "way/103082949",
    label: "Pancha Rathas (enclosure)",
    form: "enclosure",
    height: null,
    note:
      "This is the ~90 m fenced compound containing all five rathas, not a monument. content/mahabalipuram-monuments.js uses it as the pancha-rathas COORDINATE reference, which is right for a pin and would be catastrophic as an extrusion — one big box over the whole group. The five rathas are extruded individually instead.",
  },
  {
    osm: "way/390473765",
    label: "Shore Temple Complex (enclosure)",
    form: "enclosure",
    height: null,
    note: "Enclosure boundary duplicating way/370135158, which is the temple itself.",
  },
  {
    osm: "way/103163461",
    label: "Group of Monuments (site boundary)",
    form: "enclosure",
    height: null,
    note: "The whole-site ASI boundary. Already drawn as the park outline.",
  },
  {
    osm: "node/5685948849",
    label: "Olakkanneshwara Temple",
    form: "structural",
    height: null,
    note:
      "An OSM node — there is no polygon upstream at all, so there is nothing to extrude regardless of height. The terrain shows the granite ridge it stands on instead.",
  },
];
