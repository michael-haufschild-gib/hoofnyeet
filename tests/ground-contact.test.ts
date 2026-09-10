import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier2d-compat';
import { initPhysics } from '../lib/game/crash';
import {
  artFoot,
  collisionOutline,
  fitArt,
  GROUND_Y,
} from '../lib/game/art/geometry';

void test('illustrated props settle on the visible floor at varied orientations without an invisible gap', async () => {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: 11 });
  world.timestep = 1 / 120;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(500, 0.35).setTranslation(
      0,
      GROUND_Y / 40 + 0.35,
    ),
  );
  const objects = [];
  for (const part of [
    'baler',
    'piano',
    'crate',
    'hay',
    'barrel',
    'skeletal-torso',
    'offended-head',
    'helmet',
    'straightLeg',
    'sheep',
    'cheese',
  ]) {
    for (const angle of [0, 0.6, 2.1]) {
      const size = fitArt(part, 85, 100);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(objects.length * 6 - 95, -5)
          .setRotation(angle)
          .setLinearDamping(1)
          .setAngularDamping(1),
      );
      world.createCollider(
        RAPIER.ColliderDesc.convexHull(
          collisionOutline(part, size.w, size.h, 40),
        )!
          .setRestitution(0)
          .setFriction(0.7),
        body,
      );
      objects.push({ part, body, ...size });
    }
  }
  for (let i = 0; i < 1000; i++) world.step();
  for (const { part, body, w, h } of objects) {
    const visibleFoot =
      body.translation().y * 40 + artFoot(part, w, h, body.rotation());
    assert.ok(
      Math.abs(visibleFoot - GROUND_Y) < 0.7,
      `${part}: visible contact at ${visibleFoot.toFixed(3)}`,
    );
  }
  world.free();
});
