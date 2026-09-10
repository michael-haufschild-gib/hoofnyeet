import test from 'node:test';
import assert from 'node:assert/strict';
import type { RigidBody } from '@dimforge/rapier2d-compat';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import {
  createGame,
  act,
  STEP,
  stepGame,
  startGame,
} from '../lib/game/simulation';
import { modifiers } from '../lib/game/content';
import {
  newRoutine,
  beginTrick,
  completeTrick,
  routineScore,
} from '../lib/game/routine';
import {
  combinationAge,
  ovationReady,
} from '../lib/game/catalogue/combinations';
import { replayFrame } from '../lib/game/replay';

interface Piece {
  body: RigidBody;
  part: string;
  horse: boolean;
  activated: boolean;
}
interface Rig {
  controlled: RigidBody;
  pieces: Map<number, Piece>;
  disassemble(): void;
  spawn(
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    horse?: boolean,
  ): Piece;
}
function scenario(equipment: string[]) {
  const s = createGame(12);
  Object.assign(s, {
    phase: 'landing',
    reactive: true,
    impactX: 3500,
    x: 3500,
    y: 0,
    vx: 480,
    vy: 300,
    equipment,
    mod: modifiers(equipment),
    seed: 91,
  });
  return s;
}
function isolate(c: CrashWorld) {
  const rig = c as unknown as Rig;
  rig.disassemble();
  for (const [index, p] of [...rig.pieces.values()].entries()) {
    p.body.setTranslation({ x: -100 - index * 3, y: -80 }, true);
    p.body.setLinvel({ x: 0, y: 0 }, true);
  }
  return rig;
}

void test('stored bean gas improves the same spring release, with one synchronized recorded cue', async () => {
  await initPhysics();
  const speeds = [];
  for (const equipment of [[], ['beans']]) {
    const c = new CrashWorld(scenario(equipment));
    try {
      const rig = isolate(c);
      rig.controlled.setTranslation({ x: 0, y: -40 }, true);
      c.drain();
      c.action('secondary');
      for (let i = 0; i < 26; i++) c.step(STEP);
      assert.equal(c.snapshot().combinations?.length, 0);
      c.step(STEP);
      const frame = c.snapshot(),
        events = c.drain();
      speeds.push(frame.velocityX!);
      assert.equal(frame.abilityReady, false);
      const cue = frame.combinations?.[0];
      assert.equal(!!cue, equipment.includes('beans'));
      if (cue) {
        assert.ok(Math.abs(cue.at - 0.22) <= STEP);
        const sound = events.find((e) => e.id === cue.id)!;
        assert.equal(sound.time, cue.at);
        assert.equal(sound.x, cue.x);
        const frozen = JSON.stringify(frame);
        for (let i = 0; i < 90; i++) {
          c.action('secondary');
          c.step(STEP);
        }
        assert.equal(c.snapshot().combinations?.length, 1);
        assert.equal(
          c.drain().filter((e) => e.sound === 'gas-spring').length,
          0,
        );
        assert.equal(JSON.stringify(frame), frozen);
      }
    } finally {
      c.dispose();
    }
  }
  assert.ok(speeds[1] >= speeds[0] + 200, JSON.stringify(speeds));
});

void test('metal contacts charge an equipped eyeball once; scenery and a missing pair never award a boost', async () => {
  await initPhysics();
  for (const [equipment, active, expected] of [
    [['eyes', 'magnet'], true, 1],
    [['eyes'], true, 0],
    [['eyes', 'magnet'], false, 0],
  ] as const) {
    const c = new CrashWorld(scenario([...equipment]));
    try {
      const rig = isolate(c);
      const eye = rig.spawn('eye', 0, -600, 32, 32, active);
      const metal = rig.spawn('helmet', 90, -600, 55, 50);
      eye.body.setLinvel({ x: 12, y: 0 }, true);
      c.drain();
      const sounds = [];
      for (let i = 0; i < 55; i++) {
        c.step(STEP);
        sounds.push(...c.drain());
      }
      const cues = c.snapshot().combinations ?? [];
      assert.equal(cues.length, expected);
      if (expected) {
        const cue = cues[0];
        assert.equal(cue.bodyId, eye.body.handle);
        assert.equal(cue.targetId, metal.body.handle);
        assert.ok(c.snapshot().velocityX! > 300);
        const matching = sounds.filter((e) => e.id === cue.id);
        assert.equal(matching.length, 1);
        assert.equal(matching[0].time, cue.at);
        eye.body.setTranslation({ x: 0, y: -15 }, true);
        metal.body.setTranslation({ x: 2, y: -15 }, true);
        eye.body.setLinvel({ x: 15, y: 0 }, true);
        for (let i = 0; i < 40; i++) c.step(STEP);
        assert.equal(c.snapshot().combinations?.length, 1);
      }
    } finally {
      c.dispose();
    }
  }
});

