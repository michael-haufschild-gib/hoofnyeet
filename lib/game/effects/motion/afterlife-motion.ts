const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/**
 * Measurements taken off the turnstile artwork: `height` in world units,
 * `axle` the rotor centre as a fraction of the sprite box (0..1 from its
 * top-left corner) and `arm` the world-unit radius a soul is stopped at.
 */
export const TURNSTILE_ART = {
  height: 144,
  axle: { x: 0.378, y: 0.466 },
  arm: 40,
} as const;
/**
 * Seconds a soul takes to drift from its queue position to the arm. Rejection
 * starts the moment it elapses, so the shove and the rotor share one clock.
 */
export const SOUL_CONTACT = 1.8;
/**
 * Seconds between one soul reaching the arm and the next, which staggers all
 * five off the single scene clock instead of a per-soul timer.
 */
export const SOUL_SPACING = 0.35;

/** Five original nested souls keep their original contact schedule. Their
 * leading edge now reaches the same arm endpoint that drives the rejection. */
export function queuedSoul(index: number, time: number, reduced = false) {
  const age = time - index * SOUL_SPACING;
  if (age < 0) return null;
  const size = 74 - index * 9;
  const arrival = ease(age / SOUL_CONTACT);
  const rejection = ease((age - SOUL_CONTACT) / 0.5);
  const contactX = -TURNSTILE_ART.arm - size * 0.23;
  const startX = -169 + index * 23;
  return {
    size,
    age,
    rejection,
    x:
      startX + (contactX - startX) * arrival - rejection * (reduced ? 47 : 110),
    y: (reduced ? 0 : -Math.sin(age * 3) * 5 * (1 - arrival)) + rejection * 37,
    angle: reduced ? -rejection * 0.3 : -rejection * (4.7 - index * 0.3),
    scaleX: 1 + Math.sin(rejection * Math.PI) * (reduced ? 0 : 0.22),
    scaleY: 1 - Math.sin(rejection * Math.PI) * (reduced ? 0 : 0.2),
    alpha: 0.68 - rejection * 0.1,
    // Paper emerges only on contact. No idle emission and no hidden clock.
    ticket: clamp((age - SOUL_CONTACT) / 0.8),
  };
}

/**
 * Rotor state at `time` seconds into the set: `angle` in radians, stepping
 * back a third of a turn per soul admitted; `turns` the count admitted so far;
 * and `recoil`/`reject` a 0..1 kick over the 0.28 s after each admission.
 * `reduced` suppresses the recoil wobble but never the rotation itself.
 */
export function turnstileMotion(time: number, reduced = false) {
  let turns = 0;
  let recoil = 0;
  for (let i = 0; i < 5; i++) {
    const since = time - SOUL_CONTACT - i * SOUL_SPACING;
    turns += ease(since / 0.28);
    if (since >= 0 && since < 0.28)
      recoil = Math.max(recoil, Math.sin((since / 0.28) * Math.PI));
  }
  return {
    // Each completed third-turn leaves an arm at the next arrival's endpoint.
    angle: Math.PI - turns * ((Math.PI * 2) / 3),
    recoil: reduced ? 0 : recoil,
    reject: recoil,
    turns,
  };
}
