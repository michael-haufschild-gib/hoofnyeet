import test from 'node:test';
import assert from 'node:assert/strict';
import { CrashWorld, initPhysics, type BodyPose } from '../lib/game/crash';
import { CATASTROPHES } from '../lib/game/catastrophes';
import { drivenMechanisms } from '../lib/game/machinery';
import { WORLDS, modifiers } from '../lib/game/content';
import { artFoot, GROUND_Y } from '../lib/game/geometry';
import { createGame } from '../lib/game/simulation';

void test('kinematic hazards and bosses start on their authored path without a one-tick collision catapult', async () => {
  await initPhysics();
  for (const world of WORLDS) {
    for (let disaster = 0; disaster < 4; disaster++) {
      const spec = CATASTROPHES[world.id][disaster];
      if (!drivenMechanisms.includes(spec.mechanism)) continue;
      const s = createGame();
      Object.assign(s, {
        world: world.id,
        mod: modifiers([], world.id),
        disaster,
        boss: true,
        impactX: 2800,
        vx: 750,
        vy: 600,
        impactRotation: 0.3,
      });
      const crash = new CrashWorld(s);
      let previous = crash.snapshot().bodies;
      let trap: BodyPose | undefined;
      for (let tick = 0; tick < 450; tick++) {
        crash.step(1 / 120);
        const bodies = crash.snapshot().bodies;
        trap ??= bodies.find(
          (b) =>
            !b.boss &&
            b.part === spec.trap &&
            Math.max(b.w, b.h) > 100 &&
            !previous.some((p) => p.id === b.id),
        );
        for (const body of bodies.filter((b) => b.boss || b.id === trap?.id)) {
          const prev = previous.find((p) => p.id === body.id);
          if (prev)
            assert.ok(
              Math.hypot(body.x - prev.x, body.y - prev.y) < 4,
              `${world.id}/${spec.mechanism} teleported at tick ${tick}`,
            );
          assert.ok(
            body.y + artFoot(body.part, body.w, body.h, body.angle) <
              GROUND_Y + 0.8,
            `${spec.mechanism} cuts through the floor`,
          );
        }
        previous = bodies;
      }
      assert.ok(trap, `${world.id}/${spec.mechanism} did not enter`);
      crash.dispose();
    }
  }
});

void test('the rescue vehicle enters on the road even when the horse has been launched into the air', async () => {
  await initPhysics();
  const s = createGame();
  Object.assign(s, {
    world: 'farm',
    impactX: 2800,
    vx: 750,
    vy: 600,
    ability: 'spring',
    landing: 'mud',
  });
  const crash = new CrashWorld(s);
  for (let tick = 0; tick < 510; tick++) {
    if (tick === 380) crash.action('secondary');
    crash.step(1 / 120);
    const frame = crash.snapshot();
    const rescue = frame.bodies.find((b) => b.part === 'rescue');
    if (rescue) {
      assert.ok(frame.focusY < -100, 'exercise an airborne horse');
      assert.ok(
        Math.abs(
          rescue.y +
            artFoot(rescue.part, rescue.w, rescue.h, rescue.angle) -
            GROUND_Y,
        ) < 1,
      );
      crash.dispose();
      return;
    }
  }
  crash.dispose();
  assert.fail('rescue never arrived');
});

void test('the articulated horse transfers impact without joint correction launching it into the sky', async () => {
  await initPhysics();
  for (const angle of [0, 0.1, 1.3, 2.1, Math.PI]) {
    const s = createGame();
    Object.assign(s, {
      world: 'farm',
      disaster: 3,
      impactX: 2800,
      vx: 720,
      vy: 630,
      impactRotation: angle,
      landing: 'haystack',
    });
    const crash = new CrashWorld(s);
    for (let tick = 0; tick < 60; tick++) {
      crash.step(1 / 120);
      assert.ok(
        crash.snapshot().focusY > -260,
        `joint solver catapulted the horse at rotation ${angle}`,
      );
    }
    crash.dispose();
  }
});

void test('all catastrophe arrivals fire exactly once even when another beat has the same timestamp', async () => {
  await initPhysics();
  for (const world of WORLDS) {
    for (let disaster = 0; disaster < 4; disaster++) {
      const spec = CATASTROPHES[world.id][disaster];
      const s = createGame();
      Object.assign(s, {
        world: world.id,
        disaster,
        mod: modifiers([], world.id),
        impactX: 2800,
        vx: 450,
        vy: 400,
      });
      const crash = new CrashWorld(s);
      const arrivals = new Set<number>();
      let previous = new Set(crash.snapshot().bodies.map((b) => b.id));
      for (let tick = 0; tick < Math.ceil((spec.beat + 0.4) * 120); tick++) {
        crash.step(1 / 120);
        const bodies = crash.snapshot().bodies;
        for (const body of bodies)
          if (
            !previous.has(body.id) &&
            body.part === spec.trap &&
            Math.max(body.w, body.h) > 150
          )
            arrivals.add(body.id);
        previous = new Set(bodies.map((b) => b.id));
      }
      assert.equal(
        arrivals.size,
        1,
        `${world.id}/${disaster} arrival was skipped or duplicated`,
      );
      crash.dispose();
    }
  }
});
