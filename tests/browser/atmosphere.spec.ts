import { test, expect } from './fixtures';
import { writeFile } from 'node:fs/promises';
import type { WorldAtmosphere } from '../../lib/game/effects/shaders/world-atmosphere';
import type { WebGLRenderer } from 'pixi.js';

test('six world atmospheres preserve painted scenes, freeze with footage and recover their native shader', async ({
  page,
}, info) => {
  test.setTimeout(80000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    const simPath = '/lib/game/simulation.ts';
    const { createGame } = await import(simPath);
    const s = createGame();
    Object.assign(s, {
      phase: 'flight',
      launched: true,
      x: 3200,
      y: -210,
      vx: 480,
      vy: 20,
      time: 10,
      sceneTime: 10,
    });
    const atmosphere = (r as unknown as { atmosphere: WorldAtmosphere })
      .atmosphere;
    const shots = [];
    // Extracting this mesh alone ignores its root scale and produces one pixel.
    // Render the actual stage with its scene transforms and native resolution.
    const layer = () => {
      r.app.render();
      return r.canvas.toDataURL();
    };
    for (const world of [
      'farm',
      'candy',
      'carnival',
      'office',
      'moon',
      'afterlife',
    ] as const) {
      await r.prepareLevel(world, 'buttercup');
      s.world = world;
      r.reduced = false;
      r.reset();
      r.draw(s, 0, 10);
      const picture = r.canvas.toDataURL();
      const first = layer();
      r.draw(s, 1, 400);
      const frozen = picture === r.canvas.toDataURL();
      atmosphere.update(world, 13, r.w, r.framing!.ground, r.cameraX, false, 1);
      const animated = first !== layer();
      atmosphere.update(world, 10, r.w, r.framing!.ground, r.cameraX, true, 1);
      const still = layer();
      atmosphere.update(world, 100, r.w, r.framing!.ground, r.cameraX, true, 1);
      const reduced = still === layer();
      atmosphere.update(
        world,
        10,
        r.w,
        r.framing!.ground,
        r.cameraX,
        false,
        0.35,
      );
      const budget = !atmosphere.view.visible;
      r.draw(s, 0, 10);
      shots.push({ world, picture, frozen, animated, reduced, budget });
    }
    const before = r.canvas.toDataURL();
    window.__routineFrame = s;
    const gl = (r.app.renderer as WebGLRenderer).gl;
    const extension = gl.getExtension('WEBGL_lose_context');
    window.__contextLoss = extension!;
    return { shots, before, canLose: !!extension, glError: gl.getError() };
  });
  for (const row of report.shots) {
    expect(row.frozen, row.world).toBe(true);
    expect(row.animated, row.world).toBe(true);
    expect(row.reduced, row.world).toBe(true);
    expect(row.budget, row.world).toBe(true);
    await writeFile(
      `output/playwright/polish-20260910/atmosphere-${info.project.name}-${row.world}.png`,
      Buffer.from(row.picture.split(',')[1], 'base64'),
    );
  }
  expect(report.glError).toBe(0);
  if (report.canLose) {
    await page.evaluate(() => window.__contextLoss.loseContext());
    await page.waitForFunction(() => window.__hoof.graphicsLost);
    await page.evaluate(() => window.__contextLoss.restoreContext());
    await page.waitForFunction(() => !window.__hoof.graphicsLost);
    const after = await page.evaluate(() => {
      const r = window.__hoof.renderer;
      r.reset();
      r.draw(window.__routineFrame, 0, 10);
      return r.canvas.toDataURL();
    });
    expect(after).toBe(report.before);
  }
  expect(errors).toEqual([]);
});
