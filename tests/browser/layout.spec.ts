import { test, expect, type Page } from './fixtures';
import type { Container, Text, WebGLRenderer } from 'pixi.js';
import type { WorldId } from '../../lib/game/content';
import type { GameController } from '../../lib/game/controller';
declare global {
  interface Window {
    __hoof: GameController;
  }
}

async function visibleAction(page: Page, selector: string) {
  const bounds = await page.locator(selector).evaluate((el) => {
    const r = el.getBoundingClientRect(),
      arena = document.querySelector('.arena')!.getBoundingClientRect();
    const owner = document.elementFromPoint(
      r.x + r.width / 2,
      r.y + r.height / 2,
    );
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      arenaTop: arena.top,
      arenaBottom: arena.bottom,
      owned: !!owner && el.contains(owner),
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: innerHeight,
      pageScroll: scrollY,
    };
  });
  expect(bounds.pageHeight).toBeLessThanOrEqual(bounds.viewportHeight + 1);
  expect(bounds.pageScroll).toBe(0);
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.arenaTop);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.arenaBottom - 4);
  expect(bounds.owned, JSON.stringify(bounds)).toBe(true);
}

test('menus keep primary actions visible and flight keeps the whole landing plane in frame', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const sizes =
    info.project.name === 'chromium'
      ? [
          [1280, 720],
          [1366, 768],
          [1440, 900],
          [1920, 1080],
          [1024, 600],
          [1280, 600],
        ]
      : info.project.name === 'phone'
        ? [
            [390, 844],
            [375, 667],
          ]
        : info.project.name === 'phone-landscape'
          ? [[915, 412]]
          : [
              [1280, 720],
              [1440, 900],
            ];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.__hoof?.ready);
    await visibleAction(page, '.tour-home > .start-button');
    await page.getByRole('button', { name: /Disaster tour/ }).click();
    for (const act of [0, 1, 2]) {
      await page.evaluate((act) => {
        const c = window.__hoof;
        c.run!.stage = act * 3;
        c.run!.world = ['farm', 'carnival', 'moon'][act] as WorldId;
        c.publish();
      }, act);
      await expect(page.locator('.route-card h3').first()).toHaveText(
        ['Borrowed Farm', 'Carnage Carnival', 'Cheese Moon'][act],
      );
      await page.waitForFunction(() => {
        const images = [
          ...document.querySelectorAll<HTMLImageElement>('.route-card img'),
        ];
        return (
          images.length === 2 &&
          images.every((image) => image.complete && image.naturalWidth > 0)
        );
      });
      await visibleAction(page, '.route-card:first-child');
      await visibleAction(page, '.route-card:last-child');
      expect(
        await page
          .locator('.planning-screen')
          .evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeLessThanOrEqual(1);
      for (const card of await page.locator('.route-card').all()) {
        const clipped = await card.evaluate((el) => {
          const r = el.getBoundingClientRect();
          return Array.from(el.querySelectorAll('h3,p,small')).some(
            (child) => child.getBoundingClientRect().bottom > r.bottom - 3,
          );
        });
        expect(clipped, `${width}x${height}, act ${act}`).toBe(false);
      }
      if (act === 1)
        await page.screenshot({
          path: `output/playwright/fit-${info.project.name}-${width}-${height}-routes.png`,
        });
    }
    await page.evaluate(() => {
      const c = window.__hoof;
      c.screen = 'pitstop';
      c.run!.status = 'pitstop';
      c.run!.offers = ['blackhole', 'wings', 'ghostly'];
      c.run!.rewardTaken = true;
      c.publish();
    });
    await visibleAction(page, '.pitstop-tools .start-button');
    await page.screenshot({
      path: `output/playwright/fit-${info.project.name}-${width}-${height}-pitstop.png`,
    });
    await page.evaluate(() => {
      const c = window.__hoof;
      c.setExporting(true);
      Object.assign(c.state, {
        phase: 'flight',
        launched: true,
        world: 'farm',
        x: 3500,
        y: -800,
        vx: 600,
        vy: -300,
        distance: 230,
      });
      c.screen = 'game';
      c.renderer.reset();
      c.publish();
    });
    await page.waitForTimeout(100);
    for (const altitude of [80, 500, 1200, 1900, 600, 0]) {
      const frame = await page.evaluate((altitude) => {
        const c = window.__hoof;
        c.state.y = -altitude;
        c.renderer.draw(c.state, 1 / 60, c.state.time);
        const r = c.renderer;
        const ground = r.h * 0.58 + (0 - r.cameraY) * r.zoom;
        // Terrain must cover the far right as well as the camera's centre.
        const gl = (r.app.renderer as WebGLRenderer).gl;
        const pixel = new Uint8Array(4);
        gl.readPixels(
          Math.floor(r.canvas.width * 0.96),
          Math.floor(((r.h - ground - 30) / r.h) * r.canvas.height),
          1,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixel,
        );
        return {
          ground,
          height: r.h,
          top: r.framing!.subjectTop,
          safeTop: r.framing!.safeTop,
          pixel: Array.from(pixel),
        };
      }, altitude);
      expect(frame.ground).toBeLessThan(frame.height - 35);
      expect(frame.ground).toBeGreaterThan(frame.height * 0.65);
      expect(frame.top).toBeGreaterThanOrEqual(frame.safeTop - 0.1);
      expect(frame.pixel[3]).toBe(255);
      expect(
        frame.pixel[2],
        'far-right ground must not expose the blue sky',
      ).toBeLessThan(150);
      if (altitude === 500)
        await page.screenshot({
          path: `output/playwright/fit-${info.project.name}-${width}-${height}-flight.png`,
        });
    }
    const controls = await page.locator('.play-controls').boundingBox();
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(height);
    await page.evaluate(() => {
      const c = window.__hoof;
      c.state.phase = 'results';
      c.screen = 'results';
      c.run!.status = 'pitstop';
      c.publish();
    });
    await page.waitForTimeout(400);
    await visibleAction(page, '.result-main-actions .start-button');
    await visibleAction(page, '.result-links button:last-child');
    expect(
      await page
        .locator('.result-screen')
        .evaluate((el) => el.scrollHeight - el.clientHeight),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: `output/playwright/fit-${info.project.name}-${width}-${height}-results.png`,
    });
  }
  expect(errors).toEqual([]);
});

