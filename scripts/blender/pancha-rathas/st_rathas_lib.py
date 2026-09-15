# Generators for the Pancha Rathas reconstruction — Blender 5.2, bpy + bmesh.
#
# exec'd AFTER scripts/blender/shore-temple/st_lib.py in the worker (it reuses
# obj(), bm_box, bm_ring_loft, bm_lathe, bm_prism, along_face, corners, shared(),
# build_kudu, build_pilaster, build_lionbase, build_kuta, build_sala,
# build_panjara, build_nandi, build_kalasha, mk_vimana, granite_material,
# assign, apex_of, scale_to_apex). Numbers come from st_rathas_params.py. See
# data/research/3d/07-pancha-rathas-rebuild.md.
#
# Local frame: origin = the pancha-rathas anchor (OSM compound centre), Z up,
# X east, Y north. Each ratha is built at its own origin under an empty that is
# then placed at the ratha's OSM centroid and turned to the row's bearing, so
# the generators only ever think in "front", "long side", "up".

import bpy, bmesh, math
from mathutils import Vector

def bm_half_lathe(bm, profile, segments, cx=0.0, cy=0.0, start=0.0):
    """Half a lathe: rings sweep `segments` steps over a half turn from `start`
    (radians). Open at the cut — the caller closes it against a prism."""
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((cx, cy, z))])
        else:
            rings.append([bm.verts.new((cx + r * math.cos(start + math.pi * i / segments),
                                        cy + r * math.sin(start + math.pi * i / segments), z)) for i in range(segments + 1)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1:
            for i in range(segments):
                bm.faces.new((a[0], b[i + 1], b[i]))
        elif len(b) == 1:
            for i in range(segments):
                bm.faces.new((a[i], a[i + 1], b[0]))
        else:
            for i in range(segments):
                bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    return rings

def bm_vault(bm, L, w, z0, h, segs=6, ends=True):
    """A barrel vault along X of length L, width w, springing at z0, rise h."""
    pts = [(-w / 2, 0.0), (w / 2, 0.0)]
    for i in range(1, segs):
        a = math.pi * i / segs
        pts.append((w / 2 * math.cos(a), h * math.sin(a)))
    va = [bm.verts.new((-L / 2, y, z0 + z)) for y, z in pts]
    vb = [bm.verts.new((L / 2, y, z0 + z)) for y, z in pts]
    if ends:
        bm.faces.new(list(reversed(va)))
        bm.faces.new(vb)
    m = len(pts)
    for i in range(m):
        bm.faces.new((va[i], va[(i + 1) % m], vb[(i + 1) % m], vb[i]))

def eave_ring(bm, w, d, z, eh, ov, cx=0.0, cy=0.0):
    bm_ring_loft(bm, w, d, [(0.0, z), (ov * 0.35, z + eh * 0.12), (ov * 0.8, z + eh * 0.45),
                            (ov, z + eh * 0.72), (ov * 0.9, z + eh), (ov * 0.55, z + eh), (0.0, z + eh)], cx, cy)

def pilasters(parent, prefix, hx, hy, z0, h, n_long, n_short, mats, lion_corners=True, scale=0.75):
    pil = shared("stm_pilaster", build_pilaster)
    lion = shared("stm_lionbase", build_lionbase)
    obs = []
    for face in "SNEW":
        n = n_long if face in "SN" else n_short
        if n <= 0:
            continue
        for k, (px, py, rz) in enumerate(along_face(face, hx, hy, 0.0, 0.0, n, inset=0.35)):
            use_lion = lion_corners and k in (0, n - 1)
            p = obj("%s_pil_%s%d" % (prefix, face, k), lion if use_lion else pil, parent,
                    loc=(px, py, z0), rot=(0, 0, rz), scale=(scale * (1.2 if use_lion else 1.0), scale * (1.2 if use_lion else 1.0), h))
            assign(p, mats["dark"])
            obs.append(p)
    return obs

def kudus_on(parent, prefix, hx, hy, z, size, n_long, n_short, mats):
    kudu = shared("stm_kudu", build_kudu)
    obs = []
    for face in "SNEW":
        n = n_long if face in "SN" else n_short
        for k, (px, py, rz) in enumerate(along_face(face, hx, hy, 0.0, 0.0, n, inset=0.25)):
            p = obj("%s_kudu_%s%d" % (prefix, face, k), kudu, parent, loc=(px, py, z), rot=(0, 0, rz), scale=(size, size, size))
            assign(p, mats["light"])
            obs.append(p)
    return obs

def hara_ring(parent, prefix, hx, hy, z, h, pattern_long, pattern_short, mats):
    """Miniature-shrine parapet on a roof edge: kutas at the corners, the
    pattern letters between (S sala, P panjara, K kuta)."""
    kuta = shared("stm_kuta", build_kuta)
    sala = shared("stm_sala", build_sala)
    panj = shared("stm_panjara", build_panjara)
    obs = []
    kw = min(h * 1.0, 1.4)
    for k, (px, py) in enumerate(corners(hx, hy, 0.0, 0.0, inset=kw / 2)):
        p = obj("%s_kuta_%d" % (prefix, k), kuta, parent, loc=(px, py, z), scale=(kw, kw, h))
        assign(p, mats["mid"])
        obs.append(p)
    for face in "SNEW":
        inner = pattern_long if face in "SN" else pattern_short
        if not inner:
            continue
        for k, (px, py, rz) in enumerate(along_face(face, hx, hy, 0.0, 0.0, len(inner), inset=kw, out=-kw * 0.5)):
            ch = inner[k]
            if ch == "S":
                p = obj("%s_sala_%s%d" % (prefix, face, k), sala, parent, loc=(px, py, z), rot=(0, 0, rz + math.pi / 2), scale=(1.5 * h, kw * 0.9, h * 0.95))
            elif ch == "K":
                p = obj("%s_kuta_%s%d" % (prefix, face, k), kuta, parent, loc=(px, py, z), scale=(kw * 0.9, kw * 0.9, h * 0.9))
            else:
                p = obj("%s_panj_%s%d" % (prefix, face, k), panj, parent, loc=(px, py, z), rot=(0, 0, rz), scale=(kw * 0.8, kw * 0.8, h * 0.85))
            assign(p, mats["mid"])
            obs.append(p)
    return obs

# ---------------------------------------------------------------- Bhima: the sala ratha
def mk_sala_ratha(parent, S, mats):
    """Oblong, two storeys, barrel-vaulted 'wagon' roof with gable ends. Long
    axis along local Y (the row). Ground storey: an open colonnade round a
    walled core; upper storey: a smaller block under the vault, a hara of
    kudus at its foot, kalasha finials along the ridge."""
    obs = []
    L, W = S["L"], S["W"]              # plan, long along Y
    z0 = S["plinth_h"]
    g_top, eave1, up_top, eave2, ridge = S["ground_top"], S["eave1"], S["upper_top"], S["eave2"], S["height"]
    bm = bmesh.new()
    # core wall (inside the colonnade)
    bm_box(bm, -W / 2 + 0.9, W / 2 - 0.9, -L / 2 + 0.9, L / 2 - 0.9, z0, g_top)
    # floor slab between plinth and colonnade
    bm_box(bm, -W / 2, W / 2, -L / 2, L / 2, z0, z0 + 0.12)
    ob = obj("st_bhima_core", mesh_from_bm("stm_bhima_core", bm), parent)
    assign(ob, mats["mid"])
    obs.append(ob)
    # the colonnade: lion-based pillars along both long sides, plain at the ends
    obs += pilasters(parent, "st_bhima", W / 2 - 0.35, L / 2 - 0.35, z0 + 0.12, g_top - z0 - 0.12, S["pillars_long"], S["pillars_short"], mats, True, 1.0)
    # eave 1 with kudus
    bm = bmesh.new()
    eave_ring(bm, W, L, g_top, eave1 - g_top, 0.55)
    ob = obj("st_bhima_kapota1", mesh_from_bm("stm_bhima_kapota1", bm), parent)
    assign(ob, mats["light"])
    obs.append(ob)
    eh = eave1 - g_top
    obs += kudus_on(parent, "st_bhima_e1", W / 2 + 0.5, L / 2 + 0.5, g_top + eh * 0.25, min(0.8, eh * 1.6), S["kudus_long"], S["kudus_short"], mats)
    # hara on the ground storey's roof edge
    obs += hara_ring(parent, "st_bhima_h1", W / 2 + 0.3, L / 2 + 0.3, eave1, S["hara_h"], S["hara_long"], S["hara_short"], mats)
    # upper storey block and its eave
    uw, ul = W * S["upper_w_ratio"], L * S["upper_l_ratio"]
    bm = bmesh.new()
    bm_box(bm, -uw / 2, uw / 2, -ul / 2, ul / 2, eave1, up_top)
    ob = obj("st_bhima_upper", mesh_from_bm("stm_bhima_upper", bm), parent)
    assign(ob, mats["light"])
    obs.append(ob)
    obs += pilasters(parent, "st_bhima_u", uw / 2, ul / 2, eave1, up_top - eave1, S["pillars_long"] - 1, 2, mats, False, 0.55)
    bm = bmesh.new()
    eave_ring(bm, uw, ul, up_top, eave2 - up_top, 0.45)
    ob = obj("st_bhima_kapota2", mesh_from_bm("stm_bhima_kapota2", bm), parent)
    assign(ob, mats["light"])
    obs.append(ob)
    eh2 = eave2 - up_top
    obs += kudus_on(parent, "st_bhima_e2", uw / 2 + 0.4, ul / 2 + 0.4, up_top + eh2 * 0.25, min(0.7, eh2 * 1.6), S["kudus_long"] - 1, 2, mats)
    # the vault: along Y, so build along X and rotate the object
    vw = uw * 0.92
    vh = ridge - eave2 - 0.25
    bm = bmesh.new()
    bm_vault(bm, ul * 0.98, vw, 0.0, vh, 7, True)
    # gable "nasi" arches at both ends: a kudu-shaped face on each gable
    ob = obj("st_bhima_vault", mesh_from_bm("stm_bhima_vault", bm), parent, loc=(0, 0, eave2), rot=(0, 0, math.pi / 2))
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    assign(ob, mats["mid"])
    obs.append(ob)
    kudu = shared("stm_kudu", build_kudu)
    for sy, rz in ((-1, math.pi), (1, 0.0)):
        p = obj("st_bhima_gable_%d" % (sy + 1), kudu, parent, loc=(0.0, sy * (ul * 0.49), eave2 + 0.05), rot=(0, 0, rz + math.pi), scale=(vw * 0.85, vw * 0.85, vh * 0.95))
        assign(p, mats["light"])
        obs.append(p)
    # kalasha finials along the ridge
    kal = shared("stm_kalasha", build_kalasha)
    n = S["ridge_finials"]
    for i in range(n):
        y = -ul * 0.42 + (ul * 0.84) * (i + 0.5) / n
        p = obj("st_bhima_finial_%d" % i, kal, parent, loc=(0.0, y, eave2 + vh - 0.02), scale=(0.25, 0.25, 0.27))
        assign(p, mats["dark"])
        obs.append(p)
    return obs

# ---------------------------------------------------------------- Nakula-Sahadeva: the apsidal ratha
def mk_apsidal_ratha(parent, S, mats):
    """Gajaprishtha ('elephant-backed'): a rectangle with a semicircular rear,
    two storeys, the roof a barrel vault that turns into a half-dome over the
    apse. Front faces +Y; the apse is at -Y."""
    obs = []
    L, W = S["L"], S["W"]
    z0 = S["plinth_h"]
    g_top, eave1, up_top, eave2, ridge = S["ground_top"], S["eave1"], S["upper_top"], S["eave2"], S["height"]
    r = W / 2
    rect = L - r                  # straight part along Y, from -(L/2 - r) to +L/2 ... apse centre at y = -(L/2 - r)
    yc = -(L / 2 - r)             # apse centre
    def body(bm, hw, hl_front, zlo, zhi):
        # rectangle from y = yc to y = hl_front, plus half-cylinder of radius hw about (0, yc) toward -Y
        bm_box(bm, -hw, hw, yc, hl_front, zlo, zhi)
        rings = bm_half_lathe(bm, [(hw, zlo), (hw, zhi)], 8, 0.0, yc, math.pi)   # from +X round through -Y to -X
        # close the half-cylinder's flat top/bottom halves
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[1])
    bm = bmesh.new()
    body(bm, r, L / 2, z0, g_top)
    ob = obj("st_nakula_ground", mesh_from_bm("stm_nakula_ground", bm), parent)
    assign(ob, mats["mid"])
    obs.append(ob)
    obs += pilasters(parent, "st_nakula", r, L / 2, z0, g_top - z0, S["pilasters_long"], S["pilasters_short"], mats, True, 0.6)
    # eave 1: an apsidal eave, done as the body slightly larger and thin
    bm = bmesh.new()
    body(bm, r + 0.4, L / 2 + 0.4, g_top, eave1)
    ob = obj("st_nakula_kapota1", mesh_from_bm("stm_nakula_kapota1", bm), parent)
    assign(ob, mats["light"])
    obs.append(ob)
    obs += kudus_on(parent, "st_nakula_e1", r + 0.35, L / 2 + 0.35, g_top + (eave1 - g_top) * 0.25, 0.6, S["kudus_long"], S["kudus_short"], mats)
    # upper storey, smaller apsidal body
    k = S["upper_ratio"]
    bm = bmesh.new()
    body(bm, r * k, L / 2 * k + yc * (1 - k), eave1, up_top)
    ob = obj("st_nakula_upper", mesh_from_bm("stm_nakula_upper", bm), parent)
    assign(ob, mats["light"])
    obs.append(ob)
    bm = bmesh.new()
    body(bm, r * k + 0.3, L / 2 * k + yc * (1 - k) + 0.3, up_top, eave2)
    ob = obj("st_nakula_kapota2", mesh_from_bm("stm_nakula_kapota2", bm), parent)
    assign(ob, mats["light"])
    obs.append(ob)
    # the roof: vault along Y over the straight part, half-dome over the apse
    vw = 2 * r * k * 0.95
    vh = ridge - eave2
    front = L / 2 * k + yc * (1 - k)
    bm = bmesh.new()
    straight = front - yc
    bm_vault(bm, straight, vw, 0.0, vh, 7, True)
    ob = obj("st_nakula_vault", mesh_from_bm("stm_nakula_vault", bm), parent, loc=(0.0, yc + straight / 2, eave2), rot=(0, 0, math.pi / 2))
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    assign(ob, mats["mid"])
    obs.append(ob)
    bm = bmesh.new()
    prof = [(vw / 2 * math.cos(a), vh * math.sin(a)) for a in [math.pi * i / 14 for i in range(0, 8)]]   # quarter circle from rim to top
    bm_half_lathe(bm, [(pr, pz) for pr, pz in prof], 8, 0.0, yc, math.pi)
    ob = obj("st_nakula_apse_dome", mesh_from_bm("stm_nakula_apse_dome", bm), parent, loc=(0.0, 0.0, eave2))
    for p in ob.data.polygons:
        p.use_smooth = True
    assign(ob, mats["mid"])
    obs.append(ob)
    kudu = shared("stm_kudu", build_kudu)
    p = obj("st_nakula_gable", kudu, parent, loc=(0.0, front, eave2 + 0.03), rot=(0, 0, math.pi), scale=(vw * 0.8, vw * 0.8, vh * 0.9))
    assign(p, mats["light"])
    obs.append(p)
    kal = shared("stm_kalasha", build_kalasha)
    for i, y in enumerate((front - 0.5, (front + yc) / 2, yc + 0.3)):
        p = obj("st_nakula_finial_%d" % i, kal, parent, loc=(0.0, y, eave2 + vh - 0.02), scale=(0.2, 0.2, 0.22))
        assign(p, mats["dark"])
        obs.append(p)
    return obs

# ---------------------------------------------------------------- Draupadi: the hut
def mk_hut_ratha(parent, S, mats):
    """A square cell under a curvilinear four-sided thatch-form roof, one
    kalasha. Faces +X (west in the row's own frame is handled by the parent)."""
    obs = []
    w = S["W"]
    z0 = S["plinth_h"]
    wall_top, height = S["wall_top"], S["height"]
    bm = bmesh.new()
    bm_box(bm, -w / 2, w / 2, -w / 2, w / 2, z0, wall_top)
    # the door on the front face and the four corner pilasters as thin strips
    bm_box(bm, -w / 2 - 0.02, -w / 2 + 0.25, -0.55, 0.55, z0, z0 + (wall_top - z0) * 0.72)
    ob = obj("st_draupadi_cell", mesh_from_bm("stm_draupadi_cell", bm), parent)
    assign(ob, mats["mid"])
    obs.append(ob)
    obs += pilasters(parent, "st_draupadi", w / 2, w / 2, z0, wall_top - z0, 2, 2, mats, False, 0.55)
    # a thin cornice, then the roof: square rings with a bell curve
    bm = bmesh.new()
    bm_ring_loft(bm, w, w, [(0.0, wall_top), (0.25, wall_top + 0.12), (0.3, wall_top + 0.3), (0.05, wall_top + 0.36)])
    rh = height - (wall_top + 0.36) - S["kalasha_h"]
    prof = []
    n = 7
    for i in range(n + 1):
        t = i / n
        # outset shrinks from +0.3 to -w/2 (a point) along an eased curve
        o = 0.3 - (w / 2 + 0.3) * (1 - (1 - t) ** 2.2)
        prof.append((o, wall_top + 0.36 + rh * t))
    prof[-1] = (-w / 2 + 0.02, wall_top + 0.36 + rh)
    bm_ring_loft(bm, w, w, prof)
    ob = obj("st_draupadi_roof", mesh_from_bm("stm_draupadi_roof", bm), parent)
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    assign(ob, mats["light"])
    obs.append(ob)
    kal = shared("stm_kalasha", build_kalasha)
    p = obj("st_draupadi_kalasha", kal, parent, loc=(0.0, 0.0, wall_top + 0.36 + rh), scale=(S["kalasha_h"] * 0.5, S["kalasha_h"] * 0.5, S["kalasha_h"]))
    assign(p, mats["dark"])
    obs.append(p)
    return obs

# ---------------------------------------------------------------- the animals
def build_elephant(bm):
    """A standing elephant, 1 unit long (X, head at +X), ~0.62 tall. Low-poly."""
    def ell(cx, cy, cz, rx, ry, rz, seg=8, rings=5):
        r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
        for v in r["verts"]:
            v.co = Vector((cx + v.co.x * rx, cy + v.co.y * ry, cz + v.co.z * rz))
    ell(-0.08, 0.0, 0.4, 0.36, 0.2, 0.2)          # body
    ell(0.32, 0.0, 0.46, 0.15, 0.14, 0.14, 8, 5)  # head
    for s in (-1, 1):
        bm_box(bm, 0.24, 0.32, s * 0.16, s * 0.16 + s * 0.09, 0.3, 0.55)   # ears
        bm_lathe(bm, [(0.0, 0.0), (0.03, 0.0), (0.0, 0.14)], 5, 0.44, s * 0.06)  # tusks, pointing... (short cones)
    # trunk: a chain of shrinking spheres curving down
    for i in range(6):
        t = i / 5
        ell(0.46 + 0.06 * t, 0.0, 0.42 - 0.36 * t, 0.06 - 0.03 * t, 0.06 - 0.03 * t, 0.07, 6, 3)
    for sx in (-0.2, 0.16):
        for sy in (-0.11, 0.11):
            bm_lathe(bm, [(0.075, 0.0), (0.07, 0.24), (0.075, 0.25)], 6, sx, sy)   # legs

def build_lion(bm):
    """A seated lion, 1 unit long (X, head at +X), ~0.75 tall."""
    def ell(cx, cy, cz, rx, ry, rz, seg=8, rings=5):
        r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
        for v in r["verts"]:
            v.co = Vector((cx + v.co.x * rx, cy + v.co.y * ry, cz + v.co.z * rz))
    ell(-0.12, 0.0, 0.3, 0.32, 0.18, 0.24)        # haunches and body
    ell(0.18, 0.0, 0.48, 0.18, 0.16, 0.18)        # chest/shoulders
    ell(0.3, 0.0, 0.62, 0.17, 0.16, 0.16)         # mane
    ell(0.38, 0.0, 0.62, 0.1, 0.08, 0.09, 6, 4)   # face
    for s in (-1, 1):
        bm_box(bm, 0.22, 0.42, s * 0.1 - 0.05, s * 0.1 + 0.05, 0.0, 0.42)   # forelegs, straight
    bm_box(bm, -0.42, 0.44, -0.2, 0.2, 0.0, 0.06)   # the block

def mk_animal(parent, name, builder, mesh_name, length, height_unit, mat):
    me = shared(mesh_name, builder)
    p = obj(name, me, parent, scale=(length, length, length))
    assign(p, mat)
    return p

# ---------------------------------------------------------------- the rock
def mk_rock(parent, R, mats):
    """The exposed granite the rathas were cut from, as a low rounded slab.
    Extent is NOT surveyed: it is drawn to just enclose the five."""
    bm = bmesh.new()
    bm_ring_loft(bm, R["w"], R["d"], [(0.0, -0.3), (0.35, 0.1), (0.4, R["h"] * 0.6), (0.15, R["h"])], R["cx"], R["cy"])
    ob = obj("st_rock", mesh_from_bm("stm_rock", bm), parent)
    for p in ob.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    assign(ob, mats["dark"])
    return [ob]
