// L'objectif et le développement : ce que la bibliothèque `postprocessing`
// n'a pas tel quel, en effets qu'elle fusionne dans la passe existante (aucune
// passe de plus). Son ChromaticAberrationEffect décale le rouge et le bleu dans
// une seule direction pour tout l'écran ; celui d'un objectif est radial (le
// rouge et le bleu ne sont pas agrandis pareil), d'où ce petit shader. Tout
// reste sous le seuil où on le remarque comme un effet (SPEC §6.3).
import * as THREE from "three";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";

const LENS_FRAG = `
uniform sampler2D bloomMap;
uniform sampler2D dirtMap;
uniform float aberration;
uniform float dirt;
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  // Aberration chromatique latérale : le rouge est un peu plus agrandi que le
  // vert, le bleu un peu moins ; l'écart relatif vaut \`aberration\` dans les
  // coins et croît comme le carré de la distance au centre (nul au milieu).
  vec2 d = uv - 0.5;
  vec2 shift = d * dot( d, d ) * 2.0 * aberration;
  vec3 color = vec3( texture2D( inputBuffer, uv + shift ).r, inputColor.g, texture2D( inputBuffer, uv - shift ).b );
  // Saleté de l'objectif : seules les sources fortes (ce que le bloom a
  // retenu) éclairent les traces sur la lentille frontale.
  color += texture2D( bloomMap, uv ).rgb * texture2D( dirtMap, uv ).r * dirt;
  outputColor = vec4( color, inputColor.a );
}`;

/** Aberration chromatique radiale et saleté de l'objectif, en une seule lecture de plus par canal. */
export class LensEffect extends Effect {
  constructor(bloomMap: THREE.Texture, dirtMap: THREE.Texture, { aberration = 0.0015, dirt = 0.5 } = {}) {
    super("LensEffect", LENS_FRAG, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map<string, THREE.Uniform>([
        ["bloomMap", new THREE.Uniform(bloomMap)],
        ["dirtMap", new THREE.Uniform(dirtMap)],
        ["aberration", new THREE.Uniform(aberration)],
        ["dirt", new THREE.Uniform(dirt)],
      ]),
    });
  }
  get aberration(): number {
    return this.uniforms.get("aberration")!.value as number;
  }
  set aberration(v: number) {
    this.uniforms.get("aberration")!.value = v;
  }
  get dirt(): number {
    return this.uniforms.get("dirt")!.value as number;
  }
  set dirt(v: number) {
    this.uniforms.get("dirt")!.value = v;
  }
}

const WB_FRAG = `
uniform vec3 gains;
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  outputColor = vec4( inputColor.rgb * gains, inputColor.a );
}`;

/** Balance des blancs de la caméra : gains par canal sur l'image linéaire, avant le tone mapping. */
export class WhiteBalanceEffect extends Effect {
  constructor(gains: THREE.Vector3) {
    super("WhiteBalanceEffect", WB_FRAG, { blendFunction: BlendFunction.SRC, uniforms: new Map([["gains", new THREE.Uniform(gains)]]) });
  }
  get gains(): THREE.Vector3 {
    return this.uniforms.get("gains")!.value as THREE.Vector3;
  }
}

/** Blanc d'un corps noir à `kelvin` (approximation de Kang et al. 2002, puis XYZ → sRGB linéaire), luminance 1. */
export function blackbody(kelvin: number): THREE.Vector3 {
  const t = kelvin;
  const x =
    t <= 4000
      ? -0.2661239e9 / t ** 3 - 0.234358e6 / t ** 2 + 0.8776956e3 / t + 0.17991
      : -3.0258469e9 / t ** 3 + 2.1070379e6 / t ** 2 + 0.2226347e3 / t + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  const X = x / y;
  const Z = (1 - x - y) / y;
  return new THREE.Vector3(3.2406 * X - 1.5372 - 0.4986 * Z, -0.9689 * X + 1.8758 + 0.0415 * Z, 0.0557 * X - 0.204 + 1.057 * Z);
}

/**
 * Gains d'une caméra réglée à `kelvin` (adaptation de von Kries en sRGB
 * linéaire, D65 = 6504 K) : une lumière à cette température sort neutre ; à
 * luminance constante, pour ne pas changer l'exposition.
 */
export function whiteBalanceGains(kelvin: number): THREE.Vector3 {
  const w = blackbody(kelvin);
  const d65 = blackbody(6504);
  const g = new THREE.Vector3(d65.x / w.x, d65.y / w.y, d65.z / w.z);
  const lum = 0.2126 * g.x + 0.7152 * g.y + 0.0722 * g.z;
  return g.divideScalar(lum);
}

/**
 * Traces sur la lentille frontale, en niveaux de gris : quelques taches rondes
 * et floues (gouttelettes séchées, poussières) et deux traînées de doigt,
 * très pâles, plus denses vers les bords comme sur une vraie lentille.
 */
export function makeLensDirtTexture(size = 512): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = Math.round(size * 0.5625);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, c.width, c.height);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const spot = (x: number, y: number, r: number, a: number) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.65, `rgba(255,255,255,${a * 0.55})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * c.width;
    const y = rnd() * c.height;
    // plus de traces loin du centre
    const edge = Math.min(1, Math.hypot(x / c.width - 0.5, y / c.height - 0.5) * 2);
    spot(x, y, size * (0.006 + rnd() * rnd() * 0.05), (0.12 + rnd() * 0.3) * (0.35 + 0.65 * edge));
  }
  g.globalCompositeOperation = "lighter";
  for (let s = 0; s < 2; s++) {
    let x = c.width * (0.15 + rnd() * 0.7);
    let y = c.height * (0.2 + rnd() * 0.6);
    const ang = rnd() * Math.PI;
    for (let k = 0; k < 40; k++) {
      x += Math.cos(ang + Math.sin(k * 0.3) * 0.4) * size * 0.006;
      y += Math.sin(ang + Math.sin(k * 0.3) * 0.4) * size * 0.006;
      spot(x, y, size * 0.03, 0.035);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
