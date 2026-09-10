import { CRASH_DURATION } from './catalogue/escalation';
import {
  CONTENT_VERSION,
  modifiers,
  type Ability,
  type Modifiers,
  type WorldId,
} from './content';
import type { CrashFrame } from './crash';
import type { PonyOutfit } from './catalogue/cosmetics';
import { newRoutine, finishRoutine, type Routine } from './routine';

/**
 * Fixed simulation timestep, in seconds. Every constant below is tuned for
 * this rate, and `createClock` only ever advances a run in whole steps of it.
 */
export const STEP = 1 / 120;
/**
 * Course geometry in world units, with the ground plane at y = 0 and y
 * negative upward: `start` is the pony's spawn x, `trampoline` the bed centre,
 * `width` the full bed span (a strike must cross within half of it) and
 * `surface` the height of the bed top. `compressionTime` is how many seconds
 * the bed spends loading and `compressionDepth` how far it sinks mid-load.
 */
export const TRACK = {
  start: 90,
  trampoline: 1120,
  width: 180,
  surface: -46,
  compressionTime: 0.48,
  compressionDepth: 28,
};
/**
 * How far the bed has sunk below `TRACK.surface`, in world units: a half sine
 * peaking at `TRACK.compressionDepth` halfway through the load. Zero in every
 * phase but `compression`, so a renderer may sample it unconditionally.
 */
export function trampolineDip(s: Pick<GameState, 'phase' | 'phaseTime'>) {
  return s.phase === 'compression'
    ? Math.sin(Math.min(1, s.phaseTime / TRACK.compressionTime) * Math.PI) *
        TRACK.compressionDepth
    : 0;
}
/**
 * Run-up and flight tuning. Speeds are world units per second, accelerations
 * world units per second squared and durations seconds; y is negative upward,
 * so `jump`, `flapLift`, `ringLift` and `jetstreamAltitude` all point up.
 * `decay` is the run-up speed bled off per second without a tap,
 * `flightLiftScale` the fraction of the computed bounce that survives as
 * launch velocity, `flipTime` one unmodified rotation and `flapCooldown` the
 * enforced gap between two flaps.
 */
export const PHYSICS = {
  minSpeed: 95,
  maxSpeed: 310,
  tapBoost: 24,
  decay: 48,
  jump: -330,
  approachGravity: 900,
  gravity: 110,
  flightLiftScale: 0.25,
  flapLift: 47.5,
  ringLift: 16.25,
  jetstreamAltitude: -320,
  jetstreamBoost: 45,
  flipTime: 0.85,
  flapCooldown: 0.4,
};
/**
 * The run's state machine. `title` and `results` are the resting states the
 * player acts from; the rest run in listing order, with `replay` an optional
 * detour back through a finished landing.
 */
export type Phase =
  | 'title'
  | 'countdown'
  | 'runup'
  | 'approach'
  | 'compression'
  | 'flight'
  | 'landing'
  | 'replay'
  | 'results';
/**
 * The two abstract controls every input device maps onto: `primary` mashes,
 * flaps and confirms, `secondary` commits the jump and opens a rotation.
 */
export type Action = 'primary' | 'secondary';
/**
 * Selects which landing set plays: its copy in `LANDINGS`, its beat timeline
 * and the carnage the renderer stages. `land` picks one; nothing else may.
 */
export type LandingId =
  | 'haystack'
  | 'mud'
  | 'accordion'
  | 'cartwheel'
  | 'fence'
  | 'sheep'
  | 'ballet'
  | 'dignified';
/**
 * Headwear ids shared by the cosmetics catalogue, the save file and the
 * renderer's texture cache. A stored hat outside this union is dropped on
 * load, so an id may be added but never quietly repurposed.
 */
export type Hat =
  | 'helmet'
  | 'party'
  | 'crown'
  | 'space'
  | 'brain'
  | 'disco'
  | 'sausage';
/**
 * Presentation copy per landing: the headline, the award banner `land`
 * announces, the results-screen description and three judge cards. Text only —
 * none of it feeds the physics or the score.
 */
