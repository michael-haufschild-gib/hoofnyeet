import { test, expect } from './fixtures';
import type { Container } from 'pixi.js';

test('title teaches both controls and keeps the animated horse clear of the guide', async ({
  page,
}, info) => {
  const sizes =
    info.project.name === 'phone'
      ? [
          [390, 844],
          [375, 667],
          [820, 1180],
          [1180, 820],
        ]
      : info.project.name === 'phone-landscape'
        ? [[915, 412]]
        : [
            [1280, 720],
            [1024, 600],
            [1560, 1280],
            [1920, 1080],
            [2560, 1440],
            [768, 1024],
            [620, 900],
          ];
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.waitForFunction(() => window.__hoof?.ready);
    await expect(
      page.getByRole('heading', { name: 'Hoof & Yeet', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'How to play' }),
    ).toBeVisible();
    const touch = info.project.name.startsWith('phone');
    for (const input of ['Tap left', 'Tap right']) {
      if (touch)
        await expect(page.getByText(input, { exact: true })).toBeVisible();
      else await expect(page.getByText(input, { exact: true })).toBeHidden();
    }
    for (const mouse of ['or left click', 'or right click']) {
      if (touch)
        await expect(page.getByText(mouse, { exact: true })).toBeHidden();
      else await expect(page.getByText(mouse, { exact: true })).toBeVisible();
    }
    await expect(page.locator('.guide-action > b')).toHaveText([
      'Run',
      'Jump',
      'Flap',
      'Roll',
      'Kick',
      'Ability',
    ]);
    await expect(page.getByText('Huge liability.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^PLAY$/ })).toBeEnabled();

    const measure = () =>
      page.evaluate(() => {
        const r = window.__hoof.renderer;
        const pony = (r as unknown as { pony: Container }).pony;
        const b = pony.getBounds();
        const arena = document.querySelector('.arena')!.getBoundingClientRect();
        const menu = document
          .querySelector('.tour-home')!
          .getBoundingClientRect();
        const overlays = [
          '.tour-home h1',
          '.home-controls',
          '.tour-home > .start-button',
        ].map((selector) => {
          const el = document.querySelector(selector)!;
          const d = el.getBoundingClientRect();
          return {
            selector,
            x: d.x - arena.x,
            y: d.y - arena.y,
            width: d.width,
            height: d.height,
          };
        });
        return {
          pony: { x: b.x, y: b.y, width: b.width, height: b.height },
          menu: { y: menu.y - arena.y, height: menu.height },
          instructionSize: parseFloat(
            getComputedStyle(document.querySelector('.guide-action')!).fontSize,
          ),
          overlays,
          width: r.w,
          height: r.h,
          scrollHeight: document.documentElement.scrollHeight,
          viewportHeight: innerHeight,
          angles: pony.children.map((child) => child.rotation),
        };
      });
    const frame = await measure();
    expect(frame.scrollHeight).toBeLessThanOrEqual(frame.viewportHeight + 1);
    expect(frame.pony.height).toBeGreaterThan(125);
    expect(frame.pony.x).toBeGreaterThan(0);
    expect(frame.pony.y).toBeGreaterThan(0);
    expect(frame.pony.x + frame.pony.width).toBeLessThan(frame.width);
    expect(frame.pony.y + frame.pony.height).toBeLessThan(frame.height);
    if (
      frame.width > 900 ||
      (frame.width > 600 && frame.width > frame.height)
    ) {
      const ponyCentre = frame.pony.y + frame.pony.height / 2;
      const menuCentre = frame.menu.y + frame.menu.height / 2;
      expect(
        Math.abs(ponyCentre - menuCentre),
        `${width}x${height}: the menu and hero must form one composition`,
      ).toBeLessThan(frame.height * 0.12);
      if (width >= 1400) {
        expect(frame.instructionSize).toBeGreaterThanOrEqual(20);
        expect(frame.pony.height).toBeGreaterThan(400);
      }
    }
    for (const overlay of frame.overlays) {
      expect(overlay.y).toBeGreaterThanOrEqual(0);
      expect(overlay.y + overlay.height).toBeLessThan(frame.height);
      const intersects =
        frame.pony.x < overlay.x + overlay.width &&
        frame.pony.x + frame.pony.width > overlay.x &&
        frame.pony.y < overlay.y + overlay.height &&
        frame.pony.y + frame.pony.height > overlay.y;
      expect(
        intersects,
        `${width}x${height}: ${overlay.selector} covers the horse`,
      ).toBe(false);
    }
    const pose = await page.evaluate(() => window.__hoof.state.time);
    await page.waitForTimeout(350);
    expect(await page.evaluate(() => window.__hoof.state.time)).toBeGreaterThan(
      pose,
    );
    expect((await measure()).angles).not.toEqual(frame.angles);
    await page.screenshot({
      path: `output/playwright/home-guide-${info.project.name}-${width}x${height}.png`,
    });
  }

  await page.evaluate(() => {
    window.__hoof.setPreference('primaryKey', 'KeyA');
    window.__hoof.setPreference('secondaryKey', 'KeyW');
  });
  await expect(page.locator('.guide-keyboard .guide-key.primary')).toHaveText(
    'A',
  );
  await expect(page.locator('.guide-keyboard .guide-key.secondary')).toHaveText(
    'W',
  );
  await page.getByRole('button', { name: /^PLAY$/ }).click();
  const inputs = page.locator('.pad-inputs');
  await expect(inputs).toHaveCount(2);
  for (const input of await inputs.all()) {
    if (info.project.name.startsWith('phone')) await expect(input).toBeHidden();
    else await expect(input).toBeVisible();
  }
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.evaluate(() =>
    Object.assign(window.__hoof.state, {
      rotation: 2.4,
      flipActive: true,
      flapPose: 0.3,
      y: -220,
      vx: 900,
    }),
  );
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  expect(
    await page.evaluate(() => ({
      phase: window.__hoof.state.phase,
      rotation: window.__hoof.state.rotation,
      y: window.__hoof.state.y,
      flip: window.__hoof.state.flipActive,
      flap: window.__hoof.state.flapPose,
    })),
  ).toEqual({ phase: 'title', rotation: 0, y: 0, flip: false, flap: 0 });
  await expect(page.getByRole('group', { name: 'How to play' })).toBeVisible();
});
