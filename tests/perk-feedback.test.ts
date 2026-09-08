import test from 'node:test';
import assert from 'node:assert/strict';
import { modifiers } from '../lib/game/content';
import {
  act,
  createGame,
  createClock,
  PHYSICS,
  STEP,
  stepGame,
} from '../lib/game/simulation';
import {
  recordPerkEvent,
  propulsionPuff,
} from '../lib/game/effects/perk-motion';
import { ponyPose } from '../lib/game/pose';
import { PONY_BODY_Y } from '../lib/game/geometry';
import { replayFrame } from '../lib/game/replay';

function flight(equipment: string[]) {
  const s = createGame();
  Object.assign(s, {
    phase: 'flight',
    x: 8000,
    y: -200,
    vx: 650,
    vy: 0,
    equipment,
    mod: modifiers(equipment),
    phaseTime: 2,
    time: 5,
  });
  return s;
}

void test('beans boost the actual flap by 35 percent and the combined wind build by 60 percent', () => {
  for (const [equipment, strength] of [
    [[], 1],
    [['beans'], 1.35],
    [['beans', 'tailwind'], 1.6],
  ] as const) {
    const s = flight([...equipment]);
    act(s, 'primary');
    assert.equal(s.vy, -PHYSICS.flapLift * strength);
    assert.equal(s.vx, 650 + 28 * strength);
    assert.equal(s.flaps, 2);
    const e = recordPerkEvent(s.events[0], s);
    assert.equal(!!e.propulsion, equipment.includes('beans' as never));
    act(s, 'primary');
    act(s, 'primary', true);
    assert.equal(
      s.events.length,
      1,
      'blocked and repeated taps cannot emit fake boost effects',
    );
    s.paused = true;
    const before = structuredClone(s);
    act(s, 'primary');
    stepGame(s);
    assert.deepEqual(s, before);
  }
});

void test('pocket weather accelerates the actual flight and beans plus weather fly farther', () => {
  const distances = [[], ['beans'], ['tailwind'], ['beans', 'tailwind']].map(
    (equipment) => {
      const s = flight(equipment);
      for (let tick = 0; tick < 4000 && s.phase === 'flight'; tick++) {
        if ([40, 160, 280].includes(tick)) act(s, 'primary');
        stepGame(s);
      }
      assert.equal(s.phase, 'landing');
      return s.distance;
    },
  );
  assert.ok(distances[1] > distances[0]);
  assert.ok(distances[2] > distances[0]);
  assert.ok(distances[3] > Math.max(distances[1], distances[2]));
});

void test('a fart emits from the articulated tail at every roll angle, and then separates from the pony', () => {
  for (const rotation of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const s = flight(['beans']);
    Object.assign(s, {
      rotation,
      flipActive: true,
      flipProgress: rotation / (Math.PI * 2),
    });
    act(s, 'primary');
    const e = recordPerkEvent(s.events[0], s);
    const pose = ponyPose(s, s.time);
    const px = -58 * pose.xScale,
      py = 9 * pose.yScale;
    assert.equal(
      e.propulsion!.x,
      s.x + Math.cos(rotation) * px - Math.sin(rotation) * py,
    );
    assert.equal(
      e.propulsion!.y,
      s.y +
        PONY_BODY_Y +
        pose.bob +
        Math.sin(rotation) * px +
        Math.cos(rotation) * py,
    );
    const p = propulsionPuff(e, 0, s.time + 0.4)!;
    assert.ok(Math.hypot(p.x - (s.x + s.vx * 0.4), p.y - s.y) > 70);
    assert.ok(p.alpha > 0 && p.size > 60);
    assert.equal(propulsionPuff(e, 0, s.time - STEP), null);
    assert.equal(propulsionPuff(e, 0, s.time + 2), null);
  }
});

void test('recorded puffs and flight outcomes match at different frame rates, through pause and replay', () => {
  const outcomes = [30, 60, 120].map((fps) => {
    const s = flight(['beans', 'tailwind']);
    act(s, 'primary');
    const e = recordPerkEvent(s.events[0], s);
    const clock = createClock();
    for (let frame = 0; frame < fps; frame++) clock.advance(s, 1 / fps);
    return { x: s.x, y: s.y, puff: propulsionPuff(e, 2, s.time), event: e };
  });
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[1], outcomes[2]);
  const e = JSON.parse(JSON.stringify(outcomes[0].event));
  const s = flight(['beans', 'tailwind']);
  const replay = replayFrame(
    [
      { ...s, sceneTime: 5, time: 9 },
      { ...s, sceneTime: 6, time: 10 },
    ],
    9.5,
  );
  assert.deepEqual(
    propulsionPuff(e, 1, replay.sceneTime!),
    propulsionPuff(e, 1, 5.5),
  );
  const paused = propulsionPuff(e, 1, 5.5);
  for (let i = 0; i < 100; i++)
    assert.deepEqual(propulsionPuff(e, 1, 5.5), paused);
});
