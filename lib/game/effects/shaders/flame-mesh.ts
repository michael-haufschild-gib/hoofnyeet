import { Mesh, type MeshGeometry, Shader } from 'pixi.js';
import { SCENE_MESH_VERTEX, unitMeshQuad } from './scene-mesh';
import { FIRE_NOISE } from './fire-noise';

// Three-octave fire noise and warm/hot grading adapted from the authorized
// Slot fireShaderFilter. Local mesh UVs keep the plume attached through rolls;
// unlike a filter this requires no temporary framebuffer or rotated crop.
const FRAGMENT = `
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uTime;
uniform float uSeed;
${FIRE_NOISE}
void main() {
  float x = vUV.x;
  float t = uTime * 2.4 + uSeed;
  float turbulence = fbm(vec2(x * 6.0 - t * 3.0, vUV.y * 5.0 + uSeed));
  float center = 0.5 + (turbulence - 0.4) * x * 0.38;
  float radius = (0.18 + sin(x * 3.14159) * 0.14) * pow(max(0.0, 1.0 - x), 0.65);
  radius *= 0.8 + turbulence * 0.7;
  float edge = abs(vUV.y - center);
  float body = 1.0 - smoothstep(radius * 0.56, radius, edge);
  float end = 1.0 - smoothstep(0.66 + turbulence * 0.2, 1.0, x);
  float alpha = body * end * smoothstep(0.0, 0.025, x);
  float core = (1.0 - smoothstep(0.0, radius * 0.78, edge)) * (1.0 - x);
  vec3 color = mix(vec3(0.94, 0.19, 0.08), vec3(1.0, 0.62, 0.12), body);
  color = mix(color, vec3(1.0, 0.97, 0.7), smoothstep(0.08, 0.7, core));
  color = mix(color, vec3(0.65, 0.98, 1.0), (1.0 - smoothstep(0.0, 0.2, x)) * core);
  finalColor = vec4(color * alpha, alpha) * vColor;
}
`;

/**
 * A one-unit quad rooted at the nozzle: x runs 0..1 from lip to tip and y is
 * centred on the axis, so the caller scales the node to plume length by
 * diameter in world units. Share one across every plume and destroy it once —
 * the meshes borrow it rather than owning it.
 */
export function flameGeometry() {
  return unitMeshQuad(0, -0.5);
}

/**
 * A plume over the shared `geometry`, `seed` offsetting the noise field so two
 * nozzles never flicker in step. The caller drives `uTime` in seconds and owns
 * disposal of both the shader and the borrowed geometry.
 */
export function flameMesh(geometry: MeshGeometry, seed: number) {
  const shader = Shader.from({
    gl: { vertex: SCENE_MESH_VERTEX, fragment: FRAGMENT },
    resources: {
      flame: {
        uTime: { value: 0, type: 'f32' },
        uSeed: { value: seed, type: 'f32' },
      },
    },
  });
  return new Mesh({ geometry, shader, label: 'rocket-flame-shader' });
}
