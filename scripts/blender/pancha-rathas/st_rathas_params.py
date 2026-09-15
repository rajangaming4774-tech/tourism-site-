# Parameters of the Pancha Rathas reconstruction, in metres.
#
# COPIED FROM data/research/3d/pancha-rathas-proportions.json (every photo-read
# number, with the photograph and the pixel it came from) and the cited
# dimensions in content/mahabalipuram-heights.js and
# data/research/3d/03-rathas-resolved.md. Positions are the OSM footprint
# centroids (data/mahabalipuram-footprints.geojson; data/mahabalipuram-osm.json
# for Nakula-Sahadeva), relative to the pancha-rathas anchor (-207.49, 867.9 in
# the scene frame). Everything marked "assumed" is an assumption and is
# declared in 07-pancha-rathas-rebuild.md.
#
# Frame: Blender, origin = anchor, X east, Y north, Z up. Each ratha is built
# in its own frame (front = -X, long axis = Y) under an empty placed at its
# centroid and turned by ROW_ROT, the bearing of the row (Dharmaraja -> Draupadi
# runs 35.2 deg east of north as mapped).

ROW_ROT_DEG = -35.2

POS = {
    "draupadi":   (14.4, 6.3),     # OSM way 576022681 centroid
    "arjuna":     (9.7, 1.6),      # way 576022684
    "bhima":      (2.5, -11.3),    # way 576022690
    "dharmaraja": (-8.8, -26.6),   # way 576022688
    "nakula":     (-2.9, 4.6),     # way 576022679 (osm.json centre)
    "elephant":   (-21.4, -2.0),   # assumed: beside Nakula-Sahadeva, where the first massing model stood it
    "nandi":      (9.1, -22.0),    # assumed: east of Bhima/Dharmaraja, as in the first model
    "lion":       (4.2, 15.5),     # assumed: north-west of Draupadi, as in the first model
}

# Dharmaraja: cited 11 m, three storeys, 8.5 m square. Stack read from
# dsc00039 (plinth 1.22 m read; the finial is lost, the dome is the apex).
DHARMARAJA = {
    "name": "dharmaraja", "cx": 0.0, "cy": 0.0, "faces_east": False, "height": 11.0,
    "platform": {"w": 9.8, "h": 1.2},
    "talas": [
        {"w": 8.8, "top": 4.7,  "eave": 5.2,  "hara": 5.8,  "kudus": 5, "hara_pattern": "KPSPK", "pilasters": 4},
        {"w": 6.3, "top": 6.35, "eave": 6.72, "hara": 7.33, "kudus": 3, "hara_pattern": "KSK",   "pilasters": 3},
        {"w": 4.3, "top": 7.65, "eave": 7.94, "hara": 8.92, "kudus": 3, "hara_pattern": "KSK",   "pilasters": 2},
    ],
    "griva": {"w": 1.8, "top": 9.41}, "dome": {"w": 2.3, "top": 10.95}, "lion_bases": True,
}

# Arjuna: cited 6.1 m, two storeys, 3.5 x 4.9 m, octagonal dome (no finial). Stack read from wus01904.
ARJUNA = {
    "name": "arjuna", "cx": 0.0, "cy": 0.0, "faces_east": False, "height": 6.1,
    "platform": {"w": 5.6, "h": 0.45},
    "talas": [
        {"w": 4.2, "top": 2.1,  "eave": 2.35, "hara": 3.0,  "kudus": 3, "hara_pattern": "KSK", "pilasters": 3},
        {"w": 2.7, "top": 3.75, "eave": 4.32, "hara": 5.07, "kudus": 3, "hara_pattern": "KK",  "pilasters": 2},
    ],
    "griva": {"w": 1.0, "top": 5.33}, "dome": {"w": 1.5, "top": 6.05}, "lion_bases": True,
}

# Bhima: cited 7.6 m over two floors, 12.8 x 7.3 m, wagon-vault roof. Stack read
# from the-pancha-rathas-on-a-bright-sunny-day-2025 (plinth 0.41 read).
BHIMA = {
    "L": 12.8, "W": 7.3, "height": 7.6, "plinth_h": 0.4,
    "ground_top": 2.7, "eave1": 3.11, "hara_h": 0.73, "upper_top": 4.7, "eave2": 5.15,
    "upper_w_ratio": 0.74, "upper_l_ratio": 0.82,
    "pillars_long": 5, "pillars_short": 3, "kudus_long": 7, "kudus_short": 4,
    "hara_long": "PSPSP", "hara_short": "SS", "ridge_finials": 9,
}

# Nakula-Sahadeva: Fergusson & Burgess 1880 p. 135 — 18 x 11 ft, about 16 ft:
# 5.49 x 3.35 x 4.88 m. Eave lines read from n-tn-c54 (a close, low frame;
# its upper storey is foreshortened, so eave2 is the least certain number here).
# Front toward the north (Fergusson) — Longhurst says south; unresolved, declared.
NAKULA = {
    "L": 5.49, "W": 3.35, "height": 4.88, "plinth_h": 0.4,
    "ground_top": 2.3, "eave1": 2.75, "upper_top": 3.15, "eave2": 3.45, "upper_ratio": 0.8,
    "pilasters_long": 3, "pilasters_short": 2, "kudus_long": 4, "kudus_short": 2,
}

# Draupadi: cited 5.5 m, single cell, curvilinear hut roof, the roof springing at
# 2.9 m (read); plan 3.4 m square from the width/height ratio read in the same frame.
DRAUPADI = {"W": 3.4, "height": 5.5, "plinth_h": 0.3, "wall_top": 2.9, "kalasha_h": 0.15}

# The animals: monolithic, roughly life-size. The elephant stands about level
# with Arjuna's colonnade top (ratio read); lengths are assumptions.
ANIMALS = {"elephant_len": 4.5, "nandi_len": 2.4, "lion_len": 2.2}

# The rock: a low slab under the four in the row, extent NOT surveyed.
ROCK = {"cx": 2.5, "cy": -10.0, "w": 14.0, "d": 46.0, "h": 0.4}
