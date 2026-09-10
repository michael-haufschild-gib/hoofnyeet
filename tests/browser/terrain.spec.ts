import { test, expect } from './fixtures';
import type { Texture } from 'pixi.js';
import type { WorldId } from '../../lib/game/content';

test('every world rasterizes the exact opaque ground footprint and preserves it through graphics recovery', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const native = r as unknown as { terrainTextures: Map<WorldId, Texture> };
    const simPath = '/lib/game/simulation.ts';
    const { createGame } = await import(simPath);
    const state = createGame();
    Object.assign(state, {
      phase: 'flight',
      launched: true,
      x: 2400,
      y: -180,
      time: 3,
      sceneTime: 3,
    });
    const checks = [];
    const joints = [];
    for (const world of [
      'farm',
      'candy',
      'carnival',
      'office',
      'moon',
      'afterlife',
    ] as WorldId[]) {
      await r.prepareLevel(world, 'buttercup');
      state.world = world;
      r.draw(state, 0, 3);
      const texture = native.terrainTextures.get(world)!;
      const image = r.app.renderer.extract.pixels(texture);
      const pixels = image.pixels;
      let transparentEdgePixels = 0;
      for (let y = 0; y < image.height; y++) {
        for (const x of [0, image.width - 1]) {
          if (pixels[(y * image.width + x) * 4 + 3] !== 255)
            transparentEdgePixels++;
        }
      }
      checks.push({
        world,
        width: texture.width,
        height: texture.height,
        transparentEdgePixels,
      });
      if (['carnival', 'office', 'afterlife'].includes(world)) {
        const dominant = (coordinates: [number, number][]) => {
          const frequency = new Map<string, number>();
          for (const [x, y] of coordinates) {
            const offset = (y * image.width + x) * 4;
            const color = Array.from(pixels.slice(offset, offset + 4)).join(
              ',',
            );
            frequency.set(color, (frequency.get(color) ?? 0) + 1);
          }
          return [...frequency].sort((a, b) => b[1] - a[1])[0][0];
        };
        const column = (x: number): [number, number][] =>
          Array.from({ length: 270 }, (_, i) => [
            x,
            Math.floor(((80 + i) * image.height) / 360),
          ]);
        const stride = world === 'office' ? 128 : 64;
        const jointX = Math.floor((stride * image.width) / 1024);
        joints.push({
          world,
          seam: [dominant(column(image.width - 1)), dominant(column(0))],
          internal: [dominant(column(jointX - 1)), dominant(column(jointX))],
        });
      }
    }
    state.world = 'candy';
    r.draw(state, 0, 3);
    const before = r.canvas.toDataURL();
    r.restoreGraphics();
    r.draw(state, 0, 3);
    return { checks, joints, restored: before === r.canvas.toDataURL() };
  });
  await info.attach('tile-footprints', {
    body: JSON.stringify(report),
    contentType: 'application/json',
  });
  for (const row of report.checks) {
    expect(row.width, row.world).toBe(1024);
    expect(row.height, row.world).toBe(360);
    expect(row.transparentEdgePixels, row.world).toBe(0);
  }
  expect(report.restored).toBe(true);
  for (const joint of report.joints)
    expect(joint.seam, joint.world).toEqual(joint.internal);
  await page.screenshot({
    path: `output/playwright/polish-20260910/terrain-${info.project.name}.png`,
  });
});
