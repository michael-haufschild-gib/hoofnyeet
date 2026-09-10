import { noise, type CarnageCue } from '../../catalogue/escalation';
import { GROUND_Y } from '../../art/geometry';

/** Most airborne samples one contact may paint at full particle density. */
export const SPRAY_AIR_CAP = 256;
/** Most settled stains one contact may leave on the track at once. */
export const SPRAY_GROUND_CAP = 64;
/** Seconds a settled stain stays painted before it has faded out entirely. */
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

/** A world point a spray sample can be drawn toward, such as a vacuum mouth. */
export interface SprayTarget {
  x: number;
  y: number;
}

/** Position in world units and velocity in world units per second. */
interface SprayMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Ballistic sample at `age` seconds, frozen once it reaches the floor. */
function freeMotion(
  launch: ReturnType<typeof sprayLaunch>,
  age: number,
): SprayMotion {
  const flight = Math.min(age, launch.contact);
  const landed = age >= launch.contact;
  return {
    x: launch.x + launch.vx * flight,
    y: launch.y + launch.vy * flight + (launch.gravity * flight * flight) / 2,
    vx: landed ? 0 : launch.vx,
    vy: landed ? 0 : launch.vy + launch.gravity * flight,
  };
}

/**
 * Blends the ballistic sample toward the magnet over 0.08 s..0.94 s. Velocity
 * follows the blend's own derivative so the painted streak keeps pointing along
 * the path. The pulled sample never sinks below `floor`.
 */
function magnetMotion(
  motion: SprayMotion,
  magnet: SprayTarget,
  floor: number,
  age: number,
): SprayMotion {
  const t = clamp((age - 0.08) / 0.86),
    pull = ease(t);
  const derivative = age > 0.08 && t < 1 ? (6 * t * (1 - t)) / 0.86 : 0;
  return {
    vx: motion.vx * (1 - pull) + (magnet.x - motion.x) * derivative,
    vy: motion.vy * (1 - pull) + (magnet.y - motion.y) * derivative,
    x: motion.x + (magnet.x - motion.x) * pull,
    y: motion.y + (Math.min(magnet.y, floor) - motion.y) * pull,
  };
}

/** Opacity 0..1: swallowed samples fade fast, settled stains fade over 2 s. */
function sprayAlpha(
  magnetic: boolean,
  landed: boolean,
  age: number,
  groundAge: number,
): number {
  if (magnetic) return 1 - ease((age - 0.94) / 0.26);
  if (landed) return 1 - ease((groundAge - 7) / 2);
  return 1;
}

/** Motion-blur elongation. Lunar samples hold a fixed round-ish shape. */
function sprayStretch(
  world: CarnageCue['world'],
  vx: number,
  vy: number,
): number {
  if (world === 'moon') return 0.62;
  return 0.65 + Math.min(1.25, Math.hypot(vx, vy) / 330);
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
  const landed = age >= launch.contact;
  let motion = freeMotion(launch, age);
  const magnetic =
    !!magnet && Math.hypot(magnet.x - cue.x, magnet.y - cue.y) < 560;
  if (magnetic && magnet) {
    if (age >= 1.2) return null;
    motion = magnetMotion(motion, magnet, launch.floor, age);
  }
  const { x, y, vx, vy } = motion;
  const groundAge = age - launch.contact;
  return {
    x,
    y,
    vx,
    vy,
    alpha: sprayAlpha(magnetic, landed, age, groundAge),
    radius: launch.radius,
    angle: Math.atan2(vy, vx) - Math.PI / 2,
    spin: age * launch.spin,
    stretch: sprayStretch(cue.world, vx, vy),
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
