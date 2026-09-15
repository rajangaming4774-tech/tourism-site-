# Generator library for the Shore Temple reconstruction — Blender 5.2, bpy + bmesh.
#
# Sent to the cloud Blender worker as bpy.data.texts["st_lib.py"] and exec()'d
# by every build mutation; kept here so the build is reproducible. Reads its
# numbers from st_params.py (also a text datablock). See
# data/research/3d/06-shore-temple-rebuild.md for what each part is and is not.
#
# Conventions: mesh datablocks "stm_*", objects "st_*", everything parented to
# the empty "ShoreTemple". Repeated parts (kudus, pilasters, hara shrines,
# nandis) are LINKED DUPLICATES of one mesh until the join step. Blender is
# Z-up; +X is the compound's long axis toward the sea.

import bpy, bmesh, math
from mathutils import Vector

# ---------------------------------------------------------------- basics
def coll():
    return bpy.context.scene.collection

def mesh_from_bm(name, bm):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return me

def obj(name, me, parent=None, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    ob = bpy.data.objects.new(name, me)
    coll().objects.link(ob)
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = scale
    if parent is not None:
        ob.parent = parent
    return ob

def bm_box(bm, x0, x1, y0, y1, z0, z1):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        v.co.x = x0 if v.co.x < 0 else x1
        v.co.y = y0 if v.co.y < 0 else y1
        v.co.z = z0 if v.co.z < 0 else z1
    return r["verts"]

def bm_ring_loft(bm, w, d, profile, cx=0.0, cy=0.0):
    """profile: [(outset, z), ...] rings around a w x d rectangle, capped."""
    rings = []
    for o, z in profile:
        hx, hy = w / 2 + o, d / 2 + o
        rings.append([bm.verts.new((cx - hx, cy - hy, z)), bm.verts.new((cx + hx, cy - hy, z)),
                      bm.verts.new((cx + hx, cy + hy, z)), bm.verts.new((cx - hx, cy + hy, z))])
    for a, b in zip(rings, rings[1:]):
        for i in range(4):
            bm.faces.new((a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]))
    bm.faces.new(tuple(reversed(rings[0])))
    bm.faces.new(tuple(rings[-1]))

def bm_lathe(bm, profile, segments, cx=0.0, cy=0.0, phase=0.0):
    """profile: [(r, z), ...] from bottom to top; r == 0 makes a pole."""
    rings = []
    for r, z in profile:
        if r <= 1e-6:
            rings.append([bm.verts.new((cx, cy, z))])
        else:
            rings.append([bm.verts.new((cx + r * math.cos(phase + 2 * math.pi * i / segments),
                                        cy + r * math.sin(phase + 2 * math.pi * i / segments), z)) for i in range(segments)])
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1:
            for i in range(segments):
                bm.faces.new((a[0], b[(i + 1) % segments], b[i]))
        elif len(b) == 1:
            for i in range(segments):
                bm.faces.new((a[i], a[(i + 1) % segments], b[0]))
        else:
            for i in range(segments):
                bm.faces.new((a[i], a[(i + 1) % segments], b[(i + 1) % segments], b[i]))
    if len(rings[0]) > 1:
        bm.faces.new(tuple(reversed(rings[0])))
    if len(rings[-1]) > 1:
        bm.faces.new(tuple(rings[-1]))

def bm_prism(bm, pts, y0, y1):
    """A polygon in the XZ plane, extruded along Y from y0 to y1. Front = -Y."""
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n):
        bm.faces.new((a[i], b[i], b[(i + 1) % n], a[(i + 1) % n]))

def along_face(face, hx, hy, cx, cy, n, inset=0.0, out=0.0):
    """n positions evenly spaced along one face of a rectangle, with the rotation
    that turns a -Y-facing element outward. Faces: S (-Y), N (+Y), E (+X), W (-X)."""
    if face in "SN":
        L = 2 * (hx - inset)
        xs = [cx - (hx - inset) + L * (i + 0.5) / n for i in range(n)]
        y = cy - hy - out if face == "S" else cy + hy + out
        return [(x, y, 0.0 if face == "S" else math.pi) for x in xs]
    L = 2 * (hy - inset)
    ys = [cy - (hy - inset) + L * (i + 0.5) / n for i in range(n)]
    x = cx + hx + out if face == "E" else cx - hx - out
    return [(x, y, math.pi / 2 if face == "E" else -math.pi / 2) for y in ys]

