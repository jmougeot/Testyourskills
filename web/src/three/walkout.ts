// La révélation en 3D (Three.js), calquée sur le walkout de FC 27, version
// entreprise, dans un décor qui parle à tout le monde : l'ascenseur qui monte
// jusqu'à l'étage du dev.
// 1. le pack flotte dans la cabine d'un ascenseur de nuit ; il éclate ;
// 2. l'ascenseur monte : l'étage défile sur l'afficheur au-dessus des portes,
//    et la lumière des paliers passe dans le jour entre les portes ;
// 3. sur l'écran, et en 3D chromée devant lui : le poste, le langage (le
//    drapeau), la ligue (GitHub, CV, ou les deux), puis le club, qui se fait
//    attendre ;
// 4. « ding » : l'ascenseur arrive à l'étage du tier (le dernier pour une
//    icône), les portes s'ouvrent sur l'open space de nuit, les néons
//    s'allument rangée par rangée, la ville derrière les baies ;
// 5. au bout de l'allée lumineuse, le dev code à son poste (feux d'artifice sur
//    la ville au clic ou à Espace), sa chaise pivote, la carte se forme devant
//    lui, tourne, la note claque et la carte se pose au pixel près sur la carte
//    HTML. Une flèche pour une carte seule, deux pour une comparaison GitHub × CV
//    (le « double »). Assets : web/src/three/assets.ts.
import * as THREE from "three";
import { BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect, BlendFunction } from "postprocessing";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import type { WalkoutAssets } from "./assets";
import { createCardMesh } from "./cardMesh";
import { createWallScreen } from "./ledWall";
import { createPlayer } from "./player";
import { createWorkstation } from "./workstation";
import { createCityBackdrop, createFloorReflection, createStudioEnvironment } from "./stage";
import * as T from "./textures";

export type WalkoutCue = "fireworks" | null;

export interface WalkoutTexts {
  /** Langage principal (le « drapeau ») ; null si aucun. */
  langName: string;
  langLabel: string;
  /** La ligue : la source (GitHub, CV, ou les deux). */
  leagueName: string;
  leagueLabel: string;
  /** Code du poste (« FS ») et son nom en clair (« Full-stack »). */
  position: string;
  positionName: string;
  positionLabel: string;
  club: string;
  clubLabel: string;
  /** « Statut », au-dessus du statut affiché pendant la montée. */
  statusLabel: string;
  /** Les statuts par note, du plus bas au plus haut : à partir de `min`. */
  statuses: { min: number; label: string }[];
  /** Écran en veille. */
  idleTitle: string;
  idleSubtitle: string;
  /** Sous-titre du graphe de contributions sur l'écran du dev. */
  graphLabel: string;
}

export interface WalkoutOptions {
  canvas: HTMLCanvasElement;
  lang: "fr" | "en";
  /** Comparaison GitHub × CV : deux flèches au lieu d'une. */
  double: boolean;
  accent: { a: string; b: string; ink: string };
  texts: WalkoutTexts;
  /** Clé du langage principal (code sur l'écran du dev) et pseudo affiché. */
  langKey?: string;
  login: string;
  /** Chemins SVG (24 × 24) : logo du langage, logo de la ligue. */
  logoPath: string;
  leaguePath: string;
  overall: number;
  assets: WalkoutAssets;
  /** Texture de la carte, résolue en arrière-plan pendant la séquence. */
  cardTexture: Promise<THREE.Texture>;
  /** Rect de l'emplacement HTML de la carte, pour la passation. */
  anchor: () => DOMRect | null;
  onHandoff: () => void;
  onDone: () => void;
  onCue?: (cue: WalkoutCue) => void;
}

export interface WalkoutHandle {
  open(): void;
  skip(): void;
  /** Clic ou Espace pendant la séquence : vrai si la scène l'a utilisé (feux d'artifice). */
  interact(): boolean;
  dispose(): void;
}

/* ---------- petites fonctions d'animation ---------- */
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const seg = (t: number, start: number, dur: number) => clamp01((t - start) / dur);
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const inCubic = (p: number) => p * p * p;
const inOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const outBack = (p: number) => 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
/** Bruit lisse et non périodique dans [-1, 1] (somme de sinus incommensurables). */
const smoothNoise = (x: number) => 0.5 * Math.sin(x) + 0.3 * Math.sin(x * 2.31 + 1.7) + 0.2 * Math.sin(x * 4.87 + 4.2);
const within = (t: number, w: [number, number]) => t >= w[0] && t < w[1];
const rnd = (i: number, s: number) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const hdr = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(k);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/* ---------- géométrie (mètres) : sol à y = 0, l'ascenseur s'ouvre vers -z ---------- */
const CAB_W = 2.1; // cabine aux mesures d'une vraie : x de -1,05 à 1,05, z de 0 (portes) à 2,6
const CAB_H = 2.45;
const CAB_D = 2.6;
const DOOR_W = 1.0;
const DOOR_H = 2.1;
const ROOM_W = 22; // open space : x de -11 à 11, z de 0 à -14 (baies)
const WIN_Z = -14;
const CEIL = 3.3;
const DESK_Z = -7.8;
/** Le pack et la caméra dans la cabine ; pose finale de la caméra (regard droit vers -z) et emplacement de la carte. */
const PACK_POS = V(0, 1.5, 0.7);
const CAB_CAM = V(0, 1.5, 2.45);
const F_POS = V(0, 1.5, -3.2);
const CARD_POS = V(0, 1.45, -6.3);
const CARD_W3 = 1.2;
const CARD_H3 = (CARD_W3 * 520) / 360;
const TELL_POS = V(0, 1.24, 0.5);

/* ---------- chronologie ---------- */
type Win = [number, number];
const PLAN = {
  /** Après l'éclatement, l'ascenseur s'établit seul : l'afficheur passe à
   * l'étage 00, la flèche s'allume, le bouton aussi. Rien d'autre. */
  depart: 1.9,
  /** L'étage défile, vite puis de plus en plus lentement. */
  ascent: [1.9, 10.9] as Win,
  /** Les révélations ne commencent qu'une fois la montée lancée : une chose à la fois. */
  position: [2.7, 4.5] as Win,
  lang: [4.5, 6.2] as Win,
  league: [6.2, 7.8] as Win,
  loading: [7.8, 8.6] as Win,
  club: [8.6, 10.5] as Win,
  arrive: 10.9,
  doors: 11.3,
  /** Les néons de l'open space, rangée par rangée. */
  lights: 11.45,
  fireworks: [12.2, 15.6] as Win,
  autoFire: [12.6, 13.4, 14.3, 15.0],
  card: 15.6,
};

interface Burst {
  points: THREE.Points;
  mat: THREE.PointsMaterial;
  origin: THREE.Vector3;
  vel: Float32Array;
  start: number;
  life: number;
  gravity: number;
}

