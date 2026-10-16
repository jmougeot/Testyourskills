# La ville de nuit derrière les baies, construite d'après OpenStreetMap et
# rendue dans Blender (Cycles).
#
#   blender -b -P tools/bake/city.py -- [--width 5120] [--samples 96] [--preview] [--out dir]
#
# La Défense vue de Neuilly-sur-Seine, d'un 20e étage (75 m), dans l'axe
# historique : l'avenue Charles-de-Gaulle file droit vers la Grande Arche,
# la Seine et le pont de Neuilly au premier plan, les tours du quartier
# d'affaires au centre de l'image, juste derrière le poste du dev. Vraies
# emprises de bâtiments et leurs hauteurs (height, building:levels, leurs
# parties building:part), vraies rues, vraie eau (tools/bake/osm.py, cache
# hors ligne dans tools/bake/.cache). Données © OpenStreetMap contributors,
# sous licence ODbL (https://www.openstreetmap.org/copyright).
#
# Le reste est inventé, mais plausible : fenêtres allumées au hasard, murs-
# rideaux vitrés, bandeaux ou fenêtres percées selon le bâtiment, quelques
# enseignes génériques (aucune vraie marque), feux d'obstacle et couronnes
# éclairées sur les tours, réverbères, phares et feux arrière selon le sens
# de circulation, la brume et le halo de la ville qui avalent l'horizon.
# Rien n'éclaire rien : tout ce qui brille est vu directement, ce qui garde
# le calcul court sur le processeur.
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

