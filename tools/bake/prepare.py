# Prépare les modèles tiers de la scène 3D (Sketchfab, CC BY ; Poly Haven, CC0) pour le web.
#
#   SKETCHFAB_API_KEY=… blender -b -P tools/bake/prepare.py [-- nom.glb …]
#
# Télécharge chaque modèle (cache : tools/bake/.cache, hors dépôt ; Poly Haven
# sans clé, en glTF 1K), le remet aux cotes réelles, l'oriente comme la scène
# (repère three.js : y en haut ; l'utilisateur de l'objet est du côté -z :
# l'assis du fauteuil regarde vers -z, la dalle d'un écran et l'avant d'un
# clavier sont tournés vers -z), pose son origine au sol, au centre, compresse
# ses textures en WebP et sa géométrie en meshopt, et l'écrit dans
# web/public/3d. La dalle d'un écran reste un maillage à part, nommé
# « screen », pour que la scène y affiche son propre contenu ; le plateau d'un
# bureau aussi, nommé « top », avec des uv en mètres pour le placage de la
# scène. Un personnage riggé garde son squelette au repos, sans animation,
# avec des noms d'os courts (« upperarm_l »), et regarde vers +z.
# La cabine d'ascenseur est remise aux cotes de la scène, ses pièces animées
# nommées (voir prepare_cabin).
# Les crédits sont dans web/public/3d/CREDITS.txt.
import json
import math
import os
import re
import sys
import urllib.request

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CACHE = os.path.join(ROOT, "tools", "bake", ".cache")
OUT = os.path.join(ROOT, "web", "public", "3d")

# Options : keep / drop, les pièces gardées ou retirées (regex sur les noms) ;
# tilt, une bascule (degrés autour de l'axe gauche-droite) pour coucher un
# objet ; top_at, la hauteur du plateau d'un bureau réglable, atteinte en
# étirant ses colonnes dans la bande lift (m) ; decimate ; tex, la taille
# maximale des textures (1024 par défaut).
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
    # Bureau assis-debout à piètement noir (colonnes télescopiques, pieds en T,
    # boîtier de commande) ; le plateau, à part et nommé « top », reçoit le noyer
    # de la scène. Chairsolutions, CC BY 4.0.
    {"uid": "b7341ee22ddd43efaef9ad3016a224f3", "out": "desk.glb", "size": ("width", 2.2), "face": 180, "top": r"^Object_1[56]$", "top_at": 0.7725, "lift": (0.15, 0.35), "decimate": 0.4},
    # Souris Logitech MX Master 3S, scannée (Scaniverse), allégée. Zhirayr, CC BY 4.0.
    {"uid": "be1d82499209475c8cd1d009df9aaa00", "out": "mouse.glb", "size": ("depth", 0.125), "face": 0, "decimate": 0.15},
    # Sous-main de bureau. mfk, CC BY 4.0.
    {"uid": "7690f727d87847aaa737c8110c8e6531", "out": "deskmat.glb", "size": ("width", 0.9), "face": 0, "decimate": 0.15},
    # Casque Sony MDR-7506, posé à plat. AndreiVNK, CC BY 4.0.
    {"uid": "05735b74d3524f00b648231138122a28", "out": "desk-headphones.glb", "size": ("width", 0.19), "face": 0, "tilt": 90, "tex": 512, "decimate": 0.5},
    # Téléphone (iPhone 13 Pro Max) posé écran contre le bureau : sans sa face
    # avant ni son logo. DatSketch, CC BY 4.0.
    {"uid": "4328dea00e47497dbeac73c556121bc9", "out": "phone.glb", "size": ("depth", 0.161), "face": 0, "tilt": -90, "tex": 512, "decimate": 0.5, "drop": r"Wallpaper|Screen Glass|Mic_0|Logo|^Body_(Lens|Camera Glass|Material)_0$"},
    # Gourde inox, sans la sphère d'environnement. Igrium, CC BY 4.0.
    {"uid": "885543a7679c4026abbd6499185caf08", "out": "desk-bottle.glb", "size": ("height", 0.24), "face": 0, "drop": r"^Icosphere$", "tex": 512},
    # Poly Haven (CC0) : carnet fermé en cuir, bloc de post-it, stylo plume, petite plante grasse.
    {"polyhaven": "binder_notebook", "out": "notebook.glb", "size": ("depth", 0.2), "face": 0, "keep": r"_closed$", "tex": 512, "decimate": 0.5},
    {"polyhaven": "office_notepads", "out": "postit.glb", "size": ("width", 0.072), "face": 0, "keep": r"_sticky_stack$", "tex": 512},
    {"polyhaven": "stationery_supplies", "out": "pen.glb", "size": ("width", 0.131), "face": 0, "keep": r"_pen_fancy$", "tex": 512},
    {"polyhaven": "potted_plant_04", "out": "desk-plant.glb", "size": ("height", 0.22), "face": 0, "tex": 512, "decimate": 0.6},
    # Le dev : un humain scanné, riggé (squelette complet, doigts, yeux), sans son animation de marche.
    # Renderpeople, CC BY 4.0. Il regarde vers +z three.js ; la scène le pose assis (web/src/three/player.ts).
    {"uid": "143a2b1ea5eb4385ae90a73657aca3bc", "out": "developer-v3.glb", "size": ("height", 1.78), "rigged": True},
    # La cabine d'ascenseur : un vrai projet de cabine de bureaux (verre blanc laqué, inox brossé,
    # plafond lumineux, boîte à boutons). JNKM Design (Josh Nelson), CC BY 4.0. Voir prepare_cabin.
    {"uid": "be05f33b31dc4b4ebf7ad7ff4cea1631", "out": "cabin.glb", "cabin": True},
]

