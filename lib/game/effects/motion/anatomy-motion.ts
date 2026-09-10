import type { BodyPose } from '../../crash';
import type { CarnageCue } from '../../catalogue/escalation';
import { noise } from '../../catalogue/escalation';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** Authored fractions of a centered body sprite, transformed with that body. */
export function anatomyPoint(body: BodyPose, u: number, v: number) {
  const x = u * body.w,
    y = v * body.h;
  const c = Math.cos(body.angle),
    s = Math.sin(body.angle);
  return { x: body.x + c * x - s * y, y: body.y + s * x + c * y };
}

/**
 * World point a ribbon of tissue leaves from or returns to, chosen per body
 * part so a strand exits the wound rather than the middle of the sprite.
 * `outgoing` picks the forward lip of a torso instead of its trailing one.
 */
export function tissueSocket(body: BodyPose, outgoing: boolean) {
  if (body.part.includes('torso') || body.part === 'cube')
    return anatomyPoint(body, outgoing ? 0.12 : -0.15, 0.2);
  if (body.part.toLowerCase().includes('head'))
    return anatomyPoint(body, -0.17, 0.29);
  if (body.part.toLowerCase().includes('leg'))
    return anatomyPoint(body, 0, -0.34);
  return anatomyPoint(body, 0, 0);
}

/** Seconds one gag runs for, measured from the contact cue that started it. */
export const ANATOMY_ANTIC_LIFE = 3.6;

/** Contacts arrive in simulation order. Keep an entire joke on its original
 * cue instead of restarting it every time a bone bumps the floor. */
export function anatomyIncident(
  cues: readonly CarnageCue[],
  bodyId: number,
  time: number,
): CarnageCue | undefined {
  let picked: CarnageCue | undefined;
  for (const cue of cues) {
    if (
      cue.kind !== 'impact' ||
      cue.bodyId !== bodyId ||
      cue.at > time ||
      cue.power < 0.35
    )
      continue;
    if (!picked || cue.at - picked.at >= ANATOMY_ANTIC_LIFE + 0.45)
      picked = cue;
  }
  return picked && time < picked.at + ANATOMY_ANTIC_LIFE ? picked : undefined;
}

/** Which prop a contact sprouts. A head takes to the air; a body gets revived. */
export type AnatomyAntic =
  | 'defibrillator'
  | 'balloon'
  | 'helicopter'
  | 'parachute';

/** Picks the gag from the cue seed, so a replay always sprouts the same prop. */
function anticKind(head: boolean, seed: number): AnatomyAntic {
  if (head) return noise(seed, 27) < 0.5 ? 'helicopter' : 'parachute';
  return noise(seed, 27) < 0.5 ? 'defibrillator' : 'balloon';
}

/** Wound the prop grows out of: above the skull, or out of the flank. */
function anticRoot(body: BodyPose, head: boolean) {
  return anatomyPoint(body, head ? 0.03 : 0.13, head ? -0.3 : 0.08);
}

/** Full-extension rise in world units, cut to a hint under reduced motion. */
function anticRise(reduced: boolean, head: boolean): number {
  return reduced ? 14 : head ? 87 : 62;
}

/** Prop width in world units, floored so a small bone still carries the gag. */
function anticSize(body: BodyPose, head: boolean): number {
  return Math.max(32, Math.min(head ? 56 : 60, body.w * (head ? 0.67 : 0.55)));
}

/** Idle wobble of the prop. Each term is zeroed or neutral under reduced motion. */
function anticWobble(age: number, reduced: boolean, pop: number, back: number) {
  return {
    sway: reduced ? 0 : Math.sin(age * 4.2) * pop * (1 - back) * 14,
    pulse: reduced ? 1 : 1 + Math.sin(age * 10) * 0.045,
    compress: reduced ? 0 : Math.sin(clamp(age / 0.16) * Math.PI) * 0.28,
    jitter: reduced ? 0 : Math.sin(age * 6) * 0.08,
  };
}

/** Balloon inflation: swells from 0.75 s, then bursts away at 2.0 s. */
function balloonSwell(kind: AnatomyAntic, age: number): number {
  if (kind !== 'balloon') return 0;
  return smooth((age - 0.75) / 1.2) * (1 - smooth((age - 2.0) / 0.18));
}

/** Defibrillator discharge, a sharp spike confined to 1.1 s..1.7 s. */
function defibShock(kind: AnatomyAntic, age: number): number {
  if (kind === 'defibrillator' && age > 1.1 && age < 1.7) {
    return Math.sin((age - 1.1) * 24) ** 8;
  }
  return 0;
}

/** Parachute collapse at 2.35 s, released again as the prop recoils. */
function chuteSquash(kind: AnatomyAntic, age: number, back: number): number {
  if (kind !== 'parachute') return 0;
  return smooth((age - 2.35) / 0.13) * (1 - back);
}

/** A contact-bound pose: compress, spring out, perform, then recoil into the
 * same wound. Its stem stays fixed even while the controlled part rotates. */
export function anatomyAntic(
  body: BodyPose,
  cue: CarnageCue,
  time: number,
  reduced: boolean,
) {
  const age = time - cue.at;
  if (age < 0 || time >= cue.at + ANATOMY_ANTIC_LIFE) return null;
  const head = body.part.toLowerCase().includes('head');
  const kind = anticKind(head, cue.seed);
  const root = anticRoot(body, head);
  const pop = smooth((age - 0.1) / 0.42);
  const back = smooth((age - 2.7) / 0.7);
  const lift = anticRise(reduced, head) * pop * (1 - back);
  const { sway, pulse, compress, jitter } = anticWobble(
    age,
    reduced,
    pop,
    back,
  );
  const balloon = balloonSwell(kind, age);
  const shock = defibShock(kind, age);
  const squash = chuteSquash(kind, age, back);
  return {
    kind,
    age,
    root,
    x: root.x + sway,
    y: root.y - lift,
    angle: body.angle * (1 - pop * (1 - back) * 0.85) + jitter,
    size: anticSize(body, head),
    scaleX:
      (1 + compress + balloon * 0.52 + squash * 0.5 + shock * 0.14) * pulse,
    scaleY:
      (1 - compress + balloon * 0.65 - squash * 0.65 - shock * 0.12) / pulse,
    pop,
    back,
    balloon,
    shock,
  };
}
