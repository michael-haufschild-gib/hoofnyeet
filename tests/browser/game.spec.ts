import { test, expect, type Page } from './fixtures';
import { nativeActions, returnHome } from './inputs';
import type { Container, Text } from 'pixi.js';
import type { GameController } from '../../lib/game/controller';
declare global {
  interface Window {
    __hoof: GameController;
  }
}
async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
}
async function attempt(page: Page, touch = false, mouse = false) {
  await page.locator('canvas').focus();
  const tap = await nativeActions(page, touch, mouse);
  let lastDistance = 0;
  let flightChecked = false;
  for (let i = 0; i < 650; i++) {
    const s = await page.evaluate(() => window.__hoof.snapshot());
    if (s.phase === 'runup') {
      // React to the visible cue before changing the approach speed.
      if (s.jump.ready) await tap('secondary');
      else await tap('primary');
    } else if (s.phase === 'flight') {
      if (s.y <= -300 && !flightChecked) {
        const clarity = await page.evaluate(() => {
          const renderer = window.__hoof.renderer;
          const pony = (renderer as unknown as { pony: Container }).pony;
          const body = pony.getBounds();
          const arena = document
            .querySelector('.arena')!
            .getBoundingClientRect();
          const caption = document
            .querySelector('.ticker')!
            .getBoundingClientRect();
          const labels: number[] = [];
          const visit = (node: Container) => {
            if (/^\d+ m$/.test((node as Text).text ?? '')) {
              const b = node.getBounds();
              if (b.x < renderer.w && b.x + b.width > 0)
                labels.push(b.y + b.height);
            }
            for (const child of node.children) visit(child);
          };
          visit(renderer.app.stage);
          return {
            size: Math.max(body.width, body.height),
            ground: renderer.framing!.ground,
            captionTop: caption.height ? caption.top - arena.top : renderer.h,
            labels,
            captionHeight: renderer.captionInset,
            measuredHeight: caption.height,
            documentHeight: document.documentElement.scrollHeight,
            viewportHeight: innerHeight,
          };
        });
        expect(clarity.size).toBeGreaterThan(45);
        expect(clarity.ground).toBeLessThan(clarity.captionTop - 24);
        expect(clarity.captionHeight).toBeCloseTo(clarity.measuredHeight, 0);
        expect(clarity.documentHeight).toBeLessThanOrEqual(
          clarity.viewportHeight + 1,
        );
        expect(clarity.labels.length).toBeGreaterThan(0);
        for (const bottom of clarity.labels)
          expect(bottom).toBeLessThan(clarity.captionTop - 3);
        flightChecked = true;
      }
      if (s.flaps > 0 && s.y > -630) await tap('primary');
      await tap('secondary');
    } else if (s.phase === 'landing') {
      expect(s.distance).toBeGreaterThanOrEqual(lastDistance);
      lastDistance = s.distance;
      if (i % 10 === 0) await tap('primary');
      if (i % 23 === 0) await tap('secondary');
    }
    if (s.phase === 'results') {
      expect(flightChecked, 'inspect the actual rendered flight apex').toBe(
        true,
      );
      return s;
    }
    await page.waitForTimeout(75);
  }
  throw new Error('Attempt did not finish');
}
test('keyboard, mouse and touch round, single result, optional replay and reset', async ({
  page,
}, info) => {
  test.setTimeout(70000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.screenshot({
    path: `output/playwright/${info.project.name}-unstable-home.png`,
  });
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  const s = await attempt(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  expect(s.distance).toBeGreaterThan(100);
  expect(s.havoc).toBeGreaterThan(0);
  await expect(
    page.getByRole('region', { name: 'Attempt results' }),
  ).toBeVisible();
  await page.waitForTimeout(550);
  await page.screenshot({
    path: `output/playwright/${info.project.name}-unstable-results.png`,
  });
  const rounds = await page.evaluate(() => window.__hoof.save.rounds);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__hoof.state.phase)).toBe('results');
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Done$/ }).click();
  expect(await page.evaluate(() => window.__hoof.save.rounds)).toBe(rounds);
  await page.getByRole('button', { name: /^AGAIN$/ }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  const reset = await page.evaluate(() => window.__hoof.snapshot());
  expect(reset.flaps).toBe(3);
  expect(reset.havoc).toBe(0);
  expect(reset.distance).toBe(0);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(true);
  expect(errors).toEqual([]);
});
test('tour briefing, pit stop, replacement and saved stage resume', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  await ready(page);
  await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose your level', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: 'output/playwright/tour-briefing.png' });
  await page.locator('.route-card').first().click();
  await attempt(page);
  await page.getByRole('button', { name: /^NEXT$/ }).click();
  await page.screenshot({ path: 'output/playwright/tour-pitstop.png' });
  await page.locator('.relic-card').first().click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.locator('.route-card').count()).toBe(0);
  expect(await page.evaluate(() => window.__hoof.run?.stage)).toBe(1);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /RESUME TOUR/ }).click();
  expect(await page.evaluate(() => window.__hoof.run?.stage)).toBe(1);
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.run?.world)).toBe('farm');
});
test('clip export contains video and audio; native sharing is separate', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(110000);
  await ready(page);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await attempt(page);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Challenge a friend' }),
  ).toBeVisible();
  const recordingDuration = await page.evaluate(
    () => window.__hoof.recording().duration,
  );
  await expect(page.getByLabel('Highlight length')).toHaveValue('0');
  await page.getByRole('button', { name: /^MAKE VIDEO$/ }).click();
  await expect(page.getByRole('button', { name: /^SHARE VIDEO$/ })).toBeVisible(
    { timeout: (recordingDuration + 15) * 1000 },
  );
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  const path = `output/playwright/incident.${download.suggestedFilename().split('.').pop()}`;
  await download.saveAs(path);
  await page.screenshot({ path: 'output/playwright/clip-ready.png' });
  expect(await page.evaluate(() => window.__hoof.save.rounds)).toBe(1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings and hats' }).click();
  await page.getByRole('button', { name: /Scrapbook/ }).click();
  await page.locator('.saved-incidents button').first().click();
  await expect(
    page.getByRole('button', { name: 'Challenge a friend' }),
  ).toHaveCount(0);
});
test('a saved settings toggle survives a reload, and a repeated key or touch press does not add a second tap', async ({
  page,
}, info) => {
  await ready(page);
  await page.getByRole('button', { name: 'Settings and hats' }).click();
  await page.getByRole('switch', { name: 'Less camera chaos' }).click();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(await page.evaluate(() => window.__hoof.save.reduced)).toBe(true);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'runup');
  await page.locator('canvas').focus();
  await page.keyboard.down('Space');
  const taps = await page.evaluate(() => window.__hoof.state.taps);
  await page.keyboard.down('Space');
  expect(await page.evaluate(() => window.__hoof.state.taps)).toBe(taps);
  await page.keyboard.up('Space');
  if (info.project.name === 'phone-landscape') {
    const session = await page.context().newCDPSession(page);
    const a = await page.locator('.action-pad.primary').boundingBox(),
      b = await page.locator('.action-pad.secondary').boundingBox();
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: a!.x + a!.width / 2, y: a!.y + a!.height / 2, id: 1 },
        { x: b!.x + b!.width / 2, y: b!.y + b!.height / 2, id: 2 },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchCancel',
      touchPoints: [],
    });
    await session.detach();
    expect(await page.evaluate(() => window.__hoof.state.phase)).toBe(
      'approach',
    );
    expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(true);
  }
});