# ---------- le lieu ----------
# Neuilly-sur-Seine, un immeuble en bord de l'avenue Charles-de-Gaulle, à
# 130 m au nord de l'axe historique : Tour First à 0,9 km, l'Arche à 2,4 km
EYE_LAT, EYE_LON = 48.88525, 2.26298
TARGET = (48.8905, 2.2450)  # le cœur des tours de La Défense, au centre de l'image
# l'emprise des données OSM, fixe : le cache sert tant qu'elle ne change pas
AREA = (48.851416513212286, 2.1803728284534243, 48.938367621994196, 2.2622)

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
    if out is None:
        return mix.outputs[0]
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
    # style : 0 fenêtres percées, 0,5 fenêtres en bandeau, 1 mur-rideau vitré
    cw = math_node(nt, "GREATER_THAN", style, 0.75)
    # largeur de travée 1,4 à 3,2 m, étage 3,4 à 4,1 m, selon la tour ;
    # trame de mur-rideau de 1,35 à 1,65 m
    w = math_node(nt, "ADD", 1.4, math_node(nt, "MULTIPLY", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 7.31)), 1.8))
    w_cw = math_node(nt, "ADD", 1.35, math_node(nt, "MULTIPLY", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 7.31)), 0.3))
    w = math_node(nt, "ADD", w, math_node(nt, "MULTIPLY", cw, math_node(nt, "SUBTRACT", w_cw, w)))
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
    # les étages entiers allumés ou éteints, en plus des fenêtres seules ;
    # en plateaux plus larges derrière les murs-rideaux (bureaux paysagers)
    comb2 = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(math_node(nt, "FLOOR", math_node(nt, "DIVIDE", cx, math_node(nt, "ADD", 6.0, math_node(nt, "MULTIPLY", cw, 12.0)))), comb2.inputs[0])
    nt.links.new(cy, comb2.inputs[1])
    nt.links.new(math_node(nt, "MULTIPLY", bld, 577.0), comb2.inputs[2])
    wn2 = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn2.noise_dimensions = "3D"
    nt.links.new(comb2.outputs[0], wn2.inputs["Vector"])
    occ = math_node(nt, "ADD", 0.04, math_node(nt, "MULTIPLY", math_node(nt, "POWER", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 13.7)), 1.6), 0.4))
    # les tours de bureaux restent bien plus allumées la nuit (ménage, veilleuses,
    # étages entiers) : c'est ce qui dessine leur silhouette sur le ciel
    occ_cw = math_node(nt, "ADD", 0.06, math_node(nt, "MULTIPLY", math_node(nt, "FRACT", math_node(nt, "MULTIPLY", bld, 13.7)), 0.22))
    occ = math_node(nt, "ADD", occ, math_node(nt, "MULTIPLY", cw, math_node(nt, "SUBTRACT", occ_cw, occ)))
    chance = math_node(nt, "MULTIPLY", wn.outputs["Value"], math_node(nt, "ADD", 0.45, wn2.outputs["Value"]))
    lit = math_node(nt, "LESS_THAN", chance, occ)
    # fenêtre seule, bandeau continu (style > 0.25), ou mur-rideau : vitrage
    # du sol au plafond, seulement coupé par les meneaux et les nez de dalle
    mx = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fx, 0.14), math_node(nt, "LESS_THAN", fx, 0.86))
    mx = math_node(nt, "MAXIMUM", mx, math_node(nt, "GREATER_THAN", style, 0.25))
    mull = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fx, 0.05), math_node(nt, "LESS_THAN", fx, 0.95))
    mx = math_node(nt, "MULTIPLY", mx, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", cw, math_node(nt, "SUBTRACT", 1.0, mull))))
    my = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fy, 0.28), math_node(nt, "LESS_THAN", fy, 0.86))
    my_cw = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fy, 0.1), math_node(nt, "LESS_THAN", fy, 0.97))
    my = math_node(nt, "ADD", my, math_node(nt, "MULTIPLY", cw, math_node(nt, "SUBTRACT", my_cw, my)))
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
    # derrière un mur-rideau, des plafonniers de bureau : blanc neutre à froid
    tint_cw = math_node(nt, "ADD", 0.5, math_node(nt, "MULTIPLY", math_node(nt, "FRACT", math_node(nt, "ADD", math_node(nt, "MULTIPLY", wn.outputs["Color"], 0.3), math_node(nt, "MULTIPLY", bld, 5.3))), 0.43))
    tint = math_node(nt, "ADD", tint, math_node(nt, "MULTIPLY", cw, math_node(nt, "SUBTRACT", tint_cw, tint)))
    nt.links.new(tint, ramp.inputs[0])
    # éclat très variable : stores baissés, lampes de bureau, plafonniers
    gain = math_node(nt, "ADD", 0.12, math_node(nt, "POWER", math_node(nt, "MULTIPLY", wn.outputs["Color"], wn2.outputs["Value"]), 2.2))
    # un mur-rideau est vitré presque partout : chaque travée éclaire moins
    gain = math_node(nt, "MULTIPLY", gain, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MULTIPLY", cw, 0.4)))
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
    # vitrage d'un mur-rideau éteint : la veilleuse des circulations, à peine
    dim = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", cw, glass), math_node(nt, "SUBTRACT", 1.0, lit))
    nt.links.new(math_node(nt, "MULTIPLY", math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MAXIMUM", lit, dim)), 1.0, clamp=True), em.inputs["Factor"])
    nt.links.new(ramp.outputs["Color"], em.inputs["A"])
    em.inputs["B"].default_value = (1.0, 0.5, 0.22, 1)
    nt.links.new(em.outputs["Result"], bsdf.inputs["Emission Color"])
    up = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", up, math_node(nt, "SUBTRACT", 1.0, math_node(nt, "MAXIMUM", math_node(nt, "MULTIPLY", lit, glass), dim))), 0.12)
    glow = math_node(nt, "MULTIPLY", dim, math_node(nt, "ADD", 0.02, math_node(nt, "MULTIPLY", wn2.outputs["Value"], 0.08)))
    nt.links.new(math_node(nt, "ADD", math_node(nt, "ADD", strength, up), glow), bsdf.inputs["Emission Strength"])
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


def sign_material():
    """Enseignes génériques en haut des tours : un logo rond et un mot en
    capitales lumineuses, sans aucune vraie marque. uv : u en hauteurs
    d'enseigne depuis la gauche, v de 0 à 1 ; « k » varie le dessin."""
    mat = bpy.data.materials.new("signs")
    mat.cycles.emission_sampling = "NONE"
    nt, out = nodes(mat)
    uv = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs[0], sep.inputs[0])
    u, v = sep.outputs["X"], sep.outputs["Y"]
    k = attr(nt, "k")
    # le logo : un disque, ou un anneau (k > 0,5)
    r = math_node(nt, "SQRT", math_node(nt, "ADD", math_node(nt, "POWER", math_node(nt, "SUBTRACT", u, 0.5), 2.0), math_node(nt, "POWER", math_node(nt, "SUBTRACT", v, 0.5), 2.0)))
    disc = math_node(nt, "LESS_THAN", r, 0.42)
    hole = math_node(nt, "MULTIPLY", math_node(nt, "LESS_THAN", r, 0.24), math_node(nt, "GREATER_THAN", k, 0.5))
    logo = math_node(nt, "SUBTRACT", disc, hole)
    # les lettres : des pavés aux creux tirés au hasard
    lu = math_node(nt, "DIVIDE", math_node(nt, "SUBTRACT", u, 1.2), 0.62)
    cell, fu = math_node(nt, "FLOOR", lu), math_node(nt, "FRACT", lu)
    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(cell, comb.inputs[0])
    nt.links.new(math_node(nt, "FLOOR", math_node(nt, "MULTIPLY", v, 3.0)), comb.inputs[1])
    nt.links.new(math_node(nt, "MULTIPLY", k, 113.0), comb.inputs[2])
    wn = nt.nodes.new("ShaderNodeTexWhiteNoise")
    wn.noise_dimensions = "3D"
    nt.links.new(comb.outputs[0], wn.inputs["Vector"])
    stroke = math_node(nt, "MULTIPLY", math_node(nt, "LESS_THAN", fu, 0.76), math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", v, 0.2), math_node(nt, "LESS_THAN", v, 0.8)))
    gap = math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", wn.outputs["Value"], 0.55), math_node(nt, "MULTIPLY", math_node(nt, "GREATER_THAN", fu, 0.24), math_node(nt, "LESS_THAN", fu, 0.52)))
    letters = math_node(nt, "MULTIPLY", math_node(nt, "MULTIPLY", stroke, math_node(nt, "SUBTRACT", 1.0, gap)), math_node(nt, "GREATER_THAN", lu, 0.0))
    mask = math_node(nt, "MAXIMUM", logo, letters, clamp=True)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.interpolation = "CONSTANT"
    for i, (pos, col) in enumerate(((0.0, (0.92, 0.95, 1.0)), (0.35, (0.3, 0.62, 1.0)), (0.6, (1.0, 0.18, 0.12)), (0.8, (0.2, 0.95, 0.75)))):
        e = cr.elements[i] if i < 2 else cr.elements.new(pos)
        e.position, e.color = pos, (*col, 1)
    nt.links.new(attr(nt, "c"), ramp.inputs[0])
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(ramp.outputs[0], em.inputs["Color"])
    nt.links.new(math_node(nt, "MULTIPLY", mask, math_node(nt, "MULTIPLY", attr(nt, "s"), 9.0)), em.inputs["Strength"])
    # hors des lettres, l'enseigne est transparente : on voit la façade derrière
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(mask, mix.inputs[0])
    nt.links.new(tr.outputs[0], mix.inputs[1])
    nt.links.new(fogged(nt, None, em.outputs[0], 0.9), mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
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


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.dont_write_bytecode = True
import osm  # noqa: E402  (à côté de ce fichier)
from mathutils import Vector  # noqa: E402
from mathutils.geometry import tessellate_polygon  # noqa: E402

FRAME = osm.Frame(EYE_LAT, EYE_LON, 0.0)
HEADING = math.degrees(math.atan2(*FRAME.xy(*TARGET)))  # le cap qui met la cible au centre
FRAME = osm.Frame(EYE_LAT, EYE_LON, HEADING)
print(f"[city] œil {EYE_LAT}, {EYE_LON}, cap {HEADING:.1f}°")


def in_view(x, y, margin=8.0):
    """Dans le champ des baies, devant, et avant l'horizon de brume."""
    if y < 30:
        return False
    return abs(math.degrees(math.atan2(x, y))) < ARC / 2 + margin and math.hypot(x, y) < FAR


def hrand(i, salt=0):
    """Un tirage propre à un objet OSM : le même à chaque calcul."""
    return random.Random(i * 7919 + salt)


def ring_area(ring):
    return 0.5 * sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:] + ring[:1]))


HOUSES = {"house", "detached", "semidetached_house", "terrace", "bungalow", "villa"}
SHEDS = {"garage", "garages", "shed", "hut", "kiosk", "cabin", "service", "toilets", "transformer_tower"}
LOW = {"industrial", "warehouse", "retail", "supermarket", "commercial", "train_station", "sports_hall", "church", "school"}
OFFICE = {"office", "tower", "skyscraper", "government", "commercial", "hotel", "civic"}
HOMES = {"apartments", "residential", "dormitory"}


def massing(tags, r, area):
    """Hauteur, bas, style de façade d'un bâtiment, d'après ses tags OSM
    (height, min_height, building:levels…), sinon des valeurs plausibles
    pour la banlieue ouest de Paris."""
    kind = tags.get("building", "yes")
    if kind == "yes":
        kind = tags.get("building:part", "yes")
    officeish = kind in OFFICE or "office" in tags
    lh = 3.7 if officeish else 3.1  # hauteur d'un étage
    h = osm.num(tags.get("height"))
    lv = osm.num(tags.get("building:levels"))
    if h is None and lv is not None:
        h = lv * lh + 1.0 + (osm.num(tags.get("roof:levels")) or 0) * 2.6
    if h is None:
        if kind in SHEDS or area < 40:
            h = r.uniform(3, 5)
        elif kind in HOUSES or area < 110:
            h = r.uniform(6.5, 10)
        elif kind in LOW:
            h = r.uniform(8, 14)
        elif officeish:
            h = r.uniform(16, 30)
        else:  # immeubles de rapport, R+4 à R+7
            h = r.uniform(14, 24)
    minh = osm.num(tags.get("min_height"))
    if minh is None:
        minh = (osm.num(tags.get("building:min_level")) or 0) * lh
    # façade : murs-rideaux pour les tours de bureaux, bandeaux, fenêtres percées
    mat = (tags.get("building:material", "") + tags.get("building:facade:material", "")).lower()
    x = r.random()
    if "glass" in mat:
        style = 1.0
    elif kind in HOMES or kind in HOUSES:
        style = 0.5 if (h > 40 and x < 0.4) or x < 0.08 else 0.0
    elif h >= 60:
        style = 1.0 if x < 0.75 else 0.5 if x < 0.95 else 0.0
    elif officeish:
        style = 1.0 if x < 0.4 else 0.5 if x < 0.85 else 0.0
    elif kind in LOW:
        style = 0.5 if x < 0.3 else 0.0
    else:
        style = 0.5 if h > 12 and x < 0.15 else 0.0
    return h, minh, style, officeish


def extrude(m, ring, holes, z0, z1, bld, style):
    """Murs (uv en mètres, pour la trame des fenêtres) et toit d'une emprise."""
    for rg in [ring] + holes:
        u = (bld * 997) % 40
        for i in range(len(rg)):
            p, q = rg[i], rg[(i + 1) % len(rg)]
            L = math.hypot(q[0] - p[0], q[1] - p[1])
            if L < 0.2:
                continue
            m.face([(p[0], p[1], z0), (q[0], q[1], z0), (q[0], q[1], z1), (p[0], p[1], z1)], [(u, z0), (u + L, z0), (u + L, z1), (u, z1)], bld=bld, style=style)
            u += L
    for z in ((z1, z0) if z0 > 2.5 else (z1,)):  # le dessous d'un volume suspendu se voit
        if not holes:
            m.face([(x, y, z) for x, y in ring], roof=1.0, bld=bld)
            continue
        loops = [[Vector((x, y, z)) for x, y in rg] for rg in [ring] + holes]
        flat = [p for lp in loops for p in lp]
        for tri in tessellate_polygon(loops):
            m.face([tuple(flat[k]) for k in tri], roof=1.0, bld=bld)


def corners(ring, n):
    """Les n points les plus en saillie d'un contour (pour les feux d'obstacle)."""
    cx, cy = sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring)
    dirs = [(1, 1), (-1, -1), (1, -1), (-1, 1)][:n]
    return [max(ring, key=lambda p: (p[0] - cx) * dx + (p[1] - cy) * dy) for dx, dy in dirs]


