import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anatomyPoint,
  tissueSocket,
  anatomyIncident,
  anatomyAntic,
  ANATOMY_ANTIC_LIFE,
} from '../lib/game/effects/anatomy-motion';
import type { BodyPose } from '../lib/game/crash';
import type { CarnageCue } from '../lib/game/escalation';

const body: BodyPose = {
  id: 1,
  part: 'skeletal-torso',
  x: 240,
  y: -110,
  w: 100,
  h: 70,
  angle: 0,
  tint: 0xffffff,
  alpha: 1,
  boss: false,
  injury: 2,
};
const cue: CarnageCue = {
  id: 'impact-1',
  kind: 'impact',
  bodyId: 1,
  at: 2,
  x: 240,
  y: -110,
  power: 1.4,
  seed: 412,
  world: 'farm',
};

void test('anatomical sockets rotate around the actual part and scale with its artwork', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    const b = { ...body, angle };
    const p = anatomyPoint(b, 0.13, 0.08);
    const x = p.x - b.x,
      y = p.y - b.y;
    assert.ok(Math.abs(x * Math.cos(angle) + y * Math.sin(angle) - 13) < 1e-8);
    assert.ok(
      Math.abs(-x * Math.sin(angle) + y * Math.cos(angle) - 5.6) < 1e-8,
    );
    const socket = tissueSocket(
      { ...b, part: 'skeletal-front-leg-straight' },
      false,
    );
    assert.ok(
      Math.abs(Math.hypot(socket.x - b.x, socket.y - b.y) - body.h * 0.34) <
        1e-8,
    );
  }
});

void test('a complete contact joke is not restarted by secondary bumps or unrelated bodies', () => {
  const bump = { ...cue, id: 'bump', at: 2.8 };
  const other = { ...cue, id: 'other', bodyId: 2, at: 3.2 };
  const next = { ...cue, id: 'next', at: 6.2 };
  const cues = [cue, bump, other, next];
  assert.equal(anatomyIncident(cues, 1, 3.3), cue);
  assert.equal(anatomyIncident(cues, 1, 5.8), undefined);
  assert.equal(anatomyIncident(cues, 1, 6.3), next);
  assert.equal(anatomyIncident(cues, 2, 3.3), other);
  assert.equal(anatomyIncident(cues, 1, 1.9), undefined);
});

void test('organ antics keep deterministic original timing through inversion, pause and seeking', () => {
  const before = JSON.stringify({ body, cue });
  for (const part of ['skeletal-torso', 'offended-head'])
    for (const angle of [0, Math.PI, 1.2]) {
      const b = { ...body, part, angle };
      const sample = anatomyAntic(b, cue, 3.4, false)!;
      for (const rate of [15, 30, 60, 120]) {
        for (let i = 0; i < rate; i++)
          anatomyAntic(b, cue, 2 + i / rate, false);
        assert.deepEqual(anatomyAntic(b, cue, 3.4, false), sample);
      }
      assert.ok(
        Math.hypot(sample.x - sample.root.x, sample.y - sample.root.y) < 100,
      );
      assert.ok(anatomyAntic(b, cue, 3.4, true)!.y >= sample.root.y - 14);
    }
  assert.equal(anatomyAntic(body, cue, 1.9, false), null);
  assert.equal(
    anatomyAntic(body, cue, cue.at + ANATOMY_ANTIC_LIFE, false),
    null,
  );
  assert.equal(JSON.stringify({ body, cue }), before);
});
