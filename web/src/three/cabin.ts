// La cabine d'ascenseur de la révélation, d'après de vraies cabines de bureaux
// (KONE, Otis) : mesures, matières et lumière. Construite une fois ; la
// séquence (walkout.ts) anime les portes, l'afficheur et la lumière de la gaine.
import * as THREE from "three";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { PbrSet } from "./assets";
import { createWallScreen, type WallScreen } from "./ledWall";

/* ---------- géométrie (mètres) : sol à y = 0, les portes en z = 0, la cabine vers +z ---------- */
export const CAB_W = 2.1; // x de -1,05 à 1,05, z de 0 (portes) à 2,6
export const CAB_H = 2.45;
export const CAB_D = 2.6;
export const DOOR_W = 1.0;
export const DOOR_H = 2.1;

const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hdr = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- la lumière précalculée ----------
 * Ce qu'un moteur de rendu « cuit » dans une lightmap, calculé ici à la
 * construction, texel par texel : chaque spot du plafond est un faisceau de
 * 70° environ, sa lumière dessine sur les parois les arcs (« festons ») des
 * vraies cabines, plus une lumière renvoyée diffuse ; les angles et les
 * jonctions s'assombrissent (occlusion ambiante), les mains courantes portent
 * une ombre douce. */
const DOWNLIGHTS = [-0.5, 0.5].flatMap((x) => [0.5, 1.3, 2.1].map((z) => V(x, CAB_H - 0.02, z)));
const BEAM_IN = Math.cos((30 * Math.PI) / 180);
const BEAM_OUT = Math.cos((40 * Math.PI) / 180);
const RAIL = { y: 0.92, inset: 0.065, r: 0.019, z0: 0.45, z1: CAB_D - 0.25 };
/** Intensité des lightmaps (lumière diffuse = texel × intensité × albédo / π). */
const LIGHTMAP_K = 9;

interface BakePlane {
  /** Coin (u = 0, v = 0), axes unitaires, dimensions (mètres), normale vers l'intérieur. */
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  w: number;
  h: number;
  n: THREE.Vector3;
  res: [number, number];
}
const sideWall = (sx: number): BakePlane => ({ origin: V((sx * CAB_W) / 2, 0, 0), u: V(0, 0, 1), v: V(0, 1, 0), w: CAB_D, h: CAB_H, n: V(-sx, 0, 0), res: [192, 192] });
const BACK: BakePlane = { origin: V(-CAB_W / 2, 0, CAB_D), u: V(1, 0, 0), v: V(0, 1, 0), w: CAB_W, h: CAB_H, n: V(0, 0, -1), res: [128, 128] };
const FLOOR: BakePlane = { origin: V(-CAB_W / 2, 0, 0), u: V(1, 0, 0), v: V(0, 0, 1), w: CAB_W, h: CAB_D, n: V(0, 1, 0), res: [128, 160] };
const CEILING: BakePlane = { origin: V(-CAB_W / 2, CAB_H, 0), u: V(1, 0, 0), v: V(0, 0, 1), w: CAB_W, h: CAB_D, n: V(0, -1, 0), res: [64, 80] };

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Ombre d'une main courante (cylindre le long de z) sur le trajet p → l : 0 dans l'ombre, 1 en pleine lumière. */
function railVisibility(p: THREE.Vector3, l: THREE.Vector3): number {
  let vis = 1;
  for (const sx of [-1, 1]) {
    const rx = sx * (CAB_W / 2 - RAIL.inset);
    // point du trajet le plus proche de l'axe de la main courante, dans le plan x-y
    const dx = l.x - p.x;
    const dy = l.y - p.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) continue;
    const t = Math.min(1, Math.max(0, ((rx - p.x) * dx + (RAIL.y - p.y) * dy) / len2));
    const z = p.z + (l.z - p.z) * t;
    if (z < RAIL.z0 || z > RAIL.z1) continue;
    const d = Math.hypot(p.x + dx * t - rx, p.y + dy * t - RAIL.y);
    // pénombre : plus large quand la main courante est loin de la surface
    const reach = Math.hypot(dx * t, dy * t);
    vis *= smooth(RAIL.r * 0.5, RAIL.r + 0.06 * reach + 0.004, d);
  }
  return vis;
}