export const LANDINGS: Record<
  LandingId,
  { name: string; award: string; description: string; judges: string[] }
> = {
  haystack: {
    name: 'Farm to stable.',
    award: 'THE FLAT-PACK THOROUGHBRED',
    description:
      'A walking horse parcel. Returned to the baler for extra packaging.',
    judges: ['9.2', 'CUBE', '?!'],
  },
  mud: {
    name: 'Moistly dead.',
    award: 'THE SPECIAL DELIVERY',
    description:
      'Premium rescue, express re-injury, and an invoice you cannot outrun.',
    judges: ['8.7', 'BURP', '10'],
  },
  accordion: {
    name: 'Unidentified falling object.',
    award: 'REJECTED BY RECYCLING',
    description:
      'An alien collects your skeleton, checks its quality, and returns it.',
    judges: ['8.4', 'OOF', 'RIP'],
  },
  cartwheel: {
    name: 'Bone voyage.',
    award: 'SOME ASSEMBLY REQUIRED',
    description: 'One piano for the performance. Another for the encore.',
    judges: ['10', '???', 'WHEE'],
  },
  fence: {
    name: 'Out of bodywork.',
    award: 'THE DELICATE WASH',
    description:
      'Hung out to dry. The care label specifically forbade tumble-drying.',
    judges: ['7.8', 'ART', '9.1'],
  },
  sheep: {
    name: 'The replacement has arrived.',
    award: 'EMPLOYEE OF THE MUTTON',
    description: 'A sheep gets your helmet, your job, and a standing ovation.',
    judges: ['BAA', 'YUM', 'BAA'],
  },
  ballet: {
    name: 'Pointe of impact.',
    award: 'THE PUNCHLINE PIROUETTE',
    description:
      'A crown for the prima ballerina. A boxing glove for the encore.',
    judges: ['10', 'BRAVO', 'RIP'],
  },
  dignified: {
    name: 'Famous last hooves.',
    award: 'THE TWO SECONDS OF DIGNITY',
    description:
      'The ghost was leaving peacefully. Its helmet filed an objection.',
    judges: ['10', '10', 'BONK'],
  },
};
/**
 * World positions of the three delivery rings, in the order they are met.
 * Collection is a proximity test against these points, so moving one changes
 * the route every recorded incident was flown against.
 */
export const RINGS = [
  { x: 1790, y: -235 },
  { x: 2700, y: -320 },
  { x: 3850, y: -215 },
];
/**
 * True while the pony rides the high-altitude express lane: airborne, at or
 * above `PHYSICS.jetstreamAltitude` and still climbing. Drives cosmetic cues
 * only; the momentum award itself is granted once, on entry.
 */
export function inJetstream(s: Pick<GameState, 'phase' | 'y' | 'vy'>) {
  return (
    s.phase === 'flight' && s.y <= PHYSICS.jetstreamAltitude + 0.001 && s.vy < 0
  );
}
/**
 * One gameplay beat queued for the renderer and audio to drain. `x`/`y` are
 * world units at the moment it fired. `time` and `sceneTime` are seconds and
 * are stamped only when the beat is recorded, so a live consumer falls back to
 * its own clock. `freeze` requests that many seconds of hit-stop.
 */
export interface GameEvent {
  kind:
    | 'tap'
    | 'jump'
    | 'bounce'
    | 'flap'
    | 'flip'
    | 'ring'
    | 'glide'
    | 'land'
    | 'count'
    | 'record'
    | 'crunch'
    | 'ghost'
    | 'synergy';
  id?: string;
  time?: number;
  sceneTime?: number;
  /** Visual origin of a bean-powered flap, recorded once with its physics beat. */
  propulsion?: {
    x: number;
    y: number;
    angle: number;
    vx: number;
    vy: number;
    power: number;
  };
  carnage?: import('./catalogue/escalation').CarnageCue;
  sound?: string;
  freeze?: number;
  x: number;
  y: number;
  value?: number;
}
/**
 * The whole mutable run: loadout, physics state, score and the pending event
 * queue. Every stepping function mutates this object in place rather than
 * returning a copy, and a recorded incident is a structured clone of it — so
 * the optional fields are simply absent on footage from an older build.
 */