def corners(hx, hy, cx, cy, inset=0.0):
    return [(cx - hx + inset, cy - hy + inset), (cx + hx - inset, cy - hy + inset),
            (cx + hx - inset, cy + hy - inset), (cx - hx + inset, cy + hy - inset)]

def tri_count(obs):
    n = 0
    for ob in obs:
        if ob.type == "MESH":
            n += sum(len(p.vertices) - 2 for p in ob.data.polygons)
    return n

# ---------------------------------------------------------------- shared parts
_SHARED = {}

def shared(name, builder):
    """One mesh datablock per part name; builder(bm) fills a unit-scale bmesh."""
    if name in _SHARED and _SHARED[name].users >= 0 and _SHARED[name].name in bpy.data.meshes:
        return _SHARED[name]
    bm = bmesh.new()
    builder(bm)
    me = mesh_from_bm(name, bm)
    _SHARED[name] = me
    return me

def build_kudu(bm):
    """A horseshoe (kudu) arch, 1 m wide x 1 m tall, front at -Y, 0.22 deep."""
    pts = [(-0.5, 0.0), (0.5, 0.0), (0.5, 0.35)]
    for i in range(1, 8):
        a = math.pi * i / 8
        pts.append((0.5 * math.cos(a), 0.35 + 0.55 * math.sin(a)))
    pts.append((-0.5, 0.35))
    bm_prism(bm, pts, -0.22, 0.0)
    # the finial knob
    bm_box(bm, -0.08, 0.08, -0.16, 0.0, 0.86, 1.0)

def build_pilaster(bm):
    """A pilaster 1 unit tall: shaft, a wider base block and a capital. Front -Y."""
    bm_box(bm, -0.16, 0.16, -0.14, 0.0, 0.0, 0.12)     # base
    bm_box(bm, -0.11, 0.11, -0.11, 0.0, 0.12, 0.84)    # shaft
    bm_box(bm, -0.19, 0.19, -0.15, 0.0, 0.84, 0.92)    # capital
    bm_box(bm, -0.26, 0.26, -0.18, 0.0, 0.92, 1.0)     # corbel

def build_lionbase(bm):
    """Pallava yali/lion column: a seated lion mass under a short shaft. 1 unit tall."""
    bm_box(bm, -0.22, 0.22, -0.2, 0.0, 0.0, 0.08)
    bm_lathe(bm, [(0.0, 0.08), (0.2, 0.14), (0.24, 0.3), (0.2, 0.44), (0.16, 0.52), (0.0, 0.56)], 8, 0.0, -0.1)   # the lion body
    bm_box(bm, -0.12, 0.12, -0.13, 0.0, 0.5, 0.84)     # shaft
    bm_box(bm, -0.24, 0.24, -0.18, 0.0, 0.84, 1.0)     # corbel

def build_kuta(bm):
    """Miniature square shrine, 1 unit wide, 1 unit tall: body, four-sided roof, knob."""
    bm_box(bm, -0.5, 0.5, -0.5, 0.5, 0.0, 0.42)
    bm_ring_loft(bm, 1.0, 1.0, [(0.06, 0.42), (0.06, 0.5), (-0.1, 0.55)])       # eave
    bm_lathe(bm, [(0.0, 0.55), (0.42, 0.55), (0.3, 0.8), (0.12, 0.92), (0.0, 0.92)], 4, phase=math.pi / 4)  # roof
    bm_lathe(bm, [(0.0, 0.92), (0.07, 0.95), (0.05, 0.99), (0.0, 1.0)], 6)

