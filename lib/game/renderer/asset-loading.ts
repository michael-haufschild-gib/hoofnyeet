import { Assets, Container, Sprite, type Texture } from 'pixi.js';
import { Headwear } from '../art/headwear';
import { PALETTED_PARTS, ponyTexture, terrainTexture } from './textures';
import type { PonyId } from '../catalogue/cosmetics';
import type { WorldId } from '../content';
import type { Hat } from '../simulation';
import type { GameRenderer } from '../renderer';

/** Gore artwork every world shares, loaded once before the first course. */
const CARNAGE_KEYS = [
  'sausage',
  'bouquet',
  'skin',
  'heart',
  'brain',
  'turnstile',
  'droplet',
  'splat',
  'tooth',
];

/**
 * Loads the sprite atlas, the title backdrop and both display faces.
 *
 * Resolves only once every texture has decoded, so the caller can publish the
 * whole set at one point rather than showing a half-dressed scene.
 */
export async function loadArtwork(): Promise<{
  bg: Texture;
  textures: Record<string, Texture>;
}> {
  const paths = (await fetch('/art/sprites.json').then((response) =>
    response.json(),
  )) as Record<string, string>;
  const [bg, sprites] = await Promise.all([
    Assets.load<Texture>('/art/countryside.webp'),
    Promise.all(
      Object.entries(paths).map(
        async ([id, path]) => [id, await Assets.load<Texture>(path)] as const,
      ),
    ),
    document.fonts.load('20px "Lilita One"'),
    document.fonts.load('700 20px "Nunito"'),
  ]);
  return { bg, textures: Object.fromEntries(sprites) };
}

/**
 * Loads the shared gore artwork into the renderer's texture table.
 *
 * A renderer disposed mid-flight keeps its table untouched, so a late arrival
 * cannot resurrect destroyed graphics.
 */
export function loadCarnageArt(r: GameRenderer): Promise<void> {
  return Promise.all(
    CARNAGE_KEYS.map(async (key) => {
      const texture = await Assets.load<Texture>(`/art/carnage/${key}.webp`);
      if (!r.disposed) r.textures[key] = texture;
    }),
  ).then(() => {});
}

/**
 * Compiles the headwear glint shader against a throwaway head.
 *
 * Run before a newly chosen hat becomes visible, so the first frame wearing it
 * does not stall on shader compilation. The scratch container and its
 * generated texture are always released.
 */
export function warmHatShader(r: GameRenderer, hat: Hat) {
  const target = new Container();
  const head = new Sprite({ texture: r.textures.head, anchor: 0.5 });
  head.width = 71;
  head.height = 87;
  const headwear = new Headwear(r.textures);
  target.addChild(head, headwear.view);
  try {
    headwear.fit(hat, head, 'head', false, 0, r.reduced, r.gentle);
    const warmed = r.app.renderer.generateTexture({
      target,
      resolution: 1,
    });
    warmed.destroy(true);
  } finally {
    headwear.dispose();
    target.destroy({ children: true });
  }
}

/**
 * Collects every texture one course needs on the GPU before it starts.
 *
 * Generating the ground strip and the pony recolours is part of the call, so
 * it runs while the loading overlay is still up rather than on the first
 * frame. The world background must already be loaded.
 */
export function levelArtwork(
  r: GameRenderer,
  id: WorldId,
  pony: PonyId,
): Texture[] {
  const terrain = terrainTexture(r, id);
  const appearance = PALETTED_PARTS.map((part) => ponyTexture(r, part, pony));
  return [
    ...Object.values(r.textures),
    r.backgrounds.get(id)!,
    terrain,
    ...appearance,
  ];
}

/** Compiles every effect shader the course uses against the live renderer. */
export function preparePipelines(r: GameRenderer) {
  r.impactEffects.prepare(r.app.renderer);
  r.carnageEffects.prepare(r.app.renderer);
  r.perkEffects.prepare(r.app.renderer);
  r.combinationShow.prepare(r.app.renderer);
  r.atmosphere.prepare(r.app.renderer);
}
