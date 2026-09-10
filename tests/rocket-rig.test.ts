import test from 'node:test';
import assert from 'node:assert/strict';
import { rocketRigPose, ROCKET_ART } from '../lib/game/art/rocket-rig';
import { TRACK } from '../lib/game/simulation';

void test('rocket deployment is continuous at trampoline entry and launch and fires backward', () => {
  const folded = rocketRigPose({ phase: 'approach', phaseTime: 0.2 });
  assert.deepEqual(
    rocketRigPose({ phase: 'compression', phaseTime: 0 }),
    folded,
  );
  const fired = rocketRigPose({ phase: 'flight', phaseTime: 0 });
  assert.deepEqual(
    rocketRigPose({ phase: 'compression', phaseTime: TRACK.compressionTime }),
    fired,
  );
  assert.ok(Math.cos(fired.angle + ROCKET_ART.axis) < -0.999);
  let previous = folded.angle;
  for (let tick = 0; tick <= 60; tick++) {
    const pose = rocketRigPose({ phase: 'compression', phaseTime: tick / 120 });
    assert.ok(pose.angle >= previous && pose.angle <= fired.angle);
    assert.ok(pose.angle - previous < 0.026);
    previous = pose.angle;
  }
});
