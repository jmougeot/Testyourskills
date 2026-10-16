# Prépare les modèles tiers de la scène 3D (Sketchfab, CC BY) pour le web.
#
#   SKETCHFAB_API_KEY=… blender -b -P tools/bake/prepare.py [-- nom.glb …]
#
# Télécharge chaque modèle (cache : tools/bake/.cache, hors dépôt), le remet
# aux cotes réelles, l'oriente comme la scène (repère three.js : y en haut ;
# l'utilisateur de l'objet est du côté -z : l'assis du fauteuil regarde vers
# -z, la dalle d'un écran et l'avant d'un clavier sont tournés vers -z),
# pose son origine au sol, au centre, compresse ses textures en WebP et sa
# géométrie en meshopt, et l'écrit dans web/public/3d. La dalle d'un écran
# reste un maillage à part, nommé « screen », pour que la scène y affiche son
# propre contenu. Un personnage riggé garde son squelette au repos, sans
# animation, avec des noms d'os courts (« upperarm_l »), et regarde vers +z.
# Les crédits sont dans web/public/3d/CREDITS.txt.
import json
import math
import os
import re
import sys
import urllib.request

import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.join(ROOT, "tools", "bake", ".cache")
OUT = os.path.join(ROOT, "web", "public", "3d")

# face : comment trouver l'avant du modèle — "back" (le dossier d'un fauteuil,
# le haut du modèle, va vers +z), "screen" (la normale de la dalle va vers -z),
# ou un angle (degrés autour de la verticale) relevé à l'œil.
MODELS = [
    # Fauteuil de travail à accoudoirs alu. Giimann, CC BY 4.0.
    {"uid": "b78e87f34bbc45f297175dd66ece69eb", "out": "chair.glb", "size": ("height", 1.02), "face": "back"},
    # Écran 23 pouces (Dell P2314H). GregorJan, CC BY 4.0.
    {"uid": "c69f09bb812e46cdbd5bf6c62499b848", "out": "monitor.glb", "size": ("width", 0.54), "face": "screen", "screen": r"^Material2\.003$"},
    # Clavier mécanique rétroéclairé, sans son câble. FelikinRuslan, CC BY 4.0.
    {"uid": "1ba4055c33674567b51b783701ed05ce", "out": "keyboard.glb", "size": ("width", 0.44), "face": 180, "drop": r"^(wire|usb)_"},
    # Tasse « Get shit done ». The Lister, CC BY 4.0.
    {"uid": "6c95897de04143aeb5c75b7630707d27", "out": "mug.glb", "size": ("height", 0.098), "face": 0},
    # Lampe de bureau noire, sans son câble, son plateau ni son halo. nickbaker, CC BY 4.0.
    {"uid": "093e9b607a4544818e0c169074037e5f", "out": "lamp.glb", "size": ("height", 0.46), "face": 0, "drop": r"^Object_(2|5|7)$"},
    # Le dev : un humain scanné, riggé (squelette complet, doigts, yeux), sans son animation de marche.
    # Renderpeople, CC BY 4.0. Il regarde vers +z three.js ; la scène le pose assis (web/src/three/player.ts).
    {"uid": "143a2b1ea5eb4385ae90a73657aca3bc", "out": "developer-v3.glb", "size": ("height", 1.78), "rigged": True},
]


def env_key():
    key = os.environ.get("SKETCHFAB_API_KEY")
    if key:
        return key
    with open(os.path.join(ROOT, ".env")) as f:
        for line in f:
            if line.startswith("SKETCHFAB_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("SKETCHFAB_API_KEY manquant (variable d'environnement ou .env)")


def fetch(uid):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{uid}.glb")
    if not os.path.exists(path):
        req = urllib.request.Request(f"https://api.sketchfab.com/v3/models/{uid}/download", headers={"Authorization": f"Token {env_key()}"})
        links = json.load(urllib.request.urlopen(req))
        urllib.request.urlretrieve(links["glb"]["url"], path)
    return path


def join(obs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = ob.data.name = name
    return ob


def textures(limit):
    """Toutes les textures en RGBA 8 bits (l'encodeur WebP refuse les niveaux de gris), `limit` px au plus."""
    for img in list(bpy.data.images):
        if max(img.size) > limit:
            img.scale(min(limit, img.size[0]), min(limit, img.size[1]))
        w, h = img.size
        rgba = bpy.data.images.new(img.name + "-rgba", w, h, alpha=True)
        rgba.colorspace_settings.name = img.colorspace_settings.name
        rgba.pixels.foreach_set(list(img.pixels))
        img.user_remap(rgba)


def export(spec):
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, spec["out"]),
        export_format="GLB",
        use_selection=True,
        export_image_format="WEBP",
        export_meshopt_compression_enable=True,
        export_yup=True,
        export_apply=True,
        export_animations=False,
    )
    meta = json.load(urllib.request.urlopen(f"https://api.sketchfab.com/v3/models/{spec['uid']}"))
    print(f"[prepare] crédit : « {meta['name']} » par {meta['user']['displayName']}, {meta['license']['label']}, {meta['viewerUrl']}", flush=True)


def prepare_rigged(spec):
    """Un personnage riggé : on garde son squelette au repos et son maillage
    habillé, sans animation ; mis aux cotes réelles, les pieds au sol."""
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = [o for o in bpy.data.objects if o.type == "MESH" and o.find_armature() is arm]
    if arm.animation_data:
        arm.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    for pb in arm.pose.bones:
        pb.matrix_basis.identity()
    # des noms d'os courts : « rp_nathan_…_walking_upperarm_l_024 » devient « upperarm_l »
    # (les groupes de sommets suivent le renommage ; « _rootJoint », ajouté par Sketchfab, reste tel quel)
    named = [b for b in arm.data.bones if not b.name.startswith("_")]
    prefix = os.path.commonprefix([b.name for b in named])
    for b in named:
        b.name = re.sub(r"_\d+$", "", b.name[len(prefix):])
    # les nœuds d'emballage de Sketchfab et les formes de bones de l'import
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in list(bpy.data.objects):
        if o is not arm and o not in body:
            bpy.data.objects.remove(o)
    bpy.context.view_layer.update()
    vs = [b.matrix_world @ v.co for b in body for v in b.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)])
    hi = Vector([max(v[i] for v in vs) for i in range(3)])
    axis, target = spec["size"]
    s = target / {"height": hi.z - lo.z, "width": hi.x - lo.x, "depth": hi.y - lo.y}[axis]
    c = (lo + hi) / 2
    arm.location = (arm.location - Vector((c.x, c.y, lo.z))) * s
    arm.scale *= s
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, *body]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    size = (hi - lo) * s
    print(f"[prepare] {spec['out']}: {sum(len(b.data.polygons) for b in body)} faces, {len(arm.data.bones)} os, {size.x:.3f} × {size.z:.3f} × {size.y:.3f} m (l × h × p)", flush=True)
    textures(1024)
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


