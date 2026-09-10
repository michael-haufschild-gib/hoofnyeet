import { test, expect } from './fixtures';
import { challengeUrl, newRun } from '../../lib/game/run';

test('tour length is an inline choice, saved across reloads, and later legs show the real route', async ({
  page,
}, info) => {
  const sizes =
    info.project.name === 'phone'
      ? [
          [375, 667],
          [390, 844],
        ]
      : info.project.name === 'phone-landscape'
        ? [[915, 412]]
        : [
            [1280, 600],
            [1440, 900],
          ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.__hoof?.ready);
    await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
    await page.getByRole('button', { name: 'Grand Tour 18 events' }).click();
    await expect(
      page.getByRole('button', { name: 'Grand Tour 18 events' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.campaign-route li')).toHaveCount(6);
    await expect(page.locator('.route-card')).toHaveCount(2);
    for (const card of await page.locator('.route-card').all()) {
      const fit = await card.evaluate((el) => {
        const r = el.getBoundingClientRect(),
          owner = document.elementFromPoint(
            r.x + r.width / 2,
            r.y + r.height / 2,
          );
        return {
          owned: !!owner && el.contains(owner),
          bottom: r.bottom,
          height: innerHeight,
          overflow: document.documentElement.scrollHeight - innerHeight,
        };
      });
      expect(fit.owned).toBe(true);
      expect(fit.bottom).toBeLessThan(fit.height);
      expect(fit.overflow).toBeLessThanOrEqual(1);
    }
    await page.screenshot({
      path: `output/playwright/polish-20260910/grand-${info.project.name}-${width}-${height}-choice.png`,
    });
    await page.reload();
    await page.waitForFunction(() => window.__hoof?.ready);
    await expect(
      page.getByRole('button', { name: /RESUME TOUR/ }),
    ).toContainText('Event 1 / 18');
    await page.getByRole('button', { name: /RESUME TOUR/ }).click();
    await expect(
      page.getByRole('button', { name: 'Grand Tour 18 events' }),
    ).toHaveAttribute('aria-pressed', 'true');
    // Stage boundaries use the production state machine; tour.spec supplies
    // native inputs for every one of the eighteen attempts separately.
    await page.evaluate(async () => {
      const path = '/lib/game/run.ts';
      const api = await import(path);
      const c = window.__hoof,
        r = c.run!;
      const result = {
        distance: 800,
        style: 1000,
        havoc: 2000,
        bossHits: 12,
        failed: false,
        disaster: 'review',
      };
      for (let i = 0; i < 3; i++) {
        api.beginAttempt(r, 'candy');
        api.settleAttempt(r, result, c.save.unlocked);
        api.takeRelic(r, r.offers[0], r.passives[0]);
        api.nextStage(r);
      }
      c.publish();
    });
    await expect(page.locator('.route-card')).toHaveCount(1);
    await expect(page.locator('.route-card h3')).toHaveText('Borrowed Farm');
    await expect(page.locator('.campaign-picker')).toHaveCount(0);
    await expect(page.locator('.campaign-route .done')).toHaveCount(1);
    await expect(
      page.locator('.campaign-route .current .stop-label'),
    ).toHaveText('Farm');
    await page.screenshot({
      path: `output/playwright/polish-20260910/grand-${info.project.name}-${width}-${height}-paired.png`,
    });
    await page.locator('.route-card').click();
    await page.waitForFunction(
      () => window.__hoof.screen === 'game' && !window.__hoof.preparation,
    );
    expect(await page.evaluate(() => window.__hoof.run?.campaign)).toBe(
      'grand',
    );
    await expect(page.locator('.event-chip')).toHaveText('4 / 18');
    await page.evaluate(() => window.__hoof.pause(true));
    await page.reload();
    await page.waitForFunction(() => window.__hoof?.ready);
    await expect(
      page.getByRole('button', { name: /RESUME TOUR/ }),
    ).toContainText('Event 4 / 18');
  }
});

test('shared Grand Tour cannot change length and Play Again preserves that length', async ({
  page,
  baseURL,
}) => {
  await page.goto(
    challengeUrl(
      newRun('tour', 118, false, undefined, 'standard', 'grand'),
      baseURL!,
    ),
  );
  await page.waitForFunction(() => window.__hoof?.ready);
  await expect(page.locator('.campaign-picker')).toHaveCount(0);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.selectCampaign('classic');
    c.run!.status = 'won';
    c.run!.stage = 17;
    c.screen = 'results';
    c.state.phase = 'results';
    c.publish();
  });
  await expect(page.locator('.result-stamp')).toHaveText('GRAND TOUR COMPLETE');
  await page.getByRole('button', { name: 'PLAY AGAIN' }).click();
  await expect(
    page.getByRole('button', { name: 'Grand Tour 18 events' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__hoof.run?.stage)).toBe(0);
});
