import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encorePose,
  ENCORE_CONTACT,
  ENCORE_PAYOFF,
  ENCORE_LIFE,
  type EncoreSource,
} from '../lib/game/effects/motion/encore-motion';

const cue: EncoreSource = {
  id: 'new-landing',
  kind: 'landing',
  stage: 0,
  at: 8,
  x: 3000,
  y: -70,
  world: 'candy',
  power: 1,
  seed: 91,
  encore: 1,
};

void test('encores preserve old footage and arrive from beyond the scene before contact', () => {
  assert.equal(encorePose({ ...cue, encore: undefined }, 11), null);
  assert.equal(encorePose({ ...cue, kind: 'impact' }, 11), null);
  assert.equal(encorePose({ ...cue, stage: 1 }, 11), null);
  assert.equal(encorePose(cue, 7.9), null);
  assert.equal(encorePose(cue, 8 + ENCORE_LIFE), null);
  const start = encorePose(cue, 8)!,
    arrived = encorePose(cue, 9.1)!;
  assert.ok(Math.abs(start.x - cue.x) > 1500);
  assert.ok(Math.abs(arrived.x - cue.x) <= 175.001);
  assert.equal(arrived.contact, 0);
  assert.equal(encorePose(cue, cue.at + ENCORE_CONTACT - 0.001)!.contact, 0);
  assert.equal(encorePose(cue, cue.at + ENCORE_PAYOFF - 0.001)!.payoff, 0);
  assert.equal(encorePose(cue, 13.3)!.payoff, 1);
  assert.ok(Math.abs(encorePose(cue, 13.89)!.x - cue.x) > 1500);
  let previous = start.x;
  for (let tick = 1; tick < 132; tick++) {
    const next = encorePose(cue, 8 + tick / 120)!;
    assert.ok(Math.abs(next.x - previous) < 17, 'continuous bounded entrance');
    previous = next.x;
  }
});

void test('encore motion is seeded, reversible, resource-free and calmer in reduced motion', () => {
  const before = JSON.stringify(cue),
    target = encorePose(cue, 12.5);
  for (const rate of [15, 30, 60, 120]) {
    for (let frame = 0; frame < rate * 5.5; frame++)
      encorePose(cue, 8 + frame / rate);
    assert.deepEqual(encorePose(cue, 12.5), target);
  }
  assert.equal(JSON.stringify(cue), before);
  const slow = encorePose(cue, 8.5, true)!;
  assert.equal(slow.bob, 0);
  assert.equal(slow.x, encorePose(cue, 13.6, true)!.x);
  const variants = new Set<number>(),
    sides = new Set<number>();
  for (let seed = 0; seed < 60; seed++) {
    const p = encorePose({ ...cue, seed }, 11)!;
    variants.add(p.variant);
    sides.add(p.side);
  }
  assert.equal(variants.size, 3);
  assert.equal(sides.size, 2);
});
