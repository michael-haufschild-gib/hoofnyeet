import { Graphics, Rectangle, Sprite } from 'pixi.js';
import { CarnageEffects } from '../effects/slapstick/carnage-effects';
import { ImpactEffects } from '../effects/impact-effects';
import { PerkEffects } from '../effects/perk-effects';
import { RoutineShow } from '../effects/shows/routine-show';
import { CombinationShow } from '../effects/shows/combination-show';
import { WorldAtmosphere } from '../effects/shaders/world-atmosphere';
import { ROCKET_ART } from '../art/rocket-rig';
import { LEG_SIZE } from '../art/geometry';
import type { GameRenderer } from '../renderer';

/** Pony sprites in painting order, back to front. */
const PONY_PART_ORDER = [
  'tail',
  'backLeg1',
  'frontLeg1',
  'torso',
  'backLeg2',
  'frontLeg2',
  'head',
];

/** Accessory sprites, created hidden and revealed by the per-frame pose. */
const GEAR_KEYS = [
  'jetpack',
  'wing-left',
  'wing-right',
  'magnetic-horseshoe',
  'ghost-portal-ring',
  'tnt',
];

/** Accessory anchors that differ from the centred default. */
const GEAR_ANCHORS: Record<string, readonly [number, number]> = {
  jetpack: [ROCKET_ART.anchor.x, ROCKET_ART.anchor.y],
  'wing-left': [0.83, 0.76],
  'wing-right': [0.17, 0.76],
  'magnetic-horseshoe': [0.5, 0.95],
};

/**
 * Attaches the layer containers to the stage in painting order.
 *
 * The order set here is the scene's depth order and every later insertion is
 * positioned relative to it, so changing it changes what covers what.
 */
export function buildSceneGraph(r: GameRenderer) {
  r.app.stage.addChild(r.scene);
  r.scene.addChild(r.background, r.world, r.screenFx);
  r.world.addChild(
    r.terrain,
    r.crowdLayer,
    r.track,
    r.decor,
    r.shadow,
    r.actors,
    r.fx,
  );
}

/**
 * Creates the effect owners and splices their layers around the actors.
 *
 * Requires the sprite atlas to be loaded, because each owner keeps the
 * textures it was handed. The full-scene lens filter is installed here, so the
 * filter area must be resized with the canvas afterwards.
 */
export function buildEffects(r: GameRenderer) {
  r.impactEffects = new ImpactEffects(r.app, r.textures);
  r.scene.filters = [r.impactEffects.lens.filter];
  r.scene.filterArea = new Rectangle(0, 0, r.w, r.h);
  r.perkEffects = new PerkEffects(r.textures['bean-propulsion-cloud']);
  r.carnageEffects = new CarnageEffects(r.textures);
  r.routineShow = new RoutineShow(r.textures);
  r.combinationShow = new CombinationShow(r.textures);
  r.atmosphere = new WorldAtmosphere();
  r.world.addChildAt(r.routineShow.behind, r.world.getChildIndex(r.actors));
  r.fx.addChild(r.routineShow.front);
  r.world.addChildAt(r.carnageEffects.behind, r.world.getChildIndex(r.actors));
  r.fx.addChild(r.carnageEffects.front);
  r.fx.addChild(r.combinationShow.view);
  r.scene.addChild(r.carnageEffects.screen);
  r.world.addChildAt(r.perkEffects.behind, r.world.getChildIndex(r.actors));
  r.world.addChildAt(r.impactEffects.backdrop, r.world.getChildIndex(r.actors));
  r.fx.addChild(r.impactEffects.container);
}

/**
 * Assembles the pony rig and the marker that names it during a wreck.
 *
 * Legs share one straight-leg texture; the far pair is tinted darker so the
 * near pair reads in front of the body.
 */
export function buildActors(r: GameRenderer) {
  for (const key of PONY_PART_ORDER) {
    const part = key.includes('Leg') ? 'straightLeg' : key;
    const sprite = new Sprite(r.textures[part]);
    sprite.anchor.set(0.5, key.includes('Leg') ? LEG_SIZE.anchorY : 0.5);
    if (key.endsWith('Leg1')) sprite.tint = 0xc6bca5;
    r.pony.addChild(sprite);
    r.ponyParts[key] = sprite;
  }
  r.pony.addChildAt(r.aura, 0);
  r.actors.addChild(r.pony, r.playerMarker, r.playerLabel);
  r.actors.addChild(r.perkEffects.attached);
  r.fx.addChild(r.perkEffects.front);
  r.playerLabel.anchor.set(0.5);
}

/** Creates the reusable scoring rings and roadside hazard props. */
export function buildDecor(r: GameRenderer) {
  for (let i = 0; i < 3; i++) {
    const ring = new Graphics()
      .circle(0, 0, 65)
      .stroke({ color: 0x755d2b, width: 12 })
      .circle(0, 0, 65)
      .stroke({ color: 0xffd56b, width: 8 })
      .arc(0, 0, 65, Math.PI, Math.PI * 1.85)
      .stroke({ color: 0xfff7d0, width: 3 })
      .circle(0, 0, 76)
      .stroke({ color: 0xfff2ca, width: 2, alpha: 0.6 })
      .star(0, 0, 4, 17, 6)
      .fill({ color: 0xffeb9d, alpha: 0.9 });
    r.decor.addChild(ring);
    r.ringSprites.push(ring);
  }
  for (let i = 0; i < 12; i++) {
    const sprite = new Sprite(r.textures.cube);
    sprite.anchor.set(0.5, 1);
    r.decor.addChild(sprite);
    r.courseProps.push(sprite);
  }
}

/** Inserts one accessory at the depth its silhouette needs within the rig. */
function addGear(r: GameRenderer, key: string, sprite: Sprite) {
  if (key === 'wing-right')
    r.pony.addChildAt(sprite, r.pony.getChildIndex(r.ponyParts.torso));
  else if (key === 'wing-left')
    r.pony.addChildAt(sprite, r.pony.getChildIndex(r.ponyParts.head));
  else r.pony.addChild(sprite);
}

/**
 * Creates every accessory sprite hidden, so the per-frame pose only has to
 * toggle visibility rather than allocate.
 *
 * Must run after the pony rig exists, because the wings are inserted relative
 * to the torso and head.
 */
export function buildEquipment(r: GameRenderer) {
  for (const key of GEAR_KEYS) {
    const sprite = new Sprite(r.textures[key]);
    const anchor = GEAR_ANCHORS[key] ?? [0.5, 0.5];
    sprite.anchor.set(anchor[0], anchor[1]);
    sprite.visible = false;
    addGear(r, key, sprite);
    r.gear[key] = sprite;
  }
}
