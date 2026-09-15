/* Combined Mahabalipuram tour — one stitched master video, chapters grouped
 * by monument. Used when TOUR_MODE === 'combined' in js/tours-mount.js.
 *
 * CLIP_OFFSETS is printed by `bash scripts/stitch-video.sh --trim-corner`
 * — paste the block it prints straight in here after any re-stitch. Each
 * number is the point in the master where that clip is FULLY visible (i.e.
 * where its transition ends), so chapter times below are written relative
 * to their own clip and offset by it.
 */
(function () {
  // ---- paste from scripts/stitch-video.sh ----
  const CLIP_OFFSETS = {
    shoreExterior: 0,
    shoreInterior: 10.005,
    // arjuna: <offset>,   // no source clip supplied yet — see below
    rathas: 19.61,
  };
  const MASTER_DURATION = 29.0; // also printed by the stitch script
  // --------------------------------------------

  const at = (offset, t) => +(offset + t).toFixed(3);

  window.MAHABALIPURAM_TOUR = {
    sectionId: "tour-mahabalipuram",
    breadcrumb: "Mahabalipuram",
    videoBase: "assets/video/mahabalipuram-master",
    poster: "assets/video/mahabalipuram-master-poster",
    estimatedDuration: MASTER_DURATION,
    vhPerEightSeconds: 150,

    groups: [
      {
        monument: "shore",
        number: "01",
        heading: "Shore Temple",
        subheading: "Scroll to move through the temple",
        chapters: [
          // exterior clip
          { start: at(CLIP_OFFSETS.shoreExterior, 0), end: at(CLIP_OFFSETS.shoreExterior, 3.3), title: "Nandi Wall", body: "Guardian bulls ring the base, facing out to sea." },
          { start: at(CLIP_OFFSETS.shoreExterior, 3.3), end: at(CLIP_OFFSETS.shoreExterior, 6.6), title: "The Vimana", body: "Tiered storeys rise, each one a miniature shrine." },
          { start: at(CLIP_OFFSETS.shoreExterior, 6.6), end: at(CLIP_OFFSETS.shoreInterior, 0), title: "Dressed Stone", body: "Granite blocks, not carved rock — a decisive break." },
          // interior clip
          { start: at(CLIP_OFFSETS.shoreInterior, 0), end: at(CLIP_OFFSETS.shoreInterior, 3.4), title: "The Threshold", body: "Dvarapala guardians flank the sanctum entrance." },
          { start: at(CLIP_OFFSETS.shoreInterior, 3.4), end: at(CLIP_OFFSETS.shoreInterior, 6.6), title: "The Lingam", body: "Black granite before a carved Somaskanda panel." },
          { start: at(CLIP_OFFSETS.shoreInterior, 6.6), end: CLIP_OFFSETS.rathas, title: "The Apex", body: "Corbelled stone climbing to the tower's sealed crown." },
        ],
      },

      /* Arjuna's Penance — written and ready, but no source clip has been
       * supplied. To add it: drop assets/video/arjuna.mp4 in, re-run
       *   bash scripts/stitch-video.sh --trim-corner --encode
       * paste the new CLIP_OFFSETS above (every later offset shifts), then
       * uncomment this group.
       *
      {
        monument: "arjuna",
        number: "02",
        heading: "Arjuna's Penance",
        subheading: "The Descent of the Ganges",
        chapters: [
          { start: at(CLIP_OFFSETS.arjuna, 0), end: at(CLIP_OFFSETS.arjuna, 1.5), title: "A Cliff, A Story", body: "A 27 m × 9 m open-air relief carved in the 7th century — one of the largest bas-reliefs in the world." },
          { start: at(CLIP_OFFSETS.arjuna, 1.5), end: at(CLIP_OFFSETS.arjuna, 3), title: "The River's Descent", body: "The central cleft is the Ganges falling from heaven; carved nagas rise within it, and water once ran down it at festivals." },
          { start: at(CLIP_OFFSETS.arjuna, 3), end: at(CLIP_OFFSETS.arjuna, 4.5), title: "The Ascetic", body: "An emaciated figure stands on one leg — read as Arjuna seeking Shiva's weapon, or Bhagiratha praying for the Ganges." },
          { start: at(CLIP_OFFSETS.arjuna, 4.5), end: at(CLIP_OFFSETS.arjuna, 6), title: "The Elephant Family", body: "A life-size herd with calves, among the finest animal sculpture in Indian art." },
          { start: at(CLIP_OFFSETS.arjuna, 6), end: CLIP_OFFSETS.rathas, title: "The Cat & The Mice", body: "A cat mimics the ascetic's pose while mice gather round it — a joke about false holiness." },
        ],
      },
      */

      {
        monument: "rathas",
        // 02 while Arjuna is missing; it becomes 03 once that group is added.
        number: "02",
        heading: "Pancha Rathas",
        subheading: "Five temples, five boulders",
        chapters: [
          { start: at(CLIP_OFFSETS.rathas, 0), end: at(CLIP_OFFSETS.rathas, 1.5), title: "Carved, Not Built", body: "Five monolithic temples, each cut from a single granite boulder in the 7th century, never consecrated and never finished." },
          { start: at(CLIP_OFFSETS.rathas, 1.5), end: at(CLIP_OFFSETS.rathas, 3), title: "Dharmaraja Ratha", body: "The tallest, a three-tiered pyramidal vimana with guardian figures in its niches and a domed capstone." },
          { start: at(CLIP_OFFSETS.rathas, 3), end: at(CLIP_OFFSETS.rathas, 4.5), title: "Bhima Ratha", body: "A long barrel-vaulted roof echoing a thatched hall — the prototype of the gopuram form." },
          { start: at(CLIP_OFFSETS.rathas, 4.5), end: at(CLIP_OFFSETS.rathas, 6), title: "Arjuna & Draupadi", body: "A miniature shrine and a hut-shaped one, showing the range of forms the Pallavas were testing in stone." },
          { start: at(CLIP_OFFSETS.rathas, 6), end: MASTER_DURATION, title: "Elephant & Nandi", body: "Monolithic animals stand among the shrines — a sculptor's laboratory for every later Dravidian temple." },
        ],
      },
    ],
  };
})();
