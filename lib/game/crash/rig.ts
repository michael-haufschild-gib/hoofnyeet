import RAPIER from '@dimforge/rapier2d-compat';
import {
  CATASTROPHES,
  type Catastrophe,
  type Mechanism,
} from '../catalogue/catastrophes';
import type { WorldId } from '../content';
import {
  artFoot,
  GROUND_Y,
  LEG_HIPS,
  LEG_SIZE,
  PONY_BODY_Y,
} from '../art/geometry';
import { bossPose } from '../catalogue/machinery';
import type { GameState } from '../simulation';
import { SCALE, type CrashStage } from './stage';

/** The part a hazard wave is built from, chosen by world and disaster index. */
export function propPart(world: WorldId, disaster: number) {
  return (
    {
      farm: ['cube', 'sheep', 'tnt', 'bone'],
      candy: ['donut', 'cube', 'jaws', 'lollipop'],
      carnival: ['piano', 'glove', 'helmet', 'grave'],
      office: ['grave', 'cube', 'goose', 'bone'],
      moon: ['cube', 'ufo', 'tnt', 'bone'],
      afterlife: ['skeleton', 'ghost', 'grave', 'jaws'],
    } as const
  )[world][disaster % 4];
}

/** The heavy machine that stalks the wreck in each world. */
export function bossPart(world: WorldId) {
  return (
    {
      farm: 'baler',
      candy: 'jaws',
      carnival: 'piano',
      office: 'officeGoose',
      moon: 'ufo',
      afterlife: 'reaper',
    } as const
  )[world];
}

/**
 * The impact velocity handed to every rig body, in metres per second, clamped
 * so a very fast or very slow landing still reads as a crash.
 */
export function entrySpeed(s: GameState) {
  return {
    vx: Math.max(3, Math.min(19, s.vx / SCALE)),
    vy: Math.min(12, Math.max(2, s.vy / SCALE)),
  };
}

/**
 * A fresh Rapier world for one landing: gravity scaled by the run modifier, a
 * fixed 1/120 s timestep, and the deep ground slab the wreck lands on.
 */
export function createCrashWorld(s: GameState) {
  const world = new RAPIER.World({ x: 0, y: 11 * s.mod.gravity });
  world.timestep = 1 / 120;
  const ground = world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y / SCALE + 50),
  );
  world.createCollider(
    // Keep the same visible surface, with depth for joint corrections and
    // high-speed impacts to resolve into instead of crossing a thin slab.
    RAPIER.ColliderDesc.cuboid(1500, 50).setFriction(0.55),
    ground,
  );
  return world;
}

/**
 * Spawns the pony and joints it together at the origin, returning the torso and
 * head bodies the rest of the crash tracks.
 */
export function buildPony(stage: CrashStage) {
  const torso = stage.spawn('torso', 0, PONY_BODY_Y, 108, 75, true).body;
  const head = stage.spawn(
    'surprisedHead',
    stage.has('long') ? 85 : 47,
    stage.has('long') ? -130 : -84,
    71,
    87,
    true,
  ).body;
  stage.connect(
    torso,
    head,
    { x: stage.has('long') ? 65 : 35, y: stage.has('long') ? -60 : -20 },
    { x: stage.has('long') ? -20 : -12, y: stage.has('long') ? 13 : 7 },
  );
  for (let i = 0; i < 4; i++) {
    const leg = stage.spawn(
      'straightLeg',
      LEG_HIPS[i].x,
      PONY_BODY_Y + LEG_HIPS[i].y + LEG_SIZE.height * (0.5 - LEG_SIZE.anchorY),
      LEG_SIZE.width,
      LEG_SIZE.height,
      true,
    );
    stage.connect(
      torso,
      leg.body,
      { x: LEG_HIPS[i].x, y: LEG_HIPS[i].y },
      { x: 0, y: -LEG_SIZE.height * (0.5 - LEG_SIZE.anchorY) },
    );
  }
  const tail = stage.spawn('tail', -63, -58, 43, 65, true);
  stage.connect(torso, tail.body, { x: -42, y: -10 }, { x: 21, y: -9 });
  return { torso, head };
}

