import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combustionPose,
  combustionCues,
  COMBUSTION_LIFE,
  COMBUSTION_CAP,
} from '../lib/game/effects/combustion-motion';
import type { CarnageCue } from '../lib/game/escalation';
const cue: CarnageCue = {
  id: 'ignition',
  kind: 'ignite',
  at: 3,
  x: 3000,
  y: -20,
  power: 1.5,
  world: 'farm',
  seed: 91,
};

void test('fire grows at its ignition point, cools, expires and retains its recorded seed', () => {
  assert.equal(combustionPose(cue, 2.99), null);
  assert.equal(combustionPose({ ...cue, kind: 'impact' }, 3.2), null);
  assert.equal(combustionPose(cue, 3)!.alpha, 0);
  const bloom = combustionPose(cue, 3.3)!;
  const smoke = combustionPose(cue, 4.25)!;
  assert.equal(bloom.x, cue.x);
  assert.equal(bloom.y, -12);
  assert.ok(bloom.heat > smoke.heat);
  assert.ok(bloom.alpha > smoke.alpha);
  assert.ok(smoke.height > bloom.height);
  assert.equal(combustionPose(cue, cue.at + COMBUSTION_LIFE), null);
  for (const fps of [15, 30, 60, 120]) {
    for (let i = 0; i < fps * 2; i++) combustionPose(cue, 3 + i / fps);
    assert.deepEqual(combustionPose(cue, 3.3), bloom);
  }
});

void test('the fire pool selects visible recent contacts deterministically and stays bounded', () => {
  const cues = Array.from({ length: 50 }, (_, i) => ({
    ...cue,
    id: `fire-${i}`,
    at: 3 + i / 100,
  }));
  cues.push({ ...cue, id: 'offscreen', x: -99999, at: 3.49 });
  cues.push({ ...cue, id: 'future', at: 9 });
  cues.push({ ...cue, id: 'expired', at: 0 });
  const before = JSON.stringify(cues);
  const selected = combustionCues(cues, 3.5, 2500, 3500, 1);
  assert.equal(selected.length, COMBUSTION_CAP);
  assert.equal(selected[0].id, 'fire-49');
  assert.deepEqual(
    combustionCues([...cues].reverse(), 3.5, 2500, 3500, 1),
    selected,
  );
  assert.equal(combustionCues(cues, 3.5, 2500, 3500, 0.6).length, 4);
  assert.equal(JSON.stringify(cues), before);
});
