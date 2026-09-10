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
      sceneTime: 8,
    });
    c.renderer.draw(s, 1 / 60, s.time);
    const image = c.renderer.canvas.toDataURL();
    const effects = c.renderer as unknown as {
      impactEffects: {
        bursts: { age: number; sprite: { visible: boolean } }[];
        backdrop: Container;
        container: Container;
      };
      actors: Container;
    };
    const burst = effects.impactEffects.bursts.find((b) => b.sprite.visible)!;
    if (!burst)
      throw new Error(
        'The impact must actually be visible before testing its freeze',
      );
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

test('contact shaders and debris have identical frames at different rendering rates and ignore duplicate events', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const path = '/lib/game/simulation.ts';
    const { createGame } = await import(path);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const fx = (
      r as unknown as {
        impactEffects: {
          lens: { filter: { enabled: boolean } };
          motes: {
            sprite: {
              x: number;
              y: number;
              rotation: number;
              alpha: number;
              width: number;
            };
          }[];
          container: Container;
        };
      }
    ).impactEffects;
    const shots: string[] = [],
      poses: number[][][] = [];
    const events = [
      {
        id: 'clock-land',
        kind: 'land' as const,
        x: 2210,
        y: -60,
        sceneTime: 5,
        time: 9,
      },
      {
        id: 'clock-explosion',
        kind: 'crunch' as const,
        sound: 'explosion',
        x: 2240,
        y: -30,
        sceneTime: 5.16,
        time: 9.16,
      },
    ];
    for (const fps of [15, 30, 60, 120]) {
      r.reset();
      const state = createGame();
      Object.assign(state, {
        phase: 'flight',
        phaseTime: 3,
        x: 2200,
        y: -140,
        vx: 420,
        vy: 0,
      });
      let next = 0;
      for (let tick = 0; tick <= Math.ceil(fps * 0.65); tick++) {
        const time = Math.min(5.4, 4.75 + tick / fps);
        while (next < events.length && events[next].sceneTime <= time)
          r.event(events[next++]);
        state.sceneTime = time;
        r.draw(state, 1 / fps, 100 + time);
      }
      if (!fx.lens.filter.enabled)
        throw new Error('Contact refraction was not rendered');
      shots.push(r.canvas.toDataURL());
      poses.push(
        fx.motes.map((m) => [
          m.sprite.x,
          m.sprite.y,
          m.sprite.rotation,
          m.sprite.alpha,
          m.sprite.width,
        ]),
      );
      const count = fx.motes.length;
      r.event(events[1]);
      r.draw(state, 0, 999);
      if (count !== fx.motes.length || shots.at(-1) !== r.canvas.toDataURL())
        throw new Error('Duplicate event changed the incident');
    }
    const effect = r.canvas.toDataURL();
    fx.lens.filter.enabled = false;
    r.app.render();
    const withoutLens = r.canvas.toDataURL();
    r.reset();
    return {
      identical: shots.every((s) => s === shots[0]),
      poses,
      effect,
      lensChangesImage: effect !== withoutLens,
      reset: { motes: fx.motes.length, lens: fx.lens.filter.enabled },
    };
  });
  expect(report.identical).toBe(true);
  for (const pose of report.poses) expect(pose).toEqual(report.poses[0]);
  expect(report.lensChangesImage).toBe(true);
  expect(report.reset).toEqual({ motes: 0, lens: false });
  expect(errors).toEqual([]);
  await info.attach('contact-pressure', {
    body: Buffer.from(report.effect.split(',')[1], 'base64'),
    contentType: 'image/png',
  });
});

