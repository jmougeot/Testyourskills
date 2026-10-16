# La ville de nuit derrière les baies, générée et rendue dans Blender (Cycles).
#
#   blender -b -P tools/bake/city.py -- [--width 5120] [--samples 96] [--preview] [--out dir]
#
# Une ville vue d'un 20e étage (75 m) : tours de bureaux aux fenêtres
# allumées au hasard, quartier d'affaires et grandes tours au loin, toits et
# feux d'obstacle, rues orangées, phares et feux arrière sur les avenues, un
# fleuve qui la reflète, la brume et le halo de la ville qui avalent
# l'horizon. Rien n'éclaire rien : tout ce qui brille est vu directement,
# ce qui garde le calcul court sur le processeur.
#
# Rendu en projection cylindrique centrale, exactement celle du morceau de
# cylindre qui la porte dans la scène (createCityBackdrop, stage.ts) : la
# largeur couvre ARC degrés, la hauteur va de tan(V_MIN) à tan(V_MAX) en
# unités de rayon, l'horizon au niveau de l'œil. Rendu à --width, réduit à
# 4096 px (la taille de texture que tous les mobiles acceptent) dans
# web/public/3d/city.webp.
import argparse
import math
import os
import random
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--width", type=int, default=5120)
ap.add_argument("--samples", type=int, default=96)
ap.add_argument("--preview", action="store_true", help="petit calcul rapide pour la mise au point")
ap.add_argument("--out", default=None)
args = ap.parse_args(argv)
if args.preview:
    args.width, args.samples = 1600, 24

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = args.out or os.path.join(ROOT, "web", "public", "3d")

# ---------- le cadrage, repris par stage.ts ----------
ARC = 100.0  # degrés couverts en largeur
V_MIN, V_MAX = -14.0, 16.0  # degrés sous et sur l'horizon
EYE = 75.0  # hauteur de l'œil au-dessus des rues (m)
FAR = 6000.0

rng = random.Random(27)
scene = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob)

# ---------- matières ----------
HAZE = (0.06, 0.055, 0.062)  # halo de la ville à l'horizon (linéaire)
ZENITH = (0.002, 0.003, 0.0075)


def nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    return nt, nt.nodes.new("ShaderNodeOutputMaterial")


def math_node(nt, op, a, b=None, clamp=False):
    n = nt.nodes.new("ShaderNodeMath")
    n.operation = op
    n.use_clamp = clamp
    for i, v in enumerate((a, b)):
        if v is None:
            continue
        if isinstance(v, (int, float)):
            n.inputs[i].default_value = v
        else:
            nt.links.new(v, n.inputs[i])
    return n.outputs[0]


def attr(nt, name):
    n = nt.nodes.new("ShaderNodeAttribute")
    n.attribute_type = "GEOMETRY"
    n.attribute_name = name
    return n.outputs["Fac"]


def fogged(nt, out, shader, k=1.0):
    """Brume : mélange vers la couleur du halo avec la distance, plus dense au ras du sol."""
    cam = nt.nodes.new("ShaderNodeCameraData")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    z = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], z.inputs[0])
    d = math_node(nt, "DIVIDE", cam.outputs["View Distance"], -4200.0)
    lift = math_node(nt, "DIVIDE", z.outputs["Z"], 900.0)  # la brume s'éclaircit en montant
    d = math_node(nt, "MULTIPLY", d, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MINIMUM", lift, 0.6)))
    fog = math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", 1.0, math_node(nt, "EXPONENT", d)), 0.86 * k, clamp=True)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*HAZE, 1)
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fog, mix.inputs[0])
    nt.links.new(shader, mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])


