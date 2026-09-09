import {
  Container,
  Graphics,
  Mesh,
  MeshSimple,
  Rectangle,
  Shader,
  Texture,
  type Renderer,
} from 'pixi.js';
import type { CarnageCue } from '../escalation';
import { nuclearPose } from './nuclear-motion';
import { SCENE_MESH_VERTEX, unitMeshQuad } from './scene-mesh';

const FRAGMENT = `
precision highp float;
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform float uAge;
uniform float uGentle;
void main() {
  vec2 p = vUV - 0.5;
  float r = length(p);
  float a = atan(p.y, p.x);
  float rays = pow(max(0.0, sin(a * 19.0 + uAge * 0.6)), 7.0);
  float mask = pow(max(0.0, 1.0 - r * 2.0), 2.1) * (0.6 + rays * 0.4);
  vec3 hot = mix(vec3(1.0, 0.8, 0.27), vec3(0.65, 1.0, 0.88), uGentle);
  vec3 color = mix(hot, vec3(1.0, 0.99, 0.85), 1.0 - smoothstep(0.0, 0.2, r));
  finalColor = vec4(color * mask, mask) * vColor;
}`;

/** One ability per attempt, one articulated cloud. No particle/body allocation
 * on impact and no private animation clock, including archived clip playback. */
export class NuclearEffects {
  readonly view = new Container({ label: 'nuclear-incident' });
  private rings = new Graphics({ label: 'nuclear-pressure-wave' });
  readonly foreground = new Graphics({ label: 'nuclear-rubber-duck' });
  private geometry = unitMeshQuad(-0.5, -0.5);
  private glow = new Mesh({
    geometry: this.geometry,
    label: 'nuclear-heat-rays',
    shader: Shader.from({
      gl: { vertex: SCENE_MESH_VERTEX, fragment: FRAGMENT },
      resources: {
        nuclear: {
          uAge: { value: 0, type: 'f32' },
          uGentle: { value: 0, type: 'f32' },
        },
      },
    }),
  });
  private cloud: MeshSimple;
  private columns = 9;
  private rows = 10;
  private disposed = false;
  private prepared = false;

  constructor(private art: Record<string, Texture>) {
    const vertices = new Float32Array(this.columns * this.rows * 2),
      uvs = new Float32Array(vertices.length),
      indices: number[] = [];
    for (let row = 0; row < this.rows; row++)
      for (let col = 0; col < this.columns; col++) {
        const i = row * this.columns + col;
        uvs[i * 2] = col / (this.columns - 1);
        uvs[i * 2 + 1] = row / (this.rows - 1);
        if (row < this.rows - 1 && col < this.columns - 1)
          indices.push(
            i,
            i + 1,
            i + this.columns,
            i + 1,
            i + this.columns + 1,
            i + this.columns,
          );
      }
    this.cloud = new MeshSimple({
      texture: Texture.EMPTY,
      vertices,
      uvs,
      indices: new Uint32Array(indices),
      label: 'nuclear-mushroom-cloud',
    });
    this.view.addChild(this.glow, this.rings, this.cloud);
    this.reset();
  }

  prepare(renderer: Renderer, force = false) {
    if (
      (this.prepared && !force) ||
      !this.art['nuclear-cloud'] ||
      this.disposed
    )
      return;
    // Texture uploads alone leave the custom shader and articulated mesh cold.
    // Draw their actual pipeline to a tiny temporary target before gameplay.
    // This is isolated visual sampling: no game event, audio or physics runs.
    try {
      this.update(
        [
          {
            id: 'prepare',
            kind: 'nuclear',
            at: 0,
            x: 0,
            y: 0,
            seed: 0,
            power: 1,
            world: 'farm',
          },
        ],
        0.35,
        false,
        false,
        1,
      );
      const target = renderer.generateTexture({
        target: this.view,
        frame: new Rectangle(-800, -900, 1600, 1200),
        resolution: 0.04,
      });
      target.destroy(true);
      this.prepared = true;
    } finally {
      this.reset();
    }
  }

