import { test, expect } from './fixtures';
import { nativeActions } from './inputs';

test('spring and kicks carry a 695.5 m jump past 700 m in the live HUD, results, points and saved record', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts';
    const sim = await import(simPath);
    const c = window.__hoof;
    Object.assign(c.state, {
      x: sim.TRACK.trampoline + 6955,
      vx: 700,
      vy: 450,
      launched: true,
      reactive: true,
      ability: 'spring',
      disaster: 2,
    });
    sim.land(c.state);
    c.publish();
  });
  await expect(page.getByLabel('Equipped ability')).toContainText(
    'Use the right control now',
  );
  await expect(page.locator('.action-pad.secondary')).toBeEnabled();
  await page.locator('canvas').focus();
  const action = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  await action('secondary');
  await expect
    .poll(() => page.evaluate(() => window.__hoof.state.wreck?.abilityReady))
    .toBe(false);
  let previous = 695.5;
  let crossed = false;
  for (let i = 0; i < 250; i++) {
    const state = await page.evaluate(() => ({
      phase: window.__hoof.state.phase,
      distance: window.__hoof.state.distance,
      flight: window.__hoof.state.flightDistance,
      playerX: window.__hoof.state.wreck?.focusX,
    }));
    expect(state.distance).toBeGreaterThanOrEqual(previous);
    expect(state.flight).toBe(695.5);
    if (state.playerX !== undefined)
      expect(state.distance + 1e-6).toBeGreaterThanOrEqual(
        (state.playerX - 1120) / 10,
      );
    previous = state.distance;
    if ([5, 20, 35].includes(i)) await action('primary');
    if (!crossed && state.distance > 700) {
      crossed = true;
      await expect(page.locator('.hud-metric')).toContainText('Total distance');
      await expect(page.locator('.hud-metric')).toContainText(
        'm after landing',
      );
      await page.screenshot({
        path: `output/playwright/distance-${info.project.name}-past-700.png`,
      });
    }
    if (state.phase === 'results') break;
    await page.waitForTimeout(65);
  }
  expect(crossed).toBe(true);
  await expect(
    page.getByRole('region', { name: 'Attempt results' }),
  ).toBeVisible();
  const result = await page.evaluate(() => {
    const c = window.__hoof;
    return {
      distance: c.state.distance,
      score: c.run!.score,
      style: c.state.style,
      havoc: c.state.havoc,
      saved: c.save.last[0].distance,
      best: c.save.best,
      replay: c.recording().frames.at(-1)!.distance,
    };
  });
  expect(result.distance).toBeGreaterThan(700);
  expect(result.score).toBe(
    Math.round(result.distance * 10 + result.style + result.havoc),
  );
  expect(result.saved).toBe(result.distance);
  expect(result.best).toBe(result.distance);
  expect(result.replay).toBe(result.distance);
  await expect(page.locator('.result-distance')).toContainText(
    result.distance.toFixed(1),
  );
  await expect(page.locator('.result-measure')).toContainText('695.5 m jump');
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => window.__hoof.run!.score)).toBe(
    result.score,
  );
  await page.getByRole('button', { name: 'AGAIN', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  expect(
    await page.evaluate(() => [
      window.__hoof.state.distance,
      window.__hoof.state.flightDistance,
    ]),
  ).toEqual([0, 0]);
  expect(errors).toEqual([]);
});
