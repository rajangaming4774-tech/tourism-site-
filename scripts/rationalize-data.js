// One-off data-quality pass over dynasties.json and rock_art research:
// contested-territory notes, a stray territorial assignment, weak-source swaps.
// Run: node scripts/rationalize-data.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dynPath = path.join(root, "data", "dynasties.json");
const dyn = JSON.parse(fs.readFileSync(dynPath, "utf8"));

const findPol = (pid, needle) => dyn[pid].polities.find((p) => p.name.includes(needle));

// The Andamans were effectively outside the Bengal Nawabs' control.
const bengal19 = findPol("P19", "Nawabs of Bengal");
bengal19.states = bengal19.states.filter((s) => s !== "Andaman and Nicobar Islands");

// Contested / over-simplified assignments get an explicit note.
const NOTES = [
  ["P11", "Kushan Empire", "The Kushans' reach into Bihar rests on the Rabatak inscription's claim over Pataliputra; their firm rule that far east is debated."],
  ["P13", "Gupta Empire", "Rajasthan and the western fringe were held through vassals; Gupta control there loosened rapidly after Skandagupta."],
  ["P14", "Pandyas of Madurai (revived)", "Shown over Kerala as an approximation: the Pandya heartland was southern Tamil Nadu (assigned here to the Pallavas), and the Kerala coast was locally ruled by Ay and Chera chiefs under shifting Pandya pressure."],
  ["P17", "Delhi Sultanate", "Gujarat and Bengal were annexed only mid-period (1297-1352) and Bengal broke away again in 1352; the sultanate's grip outside the core was episodic."],
  ["P18", "Vijayanagara Empire", "Extent shown is pre-1565; after Talikota the far south passed to the Madurai and Thanjavur Nayaks."],
  ["P19", "Kingdom of Mysore", "Tamil Nadu was contested: the Nawab of Arcot, the Nayak successor states and the Company all held parts of the Carnatic through this period."],
  ["P19", "Maratha Empire", "Odisha and much of central India came under Maratha control only after the 1740s-50s campaigns."],
  ["P08", "Gandhara (Achaemenid satrapy)", "Punjab's inclusion reflects the Achaemenid Indus satrapies; the eastern Punjab plain remained under local janapadas."],
];
for (const [pid, name, note] of NOTES) {
  const pol = findPol(pid, name);
  if (pol) pol.note = note;
  else console.warn("note target missing:", pid, name);
}

// Weak-source swaps (coaching/blog links -> stable references).
const SWAPS = {
  "https://byjus.com/free-ias-prep/ancient-history-16-mahajanapadas/": "https://en.wikipedia.org/wiki/Mahajanapadas",
  "https://vajiramandravi.com/upsc-exam/mahajanapadas/": "https://en.wikipedia.org/wiki/Mahajanapadas",
  "https://www.iasgyan.in/blogs/the-16-mahajanpadas": "https://en.wikipedia.org/wiki/Mahajanapadas",
  "https://www.clearias.com/dynasties-of-magadha/": "https://en.wikipedia.org/wiki/Magadha",
  "https://vajiramandravi.com/current-affairs/kalinga-war/": "https://www.britannica.com/event/Kalinga-War",
  "https://www.studyiq.com/articles/adichanallur-archaeological-site/": "https://www.britannica.com/place/Adichanallur",
  "https://vajiramandravi.com/upsc-exam/chalcolithic-age/": "https://en.wikipedia.org/wiki/Chalcolithic",
  "https://lotusarise.com/megalithic-culture-upsc/": "https://en.wikipedia.org/wiki/South_Indian_Iron_Age",
  "https://www.tamilnadutourism.com/blog/keeladi-excavation": "https://en.wikipedia.org/wiki/Keezhadi_excavation_site",
};
let swapped = 0;
const swapIn = (obj) => {
  for (const period of Object.values(obj)) {
    for (const pol of period.polities) {
      pol.sources = (pol.sources || []).map((s) => {
        if (SWAPS[s]) { swapped++; return SWAPS[s]; }
        return s;
      });
      // dedupe after swaps
      pol.sources = [...new Set(pol.sources)];
    }
  }
};
swapIn(dyn);
fs.writeFileSync(dynPath, JSON.stringify(dyn, null, 1));

// Rock art: swap the two weakest links.
const raPath = path.join(root, "data", "research", "rock_art.json");
const ra = JSON.parse(fs.readFileSync(raPath, "utf8"));
for (const site of ra) {
  site.sources = [...new Set((site.sources || []).map((s) =>
    s.includes("insightsonindia") || s.includes("lotusarise")
      ? "https://en.wikipedia.org/wiki/South_Indian_Iron_Age"
      : s
  ))];
}
fs.writeFileSync(raPath, JSON.stringify(ra, null, 1));

console.log(`done: notes=${NOTES.length}, source swaps=${swapped}, Bengal-Andaman fixed`);
