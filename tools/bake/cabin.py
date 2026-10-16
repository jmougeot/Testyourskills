# La lumière de la cabine d'ascenseur, calculée dans Blender (Cycles).
#
#   blender -b -P tools/bake/cabin.py -- [--samples 1024] [--preview] [--cpu]
#
# La cabine reste construite en code (web/src/three/cabin.ts) : ses portes,
# son afficheur, ses boutons et ses filets changent par carte ou bougent. Ici on
# la reconstruit aux mêmes cotes, matières comprises (noyer, pierre, inox des
# mains courantes, de la façade et des portes fermées, verre noir), on l'éclaire
# avec ses six spots et on précalcule la lumière que reçoivent ses cinq grandes
# surfaces : les deux parois, le fond, le sol, le plafond. Vrais rebonds (la
# pierre éclaire le plafond, l'inox renvoie les spots), festons des faisceaux,
# ombres de contact des mains courantes, de leurs platines, de la plinthe et de
# la façade. Écrit :
#   web/public/3d/cabin-lm.webp      l'atlas des cinq surfaces, en couleur ;
#   web/src/three/cabinLight.json    son échelle et la place de chaque surface.
#
# Les outils de construction (boîtes, cylindres, matières, lumières, repère)
# sont ceux de tools/bake/office.py, repris tels quels sans exécuter ce script.
import argparse
import ast
import json
import math
import os
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--samples", type=int, default=1024)
ap.add_argument("--density", type=float, default=128, help="texels par mètre")
ap.add_argument("--preview", action="store_true", help="petit calcul rapide pour la mise au point")
ap.add_argument("--out", default=None, help="dossier de sortie (par défaut web/public/3d et web/src/three)")
ap.add_argument("--cpu", action="store_true", help="calcul sur le processeur (si Metal est indisponible)")
args = ap.parse_args(argv)
if args.preview:
    args.samples = 64

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT_IMG = args.out or os.path.join(ROOT, "web", "public", "3d")
OUT_META = args.out or os.path.join(ROOT, "web", "src", "three")

# ---------- les outils d'office.py, sans exécuter le décor ----------
# On ne garde de son arbre syntaxique que les définitions voulues ; elles
# vivent dans `kit`, qui leur sert de variables globales (meshes, lights, scene).
HELPERS = {"srgb", "three_matrix", "put", "box", "cylinder", "ellipsoid", "add_light"}
CONSTANTS = {"TO_BLENDER", "FACES"}
with open(os.path.join(HERE, "office.py"), encoding="utf-8") as f:
    tree = ast.parse(f.read())
picked = [
    n
    for n in tree.body
    if (isinstance(n, ast.FunctionDef) and n.name in HELPERS)
    or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in CONSTANTS for t in n.targets))
]
kit = {"bpy": bpy, "bmesh": bmesh, "math": math, "Matrix": Matrix, "Vector": Vector, "Euler": Euler, "np": np}
exec(compile(ast.Module(body=picked, type_ignores=[]), "office.py", "exec"), kit)
missing = (HELPERS | CONSTANTS) - set(kit)
if missing:
    sys.exit(f"[cabin] office.py ne fournit plus : {sorted(missing)}")
box, cylinder, ellipsoid, put, srgb, add_light = (kit[k] for k in ("box", "cylinder", "ellipsoid", "put", "srgb", "add_light"))
TO_BLENDER = kit["TO_BLENDER"]

# ---------- la scène ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "NONE" if args.cpu else "METAL"
prefs.get_devices()
for d in prefs.devices:
    d.use = True
scene.cycles.device = "CPU" if args.cpu else "GPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = False
scene.cycles.max_bounces = 8
scene.cycles.diffuse_bounces = 6
scene.cycles.glossy_bounces = 3
scene.cycles.transmission_bounces = 0
scene.cycles.sample_clamp_indirect = 4.0
# l'inox renvoie les spots sur les parois ; flouter ces chemins évite le bruit
scene.cycles.blur_glossy = 1.0
scene.world = bpy.data.worlds.new("gaine")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
kit["scene"] = scene
kit["meshes"] = meshes = {}
kit["lights"] = lights = {"cabin": []}
kit["BASIS"] = TO_BLENDER.to_3x3()

