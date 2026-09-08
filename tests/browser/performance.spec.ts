import { test, expect } from './fixtures';
import type { GameController } from '../../lib/game/controller';
declare global {
  interface Window {
    __hoof: GameController;
  }
}

test('automatic graphics scaling preserves game state, viewport, input targets and renderer resets', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  const result = await page.evaluate(() => {
    const c = window.__hoof;
    c.setExporting(true);
    const renderer = c.renderer;
    const before = JSON.stringify(c.state);
    const recording = c.recording().frames.length;
    const bounds = renderer.canvas.getBoundingClientRect().toJSON();
    const initialResolution = renderer.app.renderer.resolution;
    for (let i = 0; i < 180; i++) renderer.observeFrame(1 / 30, true);
    renderer.draw(c.state, 0, c.state.time);
    const after = JSON.stringify(c.state);
    const resolution = renderer.app.renderer.resolution;
    const screen = {
      width: renderer.app.screen.width,
      height: renderer.app.screen.height,
    };
    const buffer = {
      width: renderer.canvas.width,
      height: renderer.canvas.height,
    };
    const afterBounds = renderer.canvas.getBoundingClientRect().toJSON();
    renderer.reset();
    renderer.resize();
    return {
      before,
      after,
      recording,
      afterRecording: c.recording().frames.length,
      bounds,
      afterBounds,
      initialResolution,
      resolution,
      screen,
      buffer,
      retainedResolution: renderer.app.renderer.resolution,
    };
  });
  expect(result.after).toBe(result.before);
  expect(result.afterRecording).toBe(result.recording);
  expect(result.afterBounds).toEqual(result.bounds);
  expect(result.resolution).toBe(1);
  expect(result.retainedResolution).toBe(1);
  expect(result.resolution).toBeLessThanOrEqual(result.initialResolution);
  expect(result.buffer.width).toBeCloseTo(result.screen.width, 0);
  expect(result.buffer.height).toBeCloseTo(result.screen.height, 0);
  const target = await page
    .getByRole('button', { name: 'RUN', exact: true })
    .boundingBox();
  expect(target!.y + target!.height).toBeLessThanOrEqual(844);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.setExporting(false);
    c.pause(true);
  });
  const resume = page.getByRole('button', { name: 'RESUME', exact: true });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect
    .poll(() => page.evaluate(() => window.__hoof.state.paused))
    .toBe(false);
});
