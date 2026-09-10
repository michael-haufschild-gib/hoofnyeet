import type { Mechanism } from './catastrophes';
import type { WorldId } from '../content';
import { artFoot, GROUND_Y } from '../art/geometry';

interface Shape {
  part: string;
  w: number;
  h: number;
}
/**
 * Mechanisms whose trap stays kinematic and is stepped along mechanismPose
 * every frame. Anything absent turns dynamic on release and drops under
 * physics instead.
 */
export const drivenMechanisms: Mechanism[] = [
  'press',
  'chomp',
  'glove',
  'roller',
  'carousel',
  'pendulum',
];
/**
 * Seconds a machine spends travelling in ahead of its scripted beat. The
 * warning caption fires that far in advance, and the trap cannot collide with
 * anything until it arrives.
 */
export const MACHINE_ENTRANCE = 0.55;

/** The warning gives machinery time to enter before its existing action beat.
 * This is an actual kinematic path; contact remains disabled until arrival. */
export function mechanismEntrance(
  kind: Mechanism,
  age: number,
  anchorX: number,
  shape: Shape,
) {
  const pose = mechanismPose(kind, Math.max(0, age), anchorX, shape);
  if (age >= 0) return pose;
  const remaining = Math.min(1, -age / MACHINE_ENTRANCE);
  const offset = remaining * remaining * (3 - 2 * remaining);
  const side = ['chomp', 'glove', 'roller', 'carousel', 'pendulum'].includes(
    kind,
  );
  return {
    ...pose,
    x: pose.x + (side ? 900 * offset : 0),
    y: pose.y - (side ? 0 : 780 * offset),
  };
}

/** Spawn and animation sample the same trajectory; no first-tick teleport. */
export function mechanismPose(
  kind: Mechanism,
  age: number,
  anchorX: number,
  shape: Shape,
) {
  const t = Math.max(0, age);
  const foot = artFoot(shape.part, shape.w, shape.h);
  const floor = GROUND_Y - foot;
  switch (kind) {
    case 'press':
      return {
        x: anchorX,
        y: floor - 190 * (0.5 + 0.5 * Math.cos(t * 3)),
        angle: 0,
      };
    case 'chomp':
      return { x: anchorX - 95 * Math.sin(t * 2.6), y: floor, angle: 0 };
    case 'glove':
      return {
        x: anchorX - 170 * (0.5 - 0.5 * Math.cos(t * 4)),
        y: floor - 12,
        angle: 0,
      };
    case 'roller': {
      const angle = t * 2.2;
      return {
        x: anchorX - t * 85,
        y: GROUND_Y - artFoot(shape.part, shape.w, shape.h, angle),
        angle,
      };
    }
    case 'carousel':
    case 'pendulum': {
      const angle = Math.sin(t * 2.2) * 1.1;
      return {
        x: anchorX + Math.sin(angle) * 155,
        y:
          GROUND_Y -
          artFoot(shape.part, shape.w, shape.h, angle) -
          155 * (1 - Math.cos(angle)),
        angle,
      };
    }
    default:
      return { x: anchorX, y: -360, angle: 0 };
  }
}

/**
 * Where a world's boss stands at `t` seconds on the crash clock, in world
 * units. `shape` describes the art being placed so a ground-walking boss rests
 * on the track instead of sinking into it.
 */
export function bossPose(world: WorldId, t: number, shape: Shape) {
  const floor = GROUND_Y - artFoot(shape.part, shape.w, shape.h);
  switch (world) {
    case 'farm':
      return { x: 430 + Math.sin(t * 1.4) * 180, y: floor };
    case 'candy':
      return {
        x: 430 + Math.sin(t) * 95,
        y: floor - Math.abs(Math.sin(t * 2.5)) * 100,
      };
    case 'carnival':
      return {
        x: 430 + Math.sin(t * 0.8) * 130,
        y: -200 + Math.sin(t * 2) * 30,
      };
    case 'office':
      return { x: 400, y: floor - 170 * (0.5 + 0.5 * Math.cos(t * 3)) };
    case 'moon':
      return { x: 430 + Math.sin(t * 0.7) * 180, y: -250 + Math.sin(t) * 60 };
    case 'afterlife':
      return {
        x: 430 + Math.sin(t * 1.8) * 150,
        y: floor - Math.abs(Math.sin(t * 2)) * 110,
      };
  }
}
