// La cabine d'ascenseur de la révélation, d'après de vraies cabines de bureaux
// (KONE, Otis) : mesures, matières et lumière. Construite une fois ; la
// séquence (walkout.ts) anime les portes, l'afficheur et la lumière de la gaine.
// Sa lumière est précalculée dans Blender (tools/bake/cabin.py) : toute cote
// ou matière changée ici se reporte dans cabin.py, puis on recalcule.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import type { PbrSet } from "./assets";
import { limitLights } from "./baked";
import { createWallScreen, type WallScreen } from "./ledWall";
import atlas from "./cabinLight.json";

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
 * Calculée dans Blender (tools/bake/cabin.py, Cycles) sur une copie de la
 * cabine aux mêmes cotes et aux mêmes matières : la lumière des six spots,
 * leurs arcs (« festons ») sur les parois, ses vrais rebonds (la pierre éclaire
 * le plafond, l'inox renvoie les spots), les ombres de contact des mains
 * courantes, des platines, de la plinthe et de la façade. Une texture pour
 * cinq surfaces : les deux parois, le fond, le sol et le plafond. */
/** Les six spots du plafond (x, z), comme `DOWNLIGHTS` dans cabin.py. */
const DOWNLIGHTS = [-0.5, 0.5].flatMap((x) => [0.5, 1.3, 2.1].map((z) => [x, z] as const));
type Surface = keyof typeof atlas.rects;
/** Exposition de la lumière précalculée : l'éclairement moyen des parois au
 * niveau de l'ancien calcul en code, qui avait été réglé à l'œil. */
const CABIN_EXPOSURE = 6;

interface BakePlane {
  /** La surface dans l'atlas. Coin (u = 0, v = 0), axes unitaires, dimensions (mètres) : comme `PLANES` dans cabin.py. */
  name: Surface;
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  w: number;
  h: number;
}
const sideWall = (sx: number): BakePlane => ({ name: sx < 0 ? "left" : "right", origin: V((sx * CAB_W) / 2, 0, 0), u: V(0, 0, 1), v: V(0, 1, 0), w: CAB_D, h: CAB_H });
const BACK: BakePlane = { name: "back", origin: V(-CAB_W / 2, 0, CAB_D), u: V(1, 0, 0), v: V(0, 1, 0), w: CAB_W, h: CAB_H };
const FLOOR: BakePlane = { name: "floor", origin: V(-CAB_W / 2, 0, 0), u: V(1, 0, 0), v: V(0, 0, 1), w: CAB_W, h: CAB_D };
const CEILING: BakePlane = { name: "ceiling", origin: V(-CAB_W / 2, CAB_H, 0), u: V(1, 0, 0), v: V(0, 0, 1), w: CAB_W, h: CAB_D };

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

/** Les coordonnées de lightmap (uv1) d'un maillage posé sur une surface précalculée : sa place dans l'atlas. */
function lightUv(mesh: THREE.Mesh, pl: BakePlane) {
  mesh.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position!;
  const uv1 = new Float32Array(pos.count * 2);
  const w = new THREE.Vector3();
  const [x0, y0, rw, rh] = atlas.rects[pl.name];
  const [W, H] = atlas.size;
  for (let i = 0; i < pos.count; i++) {
    w.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).sub(pl.origin);
    uv1[i * 2] = (x0! + (w.dot(pl.u) / pl.w) * rw!) / W!;
    uv1[i * 2 + 1] = (y0! + (w.dot(pl.v) / pl.h) * rh!) / H!;
  }
  mesh.geometry.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
}

