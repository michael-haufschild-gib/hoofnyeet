import type { BodyPose } from '../../crash';
import {
  type CarnageCue,
  noise,
  CRASH_DURATION,
} from '../../catalogue/escalation';
import { bossPose } from '../../catalogue/machinery';

/**
 * Seconds a boss set stays on stage after its cue fires. `bossShow` returns
 * null beyond it, and that is what retires the props.
 */
export const BOSS_SHOW_LIFE = 6;
/**
 * Seconds into a set before the machine reverses; the swap then eases in over
 * the following 0.65 s.
 */
export const BOSS_REVERSE = 2.4;
/**
 * Where each world's boss holds its victim, as fractions of the body box
 * (0..1 from its top-left corner) rather than pixels, so re-cutting the
 * artwork does not move the grip.
 */
export const BOSS_SOCKETS = {
  farm: { x: 0.27, y: 0.62 },
  candy: { x: 0.5, y: 0.56 },
  carnival: { x: 0.55, y: 0.46 },
  office: { x: 0.78, y: 0.32 },
  moon: { x: 0.5, y: 0.84 },
  afterlife: { x: 0.28, y: 0.58 },
} as const;
/**
 * Smoothstep of `n` clamped to 0..1 — the one curve every boss beat eases on,
 * so timings written as `(age - start) / span` all share a shape.
 */
export const bossEase = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};

/**
 * The world point at fraction `u`,`v` of `body`'s box (0..1 from its top-left
 * corner), rotated by the body's angle. Pins a prop to a boss that is tumbling.
 */
export function bossSocket(
  body: Pick<BodyPose, 'x' | 'y' | 'w' | 'h' | 'angle'>,
  u: number,
  v: number,
) {
  const dx = (u - 0.5) * body.w,
    dy = (v - 0.5) * body.h;
  return {
    x: body.x + Math.cos(body.angle) * dx - Math.sin(body.angle) * dy,
    y: body.y + Math.sin(body.angle) * dx + Math.cos(body.angle) * dy,
  };
}

/** Release location follows the existing kinematic boss path, offset to the
 * actual recorded contact. It never advances or touches the crash world. */
export function bossEmission(cue: CarnageCue, body: BodyPose, delay: number) {
  const initial = bossPose(cue.world, Math.min(cue.at, CRASH_DURATION), body);
  const release = bossPose(
    cue.world,
    Math.min(cue.at + delay, CRASH_DURATION),
    body,
  );
  const socket = BOSS_SOCKETS[cue.world];
  return bossSocket(
    {
      ...body,
      x: cue.x + release.x - initial.x,
      y: cue.y + release.y - initial.y,
    },
    socket.x,
    socket.y,
  );
}

/**
 * Age in seconds of the `index`-th member of a group spawned every `interval`
 * seconds, or null before that member exists. Derived from absolute time
 * alone, so scrubbing a replay backwards removes exactly the same members.
 */
export function bossBirth(time: number, index: number, interval: number) {
  const age = time - index * interval;
  return age >= 0 ? age : null;
}

/**
 * The boss set's state at `time`, or null when the cue is not a boss beat, has
 * not started, has outlived `BOSS_SHOW_LIFE`, or has no body to hang off.
 * `age` is seconds since the cue, `socket` the world grip point, `reverse`,
 * `punch` and `alpha` are 0..1 beat weights, and `variation` is -1 or 1 drawn
 * from the cue seed. Sampled from absolute time, so frame rate cannot alter it.
 */
export function bossShow(
  cue: CarnageCue,
  time: number,
  body: BodyPose | undefined,
) {
  const age = time - cue.at;
  if (cue.kind !== 'boss' || age < 0 || age >= BOSS_SHOW_LIFE || !body)
    return null;
  const socket = BOSS_SOCKETS[cue.world];
  return {
    age,
    socket: bossSocket(body, socket.x, socket.y),
    reverse: bossEase((age - BOSS_REVERSE) / 0.65),
    punch: bossEase((age - 3.8) / 0.65),
    alpha: 1 - bossEase((age - 5.6) / 0.4),
    variation: noise(cue.seed, 977) < 0.5 ? -1 : 1,
  };
}