def sign(signs, ring, h, r):
    """Une enseigne générique sur la façade la plus tournée vers l'œil, en haut."""
    ccw = ring_area(ring) > 0
    best, score = None, 0.0
    for i in range(len(ring)):
        p, q = ring[i], ring[(i + 1) % len(ring)]
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        if L < 12:
            continue
        tx, ty = (q[0] - p[0]) / L, (q[1] - p[1]) / L
        nx, ny = (ty, -tx) if ccw else (-ty, tx)  # normale sortante
        mx, my = (p[0] + q[0]) / 2, (p[1] + q[1]) / 2
        d = math.hypot(mx, my)
        facing = -(nx * mx + ny * my) / d
        if facing > 0.45 and facing * min(L, 45) > score:
            best, score = (mx, my, nx, ny, L), facing * min(L, 45)
    if not best:
        return False
    mx, my, nx, ny, L = best
    letters = r.randint(3, 7)
    sh = min(max(L * 0.1, 2.2), 5.5)
    W = sh * (1.2 + 0.62 * letters - 0.15)
    if W > 0.85 * L:
        sh *= 0.85 * L / W
        W = 0.85 * L
    rx, ry = -ny, nx  # la droite de qui regarde l'enseigne
    ox, oy = mx + nx * 0.5, my + ny * 0.5
    a, b = (ox - rx * W / 2, oy - ry * W / 2), (ox + rx * W / 2, oy + ry * W / 2)
    zt = h - r.uniform(1.5, 3.5)
    signs.face([(a[0], a[1], zt - sh), (b[0], b[1], zt - sh), (b[0], b[1], zt), (a[0], a[1], zt)], [(0, 0), (W / sh, 0), (W / sh, 1), (0, 1)], c=r.choice((0.0, 0.0, 0.4, 0.4, 0.7, 0.9)), s=r.uniform(0.6, 1.0), k=r.random())
    return True


