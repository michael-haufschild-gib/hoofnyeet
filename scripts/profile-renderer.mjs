import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { localUrl } from './local-url.mjs';

// Isolate the renderer from test locators and input automation. All variants
// play the same recorded crash transforms and semantic events at native RAF.
const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await fs.mkdir('output/playwright', { recursive: true });
  await page.goto(localUrl());
  await page.waitForFunction(() => window.__hoof?.ready);
  const adaptiveOnly = process.env.HOOF_ADAPTIVE === '1';
  const reports = await page.evaluate(async (adaptiveOnly) => {
    const c = window.__hoof;
    c.setExporting(true);
    cancelAnimationFrame(c.raf);
    const simPath = '/lib/game/simulation.ts';
    const physicsPath = '/lib/game/crash.ts';
    const contentPath = '/lib/game/content.ts';
    const sim = await import(simPath);
    const physics = await import(physicsPath);
    const content = await import(contentPath);
    const state = sim.createGame();
    Object.assign(state, {
      phase: 'landing',
      launched: true,
      world: 'farm',
      x: 4120,
      impactX: 4120,
      vx: 720,
      vy: 600,
      impactSpeed: 900,
      impactRotation: 0.3,
      landing: 'cartwheel',
      seed: 31,
      disaster: 0,
      boss: true,
      reactive: true,
      equipment: ['magnet', 'blackhole'],
      ability: 'blackhole',
      mod: content.modifiers(['magnet', 'blackhole']),
    });
    const crash = new physics.CrashWorld(state);
    const snapshots = [];
    let events = [];
    for (let tick = 0; tick < 1200; tick++) {
      if ([90, 260, 520].includes(tick)) crash.action('primary');
      if (tick === 310) crash.action('secondary');
      crash.step(1 / 120);
      events.push(...crash.drain());
      if (tick % 2 === 0) {
        snapshots.push({
          state: { ...state, time: tick / 120, wreck: crash.snapshot() },
          events,
        });
        events = [];
      }
    }
    crash.dispose();
    const summaries = [];
    for (const resolution of adaptiveOnly ? ['auto'] : [2, 1.5, 1, 'auto']) {
      c.renderer.reset();
      c.renderer.app.renderer.resize(
        c.renderer.w,
        c.renderer.h,
        resolution === 'auto' ? 2 : resolution,
      );
      const intervals = [],
        costs = [];
      let last = 0;
      await new Promise((resolve) => {
        let i = 0;
        const frame = (now) => {
          const snapshot = snapshots[i];
          const elapsed = i ? (now - last) / 1000 : 1 / 60;
          if (i > 30) intervals.push(now - last);
          last = now;
          const before = performance.now();
          if (resolution === 'auto') c.renderer.observeFrame(elapsed, true);
          for (const e of snapshot.events) c.renderer.event(e);
          c.renderer.draw(snapshot.state, 1 / 60, snapshot.state.time);
          if (i > 30) costs.push(performance.now() - before);
          if (++i < snapshots.length) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
      const settledFrames = intervals.slice(-180);
      costs.sort((a, b) => a - b);
      intervals.sort((a, b) => a - b);
      summaries.push({
        resolution,
        endingResolution: c.renderer.app.renderer.resolution,
        settledFps:
          (settledFrames.length * 1000) /
          settledFrames.reduce((a, b) => a + b, 0),
        frames: intervals.length,
        fps: (intervals.length * 1000) / intervals.reduce((a, b) => a + b, 0),
        p95IntervalMs: intervals[Math.floor(intervals.length * 0.95)],
        p95DrawMs: costs[Math.floor(costs.length * 0.95)],
        meanDrawMs: costs.reduce((a, b) => a + b, 0) / costs.length,
        buffer: [c.renderer.canvas.width, c.renderer.canvas.height],
      });
    }
    return summaries;
  }, adaptiveOnly);
  await fs.writeFile(
    `output/playwright/renderer-profile${adaptiveOnly ? '-auto' : ''}.json`,
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
