import type { GameState } from './simulation';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const turn = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Interpolate presentation only. Discrete discoveries, parts and scores stay at the last recorded beat. */
export function replayFrame(
  frames: readonly GameState[],
  at: number,
): GameState {
  if (!frames.length) throw new Error('No recorded frames');
  let low = 0,
    high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].time <= at) low = mid + 1;
    else high = mid;
  }
  const a = frames[Math.max(0, low - 1)],
    b = frames[low];
  if (!b || at <= a.time || a.phase !== b.phase || a.world !== b.world)
    return a;
  const t = (at - a.time) / (b.time - a.time);
  const result = {
    ...a,
    time: at,
    sceneTime: mix(a.sceneTime ?? a.time, b.sceneTime ?? b.time, t),
    x: mix(a.x, b.x, t),
    y: mix(a.y, b.y, t),
    vx: mix(a.vx, b.vx, t),
    vy: mix(a.vy, b.vy, t),
    rotation: turn(a.rotation, b.rotation, t),
    phaseTime: mix(a.phaseTime, b.phaseTime, t),
    flapPose: mix(a.flapPose, b.flapPose, t),
    flipProgress:
      a.flipActive === b.flipActive
        ? mix(a.flipProgress, b.flipProgress, t)
        : a.flipProgress,
  };
  if (a.wreck && b.wreck) {
    const next = new Map(b.wreck.bodies.map((body) => [body.id, body]));
    result.wreck = {
      ...a.wreck,
      time: mix(a.wreck.time, b.wreck.time, t),
      focusX: mix(a.wreck.focusX, b.wreck.focusX, t),
      focusY: mix(a.wreck.focusY, b.wreck.focusY, t),
      bodies: a.wreck.bodies.map((body) => {
        const to = next.get(body.id);
        if (
          !to ||
          to.part !== body.part ||
          Math.hypot(to.x - body.x, to.y - body.y) > 120
        )
          return body;
        return {
          ...body,
          x: mix(body.x, to.x, t),
          y: mix(body.y, to.y, t),
          angle: turn(body.angle, to.angle, t),
        };
      }),
    };
  }
  return result;
}