def build_sala(bm):
    """Miniature oblong shrine, 1 unit long (X), 0.6 deep, 1 tall: barrel roof with gable ends."""
    bm_box(bm, -0.5, 0.5, -0.3, 0.3, 0.0, 0.42)
    bm_ring_loft(bm, 1.0, 0.6, [(0.05, 0.42), (0.05, 0.5), (-0.08, 0.54)])
    # barrel vault: half-cylinder along X
    r = 0.3
    n = 6
    pts = [(-0.3, 0.0), (0.3, 0.0)]
    for i in range(1, n):
        a = math.pi * i / n
        pts.append((0.3 * math.cos(a), 0.44 * math.sin(a)))
    # prism along X: reuse bm_prism by swapping axes (build in YZ and rotate)
    verts_a = [bm.verts.new((-0.5, y, 0.54 + z)) for y, z in pts]
    verts_b = [bm.verts.new((0.5, y, 0.54 + z)) for y, z in pts]
    bm.faces.new(list(reversed(verts_a)))
    bm.faces.new(verts_b)
    m = len(pts)
    for i in range(m):
        bm.faces.new((verts_a[i], verts_a[(i + 1) % m], verts_b[(i + 1) % m], verts_b[i]))
    # ridge finials
    for x in (-0.3, 0.0, 0.3):
        bm_lathe(bm, [(0.0, 0.97), (0.05, 0.99), (0.0, 1.03)], 6, x, 0.0)

def build_panjara(bm):
    """Miniature apsidal shrine: a body with a big kudu-shaped front. 0.7 wide, 1 tall, front -Y."""
    bm_box(bm, -0.35, 0.35, -0.3, 0.3, 0.0, 0.4)
    pts = [(-0.34, 0.4), (0.34, 0.4), (0.34, 0.62)]
    for i in range(1, 6):
        a = math.pi * i / 6
        pts.append((0.34 * math.cos(a), 0.62 + 0.36 * math.sin(a)))
    pts.append((-0.34, 0.62))
    bm_prism(bm, pts, -0.3, 0.3)

def build_nandi(bm):
    """A seated bull, 1 unit long (X, head at +X), ~0.53 tall. Low-poly."""
    def ell(cx, cy, cz, rx, ry, rz, seg=8, rings=5):
        r = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
        for v in r["verts"]:
            v.co = Vector((cx + v.co.x * rx, cy + v.co.y * ry, cz + v.co.z * rz))
    ell(-0.05, 0.0, 0.24, 0.42, 0.22, 0.2)        # body
    ell(-0.15, 0.0, 0.42, 0.14, 0.13, 0.1, 6, 4)  # hump
    ell(0.32, 0.0, 0.38, 0.17, 0.12, 0.13, 6, 4)  # head
    ell(0.47, 0.0, 0.33, 0.1, 0.08, 0.07, 6, 3)   # muzzle
    for s in (-1, 1):
        bm_lathe(bm, [(0.0, 0.0), (0.035, 0.0), (0.0, 0.17)], 5, 0.3, s * 0.12)      # horns (vertical-ish)
        bm_box(bm, 0.06, 0.34, s * 0.16 - 0.06, s * 0.16 + 0.06, 0.02, 0.18)        # folded forelegs
    bm_box(bm, -0.5, 0.5, -0.24, 0.24, 0.0, 0.06)   # the block it is cut from

def build_kalasha(bm):
    """Finial, 1 unit tall: base disc, neck, bulb, spike. Radius ~0.2 at the bulb."""
    bm_lathe(bm, [(0.0, 0.0), (0.2, 0.0), (0.22, 0.05), (0.12, 0.12), (0.1, 0.22), (0.19, 0.3), (0.21, 0.4),
                  (0.16, 0.52), (0.07, 0.6), (0.05, 0.75), (0.035, 0.9), (0.0, 1.0)], 12)

# ---------------------------------------------------------------- materials
def granite_material(name, rgb):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Roughness"].default_value = 0.94
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.16
    return m

def assign(ob, mat):
    if ob.type == "MESH":
        if not ob.data.materials:
            ob.data.materials.append(mat)
        else:
            ob.data.materials[0] = mat

# ---------------------------------------------------------------- generators
def mk_platform(root, name, cx, cy, w, d, h, mat, steps_face=None):
    """The moulded plinth (adhishthana): upana, jagati, kumuda, kantha, pattika."""
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.0, 0.22 * h), (-0.12, 0.22 * h), (-0.12, 0.4 * h), (0.06, 0.48 * h), (0.06, 0.62 * h),
            (-0.18, 0.68 * h), (-0.18, 0.86 * h), (0.0, 0.9 * h), (0.0, h)]
    bm_ring_loft(bm, w, d, prof, cx, cy)
    if steps_face:
        # a flight of steps on one face, 2.4 m wide
        hx, hy = w / 2, d / 2
        n = 5
        for i in range(n):
            z0, z1 = h * i / n, h * (i + 1) / n
            run = (n - i) * 0.32
            if steps_face == "E":
                bm_box(bm, cx + hx, cx + hx + run, cy - 1.2, cy + 1.2, z0, z1)
            else:
                bm_box(bm, cx - hx - run, cx - hx, cy - 1.2, cy + 1.2, z0, z1)
    ob = obj(name, mesh_from_bm("stm_" + name, bm), root)
    assign(ob, mat)
    return ob

