// Assets de la scène 3D (web/public/3d) : la ville de nuit derrière les baies
// (Poly Haven, shanghai_bund, CC0, recadrée), le grain du béton (Poly Haven, garage_floor, CC0),
// le dev (Xbot des exemples three.js, sans ses animations : il est posé assis
// par code, meshopt) et la police Barlow Condensed 800 en typeface (SIL OFL). ~1 Mo en
// tout, préchargés pendant l'attente du scoring, une seule fois par page.
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export interface PbrSet {
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export interface WalkoutAssets {
  city: THREE.Texture;
  player: GLTF;
  font: Font;
  floor: PbrSet;
}

const BASE = "/3d/";
let pending: Promise<WalkoutAssets> | null = null;

function texture(loader: THREE.TextureLoader, file: string, color = false): Promise<THREE.Texture> {
  return loader.loadAsync(BASE + file).then((t) => {
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    return t;
  });
}

async function pbr(loader: THREE.TextureLoader, name: string): Promise<PbrSet> {
  const [normalMap, roughnessMap] = await Promise.all([texture(loader, `${name}_nor.jpg`), texture(loader, `${name}_rough.jpg`)]);
  return { normalMap, roughnessMap };
}

/** Lance (une fois) le chargement des assets ; sans risque à appeler souvent. */
export function preloadWalkoutAssets(): Promise<WalkoutAssets> {
  if (!pending) {
    const tex = new THREE.TextureLoader();
    const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    pending = Promise.all([
      texture(tex, "city.jpg", true).then((t) => {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        return t;
      }),
      gltf.loadAsync(BASE + "player.glb"),
      new FontLoader().loadAsync(BASE + "barlow-800.typeface.json"),
      pbr(tex, "garage_floor"),
    ]).then(([city, player, font, floor]) => ({ city, player, font, floor }));
    // un échec ne doit pas rester en cache : on retentera à la prochaine révélation
    pending.catch(() => {
      pending = null;
    });
  }
  return pending;
}
