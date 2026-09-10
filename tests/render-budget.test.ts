import test from 'node:test';
import assert from 'node:assert/strict';
import { RenderBudget } from '../lib/game/art/render-budget';

function sample(budget: RenderBudget, fps: number, seconds: number) {
  for (let i = 0; i < fps * seconds; i++) budget.sample(1 / fps, true);
}

void test('sustained missed frames reduce decoration before resolution and retain legible pixels', () => {
  const budget = new RenderBudget(2);
  const choices = [];
  for (let frame = 0; frame < 100; frame++)
    if (budget.sample(1 / 30, true))
      choices.push([budget.resolution, budget.density]);
  assert.deepEqual(choices, [
    [2, 0.55],
    [1.5, 0.55],
    [1, 0.35],
  ]);
  assert.equal(budget.resolution, 1);
  assert.equal(budget.density, 0.35);
  sample(budget, 15, 30);
  assert.equal(budget.resolution, 1);
  sample(budget, 120, 30);
  assert.equal(
    budget.resolution,
    1,
    'stable quality prevents mid-run oscillation',
  );
  const standardDisplay = new RenderBudget(1);
  sample(standardDisplay, 30, 20);
  assert.equal(standardDisplay.resolution, 1);
});

void test('healthy frames, occasional stalls, pause and export cannot lower quality', () => {
  for (const fps of [60, 90, 120]) {
    const budget = new RenderBudget(2);
    sample(budget, fps, 10);
    budget.sample(0.08, true);
    sample(budget, fps, 10);
    for (let i = 0; i < 60; i++) budget.sample(1, false);
    budget.sample(2, true);
    sample(budget, fps, 10);
    assert.equal(budget.density, 1);
    assert.equal(budget.resolution, 2);
  }
});

void test('resize and interruption discard partial slow-frame samples without resetting chosen quality', () => {
  const budget = new RenderBudget(1.5);
  sample(budget, 30, 0.75);
  budget.resetSampling();
  sample(budget, 60, 5);
  assert.equal(budget.density, 1);
  sample(budget, 30, 7);
  assert.equal(budget.resolution, 1);
  budget.resetSampling();
  budget.sample(Number.NaN, true);
  sample(budget, 60, 10);
  assert.equal(budget.resolution, 1);
});

void test('consistent severe overload reacts early while minor misses need the full sampling window', () => {
  const severe = new RenderBudget(2);
  sample(severe, 30, 1.15);
  assert.equal(
    severe.density,
    0.55,
    'drop optional decoration after sustained half-rate frames',
  );
  assert.equal(
    severe.resolution,
    2,
    'keep full resolution for the first response',
  );
  sample(severe, 30, 1.7);
  assert.equal(
    severe.resolution,
    1,
    'do not leave several seconds of severe input latency',
  );
  const mild = new RenderBudget(2);
  sample(mild, 45, 1.15);
  assert.equal(mild.density, 1);
  sample(mild, 45, 0.6);
  assert.equal(mild.density, 0.55);
});
