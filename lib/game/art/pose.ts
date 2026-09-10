import { TRACK, trampolineDip, type GameState } from '../simulation';
import type { Trick } from '../routine';

/**
 * Rig transform for one frame. `xScale`/`yScale` are multipliers around 1,
 * `bob` and `headY` are pixels, every angle is radians, and `legs` holds the
 * four leg angles in front-left, front-right, rear-left, rear-right order.
 */
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

/**
 * Timing the whole rig shares. `phase` is the gait clock in radians and
 * `stride` the signed fore/aft swing; the flags name the pose family.
 */
interface Gait {
  running: boolean;
  idle: boolean;
  air: boolean;
  phase: number;
  stride: number;
}

/**
 * One-off deformations layered over the gait, each rising from 0 to about 1:
 * trampoline squash, the launch pop, a wing flap, the flip tuck and the
 * bean-fuelled kick.
 */
interface Impulse {
  compression: number;
  launch: number;
  flap: number;
  tuck: number;
  beanKick: number;
}

/**
 * Trick shaping for the frame. `flourish` is the shared 0..1 arc of the current
 * flip; the rest gate that arc on the trick actually being performed.
 */
interface Flourish {
  flourish: number;
  spread: number;
  layback: number;
  corkscrew: number;
  spiral: number;
}

/**
 * Reads the gait clock. The run cycle is driven by distance rather than
 * wall time, so a paused or replayed run reproduces the same footfalls.
 */
function gaitOf(s: GameState, time: number): Gait {
  const running = s.phase === 'runup';
  const phase = running ? s.x / 35 : time * 2.4;
  return {
    running,
    idle: s.phase === 'title' || s.phase === 'countdown',
    air: s.phase === 'flight' || s.phase === 'approach',
    phase,
    stride: running ? Math.sin(phase) : Math.sin(phase) * 0.08,
  };
}

/** Collects the squash-and-stretch impulses that are not part of the gait. */
function impulsesOf(s: GameState): Impulse {
  return {
    compression: trampolineDip(s) / TRACK.compressionDepth,
    launch: s.phase === 'flight' ? Math.exp(-s.phaseTime * 9) : 0,
    flap:
      s.flapPose > 0
        ? (Math.sin((1 - s.flapPose / 0.45) * Math.PI * 2.3) * s.flapPose) /
          0.45
        : 0,
    tuck: s.flipActive ? Math.sin(Math.min(1, s.flipProgress) * Math.PI) : 0,
    beanKick:
      s.phase === 'flight' && s.equipment.includes('beans')
        ? Math.sin(Math.min(1, s.flapPose / 0.45) * Math.PI)
        : 0,
  };
}

/** How wide the legs fan: fully for a star, partly for the axel variants. */
function spreadOf(trick: Trick | undefined): number {
  if (trick === 'star') return 1;
  if (trick === 'axel' || trick === 'bean') return 0.65;
  return 0;
}

/** Gates the flip arc on whichever trick the routine is currently scoring. */
function flourishOf(s: GameState): Flourish {
  const flourish = s.flipActive
    ? Math.sin(Math.min(1, s.flipProgress) * Math.PI)
    : 0;
  const trick = s.routine?.active?.trick;
  return {
    flourish,
    spread: spreadOf(trick),
    layback: trick === 'layback' ? flourish : 0,
    corkscrew: trick === 'corkscrew' ? flourish : 0,
    spiral: trick === 'spiral' ? flourish : 0,
  };
}

/** Neutral leg angles for the pose family, before any impulse is added. */
function legBase(gait: Gait): number[] {
  const { air, idle, stride, phase } = gait;
  if (air) return [-0.95, -0.7, 0.9, 0.7];
  if (idle) return [-stride, stride, stride * 0.7, -stride * 0.7];
  return [
    -stride,
    stride * 0.9,
    Math.sin(phase + 0.7) * 0.85,
    -Math.sin(phase + 0.7) * 0.85,
  ];
}

