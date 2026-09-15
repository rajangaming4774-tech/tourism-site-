/* Content for each scroll-tour section — mahabalipuram.html.
 * Kept separate from js/scroll-tour.js (the generic engine) and from the
 * page markup on purpose: adding a fourth monument is "encode its video,
 * add an entry here, add one ScrollTour.create() call" — see README.md.
 */
window.MONUMENTS_CONTENT = {
  shoreTemple: {
    sectionId: "tour-shore-temple",
    number: "01",
    heading: "Shore Temple",
    subheading: "Scroll to move through the temple",
    videoBase: "assets/video/temple",
    poster: "assets/video/temple-poster",
    chapters: [
      { start: 0, end: 3.3, title: "Nandi Wall", body: "Guardian bulls ring the base, facing out to sea." },
      { start: 3.3, end: 6.6, title: "The Vimana", body: "Tiered storeys rise, each one a miniature shrine." },
      { start: 6.6, end: 10, title: "Dressed Stone", body: "Granite blocks, not carved rock — a decisive break." },
      { start: 10, end: 13.4, title: "The Threshold", body: "Dvarapala guardians flank the sanctum entrance." },
      { start: 13.4, end: 16.6, title: "The Lingam", body: "Black granite before a carved Somaskanda panel." },
      { start: 16.6, end: 20.2, title: "The Apex", body: "Corbelled stone climbing to the tower's sealed crown." },
    ],
  },

  panchaRathas: {
    sectionId: "tour-pancha-rathas",
    number: "02",
    heading: "Pancha Rathas",
    subheading: "Five temples, five boulders",
    videoBase: "assets/video/rathas",
    poster: "assets/video/rathas-poster",
    chapters: [
      { start: 0, end: 1.5, title: "Carved, Not Built", body: "Five monolithic temples, each cut from a single granite boulder in the 7th century, never consecrated and never finished." },
      { start: 1.5, end: 3, title: "Dharmaraja Ratha", body: "The tallest, a three-tiered pyramidal vimana with guardian figures in its niches and a domed capstone." },
      { start: 3, end: 4.5, title: "Bhima Ratha", body: "A long barrel-vaulted roof echoing a thatched hall — the prototype of the gopuram form." },
      { start: 4.5, end: 6, title: "Arjuna & Draupadi", body: "A miniature shrine and a hut-shaped one, showing the range of forms the Pallavas were testing in stone." },
      { start: 6, end: 10, title: "Elephant & Nandi", body: "Monolithic animals stand among the shrines — a sculptor's laboratory for every later Dravidian temple." },
    ],
  },

  /* Arjuna's Penance is written and ready to go, but there is no source
   * video for it yet (public/video/arjuna-4k-source.mp4 was never
   * supplied) — do not mount it until one exists. Once it does:
   *   1. bash scripts/encode-video.sh assets/video/arjuna-source.mp4 --trim-corner=15
   *   2. uncomment this entry
   *   3. add one ScrollTour.create() call in mahabalipuram.html (see README)
   *
  arjunasPenance: {
    sectionId: "tour-arjunas-penance",
    number: "02",
    heading: "Arjuna's Penance",
    subheading: "The Descent of the Ganges",
    videoBase: "assets/video/arjuna",
    poster: "assets/video/arjuna-poster",
    chapters: [
      { start: 0, end: 1.5, title: "A Cliff, A Story", body: "A 27 m × 9 m open-air relief carved in the 7th century — one of the largest bas-reliefs in the world." },
      { start: 1.5, end: 3, title: "The River's Descent", body: "The central cleft represents the Ganges falling from heaven; carved nagas rise within it, and water once flowed down it during festivals." },
      { start: 3, end: 4.5, title: "The Ascetic", body: "An emaciated figure stands on one leg in penance — read as Arjuna seeking Shiva's weapon, or Bhagiratha praying for the Ganges." },
      { start: 4.5, end: 6, title: "The Elephant Family", body: "A life-size elephant herd with calves, considered among the finest animal sculptures in Indian art." },
      { start: 6, end: 10, title: "The Cat & The Mice", body: "A cat mimics the ascetic's pose while mice gather around it — a satirical detail about false holiness." },
    ],
  },
  */
};
