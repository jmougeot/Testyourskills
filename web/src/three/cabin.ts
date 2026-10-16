// La cabine d'ascenseur de la révélation : un vrai projet de cabine de bureaux
// (« JNKM Design - Elevator Cab Interior », Sketchfab, CC BY 4.0), préparé par
// tools/bake/prepare.py : inox brossé, plafond lumineux, mains courantes,
// boîte à boutons, portes et seuil. Ses parois de verre blanc sont habillées
// du placage de noyer de la scène (Poly Haven, celui du bureau du dev), en
// panneaux à livre ouvert. La scène n'y ajoute que ce qui bouge ou change par
// carte : l'ouverture des portes, l'afficheur, le bouton de l'étage d'arrivée
// à la couleur du tier, les numéros des boutons, les filets du tier et la
// lumière des paliers dans le jour entre les portes.
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { PbrSet } from "./assets";
import { limitLights } from "./baked";
import { createWallScreen, type WallScreen } from "./ledWall";

/* ---------- géométrie (mètres) : sol à y = 0, la façade intérieure en z = 0, la cabine vers +z ----------
 * Les cotes du modèle remis à l'échelle par prepare.py (portes de 2,1 m). */
export const CAB_W = 2.0; // x de -1 à 1
export const CAB_H = 2.37; // sous le plafond lumineux
export const CAB_D = 2.6;
export const DOOR_W = 1.0;
export const DOOR_H = 2.1;
/** Les portes palières, dans le mur de l'open space (tools/bake/office.py, z = -0,25). */
const LANDING_Z = -0.25;
/** Le noyer huilé des parois : la teinte du scan (le même placage que le
 * bureau du dev), foncée par un gris neutre. Sous le plafonnier, qui éclaire
 * plus fort et plus uniformément que les six spots de l'ancienne cabine, la
 * paroi sort à l'écran à la clarté de l'ancienne cabine (L* 54 mesuré sur capture, contre 59 avant). */
const WALNUT_TINT = 0x7a7a7a;

const hdr = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- les reflets projetés sur la boîte ----------
 * Une carte d'environnement est photographiée depuis un seul point : sans
 * correction, une matière la reflète comme si la cabine était infiniment
 * loin (le reflet ne bouge pas avec la caméra). On prolonge le rayon réfléchi
 * jusqu'aux parois de la cabine et on lit la carte dans la direction du point
 * touché, vue depuis le point de prise de vue. */
