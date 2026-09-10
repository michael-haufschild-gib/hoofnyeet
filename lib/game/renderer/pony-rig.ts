import { synergies } from '../content';
import { ponyPose } from '../art/pose';
import { ROCKET_ART, rocketRigPose } from '../art/rocket-rig';
import { PONY_BODY_Y, LEG_HIPS, LEG_SIZE, hoofSupport } from '../art/geometry';
import type { GameState } from '../simulation';
import type { GameRenderer } from '../renderer';

/** Phases where the pony is off the ground and wears its startled face. */
const AIR_PHASES = ['flight', 'approach'];

/** Phases where the hooves rest on the track, so the body rides on them. */
const GROUNDED_PHASES = ['title', 'countdown', 'runup', 'compression'];

/** Procedural pose for one frame, in world units and radians. */
type Pose = ReturnType<typeof ponyPose>;

/**
 * Places one body part in pony-local space, in pixels and radians.
 *
 * Every part except the head re-reads its texture each frame, because the
 * palette swap for the selected pony is resolved lazily and can change
 * between frames without the rig being rebuilt.
 */
function part(
  r: GameRenderer,
  key: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation = 0,
) {
  const p = r.ponyParts[key];
  if (key !== 'head')
    p.texture = r.ponyTexture(key.includes('Leg') ? 'straightLeg' : key);
  p.position.set(x, y);
  p.width = w;
  p.height = h;
  p.rotation = rotation;
}

/**
 * Lays out torso, tail, legs and head, returning the head artwork key so the
 * headwear fit that follows can match the expression being worn.
 *
 * A grounded pony is lifted by the reach of its lowest hoof so the legs meet
 * the track; an airborne one uses the fixed body offset plus the pose bob.
 */
function poseBody(r: GameRenderer, s: GameState, pose: Pose, air: boolean) {
  const grounded = GROUNDED_PHASES.includes(s.phase);
  const bodyY = grounded
    ? -hoofSupport(
        pose.legs,
        pose.xScale,
        pose.yScale,
        s.rotation + pose.bodyAngle,
      )
    : PONY_BODY_Y + pose.bob;
  r.pony.position.set(s.x, s.y + bodyY);
  r.pony.rotation = s.rotation + pose.bodyAngle;
  r.pony.scale.set(pose.xScale, pose.yScale);
  part(r, 'tail', -63, -1, 43, 65, pose.tailAngle);
  part(r, 'torso', 0, 0, 108, 75);
  for (let i = 0; i < LEG_HIPS.length; i++) {
    const hip = LEG_HIPS[i];
    part(
      r,
      hip.key,
      hip.x,
      hip.y,
      LEG_SIZE.width,
      LEG_SIZE.height,
      pose.legs[i],
    );
  }
  const headArt = air ? 'surprisedHead' : 'head';
  r.ponyParts.head.texture = r.ponyTexture(headArt);
  part(r, 'head', 47, -27 + pose.headY, 71, 87, pose.headAngle);
  return headArt;
}

/**
 * Hides every accessory, then shows and places the ones the run has earned.
 *
 * Sizes derive from the source artwork's aspect ratio, so a re-cut sprite
 * keeps its proportions. `combos` holds the active synergy ids.
 */
