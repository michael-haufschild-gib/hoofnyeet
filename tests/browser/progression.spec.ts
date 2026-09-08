import { test, expect } from './fixtures';
import { returnHome } from './inputs';
import { CONTENT_VERSION } from '../../lib/game/content';

test('illustrated dressing room saves the pony and daily records keep their tapping rules', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate((version) => {
    const save = window.__hoof.save;
    save.rounds = 8;
    save.wins = 1;
    save.hats = ['helmet', 'party', 'crown', 'space'];
    const day = new Date().toISOString().slice(0, 10);
    save.daily[`v${version}:${day}`] = 43210;
    save.daily[`v${version}:${day}:assisted`] = 56789;
    localStorage.setItem('hoof-and-yeet:v2', JSON.stringify(save));
  }, CONTENT_VERSION);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await expect(page.getByRole('button', { name: /^Daily$/ })).toHaveAttribute(
    'title',
    'Daily best: 43,210',
  );
  await page.getByRole('button', { name: 'Settings and hats' }).click();
  await page.getByRole('tab', { name: /Dressing room/ }).click();
  const portraits = page.locator('.pony-portrait img');
  await expect(portraits).toHaveCount(4);
  await expect
    .poll(() =>
      portraits.evaluateAll((nodes) =>
        nodes.every(
          (node) =>
            (node as HTMLImageElement).complete &&
            (node as HTMLImageElement).naturalWidth > 80,
        ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: /Bubblegum/ }).click();
  await expect(page.getByRole('button', { name: /Bubblegum/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.screenshot({
    path: `output/playwright/${info.project.name}-wardrobe.png`,
  });
  await page.getByRole('tab', { name: 'Controls & sound' }).click();
  await page.getByRole('switch', { name: 'Assisted tapping' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Daily$/ })).toHaveAttribute(
    'title',
    'Daily best: 56,789',
  );
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(await page.evaluate(() => window.__hoof.renderer.ponyId)).toBe(
    'bubblegum',
  );
  expect(
    await page.evaluate(() => window.__hoof.recording().appearance?.ponyId),
  ).toBe('bubblegum');
  await page.screenshot({
    path: `output/playwright/${info.project.name}-bubblegum.png`,
  });
  await page.getByRole('button', { name: 'Settings and hats' }).click();
  await page.getByRole('button', { name: 'Scrapbook', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Daily Disaster records' }),
  ).toContainText('43,210');
  await expect(
    page.getByRole('region', { name: 'Daily Disaster records' }),
  ).toContainText('Assisted tapping');
  await expect(
    page.getByRole('region', { name: 'Daily Disaster records' }),
  ).not.toContainText('Invalid Date');
  expect(errors).toEqual([]);
});

test('changing an outfit cannot rewrite the incident being recorded', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  const looks = await page.evaluate(() => {
    const c = window.__hoof;
    c.save.rounds = 8;
    c.save.hats.push('party');
    c.pause(true);
    c.setPreference('pony', 'bubblegum');
    c.setPreference('hat', 'party');
    return {
      recording: c.recording().appearance,
      pony: c.renderer.ponyId,
      hat: c.renderer.hat,
      next: c.save.pony,
    };
  });
  expect(looks.recording?.ponyId).toBe('buttercup');
  expect(looks.recording?.hat).toBe('helmet');
  expect(looks.pony).toBe('bubblegum');
  expect(looks.hat).toBe('party');
  expect(looks.next).toBe('bubblegum');
  await returnHome(page);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  expect(
    await page.evaluate(() => window.__hoof.recording().appearance?.ponyId),
  ).toBe('bubblegum');
});

test('unlocked tour rules alter the next tour and long collections keep their close control visible', async ({
  page,
}, info) => {
  test.skip(!['chromium', 'phone'].includes(info.project.name));
  if (info.project.name === 'phone')
    await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.save.wins = 2;
    c.publish();
  });
  await page.getByRole('button', { name: 'Settings and hats' }).click();
  await page.getByRole('tab', { name: 'Tour rules' }).click();
  await page.getByRole('button', { name: /One-winged wonder/ }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  await expect(
    page.getByText('One panic flap per event, even with extra-flap equipment.'),
  ).toBeVisible();
  await page.locator('.route-card').first().click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  expect(await page.evaluate(() => window.__hoof.state.maxFlaps)).toBe(1);
  await returnHome(page);
  await page.getByRole('button', { name: 'Settings and hats' }).click();
  await page.getByRole('button', { name: 'Scrapbook', exact: true }).click();
  await page.locator('.dialog-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const close = page.getByRole('button', { name: 'Close', exact: true });
  const bounds = await close.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThan(page.viewportSize()!.height);
  await close.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an old challenge has a readable recovery and an old daily resumes with preserved progress', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  await page.goto('/?v=2&seed=118&mode=tour');
  await page.waitForFunction(() => window.__hoof?.ready);
  await expect(
    page.getByText(/That challenge uses an older or unsupported course/),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Daily$/ }).click();
  const seed = await page.evaluate(() => {
    const c = window.__hoof;
    c.run!.contentVersion = 2;
    c.run!.salvage = 270;
    c.run!.passives = ['beans', 'wings'];
    c.save.run = c.run;
    localStorage.setItem('hoof-and-yeet:v2', JSON.stringify(c.save));
    return c.run!.seed;
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /RESUME TOUR/ }).click();
  await expect(
    page.getByText(/Your saved daily continues as a tour/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      seed: window.__hoof.run!.seed,
      salvage: window.__hoof.run!.salvage,
      equipment: window.__hoof.run!.passives,
    })),
  ).toEqual({ seed, salvage: 270, equipment: ['beans', 'wings'] });
  await expect(page.locator('.route-card').first()).toBeVisible();
});
