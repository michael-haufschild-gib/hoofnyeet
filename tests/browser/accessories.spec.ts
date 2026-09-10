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
    for (const hat of [
      'helmet',
      'party',
      'crown',
      'space',
      'brain',
      'disco',
      'sausage',
    ] as Hat[]) {
      await r.prepareHat(hat);
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

test('hat rims sit on each illustrated skull and the visor leaves the eyes and muzzle clear', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const path = '/lib/game/art/headwear.ts';
    const { Headwear } = await import(path);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const scene = r as unknown as {
      textures: Record<string, import('pixi.js').Texture>;
      pony: Container;
      ponyParts: Record<string, Sprite>;
    };
    const SpriteClass = scene.ponyParts.head
      .constructor as typeof import('pixi.js').Sprite;
    const ContainerClass = scene.pony
      .constructor as typeof import('pixi.js').Container;
    const mask = document.createElement('canvas');
    const image = new Image();
    image.src = '/art/sprites/astronaut-helmet.webp';
    await image.decode();
    mask.width = image.naturalWidth;
    mask.height = image.naturalHeight;
    const context = mask.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const rows = [],
      captures = [];
    for (const part of ['head', 'surprisedHead', 'offended-head'] as const) {
      for (const hat of [
        'party',
        'crown',
        'space',
        'brain',
        'disco',
        'sausage',
      ] as const) {
        await r.prepareHat(hat);
        const target = new ContainerClass();
        const head = new SpriteClass({
          texture: scene.textures[part],
          anchor: 0.5,
        });
        head.width = 71;
        head.height = (71 * head.texture.height) / head.texture.width;
        const wear = new Headwear(scene.textures);
        wear.fit(hat, head, part);
        target.addChild(head, wear.view);
        const p = wear.view.children.find(
          (p: Sprite) => p.label === hat,
        ) as Sprite;
        const brim = {
          party: [0.43, 0.81],
          crown: [0.46, 0.845],
          space: [0.5, 0.5],
          brain: [0.55, 0.94],
          disco: [0.49, 0.94],
          sausage: [0.53, 0.9],
        }[hat];
        const contact = head.toLocal(
          p.toGlobal({
            x: (brim[0] - p.anchor.x) * p.texture.width,
            y: (brim[1] - p.anchor.y) * p.texture.height,
          }),
        );
        // Independent facial landmarks in the original head artwork. They must
        // fall in transparent glass, not behind the opaque helmet frame.
        const landmarks =
          part === 'offended-head'
            ? [
                [0.63, 0.57],
                [0.8, 0.52],
                [0.81, 0.74],
              ]
            : part === 'surprisedHead'
              ? [
                  [0.64, 0.44],
                  [0.83, 0.43],
                  [0.86, 0.58],
                ]
              : [
                  [0.61, 0.44],
                  [0.81, 0.4],
                  [0.86, 0.56],
                ];
        const occlusion =
          hat !== 'space'
            ? []
            : landmarks.map(([u, v]) => {
                const point = p.toLocal(
                  head.toGlobal({
                    x: (u - 0.5) * head.texture.width,
                    y: (v - 0.5) * head.texture.height,
                  }),
                );
                const x = Math.round(point.x + p.anchor.x * image.naturalWidth);
                const y = Math.round(
                  point.y + p.anchor.y * image.naturalHeight,
                );
                return context.getImageData(x, y, 1, 1).data[3];
              });
        rows.push({
          part,
          hat,
          seat: {
            u: contact.x / head.texture.width + 0.5,
            v: contact.y / head.texture.height + 0.5,
          },
          aspectError: Math.abs(
            p.width / p.height - p.texture.width / p.texture.height,
          ),
          occlusion,
        });
        const canvas = r.app.renderer.extract.canvas({ target, resolution: 3 });
        captures.push({
          name: `${part}-${hat}`,
          url: canvas.toDataURL?.() ?? '',
        });
        wear.dispose();
        target.destroy({ children: true });
      }
    }
    return { rows, captures };
  });
  for (const row of report.rows) {
    expect(row.aspectError, JSON.stringify(row)).toBeLessThan(0.001);
    if (row.hat !== 'space') {
      expect(row.seat.u, JSON.stringify(row)).toBeGreaterThan(0.5);
      expect(row.seat.u, JSON.stringify(row)).toBeLessThan(0.75);
      expect(row.seat.v, JSON.stringify(row)).toBeGreaterThan(0.1);
      expect(row.seat.v, JSON.stringify(row)).toBeLessThan(0.26);
    }
    for (const alpha of row.occlusion)
      expect(alpha, JSON.stringify(row)).toBeLessThan(80);
  }
  for (const capture of report.captures)
    await info.attach(capture.name, {
      body: Buffer.from(capture.url.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
});

test('wing roots and magnetic shoes remain attached throughout gallops, flaps and rolls, inside the camera', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const rows = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts';
    const { createGame } = await import(simPath);
    const c = window.__hoof;
    c.setExporting(true);
    const r = c.renderer;
    const scene = r as unknown as {
      pony: Container;
      ponyParts: Record<string, Sprite>;
      gear: Record<string, Sprite>;
    };
    const rows = [];
    for (const equipment of [
      ['wings', 'magnet'],
      ['wings', 'feather', 'magnet'],
    ]) {
      for (const phase of [
        'title',
        'runup',
        'compression',
        'flight',
      ] as const) {
        for (let i = 0; i < 12; i++) {
          const s = createGame();
          Object.assign(s, {
            phase,
            phaseTime: 0.16,
            x: 2000 + i * 11,
            y: phase === 'flight' ? -350 : 0,
            flapPose: phase === 'flight' ? 0.45 * (1 - i / 12) : 0,
            rotation: phase === 'flight' ? (i * Math.PI) / 6 : 0,
            equipment,
            outfit: { hat: 'space', ponyId: 'buttercup' },
          });
          r.reset();
          r.draw(s, 0, 4);
          const near = scene.gear['wing-left'],
            far = scene.gear['wing-right'];
          const root = (p: Sprite, u: number) =>
            scene.pony.toLocal(
              p.toGlobal({
                x: (u - p.anchor.x) * p.texture.width,
                y: (0.76 - p.anchor.y) * p.texture.height,
              }),
            );
          const sole = scene.ponyParts.frontLeg2;
          const shoe = scene.gear['magnetic-horseshoe'];
          const shoeFoot = shoe.toGlobal({ x: 0, y: 0 });
          const hoofFoot = sole.toGlobal({
            x: 0,
            y: sole.texture.height * (0.985 - sole.anchor.y),
          });
          const bounds = scene.pony.getBounds();
          rows.push({
            phase,
            i,
            equipment,
            near: root(near, 0.83),
            far: root(far, 0.17),
            shoeGap:
              Math.hypot(shoeFoot.x - hoofFoot.x, shoeFoot.y - hoofFoot.y) /
              r.zoom,
            aspectError: Math.abs(
              near.width / near.height -
                near.texture.width / near.texture.height,
            ),
            layered:
              scene.pony.getChildIndex(far) <
                scene.pony.getChildIndex(scene.ponyParts.torso) &&
              scene.pony.getChildIndex(near) <
                scene.pony.getChildIndex(scene.ponyParts.head),
            top: bounds.y,
            safe: r.framing!.safeTop,
            left: bounds.x,
            right: bounds.x + bounds.width,
            width: r.w,
          });
        }
      }
    }
    return rows;
  });
  for (const row of rows) {
    expect(row.near.x, JSON.stringify(row)).toBeCloseTo(6, 4);
    expect(row.near.y, JSON.stringify(row)).toBeCloseTo(-17, 4);
    expect(row.far.x, JSON.stringify(row)).toBeCloseTo(15, 4);
    expect(row.far.y, JSON.stringify(row)).toBeCloseTo(-23, 4);
    expect(row.shoeGap, JSON.stringify(row)).toBeLessThan(0.01);
    expect(row.aspectError, JSON.stringify(row)).toBeLessThan(0.001);
    expect(row.layered, JSON.stringify(row)).toBe(true);
    expect(row.top, JSON.stringify(row)).toBeGreaterThanOrEqual(row.safe - 1);
    expect(row.left, JSON.stringify(row)).toBeGreaterThanOrEqual(0);
    expect(row.right, JSON.stringify(row)).toBeLessThanOrEqual(row.width);
  }
});