def facade_material():
    """Façades : trame de fenêtres en mètres (uv), allumées au hasard, propre à chaque tour."""
    mat = bpy.data.materials.new("facade")
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    uv = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs[0], sep.inputs[0])
    u, v = sep.outputs["X"], sep.outputs["Y"]
    bld, roof, style = attr(nt, "bld"), attr(nt, "roof"), attr(nt, "style")
    # largeur de travée 1,4 à 3,2 m, étage 3,4 à 4,1 m, selon la tour
    w = math_node(nt, "ADD", 1.4, math_node(nt, "MULTIPLY", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 7.31)), 1.8))
    fh = math_node(nt, "ADD", 3.4, math_node(nt, "MULTIPLY", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 3.17)), 0.7))
    cu, cv = math_node(nt, "DIVIDE", u, w), math_node(nt, "DIVIDE", v, fh)
    cx, cy = math_node(nt, "FLOOR", cu), math_node(nt, "FLOOR", cv)
    fx, fy = math_node(nt, "FRACT", cu), math_node(nt, "FRACT", cv)
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(cx, comb.inputs[0])
    nt.links.new(cy, comb.inputs[1])
    nt.links.new(math_node(nt, "MULTIPLY", bld, 997.0), comb.inputs[2])
    wn = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn.noise_dimensions = "3D"
    nt.links.new(comb.outputs[0], wn.inputs["Vector"])
    # les étages entiers allumés ou éteints, en plus des fenêtres seules
    comb2 = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(math_node(nt, "FLOOR", math_node(nt, "DIVIDE", cx, 6.0)), comb2.inputs[0])
    nt.links.new(cy, comb2.inputs[1])
    nt.links.new(math_node(nt, "MULTIPLY", bld, 577.0), comb2.inputs[2])
    wn2 = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn2.noise_dimensions = "3D"
    nt.links.new(comb2.outputs[0], wn2.inputs["Vector"])
    occ = math_node(nt, "ADD", 0.04, math_node(nt, "MULTIPLY", math_node(nt, "POWER", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 13.7)), 1.6), 0.4))
    chance = math_node(nt, "MULTIPLY", wn.outputs["Value"], math_node(nt, "ADD", 0.45, wn2.outputs["Value"]))
    lit = math_node(nt, "LESS_THAN", chance, occ)
    # fenêtre seule, ou bandeau continu (style > 0.5)
    mx = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fx, 0.14), math_node(nt, "LESS_THAN", fx, 0.86))
    mx = math_node(nt, "MAXIMUM", mx, math_node(nt, "GREATER_THAN", style, 0.5))
    my = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fy, 0.28), math_node(nt, "LESS_THAN", fy, 0.86))
    glass = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", mx, my), math_node(nt, "SUBTRACT", 1.0, roof))
    # teinte : bureaux en néon froid, logements en chaud, quelques écrans bleutés
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    cr.elements[0].position, cr.elements[0].color = 0.0, (1.0, 0.62, 0.32, 1)
    cr.elements[1].position, cr.elements[1].color = 0.45, (1.0, 0.82, 0.6, 1)
    e = cr.elements.new(0.75)
    e.color = (0.78, 0.88, 1.0, 1)
    e = cr.elements.new(0.94)
    e.color = (0.55, 0.7, 1.0, 1)
    tint = math_node(nt, "FRACT", math_node(nt, "ADD", math_node(nt, "MULTIPLY", wn.outputs["Color"], 0.35), math_node(nt, "MULTIPLY", bld, 0.65)))
    nt.links.new(tint, ramp.inputs[0])
    # éclat très variable : stores baissés, lampes de bureau, plafonniers
    gain = math_node(nt, "ADD", 0.12, math_node(nt, "POWER", math_node(nt, "MULTIPLY", wn.outputs["Color"], wn2.outputs["Value"]), 2.2))
    strength = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", lit, glass), math_node(nt, "MULTIPLY", gain, 7.0))
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    base = nt.nodes.new("ShaderNodeMix")
    base.data_type = "RGBA"
    nt.links.new(glass, base.inputs["Factor"])
    wall = nt.nodes.new("ShaderNodeMix")  # béton plus ou moins clair selon la tour
    wall.data_type = "RGBA"
    nt.links.new(math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 29.3)), wall.inputs["Factor"])
    wall.inputs["A"].default_value = (0.025, 0.026, 0.03, 1)
    wall.inputs["B"].default_value = (0.11, 0.1, 0.095, 1)
    nt.links.new(wall.outputs["Result"], base.inputs["A"])
    base.inputs["B"].default_value = (0.012, 0.015, 0.02, 1)  # vitrage éteint
    nt.links.new(base.outputs["Result"], bsdf.inputs["Base Color"])
    shiny = math_node(nt, "MAXIMUM", glass, math_node(nt, "MULTIPLY", style, math_node(nt, "SUBTRACT", 1.0, roof)))
    nt.links.new(math_node(nt, "SUBTRACT", 0.8, math_node(nt, "MULTIPLY", shiny, 0.68)), bsdf.inputs["Roughness"])
    # le pied des façades éclairé par la rue, en orangé, qui s'éteint en montant
    pos = nt.nodes.new("ShaderNodeNewGeometry")
    pz = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(pos.outputs["Position"], pz.inputs[0])
    up = math_node(nt, "MULTIPLY", math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", pz.outputs["Z"], -10.0)), math_node(nt, "SUBTRACT", 1.0, roof))
    em = nt.nodes.new("ShaderNodeMix")
    em.data_type = "RGBA"
    nt.links.new(math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", 1.0, lit), 1.0, clamp=True), em.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], em.inputs["A"])
    em.inputs["B"].default_value = (1.0, 0.5, 0.22, 1)
    nt.links.new(em.outputs["Result"], bsdf.inputs["Emission Color"])
    up = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", up, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", lit, glass))), 0.12)
    nt.links.new(math_node(nt, "ADD", strength, up), bsdf.inputs["Emission Strength"])
    fogged(nt, out, bsdf.outputs[0])
    return mat


