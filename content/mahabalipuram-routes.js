/* Suggested walking routes through the Mahabalipuram site.
 *
 * This file holds the ORDER and the human notes only. The line drawn on the
 * map is NOT authored here — `scripts/fetch-site-data.js` generates it by
 * walking the real OpenStreetMap footpath network between consecutive stops
 * (shortest path), and writes it to data/mahabalipuram-routes.geojson.
 *
 * That matters: a straight line from the Pancha Rathas to the hilltop would
 * run through the ASI boundary fence and a granite outcrop. Straight
 * stop-to-stop lines are what js/app.js does for the national trails, which
 * is fine at 200 km and wrong at 200 m.
 *
 * Where OSM has no mapped footpath between two stops, the generator emits a
 * `gap: true` leg and the map draws it dashed and labelled — it does not
 * pretend to know a way through.
 *
 * Stop order follows the site's geography, south to north and then east to
 * the sea: the rathas sit at the south end (12.6089), the boulder, the great
 * relief and the caves run up the ridge in the middle (12.615–12.619), and
 * the Shore Temple stands apart on the water (12.6165, 80.1992).
 */
window.MAHABALIPURAM_ROUTES = [
  {
    id: "half-day",
    label: "Half day",
    blurb: "The three everyone comes for — the rathas, the great relief and the Shore Temple.",
    stops: [
      {
        monument: "pancha-rathas",
        note: "Start here. The ASI ticket bought at this gate also covers the Shore Temple, so keep it.",
      },
      { monument: "krishnas-butterball" },
      { monument: "descent-of-the-ganges", note: "The relief faces west — best light in the afternoon." },
      {
        monument: "shore-temple",
        note: "Finish on the water. Facing east, it takes first light, so it is also the best reason to come back at opening.",
      },
    ],
  },
  {
    id: "everything",
    label: "Everything",
    blurb:
      "Eighteen stops covering the walkable core — all twenty-four monuments in the guide except Mukunda Nayanar, which stands alone 750 m north — the five rathas are one stop, visited together on their shared plinth. South to north, then east to the sea. Half a day at a brisk pace, a full one if you stop to look.",
    stops: [
      { monument: "pancha-rathas", note: "Start at the south gate. The ASI ticket bought here also covers the Shore Temple." },
      { monument: "olakkanneshwara", note: "Straight up the hill first, while the light is still low — no shade on the climb." },
      { monument: "dharmaraja-mandapa" },
      { monument: "mahishasuramardini-mandapa" },
      { monument: "ramanuja-mandapa" },
      { monument: "krishna-mandapa" },
      { monument: "descent-of-the-ganges", note: "The relief faces west, so it reads best in the afternoon." },
      { monument: "rayala-gopuram" },
      { monument: "varaha-cave" },
      { monument: "ganesha-ratha" },
      { monument: "panchapandava-mandapa" },
      { monument: "koneri-mandapa" },
      { monument: "krishnas-butterball" },
      { monument: "trimurti-cave" },
      { monument: "kotikal-mandapa" },
      { monument: "pidari-valayankuttai-rathas", note: "The quietest corner of the site." },
      { monument: "shore-temple", note: "Finish on the water. Facing east, it takes first light — the reason to come back at opening." },
      {
        monument: "tiger-cave",
        travel: "auto",
        note: "5.4 km north at Saluvankuppam — take an auto-rickshaw. Not a walk, and the map does not draw it as one.",
      },
    ],
  },
  {
    id: "full-day",
    label: "Full day",
    blurb: "Everything in the walkable core, the hilltop viewpoint, and the Tiger Cave to the north.",
    stops: [
      {
        monument: "pancha-rathas",
        note: "Start here. The ASI ticket bought at this gate also covers the Shore Temple.",
      },
      { monument: "krishnas-butterball" },
      { monument: "descent-of-the-ganges" },
      { monument: "varaha-cave" },
      { monument: "mahishasuramardini-mandapa", note: "At the foot of the hill; the climb starts just behind it." },
      {
        monument: "olakkanneshwara",
        note: "On the hilltop above the cave — the whole site and the coastline from one place. Little shade on the climb.",
      },
      { monument: "shore-temple" },
      {
        monument: "tiger-cave",
        travel: "auto",
        note: "5.4 km north at Saluvankuppam — take an auto-rickshaw. Not a walk, and the map does not draw it as one.",
      },
    ],
  },
];
