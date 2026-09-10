import { test, expect, type Page } from './fixtures';

async function pitstop(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  await page.evaluate(() => {
    const c = window.__hoof;
    Object.assign(c.run!, {
      stage: 2,
      status: 'pitstop',
      world: 'farm',
      route: ['farm', 'farm', 'farm'],
      rewardTaken: false,
      offers: ['confetti', 'wings', 'beans'],
      passives: ['magnet', 'eyes', 'piano', 'ghostly'],
      ability: 'blackhole',
      salvage: 500,
    });
    c.screen = 'pitstop';
    c.state.phase = 'title';
    c.publish();
  });
}

test('replacement reveals pair tradeoffs, contains focus, cancels unchanged and equips exactly once', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await pitstop(page);
  const snapshot = await page.evaluate(() => JSON.stringify(window.__hoof.run));
  const offer = page.locator('.relic-card').first();
  await expect(offer.locator('.synergy-opportunity')).toContainText(
    'Exploding pianos',
  );
  await offer.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Replace a perk',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const first = dialog.locator('.replacement-options > button').first();
  await expect(first).toBeFocused();
  await expect(first.locator('.gained')).toHaveCount(1);
  await expect(first.locator('.lost')).toHaveCount(2);
  const second = dialog.locator('.replacement-options > button').nth(1);
  await expect(second.locator('.gained')).toHaveCount(1);
  await expect(second.locator('.lost')).toHaveCount(1);
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Tab');
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.contains(document.activeElement)),
      )
      .toBe(true);
  }
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
  const hit = await cancel.evaluate((node) => {
    const b = node.getBoundingClientRect();
    return (
      b.top >= 0 &&
      b.bottom <= innerHeight &&
      node.contains(
        document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
      )
    );
  });
  expect(hit).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(offer).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(window.__hoof.run))).toBe(
    snapshot,
  );
  await offer.click();
  await expect(dialog).toBeVisible();
  await cancel.click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(window.__hoof.run))).toBe(
    snapshot,
  );
  await offer.click();
  await expect(dialog).toBeVisible();
  await first.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `output/playwright/polish-20260910/replacement-${info.project.name}.png`,
  });
  await first.click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.route-card')).toHaveCount(2);
  await expect(page.locator('.route-card').first()).toBeFocused();
  const run = await page.evaluate(() => window.__hoof.run!);
  expect(run.stage).toBe(3);
  expect(run.passives).toEqual(['confetti', 'eyes', 'piano', 'ghostly']);
  expect(run.salvage).toBe(500);
  expect(run.rewardTaken).toBe(true);
  expect(errors).toEqual([]);
});

test('native touch can inspect every replacement and cancel or choose in small portrait and landscape layouts', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'phone' && info.project.name !== 'phone-landscape',
  );
  const sizes =
    info.project.name === 'phone'
      ? [
          [390, 664],
          [320, 568],
        ]
      : [
          [915, 412],
          [667, 375],
        ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await pitstop(page);
    const before = await page.evaluate(() => JSON.stringify(window.__hoof.run));
    const offer = page.locator('.relic-card').first();
    await offer.tap();
    const dialog = page.getByRole('dialog', {
      name: 'Replace a perk',
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const options = dialog.locator('.replacement-options > button');
    const body = dialog.locator('.dialog-body');
    expect(
      await body.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    ).toBe(true);
    for (const option of await options.all()) {
      await option.scrollIntoViewIfNeeded();
      expect(
        await option.evaluate((node) => {
          const b = node.getBoundingClientRect();
          return (
            b.height >= 44 &&
            node.contains(
              document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
            )
          );
        }),
      ).toBe(true);
    }
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await cancel.tap();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => JSON.stringify(window.__hoof.run))).toBe(
      before,
    );
    await offer.tap();
    await expect(dialog).toBeVisible();
    await page.touchscreen.tap(3, 3);
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => JSON.stringify(window.__hoof.run))).toBe(
      before,
    );
    await offer.tap();
    await expect(dialog).toBeVisible();
    await options.first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `output/playwright/polish-20260910/replacement-touch-${width}x${height}.png`,
    });
    await options.last().tap();
    await expect(dialog).toBeHidden();
    await expect(page.locator('.route-card')).toHaveCount(2);
    expect(await page.evaluate(() => window.__hoof.run!.passives)).toEqual([
      'magnet',
      'eyes',
      'piano',
      'confetti',
    ]);
  }
});

test('ability offers show the real gained and lost pairs, including paid replacements, without another confirmation', async ({
  page,
}, info) => {
  if (info.project.name === 'phone')
    await page.setViewportSize({ width: 320, height: 568 });
  if (info.project.name === 'phone-landscape')
    await page.setViewportSize({ width: 667, height: 375 });
  for (const paid of [false, true]) {
    await pitstop(page);
    const expected = await page.evaluate(async (paid) => {
      const c = window.__hoof,
        path = '/lib/game/run.ts';
      const { price } = await import(path);
      Object.assign(c.run!, {
        passives: ['beans', 'tailwind', 'magnet', 'eyes'],
        ability: 'spring',
        offers: ['blackhole', 'wings', 'piano'],
        rewardTaken: paid,
      });
      c.publish();
      return { salvage: c.run!.salvage, price: price(c.run!, 'equipment') };
    }, paid);
    const offer = page.locator('.relic-card').first();
    await expect(
      offer.locator('.synergy-opportunity:not(.loses-pair)'),
    ).toHaveText('Larger black-hole pull');
    await expect(offer.locator('.loses-pair')).toHaveText(
      'Lose Stronger spring rebound',
    );
    await expect(offer.locator(':scope > b')).toContainText(
      'Replaces Spring-loaded Spine',
    );
    if (paid) {
      await expect(offer.locator(':scope > b')).toContainText(
        `${expected.price} salvage`,
      );
      await page.getByRole('button', { name: /Shop & reroll/ }).click();
    }
    await offer.scrollIntoViewIfNeeded();
    const layout = await offer.evaluate((node) => {
      const b = node.getBoundingClientRect();
      return {
        fits: [...node.querySelectorAll('h3,p,.offer-pairs,b')].every((el) => {
          const child = el.getBoundingClientRect();
          return (
            child.left >= b.left &&
            child.right <= b.right &&
            child.top >= b.top &&
            child.bottom <= b.bottom
          );
        }),
        hit: node.contains(
          document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2),
        ),
      };
    });
    expect(layout.fits).toBe(true);
    expect(layout.hit).toBe(true);
    await page.screenshot({
      path: `output/playwright/polish-20260910/ability-choice-${info.project.name}-${paid ? 'paid' : 'free'}.png`,
    });
    if (info.project.name.startsWith('phone')) await offer.tap();
    else await offer.click();
    await expect(
      page.getByRole('dialog', { name: 'Replace a perk' }),
    ).toHaveCount(0);
    if (paid)
      await expect(
        page.getByRole('button', { name: 'CONTINUE', exact: true }),
      ).toBeVisible();
    else await expect(page.locator('.route-card')).toHaveCount(2);
    const run = await page.evaluate(() => window.__hoof.run!);
    expect(run.ability).toBe('blackhole');
    expect(run.passives).toEqual(['beans', 'tailwind', 'magnet', 'eyes']);
    expect(run.salvage).toBe(expected.salvage - (paid ? expected.price : 0));
    expect(run.stage).toBe(paid ? 2 : 3);
  }
});
