import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoutine, routineJudges } from '../lib/game/routine';
import { juryReaction } from '../lib/game/effects/motion/jury-motion';

void test('the highest actual grade chooses the hungry paddle after a readable verdict', () => {
  const routines = [
    { ...newRoutine(), completed: 8, counts: { tuck: 8 }, cleanFinish: true },
    {
      ...newRoutine(),
      completed: 3,
      counts: { tuck: 1, axel: 1, star: 1 },
      bestChain: 3,
    },
    { ...newRoutine(), completed: 2, counts: { spiral: 2 }, lowFinishes: 2 },
  ];
  assert.deepEqual(
    routines.map((r) => juryReaction(r, 3).judge),
    [0, 1, 2],
  );
  for (const r of routines) {
    assert.equal(juryReaction(r, 2.4).wake, 0);
    assert.equal(juryReaction(r, 3.079).swallow, 0);
    assert.equal(juryReaction(r, 3.64).belch, 0);
    assert.equal(juryReaction(r, 3.9).swallow, 1);
    assert.equal(juryReaction(r, 3.9).belch, 1);
    const scores = routineJudges(r);
    assert.equal(scores[juryReaction(r, 3).judge], Math.max(...scores));
  }
});

void test('jury reactions are reversible and do not mutate or re-award a routine', () => {
  const r = {
    ...newRoutine(),
    completed: 4,
    counts: { star: 4 },
    bestChain: 4,
  };
  const before = JSON.stringify(r),
    target = juryReaction(r, 3.28);
  for (const hz of [15, 30, 60, 120]) {
    for (let frame = 0; frame < hz * 5; frame++) juryReaction(r, frame / hz);
    assert.deepEqual(juryReaction(r, 3.28), target);
  }
  assert.equal(JSON.stringify(r), before);
});
