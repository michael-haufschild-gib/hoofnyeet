import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createGame, type LandingId } from '../lib/game/simulation';
import { CrashWorld, initPhysics } from '../lib/game/crash';

void test('eight aftermaths produce distinct props and consequences on one clock, with available sound and bounded physics', async () => {
  await initPhysics();
  const cases: [LandingId, string[]][] = [
    ['haystack', ['straightLeg', 'baler']],
    ['mud', ['rescue', 'cabinet']],
    ['accordion', ['ufo']],
    ['cartwheel', ['piano']],
    ['fence', ['torso', 'rescue']],
    ['sheep', ['sheep', 'helmet']],
    ['ballet', ['crown', 'glove']],
    ['dignified', ['crown', 'ghost-head']],
  ];
  for (const [landing, required] of cases)
    for (const angle of [0, 0.8, 2.6]) {
      const s = createGame();
      Object.assign(s, {
        landing,
        world: 'farm',
        disaster: 0,
        impactX: 2800,
        vx: 720,
        vy: 500,
        impactRotation: angle,
      });
      const crash = new CrashWorld(s);
      const arrivals: string[] = [],
        events = new Set<string>();
      let previous = new Set(crash.snapshot().bodies.map((body) => body.id));
      for (let tick = 0; tick < 1180; tick++) {
        crash.step(1 / 120);
        const frame = crash.snapshot();
        assert.ok(frame.bodies.length <= 80);
        assert.ok(
          frame.bodies.every(
            (body) => Number.isFinite(body.x) && Number.isFinite(body.y),
          ),
        );
        if (frame.time > 4.19)
          for (const body of frame.bodies)
            if (!previous.has(body.id)) arrivals.push(body.part);
        previous = new Set(frame.bodies.map((body) => body.id));
        for (const event of crash.drain()) {
          assert.ok(!events.has(event.id!));
          events.add(event.id!);
          assert.ok(
            existsSync(`public/audio/${event.sound}.mp3`),
            `missing ${event.sound}`,
          );
        }
      }
      for (const part of required) {
        // The laundry is the existing torso being pinned to a supported rope.
        if (landing === 'fence' && part === 'torso') continue;
        assert.ok(
          arrivals.includes(part),
          `${landing}/${angle} never produced ${part}`,
        );
      }
      assert.equal(
        arrivals.filter((part) => part === 'ghost-head').length,
        landing === 'dignified' ? 1 : 0,
      );
      if (landing === 'cartwheel')
        assert.equal(arrivals.filter((part) => part === 'piano').length, 2);
      if (landing === 'mud')
        assert.equal(arrivals.filter((part) => part === 'rescue').length, 1);
      crash.dispose();
    }
});

void test('ceremonial headwear stays attached through a tumble and the laundry poles reach the rope', async () => {
  await initPhysics();
  for (const landing of ['ballet', 'fence'] as const) {
    const s = createGame();
    Object.assign(s, {
      landing,
      impactX: 2800,
      vx: 720,
      vy: 500,
      impactRotation: 0.8,
    });
    const crash = new CrashWorld(s);
    for (let tick = 0; tick < 720; tick++) {
      crash.step(1 / 120);
      const frame = crash.snapshot();
      if (frame.time < 4.3) continue;
      if (landing === 'ballet') {
        const head = frame.bodies.find(
          (body) => body.part === 'offended-head',
        )!;
        const crown = frame.bodies.find((body) => body.part === 'crown')!;
        const angle = Math.atan2(
          Math.sin(head.angle - crown.angle),
          Math.cos(head.angle - crown.angle),
        );
        assert.ok(
          Math.abs(angle) < 0.15,
          `crown rotated away from head: ${angle}`,
        );
        assert.ok(
          Math.abs(Math.hypot(head.x - crown.x, head.y - crown.y) - 47) < 5,
        );
      } else {
        const poles = frame.bodies.filter(
          (body) => body.part === 'bone' && body.w > 140,
        );
        assert.equal(poles.length, 2);
        for (const pole of poles)
          assert.ok(
            pole.y - pole.w / 2 < -130,
            'laundry support must reach the rope',
          );
      }
    }
    crash.dispose();
  }
});
