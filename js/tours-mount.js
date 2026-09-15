/* Mounts the scroll tour(s).
 *
 * TOUR_MODE picks between two layouts over the same engine:
 *   'combined' — one stitched master video (scripts/stitch-video.sh), one
 *                scroll track, chapters grouped by monument, heading and
 *                number swapping during each dip-to-black.
 *                Content: content/mahabalipuram-tour.js
 *   'sections' — the original one-section-per-monument layout, each with
 *                its own video ladder and a numbered band between them.
 *                Content: js/monuments-content.js
 *
 * Both paths are kept working so they can be compared side by side; flip
 * the constant and reload. See README.md.
 */
(function () {
  const TOUR_MODE = "combined"; // 'combined' | 'sections'

  const root = document.getElementById("tours-root");
  if (!root || !window.ScrollTour) return;

  if (TOUR_MODE === "combined") {
    if (!window.MAHABALIPURAM_TOUR) return;
    window.ScrollTour.createCombined({ ...window.MAHABALIPURAM_TOUR, mountTo: root });
    return;
  }

  const M = window.MONUMENTS_CONTENT;
  if (!M) return;
  const ORDER = [M.shoreTemple, M.panchaRathas].filter(Boolean);
  ORDER.forEach((config, i) => {
    if (i > 0) root.insertAdjacentHTML("beforeend", window.ScrollTour.renderDivider(config.number));
    window.ScrollTour.create({ ...config, mountTo: root });
  });
})();
