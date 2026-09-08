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
