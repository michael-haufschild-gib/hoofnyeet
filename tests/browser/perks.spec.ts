import { test, expect } from './fixtures';
import { nativeActions } from './inputs';
import type { PerkEffects } from '../../lib/game/effects/perk-effects';

test('chosen bean propulsion and pocket weather visibly activate with real flight controls', async ({
  page,
}, info) => {
  test.setTimeout(70000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^PLAY TOUR/ }).click();
  for (const name of ['Bean propulsion', 'Pocket weather']) {
    // Start at the earned reward boundary; choose both through the actual UI.
    await page.evaluate(() => {
      const c = window.__hoof;
      c.setExporting(true);
      Object.assign(c.run!, {
        status: 'pitstop',
        offers: ['beans', 'tailwind', 'wings'],
        rewardTaken: false,
      });
      c.screen = 'pitstop';
      c.publish();
    });
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.waitForFunction(
      () => window.__hoof.screen === 'game' && window.__hoof.ready,
    );
  }
  expect(await page.evaluate(() => window.__hoof.state.equipment)).toEqual(
    expect.arrayContaining(['beans', 'tailwind']),
  );
  expect(await page.evaluate(() => window.__hoof.save.run!.passives)).toEqual(
    expect.arrayContaining(['beans', 'tailwind']),
  );
  await page.evaluate(() => window.__hoof.setExporting(false));
  await page.locator('canvas').focus();
  const action = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  let flapped = false;
  for (let i = 0; i < 220; i++) {
    const s = await page.evaluate(() => window.__hoof.snapshot());
    if (s.phase === 'runup')
      await action(s.jump.ready ? 'secondary' : 'primary');
    if (s.phase === 'flight' && s.distance > 45) {
      await expect(
        page.getByRole('button', { name: 'FART BOOST', exact: true }),
      ).toBeVisible();
      await action('primary');
      flapped = true;
      await page.waitForFunction(() => {
        const fx = (
          window.__hoof.renderer as unknown as { perkEffects: PerkEffects }
        ).perkEffects;
        return (
          fx.behind.children.filter(
            (p) => p.label === 'propulsion-puff' && p.visible && p.alpha > 0.1,
          ).length >= 2
        );
      });
      await page.screenshot({
        path: `output/playwright/perks-${info.project.name}-fart.png`,
      });
      break;
    }
    if (s.phase === 'landing') break;
    await page.waitForTimeout(55);
  }
  expect(flapped).toBe(true);
  const feedback = await page.evaluate(() => {
    const c = window.__hoof;
    const fx = (c.renderer as unknown as { perkEffects: PerkEffects })
      .perkEffects;
    const cloud = fx.behind.children.find((p) => p.label === 'pocket-weather')!;
    const puffs = fx.behind.children.filter(
      (p) => p.label === 'propulsion-puff' && p.visible,
    );
    return {
      cloud: cloud.visible,
      bounds: {
        x: cloud.getBounds().x,
        y: cloud.getBounds().y,
        width: cloud.getBounds().width,
      },
      puffs: puffs.map((p) => ({
        width: p.getBounds().width,
        x: p.getBounds().x,
      })),
      boost: c.recording().events.find((e) => e.propulsion)?.propulsion,
    };
  });
  expect(feedback.cloud).toBe(true);
  expect(feedback.bounds.x).toBeGreaterThan(-25);
  expect(feedback.bounds.y).toBeGreaterThan(0);
  expect(feedback.bounds.x + feedback.bounds.width).toBeLessThan(
    page.viewportSize()!.width,
  );
  expect(feedback.puffs.some((p) => p.width > 22)).toBe(true);
  expect(feedback.boost!.power).toBe(1.6);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const frozen = await page
    .locator('canvas')
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.waitForTimeout(220);
  expect(
    await page
      .locator('canvas')
      .evaluate((c) => (c as HTMLCanvasElement).toDataURL()),
  ).toBe(frozen);
  expect(errors).toEqual([]);
});

