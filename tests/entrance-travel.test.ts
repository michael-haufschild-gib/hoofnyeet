import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entranceTravel } from '../lib/game/effects/entrance-travel';
import {
  encorePose,
  ENCORE_LIFE,
} from '../lib/game/effects/motion/encore-motion';
import { spectatorPose } from '../lib/game/effects/motion/spectator-motion';
import type { CarnageCue } from '../lib/game/catalogue/escalation';

void test('entrance distance includes the entire actor outside asymmetric and very wide shots', () => {
  for (const side of [-1, 1] as const) {
    for (const bounds of [
      { left: 2200, right: 4000 },
      { left: -3000, right: 9000 },
    ]) {
      const anchor = 3000 + side * 175;
      const start = anchor + side * entranceTravel(anchor, side, bounds);
      assert.ok(
        side === 1 ? start - 260 >= bounds.right : start + 260 <= bounds.left,
      );
    }
  }
  assert.equal(entranceTravel(0, 1), 1420);
  assert.equal(
    entranceTravel(0, 1, { left: -100, right: 100 }, 1900, 50),
    1900,
  );
});

void test('adaptive entrances and exits keep contact positions, old footage and gentle timing intact', () => {
  const bounds = { left: -3500, right: 9500 };
  for (let seed = 0; seed < 20; seed++) {
    const cue: CarnageCue = {
      id: 'entry',
      kind: 'landing',
      stage: 0,
      at: 8,
      x: 3000,
      y: 0,
      seed,
      power: 1,
      world: 'afterlife',
      landing: 'dignified',
      encore: 1,
    };
    for (const age of [1.2, 2.4, 3.8, 4.9, 5.2]) {
      assert.deepEqual(
        encorePose(cue, 8 + age, false, bounds),
        encorePose(cue, 8 + age),
      );
    }
    for (const age of [0, 0.4, 2, 5.5]) {
      assert.deepEqual(
        encorePose(cue, 8 + age, true, bounds),
        encorePose(cue, 8 + age, true),
      );
      const old = { ...cue, encore: undefined };
      assert.deepEqual(
        spectatorPose(old, 8 + age, false, bounds),
        spectatorPose(old, 8 + age),
      );
    }
    const start = encorePose(cue, 8, false, bounds)!;
    const end = encorePose(cue, 8 + ENCORE_LIFE - 0.0001, false, bounds)!;
    assert.ok(
      start.side > 0
        ? start.x > bounds.right + 250
        : start.x < bounds.left - 250,
    );
    assert.ok(
      end.side > 0 ? end.x > bounds.right + 250 : end.x < bounds.left - 250,
    );
    assert.equal(encorePose(cue, 8 + ENCORE_LIFE, false, bounds), null);
    assert.equal(
      spectatorPose(cue, 9.4, false, bounds)!.x,
      spectatorPose(cue, 9.4)!.x,
    );
  }
});
