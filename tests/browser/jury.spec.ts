import { test, expect } from './fixtures';
import type { Container } from 'pixi.js';
import { writeFile } from 'node:fs/promises';

test('hungry score paddles preserve the verdict, swallow only their own judge and replay exactly', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    c.screen = 'game';
    c.publish();
    await r.prepareLevel('farm', 'buttercup');
    const simPath = '/lib/game/simulation.ts',
      routinePath = '/lib/game/routine.ts',
      crashPath = '/lib/game/crash.ts';
    const { createGame } = await import(simPath);
    const { newRoutine } = await import(routinePath);
    const { CrashWorld, initPhysics } = await import(crashPath);
    await initPhysics();
    const s = Object.assign(createGame(), {
      phase: 'landing',
      launched: true,
      x: 2400,
      impactX: 2400,
      y: 0,
      vx: 400,
      reactive: true,
      routine: {
        ...newRoutine(),
        completed: 3,
        counts: { tuck: 1, axel: 1, star: 1 },
        bestChain: 3,
        settled: true,
        cleanFinish: true,
        verdictAt: 3,
      },
    });
    const physics = new CrashWorld(s);
    s.wreck = physics.snapshot();
    physics.dispose();
    const rig = r as unknown as {
      routineShow: {
        front: Container;
        judges: {
          bird: Container;
          paddle: Container;
          grade: { text: string };
          mouth: Container;
        }[];
      };
    };
    const count = (v: Container): number =>
      1 + v.children.reduce((n, child) => n + count(child), 0);
    s.time = s.sceneTime = 5.2;
    s.wreck.time = 2.2;
    r.draw(s, 0, s.time);
    const countBefore = count(rig.routineShow.front),
      saved = JSON.stringify(s.routine);
    const shots: { name: string; data: string }[] = [];
    const checks = [];
    for (const gentle of [false, true]) {
      r.gentle = r.reduced = gentle;
      for (const age of [2.2, 2.95, 3.31, 3.76]) {
        s.time = s.sceneTime = 3 + age;
        s.wreck.time = age;
        r.reset();
        r.draw(s, 0, s.time);
        const before = r.canvas.toDataURL();
        r.draw(s, 0.3, 800);
        const exact = before === r.canvas.toDataURL();
        const judges = rig.routineShow.judges.map((j) => ({
          mouth: j.mouth.visible,
          scale: Math.abs(j.bird.scale.x),
          grade: j.grade.text,
          bounds: j.paddle.getBounds().rectangle,
        }));
        checks.push({ age, gentle, exact, judges });
        shots.push({
          name: `${gentle ? 'gentle' : 'normal'}-${age}`,
          data: before,
        });
        s.time = s.sceneTime = 7.65;
        s.wreck.time = 4.65;
        r.draw(s, 0, s.time);
        s.time = s.sceneTime = 3 + age;
        s.wreck.time = age;
        r.draw(s, 0, s.time);
        checks.push({
          age,
          gentle,
          exact: before === r.canvas.toDataURL(),
          judges,
        });
      }
    }
    const beforeRestore = r.canvas.toDataURL();
    r.restoreGraphics();
    r.draw(s, 0, s.time);
    const restored = beforeRestore === r.canvas.toDataURL();
    const sameCount = countBefore === count(rig.routineShow.front);
    const stageCount = count(r.app.stage);
    r.reset();
    return {
      shots,
      checks,
      restored,
      sameCount,
      stageCount,
      width: r.app.screen.width,
      unchanged: saved === JSON.stringify(s.routine),
      reset: !rig.routineShow.front.visible,
    };
  });
  for (const c of report.checks) {
    expect(c.exact, `${c.gentle}/${c.age}`).toBe(true);
    expect(c.judges.map((j) => j.grade)).toEqual(['4.9', '6.5', '0.8']);
    expect(c.judges.filter((j) => j.mouth).length).toBe(c.age < 2.4 ? 0 : 1);
    for (const judge of c.judges) {
      expect(judge.bounds.x).toBeGreaterThanOrEqual(0);
      expect(judge.bounds.x + judge.bounds.width).toBeLessThanOrEqual(
        report.width,
      );
    }
    if (c.age > 3.56) {
      expect(c.judges[1].scale).toBe(0);
      expect(c.judges[0].scale).toBeGreaterThan(0);
      expect(c.judges[2].scale).toBeGreaterThan(0);
    }
  }
  expect(report.unchanged).toBe(true);
  expect(report.sameCount).toBe(true);
  expect(report.stageCount).toBeLessThan(1024);
  expect(report.restored).toBe(true);
  expect(report.reset).toBe(true);
  for (const shot of report.shots)
    await writeFile(
      `output/playwright/polish-20260910/jury-${info.project.name}-${shot.name}.png`,
      Buffer.from(shot.data.split(',')[1], 'base64'),
    );
});
