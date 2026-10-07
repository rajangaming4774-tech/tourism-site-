/* "What you will see here": a simple labelled sketch of each main monument,
 * for the guide's monument card (js/guide-map.js, showStop).
 *
 * WHAT THESE ARE. Hand-drawn sketches, 320 × 200, ink on paper, that show what
 * is where in plain shapes — a tower is nested squares, a carved panel is a
 * thick bar on a wall, a bull is a small lozenge. They are NOT to scale and
 * NOT a survey, and the card says so under every one. Their only job is to
 * let a visitor match a number to a thing.
 *
 * WHAT THEY MAY SHOW. Only parts the monument's own entry in
 * content/mahabalipuram-monuments.js lists under `inside.parts` — each of
 * which comes from that entry's cited source or a research note in
 * data/research/3d/. A part is PLACED on the sketch only where a source says
 * where it is (which wall, which side); a part whose position no source
 * states goes in `also` and is shown as a number under the sketch, captioned
 * as not placed. Example: Wikipedia's text and the photographs disagree about
 * which side of the cleft the ascetic stands on at the great relief, so he is
 * listed, not placed.
 *
 * SHAPE OF AN ENTRY
 *   view   "From above" | "From the front" — printed on the sketch
 *   svg    markup; every shape of part n carries data-part="n"
 *   pins   { n: [x%, y%] } where the number button sits over the sketch
 *   also   [n, …] parts listed but deliberately not placed
 *
 * Classes: d-sea d-water d-ground d-rock d-cut (a hall cut into rock) d-wall
 * d-ink (line only) d-thin d-fill d-note (small text). Styled in css/guide.css.
 * Classic script — the guide loads no ES modules and the CSP allows no inline
 * script.
 */