export interface GameState {
  /** Immutable interaction receipts; absent in older recordings. */
  combinations?: import('./catalogue/combinations').CombinationCue[];
  /** Present on recorded frames; outfit changes never rewrite earlier footage. */
  outfit?: PonyOutfit;
  contentVersion?: number;
  world: WorldId;
  equipment: string[];
  ability: Ability;
  mod: Modifiers;
  reactive: boolean;
  boss: boolean;
  seed: number;
  disaster: number;
  havoc: number;
  bossHits: number;
  maxFlaps: number;
  wreck: CrashFrame | null;
  phase: Phase;
  phaseTime: number;
  time: number;
  /** Simulation time retained when a replay uses `time` for its recording cursor. */
  sceneTime?: number;
  paused: boolean;
  hitStop: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  rotation: number;
  quality: number;
  launched: boolean;
  flaps: number;
  flapCooldown: number;
  flapPose: number;
  flipActive: boolean;
  flipProgress: number;
  flips: number;
  style: number;
  /** Immutable snapshots; absent on incidents recorded before course six. */
  routine?: Routine;
  /** Furthest distance reached by the player, including the reactive crash. */
  distance: number;
  /** Initial jump only; preserved when kicks and abilities extend the total. */
  flightDistance: number;
  maxHeight: number;
  rings: number[];
  taps: number;
  landing: LandingId;
  impactRotation: number;
  impactSpeed: number;
  impactX: number;
  failed: boolean;
  failureReason: string;
  message: string;
  messageTime: number;
  events: GameEvent[];
  round: number;
  countdownBeat: number;
}
/**
 * A fresh run parked on the title screen with the default loadout and an empty
 * event queue; `round` carries the campaign counter across restarts. Allocates
 * a new object, so a caller still holding the previous state keeps it intact.
 */
export function createGame(round = 0): GameState {
  return {
    combinations: [],
    contentVersion: CONTENT_VERSION,
    world: 'farm',
    equipment: [],
    ability: 'spring',
    mod: modifiers([]),
    reactive: false,
    boss: false,
    seed: 1,
    disaster: 0,
    havoc: 0,
    bossHits: 0,
    maxFlaps: 3,
    wreck: null,
    phase: 'title',
    phaseTime: 0,
    time: 0,
    paused: false,
    hitStop: 0,
    x: TRACK.start,
    y: 0,
    vx: 0,
    vy: 0,
    speed: PHYSICS.minSpeed,
    rotation: 0,
    quality: 0,
    launched: false,
    flaps: 3,
    flapCooldown: 0,
    flapPose: 0,
    flipActive: false,
    flipProgress: 0,
    flips: 0,
    style: 0,
    routine: newRoutine(),
    distance: 0,
    flightDistance: 0,
    maxHeight: 0,
    rings: [],
    taps: 0,
    landing: 'mud',
    impactRotation: 0,
    impactSpeed: 0,
    impactX: 0,
    failed: false,
    failureReason: '',
    message: '',
    messageTime: 0,
    events: [],
    round,
    countdownBeat: 3,
  };
}
/**
 * Resets `s` in place to a fresh run one round further on and drops it into
 * the countdown. Clears `sceneTime` as well, so a state that had been playing
 * footage stops borrowing the recording's clock.
 */
export function startGame(s: GameState) {
  Object.assign(s, createGame(s.round + 1));
  delete s.sceneTime;
  s.phase = 'countdown';
}
/**
 * Moves the run to `next` and restarts the phase clock. Exported for the
 * stepping module; callers outside the simulation should drive phases through
 * `act` and `stepGame`.
 */
export function phase(s: GameState, next: Phase) {
  s.phase = next;
  s.phaseTime = 0;
}
/**
 * Queues one gameplay event for the renderer and audio to drain this frame.
 * Exported for the stepping module rather than for callers outside it.
 */
export function event(s: GameState, kind: GameEvent['kind'], value?: number) {
  s.events.push({
    kind,
    x: s.x,
    y: s.y,
    value,
    ...(kind === 'glide' ? { sound: 'wind' } : {}),
  });
}
/**
 * Posts a banner message for `duration` seconds of simulation time, which
 * `stepGame` counts down. It replaces whatever was showing rather than
 * queueing, so the most recent beat always wins.
 */
