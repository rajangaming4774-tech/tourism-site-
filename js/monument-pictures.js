/* The monument pictures: small top-down drawings of each KIND of monument,
 * shared by the destination page's site plan (js/site-plan.js) and the
 * on-site guide's map pins (js/guide-map.js), so the two pages draw the same
 * thing for the same monument.
 *
 * These are type pictures, not portraits: the same drawing for every cave
 * temple, every stepped-roof ratha, and so on — 24 × 24, ink on paper, not to
 * scale, not turned to the real building. Which picture a monument gets comes
 * from its content entry (content/mahabalipuram-monuments.js): an explicit
 * `picture` where its `form` cannot say, else its documented `roof`, else
 * its `form`. Every `roof` and `picture` in the content file carries a
 * source comment; anything without one falls back to a plain dot.
 *
 * Classic script (window.MonumentPictures): neither page loads ES modules,
 * and the CSP allows no inline script.
 */
window.MonumentPictures = (function () {
  const PICTURE = {
    pyramid: '<rect x="3" y="3" width="18" height="18"/><rect x="6.5" y="6.5" width="11" height="11"/><rect x="9.5" y="9.5" width="5" height="5"/><circle cx="12" cy="12" r="1.1" class="p-fill"/>',
    vault: '<rect x="3" y="6" width="18" height="12"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M6 6v12M18 6v12" class="p-thin"/>',
    hut: '<rect x="4" y="4" width="16" height="16"/><path d="M4 4 20 20M20 4 4 20" class="p-thin"/><circle cx="12" cy="12" r="1.3" class="p-fill"/>',
    apsidal: '<path d="M4 4h10a8 8 0 0 1 0 16H4z"/><line x1="4" y1="12" x2="15" y2="12"/>',
    compound: '<rect x="2" y="6.5" width="20" height="11"/><rect x="13" y="8.5" width="7" height="7"/><rect x="15" y="10.5" width="3" height="3" class="p-fill"/><rect x="4.5" y="9.5" width="5" height="5"/><rect x="6" y="11" width="2" height="2" class="p-fill"/>',
    cave: '<path d="M3 3h18v13H3z" class="p-rock"/><path d="M6.5 9h11v7h-11z" class="p-in"/><path d="M3 16h18"/><circle cx="7" cy="18.5" r="1.2" class="p-fill"/><circle cx="10.3" cy="18.5" r="1.2" class="p-fill"/><circle cx="13.7" cy="18.5" r="1.2" class="p-fill"/><circle cx="17" cy="18.5" r="1.2" class="p-fill"/>',
    relief: '<rect x="3" y="5" width="18" height="14" class="p-rock"/><path d="M6 9c2-2 4 2 6 0s4-2 6 0M6 13c2-2 4 2 6 0s4-2 6 0M6 17c2-2 4 2 6 0s4-2 6 0" class="p-thin"/>',
    boulder: '<circle cx="12" cy="11" r="8" class="p-rock"/><path d="M8.5 20.5h7"/>',
    tower: '<rect x="4" y="4" width="16" height="16"/><rect x="8" y="8" width="8" height="8"/><circle cx="12" cy="12" r="1.2" class="p-fill"/>',
    gopuram: '<rect x="3" y="6" width="6" height="12"/><rect x="15" y="6" width="6" height="12"/><path d="M9 12h6" class="p-dash"/>',
    monolith: '<rect x="4" y="4" width="16" height="16"/><circle cx="12" cy="12" r="1.3" class="p-fill"/>',
    group: '<rect x="3" y="13" width="6" height="7"/><rect x="10" y="9" width="6" height="7"/><rect x="17" y="4.5" width="4" height="6"/>',
    dot: '<circle cx="12" cy="12" r="3" class="p-fill"/>',
  };
  const LABEL = {
    pyramid: "Stepped pyramid roof — a ratha",
    vault: "Wagon-vault roof",
    hut: "Hut roof",
    apsidal: "Round-ended (apsidal) ratha",
    compound: "Walled compound with two towers — the Shore Temple",
    cave: "Cave temple, cut into the rock",
    relief: "Carved rock face",
    boulder: "Natural boulder",
    tower: "Built stone temple",
    gopuram: "Gateway, unfinished",
    monolith: "Monolith, roof not documented",
    group: "A group of monoliths — its enclosure is drawn",
  };
  const ROOF_PIC = { pyramidal: "pyramid", barrel: "vault", hut: "hut", apsidal: "apsidal", boulder: "boulder" };
  const FORM_PIC = { monolith: "monolith", structural: "tower", cave: "cave", relief: "relief", boulder: "boulder", group: "group" };

  const pictureOf = (m) => (m && (m.picture || ROOF_PIC[m.roof] || FORM_PIC[m.form])) || "dot";
  const svg = (name, cls = "spl-pic") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PICTURE[name] || PICTURE.dot}</svg>`;

  return { PICTURE, LABEL, ROOF_PIC, FORM_PIC, pictureOf, svg };
})();
