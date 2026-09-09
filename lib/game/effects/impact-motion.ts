import type { GameEvent } from '../simulation';

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

export interface PressureWave {
  born: number;
  x: number;
  y: number;
  life: number;
  radius: number;
  power: number;
}

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
