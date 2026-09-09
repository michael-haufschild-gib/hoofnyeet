import { test, expect } from './fixtures';

declare global {
  interface Window {
    __pausedPaints: number;
    __pausedPublishes: number;
  }
}

test('paused play stops redundant painting while resize, outfits and resume still update', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'RESUME', exact: true }),
  ).toBeVisible();
  const frozen = await page.evaluate(() => {
    const c = window.__hoof;
    const draw = c.renderer.draw.bind(c.renderer);
    const publish = c.publish.bind(c);
    window.__pausedPaints = window.__pausedPublishes = 0;
    c.renderer.draw = (...args) => {
      window.__pausedPaints++;
      return draw(...args);
    };
    c.publish = () => {
      window.__pausedPublishes++;
      publish();
    };
    return { time: c.state.time, x: c.state.x, round: c.state.round };
  });
  // Let the pause overlay finish its layout; then observe a real quiet interval.
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.__pausedPaints = window.__pausedPublishes = 0;
  });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__pausedPaints)).toBe(0);
  expect(await page.evaluate(() => window.__pausedPublishes)).toBe(0);

  const size = page.viewportSize()!;
  await page.setViewportSize({
    width: size.width - 24,
    height: size.height - 20,
  });
  await expect
    .poll(() => page.evaluate(() => window.__pausedPaints))
    .toBeGreaterThan(0);
  await page.waitForTimeout(200);
  const resized = await page.evaluate(() => window.__pausedPaints);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pausedPaints)).toBe(resized);

  const oldImage = await page.locator('canvas').screenshot();
  await page.evaluate(() => {
    const c = window.__hoof;
    c.save.hats.push('party');
    c.setPreference('hat', 'party');
  });
  await expect
    .poll(() => page.evaluate(() => window.__pausedPaints))
    .toBeGreaterThan(resized);
  const newImage = await page.locator('canvas').screenshot();
  expect(newImage.equals(oldImage)).toBe(false);
  expect(
    await page.evaluate(() => {
      const s = window.__hoof.state;
      return { time: s.time, x: s.x, round: s.round };
    }),
  ).toEqual(frozen);
  await page.waitForTimeout(200);
  const outfitted = await page.evaluate(() => window.__pausedPaints);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pausedPaints)).toBe(outfitted);

  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__hoof.state.time))
    .toBeGreaterThan(frozen.time);
  expect(await page.evaluate(() => window.__pausedPaints)).toBeGreaterThan(
    outfitted,
  );
  expect(errors).toEqual([]);
});
