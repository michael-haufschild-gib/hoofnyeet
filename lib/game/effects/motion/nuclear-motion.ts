import type { CarnageCue } from '../../catalogue/escalation';
import { NUCLEAR_LIFE } from '../../catalogue/escalation';

export { NUCLEAR_LIFE } from '../../catalogue/escalation';
/**
 * Seconds after the blast at which the pony drops into its duck. The crouch
 * eases in over the next 0.28 s and the settling hop follows 0.55 s later.
 */
export const NUCLEAR_DUCK = 3.5;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const p = clamp(n);
  return p * p * (3 - 2 * p);
};

/** A single recorded blast, sampled directly even when a replay starts midway. */
export function nuclearPose(cue: CarnageCue, time: number, reduced = false) {
  const age = time - cue.at;
  if (cue.kind !== 'nuclear' || age < 0 || age >= NUCLEAR_LIFE) return null;
  const grow = smooth(age / 1.15);
  const fade = 1 - smooth((age - 4.5) / 1.7);
  const duckY = reduced
    ? -19
    : (Math.min(-140, cue.y - 140) + 19) *
        (1 - smooth((age - NUCLEAR_DUCK) / 0.55)) -
      19 -
      Math.sin(smooth((age - NUCLEAR_DUCK - 0.55) / 0.4) * Math.PI) * 12;
  const helmetSeat = duckY - 36;
  return {
    id: cue.id,
    age,
    x: cue.x,
    y: cue.y,
    width: 620 * (0.16 + grow * 0.84) * (1 + Math.max(0, age - 1.15) * 0.025),
    height: 735 * (0.08 + grow * 0.92),
    alpha: smooth(age / 0.12) * fade,
    cloudY: cue.y - Math.max(0, age - 1.15) * 12,
    radius: 50 + Math.pow(clamp(age / 1.9), 0.7) * 850,
    shock: reduced ? 0 : (1 - smooth(age / 1.9)) * smooth(age / 0.06),
    glow: reduced ? 0 : Math.exp(-age * 2.7) * smooth(age / 0.04),
    duck: smooth((age - NUCLEAR_DUCK) / 0.28) * (1 - smooth((age - 5.5) / 0.7)),
    duckY,
    helmetY:
      helmetSeat +
      (reduced ? 0 : (1 - clamp((age - 4.1) / 0.35)) ** 2) *
        (Math.min(-1600, cue.y - 1600) - helmetSeat),
  };
}
