import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import {
  applyCrashFrame,
  createGame,
  stepGame,
  STEP,
  type LandingId,
} from '../lib/game/simulation';
import {
  CRASH_DURATION,
  queueGrabAction,
  type GrabState,
} from '../lib/game/escalation';
import { CONTENT_VERSION, WORLDS, modifiers } from '../lib/game/content';
import { defaultSave, readSave } from '../lib/game/storage';
import { newRun, beginAttempt } from '../lib/game/run';
import { replayFrame } from '../lib/game/replay';
import type { RigidBody } from '@dimforge/rapier2d-compat';

const endings: LandingId[] = [
  'haystack',
  'mud',
  'accordion',
  'cartwheel',
  'fence',
  'sheep',
  'ballet',
  'dignified',
];

void test('all eight additive finales preserve originals, finish all five beats once, and use bundled sounds', async () => {
  await initPhysics();
  for (const landing of endings)
    for (const angle of [0, 1.3, 3]) {
      const s = createGame();
      Object.assign(s, {
        landing,
        impactX: 2800,
        vx: 850,
        vy: 600,
        impactRotation: angle,
        reactive: true,
        seed: 31,
      });
      const crash = new CrashWorld(s),
        ids = new Set<string>();
      let originalPianos = 0;
      for (let tick = 0; tick < CRASH_DURATION / STEP; tick++) {
        crash.step(STEP);
        const frame = crash.snapshot();
        assert.ok(frame.bodies.length <= 80);
        assert.ok(frame.carnage!.cues.length <= 80);
        assert.ok(
          frame.bodies.every(
            (b) => Number.isFinite(b.x) && Number.isFinite(b.y),
          ),
        );
        if (tick === 1180)
          originalPianos = frame.bodies.filter(
            (b) => b.part === 'piano',
          ).length;
        for (const e of crash.drain()) {
          assert.ok(!ids.has(e.id!));
          ids.add(e.id!);
          assert.ok(existsSync(`public/audio/${e.sound}.mp3`), e.sound);
          if (e.carnage) assert.equal(e.time, e.carnage.at);
        }
      }
      const frame = crash.snapshot();
      const cues = frame.carnage!.cues.filter((c) => c.kind === 'landing');
      assert.deepEqual(
        cues.map((c) => c.stage),
        [0, 1, 2, 3, 4],
      );
      for (const [i, at] of [8, 9.1, 10.4, 11.8, 12.9].entries())
        assert.ok(Math.abs(cues[i].at - at) <= STEP + 1e-8);
      assert.equal(frame.carnage!.grab, undefined);
      if (landing === 'cartwheel') {
        assert.equal(originalPianos, 2);
        assert.equal(frame.bodies.filter((b) => b.part === 'piano').length, 3);
      }
      crash.dispose();
    }
});

void test('late kicks and spring releases extend the scored distance during the added crash time', async () => {
  await initPhysics();
  const s = createGame();
  Object.assign(s, {
    phase: 'landing',
    reactive: true,
    launched: true,
    ability: 'spring',
    landing: 'cartwheel',
    impactX: 2800,
    vx: 600,
    vy: 500,
  });
  const c = new CrashWorld(s);
  let before = 0;
  for (let i = 0; i < 1680; i++) {
    if (i === 1320) {
      before = s.distance;
      c.action('primary');
    }
    if (i === 1400) c.action('secondary');
    c.step(STEP);
    applyCrashFrame(s, c.snapshot());
  }
  assert.ok(s.distance > before + 5, `${before} -> ${s.distance}`);
  assert.equal(c.snapshot().abilityReady, false);
  const kicks = c.snapshot().kicks;
  c.action('primary');
  assert.equal(
    c.snapshot().kicks,
    kicks - 1,
    'an available kick remains usable while the wreck is moving',
  );
  c.dispose();
});

