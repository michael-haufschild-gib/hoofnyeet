import { test, expect } from './fixtures';
import { nativeActions } from './inputs';
import type { CrashWorld } from '../../lib/game/crash';
import type { RigidBody } from '@dimforge/rapier2d-compat';

test('a late right-click or touch ability survives the old cutoff, pause and another kick before settling once', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      physicsPath = '/lib/game/crash.ts';
    const sim = await import(simPath),
      physics = await import(physicsPath);
    const c = window.__hoof;
    c.setExporting(true);
    Object.assign(c.state, {
      launched: true,
      x: 3120,
      vx: 720,
      vy: 650,
      seed: 31,
      disaster: 2,
      ability: 'spring',
    });
    sim.land(c.state);
    c.state.landing = 'accordion';
    const crash: CrashWorld = new physics.CrashWorld(c.state);
    (c as unknown as { crash: CrashWorld }).crash = crash;
    for (let i = 0; i < 1500; i++) {
      sim.stepGame(c.state, sim.STEP);
      crash.step(sim.STEP);
      sim.applyCrashFrame(c.state, crash.snapshot());
      crash.drain();
    }
    const rig = crash as unknown as {
      controlled: RigidBody;
      disassemble(): void;
    };
    rig.disassemble();
    rig.controlled.setTranslation({ x: 150, y: -1 }, true);
    rig.controlled.setLinvel({ x: 0, y: 0 }, true);
    rig.controlled.setAngvel(0, true);
    rig.controlled.setGravityScale(1, true);
    c.state.hitStop = 0;
    c.publish();
    c.setExporting(false);
  });
  await page.locator('canvas').focus();
  const tap = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    true,
  );
  await page.waitForFunction(() => window.__hoof.state.wreck!.time >= 13.7);
  const before = await page.evaluate(() => ({
    distance: window.__hoof.state.distance,
    y: window.__hoof.state.wreck!.focusY,
  }));
  expect(before.y).toBeGreaterThan(-65);
  await tap('secondary');
  await page.waitForFunction(() => window.__hoof.state.wreck!.time >= 14.5);
  expect(await page.evaluate(() => window.__hoof.state.phase)).toBe('landing');
  expect(
    await page.evaluate(() => window.__hoof.state.wreck!.focusY),
  ).toBeLessThan(before.y - 80);
  expect(
    await page.evaluate(() => window.__hoof.state.distance),
  ).toBeGreaterThan(before.distance + 15);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const paused = await page.evaluate(() => window.__hoof.state.wreck!.time);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__hoof.state.wreck!.time)).toBe(
    paused,
  );
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await page.locator('canvas').focus();
  await tap('primary');
  expect(await page.evaluate(() => window.__hoof.state.wreck!.kicks)).toBe(2);
  await page.screenshot({
    path: `output/playwright/late-launch-${info.project.name}.png`,
  });
  await expect(
    page.getByRole('region', { name: 'Attempt results' }),
  ).toBeVisible({ timeout: 25000 });
  const result = await page.evaluate(() => {
    const c = window.__hoof,
      recording = c.recording();
    return {
      settled: c.state.wreck!.settled,
      rounds: c.save.rounds,
      distance: c.state.distance,
      final: recording.frames.at(-1)!.distance,
      time: c.state.wreck!.time,
    };
  });
  expect(result.settled).toBe(true);
  expect(result.time).toBeGreaterThan(16);
  expect(result.distance).toBeGreaterThan(before.distance + 40);
  expect(result.final).toBeCloseTo(result.distance, 1);
  expect(result.rounds).toBe(1);
  await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  expect(await page.evaluate(() => window.__hoof.save.rounds)).toBe(1);
  expect(errors).toEqual([]);
});
