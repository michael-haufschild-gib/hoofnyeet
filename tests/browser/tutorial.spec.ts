import { test, expect } from './fixtures';

test.use({ firstRun: true });

test('first-run instructions use the device controls, hold the countdown, and are remembered', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'How to play' });
  await expect(guide).toBeVisible();
  const time = await page.evaluate(() => window.__hoof.state.phaseTime);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hoof.state.phaseTime)).toBe(time);
  expect(await page.evaluate(() => window.__hoof.state.taps)).toBe(0);
  const touch = info.project.name.startsWith('phone');
  await expect(guide.locator('.guide-touch').first()).toBeVisible({
    visible: touch,
  });
  await expect(guide.locator('.guide-keyboard').first()).toBeVisible({
    visible: !touch,
  });
  if (!touch) {
    await expect(guide.getByText('left click', { exact: false })).toBeVisible();
    await expect(
      guide.getByText('right click', { exact: false }),
    ).toBeVisible();
  }
  const button = guide.getByRole('button', { name: 'LET’S GO', exact: true });
  const bounds = await button.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await page.screenshot({
    path: `output/playwright/tutorial-${info.project.name}.png`,
  });
  await button.click();
  await expect(guide).not.toBeVisible();
  await page.waitForFunction(() => window.__hoof.state.phaseTime > 0.1);
  expect(await page.evaluate(() => window.__hoof.save.controlsSeen)).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  await expect(guide).not.toBeVisible();
  expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(false);
  expect(errors).toEqual([]);
});
