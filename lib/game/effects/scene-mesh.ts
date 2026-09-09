import { MeshGeometry } from 'pixi.js';

// Pixi v8 native mesh bindings, shared by locally articulated shader effects.
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
