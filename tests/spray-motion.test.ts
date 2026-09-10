import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sprayLaunch,
  sprayPose,
  sprayMaterial,
} from '../lib/game/effects/motion/spray-motion';
import type { CarnageCue } from '../lib/game/catalogue/escalation';

const cue: CarnageCue = {
  id: 'contact',
  kind: 'impact',
  at: 3,
  x: 3000,
  y: -50,
  seed: 31,
  power: 1.8,
  world: 'farm',
};

void test('spray rotates with velocity and splats exactly at the ballistic floor crossing', () => {
  for (const world of ['farm', 'moon'] as const) {
    for (const height of [-4, -50, -350]) {
      for (let i = 0; i < 32; i++) {
        const c = { ...cue, world, y: height },
          l = sprayLaunch(c, i);
        const before = sprayPose(c, i, l.contact - 0.0001)!;
        const at = sprayPose(c, i, l.contact)!;
        const after = sprayPose(c, i, l.contact + 0.12)!;
        assert.equal(before.landed, false);
        assert.equal(at.landed, true);
        assert.ok(Math.abs(at.y - l.floor) < 1e-8);
        assert.ok(Math.abs(at.x - at.contactX) < 1e-8);
        assert.equal(after.x, at.x);
        assert.equal(after.y, at.y);
        assert.ok(after.squash > 0.999);
        assert.ok(
          Math.abs(
            Math.cos(before.angle + Math.PI / 2) -
              before.vx / Math.hypot(before.vx, before.vy),
          ) < 1e-8,
        );
        assert.equal(sprayPose(c, i, l.contact + 9), null);
      }
    }
  }
  assert.ok(
    sprayLaunch({ ...cue, world: 'moon' }, 2).contact >
      sprayLaunch(cue, 2).contact,
  );
  const l = sprayLaunch(cue, 2),
    apex = -l.vy / l.gravity;
  assert.ok(sprayPose(cue, 2, apex - 0.05)!.vy < 0);
  assert.ok(sprayPose(cue, 2, apex + 0.05)!.vy > 0);
});

void test('magnetic material converges once, retains original eyes and bones, and samples independently of render rate', () => {
  const magnet = { x: 3150, y: -120 };
  const p = sprayPose(cue, 1, 0.94, 733, magnet)!;
  assert.ok(Math.abs(p.x - magnet.x) < 1e-8);
  assert.ok(Math.abs(p.y - magnet.y) < 1e-8);
  assert.equal(p.landed, false);
  assert.equal(sprayPose(cue, 1, 1.2, 733, magnet), null);
  assert.equal(
    sprayPose(cue, 1, 0.4, 733, { x: 9999, y: -10 })!.magnetic,
    false,
  );
  assert.equal(sprayPose(cue, 1, -0.1), null);
  assert.equal(sprayMaterial(0), 'bone');
  assert.equal(sprayMaterial(7), 'eye');
  assert.equal(sprayMaterial(11), 'bone');
  const before = JSON.stringify(cue),
    sample = sprayPose(cue, 8, 0.8);
  for (const fps of [15, 30, 60, 120]) {
    for (let i = 0; i < fps * 2; i++) sprayPose(cue, 8, i / fps);
    assert.deepEqual(sprayPose(cue, 8, 0.8), sample);
  }
  assert.equal(JSON.stringify(cue), before);
});
