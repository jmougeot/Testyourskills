// La carte en vrai volume : la silhouette exacte (CARD_PATH) extrudée avec un
// biseau, face avant vernie à la texture de la carte, dos sombre, tranche en
// métal à la couleur du tier. Les UV des faces sont recalculées depuis le
// contour en pixels, pour que la texture tombe pile sur la silhouette.
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { CARD_H, CARD_PATH, CARD_W } from "../../../shared/card/geometry";

export interface CardMesh {
  group: THREE.Group;
  front: THREE.MeshPhysicalMaterial;
  back: THREE.MeshPhysicalMaterial;
  edge: THREE.MeshPhysicalMaterial;
  /** Profondeur totale en unités monde (biseau compris). */
  depth: number;
}

/** Épaisseur et biseau, en pixels de carte (360 px de large). */
const DEPTH = 5;
const BEVEL_T = 1.6;
const BEVEL_S = 1.4;

let shapes: THREE.Shape[] | null = null;
function cardShapes(): THREE.Shape[] {
  if (!shapes) {
    const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_W} ${CARD_H}"><path d="${CARD_PATH}"/></svg>`);
    shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  }
  return shapes;
}

export function createCardMesh(width: number, o: { frontMap: THREE.Texture; backMap: THREE.Texture; edgeColor: THREE.ColorRepresentation; foil: boolean }): CardMesh {
  const geo = new THREE.ExtrudeGeometry(cardShapes(), {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL_T,
    bevelSize: BEVEL_S,
    bevelSegments: 3,
    curveSegments: 18,
  });
  // Faces : le groupe 0 contient le couvercle du bas (z = 0) puis celui du haut.
  const caps = geo.groups[0]!;
  const sides = geo.groups[1]!;
  const half = caps.count / 2;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) / CARD_W;
    const v = 1 - pos.getY(i) / CARD_H;
    // le couvercle du haut devient le dos : vu de derrière, on le démiroite
    const isBack = i >= caps.start + half && i < caps.start + caps.count;
    uv.setXY(i, isBack ? 1 - u : u, v);
  }
  uv.needsUpdate = true;
  geo.clearGroups();
  geo.addGroup(caps.start, half, 0); // avant
  geo.addGroup(caps.start + half, half, 1); // dos
  geo.addGroup(sides.start, sides.count, 2); // tranche
  // Pixels SVG (y vers le bas) → monde (y vers le haut). Deux axes inversés :
  // le sens des faces est conservé et le couvercle du bas regarde vers +z.
  const s = width / CARD_W;
  geo.scale(s, -s, -s);
  geo.center();

  const front = new THREE.MeshPhysicalMaterial({
    map: o.frontMap,
    emissiveMap: o.frontMap,
    emissive: 0xffffff,
    emissiveIntensity: 0.22,
    roughness: 0.3,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: o.foil ? 0.4 : 0,
    iridescenceIOR: 1.6,
    envMapIntensity: 0.55,
  });
  const back = new THREE.MeshPhysicalMaterial({
    map: o.backMap,
    roughness: 0.38,
    metalness: 0.55,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2,
  });
  const edge = new THREE.MeshPhysicalMaterial({
    color: o.edgeColor,
    metalness: 1,
    roughness: 0.22,
    clearcoat: 0.6,
    envMapIntensity: 1.6,
  });
  const mesh = new THREE.Mesh(geo, [front, back, edge]);
  mesh.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, front, back, edge, depth: (DEPTH + BEVEL_T * 2) * s };
}
