import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  act,
  createGame,
  land,
  stepGame,
  STEP,
  PHYSICS,
} from '../lib/game/simulation';
import {
  beginTrick,
  completeTrick,
  embellishTrick,
  finishRoutine,
  newRoutine,
  routineJudges,
  routineScore,
  routineRing,
  routineRingScore,
} from '../lib/game/routine';
import { ponyPose } from '../lib/game/art/pose';
import { replayFrame } from '../lib/game/replay';
import { readSave, defaultSave } from '../lib/game/storage';
import { newRun, beginAttempt } from '../lib/game/run';
import { CONTENT_VERSION } from '../lib/game/content';

function spin(r = newRoutine(), time = 0, y = -400, vy = 250) {
  const started = beginTrick(r, { time, y, vy, flapPose: 0, beans: false });
  return completeTrick(started, {
    time: time + 0.86,
    x: 2000 + time * 200,
    y,
    base: 100,
  });
}
void test('linked variety earns explicit bonuses while identical repetition diminishes only the bonus', () => {
  const first = spin();
  const repeated = spin(first, 3);
  const linked = spin(first, 1);
  assert.equal(first.elements[0].trick, 'tuck');
  assert.equal(first.technical, 100);
  assert.equal(first.artistry, 20);
  assert.equal(repeated.technical, 200);
  assert.equal(repeated.elements[1].bonus, 0);
  assert.equal(linked.elements[1].trick, 'corkscrew');
  assert.equal(linked.bestChain, 2);
  assert.ok(linked.artistry > repeated.artistry);
  assert.equal(routineScore(linked), linked.technical + linked.artistry);
});
void test('the existing flap adds splits or a gastric axel only during a valid rotation', () => {
  const a = beginTrick(newRoutine(), {
    time: 0,
    y: -400,
    vy: -300,
    flapPose: 0,
    beans: false,
  });
  const frozen = JSON.stringify(a);
  assert.equal(embellishTrick(a, 0.4, false).active!.trick, 'star');
  assert.equal(embellishTrick(a, 0.4, true).active!.trick, 'bean');
  assert.equal(embellishTrick(a, 0.95, true), a);
  assert.equal(embellishTrick(newRoutine(), 0.4, true).active, null);
  assert.equal(JSON.stringify(a), frozen);
});
void test('apex and low rotations use actual flight context, and a clean finish is awarded once', () => {
  const layback = spin(newRoutine(), 0, -400, 0);
  const low = spin(layback, 1, -90, 200);
  assert.equal(layback.elements[0].trick, 'layback');
  assert.equal(low.elements[1].trick, 'spiral');
  assert.equal(low.lowFinishes, 1);
  const finished = finishRoutine(low, {
    time: 3,
    x: 2200,
    y: 0,
    failed: false,
    interrupted: false,
  });
  assert.equal(finished.finish, 50 + 36);
  assert.equal(finished.cleanFinish, true);
  assert.equal(
    finishRoutine(finished, {
      time: 4,
      x: 2400,
      y: 0,
      failed: false,
      interrupted: false,
    }),
    finished,
  );
  assert.ok(routineJudges(finished).every((n) => n >= 0 && n <= 10));
  assert.ok(routineJudges(finished)[2] > 0);
});
void test('an unfinished low roll earns no element points and keeps previously earned technique', () => {
  const previous = spin();
  const active = beginTrick(previous, {
    time: 1,
    y: -10,
    vy: 400,
    flapPose: 0,
    beans: false,
  });
  const finished = finishRoutine(active, {
    time: 1.1,
    x: 2300,
    y: 0,
    failed: false,
    interrupted: true,
  });
  assert.equal(finished.completed, 1);
  assert.equal(finished.technical, 100);
  assert.equal(finished.elements.at(-1)!.clean, false);
  assert.equal(finished.elements.at(-1)!.base, 0);
  assert.equal(finished.cleanFinish, false);
  assert.equal(finished.finish, 25);
});
void test('history, combo and grade pools stay bounded without mutating any older snapshot', () => {
  let r = newRoutine();
  const frames = [r];
  const snapshots = [JSON.stringify(r)];
  for (let i = 0; i < 100; i++) {
    r = spin(r, i * 1.0);
    frames.push(r);
    snapshots.push(JSON.stringify(r));
  }
  assert.equal(r.elements.length, 24);
  assert.equal(r.completed, 100);
  assert.equal(r.bestChain, 8);
  assert.ok(routineJudges(r).every((n) => Number.isFinite(n) && n <= 10));
  frames.forEach((f, i) => assert.equal(JSON.stringify(f), snapshots[i]));
});
void test('native two-action simulation keeps physics, score attribution, pause and reset coherent', () => {
  const s = createGame();
  Object.assign(s, {
    phase: 'flight',
    launched: true,
    x: 10000,
    y: -420,
    vy: -300,
    vx: 500,
  });
  act(s, 'secondary');
  const starting = s.routine;
  for (let i = 0; i < 30; i++) stepGame(s);
  act(s, 'primary');
  assert.equal(s.routine!.active!.trick, 'star');
  const paused = JSON.stringify({ ...s, paused: true });
  s.paused = true;
  stepGame(s);
  act(s, 'primary');
  act(s, 'secondary');
  assert.equal(JSON.stringify(s), paused);
  s.paused = false;
  for (let i = 0; i < 90; i++) stepGame(s);
  assert.equal(s.flips, 1);
  assert.equal(s.flaps, 2);
  assert.equal(s.style, routineScore(s.routine!));
  assert.equal(starting!.completed, 0);
  assert.equal(starting!.active!.trick, 'tuck');
  land(s);
  const points = s.style;
  land(s);
  assert.equal(s.style, points);
  assert.equal(s.style, routineScore(s.routine!));
  assert.equal(createGame().routine!.completed, 0);
});
void test('contextual poses differ at the same rotation and replay retains the historical routine', () => {
  const a = createGame();
  Object.assign(a, {
    phase: 'flight',
    launched: true,
    x: 3000,
    y: -400,
    vy: -300,
    flipProgress: 0.4,
    flipActive: true,
  });
  a.routine = beginTrick(a.routine!, {
    time: 0,
    y: -400,
    vy: -300,
    flapPose: 0,
    beans: false,
  });
  const b = { ...a, time: 1, routine: embellishTrick(a.routine!, 0.4, false) };
  assert.notDeepEqual(ponyPose(a, 0).legs, ponyPose(b, 0).legs);
  const snapshot = JSON.stringify(a);
  assert.equal(replayFrame([a, b], 0.25).routine!.active!.trick, 'tuck');
  assert.equal(replayFrame([a, b], 1).routine!.active!.trick, 'star');
  assert.equal(JSON.stringify(a), snapshot);
});
void test('scheduled routines are equivalent across rendering frame rates', () => {
  function perform(hz: number) {
    const s = createGame();
    Object.assign(s, {
      phase: 'flight',
      launched: true,
      x: 10000,
      y: PHYSICS.jetstreamAltitude,
      vy: -800,
      vx: 500,
    });
    let accumulator = 0,
      steps = 0;
    const actions = new Map([
      [0, 'secondary'],
      [26, 'primary'],
      [110, 'secondary'],
      [220, 'secondary'],
      [242, 'primary'],
    ] as const);
    for (let frame = 0; steps < 500; frame++) {
      accumulator += 1 / hz;
      while (accumulator >= STEP && steps < 500) {
        const action = actions.get(steps as 0);
        if (action) act(s, action);
        stepGame(s);
        steps++;
        accumulator -= STEP;
      }
    }
    return { x: s.x, y: s.y, style: s.style, routine: s.routine };
  }
  assert.deepEqual(perform(30), perform(144));
  assert.deepEqual(perform(60), perform(144));
});