def billboard(m, x, y, z, size, **vals):
    """Un petit carré tourné vers l'œil : un point lumineux lisible même au loin."""
    dx, dy = x, y
    L = math.hypot(dx, dy) or 1.0
    ux, uy = -dy / L * size / 2, dx / L * size / 2
    h = size / 2
    m.face([(x - ux, y - uy, z - h), (x + ux, y + uy, z - h), (x + ux, y + uy, z + h), (x - ux, y - uy, z + h)], **vals)


# demi-largeur (m), lueur au sol, pas des réverbères (m), voitures par 100 m et par sens
ROAD = {
    "motorway": (11.0, 0.75, 42, 3.0),
    "trunk": (9.0, 1.0, 30, 2.4),
    "primary": (8.0, 1.0, 30, 1.8),
    "secondary": (6.5, 0.85, 30, 1.1),
    "tertiary": (5.5, 0.7, 32, 0.5),
    "link": (4.0, 0.75, 34, 0.7),
    "residential": (4.0, 0.5, 34, 0.1),
    "unclassified": (4.0, 0.5, 36, 0.1),
    "living_street": (3.0, 0.4, 36, 0.0),
    "pedestrian": (3.5, 0.45, 26, 0.0),
}


def street(ground, lamps, traffic, rd):
    t = rd["tags"]
    kind = t["highway"]
    half, glow, step, cars = ROAD["link" if kind.endswith("_link") else kind]
    r = hrand(rd["id"], 1)
    led = 0.6 if r.random() < 0.5 else 0.0  # LED blanches ou vieux sodium, rue par rue
    oneway = {"yes": 1, "true": 1, "1": 1, "-1": -1}.get(t.get("oneway"), 1 if kind in ("motorway", "motorway_link") else 0)
    major = cars >= 1.0
    pts = rd["pts"]
    acc = r.uniform(0, step)
    side = 1
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        L = math.hypot(bx - ax, by - ay)
        if L < 0.1:
            continue
        tx, ty = (bx - ax) / L, (by - ay) / L
        nx, ny = -ty, tx
        n = max(1, math.ceil(L / 25))
        for k in range(n):
            f0, f1 = k / n, (k + 1) / n
            p0 = (ax + (bx - ax) * f0, ay + (by - ay) * f0)
            p1 = (ax + (bx - ax) * f1, ay + (by - ay) * f1)
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            seg = L / n
            if not in_view(mx, my, 15) or math.hypot(mx, my) < 200:
                acc = (acc + seg) % step
                continue
            ground.face([(p0[0] - nx * half, p0[1] - ny * half, 0.05), (p1[0] - nx * half, p1[1] - ny * half, 0.05), (p1[0] + nx * half, p1[1] + ny * half, 0.05), (p0[0] + nx * half, p0[1] + ny * half, 0.05)], c=glow * r.uniform(0.8, 1.1))
            # réverbères, des deux côtés sur les grands axes, en quinconce ailleurs
            acc += seg
            while acc >= step:
                acc -= step
                f = 1 - acc / seg
                lx, ly = p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f
                for s in (-1, 1) if major or kind == "pedestrian" else (side,):
                    billboard(lamps, lx + nx * s * (half - 0.8), ly + ny * s * (half - 0.8), 9.0 if major else 6.5, 1.8 if major else 1.4, c=led, s=r.uniform(0.7, 1.0))
                side = -side
            # la circulation : phares quand elle vient vers l'œil, feux arrière sinon
            for d in (oneway,) if oneway else (1, -1):
                expect = cars * seg / 100
                for _ in range(int(expect + r.random())):
                    f = r.random()
                    cx, cy = p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f
                    dx, dy = tx * d, ty * d
                    lane = r.uniform(-half + 1.5, half - 1.5) if oneway else r.uniform(1.2, half - 1.2)
                    cx, cy = cx + dy * lane, cy - dx * lane  # à droite du sens de marche
                    col = 0.6 if dx * cx + dy * cy < 0 else 0.0
                    billboard(traffic, cx, cy, 0.8, 1.1, c=col, s=r.uniform(0.5, 1.0))