  update(
    cues: readonly CarnageCue[],
    time: number,
    reduced: boolean,
    gentle: boolean,
    density: number,
  ) {
    const cue = cues.findLast((c) => c.kind === 'nuclear' && c.at <= time);
    const pose = cue && nuclearPose(cue, time, reduced);
    this.view.visible = !!pose;
    this.rings.clear();
    this.foreground.clear();
    this.foreground.visible = !!pose && pose.duck > 0;
    if (!pose) return;
    this.view.position.set(pose.x, pose.y);
    this.foreground.position.set(pose.x, pose.y);
    this.view.alpha = pose.alpha;
    this.glow.visible = pose.glow > 0.01 && density >= 0.55;
    this.glow.position.set(0, -130);
    this.glow.scale.set(1300, 1100);
    this.glow.alpha = pose.glow * 0.85;
    const u = this.glow.shader!.resources.nuclear.uniforms;
    u.uAge = pose.age;
    u.uGentle = gentle ? 1 : 0;
    const texture = this.art['nuclear-cloud'];
    this.cloud.visible = !!texture;
    if (texture) {
      this.cloud.texture = texture;
      this.cloud.position.set(0, pose.cloudY - pose.y);
      this.cloud.tint = gentle ? 0xbdffe8 : 0xffffff;
      this.cloud.alpha = 0.94;
      const vertices = this.cloud.vertices;
      for (let row = 0; row < this.rows; row++)
        for (let col = 0; col < this.columns; col++) {
          const x = col / (this.columns - 1),
            y = row / (this.rows - 1),
            i = (row * this.columns + col) * 2;
          const billow = reduced
            ? 0
            : Math.sin(pose.age * 2.8 + y * 9 + x * 4 + (cue!.seed % 17)) *
              0.011 *
              (1 - y);
          vertices[i] = (x - 0.5 + billow) * pose.width;
          vertices[i + 1] = (y - 1 + billow * 0.4) * pose.height;
        }
    }
    const color = gentle ? 0x91f7df : 0xffdb79;
    if (pose.shock > 0.001) {
      for (let i = 0; i < 3; i++)
        this.rings
          .ellipse(0, 8, pose.radius * (1 - i * 0.11), pose.radius * 0.16)
          .stroke({
            color: i === 1 ? 0xfff8db : color,
            width: 14 - i * 3,
            alpha: pose.shock * (1 - i * 0.18),
          });
      // Debris has an origin and a ballistic arc; it never appears at its destination.
      for (let i = 0; i < Math.ceil(12 * density); i++) {
        const a = -Math.PI + (i / 11) * Math.PI,
          t = pose.age;
        const x = Math.cos(a) * (250 + (i % 3) * 80) * t;
        const y = Math.sin(a) * 350 * t + 160 * t * t;
        this.rings
          .star(x, y, 4, 8, 3, t * 2 + i)
          .fill({ color, alpha: pose.shock });
      }
    }
    if (pose.duck > 0) {
      const g = this.foreground,
        x = 120,
        y = pose.duckY - pose.y;
      g.ellipse(x, -pose.y + 2, 28, 7).fill({
        color: 0x312831,
        alpha: 0.23,
      });
      g.ellipse(x, y, 26, 19)
        .fill(0xffd649)
        .stroke({ color: 0x452b32, width: 3 });
      g.circle(x + 16, y - 21, 15)
        .fill(0xffdf55)
        .stroke({ color: 0x452b32, width: 3 });
      g.poly([x + 26, y - 22, x + 41, y - 18, x + 28, y - 13])
        .fill(0xf07839)
        .stroke({ color: 0x452b32, width: 2 });
      g.circle(x + 21, y - 25, 3).fill(0x332536);
      g.ellipse(x - 2, y, 12, 7).fill(0xf2ad2f);
      g.poly([x - 23, y - 4, x - 32, y - 14, x - 27, y + 8])
        .fill(0xffd649)
        .stroke({ color: 0x452b32, width: 2 });
      // The sole survivor gets the helmet, two beats after the blast.
      if (pose.age > 4.1) {
        const helmetY = pose.helmetY - pose.y;
        g.ellipse(x + 15, helmetY, 20, 11)
          .fill(0x417d8a)
          .stroke({ color: 0x452b32, width: 3 });
        g.moveTo(x - 7, helmetY + 6)
          .lineTo(x + 40, helmetY + 3)
          .stroke({ color: 0x274457, width: 5 });
      }
      g.alpha = pose.duck;
    }
  }
  reset() {
    this.view.visible = false;
    this.foreground.visible = false;
    this.rings.clear();
    this.foreground.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.glow.shader!.destroy();
    this.glow.destroy();
    this.geometry.destroy();
    this.cloud.geometry.destroy();
    this.cloud.destroy();
  }
}
