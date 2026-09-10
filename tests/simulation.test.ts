import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createClock,
  createGame,
  jumpTarget,
  land,
  chooseLanding,
  PHYSICS,
  startGame,
  STEP,
  stepGame,
  TRACK,
  type GameState,
} from '../lib/game/simulation';
import {
  defaultSave,
  finishRound,
  readSave,
  writeSave,
  STORAGE_KEY,
} from '../lib/game/storage';

function seconds(s: GameState, n: number) {
  for (let i = 0; i < Math.round(n / STEP); i++) stepGame(s);
}
function running() {
  const s = createGame();
  startGame(s);
  seconds(s, 2.2);
  return s;
}
function launch(offset = 0, speed = 290) {
  const s = running();
  s.speed = speed;
  s.x = jumpTarget(s).center + offset;
  act(s, 'secondary');
  seconds(s, 0.7);
  return s;
}
function flying() {
  const s = launch();
  seconds(s, 0.5);
  assert.equal(s.phase, 'flight');
  return s;
}

void test('countdown holds the horse and a distinct tap accelerates it; repeat does not', () => {
  const s = createGame();
  startGame(s);
  act(s, 'primary');
  seconds(s, 1);
  assert.equal(s.x, TRACK.start);
  assert.equal(s.speed, PHYSICS.minSpeed);
  seconds(s, 1.2);
  act(s, 'primary');
  assert.equal(s.speed, PHYSICS.minSpeed + PHYSICS.tapBoost);
  act(s, 'primary', true);
  assert.equal(s.speed, PHYSICS.minSpeed + PHYSICS.tapBoost);
  assert.equal(s.taps, 1);
});
void test('speed is bounded, decays, and cannot stall the run', () => {
  const s = running();
  for (let i = 0; i < 100; i++) act(s, 'primary');
  assert.equal(s.speed, PHYSICS.maxSpeed);
  seconds(s, 1);
  assert.ok(s.speed < PHYSICS.maxSpeed);
  s.speed = 96;
  seconds(s, 0.1);
  assert.equal(s.speed, PHYSICS.minSpeed);
});
void test('swept collision lands on the centre and both trampoline edges', () => {
  for (const offset of [-83, 0, 83]) {
    const s = launch(offset);
    assert.equal(s.phase, 'compression');
    assert.ok(Math.abs(s.x - TRACK.trampoline) < 90);
    if (offset === 0) assert.ok(s.quality > 0.97);
  }
});
void test('jumps outside both trampoline edges fail; never jumping fails', () => {
  for (const offset of [-100, 100]) {
    const s = launch(offset);
    seconds(s, 0.4);
    assert.equal(s.failed, true);
    assert.equal(s.distance, 0);
  }
  const s = running();
  s.x = TRACK.trampoline - TRACK.width / 2 - 0.1;
  stepGame(s);
  assert.equal(s.failed, true);
  assert.match(s.failureReason, /DOOR/);
});
void test('approach speed and centring both improve launch velocity', () => {
  const weak = launch(65, 160),
    strong = launch(0, 300);
  seconds(weak, 0.5);
  seconds(strong, 0.5);
  assert.ok(strong.vx > weak.vx);
  assert.ok(strong.vy < weak.vy);
});
void test('exactly three flaps are available and cooldown prevents same-tick spam', () => {
  const s = flying();
  const vy = s.vy;
  act(s, 'primary');
  assert.equal(s.flaps, 2);
  assert.equal(s.vy, vy - PHYSICS.flapLift);
  act(s, 'primary');
  assert.equal(s.flaps, 2);
  seconds(s, 0.41);
  act(s, 'primary');
  seconds(s, 0.41);
  act(s, 'primary');
  seconds(s, 0.41);
  const last = s.vy;
  act(s, 'primary');
  assert.equal(s.flaps, 0);
  assert.equal(s.vy, last);
});
void test('completed flips score; only the first three earn a velocity bonus', () => {
  const s = flying();
  s.x = TRACK.trampoline + 10000;
  s.y = PHYSICS.jetstreamAltitude;
  s.vy = -PHYSICS.gravity * 6;
  for (let i = 0; i < 4; i++) {
    const expected = s.vx * Math.exp(-0.018 * 0.86);
    act(s, 'secondary');
    act(s, 'secondary');
    seconds(s, 0.86);
    assert.equal(s.flips, i + 1);
    assert.equal(s.routine!.technical, (i + 1) * 100);
    assert.equal(s.style, s.routine!.technical + s.routine!.artistry);
    assert.equal(s.flipActive, false);
    assert.ok(Math.abs(s.vx - expected - (i < 3 ? 30 : 0)) < 1);
  }
  assert.equal(s.rotation, 0);
});
void test('an interrupted flip selects cartwheel and preserves the initial jump distance', () => {
  const s = flying();
  s.x = 2000;
  s.y = -1;
  s.vy = 500;
  act(s, 'secondary');
  stepGame(s);
  assert.equal(s.phase, 'landing');
  assert.equal(s.landing, 'cartwheel');
  assert.equal(s.flips, 0);
  const distance = s.distance;
  seconds(s, 9);
  assert.equal(s.flightDistance, distance);
  assert.equal(s.phase, 'results');
  assert.ok(distance > 88 && distance < 89);
});
void test('all eight landing routines are selected by impact and flight context', () => {
  assert.equal(chooseLanding(1, 500, false, 0, 0), 'haystack');
  assert.equal(chooseLanding(38, 500, false, 0, 0), 'mud');
  assert.equal(chooseLanding(75, 500, false, 0, 0), 'accordion');
  assert.equal(chooseLanding(112, 500, false, 0, 0), 'fence');
  assert.equal(chooseLanding(149, 500, false, 0, 0), 'sheep');
  assert.equal(chooseLanding(186, 500, false, 0, 0), 'ballet');
  assert.equal(chooseLanding(1, 500, true, 0, 0), 'cartwheel');
  assert.equal(chooseLanding(1, 500, false, 0, 1), 'dignified');
});
void test('pause freezes time and inputs, then resumes without a catch-up leap', () => {
  const s = running(),
    clock = createClock();
  s.paused = true;
  const before = JSON.stringify(s),
    x = s.x;
  act(s, 'primary');
  clock.advance(s, 1);
  assert.equal(JSON.stringify(s), before);
  s.paused = false;
  clock.advance(s, STEP);
  assert.ok(s.x > x && s.x < x + 1);
});
void test('30, 60, and 144 Hz rendering produce equivalent whole attempts', () => {
  const run = (hz: number) => {
    const s = createGame(),
      clock = createClock();
    startGame(s);
    let tick = 0;
    for (let frame = 0; frame < hz * 22; frame++)
      clock.advance(s, 1 / hz, () => {
        tick++;
        if (s.phase === 'runup') {
          if (tick % 15 === 0) act(s, 'primary');
          if (s.x >= jumpTarget(s).center) act(s, 'secondary');
        }
        if (s.phase === 'flight') {
          if (tick % 105 === 0) act(s, 'secondary');
          if (tick % 170 === 0) act(s, 'primary');
        }
      });
    return s;
  };
  const a = run(30);
  assert.equal(a.phase, 'results');
  assert.ok(a.distance > 200);
  for (const hz of [60, 144]) {
    const b = run(hz);
    assert.ok(Math.abs(b.distance - a.distance) < 0.00001);
    assert.equal(b.style, a.style);
    assert.equal(b.landing, a.landing);
  }
});
void test('restart clears resources, score, rotation, failure and replay phase', () => {
  const s = flying();
  s.flaps = 0;
  s.flips = 6;
  s.style = 600;
  s.rotation = 3;
  s.sceneTime = 99;
  land(s);
  startGame(s);
  assert.equal(s.round, 2);
  assert.equal(s.phase, 'countdown');
  assert.equal(s.flaps, 3);
  assert.equal(s.flips, 0);
  assert.equal(s.style, 0);
  assert.equal(s.rotation, 0);
  assert.equal(s.failed, false);
  assert.equal(s.x, TRACK.start);
  assert.equal(s.distance, 0);
  assert.equal(s.sceneTime, undefined);
});
void test('corrupt, throwing or absent local storage falls back to the default save rather than blocking play', () => {
  assert.deepEqual(readSave({ getItem: () => '{broken' }), defaultSave());
  assert.deepEqual(
    readSave({
      getItem: () => {
        throw new Error('denied');
      },
    }),
    defaultSave(),
  );
  assert.equal(
    writeSave(defaultSave(), {
      setItem: () => {
        throw new Error('quota');
      },
    }),
    false,
  );
  const bad = {
    version: 1,
    best: -5,
    hat: 'illegal',
    hats: ['space', 'invalid'],
    landings: ['mud', 'unknown', 'mud'],
    last: [{ distance: -1, landing: 'mud' }],
  };
  const restored = readSave({ getItem: () => JSON.stringify(bad) });
  assert.equal(restored.best, 0);
  assert.equal(restored.hat, 'helmet');
  assert.deepEqual(restored.landings, ['mud']);
  assert.deepEqual(restored.hats, ['helmet', 'space']);
  assert.equal(restored.last.length, 0);
});
void test('round completion unlocks hats and records only successful landing awards', () => {
  const s = flying();
  s.x = TRACK.trampoline + 4200;
  land(s);
  const saved = finishRound(defaultSave(), s);
  assert.equal(saved.best, 420);
  assert.equal(saved.rounds, 1);
  assert.equal(saved.hats.length, 4);
  assert.equal(saved.landings.length, 1);
  let wire = '';
  writeSave(saved, {
    setItem: (k, v) => {
      assert.equal(k, STORAGE_KEY);
      wire = v;
    },
  });
  assert.deepEqual(readSave({ getItem: () => wire }), saved);
  land(s, true);
  const failure = finishRound(saved, s);
  assert.deepEqual(failure.landings, saved.landings);
  assert.equal(failure.best, 420);
});

