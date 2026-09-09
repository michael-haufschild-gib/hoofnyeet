import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';

async function topClearance(card: Locator) {
  return card.evaluate((node) => {
    const box = node.getBoundingClientRect();
    let clearance = box.top;
    for (
      let parent = node.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const css = getComputedStyle(parent);
      if (/(auto|scroll|hidden|clip)/.test(css.overflowY))
        clearance = Math.min(
          clearance,
          box.top - parent.getBoundingClientRect().top - parent.clientTop,
        );
    }
    return clearance;
  });
}

test('card hover and keyboard focus fit inside perk, level and outfit scroll containers', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Levels', exact: true }).click();
  const level = page.locator('.level-browser button').first();
  await level.hover();
  await level.focus();
  expect(await topClearance(level)).toBeGreaterThanOrEqual(8);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  const pony = page.locator('.pony-option:enabled').first();
  await pony.hover();
  await pony.focus();
  expect(await topClearance(pony)).toBeGreaterThanOrEqual(8);
  await pony.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await expect.poll(() => topClearance(pony)).toBeGreaterThanOrEqual(8);
  const hat = page.locator('.hat-option:enabled').first();
  await hat.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await hat.focus();
  await expect.poll(() => topClearance(hat)).toBeGreaterThanOrEqual(8);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /^PLAY TOUR/ }).click();
  const route = page.locator('.route-card').first();
  await route.hover();
  await expect.poll(() => topClearance(route)).toBeGreaterThanOrEqual(8);
  // Seed the earned reward boundary; hover and focus the actual cards.
  await page.evaluate(() => {
    const c = window.__hoof;
    c.run!.status = 'pitstop';
    c.run!.offers = ['dynamite', 'wings', 'beans'];
    c.run!.rewardTaken = false;
    c.screen = 'pitstop';
    c.publish();
  });
  const card = page.locator('.relic-card').first();
  await card.hover();
  await card.focus();
  await expect
    .poll(() => card.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe('none');
  // Five-pixel hover lift plus eight pixels for the keyboard focus outline.
  await expect.poll(() => topClearance(card)).toBeGreaterThanOrEqual(8);
  await page.screenshot({
    path: `output/playwright/card-hover-${info.project.name}.png`,
  });
  const last = page.locator('.relic-card').last();
  await last.scrollIntoViewIfNeeded();
  await last.hover();
  await expect.poll(() => topClearance(last)).toBeGreaterThanOrEqual(8);
  await page.locator('.relic-offers').evaluate((el) => {
    el.scrollTop = 0;
  });
  await card.hover();
  await expect.poll(() => topClearance(card)).toBeGreaterThanOrEqual(8);
  await card.click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
});
