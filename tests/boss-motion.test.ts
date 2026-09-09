import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bossBirth,
  bossEmission,
  bossShow,
  bossSocket,
} from '../lib/game/effects/boss-motion';
import { bossPose } from '../lib/game/machinery';
import type { BodyPose } from '../lib/game/crash';
import type { CarnageCue } from '../lib/game/escalation';

const body: BodyPose = {
  id: 1,
  part: 'baler',
  x: 3200,
  y: -95,
  w: 170,
  h: 180,
  angle: 0,
  alpha: 1,
  tint: 0xffffff,
  boss: true,
};
const cue: CarnageCue = {
  id: 'boss-hit',
  kind: 'boss',
  at: 2,
  x: 3200,
  y: -95,
  seed: 31,
  power: 2,
  world: 'farm',
  bodyId: 1,
};

void test('boss emission sockets rotate with the art but released props stop following the current body', () => {
  for (const angle of [0, 0.6, Math.PI]) {
    const b = { ...body, angle },
      p = bossSocket(b, 0.27, 0.62);
    const dx = p.x - b.x,
      dy = p.y - b.y;
    assert.ok(
      Math.abs(
        Math.cos(angle) * dx + Math.sin(angle) * dy - (0.27 - 0.5) * b.w,
      ) < 1e-8,
    );
    assert.ok(
      Math.abs(
        -Math.sin(angle) * dx + Math.cos(angle) * dy - (0.62 - 0.5) * b.h,
      ) < 1e-8,
    );
    const released = bossEmission(cue, b, 0.5);
    assert.deepEqual(
      bossEmission(cue, { ...b, x: b.x + 400, y: b.y - 120 }, 0.5),
      released,
    );
  }
  const start = bossPose('farm', cue.at, body),
    next = bossPose('farm', cue.at + 0.5, body);
  const p = bossEmission(cue, body, 0.5),
    initial = bossEmission(cue, body, 0);
  assert.ok(Math.abs(p.x - initial.x - (next.x - start.x)) < 1e-8);
});

void test('boss signatures reveal staggered props only after birth and expire on their recorded clock', () => {
  assert.equal(bossBirth(0.49, 2, 0.25), null);
  assert.equal(bossBirth(0.5, 2, 0.25), 0);
  for (const world of [
    'farm',
    'candy',
    'carnival',
    'office',
    'moon',
    'afterlife',
  ] as const) {
    const c = { ...cue, world };
    const frozen = bossShow(c, 6.6, body);
    assert.equal(bossShow(c, 1.99, body), null);
    assert.equal(bossShow(c, 8, body), null);
    assert.equal(bossShow(c, 4, undefined), null);
    for (const fps of [15, 30, 60, 120]) {
      for (let i = 0; i < fps * 6; i++) bossShow(c, 2 + i / fps, body);
      assert.deepEqual(bossShow(c, 6.6, body), frozen);
    }
    assert.ok(bossShow(c, 4.4, body)!.reverse < 1e-8);
    assert.equal(bossShow(c, 5.1, body)!.reverse, 1);
  }
});
