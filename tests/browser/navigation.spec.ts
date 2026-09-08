import { test, expect } from './fixtures';
import { nativeActions, returnHome } from './inputs';
import { WORLDS } from '../../lib/game/content';
import type { Sprite } from 'pixi.js';

test('home exposes levels, pony customization and the complete upgrade collection', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await expect(page.getByRole('button', { name: /^PLAY TOUR/ })).toBeVisible();
  for (const name of ['Levels', 'Pony & hats', 'Upgrades'])
    await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Levels', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose a level' }),
  ).toBeVisible();
  await expect(page.locator('.level-browser button')).toHaveCount(6);
  for (const world of WORLDS)
    await expect(
      page.getByRole('button', { name: `Play ${world.name}`, exact: true }),
    ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.level-browser img')
        .evaluateAll((images) =>
          images.every((node) => (node as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  const levelBounds = await page
    .locator('.level-browser button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
    );
  for (const bounds of levelBounds) {
    expect(bounds.top).toBeGreaterThan(0);
    expect(bounds.bottom).toBeLessThan(page.viewportSize()!.height);
  }
  await page.screenshot({
    path: `output/playwright/navigation-${info.project.name}-levels.png`,
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: /Dressing room/ }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.pony-portrait img')).toHaveCount(4);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Upgrades', exact: true }).click();
  await expect(
    page.getByText('Play a tour. Clear an event. Pick an upgrade.'),
  ).toBeVisible();
  await expect(
    page.locator('.upgrade-catalogue').first().locator('article'),
  ).toHaveCount(6);
  await expect(
    page.locator('.upgrade-catalogue').last().locator('article'),
  ).toHaveCount(24);
  const dynamite = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Dynamite Diaper', exact: true }),
  });
  await dynamite.scrollIntoViewIfNeeded();
  await expect(dynamite).toContainText('Use the right control after landing.');
  await expect(dynamite).toContainText('Available in tours');
  await page.screenshot({
    path: `output/playwright/navigation-${info.project.name}-upgrades.png`,
  });
  await page.locator('.dialog-body').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const close = page.getByRole('button', { name: 'Close', exact: true });
  const rect = await close.boundingBox();
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThan(page.viewportSize()!.height);
  await close.click();
  expect(errors).toEqual([]);
});

test('a selected quick level survives retry and preserves the saved tour', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^PLAY TOUR/ }).click();
  await page.locator('.route-card').first().click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  await returnHome(page);
  const saved = await page.evaluate(() =>
    structuredClone(window.__hoof.save.run),
  );
  await page.getByRole('button', { name: 'Levels', exact: true }).click();
  await page
    .getByRole('button', { name: 'Play Cheese Moon', exact: true })
    .click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.state.world)).toBe('moon');
  await returnHome(page);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.state.world)).toBe('moon');
  await returnHome(page);
  expect(await page.evaluate(() => window.__hoof.save.run)).toEqual(saved);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^RESUME TOUR/ }).click();
  expect(await page.evaluate(() => window.__hoof.run!.seed)).toBe(saved!.seed);
  expect(await page.evaluate(() => window.__hoof.run!.world)).toBe('farm');
});

