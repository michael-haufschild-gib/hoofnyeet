import { test, expect } from './fixtures';
import type { WebGLRenderer } from 'pixi.js';
import type { GameController } from '../../lib/game/controller';
declare global {
  interface Window {
    __hoof: GameController;
    __contextLoss: WEBGL_lose_context;
    __restorationOrder: string[];
    __restorationFrames: number;
  }
}

test('graphics interruption pauses the attempt and restores illustrated rendering before manual resume', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const supported = await page.evaluate(() => {
    const extension = (
      window.__hoof.renderer.app.renderer as WebGLRenderer
    ).gl.getExtension('WEBGL_lose_context');
    if (extension) window.__contextLoss = extension;
    return !!extension;
  });
  test.skip(
    !supported,
    'Browser does not expose the context-loss test extension',
  );
  await page.evaluate(() => {
    const c = window.__hoof;
    window.__restorationOrder = [];
    window.__restorationFrames = 0;
    let restored = false;
    c.renderer.canvas.addEventListener(
      'webglcontextrestored',
      () => {
        window.__restorationOrder.push('event');
      },
      { once: true },
    );
    const restore = c.renderer.restoreGraphics.bind(c.renderer);
    c.renderer.restoreGraphics = () => {
      window.__restorationOrder.push('rebuild');
      restore();
      restored = true;
    };
    const draw = c.renderer.draw.bind(c.renderer);
    c.renderer.draw = (...args) => {
      if (restored) window.__restorationFrames++;
      return draw(...args);
    };
    c.save.rounds = 3;
    c.setPreference('pony', 'bubblegum');
  });
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__hoof.state.phase))
    .toBe('runup');
  await page.evaluate(() => window.__contextLoss.loseContext());
  await expect
    .poll(() => page.evaluate(() => window.__hoof.state.paused), {
      timeout: 3000,
    })
    .toBe(true);
  await expect(page.getByText('The picture needs a moment.')).toBeVisible();
  const frozen = await page.evaluate(() => {
    const c = window.__hoof;
    return {
      time: c.state.time,
      x: c.state.x,
      distance: c.state.distance,
      attempt: c.run!.attempt,
    };
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__hoof.state.time)).toBe(frozen.time);
  await page.evaluate(() => window.__contextLoss.restoreContext());
  await expect(page.getByText('The picture needs a moment.')).not.toBeVisible();
  expect(await page.evaluate(() => window.__restorationOrder)).toEqual([
    'event',
    'rebuild',
  ]);
  expect(
    await page.evaluate(() => {
      const c = window.__hoof;
      return {
        time: c.state.time,
        x: c.state.x,
        distance: c.state.distance,
        attempt: c.run!.attempt,
      };
    }),
  ).toEqual(frozen);
  expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(true);
  // Controller must repaint the recovered picture even while paused. Calling
  // draw directly below cannot substitute for the actual restoration frame.
  await expect
    .poll(() => page.evaluate(() => window.__restorationFrames))
    .toBeGreaterThan(0);
  const pixel = await page.evaluate(() => {
    const r = window.__hoof.renderer;
    r.draw(window.__hoof.state, 0, window.__hoof.state.time);
    const pixel = new Uint8Array(4);
    const gl = (r.app.renderer as WebGLRenderer).gl;
    gl.readPixels(
      Math.floor(r.canvas.width / 2),
      Math.floor(20 * r.app.renderer.resolution),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    return Array.from(pixel);
  });
  expect(pixel[3]).toBe(255);
  expect(pixel[2], 'restored ground must not be blank sky').toBeLessThan(150);
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__hoof.state.time))
    .toBeGreaterThan(frozen.time);
  await page.screenshot({
    path: `output/playwright/recovered-${info.project.name}.png`,
  });
});