def prepare(spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=fetch(spec["uid"]))
    if spec.get("rigged"):
        return prepare_rigged(spec)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in [o for o in bpy.data.objects if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    # les pièces en trop, et les maillages vides (arêtes seules) des exports SketchUp
    for o in list(bpy.data.objects):
        if not o.data.polygons or ("drop" in spec and re.search(spec["drop"], o.name)):
            bpy.data.objects.remove(o)
    name = os.path.splitext(spec["out"])[0]
    obs = list(bpy.data.objects)
    screen = None
    if "screen" in spec:
        screen = join([o for o in obs if re.search(spec["screen"], o.name)], "screen")
        for m in screen.data.materials:
            m.name = "screen"
        body = join([o for o in bpy.data.objects if o is not screen], name)
        parts = [body, screen]
    else:
        parts = [join(obs, name)]

    def verts():
        return [v.co.copy() for p in parts for v in p.data.vertices]

    vs = verts()
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    h = hi.z - lo.z
    # l'utilisateur côté -z three.js, soit +y Blender
    face = spec["face"]
    if face == "back":
        top = [v for v in vs if v.z > lo.z + 0.72 * h]
        foot = [v for v in vs if v.z < lo.z + 0.08 * h]
        d = (sum(top, Vector()) / len(top)) - (sum(foot, Vector()) / len(foot))
        ang = math.atan2(-1, 0) - math.atan2(d.y, d.x)  # le dossier vers -y Blender
    elif face == "screen":
        n = Vector()
        for poly in screen.data.polygons:
            n += poly.normal * poly.area
        # la dalle vers +y Blender ; si la normale pointe dans le dos, l'écran est retourné
        ang = math.atan2(1, 0) - math.atan2(n.y, n.x)
    else:
        ang = math.radians(face)
    for p in parts:
        p.data.transform(Matrix.Rotation(ang, 4, "Z"))
    vs = verts()
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    axis, target = spec["size"]
    s = target / {"height": hi.z - lo.z, "width": hi.x - lo.x, "depth": hi.y - lo.y}[axis]
    if face == "back":
        foot = [v for v in vs if v.z < lo.z + 0.08 * (hi.z - lo.z)]
        c = sum(foot, Vector()) / len(foot)
    else:
        c = (lo + hi) / 2
    m = Matrix.Scale(s, 4) @ Matrix.Translation((-c.x, -c.y, -lo.z))
    for p in parts:
        p.data.transform(m)
        p.data.update()
    size = (hi - lo) * s
    if screen is not None:
        # la dalle : uv projetés sur son plan, de 0 à 1, l'image à l'endroit
        # pour qui la regarde (depuis +y Blender) ; l'export glTF retourne v
        me = screen.data
        xs = [v.co.x for v in me.vertices]
        zs = [v.co.z for v in me.vertices]
        uv = me.uv_layers.active or me.uv_layers.new()
        for loop in me.loops:
            co = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = ((max(xs) - co.x) / (max(xs) - min(xs)), (co.z - min(zs)) / (max(zs) - min(zs)))
    print(f"[prepare] {spec['out']}: {sum(len(p.data.polygons) for p in parts)} faces, {size.x:.3f} × {size.z:.3f} × {size.y:.3f} m (l × h × p)", flush=True)
    textures(1024)
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


only = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
for spec in MODELS:
    if not only or spec["out"] in only:
        prepare(spec)
