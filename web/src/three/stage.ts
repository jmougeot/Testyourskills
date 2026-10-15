// Décor de la scène : environnement « studio » pour les reflets (bandes de
// lumière comme sur un plateau photo), la ville de nuit derrière les baies du
// bureau, et sol réfléchissant (réflexion plane floutée, déformée par la normal
// map du béton poli).
import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";

/** Environnement de reflets : une pièce sombre et quelques boîtes à lumière. */
export function createStudioEnvironment(renderer: THREE.WebGLRenderer, accent: string): THREE.Texture {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), new THREE.MeshBasicMaterial({ color: 0x07090d, side: THREE.BackSide }));
  room.position.y = 3;
  env.add(room);
  const panel = (w: number, h: number, color: THREE.ColorRepresentation, k: number, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(7, 0.7, 0xffffff, 7, [0, 6.5, -1], [0, 0, -1]); // bande du plafond
  panel(0.6, 6, 0xdfe9ff, 5, [-6.5, 3, 1], [0, 2, 0]); // bande verticale gauche
  panel(0.6, 6, accent, 4, [6.5, 3, -1], [0, 2, 0]); // bande verticale droite, teinte du tier
  panel(7, 3.5, 0xffffff, 2.6, [1.5, 2.5, 6.5], [0, 1.5, 0]); // grande boîte à lumière de face (faces planes des métaux)
  panel(9, 2.5, 0x9fc3ff, 2.4, [0, 2, -6.8], [0, 2, 0]); // contre-jour (les baies)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  });
  return tex;
}

const CITY_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CITY_FRAG = `
uniform sampler2D uMap; uniform float uBright; uniform vec3 uBg; varying vec2 vUv;
void main(){
  vec2 uv = vec2(1.0 - vUv.x, vUv.y);
  vec3 c = texture2D(uMap, uv).rgb;
  // nuit plus profonde : ciel assombri, lumières de la ville gardées
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float sky = smoothstep(0.45, 0.85, uv.y);
  vec3 night = mix(vec3(luma), c, 0.85) * mix(1.0, 0.35, sky);
  night += pow(max(c - 0.55, 0.0), vec3(2.0)) * 2.5; // les néons percent
  // bords fondus dans la nuit
  float edge = max(max(smoothstep(0.86, 1.0, uv.y), 1.0 - smoothstep(0.0, 0.1, uv.y)), max(1.0 - smoothstep(0.0, 0.08, uv.x), smoothstep(0.92, 1.0, uv.x)));
  gl_FragColor = vec4(mix(night * uBright, uBg, edge), 1.0);
}`;

/**
 * La ville de nuit derrière les baies : panorama (Poly Haven, shanghai_bund,
 * CC0, recadré sur la ligne d'horizon) posé sur un morceau de cylindre centré
 * sur le bureau, de `bottom` à `bottom + hauteur` (proportions de l'image).
 */
export function createCityBackdrop(map: THREE.Texture, radius: number, arcDeg: number, bottom: number, bg: THREE.Color) {
  const arc = (arcDeg * Math.PI) / 180;
  const img = map.image as { width: number; height: number };
  const height = (radius * arc * img.height) / img.width;
  const geo = new THREE.CylinderGeometry(radius, radius, height, 96, 1, true, Math.PI - arc / 2, arc);
  geo.translate(0, bottom + height / 2, 0);
  const uBright = { value: 1 };
  const mat = new THREE.ShaderMaterial({
    vertexShader: CITY_VERT,
    fragmentShader: CITY_FRAG,
    uniforms: { uMap: { value: map }, uBright, uBg: { value: bg } },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return { mesh, uBright, height };
}

const REFL_VERT = `
uniform mat4 textureMatrix; varying vec4 vProj; varying vec2 vUv;
void main(){ vUv = uv; vProj = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const REFL_FRAG = `
uniform sampler2D tDiffuse; uniform sampler2D tNormal; uniform vec2 uRepeat; uniform float uStrength; uniform vec3 color;
varying vec4 vProj; varying vec2 vUv;
void main(){
  vec3 n = texture2D(tNormal, vUv * uRepeat).xyz * 2.0 - 1.0;
  vec2 p = vProj.xy / vProj.w + n.xy * 0.018;
  vec3 c = vec3(0.0);
  float r = 0.0045;
  c += texture2D(tDiffuse, p).rgb * 0.28;
  c += texture2D(tDiffuse, p + vec2( r, 0.0)).rgb * 0.12;
  c += texture2D(tDiffuse, p + vec2(-r, 0.0)).rgb * 0.12;
  c += texture2D(tDiffuse, p + vec2(0.0,  r * 2.0)).rgb * 0.12;
  c += texture2D(tDiffuse, p + vec2(0.0, -r * 2.0)).rgb * 0.12;
  c += texture2D(tDiffuse, p + vec2( r,  r * 3.0)).rgb * 0.06;
  c += texture2D(tDiffuse, p + vec2(-r, -r * 3.0)).rgb * 0.06;
  c += texture2D(tDiffuse, p + vec2( r, -r * 3.0)).rgb * 0.06;
  c += texture2D(tDiffuse, p + vec2(-r,  r * 3.0)).rgb * 0.06;
  gl_FragColor = vec4(c * color * uStrength, 1.0);
}`;

/** Réflexion plane du sol, ajoutée par-dessus le béton (mélange additif). */
export function createFloorReflection(width: number, length: number, normal: THREE.Texture, repeat: THREE.Vector2, size: THREE.Vector2) {
  const refl = new Reflector(new THREE.PlaneGeometry(width, length), {
    textureWidth: size.x,
    textureHeight: size.y,
    clipBias: 0.003,
    color: 0xffffff,
    shader: {
      name: "FloorReflection",
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        tNormal: { value: normal },
        uRepeat: { value: repeat },
        uStrength: { value: 0.42 },
      },
      vertexShader: REFL_VERT,
      fragmentShader: REFL_FRAG,
    },
  });
  const mat = refl.material as THREE.ShaderMaterial;
  mat.transparent = true;
  mat.blending = THREE.AdditiveBlending;
  mat.depthWrite = false;
  return { mesh: refl, strength: mat.uniforms.uStrength as { value: number } };
}
