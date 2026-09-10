import { Sprite } from 'pixi.js';
import { synergies } from '../content';
import type { BodyPose } from '../crash';
import type { HeadArt } from '../art/headwear';
import type { GameState } from '../simulation';
import type { GameRenderer } from '../renderer';

/** Debris parts that can still wear the run's headwear. */
const HEAD_ART = ['head', 'surprisedHead', 'offended-head'];

/** Debris parts the gentle setting redraws as skeletal stand-ins. */
const TAME_PARTS = ['jam', 'skeleton', 'bone'];

/** Sprite substitutes for debris the pony atlas has no artwork for. */
const BODY_ALIASES: Record<string, string> = {
  donut: 'jaws',
  tnt: 'cube',
  lollipop: 'bone',
  glove: 'helmet',
  officeGoose: 'goose',
  ufo: 'helmet',
  reaper: 'ghost',
  rescue: 'baler',
};

/** Points the marker and its caption at the body the player still controls. */
export function paintMarker(r: GameRenderer, s: GameState, crash: boolean) {
  r.playerMarker.clear();
  r.playerLabel.visible = crash;
  if (!crash) return;
  const x = s.wreck!.focusX,
    y = s.wreck!.focusY;
  r.playerMarker
    .ellipse(x, y + 48, 44, 8)
    .stroke({ color: 0xffe77b, width: 3, alpha: 0.85 });
  r.playerMarker.poly([x - 5, y - 67, x + 5, y - 67, x, y - 59]).fill(0xffeb83);
  r.playerLabel.position.set(x, y - 80);
}

/** Chooses the artwork key for one debris part under the gentle setting. */
function bodyArt(r: GameRenderer, part: string) {
  if (!r.gentle) return part;
  if (!part.startsWith('skeletal') && !TAME_PARTS.includes(part)) return part;
  return part.includes('leg') ? 'straightLeg' : 'cube';
}

/** Dresses and places one debris sprite, creating it on the part's first frame. */
function placeBody(r: GameRenderer, b: BodyPose, visible: Set<number>) {
  visible.add(b.id);
  let sprite = r.bodySprites.get(b.id);
  const key = bodyArt(r, b.part);
  const texture = r.ponyTexture(key) ?? r.textures[BODY_ALIASES[key] ?? 'cube'];
  if (!sprite) {
    sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    r.actors.addChild(sprite);
    r.bodySprites.set(b.id, sprite);
  }
  sprite.texture = texture;
  sprite.visible = true;
  sprite.position.set(b.x, b.y);
  sprite.rotation = b.angle;
  sprite.width = b.w;
  sprite.height = b.h;
  sprite.tint = b.tint;
  sprite.alpha = b.alpha;
}

/**
 * Draws the wreck's loose parts and destroys the sprites of parts the physics
 * world no longer reports.
 *
 * Sprites are keyed by body id, so a part that survives across frames keeps
 * the same sprite and its place in the actor layer.
 */
export function paintBodies(r: GameRenderer, s: GameState, crash: boolean) {
  const visible = new Set<number>();
  if (crash) for (const b of s.wreck!.bodies) placeBody(r, b, visible);
  for (const [id, p] of r.bodySprites)
    if (!visible.has(id)) {
      p.destroy();
      r.bodySprites.delete(id);
    }
}

/**
 * Keeps the hat on the severed head and lifts it above every other actor.
 *
 * The wreck names its head socket explicitly when it has one; otherwise the
 * first head-shaped part wears the hat.
 */
export function paintCrashHat(
  r: GameRenderer,
  s: GameState,
  time: number,
  crash: boolean,
) {
  const head = s.wreck?.bodies.find((b) =>
    s.wreck!.headId !== undefined
      ? b.id === s.wreck!.headId
      : HEAD_ART.includes(b.part),
  );
  r.crashHeadwear.view.visible = false;
  if (!crash || !head || !HEAD_ART.includes(head.part)) return;
  const sprite = r.bodySprites.get(head.id)!;
  r.crashHeadwear.fit(
    r.outfit.hat,
    sprite,
    head.part as HeadArt,
    synergies(s.equipment).some((c) => c.id === 'party'),
    time,
    r.reduced || r.budget.density < 1,
    r.gentle,
  );
  r.actors.setChildIndex(r.crashHeadwear.view, r.actors.children.length - 1);
}

/**
 * Advances the loose confetti particles by `dt` seconds and destroys the ones
 * whose life has run out.
 */
export function stepParticles(r: GameRenderer, dt: number) {
  for (const p of r.particles) {
    p.life -= dt;
    p.sprite.x += p.vx * dt;
    p.sprite.y += p.vy * dt;
    p.vy += 200 * dt;
    p.sprite.rotation += dt * 4;
    p.sprite.alpha = Math.max(0, p.life);
  }
  r.particles = r.particles.filter((p) => {
    if (p.life <= 0) {
      p.sprite.destroy();
      return false;
    }
    return true;
  });
}

/** Paints the full-screen impact flash, which reduced motion suppresses. */
export function paintFlash(r: GameRenderer, s: GameState) {
  r.screenFx.clear();
  if (!r.reduced && s.wreck && s.wreck.flash > 0)
    r.screenFx
      .rect(0, 0, r.w, r.h)
      .fill({ color: 0xfff0bc, alpha: s.wreck.flash * 0.25 });
}

/**
 * Advances every effect owner for the frame, in the order their layers are
 * painted.
 *
 * Each owner reads the adaptive density budget, so a struggling frame thins
 * the effects rather than dropping the whole scene.
 */
export function updateEffects(r: GameRenderer, s: GameState, time: number) {
  r.perkEffects.update(
    s,
    time,
    r.pony,
    r.zoom,
    r.reduced,
    r.budget.density,
    r.gear.jetpack,
  );
  r.impactEffects.update(time, s, r.reduced, r.world, r.gentle);
  r.routineShow.update(
    s,
    time,
    r.reduced,
    r.budget.density,
    r.w / r.zoom,
    r.gentle,
    r.cameraX,
  );
  r.combinationShow.update(s, time, r.gentle, r.reduced, r.budget.density);
  r.carnageEffects.update(
    s,
    r.gentle,
    r.reduced,
    r.budget.density,
    r.cameraX,
    r.w,
    r.zoom,
    r.h,
  );
}
