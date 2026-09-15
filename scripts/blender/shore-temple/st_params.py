# Parameters of the Shore Temple reconstruction, in metres.
#
# COPIED FROM data/research/3d/shore-temple-proportions.json (the provenance:
# which photograph each number was read from, and with what uncertainty) and
# from data/research/3d/shore-temple-prakara.geojson (the OSM compound wall).
# Edit the JSON and this copy together; the JSON is the record, this is the
# build input. Everything not marked "read" or "cited" is an ASSUMPTION and is
# declared as such in 06-shore-temple-rebuild.md.
#
# Frame here is Blender's: X = along the compound's long axis, +X toward the
# sea (ESE); Y = across it, +Y the north-ish side; Z up; origin = compound
# centre at court level. The root is rotated to the surveyed bearing before
# export (PRAKARA["bearing_deg"]).

PRAKARA = {
    "long_m": 46.3, "short_m": 21.6, "bearing_deg": 105.2,   # OSM way 370135158, min-area rectangle (measured)
    "wall_h": 2.0, "wall_t": 0.8, "coping_h": 0.25, "coping_w": 1.0,   # assumption: read as ~2 m from the north-face photograph against a 1 m bull
    "gate_w": 2.6,   # openings at the centre of the east and west walls (plan: relationships only)
}

# Kshatriyasimhesvara, the tall east-facing vimana. Heights are above court,
# read from shore-temple-mamallapuram-d150f51.jpg (PD) through the cited 18 m,
# plinth 1.2 m assumed. Widths are the eave slabs read from
# front-view-mahabalipuram.jpg; the aditala is hidden there and is
# EXTRAPOLATED from the tala-2/tala-3 ratio.
EAST = {
    "name": "kshatriyasimhesvara", "cx": 10.0, "cy": 0.0, "faces_east": True,
    "height": 18.0,                       # cited (court to kalasha tip, by definition)
    "platform": {"w": 15.0, "h": 1.2},    # cited 15 m square platform; height assumed
    "talas": [
        # w = wall width, top = top of wall, eave = top of the kapota, hara = top of the parapet shrines
        {"w": 10.4, "top": 5.0,  "eave": 5.54,  "hara": 7.39,  "kudus": 7, "hara_pattern": "KPSPK", "pilasters": 6},   # w extrapolated
        {"w": 8.3,  "top": 7.1,  "eave": 7.59,  "hara": 8.96,  "kudus": 5, "hara_pattern": "KPSPK", "pilasters": 4},
        {"w": 6.7,  "top": 8.7,  "eave": 9.13,  "hara": 10.49, "kudus": 5, "hara_pattern": "KSK",   "pilasters": 4},
        {"w": 4.2,  "top": 10.3, "eave": 10.74, "hara": 11.98, "kudus": 3, "hara_pattern": "KSK",   "pilasters": 2},
        {"w": 3.25, "top": 11.9, "eave": 12.35, "hara": 13.42, "kudus": 3, "hara_pattern": "KSK",   "pilasters": 2},
    ],
    "griva": {"w": 1.29, "top": 14.93},   # width read; top = dome base (read)
    "dome": {"w": 1.67, "top": 16.32},    # octagonal shikhara, read
    "lion_bases": True,
}

# Rajasimhesvara, the smaller west-facing shrine. Apex and two eave lines read
# from the same PD frame (12.67 m); read as THREE storeys (aditala + two) —
# the literature has both dvitala and tritala; this is what the photograph shows.
WEST = {
    "name": "rajasimhesvara", "cx": -11.5, "cy": 0.0, "faces_east": False,
    "height": 12.67,
    "platform": {"w": 9.6, "h": 1.2},     # assumption: a plinth proportionate to the tall tower's
    "talas": [
        {"w": 7.6, "top": 3.7, "eave": 4.17, "hara": 5.6,  "kudus": 5, "hara_pattern": "KPSPK", "pilasters": 4},
        {"w": 5.4, "top": 6.3, "eave": 6.78, "hara": 8.0,  "kudus": 3, "hara_pattern": "KSK",   "pilasters": 2},
        {"w": 3.4, "top": 8.6, "eave": 9.05, "hara": 9.7,  "kudus": 3, "hara_pattern": "KSK",   "pilasters": 2},
    ],
    "griva": {"w": 1.1, "top": 10.12},    # top = dome base (read)
    "dome": {"w": 1.45, "top": 11.4},     # assumption: same dome/kalasha proportion as the tall tower
    "lion_bases": True,
}

# The towerless Vishnu (Anantasayana) shrine between them: a flat-roofed cell.
# Its tower is recorded as missing; size is an assumption fitted between the
# two plinths.
VISHNU = {"cx": -2.3, "cy": 0.0, "w": 5.2, "d": 6.6, "wall_top": 4.3, "eave": 4.8, "parapet": 5.5, "platform": {"w": 6.4, "d": 7.8, "h": 1.2}, "pilasters": 3, "kudus": 5}

# Nandis along the coping: ratios read from the bulls and aerial photographs.
NANDI = {"h": 1.0, "len_over_h": 1.9, "spacing_over_len": 1.1}

# The stepped tank outside the west wall, with its well and pillar and the
# small shrine beside it. Position read from the aerial and the PD frame;
# sizes are assumptions scaled from the compound's short side (ratio 0.42).
TANK = {"cx": -30.0, "cy": -2.5, "w": 9.0, "d": 6.2, "depth": 1.6, "steps": 3, "rim_w": 0.5, "rim_h": 0.35, "well_r": 0.8, "pillar_h": 2.6}
MINI_SHRINE = {"cx": -27.0, "cy": 5.5, "size": 2.3}

# Stone colour: chromaticity measured from 145 photographs (05-shore-temple-
# photogrammetry.md); the three luminance levels are chosen.
GRANITE = {"dark": (0.2522, 0.1909, 0.1363), "mid": (0.3152, 0.2387, 0.1703), "light": (0.3720, 0.2816, 0.2010)}