# La cabine, aux cotes de la scène (web/src/three/cabin.ts) : portes de 2,1 m
# de haut, la face intérieure de la façade en z = 0, la cabine vers +z, 2,6 m
# de profondeur (le modèle n'en a que 1,5 : la caméra recule jusqu'à 2,45 m).
CABIN_DEPTH = 2.6
DOOR_H = 2.1
# ce qui ne se voit pas de l'intérieur, ou qui fermerait le passage des portes :
# les deux coques extérieures, les faces arrière des parois (grille d'Unreal),
# le doublon de l'afficheur de la boîte à boutons
CABIN_DROP = r"(Outer_Wall|Int_Wall_Lift|WorldGridMaterial|Plane_44|M_poster)"


def env_key():
    key = os.environ.get("SKETCHFAB_API_KEY")
    if key:
        return key
    with open(os.path.join(ROOT, ".env")) as f:
        for line in f:
            if line.startswith("SKETCHFAB_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"")
    raise SystemExit("SKETCHFAB_API_KEY manquant (variable d'environnement ou .env)")


def get(url, path=None):
    """Un GET avec un User-Agent : Poly Haven refuse celui de Python."""
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "testyourskills-prepare"})) as r:
        data = r.read()
    if path is None:
        return json.loads(data)
    with open(path, "wb") as f:
        f.write(data)


def fetch(spec):
    os.makedirs(CACHE, exist_ok=True)
    if "polyhaven" in spec:
        # Poly Haven (CC0) : le glTF 1K et ses fichiers, sans clé
        ph = spec["polyhaven"]
        folder = os.path.join(CACHE, "polyhaven", ph)
        gltf = get(f"https://api.polyhaven.com/files/{ph}")["gltf"]["1k"]["gltf"]
        path = os.path.join(folder, os.path.basename(gltf["url"]))
        if not os.path.exists(path):
            for rel, f in [*gltf["include"].items(), (os.path.basename(gltf["url"]), gltf)]:
                os.makedirs(os.path.dirname(os.path.join(folder, rel)), exist_ok=True)
                get(f["url"], os.path.join(folder, rel))
        return path
    uid = spec["uid"]
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
        export_extras=True,
    )
    if "polyhaven" in spec:
        meta = get(f"https://api.polyhaven.com/info/{spec['polyhaven']}")
        print(f"[prepare] crédit : « {meta['name']} » par {', '.join(meta['authors'])}, CC0, https://polyhaven.com/a/{spec['polyhaven']}", flush=True)
        return
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


