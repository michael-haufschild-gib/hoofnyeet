import { test, expect } from './fixtures';
import type { Graphics, Sprite } from 'pixi.js';
import type { GameState } from '../../lib/game/simulation';
import type { WorldDefinition } from '../../lib/game/content';

test('each world keeps its original reactions and adds a recorded, grounded spectator disaster', async ({
  page,
}, info) => {
  const errors: string[] = [],
    artRequests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (r.url().includes('/carnage/')) artRequests.push(r.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(artRequests).toEqual([]);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      contentPath = '/lib/game/content.ts';
    const { createGame } = await import(simPath),
      { WORLDS } = await import(contentPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const effects = (
      r as unknown as {
        carnageEffects: {
          pool: Sprite[];
          spectatorInk: Graphics;
          stats(): { allocatedSprites: number; visibleSprites: number };
        };
      }
    ).carnageEffects;
    const reducedRest: { world: string; stable: boolean }[] = [];
    const captures: { id: string; url: string }[] = [],
      rows: {
        world: string;
        actors: number;
        originals: number;
        replay: boolean;
        freeze: boolean;
        immutable: boolean;
        bounds: number[];
        pool: number;
      }[] = [];
    for (const world of WORLDS as WorldDefinition[]) {
      await r.loadWorld(world.id);
      for (const gentle of [false, true]) {
        r.gentle = gentle;
        r.reduced = gentle;
        for (const age of [0.75, 1.65, 2.7, 4.7, 5.5]) {
          const s = createGame() as GameState;
          Object.assign(s, {
            phase: 'landing',
            world: world.id,
            x: 3000,
            impactX: 3000,
            reactive: true,
            landing: 'dignified',
            time: 8 + age,
            sceneTime: 8 + age,
          });
          s.wreck = {
            bodies: [
              {
                id: 1,
                part: 'offended-head',
                x: 3000,
                y: -43,
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
            focusY: -43,
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
                  id: 'sideshow-contact',
                  kind: 'landing',
                  stage: 0,
                  at: 8,
                  x: 3000,
                  y: 0,
                  seed: 31,
                  power: 1,
                  world: world.id,
                  landing: 'dignified',
                },
              ],
              attachments: [],
            },
          };
          r.reset();
          r.draw(s, 0, s.time);
          const capture = () => r.canvas.toDataURL('image/webp', 0.87),
            live = capture();
          const count = effects.pool.filter(
            (p) => p.visible && p.label.startsWith('sideshow-'),
          ).length;
          const original = effects.pool.filter(
            (p) =>
              p.visible && ['carnage-sheep', 'carnage-goose'].includes(p.label),
          ).length;
          const bounds = effects.spectatorInk.getLocalBounds();
          const before = JSON.stringify(s);
          r.draw(s, 0.5, s.time);
          const freeze = capture() === live;
          r.reset();
          r.draw({ ...s, time: 88, sceneTime: s.time }, 0, 88);
          rows.push({
            world: world.id,
            actors: count,
            originals: original,
            replay: capture() === live,
            freeze,
            immutable: JSON.stringify(s) === before,
            bounds: [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY],
            pool: effects.stats().allocatedSprites,
          });
          if (gentle && age === 4.7) {
            const actors = () =>
              JSON.stringify(
                effects.pool
                  .filter((p) => p.visible && p.label.startsWith('sideshow-'))
                  .map((p) => [
                    p.label,
                    p.x,
                    p.y,
                    p.width,
                    p.height,
                    p.rotation,
                  ]),
              );
            const rest = actors();
            r.draw(
              {
                ...s,
                time: s.time + 0.15,
                sceneTime: s.time + 0.15,
                wreck: { ...s.wreck!, time: s.wreck!.time + 0.15 },
              },
              0.15,
              s.time + 0.15,
            );
            reducedRest.push({ world: world.id, stable: actors() === rest });
          }
          if (!gentle || age === 4.7)
            captures.push({
              id: `${world.id}-${gentle ? 'gentle-' : ''}${age}`,
              url: live,
            });
        }
      }
    }
    r.reset();
    return {
      rows,
      reducedRest,
      captures,
      cleared:
        effects.pool.every((p) => !p.visible) &&
        effects.spectatorInk.getLocalBounds().width === 0,
    };
  });
  for (const shot of proof.captures)
    await info.attach(`${info.project.name}-sideshow-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  for (const row of proof.rows) {
    expect(row.actors, row.world).toBeGreaterThan(1);
    expect(row.originals, row.world).toBeGreaterThan(0);
    expect(row.pool).toBe(192);
    expect(row.replay).toBe(true);
    expect(row.freeze).toBe(true);
    expect(row.immutable).toBe(true);
    // Some anticipation frames consist entirely of sprites; an empty Graphics
    // has zero bounds. Check ink when it exists, and require ink for each world.
    if (row.bounds[1] > row.bounds[0]) {
      expect(row.bounds[0]).toBeGreaterThan(2600);
      expect(row.bounds[1]).toBeLessThan(3400);
      expect(row.bounds[2]).toBeGreaterThan(-280);
      expect(row.bounds[3]).toBeLessThan(40);
    }
  }
  expect(proof.reducedRest).toHaveLength(6);
  for (const rest of proof.reducedRest)
    expect(rest.stable, rest.world).toBe(true);
  expect(proof.cleared).toBe(true);
  expect(errors).toEqual([]);
  expect(
    new Set(
      proof.rows
        .filter((row) => row.bounds[1] > row.bounds[0])
        .map((row) => row.world),
    ).size,
  ).toBe(6);
});
