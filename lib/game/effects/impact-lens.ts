import { Container, Filter } from 'pixi.js';
import type { GameEvent, GameState } from '../simulation';
import { FILTER_VERTEX } from './shaders/filter-vertex';
import {
  eventSceneTime,
  pressureWave,
  type PressureWave,
} from './motion/impact-motion';

// Wave falloff and polar twist adapted with authorization from Slot's
// winShockwaveFilter / featurePortalVortexFilter. This pass refracts the game
// image; UI remains outside the canvas. One filter, three bounded contact waves.
const fragment = `
precision highp float;
in vec2 vTextureCoord;
in vec2 vFilterCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uWave0;
uniform vec4 uWave1;
uniform vec4 uWave2;
uniform vec4 uVortex;
uniform float uTime;
void main() {
  vec2 pixel = vFilterCoord * uOutputFrame.zw;
  vec2 offset = vec2(0.0);
  float light = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 wave = i == 0 ? uWave0 : (i == 1 ? uWave1 : uWave2);
    vec2 delta = pixel - wave.xy;
    float distance = length(delta);
    float width = max(9.0, wave.z * 0.075);
    float band = exp(-pow((distance - wave.z) / width, 2.0)) * wave.w;
    offset += delta / max(1.0, distance) * sin((distance - wave.z) / width * 2.0) * band * 7.0;
    light += band * 0.12;
  }
  vec2 fromCore = pixel - uVortex.xy;
  float reach = length(fromCore) / max(1.0, uVortex.z);
  float inside = max(0.0, 1.0 - reach);
  float twist = inside * inside * uVortex.w * (0.34 + sin(uTime * 4.0) * 0.08);
  float c = cos(twist), s = sin(twist);
  vec2 warped = mat2(c, -s, s, c) * fromCore;
  offset += (warped - fromCore) * smoothstep(0.05, 0.4, reach);
  vec2 uv = clamp((pixel + offset) * uInputSize.zw, uInputClamp.xy, uInputClamp.zw);
  vec4 source = texture(uTexture, uv);
  // A warm leading edge makes the pressure front visible without a white flash.
  finalColor = vec4(source.rgb + vec3(1.0, 0.73, 0.36) * light * source.a, source.a);
}
`;

/**
 * Writes up to three live waves into the filter's vec4 slots, in screen pixels,
 * clearing any slot with no wave. Returns true when at least one slot painted.
 */
function writeWaves(
  waves: PressureWave[],
  slots: Float32Array[],
  world: Container,
  time: number,
): boolean {
  let active = false;
  for (let i = 0; i < slots.length; i++) {
    const wave = waves[i] && pressureWave(waves[i], time);
    const slot = slots[i];
    slot.fill(0);
    if (!wave) continue;
    const center = world.toGlobal(wave);
    slot.set([center.x, center.y, wave.radius * world.scale.x, wave.power]);
    active = true;
  }
  return active;
}

/**
 * Signed twist in radians at `age` seconds into a displacement ability. The
 * black hole winds in for its first second then unwinds; the ghost gives a
 * single softer swirl across the whole 1.3 s window.
 */
function vortexTwist(ability: GameState['ability'], age: number): number {
  if (ability === 'blackhole') {
    return age < 1 ? Math.sin(age * Math.PI) : -(1.3 - age) * 2;
  }
  return Math.sin((age / 1.3) * Math.PI) * 0.45;
}

/**
 * Writes the ability vortex into its vec4 slot, clearing it first. Returns true
 * only while a displacement ability is inside its 1.3 s window.
 */
function writeVortex(
  core: Float32Array,
  s: GameState,
  world: Container,
): boolean {
  core.fill(0);
  const w = s.wreck;
  if (!w || w.abilityReady || !['blackhole', 'ghost'].includes(s.ability)) {
    return false;
  }
  const age = w.abilityAge ?? 10;
  if (age >= 0 && age < 1.3) {
    const center = world.toGlobal({ x: w.focusX, y: w.focusY });
    core.set([
      center.x,
      center.y,
      210 * world.scale.x,
      vortexTwist(s.ability, age),
    ]);
    return true;
  }
  return false;
}

/**
 * A full-screen refraction pass over the game canvas: up to three bounded
 * contact waves plus one ability vortex. Enabled only while something is
 * painting and the renderer still has the budget for an extra pass; the UI
 * lives outside the canvas and is never distorted.
 */
export class ImpactLens {
  readonly filter = Filter.from({
    gl: { vertex: FILTER_VERTEX, fragment },
    resolution: 'inherit',
    padding: 0,
    resources: {
      lens: {
        uWave0: { value: new Float32Array(4), type: 'vec4<f32>' },
        uWave1: { value: new Float32Array(4), type: 'vec4<f32>' },
        uWave2: { value: new Float32Array(4), type: 'vec4<f32>' },
        uVortex: { value: new Float32Array(4), type: 'vec4<f32>' },
        uTime: { value: 0, type: 'f32' },
      },
    },
  });
  private waves: PressureWave[] = [];
  constructor() {
    this.filter.enabled = false;
  }

  event(e: GameEvent, fallback: number) {
    const sound = e.sound ?? e.kind;
    if (
      !['bounce', 'land', 'explosion', 'piano', 'metalcrash', 'baler'].includes(
        sound,
      )
    )
      return;
    const born = eventSceneTime(e, fallback);
    if (
      this.waves.some(
        (w) =>
          Math.abs(w.born - born) < 0.09 &&
          Math.hypot(w.x - e.x, w.y - e.y) < 80,
      )
    )
      return;
    const big = sound === 'explosion' || sound === 'bounce';
    this.waves.push({
      born,
      x: e.x,
      y: e.y,
      life: big ? 0.78 : 0.55,
      radius: big ? 340 : 220,
      power: big ? 1 : 0.65,
    });
    if (this.waves.length > 3) this.waves.shift();
  }

  update(
    time: number,
    s: GameState,
    world: Container,
    reduced: boolean,
    density: number,
  ) {
    this.waves = this.waves.filter((w) => time < w.born + w.life);
    const u = this.filter.resources.lens.uniforms;
    const slots = [u.uWave0, u.uWave1, u.uWave2] as Float32Array[];
    const waves = writeWaves(this.waves, slots, world, time);
    const vortex = writeVortex(u.uVortex as Float32Array, s, world);
    u.uTime = time;
    // Drop the extra framebuffer pass before reducing gameplay resolution.
    this.filter.enabled = (waves || vortex) && !reduced && density > 0.99;
  }

  reset() {
    this.waves = [];
    this.filter.enabled = false;
    const u = this.filter.resources.lens.uniforms;
    for (const key of ['uWave0', 'uWave1', 'uWave2', 'uVortex'])
      (u[key] as Float32Array).fill(0);
    u.uTime = 0;
  }

  dispose() {
    this.reset();
    this.filter.destroy();
  }
}