void test('v5 checkpoints and records migrate without losing equipment or mixing daily scores', () => {
  const run = newRun('daily', 42, false, '2026-09-08');
  run.passives = ['beans', 'tailwind'];
  run.ability = 'dynamite';
  beginAttempt(run);
  const raw = {
    ...defaultSave(),
    rounds: 20,
    hats: ['helmet', 'party'],
    daily: { 'v5:2026-09-08': 1234, 'v6:2026-09-10': 4567 },
    run: { ...run, contentVersion: 5 },
  };
  const restored = readSave({ getItem: () => JSON.stringify(raw) });
  assert.equal(restored.run?.contentVersion, CONTENT_VERSION);
  assert.equal(restored.run?.status, 'briefing');
  assert.equal(restored.run?.mode, 'tour');
  assert.deepEqual(restored.run?.passives, raw.run.passives);
  assert.equal(restored.run?.ability, 'dynamite');
  assert.deepEqual(restored.daily, raw.daily);
  assert.deepEqual(restored.hats, raw.hats);
});

void test('the detailed verdict attributes ring points without changing old scores or recorded frames', () => {
  const first = routineRing(spin(), 75);
  const frozen = JSON.stringify(first);
  const second = routineRing(first, 120);
  assert.equal(routineRingScore(second), 195);
  assert.equal(second.technical, 295);
  assert.equal(routineScore(second), 315);
  assert.equal(JSON.stringify(first), frozen);
  const legacy = { ...second, ringPoints: undefined, technical: 250 };
  assert.equal(routineRingScore(legacy), 150);
  const settled = finishRoutine(second, {
    time: 3,
    x: 2000,
    y: 0,
    failed: false,
    interrupted: false,
  });
  assert.equal(routineRing(settled, 75), settled);
  assert.equal(routineRingScore(settled), 195);
});
