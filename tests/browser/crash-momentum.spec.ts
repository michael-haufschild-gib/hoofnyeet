import { test, expect } from './fixtures';
import { nativeActions } from './inputs';

test('explosions and late kicks carry the wreck forward with native controls, visible ground and recorded scores', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  // This fixture injects dynamite after launch; prepare its real rendering
  // pipeline first, just as choosing the ability before a normal round does.
  await page.evaluate(() =>
    window.__hoof.renderer.prepareLevel(
      'farm',
      'buttercup',
      undefined,
      'dynamite',
    ),
  );
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      contentPath = '/lib/game/content.ts';
    const sim = await import(simPath),
      content = await import(contentPath);
    const c = window.__hoof,
      equipment = ['confetti', 'aftershock', 'magnet', 'rubber'];
    Object.assign(c.state, {
      world: 'farm',
      disaster: 2,
      launched: true,
      x: 3120,
      vx: 720,
      vy: 650,
      seed: 31,
      ability: 'dynamite',
      equipment,
      mod: content.modifiers(equipment, 'farm'),
    });
    sim.land(c.state);
    c.state.landing = 'accordion';
    c.publish();
  });
  await page.waitForFunction(() => !!window.__hoof.state.wreck);
  await page.locator('canvas').focus();
  const action = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  await page.waitForFunction(() => window.__hoof.state.wreck!.time > 1.3);
  await action('secondary');
  const progress = [];
  for (const at of [2.6, 5.6, 9.2]) {
    await page.waitForFunction(
      (time) => window.__hoof.state.wreck!.time >= time,
      at,
    );
    const before = await page.evaluate(() => ({
      distance: window.__hoof.state.distance,
      x: window.__hoof.state.wreck!.focusX,
    }));
    await action('primary');
    const tappedAt = await page.evaluate(() => window.__hoof.state.wreck!.time);
    await page.waitForFunction(
      (time) => window.__hoof.state.wreck!.time >= time + 0.6,
      tappedAt,
    );
    const view = await page.evaluate(() => {
      const c = window.__hoof;
      return {
        distance: c.state.distance,
        x: c.state.wreck!.focusX,
        ground: c.renderer.framing!.ground,
        height: c.renderer.h,
        bodies: c.state.wreck!.bodies.length,
      };
    });
    // A kick can recover from recoil without passing the earlier high-water
    // mark. Require actual forward travel and independently protect the score.
    expect(view.x).toBeGreaterThan(before.x + 50);
    expect(view.distance).toBeGreaterThanOrEqual(before.distance);
    expect(view.ground).toBeLessThan(view.height);
    expect(view.bodies).toBeLessThanOrEqual(80);
    progress.push(view.distance);
  }
  await page.screenshot({
    path: `output/playwright/forward-crash-${info.project.name}.png`,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const c = window.__hoof;
          return {
            phase: c.state.phase,
            time: c.state.wreck!.time,
            y: c.state.wreck!.focusY,
            settled: c.state.wreck!.settled,
            paused: c.state.paused,
          };
        }),
      { timeout: 25000 },
    )
    .toMatchObject({ phase: 'results' });
  await expect(
    page.getByRole('region', { name: 'Attempt results' }),
  ).toBeVisible();
  const result = await page.evaluate(() => ({
    distance: window.__hoof.state.distance,
    flight: window.__hoof.state.flightDistance,
    recordedDistance: window.__hoof.recording().frames.at(-1)!.distance,
    rounds: window.__hoof.save.rounds,
  }));
  expect(result.flight).toBe(200);
  expect(result.distance).toBeGreaterThanOrEqual(progress.at(-1)!);
  expect(result.distance).toBeGreaterThan(result.flight + 50);
  expect(result.recordedDistance).toBeCloseTo(result.distance, 1);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => window.__hoof.save.rounds)).toBe(
    result.rounds,
  );
  expect(errors).toEqual([]);
});
