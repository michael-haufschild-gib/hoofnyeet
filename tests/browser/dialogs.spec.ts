import { test, expect } from './fixtures';

test('dialog dismissal preserves its picture until exit and returns keyboard focus to its trigger', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  for (const [name, title, dismissal] of [
    ['Pony & hats', 'Pony & hats', 'button'],
    ['Upgrades', 'Upgrades', 'escape'],
    ['Levels', 'Choose a level', 'backdrop'],
  ]) {
    const trigger = page.getByRole('button', { name, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('dialog', { name: title, exact: true }),
    ).toBeVisible();
    await page.evaluate(() => {
      const popup = document.querySelector('[data-slot="dialog-content"]')!;
      const samples: { title: string; children: number }[] = [];
      const sample = () => {
        if (popup.isConnected)
          samples.push({
            title:
              popup.querySelector('[data-slot="dialog-title"]')?.textContent ??
              '',
            children:
              popup.querySelector('.dialog-body')?.childElementCount ?? 0,
          });
      };
      sample();
      const observer = new MutationObserver(sample);
      observer.observe(popup, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
      window.__dismissal = { samples, stop: () => observer.disconnect() };
    });
    if (dismissal === 'button')
      await page.getByRole('button', { name: 'Close', exact: true }).click();
    if (dismissal === 'escape') await page.keyboard.press('Escape');
    if (dismissal === 'backdrop') await page.mouse.click(3, 3);
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    const samples = await page.evaluate(() => {
      window.__dismissal.stop();
      return window.__dismissal.samples;
    });
    expect(samples.length).toBeGreaterThan(0);
    expect(
      samples.every((sample) => sample.title === title && sample.children > 0),
      JSON.stringify(samples),
    ).toBe(true);
    await expect(trigger).toBeFocused();
  }
});

test('closing settings leaves gameplay paused and native resume reclaims both controls', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'runup');
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(true);
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  const before = await page.evaluate(() => window.__hoof.state.taps);
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.__hoof.state.taps)).toBe(before + 1);
});

declare global {
  interface Window {
    __dismissal: {
      samples: { title: string; children: number }[];
      stop: () => void;
    };
  }
}
