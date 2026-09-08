import test from 'node:test';
import assert from 'node:assert/strict';
import type { RigidBody } from '@dimforge/rapier2d-compat';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import {
  applyCrashFrame,
  createGame,
  land,
  stepGame,
  STEP,
  TRACK,
} from '../lib/game/simulation';
import { modifiers, WORLDS } from '../lib/game/content';

interface Rig {
  controlled: RigidBody;
  elapsed: number;
  disassemble(): void;
  spawn(
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): { body: RigidBody };
}

function attempt() {
  const s = createGame();
  Object.assign(s, {
    reactive: true,
    launched: true,
    x: TRACK.trampoline + 2000,
    vx: 720,
    vy: 650,
    seed: 31,
    disaster: 2,
  });
  land(s);
  return s;
}

void test('a late grounded ability remains playable beyond fourteen seconds until its real landing settles', async () => {
  await initPhysics();
  for (const ability of [
    'spring',
    'blackhole',
    'dynamite',
    'honk',
    'ghost',
    'eject',
  ] as const) {
    const s = attempt();
    s.ability = ability;
    const c = new CrashWorld(s);
    const tick = () => {
      stepGame(s, STEP);
      c.step(STEP);
      applyCrashFrame(s, c.snapshot());
      c.drain();
    };
    try {
      while (c.snapshot().time < 12.5) tick();
      const rig = c as unknown as Rig;
      rig.disassemble();
      rig.controlled = rig.spawn('bone', 6000, -30, 45, 40).body;
      while (c.snapshot().time < 13.8) tick();
      assert.ok(
        Math.hypot(rig.controlled.linvel().x, rig.controlled.linvel().y) < 0.45,
        `${ability}: fixture must start at rest`,
      );
      const before = s.distance;
      c.action('secondary');
      applyCrashFrame(s, c.snapshot());
      let highest = c.snapshot().focusY;
      while (c.snapshot().time < 14.5) {
        tick();
        highest = Math.min(highest, c.snapshot().focusY);
      }
      assert.equal(
        s.phase,
        'landing',
        `${ability}: timer ended a pending launch`,
      );
      assert.equal(c.snapshot().abilityReady, false);
      // The black hole releases a full second after input.
      while (c.snapshot().time < 15.4) {
        tick();
        highest = Math.min(highest, c.snapshot().focusY);
      }
      assert.ok(highest < -70, `${ability}: the action must actually launch`);
      assert.ok(
        s.distance > before + 10,
        `${ability}: late travel was not counted ${JSON.stringify({ before, distance: s.distance, phase: s.phase, x: c.snapshot().focusX, v: rig.controlled.linvel(), type: rig.controlled.bodyType() })}`,
      );
      assert.equal(s.phase, 'landing');
      s.paused = true;
      const paused = JSON.stringify(s);
      stepGame(s, STEP);
      applyCrashFrame(s, c.snapshot());
      assert.equal(JSON.stringify(s), paused);
      s.paused = false;
      while (s.phase === 'landing' && c.snapshot().time < 45) tick();
      assert.equal(s.phase, 'results', `${ability}: never settled`);
      assert.equal(c.snapshot().settled, true);
      const final = s.distance;
      const kicks = c.snapshot().kicks;
      c.action('primary');
      assert.equal(
        c.snapshot().kicks,
        kicks,
        'finished physics cannot consume another action',
      );
      stepGame(s, STEP);
      applyCrashFrame(s, { ...c.snapshot(), focusX: s.impactX + 999999 });
      assert.equal(s.distance, final, 'finished score must remain fixed');
    } finally {
      c.dispose();
    }
  }
});

void test('an airborne body at zero speed cannot settle using detached debris as support', async () => {
  await initPhysics();
  const c = new CrashWorld(attempt());
  try {
    for (let i = 0; i < 1680; i++) c.step(STEP);
    const rig = c as unknown as Rig;
    rig.disassemble();
    rig.controlled = rig.spawn('bone', 6000, -800, 45, 40).body;
    rig.controlled.setGravityScale(0, true);
    for (let i = 0; i < 240; i++) c.step(STEP);
    assert.equal(c.snapshot().settled, false);
    rig.controlled.setGravityScale(1, true);
    rig.controlled.wakeUp();
    for (let i = 0; i < 2400 && !c.snapshot().settled; i++) c.step(STEP);
    assert.equal(
      c.snapshot().settled,
      true,
      JSON.stringify({
        at: rig.controlled.translation(),
        velocity: rig.controlled.linvel(),
        spin: rig.controlled.angvel(),
      }),
    );
  } finally {
    c.dispose();
  }
});

void test('every world and landing eventually settles after late spring and kick, including the cube standing on attached legs', async () => {
  await initPhysics();
  for (const world of WORLDS)
    for (const landing of [
      'haystack',
      'mud',
      'accordion',
      'cartwheel',
      'fence',
      'sheep',
      'ballet',
      'dignified',
    ] as const) {
      const s = attempt();
      Object.assign(s, {
        world: world.id,
        landing,
        ability: 'spring',
        equipment: ['rubber'],
        mod: modifiers(['rubber'], world.id),
      });
      const c = new CrashWorld(s);
      try {
        for (let i = 0; i < 5400 && !c.snapshot().settled; i++) {
          if (i === 1560) c.action('secondary');
          if (i === 1700) c.action('primary');
          c.step(STEP);
          c.drain();
        }
        assert.equal(
          c.snapshot().settled,
          true,
          `${world.id}/${landing} failed to settle`,
        );
        assert.ok(c.snapshot().time > 14);
      } finally {
        c.dispose();
      }
    }
});
