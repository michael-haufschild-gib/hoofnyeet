import { test, expect } from './fixtures';
import type { GameState } from '../../lib/game/simulation';
import type { CombustionEffects } from '../../lib/game/effects/combustion';
import type { WebGLRenderer } from 'pixi.js';

declare global {
  interface Window {
    __combustionState: GameState;
  }
}

test('recorded ignition adds bounded fire, cools into smoke and survives graphics recovery', async ({
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
    await r.loadWorld('farm');
    const fire = (
      r as unknown as { carnageEffects: { combustion: CombustionEffects } }
    ).carnageEffects.combustion;
    const s = createGame() as GameState;
    Object.assign(s, {
      phase: 'landing',
      world: 'farm',
      x: 3000,
      impactX: 3000,
      reactive: true,
    });
    s.wreck = {
      bodies: [
        {
          id: 1,
          part: 'skeletal-torso',
          x: 3000,
          y: -43,
          w: 110,
          h: 76,
          angle: -0.1,
          tint: 0xffffff,
          alpha: 1,
          boss: false,
          injury: 2,
        },
      ],
      focusId: 1,
      focusX: 3000,
      focusY: -43,
      time: 2.4,
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
            id: 'ignition-proof',
            kind: 'ignite',
            at: 2,
            x: 3000,
            y: -35,
            seed: 31,
            power: 1.8,
            world: 'farm',
          },
        ],
      },
    };
    const captures: { id: string; url: string }[] = [];
    const image = () => r.canvas.toDataURL('image/webp', 0.9);
    let freeze = true,
      replay = true,
      immutable = true;
    for (const age of [0.14, 0.42, 0.88, 1.28]) {
      s.time = s.sceneTime = s.wreck.time = 2 + age;
      r.reset();
      const before = JSON.stringify(s);
      r.draw(s, 0, s.time);
      const live = image();
      captures.push({ id: `fire-${age}`, url: live });
      r.draw(s, 0.4, s.time);
      freeze &&= image() === live;
      r.reset();
      r.draw({ ...s, time: 88, sceneTime: s.time }, 0, 88);
      replay &&= image() === live;
      immutable &&= JSON.stringify(s) === before;
    }
    s.time = s.sceneTime = s.wreck.time = 2.42;
    r.draw(s, 0, s.time);
    const full = image();
    fire.view.visible = false;
    r.app.render();
    const original = image();
    captures.push({ id: 'original-ovals', url: original });
    r.gentle = true;
    r.draw(s, 0, s.time);
    const gentle = image();
    captures.push({ id: 'gentle', url: gentle });
    r.reduced = true;
    r.draw(s, 0, s.time);
    const reducedCleared =
      !fire.view.visible && fire.flames.every((f) => !f.visible);
    fire.update(
      s.wreck.carnage!.cues,
      s.wreck.time,
      2500,
      3500,
      false,
      false,
      0.5,
    );
    const budgetCleared =
      !fire.view.visible && fire.flames.every((f) => !f.visible);
    fire.update(
      Array.from({ length: 30 }, (_, i) => ({
        ...s.wreck!.carnage!.cues[0],
        id: `many-${i}`,
      })),
      s.wreck.time,
      2500,
      3500,
      false,
      false,
      1,
    );
    const bounded = fire.flames.length === 6 && fire.view.children.length === 6;
    r.gentle = r.reduced = false;
    r.reset();
    const resetCleared =
      !fire.view.visible && fire.flames.every((f) => !f.visible);
    window.__combustionState = s;
    r.draw(s, 0, s.time);
    const extension = (r.app.renderer as WebGLRenderer).gl.getExtension(
      'WEBGL_lose_context',
    );
    if (extension) window.__contextLoss = extension;
    return {
      captures,
      freeze,
      replay,
      immutable,
      contribution: full !== original,
      gentleDifferent: full !== gentle,
      reducedCleared,
      budgetCleared,
      bounded,
      resetCleared,
      recoverable: !!extension,
      beforeRecovery: image(),
    };
  });
  for (const shot of proof.captures)
    await info.attach(`${info.project.name}-combustion-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(proof.freeze).toBe(true);
  expect(proof.replay).toBe(true);
  expect(proof.immutable).toBe(true);
  expect(proof.contribution).toBe(true);
  expect(proof.gentleDifferent).toBe(true);
  expect(proof.reducedCleared).toBe(true);
  expect(proof.budgetCleared).toBe(true);
  expect(proof.bounded).toBe(true);
  expect(proof.resetCleared).toBe(true);
  if (proof.recoverable) {
    await page.evaluate(() => window.__contextLoss.loseContext());
    await expect
      .poll(() => page.evaluate(() => window.__hoof.graphicsLost))
      .toBe(true);
    await page.evaluate(() => window.__contextLoss.restoreContext());
    await expect
      .poll(() => page.evaluate(() => window.__hoof.graphicsLost))
      .toBe(false);
    const restored = await page.evaluate(() => {
      const r = window.__hoof.renderer;
      r.draw(window.__combustionState, 0, window.__combustionState.time);
      return r.canvas.toDataURL('image/webp', 0.9);
    });
    await info.attach(`${info.project.name}-combustion-restored`, {
      body: Buffer.from(restored.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
    expect(restored === proof.beforeRecovery, 'restored scene pixels').toBe(
      true,
    );
  }
  const disposed = await page.evaluate(() => {
    const c = window.__hoof;
    const fire = (
      c.renderer as unknown as {
        carnageEffects: { combustion: CombustionEffects };
      }
    ).carnageEffects.combustion;
    const meshes = [...fire.flames];
    c.dispose();
    fire.dispose();
    return meshes.every((m) => m.destroyed);
  });
  expect(disposed).toBe(true);
  expect(errors).toEqual([]);
});
