import test from 'node:test';
import assert from 'node:assert/strict';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import { createGame } from '../lib/game/simulation';
import { modifiers } from '../lib/game/content';

const scenario = (equipment: string[] = [], disaster = 2) => {
  const s = createGame();
  Object.assign(s, {
    world: 'farm',
    disaster,
    vx: 720,
    vy: 550,
    equipment,
    mod: modifiers(equipment, 'farm'),
  });
  return s;
};

void test('a TNT impact consumes the boxes in a bounded, single-award chain reaction', async () => {
  await initPhysics();
  const c = new CrashWorld(scenario());
  try {
    const boxes = c.snapshot().bodies.filter((b) => b.part === 'tnt');
    assert.equal(boxes.length, 7);
    const blasts = [];
    for (let i = 0; i < 120; i++) {
      c.step(1 / 120);
      blasts.push(...c.drain().filter((e) => e.sound === 'explosion'));
    }
    assert.equal(c.snapshot().bodies.filter((b) => b.part === 'tnt').length, 0);
    assert.equal(blasts.length, boxes.length);
    assert.equal(new Set(blasts.map((e) => e.id)).size, boxes.length);
    assert.ok(c.snapshot().havoc >= boxes.length * 60);
    const count = blasts.length;
    for (let i = 0; i < 20; i++) {
      c.step(1 / 120);
      blasts.push(...c.drain().filter((e) => e.sound === 'explosion'));
    }
    assert.equal(
      blasts.length,
      count,
      'consumed explosives cannot detonate twice',
    );
  } finally {
    c.dispose();
  }
});

void test('scenery settling under its own weight produces no havoc and no explosion sound', async () => {
  await initPhysics();
  const s = scenario();
  s.vx = s.vy = 0;
  const c = new CrashWorld(s);
  try {
    for (let i = 0; i < 25; i++) c.step(1 / 120);
    assert.equal(c.snapshot().havoc, 0);
    assert.equal(c.drain().filter((e) => e.sound === 'explosion').length, 0);
  } finally {
    c.dispose();
  }
});

void test('Dynamite Diaper detonates once and ignites nearby explosive props', async () => {
  await initPhysics();
  const s = scenario();
  s.ability = 'dynamite';
  const c = new CrashWorld(s);
  try {
    c.action('secondary');
    assert.equal(c.snapshot().abilityReady, false);
    assert.equal(c.drain().filter((e) => e.sound === 'explosion').length, 1);
    c.action('secondary');
    assert.equal(c.drain().length, 0);
    for (let i = 0; i < 90; i++) c.step(1 / 120);
    assert.equal(c.snapshot().bodies.filter((b) => b.part === 'tnt').length, 0);
    assert.equal(c.drain().filter((e) => e.sound === 'explosion').length, 7);
  } finally {
    c.dispose();
  }
});

for (const relic of ['confetti', 'aftershock']) {
  void test(`${relic} explodes at the moving wreck, with the promised timing`, async () => {
    await initPhysics();
    const c = new CrashWorld(scenario([relic], 0));
    try {
      const blasts = [];
      for (let i = 0; i < 300; i++) {
        c.step(1 / 120);
        for (const event of c.drain())
          if (event.sound === 'explosion') {
            blasts.push(event);
            assert.ok(
              Math.abs(event.x - c.snapshot().focusX) < 30,
              'the blast must follow the wreck rather than the original impact location',
            );
          }
      }
      assert.equal(blasts.length, 1);
      if (relic === 'aftershock')
        assert.ok(Math.abs(blasts[0].time! - 2) <= 1 / 120 + 1e-6);
      else assert.ok(blasts[0].time! <= 1.12);
    } finally {
      c.dispose();
    }
  });
}

void test('a possessed TNT box hands control back safely when it explodes', async () => {
  await initPhysics();
  const s = scenario();
  s.ability = 'ghost';
  const c = new CrashWorld(s);
  try {
    c.action('secondary');
    const possessed = c.snapshot();
    const id = possessed.focusId;
    assert.equal(possessed.bodies.find((b) => b.id === id)?.part, 'tnt');
    for (let i = 0; i < 1200; i++) {
      if (i % 100 === 0) c.action('primary');
      c.step(1 / 120);
      const frame = c.snapshot();
      assert.ok(frame.bodies.some((b) => b.id === frame.focusId));
      assert.ok(Number.isFinite(frame.focusX) && Number.isFinite(frame.focusY));
    }
    assert.ok(!c.snapshot().bodies.some((b) => b.id === id));
    assert.ok(c.drain().some((e) => e.sound === 'explosion'));
  } finally {
    c.dispose();
  }
});