void test('real-contact grabs reserve input and execute kicks and ability once after release', async () => {
  await initPhysics();
  let captured = false;
  for (const world of ['farm', 'candy', 'office'] as const) {
    const s = createGame();
    Object.assign(s, {
      world,
      landing: 'haystack',
      impactX: 2800,
      vx: 720,
      vy: 600,
      impactRotation: 0.3,
      seed: 31,
      ability: 'honk',
      mod: modifiers([], world),
    });
    const c = new CrashWorld(s);
    for (let i = 0; i < 370; i++) {
      c.step(STEP);
      const frame = c.snapshot();
      if (!frame.carnage?.grab) continue;
      captured = true;
      const grab = frame.carnage.grab;
      const body = frame.bodies.find((b) => b.id === grab.bodyId)!;
      const prop = frame.bodies.find((b) => b.id === grab.propId)!;
      assert.ok(Math.hypot(body.x - prop.x, body.y - prop.y) < 240);
      for (let j = 0; j < 20; j++) {
        c.action('primary');
        c.action('secondary');
      }
      assert.equal(c.snapshot().kicks, frame.kicks);
      assert.equal(c.snapshot().abilityReady, true);
      assert.equal(c.snapshot().carnage!.grab!.queued.length, frame.kicks + 1);
      c.drain();
      const events = [];
      for (let j = 0; j < 240; j++) {
        c.step(STEP);
        events.push(...c.drain());
      }
      assert.equal(c.snapshot().carnage!.grab, undefined);
      assert.equal(c.snapshot().kicks, 0);
      assert.equal(c.snapshot().abilityReady, false);
      assert.equal(
        events.filter((e) => e.sound === 'kick').length,
        frame.kicks,
      );
      assert.ok(
        c
          .snapshot()
          .carnage!.cues.some(
            (c) => c.kind === 'release' && c.at <= grab.at + 1,
          ),
      );
      break;
    }
    c.dispose();
    if (captured) break;
  }
  assert.ok(captured, 'fixture must exercise an actual Rapier machine contact');
});

void test('grab reservations are bounded, preserve action order, and cannot invent resources', () => {
  const grab: GrabState = {
    bodyId: 1,
    propId: 2,
    at: 2,
    until: 2.85,
    queued: [],
  };
  for (let i = 0; i < 50; i++) {
    queueGrabAction(grab, 'secondary', 2, true);
    queueGrabAction(grab, 'primary', 2, true);
  }
  assert.deepEqual(grab.queued, ['secondary', 'primary', 'primary']);
  const empty = { ...grab, queued: [] };
  queueGrabAction(empty, 'primary', 0, false);
  queueGrabAction(empty, 'secondary', 0, false);
  assert.deepEqual(empty.queued, []);
});

void test('contact gore and full finales are deterministic across all 24 encounters', async () => {
  await initPhysics();
  for (const world of WORLDS)
    for (let disaster = 0; disaster < 4; disaster++) {
      const run = () => {
        const s = createGame();
        Object.assign(s, {
          world: world.id,
          disaster,
          landing: endings[disaster],
          mod: modifiers(['beans', 'rubber', 'magnet', 'confetti'], world.id),
          equipment: ['beans', 'rubber', 'magnet', 'confetti'],
          ability: 'dynamite',
          boss: true,
          impactX: 2800,
          vx: 720,
          vy: 650,
          impactRotation: 0.8,
          seed: 119,
        });
        const c = new CrashWorld(s);
        for (let i = 0; i < 1680; i++) {
          if (i === 220) c.action('secondary');
          if ([300, 870, 1460].includes(i)) c.action('primary');
          c.step(STEP);
          c.drain();
        }
        const result = c.snapshot();
        c.dispose();
        return result;
      };
      const a = run(),
        b = run();
      assert.deepEqual(a, b, `${world.id}/${disaster}`);
      assert.ok(a.bodies.length <= 80);
      assert.ok(a.carnage!.cues.filter((c) => c.kind === 'boss').length <= 1);
      assert.equal(
        a.carnage!.cues.filter((c) => c.kind === 'landing').length,
        5,
      );
    }
});

void test('each boss signature requires its real contact threshold and emits only one scene', async () => {
  await initPhysics();
  for (const world of WORLDS) {
    const s = createGame();
    Object.assign(s, {
      world: world.id,
      boss: true,
      vx: 720,
      vy: 550,
      impactX: 2800,
      mod: modifiers([], world.id),
    });
    const c = new CrashWorld(s);
    const pieces = (
      c as unknown as {
        pieces: Map<
          number,
          { body: RigidBody; boss: boolean; activated: boolean }
        >;
      }
    ).pieces;
    const boss = [...pieces.values()].find((p) => p.boss)!;
    const candidates = [...pieces.values()].filter((p) => !p.boss);
    const needed = 3 + world.act * 2;
    assert.equal(
      c.snapshot().carnage!.cues.filter((c) => c.kind === 'boss').length,
      0,
    );
    for (const p of candidates) {
      if (!p.body.isValid()) continue;
      const at = boss.body.translation();
      p.body.setTranslation({ x: at.x - 1.7, y: at.y }, true);
      p.body.setLinvel({ x: 18, y: 0 }, true);
      p.activated = true;
      for (let i = 0; i < 5; i++) c.step(STEP);
      const frame = c.snapshot();
      assert.equal(
        frame.carnage!.cues.filter((c) => c.kind === 'boss').length,
        frame.bossHits >= needed ? 1 : 0,
      );
    }
    assert.ok(
      c.snapshot().bossHits >= needed,
      `${world.id} must exercise the hit threshold`,
    );
    for (let i = 0; i < 200; i++) c.step(STEP);
    assert.equal(
      c.snapshot().carnage!.cues.filter((c) => c.kind === 'boss').length,
      1,
    );
    c.dispose();
  }
});