window.MonumentDiagrams = (function () {
  // A row of small bulls (lozenges) from x0 to x1 at height y.
  const bulls = (x0, x1, y, n) =>
    Array.from({ length: n }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / (n - 1);
      return `<rect x="${(x - 4).toFixed(1)}" y="${y - 2.5}" width="8" height="5" rx="2.5" data-part="4" class="d-fill-soft"/>`;
    }).join("");
  // Nested squares: a stepped tower seen from above.
  const tower = (cx, cy, sizes, part) =>
    sizes.map((s) => `<rect x="${cx - s / 2}" y="${cy - s / 2}" width="${s}" height="${s}" data-part="${part}" class="d-wall"/>`).join("") +
    `<circle cx="${cx}" cy="${cy}" r="2" class="d-fill"/>`;
  // Pillars across an open front.
  const pillars = (x0, x1, y, n, part) =>
    Array.from({ length: n }, (_, i) => `<circle cx="${(x0 + ((x1 - x0) * i) / (n - 1)).toFixed(1)}" cy="${y}" r="4"${part ? ` data-part="${part}"` : ""} class="d-wall"/>`).join("");

  const D = {
    /* East is to the right. Arrangement per data/research/3d/06-shore-temple-
     * rebuild.md: the tall east-facing tower, the smaller west-facing one,
     * the Vishnu shrine between, bulls along the compound wall, the stepped
     * tank outside the west wall. */
    "shore-temple": {
      view: "From above · east and the sea to the right",
      svg:
        `<rect x="268" y="0" width="52" height="200" class="d-sea"/><text x="294" y="104" class="d-note" text-anchor="middle">sea</text>` +
        `<rect x="78" y="46" width="176" height="108" data-part="4" class="d-court"/>` +
        bulls(86, 246, 46, 11) + bulls(86, 246, 154, 11) +
        tower(200, 100, [62, 42, 22], 1) +
        tower(112, 100, [40, 26, 12], 2) +
        `<rect x="138" y="86" width="28" height="28" data-part="3" class="d-wall"/><path d="M143 100h18" data-part="3" class="d-ink"/>` +
        `<rect x="14" y="78" width="44" height="34" data-part="5" class="d-water"/><rect x="20" y="84" width="32" height="22" data-part="5" class="d-water d-thin"/><rect x="31" y="90" width="10" height="10" data-part="5" class="d-wall"/>`,
      pins: { 1: [72, 30], 2: [28, 35], 3: [47.5, 66], 4: [53, 84], 5: [11, 66] },
      also: [6, 7, 8, 9],
    },

    /* North is up. The row runs north-east to south-west with the twins'
     * ratha to the west of it (OSM footprints; 03-rathas-resolved.md).
     * The animals: a lion west of the Arjuna–Draupadi platform, a bull on its
     * east, the elephant to the south-west (Wikipedia § Rathas). */
    "pancha-rathas": {
      view: "From above · north is up",
      svg:
        `<path d="M40 190 120 20h150l-80 170z" class="d-ground"/>` +
        `<g transform="rotate(35 160 100)">` +
        `<rect x="150" y="8" width="26" height="26" data-part="1" class="d-wall"/><path d="M150 8l26 26M176 8l-26 26" data-part="1" class="d-ink d-thin"/>` +
        `<rect x="148" y="40" width="30" height="30" data-part="2" class="d-wall"/><rect x="155" y="47" width="16" height="16" data-part="2" class="d-wall"/>` +
        `<rect x="138" y="80" width="50" height="34" data-part="3" class="d-wall"/><path d="M138 97h50" data-part="3" class="d-ink"/>` +
        `<rect x="138" y="128" width="50" height="50" data-part="4" class="d-wall"/><rect x="148" y="138" width="30" height="30" data-part="4" class="d-wall"/><rect x="156" y="146" width="14" height="14" data-part="4" class="d-wall"/>` +
        `<path d="M92 44h20a11 11 0 0 1 0 22H92z" data-part="5" class="d-wall"/><path d="M92 55h22" data-part="5" class="d-ink"/>` +
        `<ellipse cx="98" cy="84" rx="12" ry="7" data-part="8" class="d-fill-soft"/>` +
        `<ellipse cx="126" cy="40" rx="7" ry="5" data-part="6" class="d-fill-soft"/><ellipse cx="202" cy="42" rx="7" ry="5" data-part="7" class="d-fill-soft"/>` +
        `</g>`,
      pins: { 1: [76, 15], 2: [71, 29], 3: [67, 52], 4: [58, 76], 5: [31, 13], 6: [49, 8], 7: [82, 44], 8: [27, 36] },
      also: [],
    },

    /* The rock face, from the front. Placed: the cleft in the middle with its
     * nagas, the elephants in the lower part, the flying figures in the upper
     * part, the tank that once fed the cleft from the top (Wikipedia, "Descent
     * of the Ganges (Mahabalipuram)"). NOT placed: the ascetic, Shiva and the
     * cat — the article's text and the photographs disagree about the side. */
    "descent-of-the-ganges": {
      view: "From the front · about 29 m wide, 13 m high",
      svg:
        `<path d="M8 176C10 96 40 40 110 30c40-6 100-6 140 2 52 10 62 70 62 144z" class="d-rock"/>` +
        `<rect x="140" y="4" width="40" height="16" data-part="1" class="d-water"/>` +
        `<path d="M156 20c-4 30 8 50 2 80s-6 50 0 76h10c-6-26-4-48 2-76s-8-50-2-80z" data-part="1" class="d-cleft"/>` +
        `<path d="M160 60c4 8-4 14 0 22s-4 14 0 22" data-part="1" class="d-ink"/>` +
        `<path d="M186 172v-30c0-16 12-26 30-26s32 10 32 26v30h-10v-20h-34v20z" data-part="2" class="d-fill-soft"/><path d="M186 146c-8 2-10 12-8 24" data-part="2" class="d-ink"/>` +
        `<path d="M254 172v-20c0-10 8-16 18-16s18 6 18 16v20h-7v-12h-22v12z" data-part="2" class="d-fill-soft"/>` +
        `<path d="M30 70c8-6 16-6 24 0M66 56c8-6 16-6 24 0M100 66c8-6 16-6 24 0M196 60c8-6 16-6 24 0M232 70c8-6 16-6 24 0M264 88c8-6 16-6 24 0" data-part="6" class="d-ink"/>`,
      pins: { 1: [50, 50], 2: [73, 72], 6: [26, 24] },
      also: [3, 4, 5],
    },

    /* A hall cut into the rock, open front at the bottom. Walls per Wikipedia
     * § Varaha: Varaha on the north wall, Trivikrama on the south, Gajalakshmi
     * and Durga in the rear wall either side of the shrine. North is left. */
    "varaha-cave": {
      view: "From above · the open front is at the bottom",
      svg:
        `<rect x="10" y="6" width="300" height="164" class="d-rock"/>` +
        `<path d="M50 170V50h220v120z" class="d-cut"/>` +
        `<rect x="138" y="22" width="44" height="30" class="d-cut"/><path d="M138 52h44" class="d-ink d-thin"/>` +
        pillars(90, 230, 160, 4, 1) +
        `<rect x="44" y="70" width="10" height="70" data-part="2" class="d-panel"/>` +
        `<rect x="76" y="44" width="50" height="10" data-part="3" class="d-panel"/>` +
        `<rect x="194" y="44" width="50" height="10" data-part="4" class="d-panel"/>` +
        `<rect x="266" y="70" width="10" height="70" data-part="5" class="d-panel"/>` +
        `<text x="160" y="40" class="d-note" text-anchor="middle">shrine</text><text x="160" y="192" class="d-note" text-anchor="middle">you walk in here</text>`,
      pins: { 1: [50, 80], 2: [15, 52], 3: [31.5, 24.5], 4: [68.5, 24.5], 5: [85, 52] },
      also: [],
    },

    /* Per Wikipedia § Mahishasuramardini: Durga's battle on the north wall,
     * Vishnu asleep on the south wall facing it, three shrine cells at the
     * back, the middle one with the Somaskanda panel. North is left. */
    "mahishasuramardini-mandapa": {
      view: "From above · the open front is at the bottom",
      svg:
        `<rect x="10" y="6" width="300" height="164" class="d-rock"/>` +
        `<path d="M46 170V58h228v112z" class="d-cut"/>` +
        `<rect x="70" y="26" width="50" height="34" data-part="3" class="d-cut"/><rect x="135" y="20" width="50" height="40" data-part="3" class="d-cut"/><rect x="200" y="26" width="50" height="34" data-part="3" class="d-cut"/>` +
        `<rect x="143" y="22" width="34" height="8" data-part="4" class="d-panel"/>` +
        pillars(86, 234, 160, 4, 0) +
        `<rect x="40" y="76" width="10" height="72" data-part="1" class="d-panel"/>` +
        `<rect x="270" y="76" width="10" height="72" data-part="2" class="d-panel"/>` +
        `<text x="160" y="192" class="d-note" text-anchor="middle">you walk in here</text>`,
      pins: { 1: [14, 56], 2: [86, 56], 3: [30, 20], 4: [50, 8] },
      also: [],
    },

    /* From the side: about 6 m high and 5 m wide, on a sloping rock about
     * 1.2 m high; part of the top back has broken away (Wikipedia,
     * "Krishna's Butterball"). */
    "krishnas-butterball": {
      view: "From the side",
      svg:
        `<path d="M0 200V150L320 96v104z" class="d-rock"/>` +
        `<path d="M150 132a62 62 0 1 1 78-14z" data-part="1" class="d-boulder"/>` +
        `<path d="M196 18c22 6 40 24 46 48l-30-8z" data-part="3" class="d-panel-soft"/>` +
        `<path d="M150 132l78-14" data-part="2" class="d-contact"/>` +
        `<path d="M60 146v-28m-5 8 5-8 5 8" class="d-ink d-thin"/><circle cx="60" cy="112" r="4" class="d-ink d-thin"/><text x="72" y="134" class="d-note">a person, for size</text>`,
      pins: { 1: [53, 38], 2: [59, 66], 3: [72, 14] },
      also: [],
    },

    /* From the side: the shrine on top of the boulder, facing east, with the
     * Mahishasuramardini cave cut into the rock directly below it
     * (Wikipedia, "Olakkannesvara Temple"). */
    "olakkanneshwara": {
      view: "From the side",
      svg:
        `<path d="M0 200v-40c40-10 60-70 110-84h110c40 12 60 60 100 90v34z" class="d-rock"/>` +
        `<rect x="130" y="34" width="70" height="42" data-part="1" class="d-wall"/><path d="M126 34h78" data-part="1" class="d-ink"/><rect x="186" y="50" width="14" height="26" data-part="1" class="d-cut"/>` +
        `<path d="M232 84l12 8v8l12 8v8l12 8v8l12 8" data-part="2" class="d-ink"/>` +
        `<rect x="140" y="120" width="60" height="30" data-part="4" class="d-cut"/><path d="M152 150v-30M164 150v-30M176 150v-30M188 150v-30" data-part="4" class="d-ink d-thin"/>` +
        `<path d="M206 40c30-16 60-16 96-6M206 52c34-10 62-8 96 4" data-part="3" class="d-ink d-thin"/><text x="300" y="24" class="d-note" text-anchor="end">the coast and the site</text>`,
      pins: { 1: [51.5, 27], 2: [81, 56], 3: [78, 14], 4: [53, 68] },
      also: [],
    },

    /* From the front: the opening ringed by carved heads, the shallow stage
     * inside it, the open ground in front (this entry's cited text). The
     * brick Murugan shrine was found nearby — listed, not placed. */
    "tiger-cave": {
      view: "From the front",
      svg:
        `<path d="M30 170C30 70 80 16 160 16s130 54 130 154z" class="d-rock"/>` +
        `<rect x="0" y="170" width="320" height="30" data-part="3" class="d-ground"/>` +
        `<path d="M118 170v-60a42 42 0 0 1 84 0v60z" data-part="2" class="d-cut"/><path d="M118 150h84" data-part="2" class="d-ink d-thin"/>` +
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => {
          const a = Math.PI * (1 - i / 10);
          const x = 160 + Math.cos(a) * 66, y = 112 - Math.sin(a) * 66;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" data-part="1" class="d-wall"/><circle cx="${(x - 3).toFixed(1)}" cy="${(y - 2).toFixed(1)}" r="1.3" class="d-fill"/><circle cx="${(x + 3).toFixed(1)}" cy="${(y - 2).toFixed(1)}" r="1.3" class="d-fill"/>`;
        }).join(""),
      pins: { 1: [50, 14], 2: [50, 68], 3: [20, 92] },
      also: [4, 5],
    },
  };

  return { get: (id) => D[id] || null, ids: () => Object.keys(D) };
})();
