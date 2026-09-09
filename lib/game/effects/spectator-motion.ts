import type { WorldId } from '../content';
import { noise, type CarnageCue } from '../escalation';

export const SIDESHOW_ART: Record<WorldId, readonly string[]> = {
  farm: ['camera'],
  candy: [],
  carnival: ['popcorn'],
  office: ['copier'],
  moon: [],
  afterlife: [],
};
export const SIDESHOW_CONTACT = 1.35;
export const SIDESHOW_PUNCHLINE = 3.8;
export const SIDESHOW_LIFE = 6.2;
export const easeSideshow = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};

/** All bystander motion comes from a recorded landing cue. These decorative
 * actors cannot grab the controlled wreck, advance physics or settle rewards. */
export function spectatorPose(cue: CarnageCue, time: number, reduced = false) {
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
  return {
    age,
    side,
    variant,
    contact,
    punch,
    x: cue.x + side * (145 + (reduced ? 0 : (1 - arrive) * 45)),
    alpha: Math.min(arrive * 2, 1, (SIDESHOW_LIFE - age) * 2),
    windup: easeSideshow((age - 0.7) / (SIDESHOW_CONTACT - 0.7)),
    shock:
      age >= SIDESHOW_CONTACT && age < SIDESHOW_CONTACT + 0.3
        ? Math.sin(((age - SIDESHOW_CONTACT) / 0.3) * Math.PI)
        : 0,
    bob: reduced ? 0 : Math.abs(Math.sin(age * 12)) * (age < 0.75 ? 5 : 1.2),
  };
}
