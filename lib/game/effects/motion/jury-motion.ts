import { routineJudges, type Routine } from '../../routine';

const ease = (value: number) => {
  const p = Math.max(0, Math.min(1, value));
  return p * p * (3 - 2 * p);
};

/** One delayed reaction to the actual verdict, sampled without advancing state. */
export function juryReaction(routine: Routine, age: number) {
  const scores = routineJudges(routine);
  // Drama wins ties: the most enthusiastic judge gets eaten by their own praise.
  let judge = 1;
  for (const i of [0, 2]) if (scores[i] > scores[judge]) judge = i;
  const wake = ease((age - 2.4) / 0.32);
  const lick = ease((age - 2.72) / 0.32);
  const swallow = ease((age - 3.08) / 0.48);
  const belch = ease((age - 3.64) / 0.25);
  return {
    judge,
    wake,
    lick,
    swallow,
    belch,
    appetite: 0.8 + scores[judge] * 0.025,
    shock: Math.sin(Math.PI * ease((age - 3.04) / 0.5)),
    chew:
      age >= 3.4 && age < 3.64
        ? Math.sin(((age - 3.4) / 0.24) * Math.PI * 2) ** 2
        : 0,
  };
}