# ---------- les cotes de cabin.ts (mètres ; sol en y = 0, portes en z = 0, cabine vers +z) ----------
CAB_W, CAB_H, CAB_D = 2.1, 2.45, 2.6
DOOR_W, DOOR_H = 1.0, 2.1
KICK = 0.12
RAIL = {"y": 0.92, "inset": 0.065, "r": 0.019, "z0": 0.45, "z1": CAB_D - 0.25}
DOWNLIGHTS = [(x, z) for x in (-0.5, 0.5) for z in (0.5, 1.3, 2.1)]
SIDE_W = (CAB_W - DOOR_W) / 2
PANEL_X = DOOR_W / 2 + SIDE_W / 2


def lin(hex_, k=(1.0, 1.0, 1.0)):
    return tuple(c * m for c, m in zip(srgb(hex_), k))


def material(name, rgb, rough=0.6, metal=0.0, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Coat Weight"].default_value = coat
    return m


# Les albédos de cabin.ts : couleur × moyenne de la texture (noyer Poly Haven,
# dalles de pierre dessinées en code), pour que la lumière renvoyée ait la bonne teinte.
WALNUT_TEX = (0.3409, 0.2021, 0.1201)
MATS = {
    "walnut": material("walnut", lin(0x857D76, WALNUT_TEX), 0.55),
    "stone": material("stone", lin(0xC9C6C0, (0.2, 0.196, 0.19)), 0.42, coat=0.35),
    "ceiling": material("ceiling", lin(0x6B6259), 0.5, metal=0.3),
    "steel": material("steel", lin(0xC4C9CF), 0.2, metal=1.0),
    "brushed": material("brushed", lin(0x9AA1A8), 0.3, metal=1.0),
    "doors": material("doors", lin(0x6F767D), 0.45, metal=1.0),
    "glass": material("glass", lin(0x040506), 0.06),
    "reveal": material("reveal", lin(0x0D0B0A), 0.8),
}

# ---------- les surfaces précalculées : les plans de cabin.ts (BakePlane) ----------
V3 = Vector
PLANES = {
    "left": dict(origin=V3((-CAB_W / 2, 0, 0)), u=V3((0, 0, 1)), v=V3((0, 1, 0)), w=CAB_D, h=CAB_H, n=V3((1, 0, 0)), mat="walnut"),
    "right": dict(origin=V3((CAB_W / 2, 0, 0)), u=V3((0, 0, 1)), v=V3((0, 1, 0)), w=CAB_D, h=CAB_H, n=V3((-1, 0, 0)), mat="walnut"),
    "back": dict(origin=V3((-CAB_W / 2, 0, CAB_D)), u=V3((1, 0, 0)), v=V3((0, 1, 0)), w=CAB_W, h=CAB_H, n=V3((0, 0, -1)), mat="walnut"),
    "floor": dict(origin=V3((-CAB_W / 2, 0, 0)), u=V3((1, 0, 0)), v=V3((0, 0, 1)), w=CAB_W, h=CAB_D, n=V3((0, 1, 0)), mat="stone"),
    "ceiling": dict(origin=V3((-CAB_W / 2, CAB_H, 0)), u=V3((1, 0, 0)), v=V3((0, 0, 1)), w=CAB_W, h=CAB_D, n=V3((0, -1, 0)), mat="ceiling"),
}
# les panneaux de noyer sont à 2 mm de la paroi, en avant de rien
INSET = {"left": 0.002, "right": 0.002, "back": 0.002, "floor": 0.0, "ceiling": 0.0}

# ---------- ce qui reçoit la lumière, et ce qui porte une ombre ----------
# la façade : deux retours et l'imposte, en inox brossé, face intérieure en z = 0
for sx in (-1, 1):
    box("brushed", SIDE_W, CAB_H, 0.12, sx * (DOOR_W / 2 + SIDE_W / 2), CAB_H / 2, -0.06, bevel=0.008)
box("brushed", DOOR_W + 0.016, CAB_H - DOOR_H, 0.12, 0, (DOOR_H + CAB_H) / 2, -0.06, bevel=0.008)
# les portes fermées, en retrait, et le seuil
for sx in (-1, 1):
    box("doors", DOOR_W / 2 - 0.004, DOOR_H, 0.035, sx * DOOR_W / 4, DOOR_H / 2, -0.06, bevel=0.005)
box("steel", DOOR_W + 0.02, 0.01, 0.16, 0, 0.005, -0.04)
# le rideau de sécurité, l'afficheur, la boîte à boutons, la plaque de charge
for sx in (-1, 1):
    box("glass", 0.016, DOOR_H - 0.04, 0.012, sx * (DOOR_W / 2 - 0.004), DOOR_H / 2 + 0.01, 0.004)
box("glass", 0.96 + 0.05, 0.22 + 0.05, 0.01, 0, (DOOR_H + CAB_H) / 2, 0.004)
box("glass", 0.16, 0.98, 0.012, PANEL_X, 1.18, 0.006, bevel=0.005)
box("brushed", 0.15, 0.06, 0.003, -PANEL_X, 1.62, 0.0015)
# plinthes inox
for sx in (-1, 1):
    box("brushed", 0.006, KICK, CAB_D, sx * (CAB_W / 2 - 0.003), KICK / 2, CAB_D / 2)
box("brushed", CAB_W, KICK, 0.006, 0, KICK / 2, CAB_D - 0.003)
# les mains courantes sur platines
for sx in (-1, 1):
    rx = sx * (CAB_W / 2 - RAIL["inset"])
    length = RAIL["z1"] - RAIL["z0"]
    cylinder("steel", RAIL["r"], RAIL["r"], length, rx, RAIL["y"], RAIL["z0"] + length / 2, seg=24, rx=math.pi / 2)
    for z in (RAIL["z0"], RAIL["z1"]):
        ellipsoid("steel", RAIL["r"], RAIL["r"], RAIL["r"], Matrix.Translation((rx, RAIL["y"], z)))
    for z in (0.5, CAB_D / 2 + 0.2, CAB_D - 0.3):
        cylinder("steel", 0.011, 0.011, 0.06, sx * (CAB_W / 2 - 0.035), RAIL["y"], z, seg=12, rz=math.pi / 2)
        cylinder("steel", 0.028, 0.028, 0.008, sx * (CAB_W / 2 - 0.006), RAIL["y"], z, seg=20, rz=math.pi / 2)
# le plafond : joints creux, cerclages des spots, dôme de la caméra
for z in (0.9, 1.75):
    box("reveal", CAB_W, 0.004, 0.008, 0, CAB_H - 0.002, z)
for x, z in DOWNLIGHTS:
    cylinder("steel", 0.062, 0.062, 0.004, x, CAB_H - 0.002, z, seg=24)
ellipsoid("glass", 0.045, 0.045, 0.045, Matrix.Translation((CAB_W / 2 - 0.16, CAB_H, 0.18)))


def receiver(name, pl):
    """Le plan de cabin.ts, uv 0..1 sur toute sa surface, normale vers l'intérieur."""
    tmp = bmesh.new()
    o = pl["origin"] + pl["n"] * INSET[name]
    corners = [o, o + pl["u"] * pl["w"], o + pl["u"] * pl["w"] + pl["v"] * pl["h"], o + pl["v"] * pl["h"]]
    uvs = [(0, 0), (1, 0), (1, 1), (0, 1)]
    if pl["u"].cross(pl["v"]).dot(pl["n"]) < 0:
        corners, uvs = corners[::-1], uvs[::-1]
    face = tmp.faces.new([tmp.verts.new(c) for c in corners])
    layer = tmp.loops.layers.uv.new("lightmap")
    for loop, uv in zip(face.loops, uvs):
        loop[layer].uv = uv
    me = bpy.data.meshes.new(name)
    tmp.to_mesh(me)
    tmp.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    ob.matrix_world = TO_BLENDER
    # une matière par surface : chacune reçoit sa propre image
    mat = MATS[pl["mat"]].copy()
    mat.name = f"bake-{name}"
    me.materials.append(mat)
    return ob


receivers = {name: receiver(name, pl) for name, pl in PLANES.items()}
for name, bm in meshes.items():
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(MATS[name])
    ob.matrix_world = TO_BLENDER

# ---------- les six spots ----------
# Faisceau d'environ 80° à bord doux, source de 6 cm : sur les parois, les arcs
# (« festons ») des vraies cabines. Comme un vrai luminaire, un peu de lumière
# déborde du faisceau (le diffuseur, le cerclage) : une seconde source, très
# large et faible, qui éclaire le haut des parois sans toucher le plafond.
# Blanc chaud, comme les disques de cabin.ts.
WARM = (1.0, 0.93, 0.85)
for x, z in DOWNLIGHTS:
    for power, cone, blend in ((14.0, 80, 0.3), (1.2, 165, 0.6)):
        s = add_light("cabin", "SPOT", (x, CAB_H - 0.012, z), (0, -1, 0), power, spot=(math.radians(cone), blend), color=WARM)
        s.data.shadow_soft_size = 0.03

# ---------- le précalcul ----------
res = {name: (max(8, round(pl["w"] * args.density)), max(8, round(pl["h"] * args.density))) for name, pl in PLANES.items()}
images = {}
for name, ob in receivers.items():
    w, h = res[name]
    img = bpy.data.images.new(f"lm-{name}", w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    mat = ob.data.materials[0]
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    images[name] = img

bake = scene.render.bake
bake.margin = 4
bake.margin_type = "EXTEND"
bpy.ops.object.select_all(action="DESELECT")
for ob in receivers.values():
    ob.select_set(True)
bpy.context.view_layer.objects.active = next(iter(receivers.values()))
t = time.time()
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=4)
print(f"[cabin] précalcul : {time.time() - t:.1f} s ({args.samples} échantillons)", flush=True)

# ---------- l'atlas ----------
# Rangées de surfaces, 4 texels de bord recopiés autour de chacune (filtrage
# linéaire sans mipmaps : rien ne déborde d'une surface sur l'autre).
PAD = 4
ROWS_LAYOUT = [["left", "right", "back"], ["floor", "ceiling"]]
pixels = {}
for name, img in images.items():
    w, h = res[name]
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    pixels[name] = px.reshape(h, w, 4)[..., :3]
# léger lissage : le bruit restant de Cycles, pas les festons (3 texels ≈ 2 cm)
def soften(a):
    k = np.array([0.25, 0.5, 0.25], np.float32)
    a = np.pad(a, ((1, 1), (1, 1), (0, 0)), mode="edge")
    a = k[0] * a[:-2] + k[1] * a[1:-1] + k[2] * a[2:]
    return k[0] * a[:, :-2] + k[1] * a[:, 1:-1] + k[2] * a[:, 2:]


pixels = {n: soften(p) for n, p in pixels.items()}
W = max(sum(res[n][0] + 2 * PAD for n in row) for row in ROWS_LAYOUT)
H = sum(max(res[n][1] + 2 * PAD for n in row) for row in ROWS_LAYOUT)
W, H = (int(math.ceil(v / 4) * 4) for v in (W, H))
atlas = np.zeros((H, W, 3), np.float32)
rects = {}
y = 0
for row in ROWS_LAYOUT:
    x = 0
    for n in row:
        w, h = res[n]
        atlas[y : y + h + 2 * PAD, x : x + w + 2 * PAD] = np.pad(pixels[n], ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge")
        # rect en texels, origine en bas à gauche (comme les uv et les pixels de Blender)
        rects[n] = [x + PAD, y + PAD, w, h]
        x += w + 2 * PAD
    y += max(res[n][1] + 2 * PAD for n in row)

# Cycles donne la lumière diffuse sortante pour un albédo de 1 (E / π) ; on la
# stocke en sRGB 8 bits, le 99,9e centile à 1 (seuls les points chauds saturent).
scale = float(np.percentile(atlas.max(axis=2), 99.9))
enc = np.clip(atlas / scale, 0, 1)
enc = np.where(enc <= 0.0031308, enc * 12.92, 1.055 * np.power(enc, 1 / 2.4) - 0.055)
out = bpy.data.images.new("cabin-lm", W, H, alpha=False, float_buffer=False)
out.colorspace_settings.name = "Non-Color"
rgba = np.ones((H, W, 4), np.float32)
rgba[..., :3] = enc
out.pixels.foreach_set(rgba.ravel())
out.file_format = "WEBP"
os.makedirs(OUT_IMG, exist_ok=True)
out.save(filepath=os.path.join(OUT_IMG, "cabin-lm.webp"), quality=85)
# three.js : lumière diffuse = irradiance × albédo / π, et on stocke E / π
meta = {"size": [W, H], "scale": round(scale * math.pi, 5), "rects": rects}
os.makedirs(OUT_META, exist_ok=True)
with open(os.path.join(OUT_META, "cabinLight.json"), "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
    f.write("\n")
if args.out:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out, "cabin-bake.blend"))
print("[cabin] terminé :", json.dumps(meta), flush=True)