/** Occlusion ambiante : les angles de la cabine retiennent la lumière. */
function occlusion(p: THREE.Vector3, n: THREE.Vector3): number {
  const dists = [p.x + CAB_W / 2, CAB_W / 2 - p.x, p.y, CAB_H - p.y, p.z, CAB_D - p.z];
  const normals = [V(1, 0, 0), V(-1, 0, 0), V(0, 1, 0), V(0, -1, 0), V(0, 0, 1), V(0, 0, -1)];
  let ao = 1;
  dists.forEach((d, i) => {
    if (normals[i]!.dot(n) > 0.9) return; // la surface elle-même
    ao *= 1 - 0.42 * Math.exp(-Math.max(0, d) / 0.09) - 0.12 * Math.exp(-Math.max(0, d) / 0.45);
  });
  // la main courante, de près
  for (const sx of [-1, 1]) {
    const d = Math.hypot(p.x - sx * (CAB_W / 2 - RAIL.inset), p.y - RAIL.y);
    if (p.z > RAIL.z0 && p.z < RAIL.z1) ao *= 1 - 0.35 * Math.exp(-Math.max(0, d - RAIL.r) / 0.025);
  }
  return ao;
}

/** Calcule la lightmap d'une surface (demi-flottants, linéaire). */
function bakeLight(pl: BakePlane): THREE.DataTexture {
  const [W, H] = pl.res;
  const data = new Uint16Array(W * H * 4);
  const p = new THREE.Vector3();
  const w = new THREE.Vector3();
  const warm = [1, 0.93, 0.85];
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      p.copy(pl.origin)
        .addScaledVector(pl.u, ((i + 0.5) / W) * pl.w)
        .addScaledVector(pl.v, ((j + 0.5) / H) * pl.h)
        .addScaledVector(pl.n, 0.002);
      let e = 0;
      for (const l of DOWNLIGHTS) {
        w.subVectors(p, l);
        const d2 = w.lengthSq();
        w.normalize();
        const emit = -w.y; // cosinus avec l'axe du spot (vers le bas)
        if (emit <= 0) continue;
        const incid = -w.dot(pl.n);
        if (incid <= 0) continue;
        const beam = smooth(BEAM_OUT, BEAM_IN, emit) * emit * emit + 0.06 * emit;
        e += (beam * incid * railVisibility(p, l)) / d2;
      }
      // la lumière renvoyée par le sol et les parois, à peu près uniforme
      const bounce = 0.075 + 0.2 * Math.max(0, -pl.n.y);
      e = (e * 0.55 + bounce) * occlusion(p, pl.n);
      const k = (j * W + i) * 4;
      for (let c = 0; c < 3; c++) data[k + c] = THREE.DataUtils.toHalfFloat(e * warm[c]!);
      data[k + 3] = THREE.DataUtils.toHalfFloat(1);
    }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.channel = 1;
  t.needsUpdate = true;
  return t;
}

/** Les coordonnées de lightmap (uv1) d'un maillage posé sur une surface précalculée. */
function lightUv(mesh: THREE.Mesh, pl: BakePlane) {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position!;
  const uv1 = new Float32Array(pos.count * 2);
  const w = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    w.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(pl.origin);
    uv1[i * 2] = w.dot(pl.u) / pl.w;
    uv1[i * 2 + 1] = w.dot(pl.v) / pl.h;
  }
  mesh.geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
}

export interface CabinOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** Couleur du tier (filets de LED, bouton de l'étage). */
  accent: string;
  wood: PbrSet;
}