def mk_vimana(root, spec, mats, grid_ref=None):
    """A Dravidian vimana from a spec (see st_params.py). Returns its objects."""
    obs = []
    cx, cy = spec["cx"], spec["cy"]
    z_base = spec["platform"]["h"]
    talas = spec["talas"]
    pil_me = shared("stm_pilaster", build_pilaster)
    lion_me = shared("stm_lionbase", build_lionbase)
    kudu_me = shared("stm_kudu", build_kudu)
    kuta_me = shared("stm_kuta", build_kuta)
    sala_me = shared("stm_sala", build_sala)
    panj_me = shared("stm_panjara", build_panjara)
    door_face = "E" if spec["faces_east"] else "W"
    z_lo = z_base
    for i, t in enumerate(talas):
        w = t["w"]
        hx = hy = w / 2
        wall_h = t["top"] - z_lo
        bm = bmesh.new()
        bm_box(bm, cx - hx, cx + hx, cy - hy, cy + hy, z_lo, t["top"])
        # the door on the entrance face of the ground storey: a recessed dark slab
        if i == 0:
            dw, dh = 1.4, min(2.6, wall_h * 0.6)
            if door_face == "E":
                bm_box(bm, cx + hx - 0.3, cx + hx + 0.02, cy - dw / 2, cy + dw / 2, z_lo, z_lo + dh)
            else:
                bm_box(bm, cx - hx - 0.02, cx - hx + 0.3, cy - dw / 2, cy + dw / 2, z_lo, z_lo + dh)
        ob = obj("st_%s_tala%d" % (spec["name"], i + 1), mesh_from_bm("stm_%s_tala%d" % (spec["name"], i + 1), bm), root)
        assign(ob, mats["mid"] if i % 2 == 0 else mats["light"])
        obs.append(ob)
        # pilasters, lion bases at the corners of the ground storeys
        n = t.get("pilasters", 0)
        if n:
            for face in "SNEW":
                for k, (px, py, rz) in enumerate(along_face(face, hx, hy, cx, cy, n, inset=0.45, out=0.0)):
                    use_lion = spec.get("lion_bases") and i == 0 and k in (0, n - 1)
                    me = lion_me if use_lion else pil_me
                    s = (0.9 if use_lion else 0.75) * (1.0 if i == 0 else 0.7)
                    p = obj("st_%s_pil_%d_%s%d" % (spec["name"], i + 1, face, k), me, root,
                            loc=(px, py, z_lo), rot=(0, 0, rz), scale=(s, s, wall_h))
                    assign(p, mats["dark"])
                    obs.append(p)
        # the kapota (eave): a curved overhang, then kudus on its face
        ov = max(0.3, min(0.6, 0.055 * w))
        eh = t["eave"] - t["top"]
        bm = bmesh.new()
        bm_ring_loft(bm, w, w, [(0.0, t["top"]), (ov * 0.35, t["top"] + eh * 0.12), (ov * 0.8, t["top"] + eh * 0.45),
                                (ov, t["top"] + eh * 0.72), (ov * 0.9, t["top"] + eh), (ov * 0.55, t["top"] + eh), (0.0, t["top"] + eh)], cx, cy)
        ob = obj("st_%s_kapota%d" % (spec["name"], i + 1), mesh_from_bm("stm_%s_kapota%d" % (spec["name"], i + 1), bm), root)
        assign(ob, mats["light"])
        obs.append(ob)
        ks = max(0.45, min(0.9, eh * 1.6))
        for face in "SNEW":
            for k, (px, py, rz) in enumerate(along_face(face, hx + ov * 0.9, hy + ov * 0.9, cx, cy, t["kudus"], inset=0.3)):
                p = obj("st_%s_kudu_%d_%s%d" % (spec["name"], i + 1, face, k), kudu_me, root,
                        loc=(px, py, t["top"] + eh * 0.25), rot=(0, 0, rz), scale=(ks, ks, ks))
                assign(p, mats["light"])
                obs.append(p)
        # the hara: miniature shrines on the roof edge, on a low harantara strip
        hh = t["hara"] - t["eave"]
        rim_x, rim_y = hx + ov * 0.55, hy + ov * 0.55
        bm = bmesh.new()
        bm_ring_loft(bm, 2 * rim_x, 2 * rim_y, [(0.0, t["eave"]), (0.0, t["eave"] + hh * 0.18)], cx, cy)
        ob = obj("st_%s_harantara%d" % (spec["name"], i + 1), mesh_from_bm("stm_%s_harantara%d" % (spec["name"], i + 1), bm), root)
        assign(ob, mats["dark"])
        obs.append(ob)
        pat = t["hara_pattern"]
        zs = t["eave"] + hh * 0.12
        ks = hh * 0.88
        kw = min(ks * 1.0, 1.6)
        # corners: kutas
        for k, (px, py) in enumerate(corners(rim_x, rim_y, cx, cy, inset=kw / 2)):
            p = obj("st_%s_kuta_%d_%d" % (spec["name"], i + 1, k), kuta_me, root, loc=(px, py, zs), scale=(kw, kw, ks))
            assign(p, mats["mid"])
            obs.append(p)
        # between the corners: the pattern's middle letters, spread evenly
        inner = pat[1:-1]
        if inner:
            for face in "SNEW":
                span_x = rim_x - kw / 2 if face in "SN" else rim_y - kw / 2
                for k, (px, py, rz) in enumerate(along_face(face, rim_x, rim_y, cx, cy, len(inner), inset=kw, out=-kw * 0.5)):
                    ch = inner[k]
                    if ch == "S":
                        L = min(1.5 * ks, 2 * span_x * 0.5)
                        p = obj("st_%s_sala_%d_%s%d" % (spec["name"], i + 1, face, k), sala_me, root,
                                loc=(px, py, zs), rot=(0, 0, rz + math.pi / 2), scale=(L, kw * 0.9, ks * 0.95))
                    else:
                        p = obj("st_%s_panj_%d_%s%d" % (spec["name"], i + 1, face, k), panj_me, root,
                                loc=(px, py, zs), rot=(0, 0, rz), scale=(kw * 0.8, kw * 0.8, ks * 0.85))
                    assign(p, mats["mid"])
                    obs.append(p)
        z_lo = t["eave"]
    # griva (neck), shikhara (dome), kalasha
    top_t = talas[-1]
    g = spec["griva"]
    bm = bmesh.new()
    bm_lathe(bm, [(g["w"] / 2, top_t["hara"] - 0.3), (g["w"] / 2, g["top"] - 0.05), (g["w"] / 2 * 1.15, g["top"])], 8, cx, cy, math.pi / 8)
    ob = obj("st_%s_griva" % spec["name"], mesh_from_bm("stm_%s_griva" % spec["name"], bm), root)
    assign(ob, mats["dark"])
    obs.append(ob)
    d = spec["dome"]
    r0 = d["w"] / 2
    dh = d["top"] - g["top"]
    bm = bmesh.new()
    bm_lathe(bm, [(r0 * 0.92, g["top"]), (r0 * 1.06, g["top"] + dh * 0.12), (r0 * 1.0, g["top"] + dh * 0.45),
                  (r0 * 0.78, g["top"] + dh * 0.72), (r0 * 0.4, g["top"] + dh * 0.92), (0.0, g["top"] + dh)], 8, cx, cy, math.pi / 8)
    ob = obj("st_%s_dome" % spec["name"], mesh_from_bm("stm_%s_dome" % spec["name"], bm), root)
    for p in ob.data.polygons:
        p.use_smooth = True
    assign(ob, mats["light"])
    obs.append(ob)
    # nasis on the dome's four cardinal faces
    for face, (px, py, rz) in zip("SNEW", [along_face(f, r0 * 0.95, r0 * 0.95, cx, cy, 1)[0] for f in "SNEW"]):
        p = obj("st_%s_nasi_%s" % (spec["name"], face), kudu_me, root, loc=(px, py, g["top"] + dh * 0.1), rot=(0, 0, rz), scale=(dh * 0.55, dh * 0.55, dh * 0.6))
        assign(p, mats["light"])
        obs.append(p)
    kal_me = shared("stm_kalasha", build_kalasha)
    kh = spec["height"] - d["top"]
    p = obj("st_%s_kalasha" % spec["name"], kal_me, root, loc=(cx, cy, d["top"]), scale=(kh * 0.62, kh * 0.62, kh))
    assign(p, mats["dark"])
    obs.append(p)
    return obs

