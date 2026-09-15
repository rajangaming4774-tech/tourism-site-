# The Pancha Rathas: two gaps closed from a primary source

> 2026-09-13: the rathas in the scene are now the architectural reconstruction described
> in `07-pancha-rathas-rebuild.md`, built to the dimensions and the order this note
> established and placed at the OSM centroids (Nakula-Sahadeva 7 m west, as measured
> below, not the first model's 15 m).

G3 (Nakula-Sahadeva has no published dimensions) and G6 (the north-to-south order
is convention, not evidence) are both **closed**, from one 1880 field survey that
I fetched and read directly rather than taking on report.

Source throughout: **Fergusson, James & Burgess, James, *The Cave Temples of
India*, London: W.H. Allen & Co., 1880**, Chapter VI "Rathas, Mahavallipur".
Full text: https://archive.org/details/cavetemplesofind00ferguoft
(read via `cavetemplesofind00ferguoft_djvu.txt`, verified 2026-09-07).

## G3 — Nakula-Sahadeva Ratha now has a citable dimension

> "Its dimensions are **18 feet in length north and south, by 11 feet across, and
> the height is about 16 feet**." — p. 135

**5.49 m long (N–S) × 3.35 m wide, 4.88 m high.**

`measure`: overall external dimensions of the monolith, as surveyed in the field.
Also on the same page, the apsidal rear cell is "only 3 feet in depth by 4 feet
6 inches in width".

This is very likely the **origin** of the "18 × 11 × 16 feet" figure that recurs
across modern pages without attribution. Puratattva additionally credits it to
R. Nagaswamy, *Mahabalipuram* (OUP, 2008) p. 57 — that attribution could **not**
be verified and should not be cited.

**Negative findings worth keeping**, because they say where *not* to look again:

- **Longhurst 1928** (ASI Memoir 33, *Pallava Architecture Part II*), pp. 21–22,
  describes "No. 7 (Sahadeva's Ratha)" in detail but gives **no dimensions for
  it** — while giving explicit measurements for Draupadi's, Bhima's and
  Dharmaraja's. Confirmed by full-text search of the complete book.
- **K.R. Srinivasan, *Cave-Temples of the Pallavas*** (ASI, 1964) is scoped to
  rock-cut cave temples, not monoliths — one passing index entry, no dimensions.
- **Rea 1909** does not cover Mamallapuram with measurements at all (third
  independent confirmation of this correction).

**An unresolved conflict, to record rather than resolve:** Fergusson & Burgess
(1880, p. 135) say the ratha's "front faces the **north**"; Longhurst (1928,
p. 21) says it faces the **south**. Two directly-read primary statements, 48
years apart, in flat contradiction.

## G6 — The order is not convention. It is sourced, and the model already has it right

> "the most southern of the Raths is called that of **Dharmaraja**, the next that
> of **Bhima**, the third that of **Arjuna**, and the fourth that of **Draupadi**
> … These four are situated in one line, extending about 160 feet north and
> south … The fifth, called after the twins Sahadeva and Nakula, is situated **a
> little to the westward of the other four, and quite detached**." — p. 113

Corroborated at p. 116 ("The first or most **northern** … Draupadi") and
independently by Longhurst 1928 p. 22 (Bhima "stands third from the north").

So the order **north → south is Draupadi, Arjuna, Bhima, Dharmaraja**, and
**Nakula-Sahadeva is not in the row at all.**

### Checked three ways, and they agree

| | N→S order of the four | Nakula-Sahadeva |
|---|---|---|
| Fergusson & Burgess 1880 | Draupadi, Arjuna, Bhima, Dharmaraja | "a little to the westward … quite detached" |
| OSM centroids (measured) | Draupadi, Arjuna, Bhima, Dharmaraja | **7.1 m west** of the line |
| The shipped GLB (accessor bounds) | Draupadi, Arjuna, Bhima, Dharmaraja | **15.3 m west** of the line |

I expected to find an error here and did not. **The model is already correct in
kind** — right order, and Nakula-Sahadeva already placed detached to the west.
The README is simply more cautious than the evidence now requires.

### What to change

1. README, "Two things stated as convention, not fact" — the ratha order is no
   longer one of them. Cite Fergusson & Burgess 1880 p. 113.
2. `mahabalipuram-heights.js` — Nakula-Sahadeva can carry a real height (4.88 m)
   and plan (5.49 × 3.35 m) with `measure` and `source`. Note it still fails
   rule (a)/(c) as an extrusion candidate unless its OSM way checks out, but it
   no longer needs to be "proportioned against its neighbours".
3. **One genuine refinement:** the model puts Nakula-Sahadeva **15.3 m** west;
   OSM centroids put it **7.1 m** west. Roughly double. Worth reconciling in the
   source scene.

### One caution on the plinth

Fergusson's "about **160 feet** north and south" (48.8 m) describes the **natural
rock ridge**, not a built plinth — he adds it rose "to a height of about 40 feet
at its southern end, and sinking to about half that height at its northern
extremity", and says explicitly that whether the rathas were cut from a
continuous ridge "cannot now be ascertained. My impression is…".

That is an 1880 visual impression, flagged as such by its own author. Measured
spans: OSM centroids 34.4 m, the GLB 39.5 m — both shorter, as expected, since
they span monument centres rather than the whole ridge. **No width figure for
the plinth was found, and no source gives a footprint covering all five.**

So README's "The rathas share one continuous plinth in pink granite, as recorded"
is stronger than the source supports: the continuity of the ridge is Fergusson's
stated *impression*, explicitly not ascertained.

## Cave and mandapa dimensions (G5, partial)

From Longhurst 1928 and Fergusson & Burgess 1880, both read directly:

| Monument | Longhurst 1928 | Fergusson & Burgess 1880 |
|---|---|---|
| **Varaha Cave** | portico 20¼ × 8½ ft, 10¼ ft high (p. 29–30) | hall 19½ × 9½ ft (p. 150–1) |
| **Mahishasuramardini Mandapa** | 32 ft (N–S) × 15 ft, 12½ ft high (p. 34) | 33½ × 15 ft (p. 145–6) |
| **Krishna Mandapam** | relief 12 ft high; length lost to OCR (p. 39) | relief ~45 ft × 10–11 ft at centre; later porch 48 × 23 ft, 12 columns (p. 149) |
| **Ganesha Ratha** | 20 × 11½ ft, 28 ft to gable finial; cella 6′11″ × 3′9″ × 6′8″ (p. 28) | 19 × 11′3″, 28 ft high (p. 114) |
| **Adivaraha Cave** | ~33 × 14 ft; height OCR-corrupt, not reported (p. 33) | none — in 1880 "still used for worship… not accessible to strangers" |
| **Trimurti Cave** | **no dimensions given** | **none** (as "Kapul Iswara", p. 152) |

Note the Krishna Mandapam porch is a **Chola-period addition, c. 11th century**,
not part of the Pallava original — relevant if it is ever modelled.

**Ganesha Ratha is the strongest cross-check in the whole set:** two independent
surveys 48 years apart agree exactly on 28 ft height, and differ by 1 ft and 3
inches on plan. **Trimurti has no published dimension in any of three scholarly
treatments** — an honest gap, to be stated rather than estimated.

## Still inaccessible

`whc.unesco.org` returned a Cloudflare bot-challenge on every document URL tried
(dossier 249 and docs 153038, 162853, 162854, 164622, 216405, 144323). Not
bypassed. A manual browser visit remains the way to check whether the nomination
dossier carries measured plans.