export interface Cabin {
  /** Portes de la cabine et portes palières ; `closed` : x en position fermée. */
  doors: { mesh: THREE.Mesh; dir: number; closed: number }[];
  /** L'afficheur au-dessus des portes. */
  screen: WallScreen;
  /** L'inox brossé, repris pour les tableaux de la porte côté bureaux. */
  brushedSteel: THREE.MeshPhysicalMaterial;
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
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  // inox poli : mains courantes, boutons, seuil
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc4c9cf, metalness: 1, roughness: 0.2, envMapIntensity: 1 });

  /* ---------- la cabine ----------
   * D'après de vraies cabines de bureaux (KONE, Otis) : parois en noyer à
   * joints fins, façade et portes en inox brossé, plafond sombre à spots
   * ronds, mains courantes sur platines, plinthe inox, sol en grandes dalles
   * de pierre, boîte à boutons en verre noir. Lumière chaude, pas de néon. */
  // inox brossé : rugosité striée, reflets étirés à la verticale
  const brushed = keep(makeBrushedTexture());
  const brushedSteel = new THREE.MeshPhysicalMaterial({ color: 0x9aa1a8, metalness: 1, roughness: 0.3, roughnessMap: brushed, anisotropy: 0.8, anisotropyRotation: Math.PI / 2, envMapIntensity: 1 });
  const veneer = (src: THREE.Texture | undefined) => {
    const t = keep(src!.clone());
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // le fil du bois à la verticale, comme les placages de cabine
    t.center.set(0.5, 0.5);
    t.rotation = Math.PI / 2;
    t.needsUpdate = true;
    return t;
  };
  const walnut = new THREE.MeshStandardMaterial({
    map: veneer(o.wood.map),
    normalMap: veneer(o.wood.normalMap),
    roughnessMap: veneer(o.wood.roughnessMap),
    color: 0x857d76,
    roughness: 0.55,
    normalScale: new THREE.Vector2(0.25, 0.25),
    envMapIntensity: 0.6,
  });
  const reveal = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.8 });
  const stone = keep(makeStoneTexture());
  stone.repeat.set(CAB_W / 1.2, CAB_D / 1.2);
  const stoneMat = new THREE.MeshPhysicalMaterial({ map: stone, color: 0xc9c6c0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.6 });
  // plafond bronze sombre
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x6b6259, metalness: 0.3, roughness: 0.5, envMapIntensity: 0.8 });
  const glassBlack = new THREE.MeshPhysicalMaterial({ color: 0x040506, metalness: 0, roughness: 0.06, clearcoat: 1, envMapIntensity: 1 });
  const cabinMats = [brushedSteel, steel, walnut, stoneMat, ceilMat, glassBlack];

  /** Un panneau plat, ses UV en mètres (1 m de placage par tuile). Chaque
   * panneau prend un autre morceau de la feuille de placage, un sur deux en
   * miroir, comme les feuilles « à livre ouvert » des vraies cabines. */
  let sheet = 0;
  const panel = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry: number, parent: THREE.Object3D) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const n = sheet++;
    const mirror = n % 2 === 1;
    const du = rnd(n, 41) * 3;
    const dv = rnd(n, 42) * 3;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (mirror ? 1 - uv.getX(i) : uv.getX(i)) * w + du, uv.getY(i) * h + dv);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const cabin = new THREE.Group();
  scene.add(cabin);
  // la lumière des spots, précalculée par surface : une matière par surface, qui partage les textures
  const baked = <M extends THREE.MeshStandardMaterial>(mat: M, plane: BakePlane): M => {
    const m = mat.clone() as M;
    m.lightMap = keep(bakeLight(plane));
    m.lightMapIntensity = LIGHTMAP_K;
    cabinMats.push(m);
    return m;
  };
  // sol et plafond : leur lumière est précalculée (lightBake)
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(CAB_W, CAB_D), baked(stoneMat, FLOOR));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, CAB_D / 2);
  cabin.add(floorMesh);
  lightUv(floorMesh, FLOOR);
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(CAB_W, CAB_D), baked(ceilMat, CEILING));
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.set(0, CAB_H, CAB_D / 2);
  cabin.add(ceilMesh);
  lightUv(ceilMesh, CEILING);
  for (const z of [0.9, 1.75]) box(CAB_W, 0.004, 0.008, reveal, 0, CAB_H - 0.002, z, cabin);
  // parois : un fond sombre, des panneaux de noyer séparés par des joints de 8 mm
  const KICK = 0.12;
  const ledStrip = new THREE.MeshBasicMaterial({ color: hdr(o.accent, 1.1), toneMapped: false });
  const JOINT = 0.008;
  const panelsZ = [0.02, 0.9, 1.75, CAB_D];
  for (const sx of [-1, 1]) {
    const x = (sx * CAB_W) / 2;
    const wall = sideWall(sx);
    const wood = baked(walnut, wall);
    box(0.02, CAB_H, CAB_D, reveal, x + sx * 0.01, CAB_H / 2, CAB_D / 2, cabin);
    for (let i = 0; i < panelsZ.length - 1; i++) {
      const z0 = panelsZ[i]! + JOINT / 2;
      const z1 = panelsZ[i + 1]! - JOINT / 2;
      lightUv(panel(z1 - z0, CAB_H - KICK - 0.03, wood, x - sx * 0.002, KICK + (CAB_H - KICK - 0.03) / 2 + 0.005, (z0 + z1) / 2, (-sx * Math.PI) / 2, cabin), wall);
    }
    // plinthe inox
    box(0.006, KICK, CAB_D, brushedSteel, x - sx * 0.003, KICK / 2, CAB_D / 2, cabin);
    // main courante sur platines
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, CAB_D - 0.7, 16), steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x - sx * 0.065, 0.92, 0.45 + (CAB_D - 0.7) / 2);
    cabin.add(rail);
    for (const z of [0.5, CAB_D / 2 + 0.2, CAB_D - 0.3]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.06, 10), steel);
      post.rotation.z = Math.PI / 2;
      post.position.set(x - sx * 0.035, 0.92, z);
      cabin.add(post);
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 20), steel);
      rose.rotation.z = Math.PI / 2;
      rose.position.set(x - sx * 0.006, 0.92, z);
      cabin.add(rose);
    }
    // filets de LED à la couleur du tier : dans l'angle des portes et sous le plafond
    box(0.007, CAB_H - KICK - 0.04, 0.007, ledStrip, x - sx * 0.006, KICK + (CAB_H - KICK) / 2, 0.01, cabin);
    box(0.007, 0.007, CAB_D, ledStrip, x - sx * 0.006, CAB_H - 0.01, CAB_D / 2, cabin);
  }
  lightUv(panel(CAB_W, CAB_H - KICK, baked(walnut, BACK), 0, KICK + (CAB_H - KICK) / 2, CAB_D - 0.002, Math.PI, cabin), BACK);
  box(CAB_W, KICK, 0.006, brushedSteel, 0, KICK / 2, CAB_D - 0.003, cabin);
  // plafond : six spots ronds, très lumineux, dans un cerclage inox
  const spotGeo = new THREE.CircleGeometry(0.045, 24);
  const ringGeo = new THREE.RingGeometry(0.045, 0.062, 32);
  const downMat = new THREE.MeshBasicMaterial({ color: hdr("#fff1de", 6), toneMapped: false });
  for (const x of [-0.5, 0.5])
    for (const z of [0.5, 1.3, 2.1]) {
      const d = new THREE.Mesh(spotGeo, downMat);
      d.rotation.x = Math.PI / 2;
      d.position.set(x, CAB_H - 0.002, z);
      const r = new THREE.Mesh(ringGeo, steel);
      r.rotation.x = Math.PI / 2;
      r.position.set(x, CAB_H - 0.003, z);
      cabin.add(d, r);
    }
  // la lumière en direct : un éclairage d'ensemble faible (les reflets du bois
  // et de la pierre ; le reste est précalculé), et les deux spots de devant qui
  // lèchent la façade en inox
  RectAreaLightUniformsLib.init();
  const cabinLight = new THREE.RectAreaLight(0xffe7cf, 1.6, 1.4, 2.0);
  cabinLight.position.set(0, CAB_H - 0.01, 1.3);
  cabinLight.lookAt(0, 0, 1.3);
  cabin.add(cabinLight);
  const wash: THREE.SpotLight[] = [];
  for (const sx of [-1, 1]) {
    const s = new THREE.SpotLight(0xffe2c4, 3.5, 4, 0.8, 0.8, 1.6);
    s.position.set(sx * 0.5, CAB_H - 0.03, 0.5);
    s.target.position.set(sx * 0.55, 0.4, -0.05);
    cabin.add(s, s.target);
    wash.push(s);
  }

  // la façade : inox brossé, portes en retrait de 6 cm, seuil en alu rainuré,
  // afficheur noir dans l'imposte, boîte à boutons en verre noir à droite
  const sideW = (CAB_W - DOOR_W) / 2;
  for (const sx of [-1, 1]) box(sideW, CAB_H, 0.12, brushedSteel, sx * (DOOR_W / 2 + sideW / 2), CAB_H / 2, -0.06);
  box(DOOR_W, CAB_H - DOOR_H, 0.12, brushedSteel, 0, (DOOR_H + CAB_H) / 2, -0.06);
  box(DOOR_W + 0.02, 0.01, 0.16, steel, 0, 0.005, -0.04);
  for (let i = 0; i < 4; i++) box(DOOR_W, 0.002, 0.006, reveal, 0, 0.0105, -0.09 + i * 0.03);
  // les portes : même inox, plus mat, sinon le reflet du plafonnier fait une
  // barre blanche qui écrase le joint central
  const doorSteel = brushedSteel.clone();
  doorSteel.color.set(0x6f767d);
  doorSteel.roughness = 0.45;
  doorSteel.anisotropy = 0.5;
  doorSteel.envMapIntensity = 0.55;
  cabinMats.push(doorSteel);
  const doors: { mesh: THREE.Mesh; dir: number; closed: number }[] = [];
  for (const dir of [-1, 1]) {
    // portes de la cabine, puis portes palières, qui s'ouvrent ensemble
    for (const z of [-0.06, -0.25]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W / 2 - 0.004, DOOR_H, 0.035), doorSteel);
      m.position.set((dir * DOOR_W) / 4, DOOR_H / 2, z);
      m.receiveShadow = true;
      scene.add(m);
      doors.push({ mesh: m, dir, closed: (dir * DOOR_W) / 4 });
    }
  }
  // la gaine, vue par le jour entre les portes : la lumière des paliers défile
  const shaftTex = keep(makeShaftTexture());
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, color: hdr("#ffe9d0", 2), toneMapped: false, transparent: true, opacity: 0.3, depthWrite: false });
  const shaftGap = new THREE.Mesh(new THREE.PlaneGeometry(0.08, DOOR_H), shaftMat);
  shaftGap.position.set(0, DOOR_H / 2, -0.13);
  scene.add(shaftGap);
  const seamMat = new THREE.MeshBasicMaterial({ color: hdr("#ffffff", 0), toneMapped: false, transparent: true });
  const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.008, DOOR_H), seamMat);
  seam.position.set(0, DOOR_H / 2, -0.04);
  scene.add(seam);
  // l'afficheur, dans l'imposte
  const DISP = { w: 0.96, h: 0.22 };
  const screen = keep(createWallScreen(o.accent, DISP));
  const dispY = (DOOR_H + CAB_H) / 2;
  box(DISP.w + 0.05, DISP.h + 0.05, 0.01, glassBlack, 0, dispY, 0.004);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(DISP.w, DISP.h), screen.material);
  display.position.set(0, dispY, 0.0095);
  scene.add(display);
  // la boîte à boutons : verre noir, mini-afficheur, deux colonnes de boutons
  // inox cerclés de lumière ; l'étage d'arrivée à la couleur du tier
  const panelX = DOOR_W / 2 + sideW / 2;
  box(0.16, 0.98, 0.012, glassBlack, panelX, 1.18, 0.006);
  const mini = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.0275), screen.material);
  mini.position.set(panelX, 1.58, 0.0125);
  scene.add(mini);
  const btnGeo = new THREE.CylinderGeometry(0.017, 0.018, 0.008, 28);
  btnGeo.rotateX(Math.PI / 2);
  const haloGeo = new THREE.RingGeometry(0.019, 0.022, 32);
  const btnOff = new THREE.MeshBasicMaterial({ color: hdr("#d9e2ec", 0.18), toneMapped: false });
  const btnOn = new THREE.MeshBasicMaterial({ color: hdr(o.accent, 0.35), toneMapped: false });
  for (let r = 0; r < 7; r++)
    for (const c of [-1, 1]) {
      const y = 1.46 - r * 0.075;
      const b = new THREE.Mesh(btnGeo, steel);
      b.position.set(panelX + c * 0.038, y, 0.016);
      const h = new THREE.Mesh(haloGeo, r === 0 && c === 1 ? btnOn : r === 6 && c === -1 ? new THREE.MeshBasicMaterial({ color: hdr("#f5c542", 0.5), toneMapped: false }) : btnOff);
      h.position.set(panelX + c * 0.038, y, 0.0125);
      scene.add(b, h);
    }
  // les reflets de la cabine : on la photographie de l'intérieur (deux fois,
  // pour que l'inox se reflète aussi dans l'inox) et ses matières reflètent cette image
  const pmrem = new THREE.PMREMGenerator(renderer);
  let cabinEnv: THREE.Texture | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const next = pmrem.fromScene(scene, 0.02, 0.02, 20, { position: V(0, 1.45, 1.4) }).texture;
    for (const m of cabinMats) m.envMap = next;
    cabinEnv?.dispose();
    cabinEnv = next;
  }
  pmrem.dispose();
  disposables.push(cabinEnv!);

  return {
    doors,
    screen,
    brushedSteel,
    shaftTex,
    shaftMat,
    shaftGap,
    setLight(k) {
      cabinLight.intensity = 1.6 * k;
      for (const s of wash) s.intensity = 3.5 * k;
    },
    btnOn,
    seam,
    seamMat,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}

