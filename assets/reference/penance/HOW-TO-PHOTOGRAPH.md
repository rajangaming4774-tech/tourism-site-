# How to photograph the Descent of the Ganges

A simple guide. The goal is one flat picture of the whole rock, 29.26 m wide and
13.10 m tall, that can be dropped into `js/scene-penance.js` and become the carving.

You do not need an expensive camera. A modern phone is enough.

---

## 1. Before you go

**Check the rules when you arrive.** These are the usual rules at Indian
Archaeological Survey sites, but ask at the gate — do not assume:

- Normal cameras and phones: usually free.
- **Tripods: usually need permission.** Ask first.
- **Drones: do not fly one.** Drones are not allowed at protected monuments in
  India without written permission. Do not risk it.

The relief stands in an open area, not inside a ticketed enclosure like the Shore
Temple. But check locally, because this can change.

## 2. Pick the right day and time — this matters most

**Go on a cloudy day if you can.** Clouds are the best light. They spread the
light evenly and remove hard shadows.

If the day is sunny, **go in the afternoon.**

Here is why. The carved face looks **east**. So:

| Time | What happens |
|---|---|
| Morning | Sun shines straight onto the face. Very hard shadows. **Bad.** |
| Midday | Light comes from above. Strong shadows under every figure. **Bad.** |
| **Afternoon** | The sun has moved behind the rock. The face sits in soft, even shade. **Best.** |

**Why shadows are bad here.** Your 3D scene makes its own light. If a shadow is
already painted into the picture, you get two shadows — the real one and the fake
one. The carving then looks dirty and wrong. Flat, shadowless light is what you
want, even though it looks boring to the eye.

**Never use flash.**

## 3. How to stand and move

This is the important part. Do **not** stand in one spot and turn the camera.

**Stand back as far as you can. Then walk sideways.**

```
        the rock (29 m long)
   ================================
   ^   ^   ^   ^   ^   ^   ^   ^     <- camera points straight at the rock
   |   |   |   |   |   |   |   |        every time
   o   o   o   o   o   o   o   o     <- you walk sideways, same distance
```

Rules while you walk:

1. **Always point straight at the rock.** Never turn the camera sideways.
2. **Keep the same distance** from the rock the whole time.
3. **Keep the camera at the same height** the whole time.
4. **Overlap each photo.** Each new photo should include about **half** of the
   last one. Overlap is what lets software join them.
5. **Do not zoom in and out** between photos. Pick one zoom and keep it.
6. Stand back and zoom in a little, rather than standing close and going wide.
   Wide-angle bends straight lines and is harder to fix later.

## 4. How many photos

Do three rows:

- **Row 1** — the bottom of the rock
- **Row 2** — the middle
- **Row 3** — the top

Walk the full length for each row. Expect roughly **60 to 100 photos** in total.
That sounds like a lot. It is 20 minutes of work, and more is always safer than
fewer. You cannot go back easily.

## 5. Camera settings

If your camera has settings:

- Lowest ISO (100 or 200) — less grain
- Aperture about f/8 — keeps everything sharp
- Shoot RAW if you can, otherwise highest-quality JPEG
- Lock the focus so it does not change between photos

If you only have a phone: turn on the highest resolution in settings, hold still,
and tap the same spot to focus each time. That is enough.

## 6. Put something in the picture for size

Take **two or three extra photos** with a person standing at the foot of the rock,
or a 1-metre stick or tape laid against it.

This is how the picture gets matched to the real 29.26 m later. Without it, nobody
can tell how big anything is.

Also photograph the **whole rock from far away**, a few times. These wide shots are
the map that shows how all the close photos fit together.

## 7. The one thing you cannot fix

The rock is **13 metres tall** — about a four-storey building.

From the ground, the top of the rock is far above you. Those photos will always
look up at an angle. Software can straighten this a lot, but not perfectly.

**Do not use a drone to solve this.** Just accept it, take the top row anyway, and
record honestly that the upper part is less accurate. That is exactly the kind of
note this project already makes everywhere else.

## 8. Turning the photos into one flat picture

Free software that can join the photos:

- **Hugin** — free, joins photos into one flat picture. Simplest choice.
- **Meshroom** — free, open source. Makes a real 3D model from your photos, and
  can export a proper flat "orthophoto". Best result, needs a good graphics card.
- **RealityCapture** — free for personal use now. Fast and very good.

Meshroom or RealityCapture are better, because they give you **both** things at
once: a 3D model of the rock *and* the flat picture.

## 9. What the final picture must look like

From `data/research/3d/01-relief-plate-spec.md`:

- Shape **2.234 : 1** — a wide letterbox. 29.26 ÷ 13.10.
- Target size **8192 × 3666 pixels**.
- The **top edge** of the picture is the highest point of the rock.
- The **bottom edge** is the ground at the rock's foot.
- Flat and square-on, not leaning.

Save the untouched originals somewhere safe. Do not sharpen, brighten, or "improve"
the picture, and never let an AI fill in a missing part. A guessed carving looks
like evidence without being evidence, and that is the one thing this whole project
refuses to do.

## 10. Quick checklist for the day

- [ ] Cloudy day, or afternoon
- [ ] Phone or camera fully charged, memory empty
- [ ] Ask at the gate about tripods
- [ ] Wide shots of the whole rock first
- [ ] Three rows, walking sideways, half overlap
- [ ] Camera always pointing straight ahead
- [ ] A person or measuring tape in two shots for size
- [ ] Do not delete anything until you are home
