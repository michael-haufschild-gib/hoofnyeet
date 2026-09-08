import { test, expect } from './fixtures';
import type { Container, Sprite } from 'pixi.js';

test('sheep and geese stay planted and visible as the pony passes at every height', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const path = '/lib/game/simulation.ts';
    const sim = await import(path),
      c = window.__hoof;
    c.setExporting(true);
    const renderer = c.renderer;
    const scene = renderer as unknown as {
      spectators: Sprite[];
      actors: Container;
      decor: Container;
    };
    const observations = [];
    for (const landmark of [1450, 1595])
      for (const height of [-5, -200, -700]) {
        let plantedY: number | undefined;
        for (const offset of [-140, -119, 0, 119, 140]) {
          const s = sim.createGame();
          Object.assign(s, {
            phase: 'flight',
            world: 'farm',
            x: landmark + offset,
            y: height,
            vx: 500,
            vy: -50,
            time: 5,
            sceneTime: 5,
          });
          renderer.reset();
          renderer.draw(s, 0, s.time);
          const spectator = scene.spectators.find((p) => p.x === landmark);
          if (!spectator) throw new Error(`Missing spectator at ${landmark}`);
          plantedY ??= spectator.y;
          const bounds = spectator.getBounds();
          observations.push({
            landmark,
            height,
            offset,
            visible: spectator.visible,
            alpha: spectator.alpha,
            y: spectator.y,
            plantedY,
            onScreen:
              bounds.x + bounds.width > 0 &&
              bounds.x < renderer.w &&
              bounds.y < renderer.h,
          });
        }
      }
    const parent = scene.actors.parent!;
    return {
      observations,
      behind:
        parent.getChildIndex(scene.decor) < parent.getChildIndex(scene.actors),
    };
  });
  expect(report.behind).toBe(true);
  expect(report.observations).toHaveLength(30);
  for (const observation of report.observations) {
    expect(observation.visible, JSON.stringify(observation)).toBe(true);
    expect(observation.alpha).toBe(1);
    expect(observation.y).toBe(observation.plantedY);
    expect(observation.onScreen).toBe(true);
  }
});
