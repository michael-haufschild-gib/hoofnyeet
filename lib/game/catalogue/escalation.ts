import type { LandingId } from '../simulation';
import type { WorldId } from '../content';

/**
 * Seconds of scripted crash choreography. The wreck cannot settle, and the run
 * cannot reach its results, until the crash clock passes this mark.
 */
export const CRASH_DURATION = 14;
/**
 * Seconds of continuous quiet the wreck must hold, on top of the full
 * choreography, before the crash counts as finished.
 */
export const CRASH_SETTLE_SECONDS = 0.85;
/**
 * Seconds a nuclear blast stays live on the crash clock. Settlement waits for a
 * late blast to expire even once the choreography itself is over.
 */
export const NUCLEAR_LIFE = 6.2;
/**
 * Seconds of replay frames kept behind the live clock, and the longest slice a
 * shared clip may cover. Late rebounds can outlast the choreography, so the
 * window has to reach past it to retain their eventual landing.
 */
export const INCIDENT_WINDOW = 45;
/**
 * Crash-clock second at which the escalating finale starts, once the initial
 * carnage has played out.
 */
export const ESCALATION_AT = 8;
/**
 * Delay in seconds after ESCALATION_AT for each finale stage. The array index
 * is the stage number, so the ascending order is load-bearing.
 */
export const ESCALATION_BEATS = [0, 1.1, 2.4, 3.8, 4.9] as const;
/**
 * Every gore sample id. Landing and cue sounds draw only from this list, and a
 * course preloads all of them, so an addition costs download on every level.
 */
export const CARNAGE_SOUNDS = [
  'tissue-stretch',
  'bone-pop',
  'wet-baler',
  'sausage-march',
  'vacuum-pack',
  'blood-bag',
  'receipt-rip',
  'ufo-sneeze',
  'rib-xylophone',
  'tooth-plink',
  'wringer',
  'monster-belch',
  'organ-windup',
  'bouquet-chomp',
  'soul-reject',
  'gore-ignite',
] as const;

/** These are semantic, recorded incidents, not renderer callbacks. Positions
 * are world coordinates; at is the crash simulation clock, including in replay. */
export interface CarnageCue {
  id: string;
  kind:
    | 'impact'
    | 'landing'
    | 'boss'
    | 'ignite'
    | 'nuclear'
    | 'confetti'
    | 'grab'
    | 'release';
  at: number;
  x: number;
  y: number;
  seed: number;
  power: number;
  bodyId?: number;
  propId?: number;
  landing?: LandingId;
  world: WorldId;
  stage?: number;
  /** Recorded opt-in: legacy footage retains its original supporting cast. */
  encore?: 1;
}
/**
 * The grip a machine has on the pony: `at` and `until` are crash-clock seconds,
 * the ids name wreck pieces, and `queued` holds the inputs replayed in order
 * the moment the grip ends.
 */
export interface GrabState {
  bodyId: number;
  propId: number;
  at: number;
  until: number;
  queued: ('primary' | 'secondary')[];
}
/**
 * The carnage a renderer reads for one frame: every cue recorded so far, the
 * active grab, and the limb attachments to paint, where `from` and `to` are
 * body ids and `elastic` lets a link stretch further before it is dropped.
 */
export interface CarnageFrame {
  cues: CarnageCue[];
  grab?: GrabState;
  attachments: { from: number; to: number; elastic: boolean }[];
}

/**
 * Gore samples for each landing, indexed by escalation stage, so every list
 * needs one entry per ESCALATION_BEATS beat.
 */
export const LANDING_SOUNDS: Record<LandingId, readonly string[]> = {
  haystack: [
    'wet-baler',
    'tissue-stretch',
    'sausage-march',
    'vacuum-pack',
    'bone-pop',
  ],
  mud: ['blood-bag', 'wringer', 'receipt-rip', 'tissue-stretch', 'bone-pop'],
  accordion: [
    'organ-windup',
    'rib-xylophone',
    'ufo-sneeze',
    'vacuum-pack',
    'bone-pop',
  ],
  cartwheel: [
    'rib-xylophone',
    'bone-pop',
    'organ-windup',
    'blood-bag',
    'tooth-plink',
  ],
  fence: ['tissue-stretch', 'wringer', 'blood-bag', 'receipt-rip', 'bone-pop'],
  sheep: [
    'tissue-stretch',
    'bouquet-chomp',
    'monster-belch',
    'bone-pop',
    'bouquet-chomp',
  ],
  ballet: [
    'organ-windup',
    'tissue-stretch',
    'bone-pop',
    'rib-xylophone',
    'bouquet-chomp',
  ],
  dignified: [
    'soul-reject',
    'vacuum-pack',
    'soul-reject',
    'bone-pop',
    'vacuum-pack',
  ],
};
/** The signature sample a world's boss plays when it takes a hit. */
export const BOSS_SOUNDS: Record<WorldId, string> = {
  farm: 'wet-baler',
  candy: 'bouquet-chomp',
  carnival: 'rib-xylophone',
  office: 'receipt-rip',
  moon: 'ufo-sneeze',
  afterlife: 'soul-reject',
};

/**
 * Hashes a cue id into a 32-bit unsigned seed. Presentation draws its
 * randomness from here so it never consumes encounter or physics RNG, and a
 * recording therefore replays with identical visuals.
 */
export function visualSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
/**
 * A deterministic value in [0, 1) for a seed and index. Separate indices give
 * independent draws from one cue, so an effect can vary per particle without
 * keeping state between frames.
 */
export function noise(seed: number, index: number): number {
  let n = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  n ^= n >>> 16;
  n = Math.imul(n, 0x21f0aaad);
  n ^= n >>> 15;
  n = Math.imul(n, 0x735a2d97);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296;
}

/** Bounded action reservations retain input order without repeated-key spam. */
export function queueGrabAction(
  grab: GrabState,
  action: 'primary' | 'secondary',
  kicks: number,
  abilityReady: boolean,
) {
  if (
    action === 'primary' &&
    grab.queued.filter((a) => a === 'primary').length < kicks
  )
    grab.queued.push(action);
  if (action === 'secondary' && abilityReady && !grab.queued.includes(action))
    grab.queued.push(action);
}
