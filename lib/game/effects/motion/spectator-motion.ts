import type { WorldId } from '../../content';
import { noise, type CarnageCue } from '../../catalogue/escalation';
import { entranceTravel, type SceneBounds } from '../entrance-travel';

/** Prop art keys each world's bystander may wheel in, indexed by world. */
export const SIDESHOW_ART: Record<WorldId, readonly string[]> = {
  farm: ['camera'],
  candy: ['organ-cart'],
  carnival: ['popcorn'],
  office: ['copier'],
  moon: ['lunar-blender'],
  afterlife: ['soul-toaster'],
};
/** Seconds after the landing cue at which the bystander's prop makes contact. */
export const SIDESHOW_CONTACT = 1.35;
/** Seconds after the landing cue at which the joke pays off. */
export const SIDESHOW_PUNCHLINE = 3.8;
/** Seconds after the landing cue at which the bystander is fully gone. */
export const SIDESHOW_LIFE = 6.2;
/** Smoothstep over 0..1, clamping anything outside that range to an endpoint. */
export const easeSideshow = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};

/** Recoil spike over the 0.3 s that follows contact, peaking at 1 mid-flinch. */
function sideshowShock(age: number): number {
  if (age >= SIDESHOW_CONTACT && age < SIDESHOW_CONTACT + 0.3) {
    return Math.sin(((age - SIDESHOW_CONTACT) / 0.3) * Math.PI);
  }
  return 0;
}

/** Idle hop in pixels: lively while entering, then a settled shuffle. */
function sideshowBob(age: number, reduced: boolean): number {
  if (reduced) return 0;
  return Math.abs(Math.sin(age * 12)) * (age < 0.75 ? 5 : 1.2);
}

/** All bystander motion comes from a recorded landing cue. These decorative
 * actors cannot grab the controlled wreck, advance physics or settle rewards. */
export function spectatorPose(
  cue: CarnageCue,
  time: number,
  reduced = false,
  bounds?: SceneBounds,
) {
  const age = time - cue.at;
  if (
    cue.kind !== 'landing' ||
    cue.stage !== 0 ||
    age < 0 ||
    time >= cue.at + SIDESHOW_LIFE
  )
    return null;
  const side = noise(cue.seed, 91) < 0.5 ? -1 : 1;
  const variant = noise(cue.seed, 93) < 0.5 ? 0 : 1;
  const arrive = easeSideshow(age / 0.75);
  const contact = easeSideshow((age - SIDESHOW_CONTACT) / 0.65);
  const punch = easeSideshow((age - SIDESHOW_PUNCHLINE) / 0.8);
  const travel = cue.encore
    ? entranceTravel(cue.x + side * 145, side, bounds)
    : 45;
  return {
    age,
    side,
    variant,
    contact,
    punch,
    x: cue.x + side * (145 + (reduced ? 0 : (1 - arrive) * travel)),
    alpha: Math.min(arrive * 2, 1, (SIDESHOW_LIFE - age) * 2),
    windup: easeSideshow((age - 0.7) / (SIDESHOW_CONTACT - 0.7)),
    shock: sideshowShock(age),
    bob: sideshowBob(age, reduced),
  };
}
