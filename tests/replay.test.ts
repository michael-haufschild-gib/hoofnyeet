import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../lib/game/simulation';
import { replayFrame } from '../lib/game/replay';
import type { CrashFrame } from '../lib/game/crash';

void test('slow replay interpolates motion through rotation wrap without advancing score or changing the recording', () => {
  const a = {
    ...createGame(),
    phase: 'flight' as const,
    time: 1,
    x: 100,
    y: -80,
    rotation: Math.PI * 1.95,
    style: 0,
  };
  const b = {
    ...a,
    time: 2,
    x: 200,
    y: -40,
    rotation: Math.PI * 0.05,
    style: 100,
  };
  const before = JSON.stringify([a, b]);
  const halfway = replayFrame([a, b], 1.5);
  assert.equal(halfway.x, 150);
  assert.equal(halfway.y, -60);
  assert.ok(Math.abs(Math.sin(halfway.rotation)) < 1e-8);
  assert.equal(halfway.style, 0);
  assert.equal(replayFrame([a, b], 2).style, 100);
  assert.equal(JSON.stringify([a, b]), before);
});

void test('disassembly, spawned props and phase changes occur at their recorded beat without visual morphs', () => {
  const body = {
    id: 1,
    part: 'torso',
    x: 200,
    y: -40,
    angle: 0,
    w: 100,
    h: 80,
    tint: 0xffffff,
    alpha: 1,
    boss: false,
  };
  const wreck: CrashFrame = {
    bodies: [body],
    time: 0,
    kicks: 3,
    abilityReady: true,
    abilityAge: 10,
    focusX: 200,
    focusY: -40,
    havoc: 0,
    bossHits: 0,
    caption: 'WATCH THIS',
    flash: 0,
    synergy: '',
  };
  const a = { ...createGame(), phase: 'landing' as const, time: 1, wreck };
  const b = {
    ...a,
    time: 2,
    wreck: {
      ...wreck,
      havoc: 200,
      bodies: [
        { ...body, part: 'skeletal-torso', x: 260 },
        { ...body, id: 2, part: 'helmet' },
      ],
    },
  };
  const before = replayFrame([a, b], 1.9);
  assert.equal(before.wreck?.bodies.length, 1);
  assert.equal(before.wreck?.bodies[0].part, 'torso');
  assert.equal(before.wreck?.bodies[0].x, 200);
  assert.equal(before.wreck?.havoc, 0);
  assert.equal(replayFrame([a, b], 2).wreck?.bodies.length, 2);
  assert.equal(
    replayFrame([a, { ...b, phase: 'results' }], 1.9).phase,
    'landing',
  );
});

void test('recorded hit freezes stay still while playback time advances', () => {
  const a = {
    ...createGame(),
    phase: 'flight' as const,
    x: 200,
    y: -40,
    time: 1,
    phaseTime: 2,
  };
  const b = { ...a, time: 1.1 };
  const paused = replayFrame([a, b], 1.05);
  assert.equal(paused.x, 200);
  assert.equal(paused.phaseTime, 2);
  assert.equal(replayFrame([a, b], -5), a);
  assert.equal(replayFrame([a, b], 5), b);
});

void test('recorded simulation time interpolates separately and stops throughout an impact freeze', () => {
  const a = {
    ...createGame(),
    phase: 'flight' as const,
    time: 10,
    sceneTime: 8,
  };
  const frozen = { ...a, time: 10.2 };
  const moving = { ...a, time: 10.4, sceneTime: 8.2 };
  assert.equal(replayFrame([a, frozen, moving], 10.1).sceneTime, 8);
  assert.ok(
    Math.abs(replayFrame([a, frozen, moving], 10.3).sceneTime! - 8.1) < 1e-9,
  );
  assert.equal(a.sceneTime, 8);
});

void test('outfit changes stay on their recorded frame boundary and preserve older recordings', () => {
  const before = {
    ...createGame(),
    phase: 'flight' as const,
    time: 1,
    outfit: { hat: 'space' as const, ponyId: 'buttercup' as const },
  };
  const after = {
    ...before,
    time: 2,
    outfit: { hat: 'party' as const, ponyId: 'bubblegum' as const },
  };
  const recorded = JSON.stringify([before, after]);
  assert.deepEqual(replayFrame([before, after], 1.99).outfit, before.outfit);
  assert.deepEqual(replayFrame([before, after], 2).outfit, after.outfit);
  assert.equal(JSON.stringify([before, after]), recorded);
  const legacy = { ...createGame(), phase: 'flight' as const, time: 1 };
  assert.equal(
    replayFrame([legacy, { ...legacy, time: 2 }], 1.5).outfit,
    undefined,
  );
});

void test('older event timestamps map through recorded hit freezes without changing the archive', async () => {
  const { replayEvent } = await import('../lib/game/replay');
  const a = {
    ...createGame(),
    phase: 'flight' as const,
    time: 10,
    sceneTime: 8,
  };
  const b = { ...a, time: 10.2 };
  const c = { ...b, time: 10.4, sceneTime: 8.2 };
  const old = { kind: 'land' as const, x: 10, y: -20, time: 10.1 };
  assert.equal(replayEvent(old, [a, b, c]).sceneTime, 8);
  assert.ok(
    Math.abs(replayEvent({ ...old, time: 10.3 }, [a, b, c]).sceneTime! - 8.1) <
      1e-8,
  );
  assert.equal('sceneTime' in old, false);
  const current = { ...old, sceneTime: 7.98 };
  assert.equal(replayEvent(current, [a, b, c]), current);
});

void test('clip lead-in preserves living effects through a frozen clock without replaying older or future beats', async () => {
  const { replayLeadIn } = await import('../lib/game/replay');
  const frames = [
    { ...createGame(), time: 6, sceneTime: 4 },
    { ...createGame(), time: 10, sceneTime: 6 },
    { ...createGame(), time: 10.2, sceneTime: 6 },
  ];
  const events = [
    {
      kind: 'flap' as const,
      id: 'expired',
      x: 0,
      y: 0,
      time: 6,
      sceneTime: 3.99,
    },
    {
      kind: 'flap' as const,
      id: 'living',
      x: 0,
      y: 0,
      time: 9.8,
      sceneTime: 5.99,
    },
    { kind: 'land' as const, id: 'legacy', x: 0, y: 0, time: 10.05 },
    {
      kind: 'land' as const,
      id: 'at-cut',
      x: 0,
      y: 0,
      time: 10.1,
      sceneTime: 6,
    },
    {
      kind: 'land' as const,
      id: 'future',
      x: 0,
      y: 0,
      time: 10.15,
      sceneTime: 6,
    },
  ];
  const original = JSON.stringify(events);
  const lead = replayLeadIn(events, frames, 10.1);
  assert.deepEqual(
    lead.map((event) => event.id),
    ['living', 'legacy'],
  );
  assert.equal(lead[0].sceneTime, 5.99);
  assert.equal(lead[1].sceneTime, 6);
  assert.equal(JSON.stringify(events), original);
  assert.deepEqual(replayLeadIn(events, [], 10.1), []);
});
