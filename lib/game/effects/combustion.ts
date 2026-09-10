import { Container, Mesh, Shader, type Renderer } from 'pixi.js';
import { prepareMesh } from './shaders/prepare-pipelines';
import type { CarnageCue } from '../catalogue/escalation';
import { FIRE_NOISE } from './shaders/fire-noise';
import { SCENE_MESH_VERTEX, unitMeshQuad } from './shaders/scene-mesh';
import {
  COMBUSTION_CAP,
  combustionCues,
  combustionPose,
} from './motion/combustion-motion';

// Slot's upward fire turbulence, adapted to a finite irregular cartoon billow.
// One tiny local quad per ignition: no framebuffer, texture or global filter.
const FRAGMENT = `
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uAge;
uniform float uSeed;
uniform float uHeat;
uniform float uGentle;
${FIRE_NOISE}
void main() {
  float rise = 1.0 - vUV.y;
  float t = uAge * 2.3;
  vec2 p = vec2(vUV.x * 5.0 + uSeed, rise * 5.1 - t * 2.0);
  float n = fbm(p);
  float fine = fbm(p * 1.9 + vec2(t * 0.4, 1.7));
  float center = 0.5 + (n - 0.4) * rise * 0.27;
  float radius = 0.42 * pow(max(0.001, 1.0 - rise), 0.32);
  radius += sin(rise * 9.4 + n * 7.0) * 0.055;
  float edge = abs(vUV.x - center);
  float contour = 1.0 - smoothstep(radius - 0.035, radius + 0.015, edge);
  float height = 0.58 + n * 0.43;
  float crown = 1.0 - smoothstep(height - 0.13, height, rise);
  float root = smoothstep(0.0, 0.035, rise);
  float mask = contour * crown * root;
  float heat = (1.0 - rise * 0.84) * (0.54 + fine * 0.9) * uHeat;
  vec3 cool = mix(vec3(0.27, 0.12, 0.20), vec3(0.39, 0.24, 0.57), uGentle);
  vec3 warm = mix(vec3(0.94, 0.19, 0.055), vec3(0.53, 0.45, 0.99), uGentle);
  vec3 hot = mix(vec3(1.0, 0.77, 0.17), vec3(0.54, 0.98, 0.85), uGentle);
  vec3 color = mix(cool, warm, smoothstep(0.10, 0.37, heat));
  color = mix(color, hot, smoothstep(0.35, 0.71, heat));
  color = mix(color, vec3(1.0, 0.98, 0.81), smoothstep(0.65, 0.88, heat));
  // An ink edge makes the procedural surface belong to the painted storybook.
  color = mix(cool, color, smoothstep(0.04, 0.88, contour * crown));
  float alpha = mask * (0.72 + fine * 0.28);
  finalColor = vec4(color * alpha, alpha) * vColor;
}
`;

/**
 * The pool of ignition flames: exactly `COMBUSTION_CAP` meshes allocated once
 * and hidden until a cue claims one. `update` takes the scene clock in seconds
 * and the visible span in world units, and draws nothing under reduced motion
 * or below 0.55 density. `dispose` is final — a disposed pool will not prepare
 * or draw again.
 */
export class CombustionEffects {
  readonly view = new Container({ label: 'ignited-gore-shaders' });
  private geometry = unitMeshQuad(-0.5, -1);
  readonly flames = Array.from(
    { length: COMBUSTION_CAP },
    () =>
      new Mesh({
        geometry: this.geometry,
        visible: false,
        label: 'combustion-flame',
        shader: Shader.from({
          gl: { vertex: SCENE_MESH_VERTEX, fragment: FRAGMENT },
          resources: {
            combustion: {
              uAge: { value: 0, type: 'f32' },
              uSeed: { value: 0, type: 'f32' },
              uHeat: { value: 0, type: 'f32' },
              uGentle: { value: 0, type: 'f32' },
            },
          },
        }),
      }),
  );
  private disposed = false;
  private prepared = false;

  constructor() {
    this.view.addChild(...this.flames);
  }

  prepare(renderer: Renderer, force = false) {
    if (this.disposed || (this.prepared && !force)) return;
    prepareMesh(renderer, this.flames[0]);
    this.prepared = true;
  }

  update(
    cues: readonly CarnageCue[],
    time: number,
    left: number,
    right: number,
    reduced: boolean,
    gentle: boolean,
    density: number,
  ) {
    const active =
      reduced || density < 0.55
        ? []
        : combustionCues(cues, time, left, right, density);
    this.view.visible = active.length > 0;
    for (let i = 0; i < this.flames.length; i++) {
      const mesh = this.flames[i];
      const pose = active[i] && combustionPose(active[i], time);
      mesh.visible = !!pose;
      if (!pose) continue;
      mesh.label = `combustion-${pose.id}`;
      mesh.position.set(pose.x, pose.y);
      mesh.scale.set(pose.width, pose.height);
      mesh.alpha = pose.alpha;
      const u = mesh.shader!.resources.combustion.uniforms;
      u.uAge = pose.age;
      u.uSeed = pose.seed;
      u.uHeat = pose.heat;
      u.uGentle = gentle ? 1 : 0;
    }
  }
  reset() {
    this.view.visible = false;
    for (const mesh of this.flames) mesh.visible = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of this.flames) {
      mesh.shader!.destroy();
      mesh.destroy();
    }
    this.geometry.destroy();
  }
}
