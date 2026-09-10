import test from 'node:test';
import assert from 'node:assert/strict';
import {
  eventSceneTime,
  impactMote,
  pressureWave,
  type MoteMotion,
} from '../lib/game/effects/motion/impact-motion';

const shard: MoteMotion = {
  born: 8,
  x: 50,
  y: -20,
  vx: 200,
  vy: -100,
  gravity: 320,
  angle: 0.3,
  spin: 6,
  life: 0.85,
  size: 14,
  grow: 0,
  opacity: 1,
};

void test('impact motion starts at the recorded contact and preserves its source through arbitrary playback', () => {
  const source = JSON.stringify(shard);
  assert.equal(impactMote(shard, 7.999), null);
  const start = impactMote(shard, 8)!;
  assert.equal(start.x, 50);
  assert.equal(start.y, -20);
  assert.equal(start.alpha, 0);
  const expected = impactMote(shard, 8.5);
  for (const fps of [15, 30, 60, 120]) {
    for (let tick = 0; tick <= fps; tick++) impactMote(shard, 8 + tick / fps);
    assert.deepEqual(impactMote(shard, 8.5), expected);
  }
  assert.equal(
    expected!.y,
    -30,
    'gravity follows a parabola, not the rendering timestep',
  );
  assert.ok(
    expected!.x > 50 && expected!.x < 150,
    'horizontal drag slows the debris',
  );
  assert.equal(impactMote(shard, 8.85), null);
  assert.equal(JSON.stringify(shard), source);
});

void test('pressure wave grows from the contact, loses energy, and ends without a trailing shader', () => {
  const wave = { born: 2, x: 420, y: -30, life: 0.8, radius: 340, power: 1 };
  assert.equal(pressureWave(wave, 1.9), null);
  const early = pressureWave(wave, 2.1)!;
  const late = pressureWave(wave, 2.7)!;
  assert.equal(early.x, 420);
  assert.equal(late.y, -30);
  assert.ok(late.radius > early.radius);
  assert.ok(late.power < early.power);
  assert.equal(pressureWave(wave, 2.8), null);
  assert.equal(
    eventSceneTime({ kind: 'land', x: 0, y: 0, time: 20, sceneTime: 12 }),
    12,
  );
});