export function createWalkout(o: WalkoutOptions): WalkoutHandle {
  const { canvas, accent, assets } = o;
  const plan = PLAN;
  const T_BURST = 0.5;
  const T_CARD = plan.card;
  const T_SLAM = T_CARD + 1.0;
  const T_SETTLE = T_CARD + 1.6;
  const T_HANDOFF = T_SETTLE + 1.15;
  const T_END = T_HANDOFF + 0.6;
  const T_TURN = T_CARD - 1.05;
  const low = window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) < 560;

  /* ---------- rendu ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, low ? 1.25 : 1.5));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = !low;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  scene.fog = new THREE.FogExp2(0x05070d, 0.025);
  // Reflets : faibles partout ; les matières qui règlent leur propre intensité
  // (carte, métaux, pack) reçoivent la carte d'environnement en direct, sinon
  // three.js applique l'intensité de la scène à leur place.
  const studio = createStudioEnvironment(renderer, accent.a);
  scene.environment = studio;
  scene.environmentIntensity = 0.12;
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
  camera.position.copy(CAB_CAM);
  scene.add(camera);

  const glowTex = T.makeGlowTexture();
  const sparkTex = T.makeSparkTexture();
  const disposables: { dispose(): void }[] = [glowTex, sparkTex];
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

  const floor = assets.floor;
  floor.normalMap.repeat.set(6, 4);
  floor.roughnessMap.repeat.set(6, 4);
  const concrete = new THREE.MeshPhysicalMaterial({
    color: 0x0b0d11,
    roughness: 0.5,
    roughnessMap: floor.roughnessMap,
    normalMap: floor.normalMap,
    normalScale: new THREE.Vector2(0.3, 0.3),
    metalness: 0.2,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    envMapIntensity: 0.15,
  });
  // inox poli : mains courantes, boutons, seuil
  const steel = new THREE.MeshPhysicalMaterial({ color: 0xc4c9cf, metalness: 1, roughness: 0.2, envMapIntensity: 1 });
  const darkPanel = new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.55, metalness: 0.3 });
  const accentGlow = new THREE.MeshBasicMaterial({ color: hdr(accent.a, 2), toneMapped: false });
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
    map: veneer(assets.wood.map),
    normalMap: veneer(assets.wood.normalMap),
    roughnessMap: veneer(assets.wood.roughnessMap),
    color: 0x8c7867,
    roughness: 0.55,
    normalScale: new THREE.Vector2(0.25, 0.25),
    envMapIntensity: 0.6,
  });
  const reveal = new THREE.MeshStandardMaterial({ color: 0x0d0b0a, roughness: 0.8 });
  const stone = keep(makeStoneTexture());
  stone.repeat.set(CAB_W / 1.2, CAB_D / 1.2);
  const stoneMat = new THREE.MeshPhysicalMaterial({ map: stone, color: 0xc9c6c0, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.25, envMapIntensity: 0.6 });
  // plafond bronze sombre ; la lumière renvoyée par le sol est simulée par une faible émission
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x4a443d, emissive: 0x3a332b, metalness: 0.4, roughness: 0.5, envMapIntensity: 0.8 });
  const glassBlack = new THREE.MeshPhysicalMaterial({ color: 0x040506, metalness: 0, roughness: 0.06, clearcoat: 1, envMapIntensity: 1 });
  const cabinMats = [brushedSteel, steel, walnut, stoneMat, ceilMat, glassBlack];

  /** Un panneau plat, ses UV en mètres (1 m de placage par tuile). */
  const panel = (w: number, h: number, mat: THREE.Material, x: number, y: number, z: number, ry: number, parent: THREE.Object3D) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  const cabin = new THREE.Group();
  scene.add(cabin);
  box(CAB_W, 0.04, CAB_D, stoneMat, 0, -0.02, CAB_D / 2, cabin);
  box(CAB_W, 0.04, CAB_D, ceilMat, 0, CAB_H + 0.02, CAB_D / 2, cabin);
  for (const z of [0.9, 1.75]) box(CAB_W, 0.004, 0.008, reveal, 0, CAB_H - 0.002, z, cabin);
  // parois : un fond sombre, des panneaux de noyer séparés par des joints de 8 mm
  const KICK = 0.12;
  const ledStrip = new THREE.MeshBasicMaterial({ color: hdr(accent.a, 1.1), toneMapped: false });
  const JOINT = 0.008;
  const panelsZ = [0.02, 0.9, 1.75, CAB_D];
  for (const sx of [-1, 1]) {
    const x = (sx * CAB_W) / 2;
    box(0.02, CAB_H, CAB_D, reveal, x + sx * 0.01, CAB_H / 2, CAB_D / 2, cabin);
    for (let i = 0; i < panelsZ.length - 1; i++) {
      const z0 = panelsZ[i]! + JOINT / 2;
      const z1 = panelsZ[i + 1]! - JOINT / 2;
      panel(z1 - z0, CAB_H - KICK - 0.03, walnut, x - sx * 0.002, KICK + (CAB_H - KICK - 0.03) / 2 + 0.005, (z0 + z1) / 2, (-sx * Math.PI) / 2, cabin);
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
  panel(CAB_W, CAB_H - KICK, walnut, 0, KICK + (CAB_H - KICK) / 2, CAB_D - 0.002, Math.PI, cabin);
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
  // la lumière : un éclairage d'ensemble doux, et les deux spots de devant
  // qui lèchent la façade (les « festons » de lumière des vraies cabines)
  RectAreaLightUniformsLib.init();
  const cabinLight = new THREE.RectAreaLight(0xffe7cf, 5, 1.4, 2.0);
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
  const screen = keep(createWallScreen(accent.a, DISP));
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
  const btnOn = new THREE.MeshBasicMaterial({ color: hdr(accent.a, 0.35), toneMapped: false });
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

  /* ---------- l'open space ---------- */
  const office = new THREE.Group();
  scene.add(office);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, -WIN_Z), concrete);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, WIN_Z / 2);
  ground.receiveShadow = true;
  office.add(ground);
  if (!low) {
    const r = createFloorReflection(10, -WIN_Z - 0.4, floor.normalMap, new THREE.Vector2(3, 4), new THREE.Vector2(1024, 1024));
    r.mesh.rotation.x = -Math.PI / 2;
    r.mesh.position.set(0, 0.004, WIN_Z / 2 - 0.2);
    r.strength.value = 0.12;
    scene.add(r.mesh);
    disposables.push({ dispose: () => r.mesh.dispose() });
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, -WIN_Z), new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.9 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEIL, WIN_Z / 2);
  office.add(ceiling);
  // murs : les côtés, avec un liseré de LED au pied à la couleur du tier, et
  // le mur de l'ascenseur, percé à la taille des portes, avec ses tableaux en inox
  for (const sx of [-1, 1]) {
    box(0.1, CEIL, -WIN_Z, darkPanel, (sx * ROOM_W) / 2, CEIL / 2, WIN_Z / 2, office);
    box(0.02, 0.025, -WIN_Z, accentGlow, sx * (ROOM_W / 2 - 0.06), 0.06, WIN_Z / 2, office);
  }
  box((ROOM_W - DOOR_W) / 2, CEIL, 0.1, darkPanel, -(ROOM_W + DOOR_W) / 4, CEIL / 2, -0.25, office);
  box((ROOM_W - DOOR_W) / 2, CEIL, 0.1, darkPanel, (ROOM_W + DOOR_W) / 4, CEIL / 2, -0.25, office);
  box(DOOR_W, CEIL - DOOR_H, 0.1, darkPanel, 0, (CEIL + DOOR_H) / 2, -0.25, office);
  for (const sx of [-1, 1]) box(0.03, DOOR_H, 0.2, brushedSteel, sx * (DOOR_W / 2 + 0.015), DOOR_H / 2, -0.2, office);
  box(DOOR_W + 0.06, 0.03, 0.2, brushedSteel, 0, DOOR_H + 0.015, -0.2, office);
  // les baies : montants, allège, verre fumé
  const mullion = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.4, metalness: 0.7 });
  for (let x = -ROOM_W / 2; x <= ROOM_W / 2 + 0.01; x += 2.2) box(0.08, CEIL, 0.12, mullion, x, CEIL / 2, WIN_Z, office);
  box(ROOM_W, 0.35, 0.14, mullion, 0, 0.175, WIN_Z, office);
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W, CEIL),
    new THREE.MeshPhysicalMaterial({ color: 0x0b1424, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 0.8, depthWrite: false }),
  );
  glass.position.set(0, CEIL / 2, WIN_Z + 0.02);
  office.add(glass);
  // la ville de nuit
  const city = createCityBackdrop(assets.city, 120, 70, -18, scene.background);
  city.mesh.position.set(0, 0, DESK_Z);
  scene.add(city.mesh);

  // Luminaires suspendus : lumière chaude, boîtiers sombres et câbles fins.
  const ROWS = 8;
  const rowMats: THREE.MeshBasicMaterial[] = [];
  for (let r = 0; r < ROWS; r++) {
    const mat = new THREE.MeshBasicMaterial({ color: hdr("#eef3ff", 0.05), toneMapped: false });
    rowMats.push(mat);
    const z = -1.2 - r * 1.6;
    for (const x of [-5.2, 5.2]) {
      box(2.6, 0.055, 0.16, darkPanel, x, CEIL - 0.31, z, office);
      for (const dx of [-0.95, 0.95]) box(0.008, 0.28, 0.008, mullion, x + dx, CEIL - 0.14, z, office);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.009, 0.12), mat);
      bar.position.set(x, CEIL - 0.343, z);
      office.add(bar);
    }
  }
  const officeLights = [-2.5, -6.5, -10.5].map((z) => {
    const l = new THREE.PointLight(0xffdfb8, 0, 14, 1.6);
    l.position.set(0, CEIL - 0.25, z);
    office.add(l);
    return l;
  });
  const hemi = new THREE.HemisphereLight(0xa1b8ce, 0x403026, 0.18);
  scene.add(hemi);

  // l'allée de LED au sol, de l'ascenseur jusqu'au poste du dev
  const PATH_N = 12;
  const pathGeo = new THREE.BoxGeometry(0.025, 0.006, 0.12);
  const path = new THREE.InstancedMesh(pathGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), PATH_N * 2);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < PATH_N; i++)
    for (const sx of [-1, 1]) {
      dummy.position.set(sx * 1.38, 0.008, -0.5 - (i / (PATH_N - 1)) * (-DESK_Z - 2.3));
      dummy.updateMatrix();
      path.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), dummy.matrix);
      path.setColorAt(i * 2 + (sx > 0 ? 1 : 0), new THREE.Color(0, 0, 0));
    }
  scene.add(path);

  // les autres postes : îlots de bureaux face à face, écrans en veille
  const deskSpots: { x: number; z: number; face: 1 | -1; row: number }[] = [];
  for (const [zc, row] of [
    [-4.4, 1],
    [-11.2, 5],
  ] as const)
    for (const x of [-7.2, -5.3, -3.4, 3.4, 5.3, 7.2]) {
      deskSpots.push({ x, z: zc + 0.42, face: 1, row });
      deskSpots.push({ x, z: zc - 0.42, face: -1, row: row + 1 });
    }
  const nDesks = deskSpots.length;
  const deskTopMat = new THREE.MeshStandardMaterial({ color: 0x665245, roughness: 0.8 });
  const tops = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.035, 0.8), deskTopMat, nDesks);
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.72, 0.04), darkPanel, nDesks);
  const bezels = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.37, 0.03), darkPanel, nDesks);
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), darkPanel, nDesks);
  const backs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.6, 0.06), darkPanel, nDesks);
  const codeTex = keep(makeCodeTexture(accent.a));
  const screenMat = new THREE.MeshBasicMaterial({ map: codeTex, toneMapped: false });
  const facing = deskSpots.filter((d) => d.face === 1);
  const otherScreens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.58, 0.33), screenMat, facing.length);
  const place = (mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, ry = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, ry, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  let si = 0;
  deskSpots.forEach((d, i) => {
    place(tops, i, d.x, 0.74, d.z);
    place(legs, i, d.x, 0.37, d.z - d.face * 0.36);
    place(bezels, i, d.x, 1.12, d.z - d.face * 0.25);
    place(seats, i, d.x + (rnd(i, 3) - 0.5) * 0.2, 0.48, d.z + d.face * 0.62, (rnd(i, 4) - 0.5) * 0.5);
    place(backs, i, d.x + (rnd(i, 3) - 0.5) * 0.2, 0.85, d.z + d.face * 0.86, (rnd(i, 4) - 0.5) * 0.5);
    if (d.face === 1) {
      // la texture de code est partagée : chaque écran en montre un morceau différent
      place(otherScreens, si, d.x, 1.12, d.z - 0.25 + 0.017);
      otherScreens.setColorAt(si, new THREE.Color(0, 0, 0));
      si++;
    }
  });
  for (const m of [tops, legs, bezels, seats, backs]) {
    m.castShadow = !low;
    m.receiveShadow = true;
    office.add(m);
  }
  office.add(otherScreens);

  // Une alcôve en bois et deux plantes encadrent le poste devant les baies.
  const oak = new THREE.MeshStandardMaterial({ color: 0x79563c, roughness: 0.85 });
  const planter = new THREE.MeshStandardMaterial({ color: 0x343e3d, roughness: 0.9 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x345b45, roughness: 0.85, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      box(0.045, CEIL, 0.1, oak, sx * (2.75 + i * 0.1), CEIL / 2, WIN_Z + 0.18, office);
    }
    const plant = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.48, 24), planter);
    pot.position.y = 0.24;
    pot.castShadow = true;
    plant.add(pot);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), darkPanel);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.481;
    plant.add(soil);
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4;
      const height = 0.65 + rnd(i, 81) * 0.65;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, height, 5), foliage);
      stem.position.set(Math.sin(angle) * 0.07, 0.43 + height / 2, Math.cos(angle) * 0.07);
      plant.add(stem);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), foliage);
      leaf.scale.set(0.12, 0.035, 0.38);
      leaf.position.set(Math.sin(angle) * 0.25, 0.43 + height, Math.cos(angle) * 0.25);
      leaf.rotation.set(0.35, angle, -0.2);
      leaf.castShadow = !low;
      plant.add(leaf);
    }
    plant.position.set(sx * 2.15, 0, DESK_Z - 1.05);
    office.add(plant);
  }

  const pendantMat = new THREE.MeshBasicMaterial({ color: hdr(0xffdfb8, 0.1), toneMapped: false });
  box(2.8, 0.06, 0.19, darkPanel, 0, 2.75, DESK_Z - 0.5, office);
  box(2.68, 0.008, 0.13, pendantMat, 0, 2.716, DESK_Z - 0.5, office);
  for (const x of [-1.05, 1.05]) box(0.008, CEIL - 2.78, 0.008, mullion, x, (CEIL + 2.78) / 2, DESK_Z - 0.5, office);

  /* ---------- lumières de la carte ---------- */
  const key = new THREE.SpotLight(0xffffff, 0, 12, 0.5, 0.6, 1.4);
  key.position.set(0.8, CEIL - 0.2, CARD_POS.z + 3.0);
  key.target.position.copy(CARD_POS);
  scene.add(key, key.target);
  const cardRimL = new THREE.PointLight(accent.a, 0, 5, 1.6);
  cardRimL.position.set(-1.3, CARD_POS.y + 0.6, CARD_POS.z - 0.9);
  const cardRimR = new THREE.PointLight(accent.b, 0, 5, 1.6);
  cardRimR.position.set(1.3, CARD_POS.y - 0.2, CARD_POS.z - 0.9);
  scene.add(cardRimL, cardRimR);

  /* ---------- le pack (état prêt) ---------- */
  const packFace = keep(T.makePackFaceTexture(accent.a, accent.b, o.lang));
  const packBackTex = keep(T.makePackBackTexture(accent.a));
  const foilSide = new THREE.MeshStandardMaterial({ color: 0x3a4a5c, metalness: 0.95, roughness: 0.3, transparent: true, envMapIntensity: 1.2 });
  const foilFront = new THREE.MeshPhysicalMaterial({ map: packFace, emissiveMap: packFace, emissive: 0xffffff, emissiveIntensity: 0.3, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, envMapIntensity: 1.1 });
  const foilBack = new THREE.MeshPhysicalMaterial({ map: packBackTex, metalness: 0.85, roughness: 0.3, clearcoat: 0.8, transparent: true, envMapIntensity: 1.2 });
  const pack = new THREE.Group();
  const packBody = new THREE.Mesh(new RoundedBoxGeometry(1.0, 1.5, 0.09, 3, 0.035), [foilSide, foilSide, foilSide, foilSide, foilFront, foilBack]);
  const crimpMat = new THREE.MeshStandardMaterial({ color: 0xb9c6d2, metalness: 1, roughness: 0.4, envMapIntensity: 1.1 });
  const crimpGeo = new THREE.BoxGeometry(1.06, 0.11, 0.13);
  const crimpTop = new THREE.Mesh(crimpGeo, crimpMat);
  crimpTop.position.y = 0.79;
  const crimpBottom = new THREE.Mesh(crimpGeo, crimpMat);
  crimpBottom.position.y = -0.79;
  const packSeamMat = new THREE.MeshBasicMaterial({ color: hdr("#ffffff", 4), transparent: true, opacity: 0, toneMapped: false });
  const packSeam = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.035), packSeamMat);
  packSeam.position.set(0, 0.71, 0.06);
  pack.add(packBody, crimpTop, crimpBottom, packSeam);
  pack.scale.setScalar(0.62);
  pack.position.copy(PACK_POS);
  scene.add(pack);
  const packLight = new THREE.PointLight(accent.a, 2, 5, 1.6);
  packLight.position.set(0, PACK_POS.y + 0.3, PACK_POS.z + 1.0);
  scene.add(packLight);

  /* ---------- particules ---------- */
  const bursts: Burst[] = [];
  const makeBurst = (n: number, color: string, speed: number, spread: number, up: number, size: number, life: number, gravity: number): Burst => {
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd(i, 21 + bursts.length) * Math.PI * 2;
      const r = Math.sqrt(rnd(i, 22 + bursts.length)) * spread;
      const s = speed * (0.55 + rnd(i, 23) * 0.9);
      vel[i * 3] = Math.cos(a) * r * s;
      vel[i * 3 + 1] = up * s + (rnd(i, 24) - 0.5) * spread * s;
      vel[i * 3 + 2] = Math.sin(a) * r * s;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ map: sparkTex, size, color: hdr(color, 3), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const points = new THREE.Points(g, mat);
    points.visible = false;
    points.frustumCulled = false;
    scene.add(points);
    const b = { points, mat, origin: new THREE.Vector3(), vel, start: -99, life, gravity };
    bursts.push(b);
    return b;
  };
  const packBurst = makeBurst(260, accent.a, 3.2, 0.9, 0.8, 0.07, 1.2, 6);
  packBurst.origin.copy(PACK_POS);
  packBurst.start = T_BURST;
  const packBurst2 = makeBurst(100, "#ffffff", 2.4, 1.2, 0.6, 0.05, 1.0, 5);
  packBurst2.origin.copy(PACK_POS);
  packBurst2.start = T_BURST;
  // feux d'artifice sur la ville : un réservoir recyclé (automatiques + au clic)
  const FW_COLORS = [accent.a, "#ffd66b", "#ffffff", accent.b, "#ff9ec6", "#8fe3ff"];
  const fireworks = Array.from({ length: 10 }, (_, i) => makeBurst(220, FW_COLORS[i % FW_COLORS.length]!, 9, 1, 0.25, 1.1, 1.9, 4));
  let fwNext = 0;
  const launch = (t: number) => {
    const b = fireworks[fwNext++ % fireworks.length]!;
    const i = fwNext;
    const side = i % 2 ? 1 : -1;
    b.origin.set(side * (6 + rnd(i, 61) * 16), 3 + rnd(i, 62) * 6, -62 - rnd(i, 63) * 20);
    b.start = t;
  };
  // flash plein écran
  const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const white = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), whiteMat);
  white.position.z = -0.2;
  white.renderOrder = 999;
  camera.add(white);

  /* ---------- les révélations 3D devant les portes ---------- */
  const metal = (color: THREE.ColorRepresentation, emissive = 0) =>
    new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08, emissive: new THREE.Color(color), emissiveIntensity: emissive, envMapIntensity: 1.6 });
  const text3D = (str: string, size: number, depth: number, mat: THREE.Material, maxWidth?: number): THREE.Mesh => {
    const g = new TextGeometry(str, { font: assets.font, size, depth, curveSegments: 6, bevelEnabled: true, bevelThickness: depth * 0.22, bevelSize: size * 0.025, bevelSegments: 3 });
    g.computeBoundingBox();
    g.center();
    const m = new THREE.Mesh(g, mat);
    const w = g.boundingBox!.max.x - g.boundingBox!.min.x;
    if (maxWidth && w > maxWidth) m.scale.setScalar(maxWidth / w);
    m.castShadow = true;
    return m;
  };
  const logo3D = (path: string, size: number, mat: THREE.Material): THREE.Mesh => {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 3.2, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.4, bevelSegments: 4, curveSegments: 12 });
    geo.center();
    const s = size / 24;
    geo.scale(s, -s, -s);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    return m;
  };
  // chaque révélation : l'objet chromé et son nom en lettres 3D au-dessus
  const tells: { obj: THREE.Object3D; win: Win }[] = [];
  const named = (obj: THREE.Object3D, name: string) => {
    const g = new THREE.Group();
    const n = text3D(name.toUpperCase(), 0.13, 0.026, metal(0xf2f5f8, 0.14), 1.3);
    n.position.y = 0.4;
    g.add(obj, n);
    return g;
  };
  {
    const g = new THREE.Group();
    const code = text3D(o.texts.position, 0.36, 0.07, metal(accent.a, 0.12));
    const n = text3D(o.texts.positionName.toUpperCase(), 0.1, 0.02, metal(0xf2f5f8, 0.14), 1.0);
    n.position.y = 0.34;
    g.add(code, n);
    tells.push({ obj: g, win: plan.position });
  }
  tells.push({ obj: named(logo3D(o.logoPath, 0.42, metal(0xe6ecf3, 0.06)), o.texts.langName), win: plan.lang });
  tells.push({ obj: named(logo3D(o.leaguePath, 0.4, metal(accent.a, 0.1)), o.texts.leagueName), win: plan.league });
  {
    const shield = new THREE.Shape();
    const S = 0.27;
    shield.moveTo(-1 * S, 1.05 * S);
    shield.lineTo(1 * S, 1.05 * S);
    shield.lineTo(1 * S, -0.25 * S);
    shield.lineTo(0, -1.25 * S);
    shield.lineTo(-1 * S, -0.25 * S);
    shield.closePath();
    const outer = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3 }), metal(accent.a, 0.06));
    const inner = new THREE.Mesh(new THREE.ExtrudeGeometry(shield, { depth: 0.012, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x0b1119, metalness: 0.5, roughness: 0.45 }));
    inner.scale.set(0.84, 0.84, 1);
    inner.position.set(0, -0.007, 0.06);
    const name = text3D(o.texts.club.toUpperCase(), 0.085, 0.018, metal(0xf2f5f8, 0.15), 0.38);
    name.position.set(0, 0.075, 0.07);
    const grp = new THREE.Group();
    grp.add(outer, inner, name);
    tells.push({ obj: grp, win: plan.club });
  }
  for (const tl of tells) {
    tl.obj.visible = false;
    scene.add(tl.obj);
  }
  const tellKey = new THREE.SpotLight(0xffffff, 0, 6, 0.5, 0.6, 1.4);
  tellKey.position.set(0.8, CAB_H - 0.1, TELL_POS.z + 1.6);
  tellKey.target.position.copy(TELL_POS);
  scene.add(tellKey, tellKey.target);

  /* ---------- le dev à son poste ---------- */
  // De dos, face à ses écrans et aux baies ; la chaise pivote vers la caméra juste avant la carte.
  const desk = createWorkstation({ accent: accent.a, lang: o.langKey, login: o.login, seed: o.overall, graphLabel: o.texts.graphLabel });
  const player = createPlayer(assets.player, hdr("#cfe2ff", 1.2));
  desk.group.rotation.y = Math.PI;
  desk.group.position.set(0, 0, DESK_Z);
  player.root.position.set(0, 0.03, 0);
  desk.swivel.add(player.root);
  scene.add(desk.group);
  disposables.push(desk);
  const heroSpot = new THREE.SpotLight(0xffe0b9, 0, 10, 0.72, 0.85, 1.4);
  heroSpot.position.set(-1.8, CEIL - 0.1, DESK_Z + 1.8);
  heroSpot.target.position.set(0, 0.6, DESK_Z);
  heroSpot.castShadow = !low;
  heroSpot.shadow.mapSize.set(1024, 1024);
  heroSpot.shadow.bias = -0.0004;
  scene.add(heroSpot, heroSpot.target);
  const windowLight = new THREE.SpotLight(0xa2c5ed, 0, 9, 0.85, 0.9, 1.5);
  windowLight.position.set(2.5, 2.8, DESK_Z - 2.4);
  windowLight.target.position.set(0, 0.9, DESK_Z);
  scene.add(windowLight, windowLight.target);

  /* ---------- la carte ---------- */
  const maskTex = keep(T.makeCardMaskTexture());
  const backTex = keep(T.makeCardBackTexture(accent.a));
  const cardMesh = createCardMesh(CARD_W3, { frontMap: backTex, backMap: backTex, edgeColor: accent.a, foil: true });
  const card = new THREE.Group();
  card.add(cardMesh.group);
  const sheenTex = keep(T.makeStreakTexture(512, 128));
  sheenTex.wrapS = sheenTex.wrapT = THREE.ClampToEdgeWrapping;
  sheenTex.center.set(0.5, 0.5);
  sheenTex.rotation = 0.55;
  sheenTex.repeat.set(1.3, 2.2);
  const sheenMat = new THREE.MeshBasicMaterial({ map: sheenTex, alphaMap: maskTex, color: hdr("#ffffff", 1.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W3, CARD_H3), sheenMat);
  sheen.position.z = cardMesh.depth / 2 + 0.002;
  card.add(sheen);
  const GLINTS = 46;
  const glintPos = new Float32Array(GLINTS * 3);
  for (let i = 0; i < GLINTS; i++) {
    glintPos[i * 3] = (rnd(i, 31) - 0.5) * (CARD_W3 + 1.2);
    glintPos[i * 3 + 1] = (rnd(i, 32) - 0.5) * (CARD_H3 + 1.0);
    glintPos[i * 3 + 2] = 0.1 + rnd(i, 33) * 0.5;
  }
  const glintGeo = new THREE.BufferGeometry();
  glintGeo.setAttribute("position", new THREE.BufferAttribute(glintPos, 3));
  const glintMat = new THREE.PointsMaterial({ map: sparkTex, size: 0.16, color: hdr("#ffffff", 2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  card.add(new THREE.Points(glintGeo, glintMat));
  card.position.copy(CARD_POS);
  card.visible = false;
  scene.add(card);
  let cardReady = false;
  o.cardTexture
    .then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      cardMesh.front.map = t;
      cardMesh.front.emissiveMap = t;
      cardMesh.front.needsUpdate = true;
      cardReady = true;
    })
    .catch(() => undefined);
  // la note qui claque
  const slamMat = metal(accent.a, 0.55);
  slamMat.transparent = true;
  const slam = text3D(String(o.overall), 0.95, 0.22, slamMat);
  slam.visible = false;
  scene.add(slam);

  scene.traverse((obj) => {
    const mats = (obj as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const std = m as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial && std.envMapIntensity !== 1) std.envMap = studio;
    }
  });

  /* ---------- post-traitement ---------- */
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: low ? 0 : 4 });
  composer.addPass(new RenderPass(scene, camera));
  const dof = low ? null : new DepthOfFieldEffect(camera, { focusDistance: 5, focusRange: 1.4, bokehScale: 0 });
  const focus = PACK_POS.clone();
  const deskFocus = V(0, 1.1, DESK_Z);
  if (dof) {
    dof.target = focus;
    composer.addPass(new EffectPass(camera, dof));
  }
  const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, intensity: 0.6, radius: 0.65 });
  const vignette = new VignetteEffect({ darkness: 0.55, offset: 0.28 });
  const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  noise.blendMode.opacity.value = 0.14;
  composer.addPass(new EffectPass(camera, bloom, vignette, noise, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })));

  /* ---------- état ---------- */
  let t0 = 0;
  let opened = false;
  let raf = 0;
  let last = performance.now();
  let disposed = false;
  let handoffSent = false;
  let doneSent = false;
  let w = 1;
  let h = 1;
  let cue: WalkoutCue = null;
  let tNow = -1;
  let held: number | null = null;
  let frameMs = 16;
  let wallState = "";
  let wallSwitch = -99;
  /** Le statut ne s'affiche qu'au franchissement d'un palier, puis l'afficheur revient à l'étage seul. */
  const STATUS_HOLD = 0.9;
  let lastStatus = -1;
  let statusUntil = -99;
  const autoFired = new Set<number>();
  const shakeSeed = Math.random() * 100;
  let cardTarget: THREE.Vector3 | null = null;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const black = new THREE.Color(0, 0, 0);
  const tmpColor = new THREE.Color();

  const resize = () => {
    const nw = Math.max(1, canvas.clientWidth || window.innerWidth);
    const nh = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (nw === w && nh === h) return;
    w = nw;
    h = nh;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    cardTarget = null;
  };
  window.addEventListener("resize", resize);
  resize();
  /** Champ vertical : plus large en portrait pour garder la scène dans le cadre. */
  const fovFor = (base: number) => (camera.aspect < 0.8 ? base + 16 : camera.aspect < 1.2 ? base + 7 : base);

  /** Position de la carte 3D qui coïncide avec l'emplacement HTML (caméra en pose finale). */
  const computeCardTarget = () => {
    const r = o.anchor();
    if (!r || r.width < 10) return CARD_POS.clone();
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const d = (CARD_H3 * h) / (2 * r.height * tanH);
    const nx = ((r.left + r.width / 2) / w) * 2 - 1;
    const ny = 1 - ((r.top + r.height / 2) / h) * 2;
    return V(F_POS.x + nx * d * tanH * camera.aspect, F_POS.y + ny * d * tanH, F_POS.z - d);
  };

  const setWall = (state: string, t: number, draw: () => void, glitch = true) => {
    if (wallState === state) return;
    wallState = state;
    if (glitch) wallSwitch = t;
    draw();
  };
  const setCue = (c: WalkoutCue) => {
    if (c === cue) return;
    cue = c;
    o.onCue?.(c);
  };

  /** La montée (0 → 1) : la cabine accélère doucement, file à vitesse constante, puis freine à l'approche. */
  const ACC = 0.18;
  const DEC = 0.3;
  const VMAX = 1 / (1 - ACC / 2 - DEC / 2);
  const ascent = (t: number) => {
    const p = seg(t, plan.ascent[0], plan.ascent[1] - plan.ascent[0]);
    if (p < ACC) return (VMAX * p * p) / (2 * ACC);
    if (p < 1 - DEC) return VMAX * (ACC / 2 + (p - ACC));
    return 1 - (VMAX * (1 - p) * (1 - p)) / (2 * DEC);
  };
  /** Vitesse de la cabine, de 0 (arrêt) à 1 (pleine vitesse). */
  const ascentSpeed = (t: number) => {
    const p = seg(t, plan.ascent[0], plan.ascent[1] - plan.ascent[0]);
    if (p <= 0 || p >= 1) return 0;
    return p < ACC ? p / ACC : p < 1 - DEC ? 1 : (1 - p) / DEC;
  };
  const SCORE = Math.max(1, Math.min(99, o.overall));
  const statusAt = (n: number) => {
    let i = 0;
    o.texts.statuses.forEach((st, k) => {
      if (n >= st.min) i = k;
    });
    return i;
  };

  /* ---------- la caméra : un seul plan-séquence ----------
   * Pas une coupe : la caméra est dans la cabine, face aux portes, et s'en
   * approche lentement pendant la montée ; les portes s'ouvrent, elle sort
   * dans l'axe de l'allée et vient se poser face à la carte. Images-clés
   * interpolées par des splines d'Hermite en temps, tangentes monotones
   * (Fritsch-Carlson) : position, visée et focale continues, leur vitesse
   * aussi, sans dépassement. Tout reste dans l'axe (x = 0). */
  interface Key {
    t: number;
    pos: THREE.Vector3;
    look: THREE.Vector3;
    fov: number;
  }
  const K = (t: number, pos: THREE.Vector3, look: THREE.Vector3, fov: number): Key => ({ t, pos, look, fov });
  const keys: Key[] = [
    K(0, CAB_CAM.clone(), PACK_POS.clone().add(V(0, 0.05, 0)), 54),
    K(plan.depart, V(0, 1.48, 2.42), V(0, 1.62, 0), 64),
    K(plan.league[0], V(0, 1.48, 2.32), V(0, 1.6, 0), 64),
    K(plan.club[1], V(0, 1.48, 2.12), V(0, 1.56, 0), 62),
    K(plan.doors + 0.35, V(0, 1.5, 1.95), V(0, 1.4, -6), 58),
    K(plan.doors + 2.0, V(0, 1.53, -1.5), V(0, 1.2, DESK_Z), 44),
    K(T_TURN - 0.4, V(0, 1.51, -2.9), V(0, 1.25, DESK_Z), 41),
    K(T_SETTLE, F_POS.clone(), V(F_POS.x, F_POS.y, F_POS.z - 10), 40),
  ];
  /** Tangente monotone : nulle quand la courbe change de sens, pour ne jamais dépasser une image-clé. */
  const slope = (prev: number, cur: number, next: number, ta: number, tb: number, tc: number) => {
    const d0 = (cur - prev) / (tb - ta);
    const d1 = (next - cur) / (tc - tb);
    if (d0 * d1 <= 0) return 0;
    return (2 * d0 * d1) / (d0 + d1);
  };
  const tanAt = (i: number, get: (k: Key) => number) => {
    if (i === 0 || i === keys.length - 1) return 0; // on part du repos, on se pose
    return slope(get(keys[i - 1]!), get(keys[i]!), get(keys[i + 1]!), keys[i - 1]!.t, keys[i]!.t, keys[i + 1]!.t);
  };
  const tangents = (pick: (k: Key) => THREE.Vector3) =>
    keys.map((_k, i) => V(tanAt(i, (k) => pick(k).x), tanAt(i, (k) => pick(k).y), tanAt(i, (k) => pick(k).z)));
  const posTan = tangents((k) => k.pos);
  const lookTan = tangents((k) => k.look);
  const fovTan = keys.map((_k, i) => tanAt(i, (k) => k.fov));
  const hermite = (out: THREE.Vector3, p0: THREE.Vector3, m0: THREE.Vector3, p1: THREE.Vector3, m1: THREE.Vector3, s: number, dt: number) => {
    const s2 = s * s;
    const s3 = s2 * s;
    return out
      .copy(p0)
      .multiplyScalar(2 * s3 - 3 * s2 + 1)
      .addScaledVector(m0, (s3 - 2 * s2 + s) * dt)
      .addScaledVector(p1, -2 * s3 + 3 * s2)
      .addScaledVector(m1, (s3 - s2) * dt);
  };
  /** Caméra du plan-séquence à l'instant t (position, visée) ; renvoie la focale. */
  const rail = (t: number) => {
    let i = 0;
    while (i < keys.length - 2 && t >= keys[i + 1]!.t) i++;
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const dt = b.t - a.t;
    const s = clamp01((t - a.t) / dt);
    hermite(camPos, a.pos, posTan[i]!, b.pos, posTan[i + 1]!, s, dt);
    hermite(camLook, a.look, lookTan[i]!, b.look, lookTan[i + 1]!, s, dt);
    const s2 = s * s;
    const s3 = s2 * s;
    return a.fov * (2 * s3 - 3 * s2 + 1) + fovTan[i]! * (s3 - 2 * s2 + s) * dt + b.fov * (-2 * s3 + 3 * s2) + fovTan[i + 1]! * (s3 - s2) * dt;
  };
  const camera_ = (t: number, wall: number) => {
    let fov = 40;
    let bokeh = 0;
    if (t < T_SETTLE) {
      fov = rail(t);
      // mise au point : le pack, l'écran ou l'objet chromé, le dev, la carte
      if (t < T_BURST + 0.3) focus.copy(PACK_POS);
      else if (t < plan.doors) focus.copy(TELL_POS);
      else if (t < T_CARD) focus.lerpVectors(TELL_POS, deskFocus, inOut(seg(t, plan.doors, 1.2)));
      else focus.copy(slam.visible ? slam.position : card.position);
      bokeh = t < T_BURST + 0.3 ? 3.0 : t < plan.doors ? 0.5 : t < T_CARD ? 0.35 : 2.0;
    } else {
      // pose finale exacte : la carte HTML vient s'y superposer au pixel près
      camPos.copy(F_POS);
      camLook.set(F_POS.x, F_POS.y, F_POS.z - 10);
      focus.copy(card.position);
      bokeh = lerp(2.0, 0, inOut(seg(t, T_SETTLE, 0.9)));
    }
    camera.position.copy(camPos);
    // la cabine tasse au départ et à l'arrivée : un simple creux vertical, pas une secousse
    const lurch = (at: number, sign: number) => {
      const p = seg(t, at, 0.55);
      return p > 0 && p < 1 ? sign * 0.018 * Math.sin(Math.PI * p) * (1 - p * 0.4) : 0;
    };
    camera.position.y += lurch(plan.depart, -1) + lurch(plan.arrive - 0.1, 1);
    camera.lookAt(camLook);
    // une seule secousse : l'éclatement du pack (traumatisme au carré, en rotation)
    const trauma = t >= T_BURST ? Math.max(0, 0.5 * (1 - (t - T_BURST) / 0.6)) : 0;
    if (trauma > 0) {
      const s = trauma * trauma;
      const f = wall * 18 + shakeSeed;
      camera.rotateY(s * 0.025 * smoothNoise(f));
      camera.rotateX(s * 0.025 * smoothNoise(f + 13.3));
      camera.rotateZ(s * 0.015 * smoothNoise(f + 27.9));
    }
    const fv = fovFor(fov);
    if (Math.abs(camera.fov - fv) > 0.01) {
      camera.fov = fv;
      camera.updateProjectionMatrix();
    }
    if (dof) dof.bokehScale = bokeh * 2.2;
  };

  const update = (now: number, dt: number) => {
    const t = held !== null ? held : !opened ? -1 : (now - t0) / 1000;
    tNow = t;
    const wall = now / 1000;
    const dim = t >= T_SETTLE ? 1 - 0.8 * inOut(seg(t, T_SETTLE, 1.0)) : 1;

    /* la montée : l'étage est la note ; la gaine défile dans les fentes */
    const climb = ascent(t);
    const speed = ascentSpeed(t);
    const moving = t >= plan.ascent[0] && t < plan.arrive;
    const level = Math.round(climb * SCORE);
    screen.floor(level, o.double ? 2 : 1, moving);
    shaftTex.offset.y = climb * 7;
    shaftMat.opacity = speed * dim;
    shaftGap.visible = t < plan.arrive;
    cabinLight.intensity = 5 * dim;
    for (const s of wash) s.intensity = 3.5 * dim;

    /* l'afficheur : le pack, puis l'étage 00 seul (l'ascenseur s'établit),
     * puis le statut, qui change à chaque palier franchi */
    screen.uniforms.uTime.value = wall;
    if (t < T_BURST + 0.35) setWall("idle", t, () => screen.caption(o.texts.idleSubtitle, o.texts.idleTitle));
    else if (t < plan.depart) setWall("ground", t, () => screen.caption("", ""));
    else {
      const si = statusAt(Math.max(1, level));
      if (si !== lastStatus) {
        lastStatus = si;
        statusUntil = t + STATUS_HOLD;
      }
      // à l'arrivée, le statut final reste
      if (t < statusUntil || t >= plan.arrive) setWall(`status-${si}`, t, () => screen.caption(o.texts.statusLabel, o.texts.statuses[si]?.label ?? ""));
      else setWall("floor", t, () => screen.caption("", ""), false);
    }
    const glitch = t >= 0 ? 1 - seg(t, wallSwitch, 0.22) : 0;
    screen.uniforms.uGlitch.value = glitch * 0.6;
    screen.uniforms.uOn.value = dim;
    // le bouton de l'étage s'allume un peu avant le départ, puis s'éteint à l'arrivée
    btnOn.color.copy(hdr(accent.a, t >= plan.depart - 0.5 && t < plan.arrive ? 2.4 : 0.35));

    /* les portes */
    const open = t >= plan.doors ? inOut(seg(t, plan.doors, 1.0)) : 0;
    for (const d of doors) d.mesh.position.x = d.closed + d.dir * open * (DOOR_W / 2 + 0.02);
    seamMat.color.copy(hdr("#ffffff", t >= plan.arrive ? 5 * seg(t, plan.arrive + 0.1, 0.3) * (1 - seg(t, plan.doors + 0.1, 0.4)) : 0));
    seam.visible = open < 0.05;

    /* l'open space : les néons rangée par rangée, les écrans, l'allée */
    let lit = 0;
    rowMats.forEach((m, r) => {
      const at = plan.lights + r * 0.16;
      const on = t >= at ? 1 : 0;
      const pop = seg(t, at, 0.65);
      m.color.copy(hdr("#ffe1bc", (0.03 + 1.35 * pop) * dim));
      lit += on / ROWS;
    });
    officeLights.forEach((l, i) => (l.intensity = 9 * seg(t, plan.lights + i * 0.4, 0.65) * dim));
    hemi.intensity = (0.12 + 0.6 * lit) * dim;
    city.uBright.value = 0.7 * dim;
    pendantMat.color.copy(hdr(0xffdfb8, (0.05 + 1.5 * seg(t, plan.doors + 0.6, 0.8)) * dim));
    let k = 0;
    deskSpots.forEach((d) => {
      if (d.face !== 1) return;
      const on = 0.25 + 0.75 * seg(t, plan.lights + d.row * 0.16, 0.3);
      otherScreens.setColorAt(k++, tmpColor.setScalar(on * 0.35 * dim));
    });
    otherScreens.instanceColor!.needsUpdate = true;
    for (let i = 0; i < PATH_N; i++) {
      const on = seg(t, plan.doors + 0.3 + i * 0.05, 0.25) * dim;
      const c = on > 0 ? tmpColor.set(accent.a).multiplyScalar(0.8 * on) : black;
      path.setColorAt(i * 2, c);
      path.setColorAt(i * 2 + 1, c);
    }
    path.instanceColor!.needsUpdate = true;
    heroSpot.intensity = 28 * seg(t, plan.doors + 0.5, 0.8) * dim;
    windowLight.intensity = 12 * seg(t, plan.doors + 0.6, 0.8) * dim;

    /* le pack */
    if (t < T_BURST + 0.45) {
      pack.visible = true;
      const shake = t >= 0 ? seg(t, 0, T_BURST) : 0;
      const amp = shake * shake * 0.04;
      const kk = Math.floor(now / 14);
      pack.position.set(PACK_POS.x + (rnd(kk, 3) - 0.5) * amp, PACK_POS.y + Math.sin(wall * 1.3) * 0.03 + (rnd(kk, 4) - 0.5) * amp, PACK_POS.z);
      pack.rotation.set(Math.sin(wall * 0.7) * 0.06, Math.sin(wall * 0.45) * 0.3 + (rnd(kk, 5) - 0.5) * amp * 3, (rnd(kk, 6) - 0.5) * amp);
      packSeamMat.opacity = shake;
      packSeam.scale.x = 0.2 + shake * 0.8;
      packLight.intensity = lerp(2, 8, shake) + (t >= T_BURST ? 40 * (1 - seg(t, T_BURST, 0.5)) : 0);
      if (t >= T_BURST) {
        const p = seg(t, T_BURST, 0.45);
        const s = 1 + p * 0.3;
        packBody.scale.set(s, s, s);
        foilFront.opacity = foilBack.opacity = foilSide.opacity = 1 - inCubic(p);
        crimpBottom.position.y = -0.79 - p * 0.5;
        crimpTop.position.y = 0.79 + p * 3;
        crimpTop.rotation.x = p * 7;
        crimpTop.rotation.z = p * 2;
      }
    } else {
      pack.visible = false;
      packLight.intensity = 0;
    }

    /* flashs : l'éclatement du pack, la carte */
    let wo = 0;
    if (t >= T_BURST) wo = Math.max(wo, 0.7 * Math.min(seg(t, T_BURST, 0.06), 1 - seg(t, T_BURST + 0.06, 0.35)));
    if (t >= T_CARD - 0.18) wo = Math.max(wo, Math.min(seg(t, T_CARD - 0.18, 0.18), 1 - seg(t, T_CARD, 0.3)) * 0.75);
    whiteMat.opacity = wo;

    /* bouffées de particules */
    for (const b of bursts) {
      const tau = t - b.start;
      if (tau < 0 || tau > b.life) {
        b.points.visible = false;
        continue;
      }
      b.points.visible = true;
      const pos = b.points.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length / 3; i++) {
        arr[i * 3] = b.origin.x + b.vel[i * 3]! * tau;
        arr[i * 3 + 1] = b.origin.y + b.vel[i * 3 + 1]! * tau - 0.5 * b.gravity * tau * tau;
        arr[i * 3 + 2] = b.origin.z + b.vel[i * 3 + 2]! * tau;
      }
      pos.needsUpdate = true;
      b.mat.opacity = 1 - inCubic(tau / b.life);
    }
    for (const at of plan.autoFire)
      if (t >= at && !autoFired.has(at)) {
        autoFired.add(at);
        launch(t);
      }
    setCue(within(t, plan.fireworks) ? "fireworks" : null);

    /* les révélations devant les portes */
    tellKey.intensity = tells.some((tl) => within(t, tl.win)) ? 14 : 0;
    for (const tl of tells) {
      const [a, b] = tl.win;
      const tau = t - a;
      const dur = b - a;
      tl.obj.visible = tau >= 0 && tau < dur;
      if (!tl.obj.visible) continue;
      const pin = outBack(seg(tau, 0, 0.45));
      const pout = inCubic(seg(tau, dur - 0.3, 0.3));
      tl.obj.position.set(TELL_POS.x, TELL_POS.y + Math.sin(tau * 2.4) * 0.015 + pout * 0.2, lerp(0.05, TELL_POS.z, Math.min(1, pin)));
      tl.obj.scale.setScalar(Math.max(0.001, Math.min(1.1, pin) * (1 - pout)));
      tl.obj.rotation.set(0, lerp(-Math.PI * 1.5, 0, outCubic(seg(tau, 0, 0.7))) + Math.sin(tau * 1.6) * 0.25, 0);
    }

    /* le dev */
    // Le poste reste présent derrière les portes dès la première image.
    // Masquer son groupe retire aussi ses lumières : sa réapparition forçait
    // une recompilation des shaders de toute la scène juste avant l'ouverture.
    {
      const turn = inOut(seg(t, T_TURN, 0.75));
      desk.swivel.rotation.y = turn * Math.PI;
      const typing = 1 - seg(t, T_TURN - 0.15, 0.3);
      player.pose(t, typing, turn);
      desk.update(Math.max(0, t - plan.doors), seg(t, plan.doors - 0.2, 0.6) * dim);
      // de dos devant ses écrans, le dev est une silhouette ; le liseré monte quand il se tourne
      player.rim.value.copy(hdr("#b5cfdf", 0.06 + 0.1 * turn + 0.5 * seg(t, T_CARD - 0.3, 0.3)));
      player.body.value = 0.025 + 0.035 * turn;
    }

    /* la carte */
    if (t >= T_CARD) {
      card.visible = true;
      const tau = t - T_CARD;
      if (!cardReady) {
        cardMesh.front.map = backTex;
        cardMesh.front.emissiveMap = backTex;
      }
      const sc = outBack(seg(tau, 0, 0.6));
      const spin = lerp(-Math.PI * 2, 0, outCubic(seg(tau, 0, 1.4)));
      if (t < T_SETTLE) {
        card.position.copy(CARD_POS);
        card.scale.setScalar(Math.max(0.001, sc));
        card.rotation.set(0, spin, 0);
      } else {
        if (!cardTarget) cardTarget = computeCardTarget();
        const p = inOut(seg(t, T_SETTLE, 1.05));
        card.position.lerpVectors(CARD_POS, cardTarget, p);
        card.scale.setScalar(1);
        card.rotation.set(0, 0, 0);
      }
      // la carte HTML va se poser dessus : on rapproche le rendu de l'image à plat
      const flat = inOut(seg(t, T_SETTLE, 1.0));
      cardMesh.front.emissiveIntensity = lerp(0.22, 0.85, flat);
      cardMesh.front.envMapIntensity = lerp(0.55, 0.15, flat);
      key.intensity = lerp(9, 2, flat) * (1 - seg(t, T_HANDOFF, 0.4));
      cardRimL.intensity = cardRimR.intensity = 5 * (1 - flat);
      const sw = seg(tau, 1.2, 0.75);
      sheenMat.opacity = sw > 0 && sw < 1 ? 0.5 * Math.sin(Math.PI * sw) : 0;
      sheenTex.offset.set(lerp(-0.9, 0.9, sw), 0);
      glintMat.opacity = seg(tau, 0.5, 0.4) * (1 - seg(t, T_HANDOFF - 0.3, 0.3));
      glintMat.size = 0.1 + Math.abs(Math.sin(wall * 5)) * 0.1;
      if (t >= T_SLAM && t < T_SLAM + 1.3) {
        slam.visible = true;
        const ts = t - T_SLAM;
        const pin = seg(ts, 0, 0.35);
        const pout = inOut(seg(ts, 0.85, 0.45));
        card.updateMatrixWorld();
        const target = V(-0.39, 0.6, 0.05).applyMatrix4(card.matrixWorld);
        const from = V(CARD_POS.x, CARD_POS.y + 0.05, CARD_POS.z + 0.9);
        slam.position.lerpVectors(from, target, pout);
        slam.rotation.y = lerp(0.5, 0, outCubic(pin));
        slam.scale.setScalar(Math.max(0.001, lerp(outBack(pin), 0.2, pout) * (pin < 1 ? lerp(2.2, 1, outCubic(pin)) : 1)));
        slamMat.opacity = pin * (1 - seg(ts, 1.1, 0.2));
      } else slam.visible = false;
    } else card.visible = false;

    camera_(t, wall);
    bloom.intensity = lerp(0.6, 0.35, seg(t, plan.doors, 1)) + (t >= T_BURST ? 0.8 * (1 - seg(t, T_BURST, 0.5)) : 0);
    noise.blendMode.opacity.value = lerp(0.14, 0.055, seg(t, plan.doors, 1));
    void dt;

    if (t >= T_HANDOFF && !handoffSent) {
      handoffSent = true;
      o.onHandoff();
    }
    if (t >= T_END && !doneSent) {
      doneSent = true;
      setCue(null);
      o.onDone();
    }
  };

  if (import.meta.env.DEV)
    (window as unknown as { __tys3d?: unknown }).__tys3d = {
      scene,
      camera,
      bloom,
      dof,
      get t() {
        return tNow;
      },
      /** Durée moyenne d'une image (ms) sur les 60 dernières. */
      get frameMs() {
        return frameMs;
      },
      seek: (s: number) => {
        held = null;
        opened = true;
        t0 = performance.now() - s * 1000;
      },
      /** Fige la séquence à l'instant s (mise au point des plans). */
      hold: (s: number | null) => {
        held = s;
        opened = true;
      },
    };

  const loop = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    frameMs = frameMs * 0.95 + (now - last) * 0.05;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    resize();
    update(now, dt);
    composer.render(dt);
  };
  // Préparer aussi les matières hors du champ de la cabine, avant que la
  // caméra ne découvre les bureaux (notamment leurs géométries instanciées).
  void renderer.compileAsync(scene, camera).catch((error: unknown) => {
    console.warn("[walkout] précompilation indisponible, compilation au rendu", error);
  });
  raf = requestAnimationFrame(loop);

  return {
    open() {
      if (opened) return;
      opened = true;
      t0 = performance.now();
    },
    skip() {
      if (!doneSent) {
        doneSent = true;
        handoffSent = true;
        setCue(null);
        o.onDone();
      }
    },
    interact() {
      if (!within(tNow, plan.fireworks)) return false;
      launch(tNow);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        // les géométries et matières sont propres à cette scène ; les textures d'assets sont partagées
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (mat) for (const mm of Array.isArray(mat) ? mat : [mat]) mm.dispose();
      });
      for (const d of disposables) d.dispose();
      studio.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}

/** Code en veille sur les écrans de l'open space : lignes colorées, en tuile. */
function makeCodeTexture(accent: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 146;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0b0f16";
  g.fillRect(0, 0, 256, 146);
  const cols = ["#ff7b72", "#d2a8ff", "#a5d6ff", "#79c0ff", "#8b949e", accent];
  for (let line = 0; line < 13; line++) {
    let x = 10 + (rnd(line, 9) > 0.6 ? 16 : 0) + (rnd(line, 10) > 0.8 ? 16 : 0);
    const n = 1 + Math.floor(rnd(line, 11) * 4);
    for (let k = 0; k < n; k++) {
      const w = 12 + rnd(line * 7 + k, 12) * 46;
      g.fillStyle = cols[Math.floor(rnd(line * 5 + k, 13) * cols.length)]!;
      g.globalAlpha = 0.85;
      g.fillRect(x, 10 + line * 10.5, w, 5);
      x += w + 6;
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