test('choosing dynamite equips visible gear and the landing control detonates it once', async ({
  page,
}, info) => {
  test.setTimeout(70000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^PLAY TOUR/ }).click();
  // Seed the earned reward boundary; use the actual choice and next-event flow.
  await page.evaluate(() => {
    const c = window.__hoof;
    c.run!.status = 'pitstop';
    c.run!.offers = ['dynamite', 'wings', 'beans'];
    c.run!.salvage = 60;
    c.run!.rewardTaken = false;
    c.screen = 'pitstop';
    c.publish();
  });
  await page.getByRole('button', { name: /Dynamite Diaper/ }).click();
  await page.waitForFunction(
    () => window.__hoof.screen === 'game' && window.__hoof.ready,
  );
  await expect
    .poll(() =>
      page.evaluate(() => ({
        ability: window.__hoof.state.ability,
        saved: window.__hoof.save.run?.ability,
        gear: (
          window.__hoof.renderer as unknown as { gear: Record<string, Sprite> }
        ).gear.tnt.visible,
      })),
    )
    .toEqual({ ability: 'dynamite', saved: 'dynamite', gear: true });
  await expect(page.getByLabel('Equipped ability')).toContainText(
    'Dynamite Diaper',
  );
  await page.screenshot({
    path: `output/playwright/navigation-${info.project.name}-equipped.png`,
  });
  await page.locator('canvas').focus();
  const action = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  let fired = false;
  let contactDistance: number | undefined;
  let lastDistance = 0;
  for (let i = 0; i < 450; i++) {
    const s = await page.evaluate(() => window.__hoof.snapshot());
    if (s.phase === 'runup')
      await action(s.jump.ready ? 'secondary' : 'primary');
    if (s.phase === 'flight') {
      if (s.flaps > 0 && s.y > -630) await action('primary');
      if (s.y < -120) await action('secondary');
    }
    if (s.phase === 'landing') {
      contactDistance ??= s.distance;
      expect(s.distance).toBeGreaterThanOrEqual(lastDistance);
      lastDistance = s.distance;
      if (!fired) {
        await expect(page.getByLabel('Equipped ability')).toContainText(
          'Use the right control now',
        );
        const landingAction = await nativeActions(
          page,
          info.project.name.startsWith('phone'),
          info.project.name === 'firefox',
        );
        await landingAction('secondary');
        fired = true;
        await expect
          .poll(() =>
            page.evaluate(() => window.__hoof.state.wreck?.abilityReady),
          )
          .toBe(false);
        await expect(page.getByLabel('Equipped ability')).toContainText('Used');
        await page.screenshot({
          path: `output/playwright/navigation-${info.project.name}-explosion.png`,
        });
        const age = await page.evaluate(
          () => window.__hoof.state.wreck!.abilityAge,
        );
        await action('secondary');
        expect(
          await page.evaluate(() => window.__hoof.state.wreck!.abilityAge),
        ).toBeGreaterThanOrEqual(age);
      }
    }
    if (s.phase === 'results') break;
    await page.waitForTimeout(65);
  }
  expect(fired).toBe(true);
  await expect(
    page.getByRole('region', { name: 'Attempt results' }),
  ).toBeVisible();
  const incident = await page.evaluate(() => {
    const c = window.__hoof;
    const recording = c.recording();
    const events = recording.events.filter((e) => e.sound === 'explosion');
    return {
      explosions: events.length,
      unique: new Set(events.map((e) => e.id)).size,
      distance: c.state.distance,
      history: c.run!.history.length,
      frames: recording.frames.filter((f) => f.wreck && !f.wreck.abilityReady)
        .length,
    };
  });
  expect(incident.explosions).toBeGreaterThan(0);
  expect(incident.unique).toBe(incident.explosions);
  expect(incident.distance).toBeGreaterThan(contactDistance!);
  expect(incident.history).toBe(1);
  expect(incident.frames).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => window.__hoof.run!.history.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('an explosion immediately after touchdown keeps its own visible burst', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const labels = await page.evaluate(() => {
    const c = window.__hoof;
    c.setExporting(true);
    c.renderer.reset();
    for (const sound of ['land', 'boneclatter', 'explosion'])
      c.renderer.event({ kind: 'crunch', sound, x: 180, y: 0 });
    const effects = c.renderer as unknown as {
      impactEffects: { container: import('pixi.js').Container };
    };
    const texts: string[] = [];
    const visit = (node: import('pixi.js').Container) => {
      if (
        node.visible &&
        typeof (node as import('pixi.js').Text).text === 'string'
      )
        texts.push((node as import('pixi.js').Text).text);
      for (const child of node.children) visit(child);
    };
    visit(effects.impactEffects.container);
    c.setExporting(false);
    return texts;
  });
  expect(labels).toContain('KABLOOEY!');
});
