import { TRACK, trampolineDip, type GameState } from './simulation';
export interface PonyPose {
  xScale: number;
  yScale: number;
  bob: number;
  bodyAngle: number;
  headAngle: number;
  headY: number;
  legs: number[];
  tailAngle: number;
  wingAngle: number;
}
// All poses are pure functions of simulation state; pause/replay need no extra timers.
export function ponyPose(s: GameState, time: number): PonyPose {
  const running = s.phase === 'runup',
    idle = s.phase === 'title' || s.phase === 'countdown';
  const phase = running ? s.x / 35 : time * 2.4;
  const stride = running ? Math.sin(phase) : Math.sin(phase) * 0.08;
  const compression = trampolineDip(s) / TRACK.compressionDepth;
  const launch = s.phase === 'flight' ? Math.exp(-s.phaseTime * 9) : 0;
  const flap =
    s.flapPose > 0
      ? (Math.sin((1 - s.flapPose / 0.45) * Math.PI * 2.3) * s.flapPose) / 0.45
      : 0;
  const tuck = s.flipActive
    ? Math.sin(Math.min(1, s.flipProgress) * Math.PI)
    : 0;
  const air = s.phase === 'flight' || s.phase === 'approach';
  const beanKick =
    s.phase === 'flight' && s.equipment.includes('beans')
      ? Math.sin(Math.min(1, s.flapPose / 0.45) * Math.PI)
      : 0;
  const base = air
    ? [-0.95, -0.7, 0.9, 0.7]
    : idle
      ? [-stride, stride, stride * 0.7, -stride * 0.7]
      : [
          -stride,
          stride * 0.9,
          Math.sin(phase + 0.7) * 0.85,
          -Math.sin(phase + 0.7) * 0.85,
        ];
  return {
    xScale:
      1 +
      compression * 0.15 -
      launch * 0.12 +
      flap * 0.055 -
      tuck * 0.08 +
      beanKick * 0.09,
    yScale:
      1 -
      compression * 0.25 +
      launch * 0.24 -
      flap * 0.06 -
      tuck * 0.09 -
      beanKick * 0.07,
    bob: running
      ? Math.cos(phase * 2) * 3
      : idle
        ? Math.sin(time * 2.4) * 1.8
        : compression * 14,
    bodyAngle: running
      ? stride * 0.025
      : air && !s.flipActive
        ? Math.max(-0.22, Math.min(0.3, s.vy / 2500))
        : 0,
    headAngle: idle
      ? Math.sin(time * 1.8) * 0.035
      : running
        ? -stride * 0.08
        : compression * 0.26 - launch * 0.18 - flap * 0.2 - beanKick * 0.22,
    headY: compression * 8 - launch * 6 + flap * 7,
    legs: base.map(
      (a, i) =>
        a + (i < 2 ? -1 : 1) * flap * 0.85 + (i < 2 ? 1 : -1) * tuck * 1.2,
    ),
    tailAngle:
      -0.3 +
      (running ? Math.sin(phase - 0.6) * 0.2 : Math.sin(time * 4) * 0.12) -
      launch * 0.5 +
      flap * 0.2 -
      beanKick * 0.85,
    wingAngle: flap * 0.9 + Math.sin(time * 6) * 0.08,
  };
}
