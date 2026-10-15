// Personnage habillé et texturé, posé assis à partir des axes de son squelette.
// Les matériaux de peau, cheveux et vêtements sont ceux du modèle GLTF.
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";

export interface Player {
  root: THREE.Object3D;
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

export function createPlayer(gltf: GLTF): Player {
  const model = cloneSkinned(gltf.scene);
  const root = new THREE.Group();
  root.add(model);
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y;
  model.scale.multiplyScalar(1.78 / height);
  root.name = "developer";
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh) {
      m.geometry = m.geometry.clone();
      const copy = (source: THREE.Material) => {
        const material = source.clone() as THREE.MeshStandardMaterial;
        material.metalness = 0;
        material.roughness = 0.92;
        material.envMapIntensity = 0.7;
        // Conserver les plis et les textures du tissu avec une tenue sobre.
        if (/Outfit_(Top|Bottom)/.test(m.name)) {
          const bottom = /Bottom/.test(m.name);
          material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
              #include <map_fragment>
              float cloth = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
              diffuseColor.rgb = cloth * ${bottom ? "vec3(0.10, 0.16, 0.23)" : "vec3(0.19, 0.23, 0.26)"};
            `);
          };
          material.customProgramCacheKey = () => bottom ? "developer-denim" : "developer-shirt";
        }
        return material;
      };
      m.material = Array.isArray(m.material) ? m.material.map(copy) : copy(m.material);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
  });

  const bones = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.set(o.name.replace(/^mixamorig:?/, ""), o as THREE.Bone);
  });
  const hips = bones.get("Hips");
  // Le GLTF utilise un repère d'armature tourné de 90° et des centimètres.
  // Placer le bassin dans le repère métrique du personnage, pas sur un axe supposé.
  root.updateWorldMatrix(true, true);
  if (hips?.parent) hips.position.copy(hips.parent.worldToLocal(root.localToWorld(new THREE.Vector3(0, 0.56, 0))));
  const childOf: Record<string, string> = {
    Spine: "Spine1", Spine2: "Neck", Neck: "Head", Head: "HeadTop_End",
    LeftUpLeg: "LeftLeg", RightUpLeg: "RightLeg", LeftLeg: "LeftFoot", RightLeg: "RightFoot",
    LeftFoot: "LeftToeBase", RightFoot: "RightToeBase",
    LeftArm: "LeftForeArm", RightArm: "RightForeArm", LeftForeArm: "LeftHand", RightForeArm: "RightHand",
    LeftHand: "LeftHandMiddle1", RightHand: "RightHandMiddle1",
  };
  const joints = AIMS.flatMap((aim) => {
    const bone = bones.get(aim.bone);
    const child = bones.get(childOf[aim.bone]!);
    if (!bone?.parent || !child) return [];
    const bind = bone.quaternion.clone();
    return [{ aim, bone, bind, axis: child.position.clone().normalize().applyQuaternion(bind) }];
  });
  const qParent = new THREE.Quaternion();
  const qRoot = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();

  const pose = (t: number, typing: number, look: number) => {
    root.updateWorldMatrix(true, false);
    root.getWorldQuaternion(qRoot);
    for (const { aim, bone, bind, axis } of joints) {
      bone.parent!.updateWorldMatrix(true, false);
      bone.parent!.getWorldQuaternion(qParent).invert();
      v.set(...aim.to(t, typing, look)).normalize().applyQuaternion(qRoot).applyQuaternion(qParent);
      bone.quaternion.copy(q.setFromUnitVectors(axis, v)).multiply(bind);
    }
  };
  pose(0, 1, 0);

  return { root, pose };
}