def apex_of(obs):
    z = -1e9
    for ob in obs:
        if ob.type != "MESH":
            continue
        mw = ob.matrix_world
        for v in ob.data.vertices:
            z = max(z, (mw @ v.co).z)
    return z

def scale_to_apex(obs, cx, cy, z_base, target):
    """Uniform scale about (cx, cy, z_base) so the highest vertex lands on target."""
    bpy.context.view_layer.update()
    a = apex_of(obs)
    s = (target - z_base) / (a - z_base)
    piv = Vector((cx, cy, z_base))
    for ob in obs:
        ob.location = piv + (Vector(ob.location) - piv) * s
        ob.scale = Vector(ob.scale) * s
    bpy.context.view_layer.update()
    return s, apex_of(obs)

def mk_vishnu(root, V, mats):
    obs = []
    cx, cy = V["cx"], V["cy"]
    hx, hy = V["w"] / 2, V["d"] / 2
    z0 = V["platform"]["h"]
    bm = bmesh.new()
    bm_box(bm, cx - hx, cx + hx, cy - hy, cy + hy, z0, V["wall_top"])
    ob = obj("st_vishnu_cell", mesh_from_bm("stm_vishnu_cell", bm), root)
    assign(ob, mats["mid"])
    obs.append(ob)
    pil = shared("stm_pilaster", build_pilaster)
    for face in "SNEW":
        n = V["pilasters"] if face in "SN" else 2
        for k, (px, py, rz) in enumerate(along_face(face, hx, hy, cx, cy, n, inset=0.4)):
            p = obj("st_vishnu_pil_%s%d" % (face, k), pil, root, loc=(px, py, z0), rot=(0, 0, rz), scale=(0.7, 0.7, V["wall_top"] - z0))
            assign(p, mats["dark"])
            obs.append(p)
    eh = V["eave"] - V["wall_top"]
    bm = bmesh.new()
    bm_ring_loft(bm, V["w"], V["d"], [(0.0, V["wall_top"]), (0.15, V["wall_top"] + eh * 0.15), (0.4, V["wall_top"] + eh * 0.55), (0.45, V["eave"]), (0.0, V["eave"])], cx, cy)
    ob = obj("st_vishnu_kapota", mesh_from_bm("stm_vishnu_kapota", bm), root)
    assign(ob, mats["light"])
    obs.append(ob)
    kudu = shared("stm_kudu", build_kudu)
    for face in "SNEW":
        n = V["kudus"] if face in "SN" else 3
        for k, (px, py, rz) in enumerate(along_face(face, hx + 0.4, hy + 0.4, cx, cy, n, inset=0.3)):
            p = obj("st_vishnu_kudu_%s%d" % (face, k), kudu, root, loc=(px, py, V["wall_top"] + eh * 0.25), rot=(0, 0, rz), scale=(0.6, 0.6, 0.6))
            assign(p, mats["light"])
            obs.append(p)
    # a low parapet of small kutas at the corners and a strip between
    ph = V["parapet"] - V["eave"]
    bm = bmesh.new()
    bm_ring_loft(bm, V["w"] + 0.5, V["d"] + 0.5, [(0.0, V["eave"]), (0.0, V["eave"] + ph * 0.3)], cx, cy)
    ob = obj("st_vishnu_parapet", mesh_from_bm("stm_vishnu_parapet", bm), root)
    assign(ob, mats["dark"])
    obs.append(ob)
    kuta = shared("stm_kuta", build_kuta)
    for k, (px, py) in enumerate(corners(hx + 0.25, hy + 0.25, cx, cy, inset=0.5)):
        p = obj("st_vishnu_kuta_%d" % k, kuta, root, loc=(px, py, V["eave"] + ph * 0.25), scale=(1.0, 1.0, ph * 0.75))
        assign(p, mats["mid"])
        obs.append(p)
    obs.append(mk_platform(root, "vishnu_platform", cx, cy, V["platform"]["w"], V["platform"]["d"], V["platform"]["h"], mats["dark"]))
    return obs

