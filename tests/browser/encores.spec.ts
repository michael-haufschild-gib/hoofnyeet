import { test, expect } from './fixtures';
import { writeFile } from 'node:fs/promises';
import type { GameState } from '../../lib/game/simulation';
import type { CarnageEffects } from '../../lib/game/effects/slapstick/carnage-effects';
import type { Sprite, Graphics } from 'pixi.js';

test('encore artwork is world-lazy and GPU-resident before a course is ready', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (r) => {
    if (/\/(organ-cart|lunar-blender|soul-toaster)\.webp/.test(r.url()))
      requested.push(r.url().split('/').at(-1)!);
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(requested).toEqual([]);
  for (const [world, expected] of [
    ['farm', []],
    ['candy', ['organ-cart.webp']],
    ['moon', ['organ-cart.webp', 'lunar-blender.webp']],
    [
      'afterlife',
      ['organ-cart.webp', 'lunar-blender.webp', 'soul-toaster.webp'],
    ],
  ] as const) {
    await page.evaluate(async (world) => {
      const c = window.__hoof;
      c.setExporting(true);
      await c.renderer.prepareLevel(world, 'buttercup');
    }, world);
    expect(requested).toEqual(expected);
    expect(
      await page.evaluate(
        () => window.__hoof.renderer.app.renderer.prepare.getQueue().length,
      ),
    ).toBe(0);
  }
});

test('six encores retain the original cartoons, animate recorded poses and clear on retry', async ({
  page,
}, info) => {
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    const simPath = '/lib/game/simulation.ts';
    const { createGame } = await import(simPath);
    const effects = (
      r as unknown as {
        carnageEffects: Pick<CarnageEffects, 'stats'> & {
          pool: Sprite[];
          encoreInk: Graphics;
          encore: { behind: Graphics };
        };
      }
    ).carnageEffects;
    const rows = [],
      pictures = [];
    const actors = () =>
      effects.pool.filter((p) => p.visible && p.label.startsWith('encore-'));
    let state: GameState;
    for (const world of [
      'farm',
      'candy',
      'carnival',
      'office',
      'moon',
      'afterlife',
    ] as const) {
      await r.prepareLevel(world, 'buttercup');
      for (const gentle of [false, true]) {
        r.gentle = r.reduced = gentle;
        for (const seed of [31, 91, 125]) {
          for (const age of [1.2, 2.52, 3.9, 5.18]) {
            state = createGame();
            Object.assign(state, {
              phase: 'landing',
              world,
              x: 3000,
              impactX: 3000,
              reactive: true,
              landing: 'dignified',
              time: 8 + age,
              sceneTime: 8 + age,
            });
            state.wreck = {
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
              time: 8 + age,
              kicks: 0,
              abilityReady: false,
              abilityAge: 20,
              havoc: 20,
              bossHits: 0,
              caption: '',
              flash: 0,
              synergy: '',
              carnage: {
                cues: [
                  {
                    id: 'new-landing',
                    kind: 'landing',
                    stage: 0,
                    at: 8,
                    x: 3000,
                    y: 0,
                    seed,
                    power: 1,
                    world,
                    landing: 'dignified',
                    encore: 1,
                  },
                ],
                attachments: [],
              },
            };
            r.reset();
            r.draw(state, 0, state.time);
            const before = JSON.stringify(state),
              live = r.canvas.toDataURL();
            const count = actors().length;
            const old = effects.pool.filter(
              (p) => p.visible && p.label.startsWith('sideshow-'),
            ).length;
            const feet = actors()
              .filter((p) =>
                [
                  'encore-organ-cart',
                  'encore-lunar-blender',
                  'encore-soul-toaster',
                ].includes(p.label),
              )
              .map((p) => p.y + (0.983 - 0.5) * p.height);
            const machines = actors()
              .filter((p) =>
                [
                  'encore-organ-cart',
                  'encore-lunar-blender',
                  'encore-soul-toaster',
                ].includes(p.label),
              )
              .map((p) => {
                const b = p.getBounds();
                return [b.minX, b.maxX, r.w];
              });
            r.draw(state, 1, 100);
            const frozen = r.canvas.toDataURL() === live;
            r.reset();
            r.draw({ ...state, time: 90 }, 0, 90);
            rows.push({
              world,
              gentle,
              seed,
              age,
              count,
              old,
              feet,
              machines,
              frozen,
              replay: r.canvas.toDataURL() === live,
              immutable: before === JSON.stringify(state),
              pool: effects.stats().allocatedSprites,
              used: effects.stats().visibleSprites,
            });
            if (seed === 31 && (age === 3.9 || age === 5.18))
              pictures.push({ world, gentle, age, data: live });
          }
        }
      }
      // Only footage with the new receipt gains the supporting subplot.
      state!.wreck!.carnage!.cues[0].encore = undefined;
      r.reset();
      r.draw(state!, 0, state!.time);
      if (actors().length)
        throw new Error('legacy footage acquired encore actors');
    }
    r.reset();
    return {
      rows,
      pictures,
      cleared:
        !effects.pool.some((p) => p.visible) &&
        effects.encoreInk.getLocalBounds().width === 0 &&
        effects.encore.behind.getLocalBounds().width === 0,
    };
  });
  for (const row of report.rows) {
    const name = `${row.world}/${row.gentle}/${row.seed}/${row.age}`;
    expect(row.count, name).toBeGreaterThan(1);
    expect(row.old, name).toBeGreaterThan(1);
    expect(row.frozen, name).toBe(true);
    expect(row.replay, name).toBe(true);
    expect(row.immutable, name).toBe(true);
    expect(row.pool).toBe(192);
    expect(row.used).toBeLessThanOrEqual(192);
    for (const foot of row.feet) {
      expect(foot, name).toBeLessThan(1);
      expect(foot, name).toBeGreaterThan(-5);
    }
    for (const [left, right, width] of row.machines) {
      expect(left, name).toBeGreaterThan(8);
      expect(right, name).toBeLessThan(width - 8);
    }
  }
  for (const shot of report.pictures)
    await writeFile(
      `output/playwright/polish-20260910/encore-${info.project.name}-${shot.world}-${shot.gentle ? 'gentle' : 'normal'}-${shot.age}.png`,
      Buffer.from(shot.data.split(',')[1], 'base64'),
    );
  expect(report.cleared).toBe(true);
  expect(errors).toEqual([]);
});
