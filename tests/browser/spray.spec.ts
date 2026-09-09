import { test, expect } from './fixtures';
import type { GameState } from '../../lib/game/simulation';
import type { SprayEffects } from '../../lib/game/effects/spray-effects';

test('illustrated spray follows flight, lands as splats and keeps eyes, teeth and world debris', async ({
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
    const path = '/lib/game/simulation.ts';
    const { createGame } = await import(path);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    await r.loadWorld('farm');
    const spray = (r as unknown as { carnageEffects: { spray: SprayEffects } })
      .carnageEffects.spray;
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
      time: 2.3,
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
            id: 'spray-proof',
            kind: 'impact',
            at: 2,
            x: 3000,
            y: -50,
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
      immutable = true,
      floor = true;
    const visibleMaterials = new Set<string>();
    const groundCounts: number[] = [];
    for (const world of ['farm', 'office', 'moon', 'afterlife'] as const) {
      await r.loadWorld(world);
      s.world = s.wreck.carnage!.cues[0].world = world;
      for (const age of [0.22, 0.8, 1.65, 3.1]) {
        s.time = s.sceneTime = s.wreck.time = 2 + age;
        r.reset();
        const before = JSON.stringify(s);
        r.draw(s, 0, s.time);
        const live = image();
        captures.push({ id: `${world}-${age}`, url: live });
        for (const child of spray.air.children)
          if (child.visible) visibleMaterials.add(child.label);
        for (const child of spray.ground.children)
          if (child.visible) floor &&= child.y >= 2 && child.y <= 15;
        groundCounts.push(spray.stats().grounded);
        r.draw(s, 0.3, s.time);
        freeze &&= image() === live;
        r.reset();
        r.draw({ ...s, time: 88, sceneTime: s.time }, 0, 88);
        replay &&= image() === live;
        immutable &&= JSON.stringify(s) === before;
      }
    }
    s.world = s.wreck.carnage!.cues[0].world = 'farm';
    s.time = s.sceneTime = s.wreck.time = 2.3;
    r.reset();
    r.draw(s, 0, s.time);
    const full = image();
    spray.air.visible = false;
    spray.ground.visible = false;
    r.app.render();
    const contribution = image() !== full;
    spray.air.visible = spray.ground.visible = true;
    s.equipment = ['magnet'];
    s.wreck.bodies[0].x = 3090;
    s.time = s.sceneTime = s.wreck.time = 2.85;
    r.reset();
    r.draw(s, 0, s.time);
    captures.push({ id: 'magnetic-teeth', url: image() });
    s.equipment = [];
    r.gentle = true;
    s.time = s.sceneTime = s.wreck.time = 2.8;
    r.reset();
    r.draw(s, 0, s.time);
    captures.push({ id: 'gentle', url: image() });
    const gentleSafe = !spray.air.children.some(
      (p) =>
        p.visible &&
        ['spray-eye', 'spray-tooth', 'spray-bone', 'spray-droplet'].includes(
          p.label,
        ),
    );
    r.reduced = true;
    r.reset();
    r.draw(s, 0, s.time);
    captures.push({ id: 'reduced', url: image() });
    const reducedCount = spray.stats().airborne;
    const effects = (
      r as unknown as { carnageEffects: { update(...args: unknown[]): void } }
    ).carnageEffects;
    // Emitter3000 is beyond this view's230-unit source margin; its debris is not.
    effects.update(s, false, false, 1, 3420, 200, 1, 300);
    const detachedFromEmitter = spray.stats().airborne > 0;
    const cue = s.wreck.carnage!.cues[0];
    let bounded = true;
    for (const gentle of [false, true]) {
      for (const age of [0.3, 1.8, 3]) {
        spray.begin(gentle, false, 1, 2500, 3500);
        for (let i = 0; i < 100; i++)
          spray.cue({ ...cue, id: `crowded-${i}`, seed: i }, age);
        spray.end();
        const stats = spray.stats();
        bounded &&=
          stats.airborne <= 256 &&
          stats.grounded <= 64 &&
          stats.airCap === 256 &&
          stats.groundCap === 64;
      }
    }
    spray.reset();
    const reset =
      spray.stats().airborne === 0 &&
      spray.stats().grounded === 0 &&
      spray.air.children.every((p) => !p.visible || p === spray.ink);
    const air = spray.air,
      ground = spray.ground;
    c.dispose();
    spray.dispose();
    return {
      captures,
      freeze,
      replay,
      immutable,
      floor,
      materials: [...visibleMaterials],
      groundCounts,
      contribution,
      gentleSafe,
      reducedCount,
      bounded,
      reset,
      disposed: air.destroyed && ground.destroyed,
      detachedFromEmitter,
    };
  });
  for (const c of proof.captures)
    await info.attach(`${info.project.name}-spray-${c.id}`, {
      body: Buffer.from(c.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(proof.freeze).toBe(true);
  expect(proof.replay).toBe(true);
  expect(proof.immutable).toBe(true);
  expect(proof.floor).toBe(true);
  expect(Math.max(...proof.groundCounts)).toBeGreaterThan(0);
  expect(proof.materials).toEqual(
    expect.arrayContaining([
      'spray-droplet',
      'spray-eye',
      'spray-bone',
      'spray-tooth',
      'spray-ghost',
    ]),
  );
  expect(proof.contribution).toBe(true);
  expect(proof.gentleSafe).toBe(true);
  expect(proof.reducedCount).toBeLessThan(18);
  expect(proof.bounded).toBe(true);
  expect(proof.reset).toBe(true);
  expect(proof.disposed).toBe(true);
  expect(proof.detachedFromEmitter).toBe(true);
  expect(errors).toEqual([]);
});
