// Le dev assis à son poste : le modèle (squelette Mixamo en pose en T, regard
// vers +z) posé assis par code, os par os, puis animé en train de taper. Habillé
// en silhouette à contre-jour : corps presque noir, liseré de lumière en Fresnel
// sur les contours, intensité pilotée par la séquence.
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface Player {
  root: THREE.Object3D;
  /** Couleur (HDR) du liseré, à moduler pendant la séquence. */
  rim: { value: THREE.Color };
  /** 0 : silhouette noire, 1 : corps éclairé. */
  body: { value: number };
  material: THREE.MeshStandardMaterial;
  /** Pose assise ; typing 0 → 1 (mains sur le clavier), look 0 → 1 (tête relevée). */
  pose(t: number, typing: number, look: number): void;
}

type Dir = [number, number, number];
/** Directions visées dans le repère du personnage (x : sa gauche, y : haut, z : devant). */
interface Aim {
  bone: string;
  rest: Dir;
  to: (t: number, typing: number, look: number) => Dir;
}

const wave = (t: number, f: number, ph: number) => Math.sin(t * f + ph);

const AIMS: Aim[] = [
  { bone: "Spine", rest: [0, 1, 0], to: (t, k) => [0, 1, 0.1 + 0.08 * k + 0.02 * wave(t, 1.3, 0)] },
  { bone: "Spine2", rest: [0, 1, 0], to: (_t, k) => [0, 1, 0.1 + 0.1 * k] },
  { bone: "Neck", rest: [0, 1, 0], to: (_t, k, l) => [0, 1, 0.2 * k * (1 - l)] },
  { bone: "Head", rest: [0, 1, 0], to: (t, k, l) => [0.05 * wave(t, 0.7, 1) * k, 1, (0.12 + 0.04 * wave(t, 2.1, 0)) * k * (1 - l) - 0.05 * l] },
  { bone: "LeftUpLeg", rest: [0, -1, 0], to: () => [0.16, -0.06, 1] },
  { bone: "RightUpLeg", rest: [0, -1, 0], to: () => [-0.16, -0.06, 1] },
  { bone: "LeftLeg", rest: [0, -1, 0], to: () => [0.04, -1, 0.1] },
  { bone: "RightLeg", rest: [0, -1, 0], to: () => [-0.04, -1, 0.16] },
  { bone: "LeftFoot", rest: [0, -0.63, 0.78], to: () => [0.05, -0.3, 1] },
  { bone: "RightFoot", rest: [0, -0.63, 0.78], to: () => [-0.05, -0.3, 1] },
  // bras : coudes le long du corps, avant-bras vers le clavier ; au repos, mains sur les cuisses
  { bone: "LeftArm", rest: [1, 0, 0], to: (_t, k) => [0.3, -0.92, 0.18 + 0.12 * k] },
  { bone: "RightArm", rest: [-1, 0, 0], to: (_t, k) => [-0.3, -0.92, 0.18 + 0.12 * k] },
  { bone: "LeftForeArm", rest: [1, 0, 0], to: (t, k) => [-0.18 * k + 0.05, -0.15 + 0.06 * k * wave(t, 9, 0) - 0.5 * (1 - k), 1] },
  { bone: "RightForeArm", rest: [-1, 0, 0], to: (t, k) => [0.18 * k - 0.05, -0.15 + 0.06 * k * wave(t, 10.5, 2) - 0.5 * (1 - k), 1] },
  { bone: "LeftHand", rest: [1, 0, 0], to: (t, k) => [-0.12 * k, -0.25 + 0.12 * k * wave(t, 13, 1), 1] },
  { bone: "RightHand", rest: [-1, 0, 0], to: (t, k) => [0.12 * k, -0.25 + 0.12 * k * wave(t, 12, 3), 1] },
];

export function createPlayer(gltf: GLTF, rimColor: THREE.ColorRepresentation): Player {
  const root = cloneSkinned(gltf.scene);
  const rim = { value: new THREE.Color(rimColor) };
  const body = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color: 0x0b0f16, roughness: 0.55, metalness: 0.35, envMapIntensity: 0.4 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rim;
    shader.uniforms.uBody = body;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRim;\nuniform float uBody;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float fres = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
        totalEmissiveRadiance += uRim * (pow(fres, 3.0) * 1.4 + pow(fres, 9.0) * 3.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.46, 0.52), uBody);`,
      );
  };
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh) {
      m.material = material;
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });

  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name.replace("mixamorig", ""), o as THREE.Bone);
  });
  const hips = bones.get("Hips");
  // assis : le bassin descend à hauteur d'assise (centimètres du squelette)
  if (hips) hips.position.y = 60;
  const armature = hips?.parent ?? root;
  const qParent = new THREE.Quaternion();
  const qArm = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const rest = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const pose = (t: number, typing: number, look: number) => {
    armature.updateWorldMatrix(true, false);
    armature.getWorldQuaternion(qArm).invert();
    for (const a of AIMS) {
      const b = bones.get(a.bone);
      if (!b?.parent) continue;
      // orientation du parent dans le repère du personnage
      b.parent.updateWorldMatrix(true, false);
      b.parent.getWorldQuaternion(qParent).premultiply(qArm);
      v.set(...a.to(t, typing, look)).normalize().applyQuaternion(qParent.invert());
      rest.set(...a.rest).normalize();
      b.quaternion.copy(q.setFromUnitVectors(rest, v));
    }
  };
  pose(0, 1, 0);

  return { root, rim, body, material, pose };
}
