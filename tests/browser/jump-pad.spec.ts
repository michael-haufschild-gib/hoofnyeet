import { test, expect } from './fixtures';
import type { Container, Sprite } from 'pixi.js';
import type { GameState } from '../../lib/game/simulation';

test('the real take-off window and trampoline stay visible above their spectators', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const path = '/lib/game/simulation.ts';
    const { createGame, jumpTarget, TRACK } = await import(path);
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    await r.prepareLevel('farm', 'buttercup');
    const scene = r as unknown as {
      world: Container;
      track: Container;
      crowdLayer: Container;
      spectators: Sprite[];
    };
    const shots: { id: string; url: string }[] = [];
    const visible: boolean[] = [];
    for (const speed of [350, 670]) {
      const s = createGame() as GameState;
      Object.assign(s, {
        phase: 'runup',
        speed,
        vx: speed,
        time: 5,
        sceneTime: 5,
      });
      const target = jumpTarget(s);
      s.x = target.center;
      r.reset();
      r.draw(s, 0, s.time);
      const frame = r.framing!;
      const arrowX = r.w / 2 + (target.center - frame.x) * frame.zoom;
      const padX = r.w / 2 + (TRACK.trampoline - frame.x) * frame.zoom;
      visible.push(
        jumpTarget(s).ready &&
          arrowX > 20 &&
          arrowX < r.w - 20 &&
          padX - 113 * frame.zoom > 0 &&
          padX + 113 * frame.zoom < r.w,
      );
      shots.push({
        id: `green-${speed}`,
        url: r.canvas.toDataURL('image/webp', 0.9),
      });
    }
    return {
      shots,
      visible,
      layering:
        scene.world.getChildIndex(scene.crowdLayer) <
        scene.world.getChildIndex(scene.track),
      crowd: scene.spectators.filter((p) => p.visible).length,
    };
  });
  for (const shot of proof.shots)
    await info.attach(`${info.project.name}-pad-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(proof.visible).toEqual([true, true]);
  expect(proof.layering).toBe(true);
  expect(proof.crowd).toBeGreaterThan(1);
});
