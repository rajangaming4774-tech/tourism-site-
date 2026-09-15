# Mahabalipuram 3D — the gap list research must close

Written before the research ran, from the project's own files, so findings can be
graded against a fixed target rather than against whatever turned up. Every gap
below is one the codebase *already states about itself* — this is not a critique,
it is the project's own TODO made explicit.

Sources for this list: `README.md`, `content/mahabalipuram-heights.js`,
`content/mahabalipuram-monuments.js`.

## G1 — The Descent of the Ganges has no carving  ★ highest value

> "No carved figures. The Descent of the Ganges has its rock mass, its 29 m span
> and its central cleft, but not the hundreds of gods, ascetics and animals. That
> needs photogrammetry of the actual relief; it cannot be modelled from a
> description." — README

The geometry is already prepared for the fix: `js/scene-penance.js` lays down a
**planar UV projection matched to a 29.26 × 13.10 m plate**.

**Unblock condition — either one, no geometry change:**
1. An orthophoto of the real face → displacement + normal map through those UVs.
2. A photogrammetry/LiDAR scan → GLB replacing the group.

**Grade the research on:** does a real scan exist publicly, under what licence;
failing that, does a face-on full-panel high-resolution photograph exist.

## G2 — No PBR textures anywhere

> "Granite is flat Principled material — no roughness maps, no normal maps, no
> moss. Those are texture assets, and none exist here." — README

Stone is aged by **base colour only**, 53 materials, six tonal steps × three
tints, varied **per part, not per vertex** — so there are no runoff streaks down
a large face.

**Unblock condition:** CC0 granite / weathered-stone PBR sets, at a resolution
whose KB cost survives this project's mobile budget (it rejected a change that
took a file 127 KB → 443 KB).

## G3 — Nakula-Sahadeva Ratha has no published dimensions

> "The only one of the five rathas with no published dimensions I could find …
> A citable figure from the ASI or a Pallava-architecture survey would qualify
> it; until then it stays a flat pin rather than an estimate."
> — `mahabalipuram-heights.js`

It is currently **proportioned against its cited neighbours**, which the README
declares as convention rather than fact.

**Unblock condition:** a published height + plan dimension, with a statement of
what the height measures.

## G4 — The Shore Temple cannot be extruded

The OSM way is the **prakara**, measured at 46.4 × 21.5 m = 933 m², against a
cited ~15 m square platform (225 m²) — 4.1× too big. The cited **18 m belongs to
the Kshatriyasimhesvara vimana alone**. Applying it to the compound would put a
46 × 21 × 18 m slab on the shoreline.

**Unblock condition — any one:**
- Published plan dimensions of the vimana itself (and of the second Shiva shrine
  and the towerless Vishnu shrine between them).
- OSM gains a separate way for the vimana, or `building:part` polygons.

## G5 — Every dimensional citation is Wikipedia

All five cited heights (Dharmaraja 11 m, Bhima 7.6 m, Arjuna 6.1 m, Draupadi
5.5 m, Butterball 6 m) and both tier counts trace to Wikipedia articles accessed
2026-09-04. That is a real source, but it is a tertiary one.

**Unblock condition:** primary/scholarly corroboration — Rea's *Pallava
Architecture* (1909), K.R. Srinivasan, Michell, ASI publications, the UNESCO
dossier. Pre-1930 surveys are public domain **and carry measured plates**, so
they upgrade the citation *and* supply drawings.

## G6 — The rathas' north-to-south order is convention, not evidence

> "The rathas' north-to-south *order* is the conventional one — the sources
> confirm the plinth is north-south but do not give the sequence." — README

**Unblock condition:** a source stating the physical sequence along the plinth.

## G7 — Terrain is ~30 m and "does not model plinths"

Exaggeration had to be slid down with zoom because at a fixed 1.8 it "turns a
25 m coastal ridge into a mountain". The granite ridge is the site's defining
landform.

**Unblock condition:** a better DEM — **key-free**, because this project
deliberately avoids API keys.

## G8 — 119 of 120 town buildings have no real height

Checked 6 September 2026: OSM records `height` for **exactly one** of 119
buildings and `building:levels` for **none**. They are massed at 3.2 m per
nominal storey and painted pale and semi-transparent to declare it.

**Unblock condition:** any real height source — or a contribution back to OSM.

## G9 — Monuments with no polygon or a shared polygon

| Monument | Blocker |
|---|---|
| Olakkanneshwara | OSM **node**, no polygon exists upstream |
| Pidari & Valayankuttai | **One way covers two monoliths** — one height would misstate both |
| Old lighthouse | Published figures are focal-plane height above sea level, not structure height; the hill is ~25 m so using one roughly doubles the tower |
| Krishna Mandapam, Tiger Cave | Rock-cut — excavated *into* the cliff; extruding the outline draws a building where the rock is hollowed inward |

**Unblock condition:** upstream OSM edits, or a structure-height figure for the
lighthouse specifically.

---

## The rule any finding has to survive

From `mahabalipuram-heights.js`: a monument is modelled only if **(a)** it has a
real OSM polygon, **(b)** its height comes from a published citable source, and
**(c)** its plan outline actually *is* its footprint. And every number must state
**what it measures** — "11 m" means nothing until you say whether that is above
the plinth, above the surrounding rock, or including the finial.

A research finding that cannot supply "what it measures" does not close a gap.
An honest "not found" is a valid result and is preferred to an estimate.
