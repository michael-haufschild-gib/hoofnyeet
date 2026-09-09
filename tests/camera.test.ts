import test from 'node:test';
import assert from 'node:assert/strict';
import { frameGame, type CameraFrame } from '../lib/game/camera';
import { createGame } from '../lib/game/simulation';

void test('the horse and landing plane stay visible throughout ascent, flaps, descent and resizing', () => {
  for (const [width, height] of [
    [1200, 530],
    [1350, 710],
    [962, 458],
    [370, 680],
    [860, 295],
  ]) {
    const s = createGame();
    s.phase = 'runup';
    let previous: CameraFrame | null = null;
    for (let i = 0; i < 600; i++) {
      s.phase = i < 20 ? 'runup' : 'flight';
      s.y = -Math.sin((Math.max(0, i - 20) / 580) * Math.PI) * 1900;
      s.vy = i < 320 ? -900 : 800;
      s.x += 6;
      previous = frameGame(s, width, height, previous, 1 / 60);
      const actualGround = height * 0.58 + (0 - previous.y) * previous.zoom;
      const ponyTop = height * 0.58 + (s.y - 120 - previous.y) * previous.zoom;
      assert.ok(actualGround < height - 35 && actualGround > height * 0.65);
      assert.ok(ponyTop >= previous.safeTop - 0.01);
      assert.ok(Number.isFinite(previous.zoom) && previous.zoom > 0);
    }
    const resized = frameGame(s, 860, 240, previous, 1 / 60);
    assert.ok(resized.subjectTop >= resized.safeTop - 0.01);
    assert.ok(resized.ground < 240 - 35);
  }
});

void test('control handoffs stay in frame immediately on desktop and portrait', () => {
  for (const [width, height] of [
    [1200, 530],
    [370, 680],
  ]) {
    const s = createGame();
    s.phase = 'flight';
    s.x = 0;
    let previous = frameGame(s, width, height, null, 1 / 60);
    for (const x of [2400, -1800, 5300]) {
      s.x = x;
      previous = frameGame(s, width, height, previous, 1 / 120);
      const screenX = width / 2 + (x - previous.x) * previous.zoom;
      assert.ok(screenX >= 54.9 && screenX <= width - 54.9);
    }
  }
});

void test('portrait incidents get a close view and possessed props remain fully visible through handoffs', async () => {
  const { CrashWorld, initPhysics } = await import('../lib/game/crash');
  await initPhysics();
  const s = createGame();
  s.phase = 'landing';
  const crash = new CrashWorld(s);
  s.wreck = crash.snapshot();
  let previous = frameGame(s, 720, 1160, null, 1 / 60);
  assert.ok(
    previous.zoom > 2.5,
    'portrait export should show an expressive close view',
  );
  for (const [w, h] of [
    [720, 1160],
    [375, 440],
  ]) {
    for (const angle of [0, 0.8, 1.7]) {
      const focus = s.wreck.bodies[0];
      Object.assign(focus, { x: 5000, y: -100, w: 250, h: 180, angle });
      Object.assign(s.wreck, {
        focusId: focus.id,
        focusX: focus.x,
        focusY: focus.y,
      });
      const frame = frameGame(s, w, h, previous, 1 / 120);
      const radius =
        (Math.abs(Math.cos(angle)) * focus.w +
          Math.abs(Math.sin(angle)) * focus.h) /
        2;
      const center = w / 2 + (focus.x - frame.x) * frame.zoom;
      assert.ok(center - radius * frame.zoom >= 17.9);
      assert.ok(center + radius * frame.zoom <= w - 17.9);
      assert.ok(frame.subjectTop >= frame.safeTop - 0.01);
      assert.ok(frame.ground < h - 35);
      previous = frame;
    }
  }
  crash.dispose();
});

