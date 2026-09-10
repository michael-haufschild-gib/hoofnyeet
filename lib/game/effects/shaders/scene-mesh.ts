import { MeshGeometry } from 'pixi.js';

// Pixi v8 native mesh bindings, shared by locally articulated shader effects.
/**
 * The Pixi v8 vertex stage shared by the locally articulated shader effects.
 * It forwards `aUV` as `vUV` and the combined world and node tint as `vColor`,
 * leaving a fragment stage only to paint inside a unit square.
 */
export const SCENE_MESH_VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform vec4 uColor;
void main() {
  vec3 p = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix * vec3(aPosition, 1.0);
  gl_Position = vec4(p.xy, 0.0, 1.0);
  vUV = aUV;
  vColor = uWorldColorAlpha * uColor;
}
`;

/**
 * A one-by-one quad with its corner at (`left`, `top`) in local units and UVs
 * spanning 0..1 across it; pass -0.5 to centre an axis, 0 to root it. The
 * caller scales the node to world units and must destroy the geometry.
 */
export function unitMeshQuad(left: number, top: number) {
  return new MeshGeometry({
    positions: new Float32Array([
      left,
      top,
      left + 1,
      top,
      left + 1,
      top + 1,
      left,
      top + 1,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
}
