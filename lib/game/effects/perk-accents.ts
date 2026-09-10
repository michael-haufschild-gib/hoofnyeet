import type { Graphics, Sprite } from 'pixi.js';
import { propulsionPuff } from './motion/perk-motion';

/** Outline colour every hand-drawn equipment accent is inked with. */
export const ink = 0x31534b;
/** Cool tint the beans upgrade gives the tailwind's gusts. */
export const mint = 0xcef49a;
/** Warm highlight shared by honey, acrobat sparkles and the worn trinkets. */
export const gold = 0xffda6b;

/** Wreckage the magnet is heavy enough to reel in; everything else is litter. */
export const MAGNETIC_PARTS = ['cabinet', 'piano', 'helmet', 'drum', 'tnt'];

type PuffPose = NonNullable<ReturnType<typeof propulsionPuff>>;

/**
 * One gust streak drifting past a tailwind rider: a soft wide stroke under a
 * bright core, plus a leaf fleck while motion is allowed. `index` and `count`
 * place the streak in the repeating cycle, `readable` compensates for camera
 * zoom, and `storm` tints the core for the beans upgrade. Paints into `g`
 * around the pony at `x`/`y` in world units and returns nothing.
 */
export function drawGust(
  g: Graphics,
  index: number,
  count: number,
  x: number,
  y: number,
  time: number,
  readable: number,
  reduced: boolean,
  storm: boolean,
) {
  const p = reduced ? 0.42 : (time * 1.4 + index / count) % 1;
  const start = x + (-108 + p * 133) * readable;
  const row = y + (index % 2 ? 1 : -1) * (32 + index * 7) * readable;
  const alpha = reduced ? 0.55 : Math.sin(p * Math.PI) * 0.85;
  g.moveTo(start - 55 * readable, row)
    .bezierCurveTo(
      start - 15,
      row - 11,
      start + 25,
      row + 12,
      start + 50 * readable,
      row,
    )
    .stroke({ color: ink, width: 5 * readable, alpha: alpha * 0.25 })
    .moveTo(start - 55 * readable, row)
    .bezierCurveTo(
      start - 15,
      row - 11,
      start + 25,
      row + 12,
      start + 50 * readable,
      row,
    )
    .stroke({
      color: storm ? mint : 0xf3fff1,
      width: 2.5 * readable,
      alpha,
    });
  if (!reduced)
    g.ellipse(start + 30, row + 9, 5, 2).fill({ color: 0xb9dc6e, alpha });
}

/**
 * Writes one sampled puff pose onto a pooled sprite. `readable` compensates
 * for camera zoom; the height follows the texture's aspect so the cloud never
 * distorts. Reduced motion shrinks the puff and drops its tumble. Mutates the
 * sprite in place, so a whole flight of puffs allocates nothing.
 */
export function posePuff(
  p: Sprite,
  at: PuffPose,
  readable: number,
  reduced: boolean,
) {
  p.visible = true;
  p.position.set(at.x, at.y);
  p.width = at.size * readable * (reduced ? 0.75 : 1);
  p.height = (p.width * p.texture.height) / p.texture.width;
  p.rotation = reduced ? 0 : at.angle;
  p.alpha = at.alpha;
}

/**
 * Eight stars thrown outward from the pony at `x`/`y` after a ring or flip
 * reaction. `age` is seconds since the reaction: the ring expands with it and
 * has faded out by the 0.8 s the reaction lasts.
 */
export function drawReactionRing(
  g: Graphics,
  x: number,
  y: number,
  age: number,
) {
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.star(
      x + Math.cos(a) * (70 + age * 80),
      y + Math.sin(a) * (70 + age * 80),
      4,
      8,
      3,
    ).fill({ color: gold, alpha: 1 - age / 0.8 });
  }
}