def mk_prakara(root, P, mats):
    obs = []
    hx, hy = P["long_m"] / 2, P["short_m"] / 2
    t, h = P["wall_t"], P["wall_h"]
    g = P["gate_w"] / 2
    bm = bmesh.new()
    # long walls (N and S), full length
    bm_box(bm, -hx, hx, -hy, -hy + t, 0.0, h)
    bm_box(bm, -hx, hx, hy - t, hy, 0.0, h)
    # short walls with a central gate
    for sx in (-1, 1):
        x0, x1 = (sx * hx - t, sx * hx) if sx > 0 else (sx * hx, sx * hx + t)
        bm_box(bm, x0, x1, -hy, -g, 0.0, h)
        bm_box(bm, x0, x1, g, hy, 0.0, h)
    # coping, slightly wider
    cw = (P["coping_w"] - t) / 2
    bm_box(bm, -hx - cw, hx + cw, -hy - cw, -hy + t + cw, h, h + P["coping_h"])
    bm_box(bm, -hx - cw, hx + cw, hy - t - cw, hy + cw, h, h + P["coping_h"])
    for sx in (-1, 1):
        x0, x1 = (sx * hx - t - cw, sx * hx + cw) if sx > 0 else (sx * hx - cw, sx * hx + t + cw)
        bm_box(bm, x0, x1, -hy - cw, -g, h, h + P["coping_h"])
        bm_box(bm, x0, x1, g, hy + cw, h, h + P["coping_h"])
    ob = obj("st_prakara_wall", mesh_from_bm("stm_prakara_wall", bm), root)
    assign(ob, mats["mid"])
    obs.append(ob)
    return obs, (hx, hy, t, h + P["coping_h"], g)

