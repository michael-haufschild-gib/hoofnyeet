import test from 'node:test';
import assert from 'node:assert/strict';
import type { RigidBody } from '@dimforge/rapier2d-compat';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import { createGame, STEP } from '../lib/game/simulation';
import { modifiers } from '../lib/game/content';

interface Rig {
  controlled: RigidBody;
  disassemble(): void;
  burst(x: number, y: number, power: number): void;
  spawn(
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): { body: RigidBody };
}

void test('centred and opposing explosions propel the player forward while loose scenery still scatters radially', async () => {
  await initPhysics();
  const c = new CrashWorld(createGame());
  try {
    const rig = c as unknown as Rig;
    rig.disassemble();
    rig.controlled.setTranslation({ x: 0, y: -20 }, true);
    rig.controlled.setLinvel({ x: 0, y: 0 }, true);
    const left = rig.spawn('bone', -160, -800, 40, 40).body;
    const right = rig.spawn('bone', 160, -800, 40, 40).body;
    let speed = 0;
    for (const origin of [0, 120, -120, 120, -120]) {
      rig.burst(origin, -800, 15);
      const v = rig.controlled.linvel();
      assert.ok(
        v.x > 5 && v.x >= speed,
        `opposed blast cancelled forward motion: ${speed} -> ${v.x}`,
      );
      assert.ok(v.x <= 32 && v.y >= -16 && v.y < 0);
      speed = v.x;
    }
    assert.ok(left.linvel().x < 0 && right.linvel().x > 0);
    const start = c.snapshot().focusX;
    for (let i = 0; i < 60; i++) c.step(STEP);
    assert.ok(
      c.snapshot().focusX > start + 150,
      'the forward velocity must produce real travel',
    );
  } finally {
    c.dispose();
  }
});

void test('kicks remain effective on heavy possessed props and their collision recovery expires', async () => {
  await initPhysics();
  for (const part of ['bone', 'cabinet', 'baler']) {
    const c = new CrashWorld(createGame());
    try {
      const rig = c as unknown as Rig;
      rig.disassemble();
      rig.controlled = rig.spawn(part, 0, -4000, 170, 170).body;
      rig.controlled.setLinvel({ x: -6, y: 0 }, true);
      c.action('primary');
      assert.ok(rig.controlled.linvel().x >= 8, `${part} swallowed the kick`);
      assert.equal(c.snapshot().kicks, 2);
      // A neighbouring impact in the same pile-up cannot erase that action.
      rig.controlled.setLinvel({ x: -8, y: 0 }, true);
      c.step(STEP);
      assert.ok(rig.controlled.linvel().x > 0);
      for (let i = 0; i < 90; i++) c.step(STEP);
      rig.controlled.setLinvel({ x: -5, y: 0 }, true);
      c.step(STEP);
      assert.ok(
        rig.controlled.linvel().x < 0,
        'recovery must expire, not become an automatic conveyor',
      );
      assert.equal(c.snapshot().kicks, 2);
      assert.equal(c.drain().filter((e) => e.sound === 'kick').length, 1);
    } finally {
      c.dispose();
    }
  }
});

void test('all six abilities keep a dense explosive incident moving with bounded controlled velocity and a real floor', async () => {
  await initPhysics();
  for (const ability of [
    'dynamite',
    'blackhole',
    'spring',
    'honk',
    'eject',
    'ghost',
  ] as const) {
    const s = createGame();
    const equipment = ['confetti', 'aftershock', 'magnet', 'rubber'];
    Object.assign(s, {
      world: 'farm',
      disaster: 2,
      landing: 'accordion',
      impactX: 2800,
      vx: 720,
      vy: 650,
      seed: 31,
      ability,
      equipment,
      mod: modifiers(equipment, 'farm'),
    });
    const c = new CrashWorld(s);
    try {
      let start = 0,
        finish = 0;
      for (let i = 0; i < 1680; i++) {
        if (i === 150) c.action('secondary');
        if ([300, 650, 1000].includes(i)) c.action('primary');
        c.step(STEP);
        const frame = c.snapshot();
        if (i === 600) start = frame.focusX;
        if (i === 1200) finish = frame.focusX;
        assert.ok(frame.bodies.length <= 80);
        assert.ok(
          Number.isFinite(frame.focusX) && frame.focusY < 200,
          `${ability} fell off the crash floor`,
        );
        c.drain();
      }
      assert.ok(
        finish > start + 500,
        `${ability} stalled during late kicks: ${start} -> ${finish}`,
      );
      assert.equal(c.snapshot().kicks, 0);
      assert.equal(c.snapshot().abilityReady, false);
    } finally {
      c.dispose();
    }
  }
});

void test('a distant portal cannot reset an escaped player to the original crash site', async () => {
  await initPhysics();
  for (const [world, disaster, arrival] of [
    ['moon', 1, 1.6],
    ['afterlife', 2, 1.7],
  ] as const) {
    const s = createGame();
    Object.assign(s, {
      world,
      disaster,
      mod: modifiers([], world),
      vx: 600,
      vy: 500,
    });
    const c = new CrashWorld(s);
    try {
      for (let i = 0; i < (arrival + 0.5) * 120; i++) c.step(STEP);
      const body = (c as unknown as Rig).controlled;
      body.setTranslation({ x: 100, y: -20 }, true);
      body.setLinvel({ x: 10, y: 0 }, true);
      const start = c.snapshot().focusX;
      for (let i = 0; i < 30; i++) c.step(STEP);
      assert.ok(
        c.snapshot().focusX > start,
        `${world} portal pulled the player back`,
      );
    } finally {
      c.dispose();
    }
  }
});

void test('magnetic debris cannot become a perpetual lift engine after the finale', async () => {
  await initPhysics();
  const { land } = await import('../lib/game/simulation');
  for (const offset of [0, 0.03, 0.08]) {
    const s = createGame();
    const equipment = ['confetti', 'aftershock', 'magnet', 'rubber'];
    Object.assign(s, {
      reactive: true,
      phase: 'flight',
      world: 'farm',
      disaster: 2,
      launched: true,
      x: 3120,
      vx: 720,
      vy: 650,
      seed: 31,
      ability: 'dynamite',
      equipment,
      mod: modifiers(equipment, 'farm'),
    });
    land(s);
    s.landing = 'accordion';
    const c = new CrashWorld(s);
    try {
      let done = false;
      for (let tick = 0; tick < 5400; tick++) {
        if (tick === Math.round((1.3 + offset) * 120)) c.action('secondary');
        if (
          [2.6, 5.6, 9.2].some((at) => tick === Math.round((at + offset) * 120))
        )
          c.action('primary');
        c.step(STEP);
        c.drain();
        const f = c.snapshot();
        assert.ok(f.focusY > -4000, `unbounded magnetic ascent at ${f.time}`);
        if (f.settled) {
          done = true;
          break;
        }
      }
      assert.ok(done, `dense magnet scenario never settled, offset ${offset}`);
    } finally {
      c.dispose();
    }
  }
});