def split(ob, name_neg, name_pos):
    """Coupe un maillage en deux selon x = 0 (les deux vantaux d'une porte d'un seul tenant)."""
    halves = []
    for name, keep in ((name_neg, lambda x: x < 0), (name_pos, lambda x: x >= 0)):
        o = ob.copy()
        o.data = ob.data.copy()
        bpy.context.collection.objects.link(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median().x)], context="FACES")
        bm.to_mesh(o.data)
        bm.free()
        o.name = o.data.name = name
        halves.append(o)
    bpy.data.objects.remove(ob)
    return halves


def prepare_cabin(spec):
    """La cabine d'ascenseur : tout le décor vient du modèle, la scène n'y
    ajoute que ce qui bouge ou change par carte. Le modèle est remis aux
    cotes de la scène, sa profondeur étirée (verre, inox brossé et pierre
    s'y prêtent), ses deux vantaux séparés, et les pièces que la scène
    anime nommées : « door_l », « door_r », « cop_display » (le mini-afficheur
    de la boîte à boutons), « ceiling_light » (le plafond lumineux),
    « button_arrival » (l'anneau du bouton de l'étage d'arrivée, en haut à
    droite) ; le centre des boutons va dans les extras de la scène."""
    for o in [o for o in bpy.data.objects if o.type == "MESH"]:
        o.select_set(True)
    bpy.context.view_layer.objects.active = next(o for o in bpy.data.objects if o.type == "MESH")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.data.objects):
        if o.type != "MESH" or re.search(CABIN_DROP, o.name):
            bpy.data.objects.remove(o)
    # la photo de baseball du fond (droits incertains, hors sujet) : le même verre blanc que les côtés
    glass = bpy.data.materials["M_White_Glass"]
    for o in bpy.data.objects:
        for i, m in enumerate(o.data.materials):
            if m.name == "M_Oil_Bottel1":
                o.data.materials[i] = glass
    obs = {o.name: o for o in bpy.data.objects}
    get = lambda pat: [o for n, o in obs.items() if re.search(pat, n)]

    def bounds(objs):
        vs = [v.co for o in objs for v in o.data.vertices]
        return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])

    door_lo, door_hi = bounds(get(r"Lift_door"))
    x0 = (door_lo.x + door_hi.x) / 2
    y_face = bounds(get(r"EntryWall"))[0].y  # la face intérieure de la façade
    y_back = bounds(get(r"Back_Wall"))[1].y  # la face du fond
    s = DOOR_H / door_hi.z
    k = CABIN_DEPTH / ((y_face - y_back) * s)
    # cotes de la scène, en Blender (z en haut ; l'export donne y en haut et
    # z three.js = -y Blender) : la cabine du côté des y négatifs, étirée en profondeur
    for o in bpy.data.objects:
        for v in o.data.vertices:
            y = (v.co.y - y_face) * s
            v.co = Vector(((v.co.x - x0) * s, y * k if y < 0 else y, v.co.z * s))
        o.data.update()
    # le sol : la pierre reprojetée à plat, une seule dalle sur toute la cabine (pas de raccord)
    for o in get(r"Floor_41"):
        me = o.data
        lo, hi = bounds([o])
        size = max(hi.x - lo.x, hi.y - lo.y)
        uv = me.uv_layers.active
        for loop in me.loops:
            co = me.vertices[loop.vertex_index].co
            uv.data[loop.index].uv = ((hi.x - co.x) / size, (co.y - lo.y) / size)
    # les boutons : des milliers de facettes pour des pastilles de 3 cm
    for o in get(r"M_Buttons_01"):
        mod = o.modifiers.new("decimate", "DECIMATE")
        mod.ratio = 0.2
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # le centre de chaque bouton, en coordonnées three.js, du haut vers le bas, de gauche à droite
    rings = get(r"Buttoon.*M_Glow2")
    centers = []
    for o in rings:
        lo, hi = bounds([o])
        c = (lo + hi) / 2
        centers.append((round(c.x, 4), round(c.z, 4), round(-lo.y, 4), o))
    centers.sort(key=lambda c: (-round(c[1], 2), c[0]))
    top = max(c[1] for c in centers)
    arrival = max((c for c in centers if c[1] > top - 0.01), key=lambda c: c[0])[3]
    bpy.context.scene["buttons"] = json.dumps([c[:3] for c in centers])
    # le mini-afficheur : uv de 0 à 1, l'image à l'endroit pour qui le regarde depuis la cabine
    display = get(r"Lift_Button_Board_2_M_Glow1")[0]
    me = display.data
    lo, hi = bounds([display])
    uv = me.uv_layers.active
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - lo.x) / (hi.x - lo.x), (co.z - lo.z) / (hi.z - lo.z))
    door_l, door_r = split(get(r"Lift_door")[0], "door_l", "door_r")
    named = {"cop_display": display, "ceiling_light": get(r"Ceiling_Light_18_M_Glow")[0], "button_arrival": arrival}
    for n, o in named.items():
        o.name = o.data.name = n
    # le reste, immobile, en un seul objet (un maillage par matière dans three.js)
    keep = {door_l, door_r, *named.values()}
    join([o for o in bpy.data.objects if o not in keep], "cabin")
    lo, hi = bounds(list(bpy.data.objects))
    print(f"[prepare] {spec['out']}: {sum(len(o.data.polygons) for o in bpy.data.objects)} faces, échelle {s:.4f}, profondeur ×{k:.3f}, "
          f"{hi.x - lo.x:.3f} × {hi.z - lo.z:.3f} × {hi.y - lo.y:.3f} m (l × h × p), {len(centers)} boutons", flush=True)
    textures(1024)
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