void test('a landing plays once and stays on results until the player asks otherwise', () => {
  const s = flying();
  land(s);
  const phases = new Set<string>();
  for (let i = 0; i < 14 / STEP; i++) {
    stepGame(s);
    phases.add(s.phase);
  }
  assert.equal(s.phase, 'results');
  assert.equal(phases.has('replay'), false);
});

void test('each impact fires once and freezes the shared scene clock at contact', async () => {
  const { landingTimeline } =
    await import('../lib/game/catalogue/landing-timeline');
  for (const id of [
    'haystack',
    'mud',
    'accordion',
    'cartwheel',
    'fence',
    'sheep',
    'ballet',
    'dignified',
  ] as const) {
    const s = flying();
    land(s);
    s.landing = id;
    s.events = [];
    const expected = landingTimeline(id);
    let impacts = 0,
      ghosts = 0;
    for (let i = 0; i < 9 / STEP; i++) {
      stepGame(s);
      for (const e of s.events) {
        if (e.kind === 'crunch') {
          const at = impacts ? expected.secondImpact : expected.impact;
          assert.ok(Math.abs(s.phaseTime - at) <= STEP + 0.00001);
          impacts++;
          assert.ok(s.hitStop > 0);
          const clock = s.time,
            phaseClock = s.phaseTime;
          stepGame(s);
          assert.equal(s.time, clock);
          assert.equal(s.phaseTime, phaseClock);
        }
        if (e.kind === 'ghost') ghosts++;
      }
      s.events = [];
    }
    assert.equal(impacts, 2);
    assert.equal(ghosts, 1);
    assert.equal(s.phase, 'results');
  }
});