/**
 * Rotates every spawned rig body about the torso by the landing angle, gives it
 * the impact velocity, and lifts the whole rig so its lowest painted foot rests
 * exactly on the ground rather than starting inside it.
 */
export function orientRig(stage: CrashStage, s: GameState) {
  const { vx, vy } = entrySpeed(s);
  for (const p of stage.pieces.values()) {
    const q = p.body.translation(),
      a = s.impactRotation,
      xx = q.x,
      yy = q.y - PONY_BODY_Y / SCALE;
    p.body.setTranslation(
      {
        x: xx * Math.cos(a) - yy * Math.sin(a),
        y: xx * Math.sin(a) + yy * Math.cos(a) + PONY_BODY_Y / SCALE,
      },
      true,
    );
    p.body.setRotation(a, true);
    p.body.setLinvel({ x: vx, y: vy }, true);
    p.body.setAngvel(s.impactRotation ? 4 : 1, true);
  }
  // The rotated rig enters physics at first opaque contact, never inside the floor.
  const lowest = Math.max(
    ...[...stage.pieces.values()].map(
      (p) =>
        p.body.translation().y * SCALE +
        artFoot(p.part, p.w, p.h, p.body.rotation()),
    ),
  );
  for (const p of stage.pieces.values()) {
    const at = p.body.translation();
    p.body.setTranslation(
      { x: at.x, y: at.y + (GROUND_Y - lowest) / SCALE },
      true,
    );
  }
}

/** Start position and painted size, in pixels, of hazard prop `index`. */
function hazardSpot(mechanism: Mechanism, index: number) {
  if (mechanism === 'fence')
    return { x: 120 + index * 45, y: -75, w: 24, h: 170 };
  const y = -20 - Math.floor(index / 3) * 58;
  if (mechanism === 'swarm') return { x: 180 + index * 62, y, w: 58, h: 58 };
  return { x: 160 + (index % 3) * 65, y, w: 58, h: 58 };
}

function buildHazards(stage: CrashStage, spec: Catastrophe) {
  for (let i = 0; i < spec.count; i++) {
    const spot = hazardSpot(spec.mechanism, i);
    const p = stage.spawn(spec.prop, spot.x, spot.y, spot.w, spot.h);
    if (spec.mechanism === 'swarm') p.body.setLinvel({ x: -4, y: 0 }, true);
  }
}

function buildDebris(stage: CrashStage) {
  for (let i = 0; i < 4; i++)
    stage.spawn(i % 2 ? 'bone' : 'helmet', 420 + i * 85, -25, 45, 38);
}

function buildFlock(stage: CrashStage) {
  if (!stage.has('sheepish')) return;
  for (let i = 0; i < 3; i++) stage.spawn('sheep', 80 + i * 90, -80, 75, 68);
}

function buildHats(stage: CrashStage) {
  if (!stage.has('helmet')) return;
  for (let i = 0; i < 3; i++)
    stage.spawn('helmet', i * 25 - 20, -170, 35, 30, true);
}

function buildEyes(stage: CrashStage, vx: number, vy: number) {
  if (!stage.has('eyes')) return;
  for (let i = 0; i < 2; i++) {
    const eye = stage.spawn('eye', i * 30, -135, 30, 30, true);
    if (stage.has('magnet')) eye.body.setLinvel({ x: vx, y: vy - 3 }, true);
  }
}

function buildBoss(stage: CrashStage, s: GameState) {
  if (!s.boss) return;
  const boss = stage.spawn(bossPart(s.world), 430, -105, 190, 180, false, true);
  boss.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  const at = bossPose(s.world, 0, boss);
  boss.body.setTranslation({ x: at.x / SCALE, y: at.y / SCALE }, true);
}

/**
 * Fills the course around the landed rig: the disaster's hazard wave, loose
 * bones and helmets, whatever the run's equipment brings along, and the boss.
 */
export function buildScenery(stage: CrashStage, s: GameState) {
  const { vx, vy } = entrySpeed(s);
  buildHazards(stage, CATASTROPHES[s.world][s.disaster % 4]);
  buildDebris(stage);
  buildFlock(stage);
  buildHats(stage);
  buildEyes(stage, vx, vy);
  buildBoss(stage, s);
}