def prepare(spec):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=fetch(spec))
    if spec.get("rigged"):
        return prepare_rigged(spec)
    if spec.get("cabin"):
        return prepare_cabin(spec)
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
        if not o.data.polygons or ("drop" in spec and re.search(spec["drop"], o.name)) or ("keep" in spec and not re.search(spec["keep"], o.name)):
            bpy.data.objects.remove(o)
    name = os.path.splitext(spec["out"])[0]
    # des pièces à part, nommées pour la scène : la dalle d'un écran, le plateau d'un bureau
    sep = {}
    for k in ("screen", "top"):
        if k in spec:
            sep[k] = join([o for o in bpy.data.objects if o not in sep.values() and re.search(spec[k], o.name)], k)
            for m in sep[k].data.materials:
                m.name = k
    screen = sep.get("screen")
    parts = [join([o for o in bpy.data.objects if o not in sep.values()], name), *sep.values()]
    if "decimate" in spec:
        for p in parts:
            # soudé d'abord : un scan découpé en îlots s'ouvrirait (les uv, par coin, restent)
            bm = bmesh.new()
            bm.from_mesh(p.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4 * max(p.dimensions))
            bm.to_mesh(p.data)
            bm.free()
            bpy.context.view_layer.objects.active = p
            mod = p.modifiers.new("decimate", "DECIMATE")
            mod.ratio = spec["decimate"]
            bpy.ops.object.modifier_apply(modifier=mod.name)
    if "tilt" in spec:
        # couché : on le bascule autour de l'axe gauche-droite avant de l'orienter
        for p in parts:
            p.data.transform(Matrix.Rotation(math.radians(spec["tilt"]), 4, "X"))

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
    if "top_at" in spec:
        # un pied réglable : ses colonnes s'allongent ou se raccourcissent dans
        # une bande de hauteur (lift, en m) pour amener le plateau à top_at
        b0, b1 = spec["lift"]
        d = spec["top_at"] - max(v.co.z for v in sep["top"].data.vertices)
        for p in parts:
            for v in p.data.vertices:
                v.co.z += d * min(1.0, max(0.0, (v.co.z - b0) / (b1 - b0)))
            p.data.update()
    vs = verts()
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    size = hi - lo
    if "top" in sep:
        # le plateau : uv en mètres (projection par la face dominante), le fil
        # le long du bureau ; la scène y pose son propre placage
        me = sep["top"].data
        uv = me.uv_layers.active or me.uv_layers.new()
        for poly in me.polygons:
            n = poly.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for li in poly.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
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
    textures(spec.get("tex", 1024))
    bpy.ops.object.select_all(action="SELECT")
    export(spec)


only = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
for spec in MODELS:
    if not only or spec["out"] in only:
        prepare(spec)
