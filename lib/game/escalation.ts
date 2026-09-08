import type { LandingId } from './simulation';
import type { WorldId } from './content';

export const CRASH_DURATION = 14;
export const CRASH_SETTLE_SECONDS = 0.85;
// Late rebounds can outlast the choreography; retain their eventual landing.
export const INCIDENT_WINDOW = 45;
export const ESCALATION_AT = 8;
export const ESCALATION_BEATS = [0, 1.1, 2.4, 3.8, 4.9] as const;
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
}
export interface GrabState {
  bodyId: number;
  propId: number;
  at: number;
  until: number;
  queued: ('primary' | 'secondary')[];
}
export interface CarnageFrame {
  cues: CarnageCue[];
  grab?: GrabState;
  attachments: { from: number; to: number; elastic: boolean }[];
}

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
export const BOSS_SOUNDS: Record<WorldId, string> = {
  farm: 'wet-baler',
  candy: 'bouquet-chomp',
  carnival: 'rib-xylophone',
  office: 'receipt-rip',
  moon: 'ufo-sneeze',
  afterlife: 'soul-reject',
};

// Independent hash: presentation must never consume encounter/physics RNG.
export function visualSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}
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