def place_nandis(root, P, N, wall, mats):
    hx, hy, t, ztop, g = wall
    L = N["h"] * N["len_over_h"]
    step = L * N["spacing_over_len"]
    me = shared("stm_nandi", build_nandi)
    obs = []
    k = 0
    # along each wall's centreline, facing outward (bull head toward +X of its own frame)
    runs = [("S", -hy + t / 2), ("N", hy - t / 2)]
    for face, y in runs:
        n = int((2 * hx - 1.0) // step)
        for i in range(n):
            x = -hx + 0.5 + step * (i + 0.5)
            rz = 0.0 if face == "S" else math.pi   # heads all one way along the wall, as in the photographs
            p = obj("st_nandi_%d" % k, me, root, loc=(x, y, ztop), rot=(0, 0, rz), scale=(L, L, N["h"] / 0.53))
            assign(p, mats["light"])
            obs.append(p)
            k += 1
    for face, x in [("W", -hx + t / 2), ("E", hx - t / 2)]:
        for seg in ((-hy + 0.5, -g - 0.3), (g + 0.3, hy - 0.5)):
            n = int((seg[1] - seg[0]) // step)
            for i in range(n):
                y = seg[0] + step * (i + 0.5)
                rz = math.pi / 2
                p = obj("st_nandi_%d" % k, me, root, loc=(x, y, ztop), rot=(0, 0, rz), scale=(L, L, N["h"] / 0.53))
                assign(p, mats["light"])
                obs.append(p)
                k += 1
    return obs

def mk_tank(root, T, M, mats):
    obs = []
    cx, cy = T["cx"], T["cy"]
    hx, hy = T["w"] / 2, T["d"] / 2
    rw, rh = T["rim_w"], T["rim_h"]
    bm = bmesh.new()
    # rim
    bm_box(bm, cx - hx - rw, cx + hx + rw, cy - hy - rw, cy - hy, 0.0, rh)
    bm_box(bm, cx - hx - rw, cx + hx + rw, cy + hy, cy + hy + rw, 0.0, rh)
    bm_box(bm, cx - hx - rw, cx - hx, cy - hy, cy + hy, 0.0, rh)
    bm_box(bm, cx + hx, cx + hx + rw, cy - hy, cy + hy, 0.0, rh)
    # stepped sides going down: each step is a ring of four boxes
    n = T["steps"]
    dz = T["depth"] / n
    ins = 0.55
    for i in range(n):
        z1, z0 = -dz * i, -dz * (i + 1)
        ax, ay = hx - ins * i, hy - ins * i
        bx, by = ax - ins, ay - ins
        bm_box(bm, cx - ax, cx + ax, cy - ay, cy - by, z0, z1)
        bm_box(bm, cx - ax, cx + ax, cy + by, cy + ay, z0, z1)
        bm_box(bm, cx - ax, cx - bx, cy - by, cy + by, z0, z1)
        bm_box(bm, cx + bx, cx + ax, cy - by, cy + by, z0, z1)
    # floor
    fx, fy = hx - ins * n, hy - ins * n
    bm_box(bm, cx - fx, cx + fx, cy - fy, cy + fy, -T["depth"] - 0.1, -T["depth"])
    # the well and the pillar on its pedestal
    bm_lathe(bm, [(T["well_r"], -T["depth"]), (T["well_r"], -T["depth"] + 0.9), (T["well_r"] * 0.8, -T["depth"] + 0.9), (T["well_r"] * 0.8, -T["depth"] + 0.2)], 10, cx, cy)
    ph = T["pillar_h"]
    bm_lathe(bm, [(0.0, -T["depth"] + 0.9), (0.55, -T["depth"] + 0.9), (0.55, -T["depth"] + 1.2), (0.3, -T["depth"] + 1.3), (0.22, -T["depth"] + 0.9 + ph * 0.55),
                  (0.32, -T["depth"] + 0.9 + ph * 0.7), (0.28, -T["depth"] + 0.9 + ph * 0.9), (0.0, -T["depth"] + 0.9 + ph)], 8, cx, cy)
    ob = obj("st_tank", mesh_from_bm("stm_tank", bm), root)
    assign(ob, mats["light"])
    obs.append(ob)
    kuta = shared("stm_kuta", build_kuta)
    p = obj("st_mini_shrine", kuta, root, loc=(M["cx"], M["cy"], 0.0), scale=(M["size"], M["size"], M["size"] * 1.35))
    assign(p, mats["mid"])
    obs.append(p)
    return obs

def mk_court(root, P, mats):
    hx, hy = P["long_m"] / 2 - P["wall_t"], P["short_m"] / 2 - P["wall_t"]
    bm = bmesh.new()
    bm_box(bm, -hx, hx, -hy, hy, -0.05, 0.03)
    ob = obj("st_court", mesh_from_bm("stm_court", bm), root)
    assign(ob, mats["dark"])
    return [ob]

# ---------------------------------------------------------------- camera / sun / render
def setup_camera_sun(cam_pos, target, sun_bearing=230.0, sun_elev=26.0):
    cam = bpy.data.objects.get("delivery_camera")
    if cam is None:
        cam = bpy.data.objects.new("delivery_camera", bpy.data.cameras.new("delivery_camera"))
        coll().objects.link(cam)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle_y = math.radians(45.0)
    cam.data.clip_end = 2000.0
    cam.location = cam_pos
    d = Vector(target) - Vector(cam_pos)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    sun = bpy.data.objects.get("key_sun")
    if sun is None:
        sun = bpy.data.objects.new("key_sun", bpy.data.lights.new("key_sun", "SUN"))
        coll().objects.link(sun)
    sun.data.energy = 4.0
    sun.data.angle = math.radians(1.0)
    b, e = math.radians(sun_bearing), math.radians(sun_elev)
    # direction the light travels: from the sun toward the scene
    dirn = -Vector((math.sin(b) * math.cos(e), math.cos(b) * math.cos(e), math.sin(e)))
    sun.rotation_euler = dirn.to_track_quat("-Z", "Y").to_euler()
    sun.location = (0, 0, 60)
    return cam, sun

def render_preview(name, res=(1280, 720), samples=16):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.eevee.taa_render_samples = samples
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.image_settings.media_type = "IMAGE"
    sc.render.image_settings.file_format = "PNG"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.62, 0.70, 0.80, 1.0)
        bg.inputs[1].default_value = 0.8
    target = artifacts.file(name=name, media_type="image/png")
    sc.render.filepath = target.path
    bpy.ops.render.render(write_still=True)
    target.publish()
    return name
