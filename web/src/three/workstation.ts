// Le poste du dev : bureau en noyer, tapis et fauteuil de travail,
// trois écrans (le code dans son langage, un terminal où les
// tests passent, le graphe de contributions), clavier rétroéclairé. Repère
// local : le dev est assis à l'origine et regarde vers +z ; les écrans lui font
// face. Les écrans se redessinent au fil de la frappe.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { PbrSet } from "./assets";

export interface Workstation {
  group: THREE.Group;
  /** La chaise (et ce qui est assis dessus) pivote autour de cet objet. */
  swivel: THREE.Group;
  /** Lumière des écrans sur le dev. */
  screenLight: THREE.SpotLight;
  /** t : secondes depuis le début de la frappe ; on : 0 → 1 allumage. */
  update(t: number, on: number): void;
  dispose(): void;
}

const EDITOR_BG = "#0d1117";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Un petit programme de recrutement, dans le langage du dev. Jetons : [texte, couleur]. */
type Tok = [string, string];
const K = "#ff7b72"; // mot-clé
const F = "#d2a8ff"; // fonction
const S = "#a5d6ff"; // chaîne
const N = "#79c0ff"; // nombre, constante
const P = "#e6edf3"; // le reste
const C = "#8b949e"; // commentaire

function snippet(lang: string | undefined, login: string): Tok[][] {
  const l = (lang ?? "").toLowerCase();
  const who = JSON.stringify(login);
  if (l === "python")
    return [
      [["# scouting.py", C]],
      [["from ", K], ["azerit ", P], ["import ", K], ["scout, weigh", P]],
      [],
      [["def ", K], ["walkout", F], ["(login):", P]],
      [["    card = ", P], ["scout", F], ["(login, forks=", P], ["False", N], [")", P]],
      [["    ovr = ", P], ["weigh", F], ["(card.stats)", P]],
      [["    ", P], ["if ", K], ["ovr >= ", P], ["90", N], [":", P]],
      [["        ", P], ["return ", K], ["stage", F], ["(card, stairs=", P], ["True", N], [")", P]],
      [["    ", P], ["return ", K], ["card", P]],
      [],
      [["walkout", F], ["(", P], [who, S], [")", P]],
    ];
  if (l === "rust")
    return [
      [["// scouting.rs", C]],
      [["use ", K], ["azerit::{scout, weigh};", P]],
      [],
      [["fn ", K], ["walkout", F], ["(login: &", P], ["str", N], [") -> Card {", P]],
      [["    ", P], ["let ", K], ["card = ", P], ["scout", F], ["(login).", P], ["no_forks", F], ["();", P]],
      [["    ", P], ["let ", K], ["ovr = ", P], ["weigh", F], ["(&card.stats);", P]],
      [["    ", P], ["if ", K], ["ovr >= ", P], ["90", N], [" { ", P], ["return ", K], ["card.", P], ["walkout", F], ["(); }", P]],
      [["    card", P]],
      [["}", P]],
      [],
      [["walkout", F], ["(", P], [who, S], [");", P]],
    ];
  if (l === "go")
    return [
      [["// scouting.go", C]],
      [["func ", K], ["Walkout", F], ["(login ", P], ["string", N], [") Card {", P]],
      [["    card := azerit.", P], ["Scout", F], ["(login, azerit.NoForks)", P]],
      [["    ovr := azerit.", P], ["Weigh", F], ["(card.Stats)", P]],
      [["    ", P], ["if ", K], ["ovr >= ", P], ["90", N], [" {", P]],
      [["        ", P], ["return ", K], ["card.", P], ["OnStage", F], ["(", P], ["true", N], [")", P]],
      [["    }", P]],
      [["    ", P], ["return ", K], ["card", P]],
      [["}", P]],
      [],
      [["Walkout", F], ["(", P], [who, S], [")", P]],
    ];
  if (l === "java" || l === "kotlin" || l === "csharp" || l === "c#")
    return [
      [["// Scouting.java", C]],
      [["public ", K], ["Card ", N], ["walkout", F], ["(String login) {", P]],
      [["    ", P], ["var ", K], ["card = azerit.", P], ["scout", F], ["(login, NO_FORKS);", P]],
      [["    ", P], ["int ", N], ["ovr = azerit.", P], ["weigh", F], ["(card.stats());", P]],
      [["    ", P], ["if ", K], ["(ovr >= ", P], ["90", N], [") {", P]],
      [["        ", P], ["return ", K], ["stage.", P], ["walkout", F], ["(card);", P]],
      [["    }", P]],
      [["    ", P], ["return ", K], ["card;", P]],
      [["}", P]],
      [],
      [["walkout", F], ["(", P], [who, S], [");", P]],
    ];
  return [
    [["// scouting.ts", C]],
    [["import ", K], ["{ scout, weigh } ", P], ["from ", K], ['"azerit"', S]],
    [],
    [["export async function ", K], ["walkout", F], ["(login: ", P], ["string", N], [") {", P]],
    [["  ", P], ["const ", K], ["card = ", P], ["await ", K], ["scout", F], ["(login, { forks: ", P], ["false", N], [" })", P]],
    [["  ", P], ["const ", K], ["ovr = ", P], ["weigh", F], ["(card.stats)", P]],
    [["  ", P], ["if ", K], ["(ovr >= ", P], ["90", N], [") ", P], ["return ", K], ["stage", F], ["(card, { stairs: ", P], ["true", N], [" })", P]],
    [["  ", P], ["return ", K], ["card", P]],
    [["}", P]],
    [],
    [["await ", K], ["walkout", F], ["(", P], [who, S], [")", P]],
  ];
}