void test('measured hats and wings fit the title and flight framing across resizes', () => {
  const s = createGame();
  for (const [width, height] of [
    [1384, 932],
    [374, 760],
    [860, 270],
  ]) {
    for (const rig of [
      { left: -88, right: 116, top: -154 },
      { left: -144, right: 110, top: -192 },
      { left: -170, right: 156, top: -142 },
    ]) {
      s.phase = 'title';
      const title = frameGame(s, width, height, null, 0, false, 0, 0, 120, rig);
      const center = width / 2 + (180 - title.x) * title.zoom;
      assert.ok(center + rig.left * title.zoom >= 19.9);
      assert.ok(center + rig.right * title.zoom <= width - 19.9);
      assert.ok(title.ground + rig.top * title.zoom >= -0.01);
      s.phase = 'flight';
      s.x = 3000;
      s.y = -400;
      const frame = frameGame(
        s,
        width,
        height,
        title,
        1 / 120,
        false,
        0,
        80,
        120,
        rig,
      );
      const x = width / 2 + (s.x - frame.x) * frame.zoom;
      assert.ok(x + rig.left * frame.zoom >= 17.9);
      assert.ok(x + rig.right * frame.zoom <= width - 17.9);
      assert.ok(frame.ground + (s.y + rig.top) * frame.zoom >= 79.9);
    }
  }
});

void test('incoming and departing punchlines cannot cut the lens while late rebounds stay framed', async () => {
  const { CrashWorld, initPhysics } = await import('../lib/game/crash');
  await initPhysics();
  for (const [width, height] of [
    [1280, 650],
    [390, 630],
    [915, 330],
  ]) {
    for (const reduced of [false, true]) {
      const s = createGame();
      s.phase = 'landing';
      const crash = new CrashWorld(s);
      s.wreck = crash.snapshot();
      const focus = s.wreck.bodies.find((b) => b.id === s.wreck!.focusId)!;
      focus.y = -60;
      s.wreck.focusY = -60;
      let previous = frameGame(s, width, height, null, 1 / 60, reduced);
      for (let tick = 0; tick < 300; tick++) {
        if (tick === 30) {
          s.wreck.bodies.push({
            ...focus,
            id: 99,
            part: 'piano',
            x: s.wreck.focusX + 90,
            y: -360,
            w: 190,
            h: 180,
          });
          s.wreck.aftermath = {
            id: 'cartwheel',
            propId: 99,
            anchorX: s.wreck.focusX,
            active: true,
          };
        }
        if (tick === 140) s.wreck.bodies.pop();
        const next = frameGame(s, width, height, previous, 1 / 60, reduced);
        assert.ok(
          Math.abs(next.zoom / previous.zoom - 1) < 0.031,
          `lens cut ${width}/${tick}`,
        );
        assert.ok(next.subjectTop >= next.safeTop - 0.01);
        previous = next;
      }
      crash.dispose();
    }
  }
});

void test('late ejection and possession keep the lens continuous with hats and short screens', async () => {
  const { CrashWorld, initPhysics } = await import('../lib/game/crash');
  const { modifiers } = await import('../lib/game/content');
  await initPhysics();
  for (const [world, landing, ability] of [
    ['moon', 'fence', 'eject'],
    ['afterlife', 'accordion', 'ghost'],
    ['farm', 'cartwheel', 'eject'],
  ] as const)
    for (const [width, height, stride, reduced] of [
      [390, 650, 2, false],
      [1280, 650, 4, false],
      [915, 295, 2, true],
    ] as const)
      for (const headroom of [120, 175]) {
        const s = createGame(),
          equipment = ['magnet', 'confetti', 'rubber', 'aftershock'];
        Object.assign(s, {
          phase: 'landing',
          world,
          landing,
          ability,
          equipment,
          mod: modifiers(equipment, world),
          impactX: 2800,
          x: 2800,
          vx: 720,
          vy: 600,
          seed: 31,
          disaster: 2,
        });
        const crash = new CrashWorld(s);
        let previous: CameraFrame | null = null;
        try {
          for (let tick = 0; tick < 1800; tick++) {
            if ([400, 950, 1520].includes(tick)) crash.action('primary');
            if (tick === 1560) crash.action('secondary');
            crash.step(1 / 120);
            s.wreck = crash.snapshot();
            s.time = s.wreck.time;
            crash.drain();
            if (tick % stride) continue;
            const dt = stride / 120;
            const next = frameGame(
              s,
              width,
              height,
              previous,
              dt,
              reduced,
              0,
              undefined,
              headroom,
            );
            if (previous)
              assert.ok(
                Math.abs(Math.log(next.zoom / previous.zoom)) / dt < 1.81,
                `${world}/${landing}/${ability} ${width}x${height} headroom=${headroom}: lens cut at ${s.time.toFixed(3)}s`,
              );
            assert.ok(next.subjectTop >= next.safeTop - 0.01);
            assert.ok(next.ground <= height - 35);
            previous = next;
          }
        } finally {
          crash.dispose();
        }
      }
});
