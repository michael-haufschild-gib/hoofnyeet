import type { CarnageCue } from '../escalation';
import { noise } from '../escalation';

export const COMBUSTION_CAP = 6;
export const COMBUSTION_LIFE = 1.45;
const smooth = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};

export function combustionPose(cue: CarnageCue, time: number) {
  const age = time - cue.at;
  if (cue.kind !== 'ignite' || age < 0 || time >= cue.at + COMBUSTION_LIFE)
    return null;
  const growth = smooth(age / 0.19);
  const fade = 1 - smooth((age - 0.68) / (COMBUSTION_LIFE - 0.68));
  const power = Math.max(0.4, Math.min(2.2, cue.power));
  return {
    id: cue.id,
    age,
    x: cue.x,
    y: Math.min(-2, cue.y + 8),
    width: (100 + power * 74) * (0.45 + growth * 0.55),
    height: (90 + power * 59) * (0.38 + growth * 0.62) + age * 19,
    alpha: growth * fade * 0.93,
    seed: noise(cue.seed, 231) * 19,
    heat: 1 - smooth((age - 0.34) / 0.91),
  };
}

/** Recent visible contacts take the bounded pool. A stable tie-break protects
 * clips assembled from different event-array traversal orders. */
export function combustionCues(
  cues: readonly CarnageCue[],
  time: number,
  left: number,
  right: number,
  density: number,
) {
  return cues
    .filter(
      (c) =>
        c.kind === 'ignite' &&
        c.at <= time &&
        time < c.at + COMBUSTION_LIFE &&
        c.x > left - 200 &&
        c.x < right + 200,
    )
    .sort(
      (a, b) =>
        b.at - a.at ||
        b.power - a.power ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .slice(
      0,
      Math.min(
        COMBUSTION_CAP,
        Math.max(1, Math.ceil(COMBUSTION_CAP * density)),
      ),
    );
}
