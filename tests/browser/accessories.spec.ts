import { test, expect } from './fixtures';
import { returnHome } from './inputs';
import type { Container, Sprite } from 'pixi.js';
import type { Hat } from '../../lib/game/simulation';

test('hat selection previews the outfit, applies during play and survives reload without rewriting footage', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.save.hats = ['helmet', 'party', 'crown', 'space'];
    c.publish();
  });
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  const portraits = new Set<string>();
  for (const [hat, name] of [
    ['helmet', 'Safety-ish'],
    ['party', 'Party animal'],
    ['crown', 'Your Neighjesty'],
    ['space', 'Neigh-stronaut'],
  ] as const) {
    const option = page.getByRole('button', { name: new RegExp(name) });
    const before = await page
      .locator('.pony-portrait img')
      .first()
      .getAttribute('src');
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(option).toContainText('Equipped');
    if (hat !== 'helmet')
      await expect(
        page.locator('.pony-portrait img').first(),
      ).not.toHaveAttribute('src', before!);
    portraits.add(
      (await page.locator('.pony-portrait img').first().getAttribute('src'))!,
    );
    await expect
      .poll(() =>
        page.evaluate(() => {
          const scene = window.__hoof.renderer as unknown as {
            headwear: { view: Container };
          };
          return scene.headwear.view.children
            .filter((p) => p.visible)
            .map((p) => p.label);
        }),
      )
      .toEqual(hat === 'helmet' ? [] : [hat]);
  }
  expect(portraits.size).toBe(4);
  await page.screenshot({
    path: `output/playwright/accessories-wardrobe-${info.project.name}.png`,
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.screenshot({
    path: `output/playwright/accessories-home-${info.project.name}.png`,
  });
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  // Start a stable airborne section; selection itself uses the real pause/settings UI.
  await page.evaluate(() => {
    Object.assign(window.__hoof.state, {
      phase: 'flight',
      x: 2000,
      y: -500,
      vx: 400,
      vy: -30,
      phaseTime: 1,
    });
  });
  await page.waitForFunction(() => window.__hoof.recording().frames.length > 2);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: /Dressing room/ }).click();
  const oldFrames = await page.evaluate(() =>
    JSON.stringify(window.__hoof.recording().frames),
  );
  await page.getByRole('button', { name: /Party animal/ }).click();
  await expect
    .poll(() => page.evaluate(() => window.__hoof.renderer.hat))
    .toBe('party');
  expect(
    await page.evaluate(() => JSON.stringify(window.__hoof.recording().frames)),
  ).toBe(oldFrames);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await page.waitForFunction(
    () => window.__hoof.recording().frames.at(-1)?.outfit?.hat === 'party',
  );
  const recording = await page.evaluate(() => window.__hoof.recording());
  expect(recording.frames[0].outfit?.hat).toBe('space');
  expect(recording.frames.at(-1)?.outfit?.hat).toBe('party');
  await returnHome(page);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(await page.evaluate(() => window.__hoof.save.hat)).toBe('party');
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  expect(
    await page.evaluate(() => window.__hoof.recording().appearance?.hat),
  ).toBe('party');
  expect(errors).toEqual([]);
});

test('accessories follow moving and severed heads and recorded outfits render identically after a wardrobe change', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts';
    const sim = await import(simPath),
      physics = await import(crashPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    await r.loadWorld('farm');
    const scene = r as unknown as {
      pony: Container;
      ponyParts: Record<string, Sprite>;
      headwear: { view: Container };
      crashHeadwear: { view: Container };
      bodySprites: Map<number, Sprite>;
    };
    const rows = [],
      captures = [];
    for (const hat of ['helmet', 'party', 'crown', 'space'] as Hat[]) {
      r.hat = hat;
      for (const phase of ['runup', 'compression', 'flight'] as const) {
        const s = sim.createGame();
        Object.assign(s, {
          phase,
          phaseTime: 0.21,
          time: 4,
          x: 2000,
          y: phase === 'flight' ? -900 : 0,
          flapPose: 0.25,
          rotation: phase === 'flight' ? 0.5 : 0,
        });
        r.reset();
        r.draw(s, 0, 4);
        const head = scene.ponyParts.head,
          socket = scene.headwear.view;
        const bounds = socket.getBounds();
        rows.push({
          hat,
          phase,
          attached:
            socket.x === head.x &&
            socket.y === head.y &&
            socket.rotation === head.rotation,
          visible: socket.children.filter((p) => p.visible).map((p) => p.label),
          top: bounds.y,
          safe: r.framing!.safeTop,
        });
      }
      for (const angle of [0, Math.PI]) {
        const s = sim.createGame();
        Object.assign(s, {
          phase: 'landing',
          reactive: true,
          landing: 'cartwheel',
          x: 2400,
          impactX: 2400,
          vx: 650,
          vy: 750,
          impactRotation: angle,
          seed: 31,
          outfit: { hat, ponyId: 'buttercup' },
        });
        const crash = new physics.CrashWorld(s);
        for (let i = 0; i < 240; i++) crash.step(1 / 120);
        s.wreck = crash.snapshot();
        s.time = s.sceneTime = 2;
        r.reset();
        r.draw(s, 0, 2);
        const head = scene.bodySprites.get(s.wreck.headId!)!;
        const socket = scene.crashHeadwear.view;
        rows.push({
          hat,
          phase: 'crash',
          attached:
            socket.x === head.x &&
            socket.y === head.y &&
            socket.rotation === head.rotation,
          visible: socket.children.filter((p) => p.visible).map((p) => p.label),
          top: 0,
          safe: 0,
        });
        const original = r.canvas.toDataURL();
        if (!angle) captures.push({ hat, url: original });
        r.hat = 'helmet';
        r.ponyId = 'bubblegum';
        r.reset();
        r.draw(JSON.parse(JSON.stringify(s)), 0, 2);
        if (original !== r.canvas.toDataURL())
          throw new Error(`Outfit changed in ${hat} replay`);
        r.hat = hat;
        r.ponyId = 'buttercup';
        crash.dispose();
      }
    }
    return { rows, captures };
  });
  for (const row of report.rows) {
    expect(row.attached, JSON.stringify(row)).toBe(true);
    expect(row.visible).toEqual(row.hat === 'helmet' ? [] : [row.hat]);
    if (row.hat !== 'helmet')
      expect(row.top, JSON.stringify(row)).toBeGreaterThanOrEqual(row.safe - 1);
  }
  for (const capture of report.captures)
    await info.attach(`detached-${capture.hat}`, {
      body: Buffer.from(capture.url.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
});
