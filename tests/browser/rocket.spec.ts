import { test, expect } from './fixtures';
import type { Container, Sprite } from 'pixi.js';
import type { GameState } from '../../lib/game/simulation';
import type { RocketExhaust } from '../../lib/game/effects/rocket-exhaust';

test('twin rocket flames remain on their painted nozzles through launch, squash and a complete roll', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      rigPath = '/lib/game/art/rocket-rig.ts';
    const { createGame } = await import(simPath),
      { ROCKET_ART } = await import(rigPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const scene = r as unknown as {
      pony: Container;
      gear: Record<string, Sprite>;
      perkEffects: { exhaust: RocketExhaust };
    };
    const exhaust = scene.perkEffects.exhaust;
    const captures: { id: string; url: string }[] = [];
    let maxDrift = 0,
      maxAspectError = 0,
      maxDirectionError = 0;
    const capture = () => r.canvas.toDataURL('image/webp', 0.9);
    const state = createGame() as GameState;
    Object.assign(state, {
      phase: 'flight',
      phaseTime: 1,
      x: 2450,
      y: -220,
      vx: 650,
      vy: -20,
      launched: true,
      equipment: ['rocket'],
      time: 5,
      sceneTime: 5,
    });
    for (const phase of ['runup', 'compression', 'flight'] as const) {
      const count = phase === 'flight' ? 12 : 3;
      for (let i = 0; i < count; i++) {
        Object.assign(state, {
          phase,
          phaseTime: phase === 'compression' ? i * 0.24 : 1,
          y: phase === 'flight' ? -220 : 0,
          rotation: phase === 'flight' ? (i * Math.PI) / 6 : 0,
          flapPose: phase === 'flight' ? 0.3 : 0,
          flipActive: phase === 'flight',
          flipProgress: i / 12,
        });
        r.reset();
        r.draw(state, 0, 5);
        const pack = scene.gear.jetpack;
        maxAspectError = Math.max(
          maxAspectError,
          Math.abs(pack.scale.x - pack.scale.y),
        );
        if (phase === 'flight') {
          for (let n = 0; n < 2; n++) {
            const lip = ROCKET_ART.nozzles[n],
              plume = exhaust.flames[n];
            const nozzle = pack.toGlobal({
              x: (lip.x - pack.anchor.x) * pack.texture.width,
              y: (lip.y - pack.anchor.y) * pack.texture.height,
            });
            const root = plume.toGlobal({ x: 0, y: 0 }),
              tip = plume.toGlobal({ x: 1, y: 0 });
            maxDrift = Math.max(
              maxDrift,
              Math.hypot(root.x - nozzle.x, root.y - nozzle.y),
            );
            const a = scene.pony.toLocal(root),
              b = scene.pony.toLocal(tip);
            maxDirectionError = Math.max(
              maxDirectionError,
              Math.abs(
                Math.atan2(b.y - a.y, b.x - a.x) -
                  (ROCKET_ART.axis + pack.rotation),
              ),
            );
            if (!plume.visible || !exhaust.view.visible)
              throw new Error('Rocket flame missing');
          }
        } else if (exhaust.view.visible)
          throw new Error('Rocket fires before launch');
        if (phase !== 'flight' || i % 3 === 0)
          captures.push({ id: `${phase}-${i}`, url: capture() });
      }
    }
    Object.assign(state, {
      rotation: -0.16,
      flipActive: false,
      phaseTime: 2,
      flapPose: 0,
    });
    r.reset();
    r.draw(state, 0, 5);
    const live = capture();
    r.draw(state, 0.5, 5);
    const frozen = live === capture();
    for (const flame of exhaust.flames) flame.visible = false;
    r.app.render();
    const shaderVisible = live !== capture();
    r.reset();
    r.draw({ ...state, time: 90, sceneTime: 5 }, 0, 90);
    const replay = live === capture();
    r.reduced = true;
    r.reset();
    r.draw(state, 0, 5);
    const reduced =
      exhaust.view.visible && exhaust.flames.every((f) => !f.visible);
    captures.push({ id: 'reduced', url: capture() });
    r.reduced = false;
    exhaust.update(scene.pony, scene.gear.jetpack, 5, true, false, 0.35);
    const budget =
      exhaust.view.visible && exhaust.flames.every((f) => !f.visible);
    r.reset();
    const cleared = !exhaust.view.visible;
    return {
      maxDrift,
      maxAspectError,
      maxDirectionError,
      frozen,
      shaderVisible,
      replay,
      reduced,
      budget,
      cleared,
      captures,
    };
  });
  expect(proof.maxDrift).toBeLessThan(0.0001);
  expect(proof.maxAspectError).toBeLessThan(0.0001);
  expect(proof.maxDirectionError).toBeLessThan(0.0001);
  for (const key of [
    'frozen',
    'shaderVisible',
    'replay',
    'reduced',
    'budget',
    'cleared',
  ] as const)
    expect(proof[key], key).toBe(true);
  for (const shot of proof.captures)
    await info.attach(`${info.project.name}-rocket-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(errors).toEqual([]);
});
