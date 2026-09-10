import { Sprite } from 'pixi.js';
import { RINGS, TRACK, type GameState } from '../simulation';
import { CATASTROPHES } from '../catalogue/catastrophes';
import { spectatorCells } from '../art/terrain';
import { GROUND_Y, artFoot } from '../art/geometry';
import type { WorldId } from '../content';
import type { GameRenderer } from '../renderer';

/** The two onlooker sprites each world alternates along the trackside. */
const CROWD_CAST: Record<WorldId, string[]> = {
  farm: ['sheep', 'goose'],
  candy: ['donut', 'goose'],
  carnival: ['goose', 'glove'],
  office: ['officeGoose', 'goose'],
  moon: ['ufo', 'helmet'],
  afterlife: ['ghost', 'skeleton'],
};

/** Onlookers that float instead of standing on the track. */
const HOVERING = ['ufo', 'ghost'];

/** Adds one reusable onlooker sprite to the trackside pool. */
function growCrowd(r: GameRenderer) {
  const sprite = new Sprite();
  sprite.anchor.set(0.5, 1);
  r.crowdLayer.addChild(sprite);
  r.spectators.push(sprite);
}

/** Dresses and plants one onlooker at its world-space cell. */
function placeSpectator(
  r: GameRenderer,
  s: GameState,
  p: Sprite,
  cell: number,
  time: number,
) {
  const part = CROWD_CAST[s.world][((cell % 2) + 2) % 2];
  p.texture = r.textures[part];
  p.width = s.world === 'farm' ? 55 : 42;
  p.height = (p.width * p.texture.height) / p.texture.width;
  p.x = cell * 145;
  // Sway around planted feet; hovering is reserved for ghosts and saucers.
  const hovering = HOVERING.includes(part);
  p.rotation = Math.sin(time * 2 + cell * 0.73) * 0.04;
  p.y =
    GROUND_Y -
    artFoot(part, p.width, p.height, p.rotation, 1) -
    (hovering ? 30 + Math.sin(time * 3 + cell) * 5 : 0);
}

/**
 * Fills the visible span with onlookers, reusing one sprite per pooled slot.
 *
 * `left` is the world x of the padded left screen edge. The pool only ever
 * grows, so a wide frame does not reallocate on the way back down.
 */
export function paintCrowd(
  r: GameRenderer,
  s: GameState,
  time: number,
  title: boolean,
  left: number,
) {
  const cells = spectatorCells(left, left + (r.w + 64) / r.zoom);
  while (r.spectators.length < cells.length) growCrowd(r);
  for (let i = 0; i < r.spectators.length; i++) {
    const p = r.spectators[i];
    const cell = cells[i];
    p.visible = cell !== undefined;
    if (!p.visible) continue;
    placeSpectator(r, s, p, cell, time);
    // The crowd is already behind the pony in the scene graph. Horizontal
    // proximity is not occlusion: a pony flying overhead must not erase it.
    p.visible = !title;
  }
}

/**
 * Places the hazard props that mark each hundred metres of the course.
 *
 * Which trap stands at each marker rotates with the run's disaster index, so
 * consecutive attempts on one world are not identical.
 */
export function paintProps(
  r: GameRenderer,
  s: GameState,
  time: number,
  title: boolean,
) {
  for (let i = 0; i < r.courseProps.length; i++) {
    const p = r.courseProps[i];
    const distance = (i + 1) * 100;
    const spec = CATASTROPHES[s.world][(s.disaster + i + 1) % 4];
    p.texture = r.textures[spec.trap] ?? r.textures.cube;
    p.width = 135;
    p.height = (p.width * p.texture.height) / p.texture.width;
    p.rotation = Math.sin(time * 1.8 + i) * 0.03;
    p.position.set(
      TRACK.trampoline + distance * 10 + 180,
      GROUND_Y - artFoot(spec.trap, p.width, p.height, p.rotation, 1),
    );
    p.visible = !title;
  }
}

/** Pulses the scoring rings, fading the set out once the wreck begins. */
export function paintRings(
  r: GameRenderer,
  s: GameState,
  time: number,
  title: boolean,
  crash: boolean,
) {
  for (let i = 0; i < RINGS.length; i++) {
    const p = r.ringSprites[i];
    p.position.set(RINGS[i].x, RINGS[i].y);
    p.alpha = crash ? Math.max(0, 1 - s.wreck!.time / 0.35) : 1;
    p.visible = !title && p.alpha > 0 && !s.rings.includes(i);
    p.scale.set(1 + Math.sin(time * 3 + i) * 0.05);
  }
}

/**
 * Redraws every ground shadow for the frame.
 *
 * Wreck debris fades its shadow with height, so a part thrown high loses its
 * mark rather than dragging a hard ellipse across the track.
 */
export function paintShadows(
  r: GameRenderer,
  s: GameState,
  crash: boolean,
  ponyX: number,
) {
  r.shadow.clear();
  for (const p of [...r.spectators, ...r.courseProps]) {
    if (p.visible)
      r.shadow
        .ellipse(p.x, GROUND_Y + 2, p.width * 0.32, 3)
        .fill({ color: 0x244237, alpha: 0.15 });
  }
  if (crash)
    for (const b of s.wreck!.bodies) {
      const a = Math.max(0, 1 + Math.min(0, b.y) / 400) * 0.18;
      r.shadow
        .ellipse(b.x, GROUND_Y + 2, Math.max(8, b.w * 0.42), 5)
        .fill({ color: 0x223a30, alpha: a });
    }
  if (!crash)
    r.shadow
      .ellipse(ponyX, GROUND_Y + 2, 50, 9)
      .fill({ color: 0x244237, alpha: 0.18 });
}
