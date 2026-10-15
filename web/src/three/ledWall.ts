// L'afficheur de l'ascenseur, au-dessus des portes : à gauche la flèche et
// l'étage qui défile (la note), à droite le statut atteint (« STATUT ·
// PADAWAN »). Un canvas affiché par un shader qui imite la matrice de LED
// (points, parasites pendant les transitions).
import * as THREE from "three";

const PX = 512; // pixels de canvas par mètre
const DOTS = 90; // LED par mètre
const DISPLAY = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

export interface DisplaySize {
  /** Largeur et hauteur de l'afficheur (mètres). */
  w: number;
  h: number;
}

export interface WallScreen {
  readonly texture: THREE.CanvasTexture;
  readonly uniforms: {
    uOn: { value: number };
    uGlitch: { value: number };
    uTime: { value: number };
    uTint: { value: THREE.Color };
  };
  readonly material: THREE.ShaderMaterial;
  /** L'étage : numéro et flèches (une, ou deux pour un « double »). */
  floor(n: number, arrows: number, moving: boolean): void;
  /** La partie droite : un libellé et sa valeur. */
  caption(label: string, value: string): void;
  dispose(): void;
}

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = (s: DisplaySize) => `
uniform sampler2D uMap; uniform float uOn; uniform float uGlitch; uniform float uTime; uniform vec3 uTint;
varying vec2 vUv;
float h(float x){ return fract(sin(x * 91.17) * 43758.5453); }
void main(){
  vec2 uv = vUv;
  float band = floor(uv.y * 12.0 + floor(uTime * 24.0) * 7.0);
  uv.x += (h(band) - 0.5) * 0.05 * uGlitch * step(0.6, h(band + 3.0));
  vec3 c = texture2D(uMap, uv).rgb;
  vec2 cells = vUv * vec2(${(s.w * DOTS).toFixed(1)}, ${(s.h * DOTS).toFixed(1)});
  float led = smoothstep(0.55, 0.2, length(fract(cells) - 0.5));
  // quand les points deviennent plus petits qu'un pixel, on les fond (sinon moiré)
  float fw = max(length(fwidth(cells)), 1e-4);
  led = mix(led, 0.6, smoothstep(0.2, 0.55, fw));
  // sous le seuil du bloom : lisible, pas éblouissant
  vec3 lit = (vec3(0.01, 0.012, 0.02) + c * uTint * 0.95) * mix(0.45, 1.1, led);
  gl_FragColor = vec4(mix(vec3(0.01), lit, uOn), 1.0);
}`;

export function createWallScreen(accent: string, size: DisplaySize): WallScreen {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size.w * PX);
  canvas.height = Math.round(size.h * PX);
  const g = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const uniforms = {
    uOn: { value: 0 },
    uGlitch: { value: 0 },
    uTime: { value: 0 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag(size), uniforms: { ...uniforms, uMap: { value: texture } }, fog: false });
  const W = canvas.width;
  const H = canvas.height;
  const SPLIT = W * 0.36;

  let floorN = 0;
  let floorArrows = 1;
  let floorMoving = false;
  let label = "";
  let value = "";

  const text = (s: string, x: number, y: number, px: number, o: { font?: string; weight?: number; color?: string; spacing?: number; glow?: string; maxWidth?: number } = {}) => {
    g.font = `${o.weight ?? 800} ${px}px ${o.font ?? DISPLAY}`;
    if ("letterSpacing" in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    let scale = 1;
    if (o.maxWidth) {
      const w = g.measureText(s).width;
      if (w > o.maxWidth) scale = o.maxWidth / w;
    }
    g.save();
    g.translate(x, y);
    g.scale(scale, 1);
    if (o.glow) {
      g.shadowColor = o.glow;
      g.shadowBlur = px * 0.3;
    }
    g.fillStyle = o.color ?? "#ffffff";
    g.fillText(s, 0, 0);
    g.restore();
  };
  const draw = () => {
    g.fillStyle = "#03050a";
    g.fillRect(0, 0, W, H);
    // l'étage
    const arrows = floorMoving ? "▲".repeat(floorArrows) : "";
    text(arrows, SPLIT * 0.24, H / 2, H * 0.34, { font: MONO, color: accent, glow: accent, spacing: 4 });
    text(String(floorN).padStart(2, "0"), SPLIT * 0.66, H / 2 + 3, H * 0.78, { color: "#ffffff", spacing: 4 });
    g.fillStyle = accent;
    g.globalAlpha = 0.6;
    g.fillRect(SPLIT, H * 0.18, 3, H * 0.64);
    g.globalAlpha = 1;
    // la révélation en cours
    if (label) text(label.toUpperCase(), SPLIT + (W - SPLIT) / 2, H * 0.27, H * 0.17, { font: MONO, weight: 700, color: accent, spacing: 8 });
    if (value) text(value.toUpperCase(), SPLIT + (W - SPLIT) / 2, H * (label ? 0.64 : 0.5), H * 0.44, { spacing: 3, maxWidth: (W - SPLIT) * 0.9 });
    texture.needsUpdate = true;
  };
  draw();

  return {
    texture,
    uniforms,
    material,
    floor(n, arrows, moving) {
      if (n === floorN && arrows === floorArrows && moving === floorMoving) return;
      floorN = n;
      floorArrows = arrows;
      floorMoving = moving;
      draw();
    },
    caption(l, v) {
      label = l;
      value = v;
      draw();
    },
    dispose() {
      texture.dispose();
    },
  };
}
