# What an orthophoto plate of the Descent of the Ganges must look like

Derived from the geometry that already exists in `js/scene-penance.js`, not from
preference. If a plate meets this spec it drops in **with no change to the
geometry**; if it does not, it needs rectifying first.

## The UV projection, as built

`js/scene-penance.js:237`

```js
uv.push((p[2] - runStart) / RUN_TOTAL, 1 - m.localY[i] / 13.1);
```

with `RUN_TOTAL = 29.26`, `CLEFT_W = 0.56`, and the two masses at
`{ run: 13.6, height: 13.1, depth: 10.2 }` (south) plus its northern counterpart.

Read off that line, the plate's coordinate system is:

| | Meaning |
|---|---|
| **u = 0 → 1** | Along the relief, `runStart` to `runStart + 29.26 m`. Left edge of the image is one end of the run, right edge the other. |
| **v = 0** | The **top** of the rock (13.10 m above the mass's own base) — because v is `1 − localY/13.1`. |
| **v = 1** | The base of the rock. |
| **Height datum** | `localY` is height above **that mass's own base**, deliberately *not* world Y. So the plate is referenced to the rock's foot, not to sea level or the DEM surface. |

## Hard requirements

1. **Aspect ratio 29.26 : 13.10 = 2.234 : 1.** Anything else stretches the
   carving. Crop or pad to this before use — do not rescale non-uniformly.
2. **Orthographic, or rectified to orthographic.** A perspective photograph taken
   from the ground has the top of a 13 m face receding; used as a displacement
   map it will compress the upper register and shear the figures. This is the
   single most common reason a good photograph is still an unusable plate.
3. **The full 29.26 m span in one frame, including the cleft.** The 0.56 m
   natural fissure is at a known position in the run; a two-part plate must be
   stitched to that spacing, not butted together.
4. **Top-aligned to the 13.10 m point.** v = 0 is the tallest point of the rock,
   not the top of the carved area and not the top of whatever the photographer
   framed.

## Resolution target

| Plate width | Ground sampling | Verdict |
|---|---|---|
| 586 px | 5 cm/px | Below useful — reads as a bumpy wall |
| 2,926 px | 1 cm/px | Minimum for figures to be legible |
| 5,852 px | 5 mm/px | Good; individual limbs and faces resolve |
| **8,192 px** | **3.6 mm/px** | **Target.** Height 3,666 px at the fixed aspect. |

8192 × 3666 is also a clean power-of-two width for a KTX2/Basis encode.

## What ships to the browser is not the plate

The plate is a *source*. Derived from it:

- **A normal map** — carries the carving's direction of relief. Cheap, and does
  most of the visual work at the distances this scene uses.
- **A displacement/height map** — only if the geometry is subdivided enough to
  take it. The masses are superellipsoids built for silhouette, not for
  micro-displacement; a normal map alone may be the honest stopping point.
- **A base-colour map** — but note this collides with the existing weathering
  system, which tints **per part** by height above the monument's own base. A
  photographic albedo would replace that, not layer on it. Decide which is the
  source of truth before doing both.

Web-delivered versions should be KTX2/Basis, not 8K PNG. An 8192-wide PNG is
tens of MB; this project rejected a 316 KB increase as too expensive on mobile.

## The honesty constraint that still applies

The README's position is that "an invented composition is worse than an uncarved
rock, because a visitor cannot tell which parts are evidence." A photographic
plate is evidence, so it satisfies that. A plate that has been *touched up*,
AI-upscaled, or generatively completed where the photograph was occluded is not
— and would be worse than the current honest blank, because it would look like
evidence. Whatever plate is used, record its provenance and any processing in
the same way heights carry `measure` and `source`.
