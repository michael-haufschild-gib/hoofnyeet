import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS, modifiers } from '../lib/game/content';
import { frameGame } from '../lib/game/camera';
import {
  act,
  createGame,
  inJetstream,
  PHYSICS,
  RINGS,
  STEP,
  stepGame,
  TRACK,
} from '../lib/game/simulation';

void test('the jetstream awards entry once, consumes lift, and releases the pony under gravity', () => {
  const s = createGame();
  Object.assign(s, {
    phase: 'flight',
    x: 10000,
    y: PHYSICS.jetstreamAltitude + 0.1,
    vy: -100,
    vx: 600,
  });
  stepGame(s);
  assert.ok(inJetstream(s));
  assert.equal(s.y, PHYSICS.jetstreamAltitude);
  assert.ok(Math.abs(s.vx - (600 * Math.exp(-0.018 * STEP) + 45)) < 1e-9);
  const firstEntry = s.events.filter((e) => e.kind === 'glide');
  assert.equal(firstEntry.length, 1);
  assert.equal(firstEntry[0].sound, 'wind');
  const speed = s.vx;
  for (let i = 0; i < 240; i++) stepGame(s);
  assert.equal(s.events.filter((e) => e.kind === 'glide').length, 1);
  assert.equal(inJetstream(s), false);
  assert.ok(s.y > PHYSICS.jetstreamAltitude);
  assert.ok(s.vy > 0 && s.vx < speed);
  // Re-entering after a deliberate late flap can earn another entry boost.
  s.y = PHYSICS.jetstreamAltitude + 0.1;
  s.vy = 10;
  act(s, 'primary');
  stepGame(s);
  assert.equal(s.flaps, 2);
  assert.equal(s.events.filter((e) => e.kind === 'glide').length, 2);
  assert.equal(s.style, 0);
});

void test('flaps extend the flight without escaping the visible lane in every world', () => {
  for (const world of WORLDS) {
    for (const equipment of [[], ['wings', 'feather', 'beans', 'tailwind']]) {
      const flights = [false, true].map((flap) => {
        const s = createGame();
        s.mod = modifiers(equipment, world.id);
        Object.assign(s, {
          phase: 'compression',
          phaseTime: TRACK.compressionTime - STEP,
          world: world.id,
          equipment,
          x: TRACK.trampoline,
          speed: PHYSICS.maxSpeed,
          quality: 1,
          flaps: s.mod.maxFlaps,
          maxFlaps: s.mod.maxFlaps,
        });
        stepGame(s);
        let flightTime = 0;
        while (s.phase === 'flight' && flightTime < 25) {
          if (flap && s.flaps && !s.flapCooldown) act(s, 'primary');
          stepGame(s);
          flightTime += STEP;
          assert.ok(s.y >= PHYSICS.jetstreamAltitude);
          for (const [width, height, bottomInset, topInset, minimumPony] of [
            [1204, 534, 44, 148, 80],
            [370, 600, 60, 174, 65],
            [895, 324, 38, 72, 48],
          ]) {
            const frame = frameGame(
              s,
              width,
              height,
              null,
              STEP,
              false,
              bottomInset,
              topInset,
            );
            assert.ok(
              frame.zoom * 150 >= minimumPony,
              `${world.id} ${equipment.join(',')}: ${frame.zoom * 150}px at ${width}x${height}`,
            );
            assert.ok(frame.ground <= height - bottomInset - 32);
            assert.ok(frame.subjectTop >= topInset - 0.01);
          }
        }
        assert.equal(s.phase, 'landing');
        const distance = s.distance;
        for (let i = 0; i < 180; i++) stepGame(s);
        assert.equal(s.distance, distance);
        return { flightTime, distance };
      });
      assert.ok(flights[1].flightTime > flights[0].flightTime, world.id);
      assert.ok(flights[1].distance > flights[0].distance, world.id);
    }
  }
});

void test('each ring rewards actual contact once and a near miss earns nothing', () => {
  for (let index = 0; index < RINGS.length; index++) {
    const ring = RINGS[index];
    const s = createGame();
    Object.assign(s, {
      phase: 'flight',
      x: ring.x,
      y: ring.y + 94,
      vx: 0,
      vy: 0,
    });
    stepGame(s);
    assert.equal(s.style, 0);
    s.y = ring.y + 70;
    stepGame(s);
    assert.deepEqual(s.rings, [index]);
    assert.equal(s.style, 75);
    assert.equal(s.events.filter((e) => e.kind === 'ring').length, 1);
    for (let i = 0; i < 20; i++) stepGame(s);
    assert.equal(s.style, 75);
    assert.equal(s.events.filter((e) => e.kind === 'ring').length, 1);
  }
});