void test('landing retains replay cues, freezes during pause, and waits for physical settlement after the finale', async () => {
  await initPhysics();
  const s = createGame();
  Object.assign(s, {
    phase: 'landing',
    reactive: true,
    launched: true,
    landing: 'sheep',
    impactX: 2800,
    vx: 720,
    vy: 500,
  });
  const c = new CrashWorld(s);
  for (let i = 0; i < 1250; i++) c.step(STEP);
  s.wreck = c.snapshot();
  s.time = s.phaseTime = 10.42;
  s.sceneTime = 10.42;
  const original = structuredClone(s);
  const later = { ...structuredClone(s), time: 11, sceneTime: 10.42 };
  const replay = replayFrame([s, later], 10.8);
  assert.deepEqual(replay.wreck!.carnage, s.wreck.carnage);
  assert.deepEqual(s, original);
  s.paused = true;
  stepGame(s, STEP);
  assert.equal(s.phaseTime, 10.42);
  s.paused = false;
  s.phaseTime = 13.99;
  stepGame(s, STEP);
  assert.equal(s.phase, 'landing');
  stepGame(s, STEP);
  assert.equal(s.phase, 'landing');
  applyCrashFrame(s, { ...c.snapshot(), settled: true });
  assert.equal(s.phase, 'results');
  c.dispose();
});

void test('v4 progress and daily records survive the v5 content migration', () => {
  const run = newRun('daily', 42, false, '2026-09-08');
  beginAttempt(run);
  const source = {
    ...defaultSave(),
    best: 912,
    discoveries: ['haystack'],
    run: { ...run, contentVersion: 4 },
    daily: { 'v4:2026-09-08': 5000, 'v5:2026-09-08': 6000 },
  };
  const migrated = readSave({ getItem: () => JSON.stringify(source) });
  assert.equal(CONTENT_VERSION, 5);
  assert.equal(migrated.run?.contentVersion, 5);
  assert.equal(migrated.run?.status, 'briefing');
  assert.equal(migrated.run?.mode, 'tour');
  assert.equal(migrated.run?.seed, run.seed);
  assert.deepEqual(migrated.run?.passives, run.passives);
  assert.equal(migrated.best, 912);
  assert.deepEqual(migrated.discoveries, ['haystack']);
  assert.deepEqual(migrated.daily, source.daily);
});

void test('escaped wrecks stay free of distant machine grabs and finale cues never pull them back', async () => {
  await initPhysics();
  for (const landing of endings) {
    const s = createGame();
    Object.assign(s, {
      landing,
      world: 'farm',
      impactX: 2800,
      vx: 720,
      vy: 550,
      equipment: ['loose'],
      reactive: true,
      seed: 31,
    });
    const c = new CrashWorld(s);
    for (let i = 0; i < 31; i++) c.step(STEP);
    // Start the escaped fixture beyond the machine's reach, after the loose
    // joints have separated. From here every position is produced by Rapier.
    const body = (c as unknown as { controlled: RigidBody }).controlled;
    body.setTranslation({ x: 150, y: -40 }, true);
    body.setLinvel({ x: 12, y: -4 }, true);
    let previous = c.snapshot();
    for (let i = 31; i < 1680; i++) {
      c.step(STEP);
      const frame = c.snapshot();
      assert.equal(frame.carnage!.grab, undefined, `${landing}: remote grab`);
      assert.ok(
        Math.abs(frame.focusX - previous.focusX) < 90 &&
          Math.abs(frame.focusY - previous.focusY) < 100,
        `${landing}: scripted relocation at ${frame.time}`,
      );
      previous = frame;
      c.drain();
    }
    assert.equal(
      c.snapshot().carnage!.cues.filter((cue) => cue.kind === 'landing').length,
      5,
      'the surrounding finale still plays when the controlled part escapes',
    );
    c.dispose();
  }
});