function poseGear(
  r: GameRenderer,
  s: GameState,
  pose: Pose,
  combos: string[],
  air: boolean,
  time: number,
) {
  const has = (id: string) => s.equipment.includes(id);
  const gear = (
    id: string,
    on: boolean,
    x: number,
    y: number,
    w: number,
    h: number,
    angle = 0,
  ) => {
    const p = r.gear[id];
    if (!p) return;
    p.visible = on;
    p.position.set(x, y);
    p.width = w;
    p.height = h;
    p.rotation = angle;
  };
  for (const p of Object.values(r.gear)) p.visible = false;
  const rocket = rocketRigPose(s);
  gear(
    'jetpack',
    has('rocket'),
    rocket.x,
    rocket.y,
    (ROCKET_ART.height * r.textures.jetpack.width) / r.textures.jetpack.height,
    ROCKET_ART.height,
    rocket.angle,
  );
  gear('tnt', s.ability === 'dynamite', -26, 10, 42, 42, -0.12);
  // Feather roots remain planted at the shoulders while the tips sweep.
  // The far wing sits behind the torso and the near wing below the face.
  const wingHeight = (combos.includes('poultry') ? 112 : 85) * (air ? 1 : 0.72);
  gear(
    'wing-left',
    has('wings'),
    6,
    -17,
    (wingHeight * r.textures['wing-left'].width) /
      r.textures['wing-left'].height,
    wingHeight,
    (air ? -0.5 : -1.35) + pose.wingAngle,
  );
  gear(
    'wing-right',
    has('wings'),
    15,
    -23,
    (wingHeight * r.textures['wing-right'].width) /
      r.textures['wing-right'].height,
    wingHeight,
    (air ? -0.75 : -1.65) - pose.wingAngle * 0.8,
  );
  const hoof = r.ponyParts.frontLeg2;
  const sole = LEG_SIZE.height * (0.985 - LEG_SIZE.anchorY);
  gear(
    'magnetic-horseshoe',
    has('magnet'),
    hoof.x - Math.sin(hoof.rotation) * sole,
    hoof.y + Math.cos(hoof.rotation) * sole,
    24,
    (24 * r.textures['magnetic-horseshoe'].height) /
      r.textures['magnetic-horseshoe'].width,
    hoof.rotation,
  );
  gear(
    'ghost-portal-ring',
    combos.includes('haunted'),
    0,
    -10,
    180,
    200,
    time * 0.4,
  );
}

/** Recolours the body for the active synergies and refits the headwear. */
function poseAppearance(
  r: GameRenderer,
  combos: string[],
  headArt: 'head' | 'surprisedHead',
  time: number,
) {
  r.ponyParts.torso.tint = combos.includes('arcade')
    ? 0x94fadd
    : combos.includes('meteor')
      ? 0xffa472
      : 0xffffff;
  r.ponyParts.head.alpha = combos.includes('haunted') ? 0.72 : 1;
  r.headwear.fit(
    r.outfit.hat,
    r.ponyParts.head,
    headArt,
    combos.includes('party'),
    time,
    r.reduced || r.budget.density < 1,
    r.gentle,
  );
}

/**
 * Redraws the synergy halo behind the pony, in pony-local pixels.
 *
 * The graphic is cleared on every frame, so the reduced-motion setting leaves
 * an empty halo rather than a frozen one.
 */
function poseAura(r: GameRenderer, combos: string[], time: number) {
  r.aura.clear();
  if (r.reduced) return;
  if (combos.includes('meteor'))
    r.aura
      .poly([-30, -45, -180, 0, -40, 40, -110, 0])
      .fill({ color: 0xff773d, alpha: 0.5 });
  if (combos.includes('arcade'))
    r.aura
      .circle(0, 0, 85 + Math.sin(time * 8) * 5)
      .stroke({ color: 0x4ceabf, width: 3, alpha: 0.7 });
  for (let i = 0; i < 8; i++) {
    const a = time * 2 + (i * Math.PI) / 4;
    if (combos.includes('junk'))
      r.aura
        .roundRect(Math.cos(a) * 90, Math.sin(a) * 70, 12, 7, 2)
        .fill(0x68879a);
    if (combos.includes('recital') || combos.includes('party'))
      r.aura
        .star(Math.cos(a) * 95, Math.sin(a) * 90, 5, 6)
        .fill([0xff7b8d, 0xffdb63, 0x5cdeb7][i % 3]);
  }
}

/**
 * Poses the controlled pony for one frame at `time` seconds of scene clock.
 *
 * Mutates the existing rig sprites in place; nothing is created or destroyed,
 * so the call is safe to make on every frame.
 */
export function poseHorse(r: GameRenderer, s: GameState, time: number) {
  const air = AIR_PHASES.includes(s.phase);
  const pose = ponyPose(s, time);
  const headArt = poseBody(r, s, pose, air);
  const combos = synergies(s.equipment).map((c) => c.id);
  poseGear(r, s, pose, combos, air, time);
  poseAppearance(r, combos, headArt, time);
  poseAura(r, combos, time);
}
