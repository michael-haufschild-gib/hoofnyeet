import { Container, Rectangle, Sprite, type Texture } from 'pixi.js';
import { terrainGraphic } from '../art/terrain';
import { ponyPalette } from '../effects/shaders/pony-palette';
import { Headwear } from '../art/headwear';
import { PONIES, type PonyId } from '../catalogue/cosmetics';
import type { WorldId } from '../content';
import type { Hat } from '../simulation';
import type { GameRenderer } from '../renderer';

/**
 * Sprite keys that carry a per-pony recolour. Every other key resolves to the
 * one shared source texture, whichever pony is selected.
 */
export const PALETTED_PARTS = [
  'head',
  'surprisedHead',
  'offended-head',
  'tail',
  'torso',
  'straightLeg',
  'cube',
];

/**
 * Returns the cached 1024x360 ground strip for a world, rendering it on first
 * use from the world's vector terrain.
 *
 * A failed GPU allocation destroys the scratch graphic and caches nothing, so
 * the next call retries rather than serving a broken texture.
 */
export function terrainTexture(r: GameRenderer, id: WorldId) {
  let texture = r.terrainTextures.get(id);
  if (!texture) {
    const g = terrainGraphic(id);
    try {
      texture = r.app.renderer.generateTexture({
        target: g,
        frame: new Rectangle(0, 0, 1024, 360),
      });
    } finally {
      g.destroy();
    }
    r.terrainTextures.set(id, texture);
  }
  return texture;
}

/**
 * Resolves one body-part texture for a pony, generating and caching the
 * recolour on first use.
 *
 * Returns the source texture unchanged for the default pony and for any part
 * outside `PALETTED_PARTS`. The scratch sprite and its filter are released
 * even when the GPU allocation throws.
 */
export function ponyTexture(
  r: GameRenderer,
  part: string,
  id: PonyId,
): Texture {
  const base = r.textures[part];
  if (id === 'buttercup' || !PALETTED_PARTS.includes(part)) return base;
  const key = `${id}:${part}`;
  let texture = r.paletteTextures.get(key);
  if (!texture) {
    const sprite = new Sprite(base);
    const filter = ponyPalette(id);
    sprite.filters = [filter];
    try {
      texture = r.app.renderer.generateTexture({
        target: sprite,
        resolution: 1,
      });
    } finally {
      sprite.destroy();
      filter.destroy();
    }
    r.paletteTextures.set(key, texture);
  }
  return texture;
}

/** Extracts one wardrobe preview as a PNG data URL, or '' when unsupported. */
function renderPortrait(
  r: GameRenderer,
  portraits: Record<string, string>,
  id: PonyId,
  hat: Hat,
) {
  const texture = ponyTexture(r, 'head', id);
  const target = new Container();
  const sprite = new Sprite({
    texture,
    anchor: 0.5,
  });
  sprite.width = 71;
  sprite.height = 87;
  const headwear = new Headwear(r.textures);
  target.addChild(sprite, headwear.view);
  try {
    headwear.fit(hat, sprite, 'head', false, 0, true, r.gentle);
    const canvas = r.app.renderer.extract.canvas({
      target,
      frame: new Rectangle(-56, -90, 136, 150),
      resolution: 1,
    });
    portraits[id] = canvas.toDataURL?.('image/png') ?? '';
  } finally {
    headwear.dispose();
    target.destroy({ children: true });
  }
}

/**
 * Renders one wardrobe preview per pony wearing `hat`, keyed by pony id.
 *
 * Results are cached per hat and gore setting, and an unloaded renderer
 * returns nothing rather than an empty picture.
 */
export function ponyPortraits(r: GameRenderer, hat: Hat) {
  if (!r.ready) return {};
  const key = `${hat}:${r.gentle}`;
  const cached = r.portraits.get(key);
  if (cached) return cached;
  const portraits: Record<string, string> = {};
  for (const pony of PONIES) renderPortrait(r, portraits, pony.id, hat);
  r.portraits.set(key, portraits);
  return portraits;
}