def emissive_material(name, colors, strength, k=1.0):
    """Points lumineux (réverbères, phares, feux) : couleur choisie par l'attribut « c »."""
    mat = bpy.data.materials.new(name)
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    for i, (pos, col) in enumerate(colors):
        e = cr.elements[i] if i < 2 else cr.elements.new(pos)
        e.position, e.color = pos, (*col, 1)
    nt.links.new(attr(nt, "c"), ramp.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ramp.outputs[0], em.inputs["Color"])
    nt.links.new(math_node(nt, "MULTIPLY", attr(nt, "s"), strength), em.inputs["Strength"])
    fogged(nt, out, em.outputs[0], k)
    return mat


def ground_material():
    """Le sol : asphalte sombre, la lueur orangée des rues portée par l'attribut « c »."""
    mat = bpy.data.materials.new("ground")
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.02, 0.02, 0.022, 1)
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.55, 0.25, 1)
    nt.links.new(math_node(nt, "MULTIPLY", attr(nt, "c"), 0.09), bsdf.inputs["Emission Strength"])
    fogged(nt, out, bsdf.outputs[0])
    return mat


def water_material():
    mat = bpy.data.materials.new("water")
    nt, out = nodes(mat)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = (0.004, 0.006, 0.008, 1)
    bsdf.inputs["Roughness"].default_value = 0.06
    # vaguelettes : les reflets s'étirent en traînées verticales
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (0.02, 0.35, 1)
    nt.links.new(tc.outputs["Object"], mp.inputs[0])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.0
    nz.inputs["Detail"].default_value = 6
    nt.links.new(mp.outputs[0], nz.inputs["Vector"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.25
    nt.links.new(nz.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
    fogged(nt, out, bsdf.outputs[0])
    return mat


def world():
    """Ciel de ville : noir bleuté au zénith, halo orangé et nuages bas éclairés par-dessous."""
    w = bpy.data.worlds.new("night")
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    z = math_node(nt, "MAXIMUM", sep.outputs["Z"], 0.0)
    glow = math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", z, -0.06))
    # nuages : bruit projeté sur un plafond, plus visibles près du halo
    proj = nt.nodes.new("ShaderNodeVectorMath")
    proj.operation = "DIVIDE"
    nt.links.new(tc.outputs["Generated"], proj.inputs[0])
    cz = nt.nodes.new("ShaderNodeCombineXYZ")
    zz = math_node(nt, "ADD", z, 0.04)
    for i in range(3):
        nt.links.new(zz, cz.inputs[i])
    nt.links.new(cz.outputs[0], proj.inputs[1])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.9
    nz.inputs["Detail"].default_value = 5
    nz.inputs["Roughness"].default_value = 0.55
    nt.links.new(proj.outputs[0], nz.inputs["Vector"])
    cloud = math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", nz.outputs["Fac"], 0.5), 2.2, clamp=True)
    lit = math_node(nt, "MULTIPLY", cloud, math_node(nt, "EXPONENT", math_node(nt, "DIVIDE", z, -0.22)))
    k = math_node(nt, "ADD", math_node(nt, "MULTIPLY", glow, 1.0), math_node(nt, "MULTIPLY", lit, 0.3))
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.clamp_factor = True
    nt.links.new(k, mix.inputs["Factor"])
    mix.inputs["A"].default_value = (*ZENITH, 1)
    mix.inputs["B"].default_value = (*HAZE, 1)
    bg = nt.nodes.new("ShaderNodeBackground")
    nt.links.new(mix.outputs["Result"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


# ---------- géométrie ----------
class Mesh:
    """Accumule des faces, leurs uv et des attributs de face, puis crée un seul objet."""

    def __init__(self, name, mat, attrs=()):
        self.name, self.mat = name, mat
        self.verts, self.faces, self.uvs = [], [], []
        self.attrs = {a: [] for a in attrs}

    def face(self, pts, uvs=None, **vals):
        i = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(i, i + len(pts))))
        self.uvs.extend(uvs or [(0.0, 0.0)] * len(pts))
        for a in self.attrs:
            self.attrs[a].append(vals.get(a, 0.0))

    def build(self):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata(self.verts, [], self.faces)
        uv = me.uv_layers.new(name="UVMap")
        uv.data.foreach_set("uv", [c for p in self.uvs for c in p])
        for a, vals in self.attrs.items():
            me.attributes.new(a, "FLOAT", "FACE").data.foreach_set("value", vals)
        me.materials.append(self.mat)
        ob = bpy.data.objects.new(self.name, me)
        scene.collection.objects.link(ob)
        print(f"[city] {self.name}: {len(self.faces)} faces")
        return ob


GRID = math.radians(17)  # la trame des rues, de biais par rapport aux baies
CG, SG = math.cos(GRID), math.sin(GRID)


def to_world(a, b):
    return (a * CG - b * SG, a * SG + b * CG)


def in_view(x, y, margin=8.0):
    """Dans le champ des baies, devant, et avant l'horizon de brume."""
    if y < 60:
        return False
    return abs(math.degrees(math.atan2(x, y))) < ARC / 2 + margin and math.hypot(x, y) < FAR


# le fleuve, de biais, à 1,4 km au plus près
def river_dist(x, y):
    return abs(y - (1650 + 0.32 * x)) * math.cos(math.atan(0.32))


RIVER_W = 140.0


def height_for(x, y, r):
    d1 = math.hypot(x + 120, y - 1300)  # quartier d'affaires, derrière le poste du dev
    d2 = math.hypot(x - 1100, y - 2500)  # un second, plus loin à droite
    d3 = math.hypot(x + 1900, y - 3300)
    tall = 230 * math.exp(-((d1 / 520) ** 2)) + 170 * math.exp(-((d2 / 480) ** 2)) + 120 * math.exp(-((d3 / 600) ** 2))
    h = 14 + 34 * r.random() ** 2 + tall * r.random() ** 1.4
    if tall > 120 and r.random() < 0.06:
        h = 260 + 120 * r.random()  # quelques très grandes tours
    return h


def block_lots(r, a0, b0, size):
    """Découpe un îlot en 1 à 4 parcelles."""
    lots = [(a0, b0, size, size)]
    for _ in range(r.choice((0, 1, 1, 2))):
        a, b, w, d = lots.pop(r.randrange(len(lots)))
        if w >= d:
            k = w * r.uniform(0.35, 0.65)
            lots += [(a, b, k, d), (a + k, b, w - k, d)]
        else:
            k = d * r.uniform(0.35, 0.65)
            lots += [(a, b, w, k), (a, b + k, w, d - k)]
    return lots


def tower(m, beacons, crowns, a, b, w, d, h, r):
    """Une tour sur la parcelle (a, b, w, d) de la trame, en 1 à 3 gradins."""
    bld = r.random()
    style = 1.0 if r.random() < (0.55 if h > 100 else 0.2) else 0.0
    shape = "round" if h > 120 and r.random() < 0.18 else "cut" if h > 80 and r.random() < 0.25 else "box"
    tiers = 1 if h < 70 or r.random() < 0.45 else r.choice((2, 2, 3))
    z0, cx, cy = 0.0, a + w / 2, b + d / 2
    for t in range(tiers):
        z1 = h if t == tiers - 1 else z0 + (h - z0) * r.uniform(0.45, 0.7)
        hw, hd = w / 2, d / 2
        if shape == "round":
            rad = min(hw, hd)
            corners = [to_world(cx + rad * math.cos(k * math.pi / 10), cy + rad * math.sin(k * math.pi / 10)) for k in range(20)]
        elif shape == "cut":
            c = min(hw, hd) * 0.3
            ring = [(-hw + c, -hd), (hw - c, -hd), (hw, -hd + c), (hw, hd - c), (hw - c, hd), (-hw + c, hd), (-hw, hd - c), (-hw, -hd + c)]
            corners = [to_world(cx + px, cy + py) for px, py in ring]
        else:
            corners = [to_world(cx - hw, cy - hd), to_world(cx + hw, cy - hd), to_world(cx + hw, cy + hd), to_world(cx - hw, cy + hd)]
        u = r.uniform(0, 50)
        for i in range(len(corners)):
            p, q = corners[i], corners[(i + 1) % len(corners)]
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            m.face([(p[0], p[1], z0), (q[0], q[1], z0), (q[0], q[1], z1), (p[0], p[1], z1)], [(u, z0), (u + L, z0), (u + L, z1), (u, z1)], bld=bld, style=style)
            u += L
        m.face([(c[0], c[1], z1) for c in corners], roof=1.0, bld=bld)
        z0 = z1
        w, d = w * r.uniform(0.6, 0.85), d * r.uniform(0.6, 0.85)
    top = [to_world(cx - w / 2, cy - d / 2), to_world(cx + w / 2, cy + d / 2)]
    if shape == "box" and h < 160:
        # locaux techniques et machineries sur le toit
        for _ in range(r.choice((0, 1, 1, 2))):
            bw, bd, bh = w * r.uniform(0.15, 0.4), d * r.uniform(0.15, 0.4), r.uniform(2.5, 6)
            ox, oy = r.uniform(-0.3, 0.3) * w, r.uniform(-0.3, 0.3) * d
            q = [to_world(cx + ox - bw / 2, cy + oy - bd / 2), to_world(cx + ox + bw / 2, cy + oy - bd / 2), to_world(cx + ox + bw / 2, cy + oy + bd / 2), to_world(cx + ox - bw / 2, cy + oy + bd / 2)]
            for i in range(4):
                p0, p1 = q[i], q[(i + 1) % 4]
                m.face([(p0[0], p0[1], h), (p1[0], p1[1], h), (p1[0], p1[1], h + bh), (p0[0], p0[1], h + bh)], roof=1.0, bld=bld)
            m.face([(c[0], c[1], h + bh) for c in q], roof=1.0, bld=bld)
    if h > 90:
        # feux d'obstacle rouges aux angles du toit
        for c in corners[:: max(1, len(corners) // (2 if h < 180 else 4))]:
            billboard(beacons, c[0], c[1], h + 1.5, 1.6, c=0.0, s=r.uniform(0.6, 1.0))
    if h > 110 and r.random() < 0.4:
        # couronne éclairée
        hw, hd = w / 2 / 0.72 + 0.4, d / 2 / 0.72 + 0.4
        ring = [to_world(cx - hw, cy - hd), to_world(cx + hw, cy - hd), to_world(cx + hw, cy + hd), to_world(cx - hw, cy + hd)]
        col = r.choice((0.0, 0.0, 0.5, 0.9, 0.97))
        for i in range(4):
            p, q = ring[i], ring[(i + 1) % 4]
            crowns.face([(p[0], p[1], h - 6), (q[0], q[1], h - 6), (q[0], q[1], h - 1), (p[0], p[1], h - 1)], c=col, s=r.uniform(0.5, 1.0))
    if h > 250:
        # flèche avec son feu
        sx, sy = (top[0][0] + top[1][0]) / 2, (top[0][1] + top[1][1]) / 2
        spire = 25 + 40 * r.random()
        for dx, dy in ((1, 0), (0, 1)):
            m.face([(sx - dx, sy - dy, h), (sx + dx, sy + dy, h), (sx + dx * 0.2, sy + dy * 0.2, h + spire), (sx - dx * 0.2, sy - dy * 0.2, h + spire)], roof=1.0, bld=bld)
        billboard(beacons, sx, sy, h + spire + 1, 2.2, c=0.0, s=1.0)


def billboard(m, x, y, z, size, **vals):
    """Un petit carré tourné vers l'œil : un point lumineux lisible même au loin."""
    dx, dy = x, y
    L = math.hypot(dx, dy) or 1.0
    ux, uy = -dy / L * size / 2, dx / L * size / 2
    h = size / 2
    m.face([(x - ux, y - uy, z - h), (x + ux, y + uy, z - h), (x + ux, y + uy, z + h), (x - ux, y - uy, z + h)], **vals)


def build_city():
    facade = facade_material()
    lights = emissive_material("lamps", [(0.0, (1.0, 0.5, 0.18)), (0.5, (1.0, 0.86, 0.66))], 26.0)
    cars = emissive_material("cars", [(0.0, (1.0, 0.05, 0.02)), (0.5, (1.0, 0.9, 0.75))], 40.0)
    beacon_mat = emissive_material("beacons", [(0.0, (1.0, 0.04, 0.02)), (0.5, (1.0, 1.0, 1.0))], 60.0, k=0.8)
    crown_mat = emissive_material("crowns", [(0.0, (0.85, 0.92, 1.0)), (0.4, (1.0, 0.75, 0.45)), (0.8, (0.35, 0.65, 1.0)), (0.95, (1.0, 0.25, 0.55))], 14.0, k=0.9)
    m = Mesh("towers", facade, ("bld", "roof", "style"))
    beacons = Mesh("beacons", beacon_mat, ("c", "s"))
    crowns = Mesh("crowns", crown_mat, ("c", "s"))
    lamps = Mesh("lamps", lights, ("c", "s"))
    traffic = Mesh("traffic", cars, ("c", "s"))
    ground = Mesh("ground", ground_material(), ("c",))

    P, STREET = 105.0, 22.0  # pas de la trame, largeur des rues
    N = int(FAR / P) + 2
    count = 0
    for i in range(-N, N):
        for j in range(-N, N):
            a0, b0 = i * P + STREET / 2, j * P + STREET / 2
            x, y = to_world(a0 + P / 2, b0 + P / 2)
            if not in_view(x, y, 20) or river_dist(x, y) < RIVER_W / 2 + P * 0.5:
                continue
            r = random.Random(i * 7919 + j)
            if r.random() < 0.05:
                continue  # un parc, une place
            for a, b, w, d in block_lots(r, a0, b0, P - STREET):
                inset = r.uniform(1.0, 5.0)
                if w - 2 * inset < 8 or d - 2 * inset < 8:
                    continue
                bx, by = to_world(a + w / 2, b + d / 2)
                h = height_for(bx, by, r)
                tower(m, beacons, crowns, a + inset, b + inset, w - 2 * inset, d - 2 * inset, h, r)
                count += 1
    print(f"[city] {count} tours")

    # les rues : une lueur au sol, des réverbères, et sur les avenues la circulation
    for axis in (0, 1):
        for k in range(-N, N):
            avenue = k % 5 == 0
            half = STREET / 2 + (5 if avenue else 0)
            for s in range(-N * 4, N * 4):
                t0, t1 = s * P / 4, (s + 1) * P / 4
                pts = [(k * P, t0), (k * P, t1)] if axis == 0 else [(t0, k * P), (t1, k * P)]
                (a0, b0), (a1, b1) = pts
                mx, my = to_world((a0 + a1) / 2, (b0 + b1) / 2)
                if not in_view(mx, my, 20):
                    continue
                if river_dist(mx, my) < RIVER_W / 2:
                    continue
                na, nb = (half, 0) if axis == 0 else (0, half)
                quad = [to_world(a0 - na, b0 - nb), to_world(a1 - na, b1 - nb), to_world(a1 + na, b1 + nb), to_world(a0 + na, b0 + nb)]
                r = random.Random(axis * 1_000_003 + k * 7_777 + s)
                ground.face([(q[0], q[1], 0.05) for q in quad], c=(1.0 if avenue else 0.6) * r.uniform(0.8, 1.1))
                # réverbères des deux côtés, sodium ou LED selon le quartier
                led = 0.6 if (k // 7 + s // 28) % 3 == 0 else 0.0
                for side in (-1, 1):
                    ea, eb = (side * (half - 1), 0) if axis == 0 else (0, side * (half - 1))
                    for f in (0.25, 0.75) if avenue else (0.5,):
                        lx, ly = to_world(a0 + (a1 - a0) * f + ea, b0 + (b1 - b0) * f + eb)
                        billboard(lamps, lx, ly, 8.0, 1.8, c=led, s=r.uniform(0.7, 1.0))
                if avenue or r.random() < 0.25:
                    # voitures : phares d'un côté, feux arrière de l'autre
                    for side, col in ((-1, 0.6), (1, 0.0)):
                        for _ in range(r.choice((0, 1, 2, 3, 4)) if avenue else r.choice((0, 1))):
                            f = r.random()
                            lane = side * r.uniform(2.0, half - 3)
                            ea, eb = (lane, 0) if axis == 0 else (0, lane)
                            cx_, cy_ = to_world(a0 + (a1 - a0) * f + ea, b0 + (b1 - b0) * f + eb)
                            billboard(traffic, cx_, cy_, 0.8, 1.1, c=col, s=r.uniform(0.5, 1.0))
    # les quais du fleuve, éclairés
    for side in (-1, 1):
        for s in range(-80, 80):
            x = s * 30.0
            off = side * (RIVER_W / 2 + 6) / math.cos(math.atan(0.32))
            y = 1650 + 0.32 * x + off
            if in_view(x, y):
                billboard(lamps, x, y, 6.0, 1.8, c=0.6, s=0.8)
    # le fleuve : une large bande d'eau
    water = Mesh("water", water_material())
    off = (RIVER_W / 2 + 4) / math.cos(math.atan(0.32))
    xa, xb = -FAR, FAR
    water.face([(xa, 1650 + 0.32 * xa - off, 0.0), (xb, 1650 + 0.32 * xb - off, 0.0), (xb, 1650 + 0.32 * xb + off, 0.0), (xa, 1650 + 0.32 * xa + off, 0.0)])
    # sol sous tout le reste
    ground.face([(-FAR * 2, 0, 0.0), (FAR * 2, 0, 0.0), (FAR * 2, FAR * 1.5, 0.0), (-FAR * 2, FAR * 1.5, 0.0)], c=0.0)
    for mesh in (m, beacons, crowns, lamps, traffic, ground, water):
        mesh.build()


world()
build_city()

# ---------- caméra : cylindre central, l'œil à EYE, regard vers +y ----------
cam = bpy.data.cameras.new("eye")
cam.type = "PANO"
cam.panorama_type = "CENTRAL_CYLINDRICAL"
cam.central_cylindrical_range_u_min = math.radians(-ARC / 2)
cam.central_cylindrical_range_u_max = math.radians(ARC / 2)
cam.central_cylindrical_range_v_min = math.tan(math.radians(V_MIN))
cam.central_cylindrical_range_v_max = math.tan(math.radians(V_MAX))
eye = bpy.data.objects.new("eye", cam)
eye.location = (0, 0, EYE)
eye.rotation_euler = (math.pi / 2, 0, 0)
scene.collection.objects.link(eye)
scene.camera = eye

H = round(args.width * (math.tan(math.radians(V_MAX)) - math.tan(math.radians(V_MIN))) / math.radians(ARC))
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 3
scene.cycles.diffuse_bounces = 1
scene.cycles.glossy_bounces = 2
scene.cycles.sample_clamp_indirect = 4.0
scene.render.resolution_x, scene.render.resolution_y = args.width, H
scene.render.resolution_percentage = 100
try:
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
except TypeError as e:
    print("[city] transformation de vue :", e)
scene.view_settings.exposure = 0.0
print(f"[city] rendu {args.width}×{H}, {args.samples} échantillons, vue {scene.view_settings.view_transform}")

os.makedirs(OUT, exist_ok=True)
tmp = os.path.join(OUT, "city-render.png")
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = tmp
bpy.ops.render.render(write_still=True)
img = bpy.data.images.load(tmp)
w = min(4096, args.width)
img.scale(w, round(H * w / args.width))
img.file_format = "WEBP"
dst = os.path.join(OUT, "city.webp")
img.save(filepath=dst, quality=80)
os.remove(tmp)
print("[city] écrit", dst, img.size[:])
