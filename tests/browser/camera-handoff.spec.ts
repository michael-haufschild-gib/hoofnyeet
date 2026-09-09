import { test, expect } from './fixtures';
import type { GameState } from '../../lib/game/simulation';

test('late ejection and possession keep the illustrated headwear and ground in a continuous shot', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts',
      contentPath = '/lib/game/content.ts';
    const { createGame } = await import(simPath),
      { CrashWorld, initPhysics } = await import(crashPath),
      { modifiers } = await import(contentPath);
    await initPhysics();
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    const shots: { id: string; url: string }[] = [];
    let maximumRate = 0,
      framed = true,
      frozen = true;
    for (const [world, landing, ability] of [
      ['moon', 'fence', 'eject'],
      ['afterlife', 'accordion', 'ghost'],
    ] as const)
      for (const reduced of [false, true]) {
        await r.prepareLevel(world, 'buttercup', undefined, ability);
        r.reduced = reduced;
        r.reset();
        const s = createGame() as GameState;
        const equipment = ['magnet', 'confetti', 'rubber', 'aftershock'];
        Object.assign(s, {
          phase: 'landing',
          world,
          landing,
          ability,
          equipment,
          mod: modifiers(equipment, world),
          impactX: 2800,
          x: 2800,
          vx: 720,
          vy: 600,
          seed: 31,
          disaster: 2,
          outfit: { hat: 'party', ponyId: 'buttercup' },
        });
        const crash = new CrashWorld(s);
        let previousZoom = 0,
          previousTime = 0;
        try {
          for (let tick = 0; tick < 1680; tick++) {
            if ([400, 950, 1520].includes(tick)) crash.action('primary');
            if (tick === 1560) crash.action('secondary');
            crash.step(1 / 120);
            s.wreck = crash.snapshot();
            s.sceneTime = s.time = s.wreck!.time;
            for (const event of crash.drain())
              r.event({ ...event, sceneTime: s.time });
            if (tick % (tick < 1500 ? 12 : 2)) continue;
            const elapsed = s.time - previousTime;
            r.draw(s, elapsed, s.time);
            const frame = r.framing!;
            if (previousZoom && tick >= 1500)
              maximumRate = Math.max(
                maximumRate,
                Math.abs(Math.log(frame.zoom / previousZoom)) / elapsed,
              );
            framed &&=
              frame.subjectTop >= frame.safeTop - 0.01 &&
              frame.ground <= r.h - 35;
            previousZoom = frame.zoom;
            previousTime = s.time;
            if ([1558, 1562, 1608].includes(tick)) {
              const picture = r.canvas.toDataURL('image/webp', 0.9);
              shots.push({
                id: `${world}-${reduced ? 'reduced' : 'normal'}-${tick}`,
                url: picture,
              });
              r.draw({ ...s, time: 200 }, 1, 200);
              frozen &&= picture === r.canvas.toDataURL('image/webp', 0.9);
            }
          }
        } finally {
          crash.dispose();
        }
      }
    return { maximumRate, framed, frozen, shots };
  });
  for (const shot of report.shots)
    await info.attach(`${info.project.name}-handoff-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(report.maximumRate).toBeLessThan(1.81);
  expect(report.framed).toBe(true);
  expect(report.frozen).toBe(true);
  expect(report.shots).toHaveLength(12);
  expect(errors).toEqual([]);
});
