import { test, expect } from './fixtures';
import { CONTENT_VERSION } from '../../lib/game/content';

test('a completed Grand Tour settles one personal record and the next route retains the matching target after reload', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(async () => {
    const c = window.__hoof;
    c.setExporting(true);
    const path = '/lib/game/run.ts';
    const { newRun } = await import(path);
    c.run = newRun('tour', 81, false, undefined, 'standard', 'grand');
    const result = {
      distance: 800,
      style: 1500,
      havoc: 2200,
      failed: false,
      bossHits: 9,
      disaster: 'Encore',
    };
    Object.assign(c.run!, {
      stage: 17,
      world: 'afterlife',
      status: 'playing',
      attempt: 18,
      settledAttempt: 17,
      score: 198900,
      history: Array.from({ length: 17 }, () => ({ ...result })),
      route: [
        'farm',
        'farm',
        'farm',
        'candy',
        'candy',
        'candy',
        'carnival',
        'carnival',
        'carnival',
        'office',
        'office',
        'office',
        'moon',
        'moon',
        'moon',
        'afterlife',
        'afterlife',
        'afterlife',
      ],
    });
    c.save.campaign = 'grand';
    await c.renderer.prepareLevel('afterlife', 'buttercup');
    Object.assign(c.state, {
      round: c.state.round + 1,
      phase: 'landing',
      phaseTime: 100,
      reactive: false,
      paused: false,
      failed: false,
      launched: true,
      world: 'afterlife',
      distance: 890,
      flightDistance: 600,
      style: 1500,
      havoc: 2200,
      bossHits: 9,
      landing: 'cartwheel',
    });
    c.screen = 'game';
    c.setExporting(false);
  });
  const results = page.getByRole('region', { name: 'Attempt results' });
  await expect(results).toBeVisible();
  await expect(results.getByLabel('Tour score')).toContainText('211,500');
  await expect(results.getByLabel('Tour score')).toContainText('tour best');
  const key = `v${CONTENT_VERSION}:grand:standard`;
  const before = await page.evaluate(
    (key) => ({
      records: window.__hoof.save.tourBests,
      record: window.__hoof.save.tourBests[key],
      wins: window.__hoof.save.wins,
      rounds: window.__hoof.save.rounds,
    }),
    key,
  );
  expect(before.record).toBe(211500);
  expect(before.wins).toBe(1);
  // A repeated phase boundary cannot settle the same attempt twice.
  await page.evaluate(() => {
    Object.assign(window.__hoof.state, {
      phase: 'landing',
      phaseTime: 100,
      reactive: false,
    });
  });
  await page.waitForFunction(() => window.__hoof.state.phase === 'results');
  expect(
    await page.evaluate(() => ({
      records: window.__hoof.save.tourBests,
      wins: window.__hoof.save.wins,
      rounds: window.__hoof.save.rounds,
    })),
  ).toEqual({
    records: before.records,
    wins: before.wins,
    rounds: before.rounds,
  });
  await page.screenshot({
    path: `output/playwright/polish-20260910/tour-record-${info.project.name}.png`,
  });
  await results
    .getByRole('button', { name: 'PLAY AGAIN', exact: true })
    .click();
  await expect(page.getByLabel('Tour personal best')).toContainText('211,500');
  await page.getByRole('button', { name: /^Classic/ }).click();
  await expect(page.getByLabel('Tour personal best')).toHaveCount(0);
  await page.getByRole('button', { name: /^Grand Tour/ }).click();
  await expect(page.getByLabel('Tour personal best')).toContainText('211,500');
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^RESUME TOUR/ }).click();
  await expect(page.getByLabel('Tour personal best')).toContainText('211,500');
  expect(
    await page.evaluate((key) => window.__hoof.save.tourBests[key], key),
  ).toBe(211500);
  expect(errors).toEqual([]);
});
