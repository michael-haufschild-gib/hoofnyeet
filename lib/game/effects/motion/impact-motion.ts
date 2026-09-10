import type { GameEvent } from '../../simulation';

/**
 * One debris mote's launch state, every field fixed at spawn: `born` and
 * `life` in seconds, position and velocity in world units, `gravity` in world
 * units per second squared, `angle` in radians and `spin` in radians per
 * second, `size` in world units, `grow` the size multiplier reached at the end
 * of life, and `opacity` the peak alpha (0..1) it fades from.
 */
export interface MoteMotion {
  born: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  angle: number;
  spin: number;
  life: number;
  size: number;
  grow: number;
  opacity: number;
}

/**
 * The clock an effect born from `event` should run on: a recorded frame's
 * `sceneTime`, else its `time`, else `fallback`. Reading the wrong one
 * restarts effects whenever a replay reuses `time` as a playback cursor.
 */
export function eventSceneTime(event: GameEvent, fallback = 0) {
  return event.sceneTime ?? event.time ?? fallback;
}

/** Closed-form motion: late delivery, hit freezes and render rate cannot alter it. */
export function impactMote(m: MoteMotion, time: number) {
  const age = time - m.born;
  if (time < m.born || time >= m.born + m.life) return null;
  const p = age / m.life;
  return {
    x: m.x + (m.vx * (1 - Math.exp(-age * 1.8))) / 1.8,
    y: m.y + m.vy * age + (m.gravity * age * age) / 2,
    angle: m.angle + m.spin * age,
    alpha: m.opacity * Math.sin((Math.min(1, p * 5) * Math.PI) / 2) * (1 - p),
    size: m.size * (1 - p + p * m.grow),
  };
}

/**
 * A shock ring queued by an impact: `born` and `life` in seconds, `x`/`y` in
 * world units, `radius` the world-unit reach it expands to, and `power` its
 * peak strength (0..1) before the falloff.
 */
export interface PressureWave {
  born: number;
  x: number;
  y: number;
  life: number;
  radius: number;
  power: number;
}

/**
 * The ring's state at `time`, or null before it is born and after it expires.
 * The radius eases from 8 world units out to `wave.radius` while the power
 * falls off quadratically, so the distortion weakens as the ring widens.
 */
export function pressureWave(wave: PressureWave, time: number) {
  const age = time - wave.born;
  if (time < wave.born || time >= wave.born + wave.life) return null;
  const p = age / wave.life;
  return {
    x: wave.x,
    y: wave.y,
    radius: 8 + wave.radius * (1 - (1 - p) ** 2),
    power: wave.power * (1 - p) ** 2,
  };
}
