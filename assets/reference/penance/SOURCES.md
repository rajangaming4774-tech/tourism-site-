# Reference plates: Descent of the Ganges

**These are reference material, not shipped assets.** Nothing here is loaded by the
site. They are here so the relief can be carved from evidence instead of invention.

## What these are

Two 19th-century albumen prints from the **James Fergusson Collection**, held by the
**Boston Public Library** and served through Digital Commonwealth.

Both are **public domain** — "No Copyright — United States", "No known copyright
restrictions". **No permission is needed and no licence fee applies.** Credit is not
legally required, but crediting the Boston Public Library is normal courtesy and this
project credits everything anyway.

| File | Shows | Pixels | Angle | Usable as a plate? |
|---|---|---|---|---|
| `bpl-penance-cleft-nagas.jpg` | The central cleft with the naga figures rising in it, the shrine at left, ascetics, and the head/forequarters of the great elephant | 4575 × 5230 | Face-on | **Yes** |
| `bpl-penance-elephants.jpg` | The elephant family, the calves, and the upper register of celestials above them | 5551 × 4409 | **Oblique** | **No** — see below |

**Correction, 2026-09-08.** This table originally called both frames "face-on".
That was wrong for `bpl-penance-elephants.jpg`, which is shot along the face: the
great elephant is in near-profile and the rock recedes to the upper right. The
relief is not planar — the elephant projects perhaps 1.5–2 m from the wall — so
rectifying an oblique view of it does not straighten it, it smears the elephant
sideways over the wall behind, manufacturing surface nobody observed. It stays
reference material and does not enter the plate.

Downloaded 2026-09-07 at full IIIF resolution.

- Record: https://www.digitalcommonwealth.org/search/commonwealth:vh541018k
  (image `commonwealth:qj72sb53w`)
- Record: https://www.digitalcommonwealth.org/search/commonwealth:rx916s10q
  (image `commonwealth:g158fn124`)

IIIF endpoint pattern, if other sizes or crops are wanted:
`https://iiif.digitalcommonwealth.org/iiif/2/commonwealth:<id>/full/<width>,/0/default.jpg`

## Why 19th-century prints beat modern snapshots here

These were shot on large-format plates for **documentation**, not for a holiday album.
The photographer stood square to the rock, used a long exposure and a small aperture,
and the result resolves individual faces and limbs. Most modern photographs of this
relief are taken obliquely, from too close, in harsh sun.

They also record the surface **before** a further 140 years of coastal salt weathering.

## What they are NOT

**They do not cover the full 29.26 m panel — and they cover far less than this
file first claimed.** "Roughly the central third" was a guess written before
anything was measured. `scripts/build-relief-plate.js` has since registered the
usable frame against the model, and the answer is:

| | |
|---|---|
| Frame covers | **6.04 m of run × 6.08 m of height** |
| Position | run 13.40 m → 19.44 m from the north end, straddling the cleft |
| Share of the panel | **21% of the 29.26 m run**, and only the lower **46%** of the 13.10 m height |
| Left bare | **13.40 m north, 9.82 m south** |

The crown of the rock is not in frame at all. Scale was fixed by hand from the
great elephant — 2,223 px head-to-foot against Fergusson's "life size", so about
3.0 m, giving 0.00135 m/px. That is a **qualitative** source: "life size" is not
a measurement and Asian elephant head height runs 2.5–3.2 m, so the scale carries
roughly ±10%, and every derived figure above inherits it.

Rejected as the scale reference: the 0.56 m cleft width, because it is an
unpublished modelling estimate *and* its edges are not cleanly separable from the
shadowed relief beside them. An automatic detector using it put the frame at
3.5 m and would have placed every figure in the wrong place.

They are also **perspective photographs, not orthophotos**. Before use as a
displacement or normal map through the UVs in `js/scene-penance.js`, they must be
rectified — the upper registers recede in both frames, and used raw they would shear
the figures. See `data/research/3d/01-relief-plate-spec.md` for the exact target: a
2.234:1 plate, v = 0 at the 13.10 m crown, height measured from the rock's own base.

## Honest limits, to state on screen if these are ever used

1. Partial coverage — the ends of the panel are absent and must not be invented to
   fill the plate.
2. Monochrome — these carry **form**, not colour. Any colour would be a modern
   addition and should be declared as one.
3. Undated within a range — catalogued c. 1850–1886. The exact year is not recorded
   on the item pages.

Under this project's own rule, a partial plate honestly labelled is fine; a plate
completed by guesswork at the edges is not.
