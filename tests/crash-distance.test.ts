import test from 'node:test';
import assert from 'node:assert/strict';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import {
  applyCrashFrame,
  createGame,
  land,
  STEP,
  TRACK,
} from '../lib/game/simulation';
import { beginAttempt, newRun, settleAttempt } from '../lib/game/run';
import { defaultSave, finishRound } from '../lib/game/storage';
import { replayFrame } from '../lib/game/replay';

function landed(distance = 695.5) {
  const s = createGame();
  Object.assign(s, {
    reactive: true,
    launched: true,
    x: TRACK.trampoline + distance * 10,
    vx: 700,
    vy: 450,
    disaster: 2,
  });
  land(s);
  return s;
}

for (const ability of ['spring', 'dynamite', 'eject', 'ghost'] as const)
  void test(`${ability} and panic kicks contribute their furthest position to the distance`, async () => {
    await initPhysics();
    const s = landed();
    s.ability = ability;
    const c = new CrashWorld(s);
    let furthest = s.distance;
    try {
      for (let i = 0; i < 1100; i++) {
        if (i === 15) c.action('secondary');
        if ([50, 120, 200].includes(i)) c.action('primary');
        c.step(STEP);
        const frame = c.snapshot();
        furthest = Math.max(furthest, (frame.focusX - TRACK.trampoline) / 10);
        const previous = s.distance;
        applyCrashFrame(s, frame);
        assert.equal(s.distance, furthest);
        assert.ok(
          s.distance >= previous,
          'a backward tumble never subtracts distance',
        );
        assert.equal(s.flightDistance, 695.5);
      }
      assert.ok(
        s.distance > 700,
        `the crash must count beyond 700 m; got ${s.distance}`,
      );
      assert.equal(c.snapshot().kicks, 0);
    } finally {
      c.dispose();
    }
  });

void test('only player progress counts; loose debris, pause, failures and finished attempts cannot add distance', async () => {
  await initPhysics();
  const s = landed(650);
  const c = new CrashWorld(s);
  try {
    const frame = c.snapshot();
    frame.focusX = TRACK.trampoline + 7000;
    frame.bodies[0].x = TRACK.trampoline + 40000;
    applyCrashFrame(s, frame);
    assert.equal(s.distance, 700);
    frame.focusX = TRACK.trampoline + 8000;
    s.paused = true;
    applyCrashFrame(s, frame);
    assert.equal(s.distance, 700);
    s.paused = false;
    s.phase = 'results';
    applyCrashFrame(s, frame);
    assert.equal(s.distance, 700);
    land(s, true, 'Missed the trampoline');
    applyCrashFrame(s, frame);
    assert.equal(s.distance, 0);
    assert.equal(s.flightDistance, 0);
  } finally {
    c.dispose();
  }
});

void test('post-landing distance clears the objective and enters records and points exactly once', async () => {
  await initPhysics();
  const s = landed(179);
  const c = new CrashWorld(s);
  try {
    const frame = c.snapshot();
    frame.focusX = TRACK.trampoline + 2050;
    frame.havoc = 360;
    applyCrashFrame(s, frame);
    const run = newRun('tour', 118);
    run.stage = 1;
    beginAttempt(run);
    const result = {
      distance: s.distance,
      style: 100,
      havoc: s.havoc,
      failed: false,
      bossHits: 0,
      disaster: 'test',
    };
    assert.equal(settleAttempt(run, result, run.pool), true);
    assert.equal(run.status, 'pitstop');
    assert.equal(run.score, 205 * 10 + 100 + 360);
    assert.equal(settleAttempt(run, result, run.pool), false);
    assert.equal(run.history.length, 1);
    const saved = finishRound(defaultSave(), s);
    assert.equal(saved.best, 205);
    assert.equal(saved.last[0].distance, 205);
  } finally {
    c.dispose();
  }
});

void test('replay preserves recorded total and jump distance without modifying scores', () => {
  const a = landed(695.5);
  a.time = 1;
  const b = { ...a, time: 2, distance: 712.8 };
  const frames = [a, b];
  const original = JSON.stringify(frames);
  assert.equal(replayFrame(frames, 2).distance, 712.8);
  assert.equal(replayFrame(frames, 2).flightDistance, 695.5);
  assert.equal(JSON.stringify(frames), original);
});
