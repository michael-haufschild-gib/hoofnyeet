import test from 'node:test';
import assert from 'node:assert/strict';
import {
  queuedSoul,
  turnstileMotion,
  TURNSTILE_ART,
  SOUL_CONTACT,
  SOUL_SPACING,
} from '../lib/game/effects/motion/afterlife-motion';

void test('each soul touches the arm before rejection and each arm is ready for the next soul', () => {
  for (let i = 0; i < 5; i++) {
    const contact = SOUL_CONTACT + i * SOUL_SPACING;
    const before = queuedSoul(i, contact - 0.05)!;
    const at = queuedSoul(i, contact)!;
    const after = queuedSoul(i, contact + 0.05)!;
    assert.equal(before.rejection, 0);
    assert.ok(Math.abs(at.rejection) < 1e-12);
    assert.ok(after.rejection > 0);
    assert.ok(Math.abs(at.x + at.size * 0.23 + TURNSTILE_ART.arm) < 1e-9);
    assert.ok(before.x < at.x);
    assert.ok(after.x < at.x);
    const rotor = turnstileMotion(contact);
    const tips = [0, 1, 2].map((j) =>
      Math.cos(rotor.angle + (j * Math.PI * 2) / 3),
    );
    assert.ok(Math.abs(Math.min(...tips) + 1) < 1e-9);
    assert.ok(turnstileMotion(contact + 0.05).turns > rotor.turns);
  }
  assert.equal(turnstileMotion(5).turns, 5);
  assert.equal(turnstileMotion(5).recoil, 0);
});

void test('the queue has no independent playback state, with a restrained reduced-motion recoil', () => {
  assert.equal(queuedSoul(4, 1), null);
  const sampled = queuedSoul(2, 3.4);
  for (const rate of [15, 30, 60, 120]) {
    for (let i = 0; i < rate * 6; i++) queuedSoul(2, i / rate);
    assert.deepEqual(queuedSoul(2, 3.4), sampled);
  }
  assert.equal(turnstileMotion(1.95, true).recoil, 0);
  assert.equal(queuedSoul(0, 3, true)!.scaleX, 1);
  assert.equal(queuedSoul(0, 3, true)!.scaleY, 1);
  assert.ok(Math.abs(queuedSoul(0, 3, true)!.angle) < 0.31);
});