export function say(s: GameState, message: string, duration = 1.5) {
  s.message = message;
  s.messageTime = duration;
}
/**
 * The take-off window for the current run-up speed, in world units: `center`
 * is the x whose ballistic arc lands on the bed, `start` and `end` bracket it
 * by 55, and `ready`/`late` place the pony inside or past it. It slides as
 * speed changes, so it has to be recomputed rather than cached.
 */
export function jumpTarget(s: Pick<GameState, 'speed' | 'x'>) {
  const t =
    (-PHYSICS.jump +
      Math.sqrt(
        PHYSICS.jump ** 2 + 2 * PHYSICS.approachGravity * TRACK.surface,
      )) /
    PHYSICS.approachGravity;
  const center = TRACK.trampoline - s.speed * t;
  return {
    center,
    start: center - 55,
    end: center + 55,
    ready: Math.abs(s.x - center) < 55,
    late: s.x > center + 55,
  };
}
/**
 * Picks the landing set for a finished flight. The order of the tests is the
 * contract: an interrupted rotation, then a triple-flip flourish, then a clean
 * high-quality launch, then a hard impact, each pre-empting the distance-keyed
 * fallback. `distance` is metres, `impactSpeed` world units per second and
 * `quality` a 0..1 launch accuracy.
 */
export function chooseLanding(
  distance: number,
  impactSpeed: number,
  interruptedFlip: boolean,
  flips: number,
  quality: number,
): LandingId {
  if (interruptedFlip) return 'cartwheel';
  if (flips >= 3 && Math.floor(distance) % 3 === 0) return 'ballet';
  if (quality > 0.88 && flips === 0) return 'dignified';
  if (impactSpeed > 1130) return 'accordion';
  return (
    ['haystack', 'mud', 'accordion', 'fence', 'sheep', 'ballet'] as LandingId[]
  )[Math.floor(Math.max(0, distance) / 37) % 6];
}
/**
 * Ends the flight in place: settles any open routine, freezes the scoring
 * fields, chooses the landing set, enters the `landing` phase and queues both
 * the banner and a `land` event. `failed` zeroes the distance and forces the
 * accordion set, showing `reason` instead of the award.
 */
export function land(s: GameState, failed = false, reason = '') {
  if (s.routine && !s.routine.settled) {
    s.routine = finishRoutine(s.routine, {
      time: s.time,
      x: s.x,
      y: s.y,
      failed,
      interrupted: s.flipActive,
    });
    s.style += s.routine.finish;
  }
  s.distance = failed ? 0 : Math.max(0, (s.x - TRACK.trampoline) / 10);
  s.flightDistance = s.distance;
  s.impactX = s.x;
  if (s.reactive) s.disaster = (s.disaster + Math.floor(s.distance / 100)) % 4;
  s.impactRotation = s.rotation;
  s.impactSpeed = Math.hypot(s.vx, s.vy);
  s.landing = failed
    ? 'accordion'
    : chooseLanding(
        s.distance,
        s.impactSpeed,
        s.flipActive,
        s.flips,
        s.quality,
      );
  s.failed = failed;
  s.failureReason = reason;
  s.y = 0;
  phase(s, 'landing');
  say(s, failed ? reason : LANDINGS[s.landing].award, 2.5);
  event(s, 'land');
}
/** Record every physics tick, so rebounds count and moving backwards loses nothing. */
export function applyCrashFrame(s: GameState, wreck: CrashFrame) {
  if (s.phase !== 'landing' || s.paused) return;
  s.wreck = wreck;
  s.havoc = wreck.havoc;
  s.bossHits = wreck.bossHits;
  if (!s.failed && Number.isFinite(wreck.focusX))
    s.distance = Math.max(s.distance, (wreck.focusX - TRACK.trampoline) / 10);
  if (!s.failed && wreck.settled && s.phaseTime >= CRASH_DURATION)
    phase(s, 'results');
}
