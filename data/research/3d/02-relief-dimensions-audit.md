# Audit: where the relief's 29.26 × 13.10 m figures actually come from

An agent reported that the project overstates the relief's height by 44%. **That
conclusion is wrong** — it compared a peak against an average. But the
investigation underneath it found something real, so this note records the
verified version.

## Verified first-hand from the primary source

Downloaded the full text of Fergusson & Burgess, *The Cave Temples of India*
(London, 1880) from archive.org (`cavetemplesofind00ferguoft`) and read the
passage directly. Chapter VII, "Great Bas-relief", p. 155:

> "It is, in fact, a great bas-relief carved in **two great masses of rock**, and
> extending **nearly 90 feet north and south**, with an **average height of about
> 30 feet**."

This is a real 19th-century field measurement of the whole two-boulder
composition, and it is the earliest traceable published dimension for the
monument.

## What the project ships, and where those numbers come from

`js/scene-penance.js:40` — `RUN_TOTAL = 29.26`, and the comment above it calls
these "Published dimensions."

**29.26 m is exactly 96 ft. 13.10 m is exactly 43 ft.** These are unit
conversions of a "96 × 43 ft" figure that appears on Wikipedia — and that
sentence in the Wikipedia article **carries no citation**. So the project's
"published dimensions" trace to an uncited tertiary figure, not to a survey.

That is a genuine finding and the comment should be softened to say so.

## But the 44% claim does not survive checking

The two figures measure different things:

- Project's **13.10 m is a peak** — README: "13.10 m at the tallest point", and
  `SOUTH.height = 13.1` is the superellipsoid's full axis.
- Fergusson's **30 ft is an average** — "an average height of about 30 feet."

Comparing them directly is the exact error this project's `measure` field exists
to prevent. The masses are superellipsoids (`superY = 0.55`, `superZ = 0.72`),
so silhouette height falls away toward the outer ends. Integrating the actual
built profile,

```
H(u) = h · (1 − u^(2/superZ))^(superY/2)      u = normalised distance along run
```

| | Peak | Mean of the built silhouette |
|---|---|---|
| North mass | 11.40 m | 10.19 m |
| South mass | 13.10 m | 11.71 m |
| **Run-weighted** | — | **10.91 m = 35.8 ft** |

Like against like: **35.8 ft modelled average vs Fergusson's ~30 ft average —
about 19% over, not 44%.**

Length: 29.26 m vs Fergusson's ~27.43 m — **6.7% over**, and his figure says
"nearly 90 feet", which is itself approximate.

## The cleft width is not published at all

`CLEFT_W = 0.56` sits under the same "Published dimensions" comment. The agent
searched Fergusson (1880), Longhurst (1928), Wikipedia and Puratattva: all
describe the fissure qualitatively — "a large vertical cleft", "narrow fissure"
— and **none gives a numeric width**. 0.56 m is not traceable to any source.

Given this project's standards, that comment is the problem, not the number: an
undeclared modelling estimate is sitting under a heading that says "published".

## Correction to my own earlier note

`00-baseline-gaps.md` (G5) suggested chasing Alexander Rea, *Pallava
Architecture* (1909) for measured plates. **That was wrong.** The agent fetched
and searched two separate archive.org scans: Rea 1909 is scoped almost entirely
to the structural temples at Kanchipuram and mentions Arjuna's Penance only
twice in passing, with no measurements.

The correct ASI monograph is **A.H. Longhurst, *Pallava Architecture, Part II —
The Intermediate or Mamalla Period* (ASI, Madras, 1928)**, which covers this
monument in detail, including Plate XXXI(b), "Detail of the Cat and the Mice".

Also confirmed by direct text search: K.R. Srinivasan's *Cave-Temples of the
Pallavas* does **not** cover the open-air relief at all — it is scoped to
excavated cave-temples — so it cannot serve as a source for this monument.

## Recommended action

Nothing needs re-modelling. What needs changing is one comment, from a claim of
publication to a statement of provenance:

```js
/* Dimensions. 29.26 x 29.26 m is the metric form of a "96 x 43 ft" figure that
 * is widely repeated but UNCITED at source. The earliest traceable field
 * measurement is Fergusson & Burgess, The Cave Temples of India (1880) p. 155:
 * "nearly 90 feet north and south, with an average height of about 30 feet"
 * — an AVERAGE, which the built silhouette meets at 35.8 ft against his 30.
 * CLEFT_W is a modelling estimate: no published width was found. */
```

Nagas, elephants and the cat-and-mice group are all attested in Fergusson (1880)
and Longhurst (1928) with heights for the central Naga pair (male "above 5 feet",
seven-hooded; female "about 7 feet", three-hooded) — usable if figures are ever
placed, and a reminder that the *scale* of the carving is documented even though
its *form* needs a plate.