const IBL_DIR = "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );";
function boxProjection(mat: THREE.Material, probe: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBoxMin = { value: min };
    shader.uniforms.uBoxMax = { value: max };
    shader.uniforms.uProbe = { value: probe };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBoxPos;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBoxPos = worldPosition.xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vBoxPos;
        uniform vec3 uBoxMin;
        uniform vec3 uBoxMax;
        uniform vec3 uProbe;
        vec3 boxProjected( vec3 dir ) {
          vec3 p = vBoxPos;
          // hors de la cabine (portes palières, bureaux) : pas de correction
          if ( any( lessThan( p, uBoxMin - 0.12 ) ) || any( greaterThan( p, uBoxMax + 0.12 ) ) ) return dir;
          vec3 d = dir + sign( dir ) * 1e-5;
          vec3 t = mix( ( uBoxMin - p ) / d, ( uBoxMax - p ) / d, step( vec3( 0.0 ), dir ) );
          float f = max( min( min( t.x, t.y ), t.z ), 0.0 );
          return normalize( p + dir * f - uProbe );
        }`,
      )
      .replace("#include <envmap_physical_pars_fragment>", THREE.ShaderChunk.envmap_physical_pars_fragment.replace(IBL_DIR, `${IBL_DIR}\nreflectVec = boxProjected( reflectVec );`));
  };
  mat.customProgramCacheKey = () => "cabin-box-projection";
}

export interface CabinOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** Couleur du tier (filets de LED, bouton de l'étage). */
  accent: string;
  /** Le modèle de la cabine (cabin.glb, tools/bake/prepare.py). */
  model: GLTF;
  /** Le placage de noyer des parois (Poly Haven, 1 m par tuile). */
  wood: PbrSet;
  /** L'étage d'arrivée (la note) : numéros de la boîte à boutons. */
  floor: number;
}

export interface Cabin {
  /** Portes de la cabine et portes palières ; `closed` : x en position fermée. */
  doors: { mesh: THREE.Object3D; dir: number; closed: number }[];
  /** L'afficheur au-dessus des portes. */
  screen: WallScreen;
  /** L'inox de la façade, repris pour les tableaux de la porte côté bureaux. */
  brushedSteel: THREE.MeshStandardMaterial;
  /** La lumière des paliers dans le jour entre les portes. */
  shaftTex: THREE.Texture;
  shaftMat: THREE.MeshBasicMaterial;
  shaftGap: THREE.Mesh;
  /** Lumières de la cabine, 0 (éteintes) à 1. */
  setLight(k: number): void;
  /** Le halo du bouton de l'étage d'arrivée. */
  btnOn: THREE.MeshBasicMaterial;
  /** La lumière du palier dans le joint des portes, à l'arrivée. */
  seam: THREE.Mesh;
  seamMat: THREE.MeshBasicMaterial;
  dispose(): void;
}

/** Construit la cabine dans la scène (avant le reste : ses reflets sont photographiés de l'intérieur). */
export function createCabin(o: CabinOptions): Cabin {
  const { scene, renderer } = o;
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const cabin = new THREE.Group();
  scene.add(cabin);

  /* ---------- le modèle ----------
   * Ses matières sont reprises telles quelles (le modèle est partagé par
   * toutes les révélations de la page) : on les copie pour régler reflets
   * et rugosité, et pour donner aux métaux les reflets de la cabine. */
  const parts: Record<string, THREE.Object3D> = {};
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const cabinMats: THREE.MeshStandardMaterial[] = [];
  const own = (m: THREE.Material) => {
    let c = copies.get(m);
    if (!c) {
      c = keep((m as THREE.MeshStandardMaterial).clone());
      copies.set(m, c);
      cabinMats.push(c);
    }
    return c;
  };
  o.model.scene.updateMatrixWorld(true);
  o.model.scene.traverse((src) => {
    const m = src as THREE.Mesh;
    if (!m.isMesh) return;
    const mesh = new THREE.Mesh(m.geometry, Array.isArray(m.material) ? m.material.map(own) : own(m.material));
    mesh.matrix.copy(m.matrixWorld);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    // gltfpack ou l'export peuvent porter le nom sur le nœud parent
    const name = m.name && !/^mesh_\d+/.test(m.name) ? m.name : (m.parent?.name ?? "");
    parts[name] = mesh;
    cabin.add(mesh);
  });
  const matNamed = (name: string) => cabinMats.find((m) => m.name === name);
  // l'inox poli de la façade et des portes : la texture du modèle donne le brossé
  const facade = matNamed("M_Steel1")!;
  facade.roughness = 0.18;
  facade.envMapIntensity = 1;
  // les portes : le même inox, plus mat, sinon le reflet du plafond fait une
  // barre blanche qui écrase le joint central
  const doorSteel = keep(facade.clone());
  doorSteel.roughness = 0.38;
  doorSteel.color.setScalar(0.72);
  doorSteel.envMapIntensity = 0.7;
  cabinMats.push(doorSteel);
  // les parois : le verre blanc du modèle est habillé de noyer, en panneaux
  // à livre ouvert séparés par des joints (woodPanels) ; la couleur, le
  // relief et la rugosité viennent du scan, posés en mètres sur la paroi
  const glassSrc = matNamed("M_White_Glass");
  let walnut: THREE.MeshStandardMaterial | null = null;
  if (glassSrc) {
    walnut = keep(
      new THREE.MeshStandardMaterial({
        name: glassSrc.name,
        map: o.wood.map,
        normalMap: o.wood.normalMap,
        normalScale: new THREE.Vector2(0.25, 0.25),
        roughnessMap: o.wood.roughnessMap,
        color: WALNUT_TINT,
        roughness: 0.55,
        envMapIntensity: 0.6,
      }),
    );
    cabinMats.splice(cabinMats.indexOf(glassSrc), 1, walnut);
    cabin.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh && mesh.material === glassSrc) mesh.material = walnut!;
    });
  }
  // les mains courantes : inox satiné, pas le gris mat de l'export
  const handle = matNamed("M_Handle");
  if (handle) handle.roughness = 0.3;
  const floorMat = matNamed("M_Floor");
  if (floorMat) {
    floorMat.roughness = 0.45;
    floorMat.envMapIntensity = 0.5;
  }

  // les portes : les deux vantaux du modèle, et leur copie pour les portes palières
  const doors: Cabin["doors"] = [];
  for (const [name, dir] of [["door_l", -1], ["door_r", 1]] as const) {
    const leaf = parts[name] as THREE.Mesh;
    leaf.material = doorSteel;
    doors.push({ mesh: leaf, dir, closed: leaf.position.x });
    const box = new THREE.Box3().setFromObject(leaf);
    const landing = leaf.clone();
    landing.position.z += LANDING_Z - (box.min.z + box.max.z) / 2;
    cabin.add(landing);
    doors.push({ mesh: landing, dir, closed: landing.position.x });
  }
  const doorBox = new THREE.Box3().setFromObject(parts.door_l!);

  // le plafond lumineux, et la lumière en direct qu'il donne à la cabine
  const ceiling = parts.ceiling_light as THREE.Mesh;
  const glowMat = new THREE.MeshBasicMaterial({ color: hdr("#fff3e4", 2.2), toneMapped: false });
  ceiling.material = keep(glowMat);
  const glowBox = new THREE.Box3().setFromObject(ceiling);
  const glowSize = glowBox.getSize(new THREE.Vector3());
  const glowAt = glowBox.getCenter(new THREE.Vector3());
  RectAreaLightUniformsLib.init();
  const LIGHT = 9;
  const cabinLight = new THREE.RectAreaLight(0xfff0de, LIGHT, glowSize.x, glowSize.z);
  cabinLight.position.copy(glowAt).setY(glowBox.min.y - 0.005);
  cabinLight.lookAt(glowAt.x, 0, glowAt.z);
  cabin.add(cabinLight);

  // les filets de LED à la couleur du tier : dans les angles des portes et sous le plafond
  const ledStrip = new THREE.MeshBasicMaterial({ color: hdr(o.accent, 1.1), toneMapped: false });
  const strip = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ledStrip);
    m.position.set(x, y, z);
    cabin.add(m);
  };
  for (const sx of [-1, 1]) {
    strip(0.007, CAB_H - 0.14, 0.007, sx * (CAB_W / 2 - 0.006), 0.1 + (CAB_H - 0.14) / 2, 0.01);
    strip(0.007, 0.007, CAB_D, sx * (CAB_W / 2 - 0.006), CAB_H - 0.012, CAB_D / 2);
  }

  // la gaine, vue par le jour entre les portes : la lumière des paliers défile
  const shaftTex = keep(makeShaftTexture());
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: hdr("#ffe9d0", 2), toneMapped: false, transparent: true, opacity: 0.3, depthWrite: false });
  const shaftGap = new THREE.Mesh(new THREE.PlaneGeometry(0.08, DOOR_H), shaftMat);
  shaftGap.position.set(0, DOOR_H / 2, (doorBox.min.z + LANDING_Z) / 2);
  scene.add(shaftGap);
  const seamMat = new THREE.MeshBasicMaterial({ color: hdr("#ffffff", 0), toneMapped: false, transparent: true });
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.008, DOOR_H), seamMat);
  seam.position.set(0, DOOR_H / 2, doorBox.max.z + 0.003);
  scene.add(seam);

  // l'afficheur, dans l'imposte : verre noir sur l'inox, entre les portes et le plafond
  const DISP = { w: 0.9, h: 0.18 };
  const screen = keep(createWallScreen(o.accent, DISP));
  const dispY = (DOOR_H + CAB_H) / 2 + 0.005;
  const glassBlack = keep(new THREE.MeshPhysicalMaterial({ color: 0x040506, metalness: 0, roughness: 0.06, clearcoat: 1, envMapIntensity: 1 }));
  cabinMats.push(glassBlack);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(DISP.w + 0.04, DISP.h + 0.04, 0.01, 3, 0.004), glassBlack);
  bezel.position.set(0, dispY, 0.005);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(DISP.w, DISP.h), screen.material);
  display.position.set(0, dispY, 0.0105);
  cabin.add(bezel, display);
  // le mini-afficheur de la boîte à boutons montre la même image
  (parts.cop_display as THREE.Mesh).material = screen.material;

  // les boutons : l'anneau de l'étage d'arrivée à la couleur du tier, les autres en blanc froid,
  // et leurs numéros (l'arrivée en haut à droite, puis les étages en descendant)
  const btnOff = keep(new THREE.MeshBasicMaterial({ color: hdr("#d9e2ec", 0.18), toneMapped: false }));
  const btnOn = keep(new THREE.MeshBasicMaterial({ color: hdr(o.accent, 0.35), toneMapped: false }));
  (parts.button_arrival as THREE.Mesh).material = btnOn;
  cabin.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === "M_Glow2") mesh.material = btnOff;
  });
  const buttons = JSON.parse(String(o.model.scene.userData.buttons ?? "[]")) as [number, number, number][];
  if (buttons.length) {
    const labels = keep(makeButtonLabels(buttons, o.floor));
    const ink = new THREE.Mesh(new THREE.PlaneGeometry(labels.w, labels.h), new THREE.MeshBasicMaterial({ map: labels.texture, transparent: true, toneMapped: false, depthWrite: false }));
    ink.position.set(labels.x, labels.y, Math.max(...buttons.map((b) => b[2])) + 0.0015);
    cabin.add(ink);
  }

  // les reflets de la cabine : on la photographie de l'intérieur (deux fois,
  // pour que l'inox se reflète aussi dans l'inox) et ses matières reflètent cette image
  // projetée sur la boîte de la cabine : le reflet d'une paroi tombe à sa
  // vraie place et se décale quand la caméra avance
  const probe = V(0, 1.45, 1.4);
  for (const m of cabinMats) boxProjection(m, probe, V(-CAB_W / 2, 0, -0.02), V(CAB_W / 2, CAB_H, CAB_D));
  // les côtés en trois panneaux de noyer, le fond en deux (le modèle n'a qu'une vitre par paroi)
  if (walnut) woodPanels(walnut, [CAB_D / 3, (2 * CAB_D) / 3], [0]);
  // seules la dalle du plafond et l'éclat du pack éclairent la cabine : les
  // projecteurs de l'open space n'y entrent pas, inutile de les évaluer
  for (const m of cabinMats) limitLights(m, ["NUM_RECT_AREA", "NUM_POINT_LIGHTS"], "cabin");
  const pmrem = new THREE.PMREMGenerator(renderer);
  let cabinEnv: THREE.Texture | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const next = pmrem.fromScene(scene, 0.008, 0.02, 20, { position: probe, size: 512 }).texture;
    for (const m of cabinMats) m.envMap = next;
    cabinEnv?.dispose();
    cabinEnv = next;
  }
  pmrem.dispose();
  disposables.push(cabinEnv!);

  return {
    doors,
    screen,
    brushedSteel: facade,
    shaftTex,
    shaftMat,
    shaftGap,
    setLight(k) {
      cabinLight.intensity = LIGHT * k;
      glowMat.color.copy(hdr("#fff3e4", 2.2 * k));
    },
    btnOn,
    seam,
    seamMat,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Le noyer des parois, posé en mètres sur la paroi d'après la position dans
 * la cabine (vBoxPos, déclaré par boxProjection) : le modèle n'a qu'une vitre
 * par paroi, aux uv quelconques. Chaque panneau prend un autre morceau de la
 * feuille de placage, un sur deux en miroir, comme les feuilles « à livre
 * ouvert » des vraies cabines, le fil à la verticale ; entre les panneaux, un
 * joint de 3 mm, la tôle sombre derrière. `alongZ` : joints des parois
 * latérales (z) ; `alongX` : du fond (x). */
function woodPanels(mat: THREE.Material, alongZ: number[], alongX: number[]) {
  const previous = mat.onBeforeCompile;
  const f = (x: number) => x.toFixed(3);
  const nearest = (v: number[]) => v.map((x) => `abs( woodC - ${f(x)} )`).reduce((a, b) => `min( ${a}, ${b} )`);
  const count = (v: number[]) => v.map((x) => `step( ${f(x)}, woodC )`).join(" + ");
  const chunk = (name: keyof typeof THREE.ShaderChunk, uv: string) => THREE.ShaderChunk[name].replace(new RegExp(uv, "g"), "woodUv");
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        // paroi latérale : le long de z ; fond : le long de x
        bool woodSide = abs( vBoxPos.x ) > ${f(CAB_W / 2 - 0.1)};
        float woodC = woodSide ? vBoxPos.z : vBoxPos.x;
        float woodD = woodSide ? ${nearest(alongZ)} : ${nearest(alongX)};
        float woodJoint = 1.0 - smoothstep( 0.0015, 0.0015 + 1.5 * fwidth( woodC ), woodD );
        // le numéro du panneau, propre à chaque paroi
        float woodN = woodSide ? ${count(alongZ)} + ( vBoxPos.x > 0.0 ? ${f(alongZ.length + 1)} : 0.0 ) : ${count(alongX)} + ${f(2 * alongZ.length + 2)};
        float woodMirror = mod( woodN, 2.0 );
        // le fil à la verticale : la feuille tournée d'un quart de tour (u le long de la hauteur)
        vec2 woodUv = vec2( vBoxPos.y + fract( woodN * 0.382 ) * 3.0, mix( woodC, -woodC, woodMirror ) + fract( woodN * 0.618 ) * 3.0 );`,
      )
      .replace("#include <map_fragment>", chunk("map_fragment", "vMapUv"))
      .replace("#include <color_fragment>", "#include <color_fragment>\n        diffuseColor.rgb *= 1.0 - 0.85 * woodJoint;")
      .replace("#include <roughnessmap_fragment>", `${chunk("roughnessmap_fragment", "vRoughnessMapUv")}\n        roughnessFactor = mix( roughnessFactor, 0.8, woodJoint );`)
      .replace("#include <normal_fragment_begin>", chunk("normal_fragment_begin", "vNormalMapUv"))
      .replace("#include <normal_fragment_maps>", chunk("normal_fragment_maps", "vNormalMapUv"));
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => `wood-panels|${key()}`;
}

