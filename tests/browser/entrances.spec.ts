import { test, expect } from './fixtures';
import type { Sprite } from 'pixi.js';

test('a nuclear camera pullback cannot materialize the arriving encore inside the shot', async ({
  page,
}, info) => {
  if (!info.project.name.startsWith('phone'))
    await page.setViewportSize({ width: 915, height: 412 });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(async () => {
    const c = window.__hoof;
    c.setExporting(true);
    await c.renderer.prepareLevel(
      'afterlife',
      'buttercup',
      undefined,
      'dynamite',
    );
    const path = '/lib/game/simulation.ts';
    const { createGame } = await import(path);
    c.state = Object.assign(createGame(), {
      phase: 'landing',
      world: 'afterlife',
      x: 3000,
      impactX: 3000,
      reactive: true,
      landing: 'dignified',
      time: 8,
      sceneTime: 8,
      ability: 'dynamite',
    });
    c.state.wreck = {
      bodies: [
        {
          id: 1,
          part: 'offended-head',
          x: 3000,
          y: -42,
          w: 74,
          h: 83,
          angle: 0,
          tint: 0xffffff,
          alpha: 1,
          boss: false,
        },
      ],
      focusId: 1,
      headId: 1,
      focusX: 3000,
      focusY: -42,
      time: 8,
      kicks: 0,
      abilityReady: false,
      abilityAge: 2,
      havoc: 20,
      bossHits: 0,
      caption: '',
      flash: 0,
      synergy: '',
      carnage: {
        cues: [
          {
            id: 'blast',
            kind: 'nuclear',
            at: 6,
            x: 3000,
            y: 0,
            seed: 31,
            power: 1,
            world: 'afterlife',
          },
          {
            id: 'new-landing',
            kind: 'landing',
            stage: 0,
            at: 8,
            x: 3000,
            y: 0,
            seed: 31,
            power: 1,
            world: 'afterlife',
            landing: 'dignified',
            encore: 1,
          },
        ],
        attachments: [],
      },
    };
    c.screen = 'game';
    c.publish();
  });
  await expect(page.locator('.action-pad.primary')).toBeVisible();
  const report = await page.evaluate(() => {
    const c = window.__hoof,
      r = c.renderer,
      s = c.state;
    const effects = (r as unknown as { carnageEffects: { pool: Sprite[] } })
      .carnageEffects;
    r.resize();
    r.reset();
    const source = JSON.stringify(s.wreck!.carnage),
      initial: string[] = [];
    let first: { time: number; visibleWidth: number; width: number } | null =
      null;
    for (let tick = 0; tick <= 390; tick++) {
      s.time = s.sceneTime = s.wreck!.time = 6 + tick / 120;
      r.draw(s, 1 / 120, s.time);
      const actors = effects.pool.filter(
        (p) => p.visible && p.label.startsWith('encore-'),
      );
      for (const actor of actors) {
        const b = actor.getBounds();
        if (b.minX >= r.w || b.maxX <= 0) continue;
        if (tick === 240) initial.push(actor.label);
        if (!first && actor.label === 'encore-soul-toaster')
          first = {
            time: s.time,
            visibleWidth: Math.min(r.w, b.maxX) - Math.max(0, b.minX),
            width: b.maxX - b.minX,
          };
      }
    }
    const image = r.canvas.toDataURL();
    r.draw(s, 0.5, 400);
    return {
      initial,
      first,
      frozen: image === r.canvas.toDataURL(),
      sourceIntact: source === JSON.stringify(s.wreck!.carnage),
      bodyCount: s.wreck!.bodies.length,
    };
  });
  expect(report.initial).toEqual([]);
  expect(report.first?.time).toBeGreaterThan(8);
  expect(report.first!.time).toBeLessThan(9.1);
  expect(report.first!.visibleWidth).toBeLessThan(
    Math.min(20, report.first!.width / 2),
  );
  expect(report.frozen).toBe(true);
  expect(report.sourceIntact).toBe(true);
  expect(report.bodyCount).toBe(1);
  await page.screenshot({
    path: `output/playwright/polish-20260910/nuclear-entrance-${info.project.name}.png`,
  });
});
