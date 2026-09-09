import { noise, type CarnageCue } from '../escalation';
import { GROUND_Y } from '../geometry';

export const SPRAY_AIR_CAP = 256;
export const SPRAY_GROUND_CAP = 64;
export const SPRAY_STAIN_LIFE = 9;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** Original seeded fan, now with velocity and an exact floor intersection. */
export function sprayLaunch(cue: CarnageCue, index: number, salt = 0) {
  const n = (k: number) => noise(cue.seed, index * 7 + k + salt);
  const angle = -Math.PI * n(0);
  const speed = (80 + n(1) * 260) * Math.min(1.6, cue.power);
  const radius = 2.5 + n(3) * 6;
  const floor = GROUND_Y - radius;
  const y = Math.min(cue.y, floor);
  const vx = Math.cos(angle) * speed,
    vy = Math.sin(angle) * speed;
  const gravity = cue.world === 'moon' ? 76 : 410;
  const contact =
    (-vy + Math.sqrt(vy * vy + 2 * gravity * (floor - y))) / gravity;
  return {
    x: cue.x,
    y,
    vx,
    vy,
    radius,
    gravity,
    floor,
    contact,
    spin: (n(2) - 0.5) * 15,
  };
}

export interface SprayTarget {
  x: number;
  y: number;
}

/** A decorative contact is a sample, never a second event or physics body. */
export function sprayPose(
  cue: CarnageCue,
  index: number,
  age: number,
  salt = 0,
  magnet?: SprayTarget,
) {
  if (age < 0) return null;
  const launch = sprayLaunch(cue, index, salt);
  if (age >= launch.contact + SPRAY_STAIN_LIFE) return null;
  const flight = Math.min(age, launch.contact);
  const landed = age >= launch.contact;
  let x = launch.x + launch.vx * flight;
  let y =
    launch.y + launch.vy * flight + (launch.gravity * flight * flight) / 2;
  let vx = landed ? 0 : launch.vx;
  let vy = landed ? 0 : launch.vy + launch.gravity * flight;
  const magnetic =
    !!magnet && Math.hypot(magnet.x - cue.x, magnet.y - cue.y) < 560;
  if (magnetic && magnet) {
    if (age >= 1.2) return null;
    const t = clamp((age - 0.08) / 0.86),
      pull = ease(t);
    const derivative = age > 0.08 && t < 1 ? (6 * t * (1 - t)) / 0.86 : 0;
    vx = vx * (1 - pull) + (magnet.x - x) * derivative;
    vy = vy * (1 - pull) + (magnet.y - y) * derivative;
    x += (magnet.x - x) * pull;
    y += (Math.min(magnet.y, launch.floor) - y) * pull;
  }
  const groundAge = age - launch.contact;
  const alpha = magnetic
    ? 1 - ease((age - 0.94) / 0.26)
    : landed
      ? 1 - ease((groundAge - 7) / 2)
      : 1;
  return {
    x,
    y,
    vx,
    vy,
    alpha,
    radius: launch.radius,
    angle: Math.atan2(vy, vx) - Math.PI / 2,
    spin: age * launch.spin,
    stretch:
      cue.world === 'moon'
        ? 0.62
        : 0.65 + Math.min(1.25, Math.hypot(vx, vy) / 330),
    landed: landed && !magnetic,
    magnetic,
    groundAge,
    contact: launch.contact,
    contactX: launch.x + launch.vx * launch.contact,
    squash: ease(groundAge / 0.12),
  };
}

/** Keep every existing eye/bone; gold teeth are a separate extra fan. */
export function sprayMaterial(index: number): 'bone' | 'eye' | 'droplet' {
  return index % 11 === 0 ? 'bone' : index % 7 === 0 ? 'eye' : 'droplet';
}
