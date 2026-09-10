import { test, expect } from './fixtures';
import type { Container, Texture, WebGLRenderer } from 'pixi.js';
import type { WorldAtmosphere } from '../../lib/game/effects/shaders/world-atmosphere';
import type { CombinationShow } from '../../lib/game/effects/shows/combination-show';

test('failed graphics preparation restores live flags and frees owned derivatives before a native retry', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(() => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    const owners = r as unknown as {
      atmosphere: WorldAtmosphere;
      textures: Record<string, Texture>;
      combinationShow: CombinationShow;
      terrainTexture: (world: string) => Texture;
      ponyTexture: (part: string, pony: string) => Texture;
      impactEffects: { createTextures: (app: typeof r.app) => Texture[] };
    };
    const native = r.app.renderer as WebGLRenderer;
    owners.atmosphere.restoreGraphics();
    owners.combinationShow.restoreGraphics();
    owners.atmosphere.update('moon', 7, 810, 405, 90, false, 0.35);
    const status = () =>
      JSON.stringify({
        scale: [owners.atmosphere.view.scale.x, owners.atmosphere.view.scale.y],
        visible: owners.atmosphere.view.visible,
        uniforms: owners.atmosphere.view.shader!.resources.weather.uniforms,
        labels: owners.combinationShow.view.children.map(
          (child) => child.visible,
        ),
      });
    const before = status(),
      targets: Container[] = [];
    // Captured before the patch below replaces it; the replacement calls it
    // back with an explicit receiver, so this is not an unbound reference.
    const generate = Reflect.get(
      native,
      'generateTexture',
    ) as WebGLRenderer['generateTexture'];
    native.generateTexture = (input) => {
      targets.push(('target' in input ? input.target : input) as Container);
      throw new Error('simulated GPU allocation failure');
    };
    let failures = 0;
    const attempt = (work: () => unknown) => {
      try {
        work();
      } catch {
        failures++;
      }
    };
    try {
      attempt(() => owners.atmosphere.prepare(native));
      attempt(() => owners.combinationShow.prepare(native));
      attempt(() => owners.terrainTexture('office'));
      attempt(() => owners.ponyTexture('tail', 'midnight'));
    } finally {
      native.generateTexture = generate;
    }
    const unchanged = before === status();
    const derivativesFreed = targets
      .slice(2)
      .every((target) => target.destroyed);
    let count = 0;
    const partial: Texture[] = [],
      shapes: Container[] = [];
    native.generateTexture = (input) => {
      shapes.push(('target' in input ? input.target : input) as Container);
      if (++count === 2) throw new Error('second texture fails');
      const texture = Reflect.apply(generate, native, [input]);
      partial.push(texture);
      return texture;
    };
    try {
      attempt(() => owners.impactEffects.createTextures(r.app));
    } finally {
      native.generateTexture = generate;
    }
    const partialFreed =
      partial.every((texture) => texture.destroyed) &&
      shapes.every((shape) => shape.destroyed);
    owners.atmosphere.prepare(native);
    owners.combinationShow.prepare(native);
    const terrain = owners.terrainTexture('office'),
      palette = owners.ponyTexture('tail', 'midnight');
    const retried = !terrain.destroyed && !palette.destroyed;
    let repeated = 0;
    native.generateTexture = () => {
      repeated++;
      throw new Error('prepared content must not regenerate');
    };
    try {
      owners.atmosphere.prepare(native);
      owners.combinationShow.prepare(native);
      owners.terrainTexture('office');
      owners.ponyTexture('tail', 'midnight');
    } finally {
      native.generateTexture = generate;
    }
    return {
      failures,
      unchanged,
      derivativesFreed,
      partialFreed,
      retried,
      repeated,
      sourceIntact:
        !owners.textures.head.destroyed && !owners.textures.tail.destroyed,
    };
  });
  expect(report).toEqual({
    failures: 5,
    unchanged: true,
    derivativesFreed: true,
    partialFreed: true,
    retried: true,
    repeated: 0,
    sourceIntact: true,
  });
});

test('a failed wardrobe portrait leaves the game usable and its existing Retry regenerates every preview', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.setExporting(true);
    const extract = c.renderer.app.renderer.extract;
    // Captured before the patch below replaces it.
    const canvas = Reflect.get(extract, 'canvas') as typeof extract.canvas;
    const targets: Container[] = [];
    extract.canvas = (input) => {
      targets.push(('target' in input! ? input.target : input) as Container);
      throw new Error('simulated portrait extraction failure');
    };
    window.__portraitFailure = {
      targets,
      restore: () => {
        extract.canvas = canvas;
      },
    };
  });
  await page.getByRole('button', { name: 'Pony & hats', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const problem = page.locator('.wardrobe-error');
  await expect(problem).toContainText('preview');
  await problem
    .getByRole('button', { name: 'Retry preview', exact: true })
    .click();
  expect(
    await page.evaluate(() => window.__portraitFailure.targets.length),
  ).toBe(2);
  expect(
    await page.evaluate(() =>
      window.__portraitFailure.targets.every((target) => target.destroyed),
    ),
  ).toBe(true);
  expect(await page.evaluate(() => window.__hoof.save.hat)).toBe('helmet');
  await page.evaluate(() => window.__portraitFailure.restore());
  await problem
    .getByRole('button', { name: 'Retry preview', exact: true })
    .click();
  await expect(problem).toHaveCount(0);
  await expect(page.locator('.pony-portrait img')).toHaveCount(4);
  expect(
    await page
      .locator('.pony-portrait img')
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Quick play', exact: true }),
  ).toBeEnabled();
});

declare global {
  interface Window {
    __portraitFailure: { targets: Container[]; restore: () => void };
  }
}
