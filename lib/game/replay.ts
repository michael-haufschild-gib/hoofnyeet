import type { GameEvent, GameState } from './simulation';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const turn = (a: number, b: number, t: number) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** The wreck as recorded on a frame, once it is known to be present. */
type Wreck = NonNullable<GameState['wreck']>;

/** One rigid piece of the wreck within a recorded frame. */
type WreckBody = Wreck['bodies'][number];

/**
 * Index of the first recorded frame after `at`, by binary search over the
 * frames' ascending `time`. Equals `frames.length` when `at` is at or past the
 * final frame, so callers must clamp before indexing.
 */
function frameIndexAfter(frames: readonly GameState[], at: number): number {
  let low = 0,
    high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].time <= at) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Blends one wreck piece toward its counterpart in the next frame. A piece
 * that has vanished, changed part, or teleported more than 120 world units is
 * held at its recorded pose: those jumps are cuts, not motion, and smoothing
 * them would drag a limb across the scene.
 */
function interpolateBody(
  body: WreckBody,
  to: WreckBody | undefined,
  t: number,
): WreckBody {
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
}

/**
 * Blends the wreck between two recorded frames. Optional readings — the
 * ability age and the focus velocities — are only blended when both frames
 * carry them, and the ability age is held whenever the ability became ready
 * across the pair, since that resets the clock rather than advancing it.
 */
function interpolateWreck(a: Wreck, b: Wreck, t: number): Wreck {
  const next = new Map(b.bodies.map((body) => [body.id, body]));
  return {
    ...a,
    time: mix(a.time, b.time, t),
    abilityAge:
      !a.abilityReady &&
      !b.abilityReady &&
      a.abilityAge !== undefined &&
      b.abilityAge !== undefined
        ? mix(a.abilityAge, b.abilityAge, t)
        : a.abilityAge,
    focusX: mix(a.focusX, b.focusX, t),
    focusY: mix(a.focusY, b.focusY, t),
    velocityX:
      a.velocityX !== undefined && b.velocityX !== undefined
        ? mix(a.velocityX, b.velocityX, t)
        : a.velocityX,
    velocityY:
      a.velocityY !== undefined && b.velocityY !== undefined
        ? mix(a.velocityY, b.velocityY, t)
        : a.velocityY,
    bodies: a.bodies.map((body) => interpolateBody(body, next.get(body.id), t)),
  };
}

/** Interpolate presentation only. Discrete discoveries, parts and scores stay at the last recorded beat. */
export function replayFrame(
  frames: readonly GameState[],
  at: number,
): GameState {
  if (!frames.length) throw new Error('No recorded frames');
  const low = frameIndexAfter(frames, at);
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
  if (a.wreck && b.wreck) result.wreck = interpolateWreck(a.wreck, b.wreck, t);
  return result;
}

/** Older incidents recorded wall time only. Map their visual beats onto the
 * saved simulation clock, including hit freezes, without rewriting the recording. */
export function replayEvent(
  event: GameEvent,
  frames: readonly GameState[],
): GameEvent {
  if (event.sceneTime !== undefined || !frames.length) return event;
  const frame = replayFrame(frames, event.time ?? frames[0].time);
  return { ...event, sceneTime: frame.sceneTime ?? frame.time };
}

/** Seed only still-living visual effects at a cut. Sound begins at the cut;
 * an existing puff/pressure wave keeps its original age rather than restarting. */
export function replayLeadIn(
  events: readonly GameEvent[],
  frames: readonly GameState[],
  first: number,
): GameEvent[] {
  if (!frames.length) return [];
  const frame = replayFrame(frames, first);
  const sceneTime = frame.sceneTime ?? frame.time;
  return events
    .filter((event) => event.time !== undefined && event.time < first)
    .map((event) => replayEvent(event, frames))
    .filter(
      (event) =>
        event.sceneTime! >= sceneTime - 2 && event.sceneTime! <= sceneTime,
    );
}