/** La lumière de la gaine vue par les fentes : deux paliers éclairés par tuile, bords doux. */
function makeShaftTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, 8, 256);
  for (const y of [64, 192]) {
    const grad = g.createLinearGradient(0, y - 34, 0, y + 34);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, y - 34, 8, 68);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Les étages de la boîte à boutons : `n` numéros, l'arrivée d'abord, puis en descendant jusqu'au rez-de-chaussée et aux sous-sols. */
function panelFloors(top: number, n: number): string[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(Math.round(top - (top * k) / (n - 1)));
  // peu d'étages : les numéros se suivent, puis les sous-sols
  const seen = new Set<number>();
  let next = top;
  return out.map((v0) => {
    let v = Math.min(v0, next);
    while (seen.has(v)) v--;
    seen.add(v);
    next = v - 1;
    return v < 0 ? `-${-v}` : String(v);
  });
}

/** Les numéros rétroéclairés des boutons (1 px = 0,5 mm, fond transparent), posés sur la boîte à boutons du modèle. */
function makeButtonLabels(buttons: [number, number, number][], top: number) {
  const PX = 2000;
  const PAD = 0.03;
  const xs = buttons.map((b) => b[0]);
  const ys = buttons.map((b) => b[1]);
  const x0 = Math.min(...xs) - PAD;
  const x1 = Math.max(...xs) + PAD;
  const y0 = Math.min(...ys) - PAD;
  const y1 = Math.max(...ys) + PAD;
  const c = document.createElement("canvas");
  c.width = Math.round((x1 - x0) * PX);
  c.height = Math.round((y1 - y0) * PX);
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  // les rangées de trois sont les étages ; la dernière rangée, plus courte, ouvre et ferme les portes, et l'alarme
  const rows = new Map<number, [number, number][]>();
  for (const [x, y] of buttons) {
    const k = Math.round(y * 100);
    rows.set(k, [...(rows.get(k) ?? []), [x, y]]);
  }
  const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a[0] - b[0]));
  const wide = Math.max(...ordered.map((r) => r.length));
  const floorRows = ordered.filter((r) => r.length === wide);
  const labels = panelFloors(top, floorRows.length * wide);
  const symbols = ["◀|▶", "▶|◀", "🔔", "☎"];
  let s = 0;
  ordered.forEach((row) => {
    const fi = floorRows.indexOf(row);
    row.forEach(([x, y], col) => {
      // l'arrivée en haut à droite : on lit chaque rangée de droite à gauche
      const label = fi >= 0 ? labels[fi * wide + (row.length - 1 - col)]! : symbols[s++ % symbols.length]!;
      g.fillStyle = "rgba(236,239,243,0.92)";
      g.font = `700 ${label.length > 2 ? 22 : 28}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
      g.fillText(label, (x - x0) * PX, (y1 - y) * PX + 1);
    });
  });
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return { texture, w: x1 - x0, h: y1 - y0, x: (x0 + x1) / 2, y: (y0 + y1) / 2, dispose: () => texture.dispose() };
}