test('a saved tour survives preference changes and a separate Quick Yeet', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  await ready(page);
  await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  const seed = await page.evaluate(() => window.__hoof.run!.seed);
  await returnHome(page);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Mute sound' }).click();
  expect(await page.evaluate(() => window.__hoof.save.run?.seed)).toBe(seed);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await returnHome(page);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /RESUME TOUR/ }).click();
  expect(await page.evaluate(() => window.__hoof.run?.seed)).toBe(seed);
  await expect(page.locator('.route-card').first()).toBeVisible();
});

test('upgrade choices advance directly, act boundaries offer routes, and shopping stays optional', async ({
  page,
}, info) => {
  await ready(page);
  await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  const pitstop = async (stage: number, full = false) => {
    await page.evaluate(
      ({ stage, full }) => {
        const c = window.__hoof;
        c.state.phase = 'title';
        c.state.paused = false;
        c.screen = 'pitstop';
        Object.assign(c.run!, {
          stage,
          world: 'farm',
          status: 'pitstop',
          rewardTaken: false,
          offers: ['wings', 'magnet', 'rubber'],
          salvage: 500,
          insurance: 2,
          passives: full ? ['beans', 'heavy', 'rubber', 'magnet'] : [],
        });
        c.publish();
      },
      { stage, full },
    );
    await expect(page.getByText('Pick a perk', { exact: true })).toBeVisible();
  };
  await pitstop(0);
  await page.locator('.relic-card').first().click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.run?.stage)).toBe(1);
  await expect(page.locator('.route-card')).toHaveCount(0);

  await pitstop(2, true);
  await page.locator('.relic-card').first().click();
  await expect(page.locator('.replacement')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await page.evaluate(() => window.__hoof.run?.rewardTaken)).toBe(false);
  expect(await page.evaluate(() => window.__hoof.run?.stage)).toBe(2);
  await page.locator('.relic-card').first().click();
  await page.screenshot({
    path: `output/playwright/declutter-${info.project.name}-replacement.png`,
  });
  await page.locator('.replacement button').first().click();
  await expect(page.locator('.route-card')).toHaveCount(2);
  expect(await page.evaluate(() => window.__hoof.run?.passives)).toEqual([
    'wings',
    'heavy',
    'rubber',
    'magnet',
  ]);
  await page
    .getByRole('button', { name: 'Play Ministry of Horse Affairs' })
    .click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.run?.world)).toBe('office');

  await pitstop(0);
  await page.getByRole('button', { name: /Shop & reroll/ }).click();
  await page.locator('.relic-card').first().click();
  await expect(page.getByText('Ready to roll?')).toBeVisible();
  await page.locator('.relic-card').nth(1).click();
  expect(await page.evaluate(() => window.__hoof.run?.passives)).toEqual([
    'wings',
    'magnet',
  ]);
  expect(await page.evaluate(() => window.__hoof.run?.salvage)).toBeLessThan(
    500,
  );
  await page.getByRole('button', { name: /Extra try/ }).click();
  expect(await page.evaluate(() => window.__hoof.run?.insurance)).toBe(3);
  await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.run?.stage)).toBe(1);
});
