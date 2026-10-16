// Le fauteuil de travail (Sketchfab, CC BY ; tools/bake/prepare.py) : cuir
// clair à l'origine, teinté ici en gardant son grain, ses plis et l'aluminium
// poli des accoudoirs et du piètement.
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/** La matière du fauteuil, cuir teinté de `leather` ; le métal garde sa couleur. */
export function chairMaterial(src: THREE.Material, leather: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.envMapIntensity = 0.8;
  const uLeather = { value: new THREE.Color(leather) };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLeather = uLeather;
    // le cuir prend la teinte ; la coque et le piètement (métal dans le modèle) passent en graphite satiné
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uLeather;").replace(
      "#include <metalnessmap_fragment>",
      `#include <metalnessmap_fragment>
      float chairMetal = step( 0.5, metalnessFactor );
      diffuseColor.rgb = mix( uLeather * dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ), diffuseColor.rgb * 0.42, chairMetal );
      roughnessFactor = mix( roughnessFactor, max( roughnessFactor, 0.32 ), chairMetal );`,
    );
  };
  m.customProgramCacheKey = () => "leather-chair";
  return m;
}

/** Une copie du fauteuil, prête à poser : origine au sol sous le pied, l'assis regarde vers -z. */
export function createChair(gltf: GLTF, leather: THREE.ColorRepresentation): THREE.Object3D {
  const root = gltf.scene.clone(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = chairMaterial(m.material as THREE.Material, leather);
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return root;
}
