import { noise, type CarnageCue } from '../../catalogue/escalation';
import { entranceTravel, type SceneBounds } from '../entrance-travel';
// The impact and payoff use the existing third/fifth authoritative finale beats.
/** Seconds after the landing cue at which the encore prop strikes. */
export const ENCORE_CONTACT = 2.4;
/** Seconds after the landing cue at which the encore's joke lands. */
export const ENCORE_PAYOFF = 4.9;
/** Seconds after the landing cue at which the encore has left the shot. */
export const ENCORE_LIFE = 5.9;
/** Smoothstep over 0..1, clamping anything outside that range to an endpoint. */
export const easeEncore = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};
// Old footage does not acquire a new scene merely because the renderer changed.
/** The recorded cue an encore reads from: only a stage-zero landing carries one. */
export type EncoreSource = CarnageCue;

/** Recoil spike over the 0.18 s that follows contact, peaking at 1 mid-flinch. */
function encoreShock(age: number): number {
  if (age >= ENCORE_CONTACT && age < ENCORE_CONTACT + 0.18) {
    return Math.sin(((age - ENCORE_CONTACT) / 0.18) * Math.PI);
  }
  return 0;
}

/** Idle hop in pixels: lively while entering or leaving, settled in between. */
function encoreBob(age: number, reduced: boolean): number {
  if (reduced) return 0;
  return Math.abs(Math.sin(age * 13)) * (age < 1.1 || age > 5.35 ? 4 : 0.6);
}

/**
 * The encore performer's placement and beat weights at `time`, or null when the
 * cue carries no encore or the act has not started or is already over. Every
 * value derives from the recorded cue, so a replay reproduces it exactly.
 */
export function encorePose(
  cue: EncoreSource,
  time: number,
  reduced = false,
  bounds?: SceneBounds,
) {
  const age = time - cue.at;
  if (
    !cue.encore ||
    cue.kind !== 'landing' ||
    cue.stage !== 0 ||
    age < 0 ||
    age >= ENCORE_LIFE
  )
    return null;
  // The supporting subplot occupies the other side of the existing spectators.
  const side = noise(cue.seed, 91) < 0.5 ? 1 : -1;
  const arrive = easeEncore(age / 1.1);
  const leave = easeEncore((age - 5.35) / (ENCORE_LIFE - 5.35));
  const travel = entranceTravel(cue.x + side * 175, side, bounds);
  return {
    age,
    side,
    variant: Math.floor(noise(cue.seed, 116) * 3),
    x: cue.x + side * (175 + (reduced ? 0 : (1 - arrive + leave) * travel)),
    alpha: reduced ? Math.min(1, age * 4, (ENCORE_LIFE - age) * 3) : 1,
    arrive,
    leave,
    windup: easeEncore((age - 1.15) / (ENCORE_CONTACT - 1.15)),
    contact: easeEncore((age - ENCORE_CONTACT) / 0.28),
    consequence: easeEncore((age - 2.85) / 0.95),
    payoff: easeEncore((age - ENCORE_PAYOFF) / 0.28),
    shock: encoreShock(age),
    bob: encoreBob(age, reduced),
  };
}

/** A resolved encore frame: the non-null result of {@link encorePose}. */
export type EncorePose = NonNullable<ReturnType<typeof encorePose>>;
