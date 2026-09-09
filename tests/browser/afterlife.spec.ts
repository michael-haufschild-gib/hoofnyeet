import { test, expect } from './fixtures';
import type { Sprite } from 'pixi.js';
import type { GameState } from '../../lib/game/simulation';

test('the illustrated turnstile stays on its axle through rejection and the final helmet gag', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts';
    const { createGame } = await import(simPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    await r.loadWorld('afterlife');
    const effects = (r as unknown as { carnageEffects: { pool: Sprite[] } })
      .carnageEffects;
    const captures: { id: string; url: string }[] = [];
    const rows: {
      axleError: number;
      groundError: number;
      arms: number;
      frozen: boolean;
      replay: boolean;
      immutable: boolean;
    }[] = [];
    for (const reduced of [false, true]) {
      r.reduced = reduced;
      r.gentle = reduced;
      for (const age of [1.7, 1.8, 1.95, 2.15, 2.5, 2.85, 3.2, 3.3, 4.3, 5.3]) {
        const s = createGame() as GameState;
        Object.assign(s, {
          phase: 'landing',
          world: 'afterlife',
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
            attachments: [],
            cues: [
              {
                id: 'queue-contact',
                kind: 'landing',
                stage: 0,
                at: 8,
                x: 3000,
                y: 0,
                seed: 31,
                power: 1,
                world: 'afterlife',
                landing: 'dignified',
              },
            ],
          },
        };
        r.reset();
        r.draw(s, 0, s.time);
        const image = () => r.canvas.toDataURL('image/webp', 0.9);
        const live = image();
        const post = effects.pool.find(
          (p) => p.visible && p.label === 'afterlife-turnstile',
        )!;
        const arms = effects.pool.filter(
          (p) => p.visible && p.label.startsWith('afterlife-arm-'),
        );
        const axle = {
          x: post.x + (0.378 - 0.5) * post.width,
          y: post.y + (0.466 - 0.5) * post.height,
        };
        const before = JSON.stringify(s);
        r.draw(s, 0.2, s.time);
        const frozen = image() === live;
        r.reset();
        r.draw({ ...s, time: 88, sceneTime: s.time }, 0, 88);
        rows.push({
          axleError: Math.hypot(axle.x - 3072, axle.y + 144 * (1 - 0.466)),
          groundError: Math.abs(post.y + post.height * 0.5),
          arms: arms.length,
          frozen,
          replay: image() === live,
          immutable: JSON.stringify(s) === before,
        });
        if (!reduced || age === 3.3)
          captures.push({ id: `${reduced ? 'gentle-' : ''}${age}`, url: live });
      }
    }
    r.reset();
    return { captures, rows, cleared: effects.pool.every((p) => !p.visible) };
  });
  for (const shot of proof.captures)
    await info.attach(`${info.project.name}-queue-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  for (const row of proof.rows) {
    expect(row.axleError).toBeLessThan(0.001);
    expect(row.groundError).toBeLessThan(0.001);
    expect(row.arms).toBe(3);
    expect(row.frozen).toBe(true);
    expect(row.replay).toBe(true);
    expect(row.immutable).toBe(true);
  }
  expect(proof.cleared).toBe(true);
  expect(errors).toEqual([]);
});
