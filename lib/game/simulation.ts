import { landingTimeline, replayDuration } from './landing-timeline';
import {
  CONTENT_VERSION,
  modifiers,
  type Ability,
  type Modifiers,
  type WorldId,
} from './content';
import type { CrashFrame } from './crash';
export const STEP = 1 / 120;
export const TRACK = {
  start: 90,
  trampoline: 1120,
  width: 180,
  surface: -46,
  compressionTime: 0.48,
  compressionDepth: 28,
};
export function trampolineDip(s: Pick<GameState, 'phase' | 'phaseTime'>) {
  return s.phase === 'compression'
    ? Math.sin(Math.min(1, s.phaseTime / TRACK.compressionTime) * Math.PI) *
        TRACK.compressionDepth
    : 0;
}
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
export type Action = 'primary' | 'secondary';
export type LandingId =
  | 'haystack'
  | 'mud'
  | 'accordion'
  | 'cartwheel'
  | 'fence'
  | 'sheep'
  | 'ballet'
  | 'dignified';
export type Hat = 'helmet' | 'party' | 'crown' | 'space';
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
export const RINGS = [
  { x: 1790, y: -235 },
  { x: 2700, y: -320 },
  { x: 3850, y: -215 },
];
export function inJetstream(s: Pick<GameState, 'phase' | 'y' | 'vy'>) {
  return (
    s.phase === 'flight' && s.y <= PHYSICS.jetstreamAltitude + 0.001 && s.vy < 0
  );
}
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
    | 'ghost';
  id?: string;
  time?: number;
  sound?: string;
  freeze?: number;
  x: number;
  y: number;
  value?: number;
}
export interface GameState {
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
export function createGame(round = 0): GameState {
  return {
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
export function startGame(s: GameState) {
  Object.assign(s, createGame(s.round + 1));
  delete s.sceneTime;
  s.phase = 'countdown';
}
function phase(s: GameState, next: Phase) {
  s.phase = next;
  s.phaseTime = 0;
}
function event(s: GameState, kind: GameEvent['kind'], value?: number) {
  s.events.push({
    kind,
    x: s.x,
    y: s.y,
    value,
    ...(kind === 'glide' ? { sound: 'wind' } : {}),
  });
}
export function say(s: GameState, message: string, duration = 1.5) {
  s.message = message;
  s.messageTime = duration;
}
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
export function act(s: GameState, action: Action, repeated = false) {
  if (s.paused || repeated) return;
  if (s.phase === 'title' || s.phase === 'results') {
    if (action === 'primary') startGame(s);
    return;
  }
  if (s.phase === 'runup') {
    if (action === 'primary') {
      s.speed = Math.min(PHYSICS.maxSpeed, s.speed + PHYSICS.tapBoost);
      s.taps++;
      event(s, 'tap');
    } else {
      s.vx = s.speed;
      s.vy = PHYSICS.jump;
      phase(s, 'approach');
      event(s, 'jump');
    }
  } else if (s.phase === 'flight') {
    if (action === 'primary' && s.flaps > 0 && s.flapCooldown <= 0) {
      s.flaps--;
      s.vy -= PHYSICS.flapLift * s.mod.flap;
      s.vx += 28 * s.mod.flap;
      s.flapCooldown = PHYSICS.flapCooldown;
      s.flapPose = 0.45;
      say(
        s,
        ['A HORSE OF FEATHER.', 'EMERGENCY JAZZ HANDS!', 'PANIC FLAP!'][
          s.flaps % 3
        ],
      );
      event(s, 'flap');
    } else if (action === 'secondary' && !s.flipActive) {
      s.flipActive = true;
      s.flipProgress = 0;
    }
  }
}
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
export function land(s: GameState, failed = false, reason = '') {
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
}
export function stepGame(s: GameState, dt = STEP) {
  if (s.paused) return;
  if (s.hitStop > 0) {
    s.hitStop = Math.max(0, s.hitStop - dt);
    return;
  }
  s.time += dt;
  s.phaseTime += dt;
  s.messageTime = Math.max(0, s.messageTime - dt);
  s.flapCooldown = Math.max(0, s.flapCooldown - dt);
  s.flapPose = Math.max(0, s.flapPose - dt);
  if (s.phase === 'countdown') {
    const beat = Math.max(0, 3 - Math.floor(s.phaseTime / 0.72));
    if (beat !== s.countdownBeat) {
      s.countdownBeat = beat;
      event(s, 'count', beat);
    }
    if (s.phaseTime >= 2.16) {
      phase(s, 'runup');
      say(s, 'MASH FOR GLORY!', 1.1);
    }
  } else if (s.phase === 'runup') {
    s.speed = Math.max(PHYSICS.minSpeed, s.speed - PHYSICS.decay * dt);
    s.vx = s.speed;
    s.x += s.vx * dt;
    if (s.x >= TRACK.trampoline - TRACK.width / 2)
      land(s, true, 'THE TRAMPOLINE IS NOT A DOOR.');
  } else if (s.phase === 'approach') {
    const oldX = s.x,
      oldY = s.y;
    s.x += s.vx * dt;
    s.y += s.vy * dt + 0.5 * PHYSICS.approachGravity * dt * dt;
    s.vy += PHYSICS.approachGravity * dt;
    if (oldY <= TRACK.surface && s.y >= TRACK.surface && s.vy > 0) {
      const crossing =
        oldX + ((s.x - oldX) * (TRACK.surface - oldY)) / (s.y - oldY);
      if (Math.abs(crossing - TRACK.trampoline) <= TRACK.width / 2) {
        s.x = crossing;
        s.y = TRACK.surface;
        s.vy = 0;
        s.quality = Math.max(
          0,
          1 - Math.abs(crossing - TRACK.trampoline) / (TRACK.width / 2),
        );
        phase(s, 'compression');
        say(
          s,
          s.quality > 0.68 ? 'ABSOLUTELY BOING-TIFUL!' : 'WE HAVE LIFTOFF!',
          2,
        );
      }
    }
    if (s.phase === 'approach' && s.y >= 0 && s.vy > 0)
      land(
        s,
        true,
        s.x < TRACK.trampoline
          ? 'A LITTLE EARLY, CAPTAIN.'
          : 'YOU OVERSHOT THE BOING.',
      );
  } else if (s.phase === 'compression') {
    s.y = TRACK.surface + trampolineDip(s);
    if (s.phaseTime >= TRACK.compressionTime) {
      s.y = TRACK.surface;
      s.vx = (180 + s.speed * 1.65 + s.quality * 120) * s.mod.launch;
      s.vy =
        -(540 + s.speed * 0.65 + s.quality * 270) * PHYSICS.flightLiftScale;
      s.launched = true;
      phase(s, 'flight');
      event(s, 'bounce', s.quality);
    }
  } else if (s.phase === 'flight') {
    const oldX = s.x,
      oldY = s.y;
    s.vy += PHYSICS.gravity * s.mod.gravity * dt;
    s.vx += s.mod.wind * dt;
    s.vx *= Math.exp(-0.018 * dt);
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    // Lift carries the pony along a visible high-altitude lane. It continues to
    // decay under gravity, so flaps and world gravity still determine airtime.
    // Only entering the lane awards its boost; remaining in it cannot farm one.
    if (s.y < PHYSICS.jetstreamAltitude) {
      s.y = PHYSICS.jetstreamAltitude;
      if (oldY > PHYSICS.jetstreamAltitude) {
        s.vx += PHYSICS.jetstreamBoost;
        event(s, 'glide', PHYSICS.jetstreamBoost);
        say(s, 'THE EXPRESS MANE! +45 MOMENTUM');
      }
    }
    if (s.flipActive) {
      s.flipProgress += dt / (PHYSICS.flipTime * s.mod.flip);
      s.rotation = s.flipProgress * Math.PI * 2;
      if (s.flipProgress >= 1) {
        s.flipActive = false;
        s.flipProgress = 0;
        s.rotation = 0;
        s.flips++;
        s.style += s.mod.style;
        if (s.flips <= 3) s.vx += 30;
        event(s, 'flip');
        say(
          s,
          `${s.flips > 1 ? s.flips + '× ' : ''}UNSTABLE GYMNASTICS! +${s.mod.style}`,
        );
      }
    }
    RINGS.forEach((ring, i) => {
      if (
        !s.rings.includes(i) &&
        Math.hypot(s.x - ring.x, s.y - ring.y) < 92 * s.mod.reach
      ) {
        s.rings.push(i);
        s.vx += 60;
        s.vy -= PHYSICS.ringLift;
        s.style += 75;
        event(s, 'ring');
        say(s, 'EXPRESS DELIVERY! +75');
      }
    });
    s.maxHeight = Math.max(s.maxHeight, -s.y / 10);
    s.distance = Math.max(0, (s.x - TRACK.trampoline) / 10);
    if (oldY < 0 && s.y >= 0) {
      s.x = oldX + ((s.x - oldX) * -oldY) / (s.y - oldY);
      land(s);
    }
  } else if (s.phase === 'landing') {
    if (s.reactive) {
      if (s.phaseTime >= (s.failed ? 2.2 : 10)) phase(s, 'results');
      return;
    }
    const timeline = landingTimeline(s.landing);
    for (const at of [timeline.impact, timeline.secondImpact])
      if (s.phaseTime - dt < at && s.phaseTime >= at) {
        event(s, 'crunch');
        s.hitStop = timeline.freeze;
      }
    if (s.phaseTime - dt < timeline.ghost && s.phaseTime >= timeline.ghost)
      event(s, 'ghost');
    if (s.phaseTime >= timeline.end) phase(s, 'results');
  } else if (s.phase === 'replay' && s.phaseTime >= replayDuration(s.landing))
    phase(s, 'results');
}
export function createClock() {
  let accumulator = 0;
  return {
    advance(s: GameState, seconds: number, afterStep?: () => void) {
      if (s.paused) {
        accumulator = 0;
        return;
      }
      accumulator += Math.min(0.1, Math.max(0, seconds));
      while (accumulator + 1e-10 >= STEP) {
        stepGame(s);
        afterStep?.();
        accumulator -= STEP;
      }
    },
    reset() {
      accumulator = 0;
    },
  };
}
