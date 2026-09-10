import { test, expect } from './fixtures';
import type { GameState } from '../../lib/game/simulation';
import type { CarnageEffects } from '../../lib/game/effects/slapstick/carnage-effects';

test('six boss cartoons have staged births, rooted props and recorded-clock playback', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      geometryPath = '/lib/game/art/geometry.ts',
      mechanismPath = '/lib/game/catalogue/machinery.ts';
    const { createGame } = await import(simPath);
    const { fitArt } = await import(geometryPath);
    const { bossPose } = await import(mechanismPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const effects = (r as unknown as { carnageEffects: CarnageEffects })
      .carnageEffects;
    const parts = {
      farm: 'baler',
      candy: 'jaws',
      carnival: 'piano',
      office: 'officeGoose',
      moon: 'ufo',
      afterlife: 'reaper',
    } as const;
    const captures: { id: string; url: string }[] = [];
    let freeze = true,
      replay = true,
      immutable = true,
      bounded = true;
    const births: { world: string; time: number; count: number }[] = [];
    const inkBounds: number[] = [];
    const freezeFailures: string[] = [];
    for (const [world, part] of Object.entries(parts)) {
      await r.loadWorld(world as GameState['world']);
      const shape = { part, ...fitArt(part, 190, 180) };
      const initial = bossPose(world, 2, shape);
      const s = createGame() as GameState;
      Object.assign(s, {
        phase: 'landing',
        world,
        x: 3300,
        impactX: 2900,
        reactive: true,
        boss: true,
      });
      s.wreck = {
        bodies: [
          {
            id: 1,
            part: 'skeletal-torso',
            x: 3275,
            y: -42,
            w: 108,
            h: 75,
            angle: -0.1,
            tint: 0xffffff,
            alpha: 1,
            boss: false,
            injury: 2,
          },
          {
            id: 2,
            ...shape,
            x: 2900 + initial.x,
            y: initial.y,
            angle: 0,
            tint: 0xffffff,
            alpha: 1,
            boss: true,
          },
        ],
        focusId: 1,
        focusX: 3275,
        focusY: -42,
        time: 2,
        kicks: 0,
        abilityReady: false,
        abilityAge: 20,
        havoc: 600,
        bossHits: 9,
        caption: '',
        flash: 0,
        synergy: '',
        carnage: {
          attachments: [],
          cues: [
            {
              id: `${world}-boss`,
              kind: 'boss',
              at: 2,
              x: 2900 + initial.x,
              y: initial.y,
              seed: 31,
              power: 2,
              world: world as GameState['world'],
              bodyId: 2,
            },
          ],
        },
      };
      for (const age of [0.1, 0.36, 0.76, 1.1, 2.55, 3.9, 4.65, 5.5]) {
        const at = bossPose(world, 2 + age, shape);
        const b = s.wreck.bodies[1];
        b.x = 2900 + at.x;
        b.y = at.y;
        s.time = s.sceneTime = s.wreck.time = 2 + age;
        r.reset();
        const before = JSON.stringify(s);
        r.draw(s, 0, s.time);
        const live = r.canvas.toDataURL('image/webp', 0.9);
        if (![0.36, 0.76].includes(age))
          captures.push({ id: `${world}-${age}`, url: live });
        const actors = effects.front.children.find(
          (p) => p.label === 'carnage-sprite-pool',
        )!;
        const count = actors.children.filter(
          (p) =>
            p.visible &&
            p.alpha > 0.001 &&
            (world === 'farm'
              ? p.label.startsWith('boss-farm-package')
              : p.label === 'boss-show-ghost-head'),
        ).length;
        if (['farm', 'afterlife'].includes(world) && age < 1.2)
          births.push({ world, time: age, count });
        r.draw(s, 0.3, s.time);
        const frozen = r.canvas.toDataURL('image/webp', 0.9);
        if (frozen !== live) {
          freezeFailures.push(`${world}-${age}`);
          captures.push({ id: `${world}-${age}-second`, url: frozen });
        }
        freeze &&= frozen === live;
        r.reset();
        r.draw({ ...s, time: 80, sceneTime: s.time }, 0, 80);
        replay &&= r.canvas.toDataURL('image/webp', 0.9) === live;
        immutable &&= JSON.stringify(s) === before;
        bounded &&= effects.stats().visibleSprites <= 192;
        const ink = effects.front.children.find(
          (p) => p.label === 'animated-mouths-and-machinery',
        )!;
        const bounds = ink.getLocalBounds();
        if (bounds.width)
          inkBounds.push(Math.abs(bounds.x - s.wreck.bodies[1].x));
      }
      const b = s.wreck.bodies[1];
      b.angle = Math.PI * 0.6;
      s.time = s.sceneTime = s.wreck.time = 5.9;
      r.reset();
      r.draw(s, 0, s.time);
      captures.push({
        id: `${world}-rotated`,
        url: r.canvas.toDataURL('image/webp', 0.9),
      });
      r.gentle = r.reduced = true;
      r.reset();
      r.draw(s, 0, s.time);
      captures.push({
        id: `${world}-gentle-reduced`,
        url: r.canvas.toDataURL('image/webp', 0.9),
      });
      r.gentle = r.reduced = false;
    }
    r.reset();
    const reset = effects.stats().visibleSprites === 0;
    c.dispose();
    return {
      captures,
      freeze,
      replay,
      immutable,
      bounded,
      reset,
      births,
      inkBounds,
      freezeFailures,
    };
  });
  for (const c of proof.captures)
    await info.attach(`${info.project.name}-boss-${c.id}`, {
      body: Buffer.from(c.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(proof.freeze, proof.freezeFailures.join(', ')).toBe(true);
  expect(proof.replay).toBe(true);
  expect(proof.immutable).toBe(true);
  expect(proof.bounded).toBe(true);
  expect(proof.reset).toBe(true);
  for (const b of proof.births)
    expect(b.count).toBe(
      Math.min(4, Math.floor(b.time / (b.world === 'farm' ? 0.25 : 0.35)) + 1),
    );
  expect(Math.max(...proof.inkBounds)).toBeLessThan(900);
  expect(errors).toEqual([]);
});
