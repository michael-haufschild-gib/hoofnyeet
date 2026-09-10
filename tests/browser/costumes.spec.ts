import { test, expect } from './fixtures';
import { returnHome } from './inputs';

test('lazy hat preparation keeps the current outfit until ready and discards stale selections', async ({
  page,
}, info) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let costumeRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/art/costumes/')) costumeRequests++;
  });
  await page.route('**/art/costumes/disco-skull.webp', async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(costumeRequests).toBe(0);
  await page.evaluate(() => {
    window.__hoof.save.hats = [
      'helmet',
      'party',
      'crown',
      'space',
      'brain',
      'disco',
      'sausage',
    ];
    window.__hoof.publish();
  });
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  await page.getByRole('button', { name: /Disco mortis/ }).click();
  await expect(
    page.getByRole('button', { name: /Disco mortis/ }),
  ).toContainText('Fitting');
  expect(await page.evaluate(() => window.__hoof.save.hat)).toBe('helmet');
  await page.getByRole('button', { name: /Your Neighjesty/ }).click();
  release();
  await page.waitForFunction(() => window.__hoof.renderer.hatReady('disco'));
  expect(await page.evaluate(() => window.__hoof.save.hat)).toBe('crown');
  const portraits = new Set();
  for (const [hat, name] of [
    ['brain', 'Think tank'],
    ['disco', 'Disco mortis'],
    ['sausage', 'Wurst in show'],
  ] as const) {
    const card = page.getByRole('button', { name: new RegExp(name) });
    const previousPortrait = await page
      .locator('.pony-portrait img')
      .first()
      .getAttribute('src');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('.pony-portrait img').first(),
    ).not.toHaveAttribute('src', previousPortrait!);
    expect(
      await page.evaluate(
        () => window.__hoof.renderer.app.renderer.prepare.getQueue().length,
      ),
    ).toBe(0);
    portraits.add(
      await page.locator('.pony-portrait img').first().getAttribute('src'),
    );
    await page.screenshot({
      path: `output/playwright/polish-20260910/costume-${info.project.name}-${hat}-wardrobe.png`,
    });
  }
  expect(portraits.size).toBe(3);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
  await page.screenshot({
    path: `output/playwright/polish-20260910/costume-${info.project.name}-home.png`,
  });
  const before = costumeRequests;
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.state.phase === 'countdown');
  expect(
    await page.evaluate(() => window.__hoof.recording().appearance?.hat),
  ).toBe('sausage');
  expect(costumeRequests).toBe(before);
  await returnHome(page);
  await page.reload();
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(await page.evaluate(() => window.__hoof.save.hat)).toBe('sausage');
});

test('an unavailable accessory offers inline retry without replacing the equipped hat', async ({
  page,
}) => {
  let failed = true;
  await page.route('**/art/costumes/brain-bonnet.webp', (route) =>
    failed
      ? route.fulfill({ status: 503, body: 'not ready' })
      : route.continue(),
  );
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(() => {
    window.__hoof.save.hats.push('brain');
    window.__hoof.publish();
  });
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  await page.getByRole('button', { name: /Think tank/ }).click();
  await expect(page.locator('.wardrobe-error')).toBeVisible();
  expect(await page.evaluate(() => window.__hoof.save.hat)).toBe('helmet');
  failed = false;
  await page.getByRole('button', { name: 'Retry hat', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Think tank/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.wardrobe-error')).toHaveCount(0);
});

test('costume sheen follows recorded time, respects reduced effects and survives context loss', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    const simPath = '/lib/game/simulation.ts';
    const { createGame } = await import(simPath);
    const s = createGame();
    Object.assign(s, { phase: 'title', time: 3, sceneTime: 3 });
    const frames = [];
    for (const hat of ['brain', 'disco', 'sausage'] as const) {
      await r.prepareHat(hat);
      s.outfit = { hat, ponyId: 'buttercup' };
      r.reset();
      r.draw(s, 0, 3);
      const original = r.canvas.toDataURL();
      const firstCamera = { ...r.framing };
      r.draw(s, 1, 700);
      const repeated = r.canvas.toDataURL();
      const frozen = repeated === original;
      const secondCamera = { ...r.framing };
      r.gentle = true;
      r.reduced = true;
      r.reset();
      r.draw(s, 0, 3);
      const gentle = r.canvas.toDataURL();
      r.draw(s, 1, 800);
      const gentleFrozen = gentle === r.canvas.toDataURL();
      r.gentle = r.reduced = false;
      frames.push({
        hat,
        original,
        repeated,
        firstCamera,
        secondCamera,
        gentle,
        frozen,
        gentleFrozen,
      });
    }
    s.outfit = { hat: 'disco', ponyId: 'buttercup' };
    r.reset();
    r.draw(s, 0, 3);
    const before = r.canvas.toDataURL();
    window.__routineFrame = s;
    const gl = (r.app.renderer as import('pixi.js').WebGLRenderer).gl;
    const loss = gl.getExtension('WEBGL_lose_context');
    window.__contextLoss = loss!;
    return { frames, before, canLose: !!loss };
  });
  for (const frame of report.frames) {
    if (!frame.frozen) {
      await info.attach(`${frame.hat}-first`, {
        body: Buffer.from(frame.original.split(',')[1], 'base64'),
        contentType: 'image/png',
      });
      await info.attach(`${frame.hat}-repeated`, {
        body: Buffer.from(frame.repeated.split(',')[1], 'base64'),
        contentType: 'image/png',
      });
      console.log(
        JSON.stringify({
          first: frame.firstCamera,
          second: frame.secondCamera,
        }),
      );
    }
    expect(frame.frozen, frame.hat).toBe(true);
    expect(frame.gentleFrozen, frame.hat).toBe(true);
    expect(frame.gentle, frame.hat).not.toBe(frame.original);
    await info.attach(`${frame.hat}-gentle`, {
      body: Buffer.from(frame.gentle.split(',')[1], 'base64'),
      contentType: 'image/png',
    });
  }
  if (report.canLose) {
    await page.evaluate(() => window.__contextLoss.loseContext());
    await page.waitForFunction(() => window.__hoof.graphicsLost);
    await page.evaluate(() => window.__contextLoss.restoreContext());
    await page.waitForFunction(() => !window.__hoof.graphicsLost);
    const after = await page.evaluate(() => {
      const r = window.__hoof.renderer;
      r.draw(window.__routineFrame, 0, 3);
      return r.canvas.toDataURL();
    });
    expect(
      after,
      'painted accessory and glint return after native GPU restoration',
    ).toBe(report.before);
  }
});

