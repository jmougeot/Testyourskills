// Albédos calibrés. Une texture de bois ou de moquette scannée ne sert
// souvent que pour son grain : sa teinte est celle d'une autre essence (le
// noyer de Poly Haven sert aussi pour le chêne) et la multiplier par une
// couleur décale la teinte (le chêne sortait orange). Ici la texture ne donne
// que sa luminance, ramenée à sa moyenne : la couleur de la matière est son
// albédo mesuré, et le grain module autour.
import * as THREE from "three";

/** Luminance linéaire moyenne des textures de couleur (mesurée sur les fichiers de public/3d). */
export const MEAN_LUMA = { walnut: 0.2255, carpet: 0.0326 } as const;

/**
 * Remplace la teinte de la texture par `albedo` (sRGB) : diffuse = albedo × mix(1, luminance / moyenne, contraste).
 * La matière doit avoir `map` ; sa `color` est ignorée.
 */
export function grainAlbedo<M extends THREE.MeshStandardMaterial>(mat: M, albedo: THREE.ColorRepresentation, meanLuma: number, contrast = 1): M {
  const uAlbedo = { value: new THREE.Color(albedo) };
  const uGrain = { value: new THREE.Vector2(1 / meanLuma, contrast) };
  const previous = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    previous.call(mat, shader, renderer);
    shader.uniforms.uAlbedo = uAlbedo;
    shader.uniforms.uGrain = uGrain;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uAlbedo;\nuniform vec2 uGrain;").replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      diffuseColor.rgb = uAlbedo * max( mix( 1.0, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) * uGrain.x, uGrain.y ), 0.0 );`,
    );
  };
  mat.color.set(0xffffff);
  mat.customProgramCacheKey = () => "grain-albedo";
  return mat;
}
