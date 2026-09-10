import { test, expect } from './fixtures';
import { nativeActions } from './inputs';
import { routineScore } from '../../lib/game/routine';
import type { Container, WebGLRenderer } from 'pixi.js';

test('two native controls build a varied routine and the complete verdict stays usable', async ({
  page,
}, info) => {
  test.setTimeout(85000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  await page.locator('canvas').focus();
  const tap = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  let pictured = false;
  for (let i = 0; i < 1500; i++) {
    const s = await page.evaluate(() => {
      const c = window.__hoof,
        s = c.state;
      return {
        phase: s.phase,
        jump: c.snapshot().jump.ready,
        active: s.flipActive,
        progress: s.flipProgress,
        flips: s.flips,
        flaps: s.flaps,
        y: s.y,
        vy: s.vy,
        time: s.time,
        crash: s.wreck?.time ?? 0,
        activeTrick: s.routine?.active?.trick,
      };
    });
    if (s.phase === 'runup') await tap(s.jump ? 'secondary' : 'primary');
    if (s.phase === 'flight') {
      if (!s.active && (s.vy < 0 || s.y < -260)) await tap('secondary');
      if (
        s.active &&
        s.progress > 0.22 &&
        s.progress < 0.55 &&
        s.flaps > 0 &&
        s.activeTrick !== 'star'
      )
        await tap('primary');
    }
    if (s.phase === 'landing' && s.crash > 1.7 && !pictured) {
      pictured = true;
      await page.screenshot({
        path: `output/playwright/polish-20260910/${info.project.name}-routine-jury.png`,
      });
    }
    if (s.phase === 'results') break;
    await page.waitForTimeout(35);
  }
  await expect(
    page.getByRole('region', { name: 'Attempt results' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.result-screen')
        .evaluate((el) => Number(getComputedStyle(el).opacity)),
    )
    .toBe(1);
  const score = await page.evaluate(() => ({
    routine: window.__hoof.state.routine!,
    style: window.__hoof.state.style,
  }));
  expect(score.routine.completed).toBeGreaterThanOrEqual(2);
  expect(score.routine.bestChain).toBeGreaterThanOrEqual(2);
  expect(score.routine.counts.star).toBeGreaterThan(0);
  expect(score.style).toBe(routineScore(score.routine));
  expect(score.routine.settled).toBe(true);
  await expect(page.locator('.judge-card')).toHaveCount(3);
  const next = page.getByRole('button', { name: 'AGAIN', exact: true });
  const b = await next.boundingBox();
  expect(b?.height).toBeGreaterThan(0);
  expect(b!.y).toBeGreaterThan(0);
  expect(b!.y + b!.height).toBeLessThan(
    (await page.evaluate(() => innerHeight)) + 1,
  );
  await page.screenshot({
    path: `output/playwright/polish-20260910/${info.project.name}-routine-results.png`,
  });
  await page.getByLabel('Judges and routine breakdown').click();
  await expect(page.getByRole('list', { name: 'Scored tricks' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('performance poses, ribbons and judges sample recorded time and survive graphics restoration', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const shots = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    await r.prepareLevel('farm', 'buttercup');
    const simPath = '/lib/game/simulation.ts',
      routinePath = '/lib/game/routine.ts',
      crashPath = '/lib/game/crash.ts';
    const { createGame } = await import(simPath);
    const { newRoutine, beginTrick, completeTrick, finishRoutine } =
      await import(routinePath);
    const { CrashWorld, initPhysics } = await import(crashPath);
    await initPhysics();
    const shots: { name: string; data: string }[] = [];
    let frozen = true;
    const s = createGame();
    Object.assign(s, {
      phase: 'flight',
      launched: true,
      x: 2400,
      y: -300,
      vx: 500,
      vy: -100,
      time: 4,
      sceneTime: 4,
      flipActive: true,
      flipProgress: 0.4,
    });
    for (const trick of [
      'tuck',
      'corkscrew',
      'layback',
      'spiral',
      'axel',
      'star',
      'bean',
    ]) {
      s.routine = {
        ...newRoutine(),
        active: { trick, at: 3.6, linked: false, height: 300 },
      };
      r.reset();
      r.draw(s, 0, 4);
      const before = r.canvas.toDataURL();
      r.draw(s, 0.5, 400);
      frozen &&= before === r.canvas.toDataURL();
      shots.push({ name: trick, data: before });
    }
    const routine = completeTrick(
      beginTrick(newRoutine(), {
        time: 1,
        y: -400,
        vy: 0,
        flapPose: 0,
        beans: false,
      }),
      { time: 2, x: 2400, y: -100, base: 100 },
    );
    s.routine = finishRoutine(routine, {
      time: 3,
      x: 2400,
      y: 0,
      failed: false,
      interrupted: false,
    });
    Object.assign(s, {
      phase: 'landing',
      impactX: 2400,
      y: 0,
      flipActive: false,
      rotation: 0,
      reactive: true,
    });
    const wreck = new CrashWorld(s);
    s.wreck = wreck.snapshot();
    wreck.dispose();
    s.time = s.sceneTime = 5.1;
    s.wreck.time = 2.1;
    r.reset();
    r.draw(s, 0, 5.1);
    shots.push({ name: 'jury', data: r.canvas.toDataURL() });
    window.__routineFrame = s;
    const count = (v: Container): number =>
      1 + v.children.reduce((n, child) => n + count(child), 0);
    const objects = count(r.app.stage);
    for (let i = 0; i < 30; i++) {
      r.reset();
      r.draw(s, 0, 5.1);
    }
    const sameObjects = objects === count(r.app.stage);
    const loss = (r.app.renderer as WebGLRenderer).gl.getExtension(
      'WEBGL_lose_context',
    );
    window.__contextLoss = loss!;
    return {
      shots,
      frozen,
      sameObjects,
      canLose: !!loss,
      before: r.canvas.toDataURL(),
    };
  });
  expect(shots.frozen).toBe(true);
  expect(shots.sameObjects).toBe(true);
  for (const shot of shots.shots)
    await info.attach(shot.name, {
      body: Buffer.from(shot.data.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
  if (shots.canLose) {
    await page.evaluate(() => window.__contextLoss.loseContext());
    await page.waitForFunction(() => window.__hoof.graphicsLost);
    await page.evaluate(() => window.__contextLoss.restoreContext());
    await page.waitForFunction(() => !window.__hoof.graphicsLost);
    const same = await page.evaluate((before) => {
      const r = window.__hoof.renderer,
        s = window.__routineFrame;
      r.draw(s, 0, s.time);
      return before === r.canvas.toDataURL();
    }, shots.before);
    expect(same, 'living routine picture survives context recovery').toBe(true);
  }
});

declare global {
  interface Window {
    __routineFrame: import('../../lib/game/simulation').GameState;
  }
}

test('the readable verdict accounts for every point and teaches tricks inside its existing disclosure', async ({
  page,
}, info) => {
  if (info.project.name === 'phone')
    await page.setViewportSize({ width: 320, height: 568 });
  if (info.project.name === 'phone-landscape')
    await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const expected = await page.evaluate(async () => {
    const c = window.__hoof;
    c.setExporting(true);
    const routinePath = '/lib/game/routine.ts',
      simPath = '/lib/game/simulation.ts',
      runPath = '/lib/game/run.ts';
    const routine = await import(routinePath),
      sim = await import(simPath),
      run = await import(runPath);
    let r = routine.newRoutine();
    for (let i = 0; i < 27; i++) {
      r = {
        ...r,
        active: {
          trick: i === 26 ? 'star' : 'tuck',
          at: i,
          linked: true,
          height: 400,
        },
      };
      r = routine.completeTrick(r, {
        time: i + 0.8,
        x: 3500,
        y: -300,
        base: 100,
      });
    }
    r = routine.routineRing(r, 75);
    r = routine.routineRing(r, 75);
    r = routine.finishRoutine(r, {
      time: 28,
      x: 3500,
      y: 0,
      failed: false,
      interrupted: false,
    });
    c.state = Object.assign(sim.createGame(), {
      phase: 'results',
      launched: true,
      x: 3500,
      distance: 745.5,
      flightDistance: 690,
      style: routine.routineScore(r),
      havoc: 1680,
      routine: r,
    });
    c.run = { ...run.newRun('quick'), status: 'won' };
    c.screen = 'results';
    c.newHats = [];
    c.publish();
    return { score: c.state.style, technique: r.technical };
  });
  const verdict = page.locator('.routine-verdict');
  await expect(verdict).toBeVisible();
  await expect(verdict).toContainText(`${expected.technique} technique`);
  const fontSizes = await page
    .locator('.judge-paddle span,.routine-equation,.result-stats > span')
    .evaluateAll((els) =>
      els.map((el) => parseFloat(getComputedStyle(el).fontSize)),
    );
  expect(fontSizes.every((size) => size >= 11)).toBe(true);
  const next = page.getByRole('button', { name: 'AGAIN', exact: true });
  const bounds = await next.boundingBox();
  expect(bounds!.y).toBeGreaterThan(0);
  expect(bounds!.y + bounds!.height).toBeLessThan(
    await page.evaluate(() => innerHeight),
  );
  await verdict
    .getByRole('button', { name: 'Judges and routine breakdown' })
    .click();
  const ledger = page.getByRole('list', { name: 'Scored tricks' });
  await expect(ledger).toBeVisible();
  await expect(ledger).toContainText('Earlier tricks');
  await expect(ledger).toContainText('2 rings');
  await expect(ledger).toContainText('Flap during a roll');
  const sum = await ledger
    .locator('li > b')
    .evaluateAll((els) =>
      els.reduce(
        (total, el) => total + Number(el.textContent!.replace('+', '')),
        0,
      ),
    );
  expect(sum).toBe(expected.score);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= innerHeight + 1,
    ),
  ).toBe(true);
  const expanded = await next.boundingBox();
  expect(
    (await page.locator('.routine-scroll').boundingBox())!.height,
  ).toBeGreaterThanOrEqual(42);
  expect(expanded!.y + expanded!.height).toBeLessThan(
    await page.evaluate(() => innerHeight),
  );
  expect(
    await next.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
  ).toBe(true);
  // Portrait has one information scroll owner; the short two-column layout
  // keeps the ledger independent. Exercise native scrolling, not scrollTop on
  // an inner element that may itself be clipped by an outer viewport.
  const outerScrolls = await page
    .locator('.result-content')
    .evaluate((el) => getComputedStyle(el).display !== 'contents');
  const owner = page.locator(
    outerScrolls ? '.result-content' : '.routine-scroll',
  );
  const ownerBox = (await owner.boundingBox())!;
  const listBox = (await page.locator('.routine-scroll').boundingBox())!;
  await page.mouse.move(
    ownerBox.x + ownerBox.width / 2,
    Math.min(ownerBox.y + ownerBox.height - 8, listBox.y + 12),
  );
  const scrollToEnd = async (end: boolean) => {
    await expect
      .poll(async () => {
        if (info.project.name === 'phone') {
          // Playwright mobile WebKit has no wheel/swipe API. Verify its real
          // browser scroll layout programmatically; other engines use wheels.
          await owner.evaluate((el, down) => {
            el.scrollTop = down ? el.scrollHeight : 0;
          }, end);
        } else await page.mouse.wheel(0, end ? 800 : -800);
        return owner.evaluate((el, down) => {
          return down
            ? el.scrollHeight - el.clientHeight - el.scrollTop <= 2
            : el.scrollTop <= 2;
        }, end);
      })
      .toBe(true);
  };
  await scrollToEnd(true);
  await expect(ledger.locator('.routine-finish')).toBeInViewport();
  const panelBounds = (await page.locator('.result-screen').boundingBox())!;
  const arenaBounds = (await page.locator('.arena').boundingBox())!;
  expect(panelBounds.y).toBeGreaterThan(arenaBounds.y);
  expect(panelBounds.y + panelBounds.height).toBeLessThan(
    arenaBounds.y + arenaBounds.height,
  );
  expect(
    await next.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return el.contains(
        document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: `output/playwright/polish-20260910/verdict-${info.project.name}-expanded.png`,
  });
  await page.mouse.move(
    ownerBox.x + ownerBox.width / 2,
    ownerBox.y + ownerBox.height / 2,
  );
  await scrollToEnd(false);
  await expect(
    verdict.getByRole('button', { name: 'Judges and routine breakdown' }),
  ).toBeInViewport();
  await verdict
    .getByRole('button', { name: 'Judges and routine breakdown' })
    .click();
  await next.click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  expect(
    await page.evaluate(() => window.__hoof.state.routine?.completed),
  ).toBe(0);
});
