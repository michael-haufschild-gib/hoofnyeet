import { test, expect } from './fixtures';
import type { Container } from 'pixi.js';
import type { GameState } from '../../lib/game/simulation';

test('impact graphics and pony motion freeze together and slow replay uses recorded time', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts';
    const sim = await import(simPath);
    const c = window.__hoof;
    c.setExporting(true);
    c.renderer.reset();
    const s: GameState = sim.createGame();
    Object.assign(s, {
      phase: 'flight',
      x: 2200,
      y: -200,
      vx: 650,
      vy: -50,
      sceneTime: 8,
      time: 10,
    });
    c.renderer.draw(s, 0, s.time);
    c.renderer.event({
      id: 'freeze-review',
      kind: 'land',
      x: 2200,
      y: -70,
      time: 10,
    });
    c.renderer.draw(s, 1 / 60, s.time);
    const image = c.renderer.canvas.toDataURL();
    const effects = c.renderer as unknown as {
      impactEffects: {
        bursts: { age: number }[];
        backdrop: Container;
        container: Container;
      };
      actors: Container;
    };
    const burst = effects.impactEffects.bursts.find((b) => b.age < 1)!;
    const frozenAge = burst.age;
    for (let i = 1; i <= 12; i++) {
      s.time = 10 + i / 60;
      c.renderer.draw(s, 1 / 60, s.time);
    }
    const identicalFreeze = image === c.renderer.canvas.toDataURL();
    const ageAfterFreeze = burst.age;
    for (let i = 1; i <= 30; i++) {
      s.sceneTime = 8 + i / 120;
      s.time = 10.2 + i / 60;
      c.renderer.draw(s, 1 / 60, s.time);
    }
    const world = effects.actors.parent!;
    return {
      identicalFreeze,
      frozenAge,
      ageAfterFreeze,
      replayAge: burst.age,
      raysBehindPony:
        world.getChildIndex(effects.impactEffects.backdrop) <
        world.getChildIndex(effects.actors),
      effectsInFront:
        world.getChildIndex(effects.impactEffects.container.parent!) >
        world.getChildIndex(effects.actors),
    };
  });
  expect(proof.identicalFreeze).toBe(true);
  expect(proof.ageAfterFreeze).toBe(proof.frozenAge);
  expect(proof.replayAge - proof.ageAfterFreeze).toBeCloseTo(0.25, 6);
  expect(proof.raysBehindPony).toBe(true);
  expect(proof.effectsInFront).toBe(true);
});