test('close-up replay distance markers remain inside the action above captions', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium');
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const frames = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts';
    const crashPath = '/lib/game/crash.ts';
    const sim = await import(simPath);
    const physics = await import(crashPath);
    const c = window.__hoof;
    c.setExporting(true);
    const s = sim.createGame();
    Object.assign(s, {
      phase: 'landing',
      world: 'farm',
      launched: true,
      x: sim.TRACK.trampoline + 3000,
      impactX: sim.TRACK.trampoline + 3000,
      vx: 500,
      vy: 400,
      landing: 'ballet',
      reactive: true,
    });
    const crash = new physics.CrashWorld(s);
    s.wreck = crash.snapshot();
    const frames = [];
    for (const [width, height] of [
      [720, 1160],
      [1280, 620],
      [915, 260],
    ]) {
      c.renderer.resize(width, height, 0);
      c.renderer.reset();
      c.renderer.draw(s, 1, 0);
      const labels: { text: string; top: number; bottom: number }[] = [];
      const visit = (node: Container) => {
        const text = (node as Text).text;
        if (typeof text === 'string' && /^\d+ m$/.test(text)) {
          const b = node.getBounds();
          if (b.x + b.width > 0 && b.x < width)
            labels.push({ text, top: b.y, bottom: b.y + b.height });
        }
        for (const child of node.children) visit(child);
      };
      visit(c.renderer.app.stage);
      frames.push({
        width,
        height,
        labels,
        ground: c.renderer.framing!.ground,
      });
    }
    crash.dispose();
    return frames;
  });
  for (const frame of frames) {
    expect(frame.labels.length, JSON.stringify(frame)).toBeGreaterThan(0);
    for (const label of frame.labels) {
      expect(label.top).toBeGreaterThan(frame.ground);
      expect(label.bottom).toBeLessThanOrEqual(frame.height - 10);
    }
  }
});

test('a completed tour with all equipment slots keeps replay and sharing visible without scrolling', async ({
  page,
}, info) => {
  test.skip(
    !['chromium', 'phone', 'phone-landscape'].includes(info.project.name),
  );
  const sizes =
    info.project.name === 'phone'
      ? [
          [375, 667],
          [390, 844],
        ]
      : info.project.name === 'phone-landscape'
        ? [[915, 412]]
        : [[1280, 600]];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.__hoof?.ready);
    await page.getByRole('button', { name: /Disaster tour/ }).click();
    await page.evaluate(() => {
      const c = window.__hoof;
      c.setExporting(true);
      Object.assign(c.run!, {
        stage: 8,
        world: 'afterlife',
        passives: ['beans', 'tailwind', 'heavy', 'rubber'],
        ability: 'spring',
        score: 93592,
        status: 'won',
      });
      Object.assign(c.state, {
        phase: 'results',
        launched: true,
        distance: 891.9,
        havoc: 3555,
        style: 950,
        landing: 'cartwheel',
      });
      c.state.wreck = {
        bodies: [],
        time: 10,
        kicks: 0,
        abilityReady: false,
        abilityAge: 10,
        focusX: 0,
        focusY: 0,
        havoc: 3555,
        bossHits: 14,
        caption: 'BOSS LIABILITY: 14 CONFIRMED INCIDENTS.',
        flash: 0,
        synergy: '',
      };
      c.screen = 'results';
      c.newHats = ['party'];
      c.publish();
    });
    await page.waitForTimeout(450);
    await visibleAction(page, '.result-main-actions .start-button');
    for (const button of await page.locator('.result-links button').all()) {
      const fit = await button.evaluate((element) => {
        const b = element.getBoundingClientRect();
        const panel = element.closest('.result-screen')!;
        const r = panel.getBoundingClientRect();
        const owner = document.elementFromPoint(
          b.x + b.width / 2,
          b.y + b.height / 2,
        );
        return {
          visible: !!owner && element.contains(owner),
          bottom: b.bottom,
          panelBottom: r.bottom,
          overflow: panel.scrollHeight - panel.clientHeight,
        };
      });
      expect(fit.visible, `${width}x${height} ${JSON.stringify(fit)}`).toBe(
        true,
      );
      expect(fit.bottom).toBeLessThanOrEqual(fit.panelBottom - 3);
      expect(fit.overflow).toBeLessThanOrEqual(1);
    }
    await page.screenshot({
      path: `output/playwright/full-tour-results-${width}x${height}.png`,
    });
  }
});