/**
 * Adds every modifier to one leg. Front legs (index below 2) and rear legs
 * counter-swing, and the odd/even split gives the corkscrew its diagonal.
 */
function legAngle(base: number, i: number, im: Impulse, f: Flourish): number {
  return (
    base +
    (i < 2 ? -1 : 1) * im.flap * 0.85 +
    (i < 2 ? 1 : -1) * im.tuck * 1.2 +
    (i < 2 ? -1 : 1) * f.spread * f.flourish * 1.8 +
    (i % 2 ? 1 : -1) * f.corkscrew * 0.7 +
    (i === 3 ? 1.8 : i === 0 ? -1.1 : 0) * f.layback +
    (i < 2 ? -1.1 : 0.6) * f.spiral
  );
}

/** Vertical bounce in pixels: footfalls when running, breathing when idle. */
function bobOf(gait: Gait, time: number, compression: number): number {
  if (gait.running) return Math.cos(gait.phase * 2) * 3;
  if (gait.idle) return Math.sin(time * 2.4) * 1.8;
  return compression * 14;
}

/** Torso tilt, clamped in the air so a steep dive still reads as a pony. */
function bodyAngleOf(s: GameState, gait: Gait): number {
  if (gait.running) return gait.stride * 0.025;
  if (gait.air && !s.flipActive) {
    return Math.max(-0.22, Math.min(0.3, s.vy / 2500));
  }
  return 0;
}

/** Head tilt: an idle sway, a running counter-nod, or the impulse stack. */
function headAngleOf(
  gait: Gait,
  time: number,
  im: Impulse,
  f: Flourish,
): number {
  if (gait.idle) return Math.sin(time * 1.8) * 0.035;
  if (gait.running) return -gait.stride * 0.08;
  return (
    im.compression * 0.26 -
    im.launch * 0.18 -
    im.flap * 0.2 -
    im.beanKick * 0.22 -
    f.layback * 0.7 +
    f.spiral * 0.32
  );
}

/** Tail angle, resting below the rump and swishing on its own slow clock. */
function tailAngleOf(
  gait: Gait,
  time: number,
  im: Impulse,
  f: Flourish,
): number {
  const swish = gait.running
    ? Math.sin(gait.phase - 0.6) * 0.2
    : Math.sin(time * 4) * 0.12;
  return (
    -0.3 +
    swish -
    im.launch * 0.5 +
    im.flap * 0.2 -
    im.beanKick * 0.85 +
    f.layback * 0.7 -
    f.corkscrew * 0.5
  );
}

/**
 * The rig transform for `time` seconds of scene clock. Every field is a pure
 * function of simulation state, so pause and replay reproduce a frame exactly
 * without any additional timer.
 */
export function ponyPose(s: GameState, time: number): PonyPose {
  const gait = gaitOf(s, time);
  const im = impulsesOf(s);
  const f = flourishOf(s);
  return {
    xScale:
      1 +
      im.compression * 0.15 -
      im.launch * 0.12 +
      im.flap * 0.055 -
      im.tuck * 0.08 +
      im.beanKick * 0.09 +
      f.spread * f.flourish * 0.11 +
      f.layback * 0.09,
    yScale:
      1 -
      im.compression * 0.25 +
      im.launch * 0.24 -
      im.flap * 0.06 -
      im.tuck * 0.09 -
      im.beanKick * 0.07 -
      f.spread * f.flourish * 0.05,
    bob: bobOf(gait, time, im.compression),
    bodyAngle: bodyAngleOf(s, gait),
    headAngle: headAngleOf(gait, time, im, f),
    headY: im.compression * 8 - im.launch * 6 + im.flap * 7,
    legs: legBase(gait).map((a, i) => legAngle(a, i, im, f)),
    tailAngle: tailAngleOf(gait, time, im, f),
    wingAngle: im.flap * 0.9 + Math.sin(time * 6) * 0.08,
  };
}
