import { test, expect } from './fixtures';
import type { GameController } from '../../lib/game/controller';
import type { RigidBody } from '@dimforge/rapier2d-compat';
declare global {
  interface Window {
    __hoof: GameController;
  }
}

test('all additive finales render, freeze, replay and remain framed with bounded sprite pools', async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.addStyleTag({
    content: '.arena > :not(canvas) {display:none!important}',
  });
  const result = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts';
    const sim = await import(simPath),
      physics = await import(crashPath);
    const c = window.__hoof;
    c.setExporting(true);
    const renderer = c.renderer;
    await renderer.loadWorld('farm');
    const captures: { id: string; url: string }[] = [];
    const frames: {
      ground: number;
      height: number;
      top: number;
      safe: number;
      pool: number;
      visible: number;
      peakVisible: number;
      freeze: boolean;
      cues: number;
    }[] = [];
    for (const landing of Object.keys(sim.LANDINGS)) {
      const s = sim.createGame();
      Object.assign(s, {
        phase: 'landing',
        world: 'farm',
        reactive: true,
        landing,
        x: 2800,
        impactX: 2800,
        vx: 720,
        vy: 600,
        impactRotation: 0.3,
        seed: 31,
        equipment: ['beans', 'rubber', 'magnet', 'confetti'],
      });
      const crash = new physics.CrashWorld(s);
      renderer.reset();
      let peakVisible = 0;
      for (let i = 0; i < 1680; i++) {
        crash.step(1 / 120);
        s.time = s.sceneTime = (i + 1) / 120;
        s.wreck = crash.snapshot();
        for (const e of crash.drain()) renderer.event(e);
        if (i % 12 === 0 || [1068, 1332, 1572].includes(i))
          renderer.draw(s, 1 / 10, s.time);
        if ([1068, 1332, 1572].includes(i)) {
          peakVisible = Math.max(
            peakVisible,
            (
              renderer as unknown as {
                carnageEffects: { stats(): { visibleSprites: number } };
              }
            ).carnageEffects.stats().visibleSprites,
          );
          captures.push({
            id: `${landing}-${i}`,
            url: renderer.canvas.toDataURL('image/png'),
          });
        }
      }
      renderer.draw(s, 1 / 60, s.time);
      const before = renderer.canvas.toDataURL();
      for (let i = 0; i < 3; i++) renderer.draw(s, 1 / 60, s.time);
      const stats = (
        renderer as unknown as {
          carnageEffects: {
            stats(): { allocatedSprites: number; visibleSprites: number };
          };
        }
      ).carnageEffects.stats();
      frames.push({
        ground: renderer.framing!.ground,
        height: renderer.h,
        top: renderer.framing!.subjectTop,
        safe: renderer.framing!.safeTop,
        pool: stats.allocatedSprites,
        visible: stats.visibleSprites,
        peakVisible,
        freeze: before === renderer.canvas.toDataURL(),
        cues: s.wreck.carnage!.cues.filter(
          (c: { kind: string }) => c.kind === 'landing',
        ).length,
      });
      crash.dispose();
    }
    return { frames, captures };
  });
  for (const capture of result.captures)
    await info.attach(capture.id, {
      body: Buffer.from(capture.url.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
  for (const f of result.frames) {
    expect(f.ground).toBeLessThan(f.height);
    expect(f.top).toBeGreaterThanOrEqual(f.safe - 1);
    expect(f.pool).toBe(192);
    expect(f.visible).toBeLessThanOrEqual(192);
    // Escaping the finale can move its decorations off-screen before results.
    expect(f.peakVisible).toBeGreaterThan(0);
    expect(f.cues).toBe(5);
    expect(f.freeze).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('six boss finales render at actual hit thresholds and repeated crashes release their scene state', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts',
      contentPath = '/lib/game/content.ts';
    const sim = await import(simPath),
      physics = await import(crashPath),
      content = await import(contentPath);
    const c = window.__hoof;
    c.setExporting(true);
    const images: { id: string; url: string }[] = [],
      sizes: number[] = [];
    const count = (node: { children: unknown[] }): number =>
      1 +
      node.children.reduce<number>(
        (n, child) => n + count(child as { children: unknown[] }),
        0,
      );
    for (let run = 0; run < 18; run++) {
      const world = content.WORLDS[run % 6];
      await c.renderer.loadWorld(world.id);
      const s = sim.createGame();
      Object.assign(s, {
        phase: 'landing',
        reactive: true,
        world: world.id,
        boss: true,
        mod: content.modifiers([], world.id),
        x: 2800,
        impactX: 2800,
        vx: 720,
        vy: 550,
        seed: 31,
      });
      const crash = new physics.CrashWorld(s);
      c.renderer.reset();
      const pieces = (
        crash as unknown as {
          pieces: Map<
            number,
            { body: RigidBody; boss: boolean; activated: boolean }
          >;
        }
      ).pieces;
      const boss = [...pieces.values()].find((p) => p.boss)!;
      for (const p of [...pieces.values()].filter((p) => !p.boss)) {
        if (!p.body.isValid()) continue;
        const at = boss.body.translation();
        p.body.setTranslation({ x: at.x - 1.7, y: at.y }, true);
        p.body.setLinvel({ x: 18, y: 0 }, true);
        p.activated = true;
        for (let i = 0; i < 5; i++) crash.step(1 / 120);
        if (crash.snapshot().bossHits >= 3 + world.act * 2) break;
      }
      const start = crash.snapshot().time;
      for (let i = 0; i < 540; i++) {
        crash.step(1 / 120);
        s.time = s.sceneTime = start + (i + 1) / 120;
        s.wreck = crash.snapshot();
        for (const event of crash.drain()) c.renderer.event(event);
        if (i % 24 === 0) c.renderer.draw(s, 0.2, s.time);
        if (run < 6 && [240, 492].includes(i)) {
          c.renderer.draw(s, 0.2, s.time);
          images.push({
            id: `${world.id}-${i}`,
            url: c.renderer.canvas.toDataURL('image/png'),
          });
        }
      }
      if (
        s.wreck.carnage.cues.filter((v: { kind: string }) => v.kind === 'boss')
          .length !== 1
      )
        throw new Error('Boss finale missing');
      crash.dispose();
      c.renderer.reset();
      const clean = sim.createGame();
      c.renderer.draw(clean, 0, 0);
      sizes.push(count(c.renderer.app.stage));
    }
    return { images, sizes };
  });
  for (const image of report.images)
    await info.attach(image.id, {
      body: Buffer.from(image.url.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
  expect(new Set(report.sizes.slice(6)).size).toBe(1);
  expect(report.sizes.at(-1)).toBeLessThan(700);
  expect(errors).toEqual([]);
});