/** Rugosité de l'inox brossé : stries verticales fines, en tuile. */
function makeBrushedTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(90 + rnd(i, 71) * 90);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.globalAlpha = 0.35;
    g.fillRect(rnd(i, 72) * 256, rnd(i, 73) * 256 - 60, 1, 40 + rnd(i, 74) * 200);
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
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

/** Dalles de pierre grise de 60 cm (deux par deux, en tuile) : nuances marbrées, joints fins. */
function makeStoneTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  for (let ty = 0; ty < 2; ty++)
    for (let tx = 0; tx < 2; tx++) {
      const k = tx + ty * 2;
      const base = 118 + Math.floor(rnd(k, 91) * 14);
      g.fillStyle = `rgb(${base},${base - 2},${base - 5})`;
      g.fillRect(tx * 256, ty * 256, 256, 256);
      for (let i = 0; i < 260; i++) {
        const v = base + Math.floor((rnd(i + k * 300, 92) - 0.5) * 34);
        g.fillStyle = `rgba(${v},${v - 2},${v - 4},0.22)`;
        g.beginPath();
        g.ellipse(tx * 256 + rnd(i + k * 300, 93) * 256, ty * 256 + rnd(i + k * 300, 94) * 256, 4 + rnd(i, 95) * 26, 2 + rnd(i, 96) * 10, rnd(i, 97) * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
    }
  g.fillStyle = "rgba(40,38,36,0.9)";
  for (const p of [0, 256]) {
    g.fillRect(p, 0, 2, 512);
    g.fillRect(0, p, 512, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