def build_city():
    data = osm.load(FRAME, AREA)
    facade = facade_material()
    lights = emissive_material("lamps", [(0.0, (1.0, 0.5, 0.18)), (0.5, (1.0, 0.86, 0.66))], 26.0)
    cars = emissive_material("cars", [(0.0, (1.0, 0.05, 0.02)), (0.5, (1.0, 0.9, 0.75))], 40.0)
    beacon_mat = emissive_material("beacons", [(0.0, (1.0, 0.04, 0.02)), (0.5, (1.0, 1.0, 1.0))], 60.0, k=0.8)
    crown_mat = emissive_material("crowns", [(0.0, (0.85, 0.92, 1.0)), (0.4, (1.0, 0.75, 0.45)), (0.8, (0.35, 0.65, 1.0)), (0.95, (1.0, 0.25, 0.55))], 14.0, k=0.9)
    m = Mesh("towers", facade, ("bld", "roof", "style"))
    beacons = Mesh("beacons", beacon_mat, ("c", "s"))
    crowns = Mesh("crowns", crown_mat, ("c", "s"))
    signs = Mesh("signs", sign_material(), ("c", "s", "k"))
    lamps = Mesh("lamps", lights, ("c", "s"))
    traffic = Mesh("traffic", cars, ("c", "s"))
    ground = Mesh("ground", ground_material(), ("c",))

    count = tall = 0
    for b in data["buildings"]:
        ring = b["outer"][:-1]
        holes = [h[:-1] for h in b["holes"] if len(h) >= 4]
        if len(ring) < 3:
            continue
        cx, cy = sum(x for x, _ in ring) / len(ring), sum(y for _, y in ring) / len(ring)
        if not in_view(cx, cy, 10) or osm.inside((0.0, 0.0), b["outer"]):
            continue
        tags = b["tags"]
        if tags.get("building") in ("roof", "carport", "no") or tags.get("building:part") == "roof" or tags.get("location") == "underground" or (osm.num(tags.get("layer")) or 0) < 0:
            continue
        r = hrand(b["id"])
        area = abs(ring_area(ring))
        h, minh, style, officeish = massing(tags, r, area)
        if h - minh < 1.0:
            continue
        bld = r.random()
        extrude(m, ring, holes, minh, h, bld, style)
        count += 1
        if h < 120 and minh == 0 and area > 250 and r.random() < 0.35 and osm.inside((cx, cy), b["outer"]):
            # locaux techniques et machineries sur le toit
            s = math.sqrt(area) * r.uniform(0.12, 0.25)
            q = [(cx - s, cy - s * 0.7), (cx + s, cy - s * 0.7), (cx + s, cy + s * 0.7), (cx - s, cy + s * 0.7)]
            extrude(m, q, [], h, h + r.uniform(2.5, 5), bld, 0.0)
        if h > 90 and minh < h - 20:
            tall += 1
            for c in corners(ring, 2 if h < 160 else 4):  # feux d'obstacle rouges aux angles du toit
                billboard(beacons, c[0], c[1], h + 1.5, 1.6, c=0.0, s=r.uniform(0.6, 1.0))
            if r.random() < 0.4:  # couronne éclairée
                col, st = r.choice((0.0, 0.0, 0.5, 0.9, 0.97)), r.uniform(0.5, 1.0)
                big = [(cx + (x - cx) * 1.01 + 0.4 * (x > cx) - 0.4 * (x < cx), cy + (y - cy) * 1.01 + 0.4 * (y > cy) - 0.4 * (y < cy)) for x, y in ring]
                for i in range(len(big)):
                    p, q = big[i], big[(i + 1) % len(big)]
                    crowns.face([(p[0], p[1], h - 6), (q[0], q[1], h - 6), (q[0], q[1], h - 1), (p[0], p[1], h - 1)], c=col, s=st)
        if (h >= 90 and r.random() < 0.3) or (officeish and 25 <= h < 90 and r.random() < 0.08):
            sign(signs, ring, h, r)
    print(f"[city] {count} bâtiments, dont {tall} de plus de 90 m")

    for rd in data["roads"]:
        street(ground, lamps, traffic, rd)

    water = Mesh("water", water_material())
    for wa in data["water"]:
        ring = wa["outer"][:-1]
        xs, ys = [x for x, _ in ring], [y for _, y in ring]
        if max(ys) < 0 or min(ys) > FAR or max(xs) < -FAR or min(xs) > FAR:
            continue
        loops = [[Vector((x, y, 0.02)) for x, y in rg] for rg in [ring] + [h[:-1] for h in wa["holes"]]]
        flat = [p for lp in loops for p in lp]
        for tri in tessellate_polygon(loops):
            water.face([tuple(flat[k]) for k in tri])
    # sol sous tout le reste
    ground.face([(-FAR * 2, -FAR, 0.0), (FAR * 2, -FAR, 0.0), (FAR * 2, FAR * 1.5, 0.0), (-FAR * 2, FAR * 1.5, 0.0)], c=0.0)
    for mesh in (m, beacons, crowns, signs, lamps, traffic, ground, water):
        if mesh.faces:
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
cam.clip_end = FAR * 1.5  # 1 km par défaut : la ville s'arrêtait là
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
scene.view_settings.exposure = -0.3  # nuit profonde : la ville ne vole pas la vedette au dev
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