export interface CabinOptions {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  /** Couleur du tier (filets de LED, bouton de l'étage). */
  accent: string;
  wood: PbrSet;
  /** L'atlas de lumière précalculée (tools/bake/cabin.py). */
  light: THREE.Texture;
  /** L'étage d'arrivée (la note) : numéros de la boîte à boutons. */
  floor: number;
  lang: "fr" | "en";
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
    parent.add(m);
    return m;
  };
  /** Une boîte aux arêtes adoucies : rien n'est coupé au rasoir dans une vraie cabine. */
  const rbox = (w: number, h: number, d: number, r: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = scene) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
    m.position.set(x, y, z);
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
    // le noyer huilé du poste du dev (workstation.ts) : la teinte du scan,
    // foncée par un gris neutre (L* 38, a* 7, b* 15) ; il sortait à L* 26
    color: 0xb3b3b3,
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
    parent.add(m);
    return m;
  };

  const cabin = new THREE.Group();
  scene.add(cabin);
  // la lumière des spots, précalculée : un seul atlas pour les cinq surfaces
  const lightmapped: THREE.Material[] = [];
  const baked = <M extends THREE.MeshStandardMaterial>(m: M): M => {
    m.lightMap = o.light;
    m.lightMapIntensity = atlas.scale * CABIN_EXPOSURE;
    lightmapped.push(m);
    return m;
  };
  baked(walnut);
  // sol et plafond
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(CAB_W, CAB_D), baked(stoneMat));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(0, 0, CAB_D / 2);
  cabin.add(floorMesh);
  lightUv(floorMesh, FLOOR);
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(CAB_W, CAB_D), baked(ceilMat));
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
    box(0.02, CAB_H, CAB_D, reveal, x + sx * 0.01, CAB_H / 2, CAB_D / 2, cabin);
    for (let i = 0; i < panelsZ.length - 1; i++) {
      const z0 = panelsZ[i]! + JOINT / 2;
      const z1 = panelsZ[i + 1]! - JOINT / 2;
      lightUv(panel(z1 - z0, CAB_H - KICK - 0.03, walnut, x - sx * 0.002, KICK + (CAB_H - KICK - 0.03) / 2 + 0.005, (z0 + z1) / 2, (-sx * Math.PI) / 2, cabin), wall);
    }
    // plinthe inox
    box(0.006, KICK, CAB_D, brushedSteel, x - sx * 0.003, KICK / 2, CAB_D / 2, cabin);
    // main courante sur platines
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, CAB_D - 0.7, 16), steel);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(x - sx * 0.065, 0.92, 0.45 + (CAB_D - 0.7) / 2);
    cabin.add(rail);
    for (const z of [0.45, CAB_D - 0.25]) {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), steel);
      cap.position.set(x - sx * 0.065, 0.92, z);
      cabin.add(cap);
    }
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
  lightUv(panel(CAB_W, CAB_H - KICK, walnut, 0, KICK + (CAB_H - KICK) / 2, CAB_D - 0.002, Math.PI, cabin), BACK);
  box(CAB_W, KICK, 0.006, brushedSteel, 0, KICK / 2, CAB_D - 0.003, cabin);
  // plafond : six spots ronds, très lumineux, dans un cerclage inox
  const spotGeo = new THREE.CircleGeometry(0.045, 24);
  const ringGeo = new THREE.RingGeometry(0.045, 0.062, 32);
  const downMat = new THREE.MeshBasicMaterial({ color: hdr("#fff1de", 6), toneMapped: false });
  for (const [x, z] of DOWNLIGHTS) {
    const d = new THREE.Mesh(spotGeo, downMat);
    d.rotation.x = Math.PI / 2;
    d.position.set(x, CAB_H - 0.002, z);
    const r = new THREE.Mesh(ringGeo, steel);
    r.rotation.x = Math.PI / 2;
    r.position.set(x, CAB_H - 0.003, z);
    cabin.add(d, r);
  }
  // la lumière en direct, pour l'inox seulement (les surfaces précalculées ne
  // l'évaluent pas) : la dalle du plafond, qui fait briller la façade, et les
  // deux spots de devant qui la lèchent
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
  for (const sx of [-1, 1]) rbox(sideW, CAB_H, 0.12, 0.008, brushedSteel, sx * (DOOR_W / 2 + sideW / 2), CAB_H / 2, -0.06);
  rbox(DOOR_W + 0.016, CAB_H - DOOR_H, 0.12, 0.008, brushedSteel, 0, (DOOR_H + CAB_H) / 2, -0.06);
  // le rideau de sécurité des portes : deux réglettes noires le long du passage
  for (const sx of [-1, 1]) rbox(0.016, DOOR_H - 0.04, 0.012, 0.004, glassBlack, sx * (DOOR_W / 2 - 0.004), DOOR_H / 2 + 0.01, 0.004);
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
      const m = new THREE.Mesh(new RoundedBoxGeometry(DOOR_W / 2 - 0.004, DOOR_H, 0.035, 3, 0.005), doorSteel);
      m.position.set((dir * DOOR_W) / 4, DOOR_H / 2, z);
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
  rbox(DISP.w + 0.05, DISP.h + 0.05, 0.01, 0.004, glassBlack, 0, dispY, 0.004);
  const display = new THREE.Mesh(new THREE.PlaneGeometry(DISP.w, DISP.h), screen.material);
  display.position.set(0, dispY, 0.0095);
  scene.add(display);
  // la boîte à boutons : verre noir, mini-afficheur, deux colonnes de boutons
  // inox cerclés de lumière ; l'étage d'arrivée à la couleur du tier
  const panelX = DOOR_W / 2 + sideW / 2;
  rbox(0.16, 0.98, 0.012, 0.005, glassBlack, panelX, 1.18, 0.006);
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
  // les inscriptions : numéros gravés sur les boutons, braille, pictogrammes,
  // grille de l'interphone, serrure pompiers
  const copInk = keep(makePanelTexture(o.floor));
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.98), new THREE.MeshBasicMaterial({ map: copInk, transparent: true, toneMapped: false, depthWrite: false }));
  ink.position.set(panelX, 1.18, 0.0206);
  scene.add(ink);
  // la plaque de charge, vissée sur le retour gauche
  rbox(0.15, 0.06, 0.003, 0.0012, brushedSteel, -panelX, 1.62, 0.0015);
  const plateText = keep(makePlateTexture(o.lang));
  const plateInk = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.06), new THREE.MeshBasicMaterial({ map: plateText, transparent: true, depthWrite: false }));
  plateInk.position.set(-panelX, 1.62, 0.0032);
  scene.add(plateInk);
  // le dôme de la caméra de sécurité, dans l'angle du plafond
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassBlack);
  dome.rotation.x = Math.PI;
  dome.position.set(CAB_W / 2 - 0.16, CAB_H, 0.18);
  const domeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 32), steel);
  domeRing.position.set(CAB_W / 2 - 0.16, CAB_H - 0.005, 0.18);
  scene.add(dome, domeRing);
  // les reflets de la cabine : on la photographie de l'intérieur (deux fois,
  // pour que l'inox se reflète aussi dans l'inox) et ses matières reflètent cette image
  // projetée sur la boîte de la cabine : le reflet d'une paroi tombe à sa
  // vraie place et se décale quand la caméra avance
  const probe = V(0, 1.45, 1.4);
  for (const m of cabinMats) boxProjection(m, probe, V(-CAB_W / 2, 0, -0.02), V(CAB_W / 2, CAB_H, CAB_D));
  // Parois, sol et plafond ont leur lumière précalculée et leurs reflets dans
  // la cabine photographiée : ils ne gardent en direct que les lumières
  // ponctuelles (l'éclat du pack), ni la dalle du plafond (elle doublerait la
  // lumière des spots et noierait les festons), ni les projecteurs du bureau.
  for (const m of lightmapped) limitLights(m, ["NUM_POINT_LIGHTS"], "cabin-lightmapped");
  const pmrem = new THREE.PMREMGenerator(renderer);
  let cabinEnv: THREE.Texture | null = null;
  for (let pass = 0; pass < 2; pass++) {
    const next = pmrem.fromScene(scene, 0.02, 0.02, 20, { position: probe }).texture;
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

/** Les étages de la boîte à boutons : l'arrivée en haut à droite, puis des étages en descendant jusqu'au rez-de-chaussée. */
function panelFloors(top: number): string[] {
  const out: number[] = [];
  for (let k = 0; k < 12; k++) out.push(Math.round(top - (top * k) / 11));
  // peu d'étages : les numéros se suivent, puis les sous-sols
  const seen = new Set<number>();
  let next = top;
  return out.map((n) => {
    let v = Math.min(n, next);
    while (seen.has(v)) v--;
    seen.add(v);
    next = v - 1;
    return v < 0 ? `-${-v}` : String(v);
  });
}

/** Ce qui est gravé ou imprimé sur la boîte à boutons (1 px = 1 mm ; fond transparent). */
function makePanelTexture(top: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 1960;
  const g = c.getContext("2d")!;
  g.scale(2, 2);
  const X = (lx: number) => (lx + 0.08) * 1000;
  const Y = (wy: number) => (1.67 - wy) * 1000;
  const labels = panelFloors(top);
  g.textAlign = "center";
  g.textBaseline = "middle";
  for (let r = 0; r < 7; r++)
    for (const col of [-1, 1]) {
      const cx = X(col * 0.038);
      const cy = Y(1.46 - r * 0.075);
      const i = r * 2 + (col === 1 ? 0 : 1);
      // le numéro, rétroéclairé dans le bouton
      let label = labels[i] ?? "";
      if (r === 6) label = col === -1 ? "🔔" : "◀|▶";
      g.fillStyle = "rgba(236,239,243,0.9)";
      g.font = `700 ${label.length > 2 ? 11 : 14}px 'Barlow Condensed', 'Arial Narrow', sans-serif`;
      g.fillText(label, cx, cy + 1);
      // le braille, à gauche du bouton
      g.fillStyle = "rgba(170,176,184,0.55)";
      for (let k = 0; k < 6; k++) {
        if ((k * 7 + i * 3) % 5 === 0) continue;
        g.beginPath();
        g.arc(cx - 27 + (k % 2) * 3, cy - 3 + Math.floor(k / 2) * 3, 0.9, 0, Math.PI * 2);
        g.fill();
      }
    }
  // la grille de l'interphone
  g.fillStyle = "rgba(150,156,164,0.5)";
  for (let yy = 0; yy < 7; yy++)
    for (let xx = 0; xx < 7; xx++) {
      const dx = xx - 3;
      const dy = yy - 3;
      if (dx * dx + dy * dy > 10) continue;
      g.beginPath();
      g.arc(80 + dx * 5, Y(0.86) + dy * 5, 1.3, 0, Math.PI * 2);
      g.fill();
    }
  // la serrure pompiers
  g.strokeStyle = "rgba(170,176,184,0.7)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(80, Y(0.75), 8, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(170,176,184,0.7)";
  g.fillRect(79, Y(0.75) - 5, 2, 10);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** La plaque de charge réglementaire : gravure sombre sur l'inox. */
function makePlateTexture(lang: "fr" | "en"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 600;
  c.height = 240;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(20,22,26,0.85)";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "700 74px 'Barlow Condensed', 'Arial Narrow', sans-serif";
  g.fillText(lang === "fr" ? "630 kg · 8 personnes" : "630 kg · 8 persons", 300, 92);
  g.font = "500 34px 'JetBrains Mono', ui-monospace, monospace";
  g.fillText("EN 81-20 · AZERIT LIFT", 300, 170);
  // les quatre vis
  for (const [x, y] of [[22, 22], [578, 22], [22, 218], [578, 218]] as const) {
    g.beginPath();
    g.arc(x, y, 9, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