test('ability vortex renders its charge and release, respects reduced motion and survives graphics recovery', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts';
    const { createGame } = await import(simPath),
      { CrashWorld } = await import(crashPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const state = createGame();
    Object.assign(state, {
      phase: 'landing',
      reactive: true,
      x: 2800,
      impactX: 2800,
      vx: 250,
      vy: 500,
      ability: 'blackhole',
    });
    const crash = new CrashWorld(state);
    state.wreck = crash.snapshot();
    state.wreck.abilityReady = false;
    const scene = r as unknown as {
      scene: Container;
      impactEffects: {
        lens: { filter: import('pixi.js').Filter };
        portal: import('pixi.js').Sprite;
        portalFilter: import('pixi.js').Filter;
        density: number;
      };
    };
    const captures = [];
    for (const age of [0.15, 0.7, 1.12]) {
      state.wreck.abilityAge = age;
      state.time = state.sceneTime = age;
      r.reset();
      r.draw(state, 0, age);
      if (
        !scene.impactEffects.portal.visible ||
        !scene.impactEffects.lens.filter.enabled
      )
        throw new Error('Ability shader not active');
      const url = r.canvas.toDataURL();
      r.draw(state, 0, age);
      if (url !== r.canvas.toDataURL()) throw new Error('Paused vortex moved');
      captures.push({ age, url });
    }
    r.reduced = true;
    r.draw(state, 0, state.time);
    const reduced =
      !scene.impactEffects.lens.filter.enabled &&
      scene.impactEffects.portal.visible;
    r.reduced = false;
    scene.impactEffects.density = 0.55;
    r.draw(state, 0, state.time);
    const budget =
      !scene.impactEffects.lens.filter.enabled &&
      scene.impactEffects.portal.visible;
    scene.impactEffects.density = 1;
    r.draw(state, 0, state.time);
    const beforeRecovery = r.canvas.toDataURL();
    r.restoreGraphics();
    r.draw(state, 0, state.time);
    const restored =
      scene.scene.filters?.[0] === scene.impactEffects.lens.filter &&
      scene.impactEffects.lens.filter.enabled &&
      scene.impactEffects.portal.visible &&
      beforeRecovery === r.canvas.toDataURL();
    state.wreck.abilityAge = 1.31;
    state.time = state.sceneTime = 1.31;
    r.draw(state, 0, state.time);
    const expired =
      !scene.impactEffects.portal.visible &&
      !scene.impactEffects.lens.filter.enabled;
    crash.dispose();
    return { captures, reduced, budget, restored, expired };
  });
  expect(report.reduced).toBe(true);
  expect(report.budget).toBe(true);
  expect(report.restored).toBe(true);
  expect(report.expired).toBe(true);
  expect(errors).toEqual([]);
  for (const capture of report.captures)
    await info.attach(`vortex-${capture.age}`, {
      body: Buffer.from(capture.url.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
});

test('the animated title stays responsive with idle shader owners', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const before = await page.evaluate(() => window.__hoof.state.time);
  await page.waitForTimeout(12000);
  const after = await page.evaluate(() => ({
    time: window.__hoof.state.time,
    phase: window.__hoof.state.phase,
  }));
  expect(after.phase).toBe('title');
  expect(after.time - before).toBeGreaterThan(9);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
});

test('a replay cut opens with the same living particles and pressure wave without restarting them', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      replayPath = '/lib/game/replay.ts';
    const { createGame } = await import(simPath);
    const { replayLeadIn } = await import(replayPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const state = createGame();
    Object.assign(state, {
      phase: 'flight',
      x: 2210,
      y: -150,
      vx: 430,
      vy: 0,
      time: 10.7,
      sceneTime: 8.7,
    });
    const frames = [{ ...state, time: 10, sceneTime: 8 }, state];
    const events = [
      {
        id: 'cut-impact',
        kind: 'land' as const,
        x: 2210,
        y: -60,
        time: 10.4,
        sceneTime: 8.4,
      },
      {
        id: 'cut-flap',
        kind: 'flap' as const,
        x: 2210,
        y: -130,
        time: 10.5,
        sceneTime: 8.5,
      },
    ];
    r.reset();
    for (const event of events) r.event(event);
    r.draw(state, 0, state.time);
    const live = r.canvas.toDataURL();
    r.reset();
    for (const event of replayLeadIn(events, frames, state.time))
      r.event(event);
    r.draw(state, 0, state.time);
    const cut = r.canvas.toDataURL();
    r.reset();
    r.draw(state, 0, state.time);
    const missing = r.canvas.toDataURL();
    return { equal: live === cut, visible: cut !== missing };
  });
  expect(proof.equal).toBe(true);
  expect(proof.visible).toBe(true);
});