/** Les objets du poste (Sketchfab, CC BY ; tools/bake/prepare.py) : origine au sol, l'utilisateur côté -z. */
export interface DeskProps {
  monitor: GLTF;
  keyboard: GLTF;
  mug: GLTF;
  lamp: GLTF;
}

/** Une copie d'un modèle, ses matières propres (on les retouche par copie). */
function place(gltf: GLTF, x: number, y: number, z: number, ry = 0, scale = 1): THREE.Object3D {
  const o = gltf.scene.clone(true);
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = (m.material as THREE.Material).clone();
    m.castShadow = true;
    m.receiveShadow = true;
  });
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.scale.setScalar(scale);
  return o;
}

export function createWorkstation(o: { accent: string; lang?: string; login: string; seed: number; graphLabel: string; wood: PbrSet; chair: THREE.Object3D; props: DeskProps }): Workstation {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const accent = new THREE.Color(o.accent);
  const dark = new THREE.MeshStandardMaterial({ color: 0x242a30, roughness: 0.48, metalness: 0.35, envMapIntensity: 0.6 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x303a3b, roughness: 0.96 });
  const glow = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
  // plateau en noyer (Poly Haven, black_walnut_veneer_02), le fil dans la longueur
  const veneer = (t: THREE.Texture | undefined) => {
    const c = keep(t!.clone());
    c.repeat.set(1.2, 0.5);
    c.needsUpdate = true;
    return c;
  };
  const wood = new THREE.MeshStandardMaterial({
    map: veneer(o.wood.map),
    normalMap: veneer(o.wood.normalMap),
    roughnessMap: veneer(o.wood.roughnessMap),
    color: 0x9a8a7c,
    roughness: 0.7,
    normalScale: new THREE.Vector2(0.15, 0.15),
    envMapIntensity: 0.45,
  });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d, 0.06) * 0.25), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // le tapis est dans le décor précalculé (tools/bake/office.py), 2 cm d'épaisseur
  const Y0 = 0.02;

  // le bureau
  box(2.45, 0.065, 0.9, wood, 0, Y0 + 0.74, 0.75);
  for (const x of [-1.04, 1.04]) {
    box(0.055, 0.7, 0.055, dark, x, Y0 + 0.35, 0.46);
    box(0.055, 0.7, 0.055, dark, x, Y0 + 0.35, 1.04);
    box(0.065, 0.045, 0.68, dark, x, Y0 + 0.045, 0.75);
  }
  box(2.08, 0.065, 0.045, dark, 0, Y0 + 0.65, 1.04);
  box(0.88, 0.006, 0.35, fabric, 0.08, Y0 + 0.777, 0.53);
  // clavier mécanique rétroéclairé (à la couleur du tier), souris, tasse
  const TOP = Y0 + 0.7725; // le dessus du plateau
  const keyboard = place(o.props.keyboard, 0.02, TOP + 0.007, 0.5);
  const keyMats: THREE.MeshStandardMaterial[] = [];
  keyboard.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m?.emissiveMap) {
      m.emissive.copy(accent);
      keyMats.push(m);
    }
  });
  group.add(keyboard);
  box(0.06, 0.025, 0.1, dark, 0.34, Y0 + 0.797, 0.5);
  group.add(place(o.props.mug, -0.76, TOP, 0.5, 2.3));
  // Petite lampe orientée vers le plateau : contraste chaud / écrans froids.
  const lamp = place(o.props.lamp, 1.03, TOP, 0.88, 1.22);
  lamp.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && /Transparent/.test((m.material as THREE.Material).name)) m.material = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd4a0).multiplyScalar(1.8), toneMapped: false });
  });
  group.add(lamp);
  const lampLight = new THREE.PointLight(0xffd1a0, 0, 2.2, 2);
  lampLight.position.set(0.87, Y0 + 1.24, 0.78);
  group.add(lampLight);

  // trois écrans face au dev
  const screens: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; kind: "code" | "term" | "graph" }[] = [];
  // trois écrans 23 pouces identiques, celui du milieu en 32 pouces ; la dalle
  // du modèle reçoit le contenu dessiné en direct
  const addMonitor = (x: number, z: number, yaw: number, kind: "code" | "term" | "graph") => {
    const m = place(o.props.monitor, x, TOP, z, yaw, kind === "code" ? 1.35 : 1);
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 362;
    const tex = keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.flipY = false; // les uv du modèle glTF
    m.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      // coque et pied noirs ; la dalle affiche le canvas
      if (mesh.name === "screen") mesh.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.1, 1.1, 1.1) });
      else (mesh.material as THREE.MeshStandardMaterial).color.set(0x1c1e21);
    });
    group.add(m);
    screens.push({ canvas, tex, kind });
  };
  addMonitor(0, 1.0, 0, "code");
  addMonitor(-0.71, 0.88, -0.28, "term");
  addMonitor(0.71, 0.88, 0.28, "graph");

  // le fauteuil (Sketchfab, CC BY), tourné vers les écrans ; il pivote avec le dev
  const swivel = new THREE.Group();
  group.add(swivel);
  o.chair.rotation.y = Math.PI;
  o.chair.position.set(0, Y0, -0.02);
  swivel.add(o.chair);

  // la lumière des écrans sur le dev
  const screenLight = new THREE.SpotLight(0x9cc4ff, 0, 4, 0.9, 0.8, 1.5);
  screenLight.position.set(0, Y0 + 1.15, 0.9);
  screenLight.target.position.set(0, Y0 + 1.0, -0.2);
  group.add(screenLight, screenLight.target);

  /* ---------- les écrans ---------- */
  const lines = snippet(o.lang, o.login);
  const total = lines.reduce((n, l) => n + l.reduce((m, [s]) => m + s.length, 0) + 1, 0);
  const term = ["$ npm test", "", " ✓ scoring/weigh.test.ts (24)", " ✓ github/collect.test.ts (31)", " ✓ cv/read.test.ts (18)", "", " Tests  162 passed (162)", "", "$ git push origin main", " → main", "$ ▍"];
  const accentCss = `#${accent.getHexString()}`;
  let lastDraw = -1;

  const drawCode = (g: CanvasRenderingContext2D, typed: number, blink: boolean) => {
    g.fillStyle = EDITOR_BG;
    g.fillRect(0, 0, 640, 362);
    g.fillStyle = "#161b22";
    g.fillRect(0, 0, 640, 30);
    g.fillStyle = accentCss;
    g.fillRect(0, 28, 160, 2);
    g.font = `500 15px ${MONO}`;
    g.fillStyle = "#e6edf3";
    g.fillText(lines[0]?.[0]?.[0]?.replace(/^(\/\/|#) /, "") ?? "", 14, 20);
    g.font = `500 17px ${MONO}`;
    let left = typed;
    let cx = 0;
    let cy = 0;
    lines.forEach((line, i) => {
      const y = 58 + i * 27;
      g.fillStyle = "#484f58";
      g.fillText(String(i + 1).padStart(2, " "), 10, y);
      let x = 46;
      for (const [txt, col] of line) {
        if (left <= 0) break;
        const shown = txt.slice(0, left);
        left -= shown.length;
        g.fillStyle = col;
        g.fillText(shown, x, y);
        x += g.measureText(shown).width;
      }
      if (left > 0) left -= 1;
      if (left >= 0) {
        cx = x;
        cy = y;
      }
    });
    if (blink) {
      g.fillStyle = "#e6edf3";
      g.fillRect(cx + 1, cy - 15, 9, 19);
    }
  };
  const drawTerm = (g: CanvasRenderingContext2D, t: number) => {
    g.fillStyle = "#07090c";
    g.fillRect(0, 0, 640, 362);
    g.font = `500 17px ${MONO}`;
    const n = Math.min(term.length, Math.floor(t * 2.4) + 1);
    term.slice(0, n).forEach((s, i) => {
      g.fillStyle = s.startsWith(" ✓") || s.includes("passed") ? "#3fb950" : s.startsWith("$") ? "#e6edf3" : "#8b949e";
      g.fillText(s, 16, 34 + i * 28);
    });
  };
  const drawGraph = (g: CanvasRenderingContext2D, t: number) => {
    g.fillStyle = EDITOR_BG;
    g.fillRect(0, 0, 640, 362);
    g.font = `600 17px ${MONO}`;
    g.fillStyle = "#e6edf3";
    g.fillText(`@${o.login}`, 22, 40);
    g.fillStyle = "#8b949e";
    g.font = `500 14px ${MONO}`;
    g.fillText(o.graphLabel, 22, 64);
    const cols = 26;
    const shown = Math.min(cols, Math.floor(t * 14));
    for (let c = 0; c < cols; c++)
      for (let r = 0; r < 7; r++) {
        const v = Math.sin((c + 1) * 12.9898 + (r + 1) * 78.233 + o.seed) * 43758.5453;
        const lvl = c < shown ? Math.floor((v - Math.floor(v)) * 5) : 0;
        g.globalAlpha = lvl === 0 ? 1 : 0.25 + lvl * 0.19;
        g.fillStyle = lvl === 0 ? "#161b22" : accentCss;
        g.fillRect(22 + c * 23, 92 + r * 23, 19, 19);
      }
    g.globalAlpha = 1;
  };

  return {
    group,
    swivel,
    screenLight,
    update(t, on) {
      for (const m of keyMats) m.emissiveIntensity = 0.2 + 0.8 * on;
      glow.color.copy(accent).multiplyScalar(0.25 + 0.65 * on);
      screenLight.intensity = 2 * on;
      lampLight.intensity = 1.3 * on;
      // ~20 images/s suffisent pour un écran
      const frame = Math.floor(t * 20);
      if (frame === lastDraw) return;
      lastDraw = frame;
      const typed = Math.floor(Math.max(0, t) * 55);
      const blink = Math.floor(t * 2.5) % 2 === 0 || typed < total;
      for (const s of screens) {
        const g = s.canvas.getContext("2d")!;
        if (s.kind === "code") drawCode(g, Math.min(typed, total), blink);
        else if (s.kind === "term") drawTerm(g, Math.max(0, t));
        else drawGraph(g, Math.max(0, t));
        s.tex.needsUpdate = true;
      }
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
