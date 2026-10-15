// Le poste du dev qui sort par les portes : plateau tournant à LED, bureau,
// chaise gaming, trois écrans (le code dans son langage, un terminal où les
// tests passent, le graphe de contributions), clavier rétroéclairé. Repère
// local : le dev est assis à l'origine et regarde vers +z ; les écrans lui font
// face. Les écrans se redessinent au fil de la frappe.
import * as THREE from "three";

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

export function createWorkstation(o: { accent: string; lang?: string; login: string; seed: number; graphLabel: string }): Workstation {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <X extends { dispose(): void }>(x: X): X => {
    disposables.push(x);
    return x;
  };
  const accent = new THREE.Color(o.accent);
  const dark = new THREE.MeshPhysicalMaterial({ color: 0x0b0e13, roughness: 0.35, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a96a6, roughness: 0.3, metalness: 1, envMapIntensity: 0.9 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.85, metalness: 0 });
  const glow = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(3), toneMapped: false });
  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // plateau tournant : disque sombre, anneau de LED
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.5, 0.12, 64), dark);
  plate.position.y = 0.06;
  plate.position.z = 0.3;
  plate.receiveShadow = true;
  group.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.012, 8, 96), glow);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.1, 0.3);
  group.add(ring);
  const Y0 = 0.12;

  // le bureau
  box(1.7, 0.04, 0.78, dark, 0, Y0 + 0.74, 0.72);
  box(0.05, 0.74, 0.7, metal, -0.8, Y0 + 0.37, 0.74);
  box(0.05, 0.74, 0.7, metal, 0.8, Y0 + 0.37, 0.74);
  box(1.56, 0.012, 0.012, glow, 0, Y0 + 0.715, 0.335); // LED sous le bord
  // clavier rétroéclairé, souris, tasse
  box(0.44, 0.022, 0.15, dark, 0.02, Y0 + 0.772, 0.5);
  const keysMat = new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(1.6), toneMapped: false, transparent: true, opacity: 0.85 });
  box(0.42, 0.004, 0.13, keysMat, 0.02, Y0 + 0.785, 0.5);
  box(0.06, 0.025, 0.1, dark, 0.34, Y0 + 0.772, 0.5);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0xe9edf2, roughness: 0.4 }));
  mug.position.set(-0.55, Y0 + 0.81, 0.55);
  group.add(mug);

  // trois écrans face au dev
  const screens: { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; kind: "code" | "term" | "graph" }[] = [];
  const screenGeo = new THREE.PlaneGeometry(0.6, 0.34);
  const addMonitor = (x: number, z: number, yaw: number, kind: "code" | "term" | "graph") => {
    const m = new THREE.Group();
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.63, 0.37, 0.025), dark);
    bezel.castShadow = true;
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 362;
    const tex = keep(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const screen = new THREE.Mesh(screenGeo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: new THREE.Color(1.6, 1.6, 1.6) }));
    screen.position.z = -0.014;
    screen.rotation.y = Math.PI; // la dalle regarde le dev (-z local)
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.24, 0.03), metal);
    stand.position.set(0, -0.26, 0.03);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.14), metal);
    foot.position.set(0, -0.375, 0.02);
    m.add(bezel, screen, stand, foot);
    m.position.set(x, Y0 + 0.76 + 0.38, z);
    m.rotation.y = yaw;
    group.add(m);
    screens.push({ canvas, tex, kind });
  };
  addMonitor(0, 1.0, 0, "code");
  addMonitor(-0.64, 0.86, 0.5, "term");
  addMonitor(0.64, 0.86, -0.5, "graph");

  // la chaise gaming, qui pivote avec le dev
  const swivel = new THREE.Group();
  group.add(swivel);
  const chair = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    swivel.add(m);
    return m;
  };
  chair(0.52, 0.08, 0.5, fabric, 0, Y0 + 0.47, -0.02);
  chair(0.5, 0.8, 0.08, fabric, 0, Y0 + 0.92, -0.3, -0.12);
  chair(0.06, 0.62, 0.012, glow, -0.17, Y0 + 0.95, -0.25, -0.12);
  chair(0.06, 0.62, 0.012, glow, 0.17, Y0 + 0.95, -0.25, -0.12);
  chair(0.06, 0.03, 0.3, dark, -0.3, Y0 + 0.66, 0.02);
  chair(0.06, 0.03, 0.3, dark, 0.3, Y0 + 0.66, 0.02);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.36, 12), metal);
  column.position.set(0, Y0 + 0.25, -0.02);
  swivel.add(column);
  for (let k = 0; k < 5; k++) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.3), metal);
    const a = (k / 5) * Math.PI * 2;
    leg.position.set(Math.sin(a) * 0.15, Y0 + 0.07, -0.02 + Math.cos(a) * 0.15);
    leg.rotation.y = a;
    swivel.add(leg);
  }

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
      keysMat.opacity = 0.35 + 0.5 * on;
      glow.color.copy(accent).multiplyScalar(0.4 + 2.6 * on);
      screenLight.intensity = 5 * on;
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
