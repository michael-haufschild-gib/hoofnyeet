import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spectatorPose,
  SIDESHOW_LIFE,
  SIDESHOW_CONTACT,
  SIDESHOW_PUNCHLINE,
} from '../lib/game/effects/spectator-motion';
import type { CarnageCue } from '../lib/game/escalation';
const cue: CarnageCue = {
  id: 'landing-1',
  kind: 'landing',
  stage: 0,
  at: 8,
  x: 3200,
  y: 0,
  seed: 31,
  power: 1,
  world: 'farm',
};

void test('spectator routines use a stable landing seed and complete before they retire', () => {
  const before = JSON.stringify(cue);
  assert.equal(spectatorPose(cue, 7.99), null);
  assert.equal(spectatorPose({ ...cue, kind: 'impact' }, 9), null);
  assert.equal(spectatorPose({ ...cue, stage: 1 }, 9), null);
  assert.equal(
    spectatorPose(cue, cue.at + SIDESHOW_CONTACT - 0.001)!.contact,
    0,
  );
  assert.equal(
    spectatorPose(cue, cue.at + SIDESHOW_PUNCHLINE - 0.001)!.punch,
    0,
  );
  assert.equal(spectatorPose(cue, 13)!.punch, 1);
  const target = spectatorPose(cue, 12.5);
  for (const rate of [15, 30, 60, 120]) {
    for (let frame = 0; frame < rate * 4; frame++)
      spectatorPose(cue, 8 + frame / rate);
    assert.deepEqual(spectatorPose(cue, 12.5), target);
  }
  assert.equal(spectatorPose(cue, cue.at + SIDESHOW_LIFE), null);
  assert.equal(spectatorPose(cue, 12.5, true)!.bob, 0);
  assert.equal(JSON.stringify(cue), before);
  assert.equal(
    new Set(
      Array.from(
        { length: 20 },
        (_, seed) => spectatorPose({ ...cue, seed }, 12)!.side,
      ),
    ).size,
    2,
  );
});