test('failed native wardrobe warming releases temporary graphics and retry preserves shared artwork', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.setExporting(true);
    c.save.hats.push('brain');
    c.publish();
  });
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  await expect(page.locator('.pony-portrait img').first()).toHaveAttribute(
    'src',
    /^data:/,
  );
  await page.evaluate(() => {
    const native = window.__hoof.renderer.app.renderer;
    const generate = native.generateTexture.bind(native);
    const targets: import('pixi.js').Container[] = [];
    const filters: import('pixi.js').Filter[] = [];
    window.__hatPreparationProbe = {
      targets,
      filters,
      restore: () => {
        native.generateTexture = generate;
      },
    };
    native.generateTexture = (options) => {
      const target = (
        'target' in options ? options.target : options
      ) as import('pixi.js').Container;
      targets.push(target);
      const visit = (node: import('pixi.js').Container) => {
        for (const filter of node.filters ?? [])
          if (!filters.includes(filter)) filters.push(filter);
        for (const child of node.children) visit(child);
      };
      visit(target);
      throw new Error('GPU allocation interrupted during hat preparation');
    };
  });
  await page.getByRole('button', { name: /Think tank/ }).click();
  await expect(page.locator('.wardrobe-error')).toBeVisible();
  await page.getByRole('button', { name: 'Retry hat', exact: true }).click();
  await expect(page.locator('.wardrobe-error')).toBeVisible();
  const failed = await page.evaluate(() => ({
    targets: window.__hatPreparationProbe.targets.map(
      (target) => target.destroyed,
    ),
    filters: window.__hatPreparationProbe.filters.map(
      (filter) => filter._destroyed,
    ),
    hat: window.__hoof.save.hat,
    prepared: window.__hoof.renderer.hatReady('brain'),
  }));
  expect(failed.targets).toEqual([true, true]);
  expect(failed.filters).toEqual([true, true]);
  expect(failed.hat).toBe('helmet');
  expect(failed.prepared).toBe(false);
  await page.evaluate(() => window.__hatPreparationProbe.restore());
  await page.getByRole('button', { name: 'Retry hat', exact: true }).click();
  await expect(
    page.getByRole('button', { name: /Think tank/ }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.wardrobe-error')).toHaveCount(0);
  expect(
    await page.evaluate(() => window.__hoof.renderer.hatReady('brain')),
  ).toBe(true);
  await expect(page.locator('.pony-portrait img').first()).toHaveAttribute(
    'src',
    /^data:/,
  );
});

declare global {
  interface Window {
    __hatPreparationProbe: {
      targets: import('pixi.js').Container[];
      filters: import('pixi.js').Filter[];
      restore: () => void;
    };
  }
}