test('perk animation is readable, bounded and identical on replay, with reduced effects still communicating the boost', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.evaluate(() => window.__hoof.setExporting(true));
  const result = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      contentPath = '/lib/game/content.ts',
      motionPath = '/lib/game/effects/perk-motion.ts';
    const sim = await import(simPath),
      content = await import(contentPath),
      motion = await import(motionPath);
    const r = window.__hoof.renderer;
    const fx = (r as unknown as { perkEffects: PerkEffects }).perkEffects;
    const render = (equipment: string[], reduced = false) => {
      const s = sim.createGame();
      Object.assign(s, {
        phase: 'flight',
        phaseTime: 2,
        x: 2400,
        y: -180,
        vx: 640,
        vy: 30,
        time: 5,
        equipment,
        mod: content.modifiers(equipment),
        launched: true,
      });
      sim.act(s, 'primary');
      const e = motion.recordPerkEvent(s.events.at(-1), s);
      r.reduced = reduced;
      r.reset();
      r.event(e);
      // Drive state and scene time, never wall-clock animation timers.
      for (let i = 0; i < 36; i++) {
        sim.stepGame(s);
        r.draw(s, sim.STEP, s.time);
      }
      const capture = () => r.canvas.toDataURL('image/webp');
      const captureMotion = () =>
        fx.behind.children
          .filter((p) => p.label === 'propulsion-puff' && p.visible)
          .map((p) => ({ x: p.x, y: p.y, angle: p.rotation, alpha: p.alpha }));
      const first = capture();
      const recordedMotion = captureMotion();
      const active = fx.behind.children.filter(
        (p) => p.label === 'propulsion-puff' && p.visible,
      ).length;
      const count = fx.behind.children.length;
      r.event(e); // Duplicate delivery must not create another burst.
      r.draw(s, 0, s.time);
      const duplicate = captureMotion();
      const state = JSON.stringify(s);
      r.reset();
      r.event(JSON.parse(JSON.stringify(e)));
      r.draw({ ...s, sceneTime: s.time, time: 99 }, 0, 99);
      return {
        first,
        motion: recordedMotion,
        duplicate,
        replay: captureMotion(),
        active,
        count,
        unchanged: state === JSON.stringify(s),
      };
    };
    const beans = render(['beans']),
      weather = render(['tailwind']),
      combined = render(['beans', 'tailwind']);
    const reduced = render(['beans', 'tailwind'], true);
    // Inspect the other flight upgrades together at a fixed roll pose.
    const s = sim.createGame();
    Object.assign(s, {
      phase: 'flight',
      x: 2400,
      y: -180,
      vx: 650,
      vy: 20,
      phaseTime: 2,
      time: 4,
      launched: true,
      equipment: ['rocket', 'feather', 'acrobat', 'wings'],
      flipActive: true,
      flipProgress: 0.18,
      rotation: 0.18 * Math.PI * 2,
    });
    r.reduced = false;
    r.reset();
    r.draw(s, 0, s.time);
    return {
      beans,
      weather,
      combined,
      reduced,
      other: r.canvas.toDataURL('image/webp'),
    };
  });
  for (const key of ['beans', 'combined', 'reduced'] as const) {
    expect(result[key].active).toBeGreaterThan(0);
    expect(result[key].duplicate).toEqual(result[key].motion);
    expect(result[key].replay).toEqual(result[key].motion);
    expect(result[key].unchanged).toBe(true);
  }
  expect(result.weather.active).toBe(0);
  expect(result.reduced.active).toBe(1);
  expect(result.combined.active).toBeGreaterThan(result.beans.active);
  expect(result.beans.count).toBe(result.reduced.count);
  expect(result.beans.first).not.toBe(result.weather.first);
  // Keep screenshots for human inspection, beyond scene-graph assertions.
  for (const key of [
    'beans',
    'weather',
    'combined',
    'reduced',
    'other',
  ] as const) {
    const data = key === 'other' ? result.other : result[key].first;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(
      `output/playwright/perks-${info.project.name}-${key}.webp`,
      Buffer.from(data.split(',')[1], 'base64'),
    );
  }
  expect(errors).toEqual([]);
});
