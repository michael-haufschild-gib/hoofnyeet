import { test, expect } from './fixtures';
import { nativeActions } from './inputs';
import type { CombinationCue } from '../../lib/game/catalogue/combinations';
import type { Container } from 'pixi.js';
import { writeFile } from 'node:fs/promises';

test('two real buttons earn an anatomical ovation from three different air tricks', async ({
  page,
}, info) => {
  test.setTimeout(80000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: /^(PLAY TOUR|New tour)/ }).click();
  for (const name of ['Gymnastics receipt', 'Explosive confetti']) {
    await page.evaluate(() => {
      const c = window.__hoof;
      c.setExporting(true);
      Object.assign(c.run!, {
        status: 'pitstop',
        offers: ['acrobat', 'confetti', 'wings'],
        rewardTaken: false,
      });
      c.screen = 'pitstop';
      c.publish();
    });
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await page.waitForFunction(
      () => window.__hoof.screen === 'game' && window.__hoof.ready,
    );
  }
  await page.evaluate(() => window.__hoof.setExporting(false));
  await page.locator('canvas').focus();
  const tap = await nativeActions(
    page,
    info.project.name.startsWith('phone'),
    info.project.name === 'firefox',
  );
  let awarded = false;
  for (let i = 0; i < 450; i++) {
    const s = await page.evaluate(() => {
      const c = window.__hoof,
        s = c.state;
      return {
        phase: s.phase,
        jump: c.snapshot().jump.ready,
        active: s.flipActive,
        progress: s.flipProgress,
        completed: s.routine?.completed ?? 0,
        trick: s.routine?.active?.trick,
        cue: s.combinations?.[0],
        time: s.time,
      };
    });
    if (s.phase === 'runup') await tap(s.jump ? 'secondary' : 'primary');
    if (s.phase === 'flight') {
      if (!s.active) await tap('secondary');
      if (
        s.completed >= 2 &&
        s.active &&
        s.progress > 0.2 &&
        s.progress < 0.6 &&
        s.trick !== 'star'
      )
        await tap('primary');
    }
    if (s.cue && s.time - s.cue.at > 0.2) {
      awarded = true;
      await page.screenshot({
        path: `output/playwright/polish-20260910/ovation-${info.project.name}.png`,
      });
      break;
    }
    if (s.phase === 'landing') break;
    await page.waitForTimeout(32);
  }
  expect(awarded).toBe(true);
  const receipt = await page.evaluate(() => {
    const c = window.__hoof,
      cue = c.state.combinations![0];
    return {
      cue,
      flaps: c.state.flaps,
      events: c.recording().events.filter((e) => e.id === cue.id),
      count: Object.values(c.state.routine!.counts).filter((n) => n! > 0)
        .length,
    };
  });
  expect(receipt.count).toBeGreaterThanOrEqual(3);
  expect(receipt.flaps).toBeGreaterThanOrEqual(2);
  expect(receipt.events).toHaveLength(1);
  expect(receipt.events[0].sceneTime).toBe(receipt.cue.at);
  expect(errors).toEqual([]);
});

test('all combination pictures are recorded, grounded in their source bodies, bounded and reversible', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    await r.prepareLevel('farm', 'buttercup');
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts';
    const sim = await import(simPath),
      physics = await import(crashPath);
    const s = sim.createGame();
    Object.assign(s, {
      phase: 'landing',
      launched: true,
      reactive: true,
      impactX: 2600,
      x: 2600,
      y: 0,
      vx: 500,
      vy: 400,
      time: 6,
      sceneTime: 6,
    });
    const crash = new physics.CrashWorld(s);
    for (let i = 0; i < 80; i++) crash.step(sim.STEP);
    s.wreck = crash.snapshot();
    crash.dispose();
    const count = (node: Container): number =>
      1 + node.children.reduce((n, child) => n + count(child), 0);
    const rows = [];
    for (const kind of [
      'gas-spring',
      'retina-zap',
      'haunted-encore',
      'organ-applause',
    ] as const) {
      s.wreck.bodies = s.wreck.bodies.filter(
        (b: import('../../lib/game/crash').BodyPose) => b.id !== 777,
      );
      if (kind === 'haunted-encore' || kind === 'retina-zap')
        s.wreck.bodies.push({
          id: 777,
          part: kind === 'haunted-encore' ? 'piano' : 'eye',
          x: s.wreck.focusX + 80,
          y: kind === 'haunted-encore' ? -35 : -90,
          angle: 0.18,
          w: kind === 'haunted-encore' ? 125 : 30,
          h: kind === 'haunted-encore' ? 115 : 30,
          tint: 0xffffff,
          alpha: 1,
          boss: false,
        });
      const cue: CombinationCue = {
        id: `review-${kind}`,
        kind,
        at: s.wreck.time - 0.35,
        x: s.wreck.focusX,
        y: s.wreck.focusY,
        vx: 300,
        vy: 0,
        seed: 91,
        bodyId: ['haunted-encore', 'retina-zap'].includes(kind)
          ? 777
          : s.wreck.focusId,
        targetId: s.wreck.bodies.find(
          (b: import('../../lib/game/crash').BodyPose) => b.part === 'helmet',
        )?.id,
      };
      if (kind === 'organ-applause') {
        s.phase = 'flight';
        s.y = -200;
        s.x = s.wreck.focusX;
        s.combinations = [
          { ...cue, at: s.time - 0.35, y: -260, bodyId: undefined },
        ];
        s.wreck.combinations = [];
      } else {
        s.phase = 'landing';
        s.y = 0;
        s.combinations = [];
        s.wreck.combinations = [cue];
      }
      r.reduced = r.gentle = false;
      r.reset();
      r.draw(s, 0, s.time);
      const first = r.canvas.toDataURL();
      const state = JSON.stringify(s);
      r.draw(s, 1, 300);
      const frozen = first === r.canvas.toDataURL();
      r.reset();
      r.draw(JSON.parse(state), 0, 300);
      const exact = first === r.canvas.toDataURL();
      const objects = count(r.app.stage);
      for (let i = 0; i < 25; i++) {
        r.reset();
        r.draw(s, 0, s.time);
      }
      const bounded = objects === count(r.app.stage);
      r.reduced = r.gentle = true;
      r.reset();
      r.draw(s, 0, s.time);
      rows.push({
        kind,
        first,
        gentle: r.canvas.toDataURL(),
        frozen,
        exact,
        bounded,
        unchanged: state === JSON.stringify(s),
      });
    }
    return rows;
  });
  for (const row of report) {
    expect(row.frozen, row.kind).toBe(true);
    expect(row.exact, row.kind).toBe(true);
    expect(row.bounded, row.kind).toBe(true);
    expect(row.unchanged, row.kind).toBe(true);
    for (const [mode, image] of [
      ['normal', row.first],
      ['gentle', row.gentle],
    ]) {
      await writeFile(
        `output/playwright/polish-20260910/combo-${info.project.name}-${row.kind}-${mode}.png`,
        Buffer.from(image.split(',')[1], 'base64'),
      );
      await info.attach(`${row.kind}-${mode}`, {
        body: Buffer.from(image.split(',')[1], 'base64'),
        contentType: 'image/png',
      });
    }
  }
});