void test('a haunted piano restores one kick on real horse contact, including inverted and fast strikes', async () => {
  await initPhysics();
  for (const angle of [0, Math.PI, 1.4]) {
    const c = new CrashWorld(scenario(['piano', 'ghostly', 'confetti']));
    try {
      const rig = isolate(c);
      c.action('primary');
      const kicks = c.snapshot().kicks;
      const part = rig.spawn('straightLeg', 0, -600, 35, 80, true);
      part.body.setRotation(angle, true);
      const piano = rig.spawn('piano', 130, -600, 90, 90);
      piano.body.setLinvel({ x: -18, y: 0 }, true);
      c.drain();
      let soundAt = -1;
      for (let i = 0; i < 100; i++) {
        c.step(STEP);
        for (const e of c.drain())
          if (e.sound === 'haunted-encore') {
            assert.equal(soundAt, -1);
            soundAt = e.time!;
          }
      }
      const cue = c
        .snapshot()
        .combinations?.find((c) => c.kind === 'haunted-encore');
      assert.equal(
        cue?.kind,
        'haunted-encore',
        `missing physical encore at ${angle}`,
      );
      assert.equal(cue?.at, soundAt);
      assert.equal(cue?.targetId, part.body.handle);
      assert.equal(c.snapshot().kicks, kicks + 1);
      assert.ok(
        !c.snapshot().bodies.some((b) => b.id === cue?.bodyId),
        'existing confetti piano still detonates',
      );
    } finally {
      c.dispose();
    }
  }
});

void test('three varied completed tricks earn exactly one useful flap while leaving the style ledger exact', () => {
  const s = createGame();
  Object.assign(s, {
    phase: 'flight',
    equipment: ['acrobat', 'confetti'],
    mod: modifiers(['acrobat', 'confetti']),
    x: 8000,
    y: -3000,
    vx: 500,
    vy: -100,
    flaps: 1,
  });
  let r = newRoutine();
  for (const [trick, at] of [
    ['tuck', 1],
    ['layback', 2],
  ] as const) {
    r = { ...r, active: { trick, at, height: 500, linked: true } };
    r = completeTrick(r, { time: at + 0.5, x: s.x, y: s.y, base: s.mod.style });
  }
  s.routine = r;
  s.style = routineScore(r);
  assert.equal(ovationReady(s.equipment, r, [], s.flaps, s.maxFlaps), false);
  act(s, 'secondary');
  s.routine = {
    ...s.routine!,
    active: { ...s.routine!.active!, trick: 'corkscrew' },
  };
  while (s.flipActive) stepGame(s);
  assert.equal(s.flaps, 2);
  assert.equal(s.combinations?.length, 1);
  assert.equal(s.style, routineScore(s.routine!));
  assert.equal(s.events.filter((e) => e.sound === 'organ-applause').length, 1);
  for (let i = 0; i < 4; i++) {
    act(s, 'secondary');
    while (s.flipActive) stepGame(s);
  }
  assert.equal(s.flaps, 2);
  assert.equal(s.combinations?.length, 1);
  const cue = s.combinations![0];
  assert.equal(combinationAge(cue, cue.at - STEP), null);
  assert.equal(combinationAge(cue, cue.at + 3), null);
  const frame = { ...s, time: 9, sceneTime: cue.at + 0.2 };
  const footage = [frame, { ...frame, time: 10, sceneTime: cue.at + 1.2 }];
  const record = JSON.stringify(footage);
  const replay = replayFrame(footage, 9.5);
  assert.ok(Math.abs(combinationAge(cue, replay.sceneTime!)! - 0.7) < 1e-9);
  assert.equal(JSON.stringify(footage), record);
  startGame(s);
  assert.deepEqual(s.combinations, []);
});

void test('incomplete tricks, full flap capacity and unequipped pairs do not consume the ovation', () => {
  const r = { ...newRoutine(), counts: { tuck: 1, layback: 1, star: 1 } };
  assert.equal(ovationReady(['acrobat', 'confetti'], r, [], 3, 3), false);
  assert.equal(ovationReady(['acrobat'], r, [], 1, 3), false);
  const active = beginTrick(r, {
    time: 5,
    y: -400,
    vy: 0,
    flapPose: 0,
    beans: false,
  });
  assert.equal(ovationReady(['acrobat', 'confetti'], active, [], 1, 3), false);
  assert.equal(ovationReady(['acrobat', 'confetti'], r, [], 1, 3), true);
});

void test('the piano subscription enters above a high moving wreck and never replaces the landing prop', async () => {
  await initPhysics();
  const c = new CrashWorld(scenario(['piano']));
  try {
    const rig = isolate(c);
    rig.controlled.setTranslation({ x: 50, y: -60 }, true);
    rig.controlled.setLinvel({ x: 10, y: 0 }, true);
    for (let i = 0; i < 289; i++) c.step(STEP);
    const frame = c.snapshot(),
      piano = frame.bodies.find((p) => p.part === 'piano')!;
    assert.ok(piano.y + piano.h / 2 < frame.focusY - 1000);
    assert.ok(piano.x > frame.focusX);
    assert.equal(frame.aftermath, undefined);
  } finally {
    c.dispose();
  }
});
