import { test, expect } from './fixtures';
import { nativeActions } from './inputs';
import type { GameController } from '../../lib/game/controller';
import { challengeUrl, newRun } from '../../lib/game/run';
import type { Container } from 'pixi.js';
// Multi-minute traces can exhaust disk space; keep per-event images and outcomes.
test.use({ trace: 'off' });
declare global {
  interface Window {
    __hoof: GameController;
  }
}
test('complete nine-event tour with real inputs, contracts, upgrades and stable resources', async ({
  page,
  baseURL,
}, info) => {
  test.setTimeout(480000);
  const touch = info.project.name.startsWith('phone'),
    mouse = info.project.name === 'firefox';
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(challengeUrl(newRun('tour', 118), baseURL!));
  await page.waitForFunction(() => window.__hoof?.ready);
  if (
    await page
      .getByRole('button', { name: /^(PLAY TOUR|New tour)/ })
      .isVisible()
  )
    await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  const rows = [];
  const memory =
    info.project.name === 'chromium'
      ? await page.context().newCDPSession(page)
      : null;
  for (let event = 0; event < 9; event++) {
    if (event % 3 === 0) {
      const route = page.locator('.route-card');
      await expect(route).toHaveCount(2);
      await (
        info.project.name === 'webkit' || info.project.name === 'phone'
          ? route.last()
          : route.first()
      ).click();
    }
    await page.waitForFunction(() => window.__hoof.screen === 'game');
    await expect(page.locator('.route-card')).toHaveCount(0);
    await page.locator('canvas').focus();
    const action = await nativeActions(page, touch, mouse);
    let flapsAt = 0,
      kicksAt = 0,
      ability = false,
      retries = 0;
    for (let i = 0; i < 700; i++) {
      const s = await page.evaluate(() => window.__hoof.snapshot());
      if (s.phase === 'runup') {
        if (s.jump.ready) await action('secondary');
        else await action('primary');
      } else if (s.phase === 'flight') {
        if (s.flaps > 0 && s.y > -680 && i - flapsAt > 5) {
          await action('primary');
          flapsAt = i;
        }
        await action('secondary');
      } else if (s.phase === 'landing') {
        if (i - kicksAt > 12) {
          await action('primary');
          kicksAt = i;
        }
        if (!ability && s.havoc > 200) {
          await action('secondary');
          ability = true;
        }
      } else if (s.phase === 'results') {
        console.log(
          JSON.stringify({
            project: info.project.name,
            stage: event,
            attempt: s.run?.attempt,
            result: s.run?.result,
            status: s.run?.status,
          }),
        );
        if (s.run?.status === 'briefing') {
          expect(++retries, 'insurance retry budget').toBeLessThan(3);
          await page.getByRole('button', { name: /^TRY AGAIN$/ }).click();
          ability = false;
          flapsAt = kicksAt = 0;
          i = -1;
          continue;
        }
        expect(s.run?.status, JSON.stringify(s)).not.toBe('lost');
        const resources = await page.evaluate(() => {
          const c = window.__hoof;
          const count = (node: Container): number =>
            1 + node.children.reduce((n, child) => n + count(child), 0);
          return {
            sceneObjects: count(c.renderer.app.stage),
            bodies: c.state.wreck?.bodies.length ?? 0,
            replayFrames: c.recording().frames.length,
          };
        });
        expect(resources.bodies).toBeLessThanOrEqual(80);
        expect(resources.sceneObjects).toBeLessThan(700);
        expect(resources.replayFrames).toBeLessThanOrEqual(2400);
        let heapMB: number | null = null;
        if (memory) {
          await memory.send('HeapProfiler.collectGarbage');
          heapMB = (await memory.send('Runtime.getHeapUsage')).usedSize / 1e6;
        }
        rows.push({
          event,
          distance: s.distance,
          havoc: s.havoc,
          fps: s.fps,
          insurance: s.run?.insurance,
          world: s.run?.world,
          ...resources,
          heapMB,
        });
        break;
      }
      await page.waitForTimeout(65);
    }
    expect(rows).toHaveLength(event + 1);
    await expect
      .poll(() =>
        page
          .locator('.result-screen')
          .evaluate((node) => Number(getComputedStyle(node).opacity)),
      )
      .toBe(1);
    await page.screenshot({
      path: `output/playwright/tour-${info.project.name}-${event + 1}.png`,
    });
    if (event === 8) break;
    await page.getByRole('button', { name: /^NEXT$/ }).click();
    const useShop = event === 1;
    if (useShop)
      await page.getByRole('button', { name: /Shop & reroll/ }).click();
    const desired = [
      'Questionable wings',
      'Bean propulsion',
      'Unlicensed jetpack',
      'Rubber bones',
      'Pocket weather',
      'Piano subscription',
    ];
    let chosen = false;
    for (const name of desired) {
      const card = page
        .locator('.relic-card')
        .filter({ has: page.getByRole('heading', { name, exact: true }) });
      if ((await card.count()) && (await card.isEnabled())) {
        await card.click();
        chosen = true;
        break;
      }
    }
    if (!chosen) await page.locator('.relic-card:enabled').first().click();
    if (await page.locator('.replacement').isVisible())
      await page.locator('.replacement button').first().click();
    if (useShop) {
      const stamp = page.getByRole('button', { name: /Extra try/ });
      if (await stamp.isEnabled()) await stamp.click();
      await page.getByRole('button', { name: 'CONTINUE', exact: true }).click();
    }
  }
  expect(await page.evaluate(() => window.__hoof.run?.status)).toBe('won');
  expect(await page.evaluate(() => window.__hoof.run?.history.length)).toBe(9);
  expect(errors).toEqual([]);
  if (memory) {
    // Later acts load new art, but the same actor/effect pools serve every event.
    expect(rows.at(-1)!.heapMB! - rows[2].heapMB!).toBeLessThan(30);
    await memory.detach();
  }
  await info.attach('tour-outcomes', {
    body: JSON.stringify(rows, null, 2),
    contentType: 'application/json',
  });
});
