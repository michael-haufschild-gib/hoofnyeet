import test from 'node:test';
import assert from 'node:assert/strict';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import { createGame, STEP } from '../lib/game/simulation';
import {
  NUCLEAR_LIFE,
  nuclearPose,
} from '../lib/game/effects/motion/nuclear-motion';
import { defaultSave, readSave, writeSave } from '../lib/game/storage';

void test('dynamite records one nuclear origin and sound while retaining its forward explosion', async () => {
  await initPhysics();
  const s = createGame();
  Object.assign(s, { ability: 'dynamite', impactX: 2300, vx: 400, vy: 350 });
  const c = new CrashWorld(s);
  try {
    for (let i = 0; i < 120; i++) c.step(STEP);
    c.drain();
    const before = c.snapshot();
    c.action('secondary');
    c.action('secondary');
    const blast = c.snapshot();
    const cues = blast.carnage!.cues.filter((c) => c.kind === 'nuclear');
    assert.equal(cues.length, 1);
    assert.equal(cues[0].at, before.time);
    assert.ok(Math.abs(cues[0].x - before.focusX) < 0.01);
    const events = c.drain();
    assert.equal(events.filter((e) => e.sound === 'nuclear').length, 1);
    assert.ok(events.some((e) => e.sound === 'explosion'));
    assert.equal(
      events.find((e) => e.sound === 'nuclear')!.carnage!.id,
      cues[0].id,
    );
    const cue = cues[0];
    assert.equal(nuclearPose(cue, cue.at - STEP), null);
    assert.equal(nuclearPose(cue, cue.at + NUCLEAR_LIFE), null);
    assert.ok(
      nuclearPose(cue, cue.at + 1)!.height >
        nuclearPose(cue, cue.at + 0.1)!.height,
    );
    assert.equal(nuclearPose(cue, cue.at + 3.49)!.duck, 0);
    assert.ok(nuclearPose(cue, cue.at + 3.9)!.duck > 0.9);
    assert.equal(nuclearPose(cue, cue.at + 0.4, true)!.glow, 0);
    assert.equal(nuclearPose(cue, cue.at + 0.4, true)!.shock, 0);
    for (let i = 0; i < 120; i++) {
      c.step(STEP);
      assert.ok(c.snapshot().bodies.length <= 80);
    }
    assert.ok(c.snapshot().focusX > before.focusX + 100);
    assert.equal(c.snapshot().abilityReady, false);
  } finally {
    c.dispose();
  }
});

void test('first-run guidance is opt-in for fresh saves and does not interrupt existing players', () => {
  const fresh = defaultSave();
  assert.equal(fresh.controlsSeen, false);
  const existing = readSave({
    getItem: () => JSON.stringify({ ...fresh, rounds: 12 }),
  });
  assert.equal(existing.controlsSeen, true);
  let wire = '';
  writeSave(
    { ...fresh, controlsSeen: true },
    {
      setItem: (_key, value) => {
        wire = value;
      },
    },
  );
  assert.equal(readSave({ getItem: () => wire }).controlsSeen, true);
  assert.equal(
    writeSave(fresh, {
      setItem: () => {
        throw new Error('blocked');
      },
    }),
    false,
  );
});

void test('late nuclear incidents finish their recorded payoff before settlement and the survivor reaches the road', async () => {
  await initPhysics();
  const s = createGame();
  Object.assign(s, {
    ability: 'dynamite',
    landing: 'haystack',
    vx: 400,
    vy: 600,
  });
  const c = new CrashWorld(s);
  try {
    for (let i = 0; i < 1600; i++) c.step(STEP);
    c.action('secondary');
    const nuclearCues = c
      .snapshot()
      .carnage!.cues.filter((c) => c.kind === 'nuclear');
    assert.equal(nuclearCues.length, 1);
    const cue = nuclearCues[0];
    for (let tick = 0; tick < Math.floor(NUCLEAR_LIFE * 120) - 1; tick++) {
      c.step(STEP);
      assert.equal(c.snapshot().settled, false);
    }
    assert.equal(nuclearPose(cue, cue.at + 4.6)!.duckY, -19);
    assert.equal(nuclearPose({ ...cue, y: -1600 }, cue.at + 4.6)!.duckY, -19);
    let settled = false;
    for (let tick = 0; tick < 2400; tick++) {
      c.step(STEP);
      if (c.snapshot().settled) {
        settled = true;
        break;
      }
    }
    assert.equal(settled, true, 'the nuclear payoff never reached settlement');
  } finally {
    c.dispose();
  }
});

void test('the nuclear helmet enters from above the cloud and the survivor outlasts the smoke', () => {
  for (const y of [-1900, -35, 0]) {
    const cue = {
      id: 'nuclear-payoff',
      kind: 'nuclear' as const,
      at: 13,
      x: 2600,
      y,
      seed: 12,
      power: 1,
      world: 'farm' as const,
    };
    const birth = nuclearPose(cue, cue.at + 4.1)!;
    assert.ok(birth.helmetY <= y - 1599.9);
    let previousY = birth.helmetY;
    for (let tick = 1; tick <= 42; tick++) {
      const pose = nuclearPose(cue, cue.at + 4.1 + tick / 120)!;
      assert.ok(pose.helmetY >= previousY - 0.001);
      previousY = pose.helmetY;
    }
    const landed = nuclearPose(cue, cue.at + 4.45)!;
    assert.ok(Math.abs(landed.helmetY - (landed.duckY - 36)) < 0.001);
    const payoff = nuclearPose(cue, cue.at + 5.4)!;
    assert.equal(payoff.duck, 1);
    assert.ok(payoff.alpha < 0.5);
    const reduced = nuclearPose(cue, cue.at + 4.2, true)!;
    assert.equal(reduced.helmetY, reduced.duckY - 36);
  }
});
