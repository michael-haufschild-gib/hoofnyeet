import { Sprite, type Graphics, type Texture } from 'pixi.js';
import type { MoteMotion } from './motion/impact-motion';
import type { GameEvent } from '../simulation';

/** A live debris sprite paired with the closed-form motion that poses it. */
export interface Mote extends MoteMotion {
  sprite: Sprite;
}

/** Debris silhouettes: soft round dust, a four-point sparkle, a hard shard. */
export type MoteKind = 'dust' | 'shard' | 'star';

const TEXTURE_INDEX: Record<MoteKind, number> = { dust: 0, star: 1, shard: 2 };
const SPARKLE_SOUNDS = ['ring', 'flap', 'flip', 'ghost'];

/** Sounds that shake the camera and throw a full spread of debris. */
export const IMPACT_SOUNDS = [
  'land',
  'bounce',
  'explosion',
  'boneclatter',
  'metalcrash',
  'woodbreak',
  'piano',
  'baler',
  'teethchomp',
];

/** The impacts violent enough for a wide spread and the larger caption. */
export const BIG_SOUNDS = ['explosion', 'bounce', 'land', 'boneclatter'];

/** Caption text per impact sound; anything unlisted reads 'CRUNCH!'. */
export const BURST_LABELS: Record<string, string> = {
  explosion: 'KABLOOEY!',
  bounce: 'BOI-OI-OING!',
  land: 'OH, HAY NO.',
  boneclatter: 'SOME ASSEMBLY!',
  metalcrash: 'CLONK!',
  piano: 'B FLAT.',
  baler: 'BALED IT!',
  teethchomp: 'CHOMP!',
};

/**
 * True for a weightless flourish — a ring, flap, flip, ghost hop or glide —
 * which scatters sparkles rather than debris. A propelled flap is excluded:
 * the bean plume already owns that beat and would fight the sparkles.
 */
export function sparkleCue(e: GameEvent, sound: string) {
  return (
    (SPARKLE_SOUNDS.includes(sound) && !e.propulsion) || e.kind === 'glide'
  );
}

/**
 * Shape for piece `index` of one impact spread: the first eight are heavy
 * dust, and the rest alternate shards with an occasional sparkle so the throw
 * reads as wreckage instead of confetti.
 */
export function debrisKind(index: number): MoteKind {
  return index < 8 ? 'dust' : index % 4 === 0 ? 'star' : 'shard';
}

/**
 * Four-colour impact palette cycled by piece `index`. Candy mode swaps the
 * single blood red for pink and leaves the other three untouched.
 */
export function debrisTint(index: number, gentle: boolean) {
  return [0xffdd65, 0xf2b278, gentle ? 0xff8dd9 : 0xe46a53, 0x83cfaa][
    index % 4
  ];
}

/**
 * Destroys every mote whose life had already ended by `born` seconds and
 * returns the survivors as a new array. Capacity is judged at the contact
 * tick, so a slow frame cannot discard debris a later contact should see.
 */
export function pruneMotes(motes: Mote[], born: number) {
  return motes.filter((m) => {
    if (born < m.born + m.life) return true;
    m.sprite.destroy();
    return false;
  });
}

/** Dust drifts upward on a slight rise, grows as it thins, and barely spins. */
function dustMote(
  sprite: Sprite,
  x: number,
  y: number,
  born: number,
  a: number,
  rng: () => number,
): Mote {
  const speed = 30 + rng() * 80;
  const size = 18 + rng() * 24;
  const angle = rng() * 6.28;
  return {
    sprite,
    born,
    x,
    y,
    angle,
    life: 0.45 + rng() * 0.4,
    vx: Math.cos(a) * speed,
    vy: -25 - rng() * 70,
    gravity: -20,
    size,
    grow: 2.7,
    spin: 0.3,
    opacity: 0.35,
  };
}

/** Shards and sparkles are thrown outward and tumble; a shard falls sixteen
 * times harder than a sparkle, which is what separates the two on screen. */
function debrisMote(
  sprite: Sprite,
  star: boolean,
  x: number,
  y: number,
  born: number,
  a: number,
  rng: () => number,
): Mote {
  const speed = 70 + rng() * 250;
  const size = star ? 5 + rng() * 12 : 4 + rng() * 13;
  const angle = rng() * 6.28;
  return {
    sprite,
    born,
    x,
    y,
    angle,
    life: 0.42 + rng() * 0.43,
    vx: Math.cos(a) * speed,
    vy: Math.sin(a) * speed - 60,
    gravity: star ? 30 : 320,
    size,
    grow: 0,
    spin: 4 + rng() * 9,
    opacity: 1,
  };
}

/**
 * Builds one debris sprite, already positioned at `x`/`y` in world units,
 * tinted, rotated and hidden, together with the motion `impactMote` replays
 * it from. `textures` is the shared [dust, star, shard] set and `born` is the
 * scene time in seconds at contact. `rng` is drawn from exactly six times
 * whichever shape is thrown, so a replay reproduces the same piece. The
 * sprite is left unparented: the caller owns the display order.
 */
export function spawnMote(
  textures: Texture[],
  kind: MoteKind,
  x: number,
  y: number,
  color: number,
  born: number,
  rng: () => number,
): Mote {
  const sprite = new Sprite(textures[TEXTURE_INDEX[kind]]);
  sprite.anchor.set(0.5);
  sprite.position.set(x, y);
  sprite.tint = color;
  const a = rng() * Math.PI * 2;
  const mote =
    kind === 'dust'
      ? dustMote(sprite, x, y, born, a, rng)
      : debrisMote(sprite, kind === 'star', x, y, born, a, rng);
  sprite.rotation = mote.angle;
  sprite.visible = false;
  return mote;
}

/**
 * The black hole's well at `x`/`y`: a dark core with a bright rim, ringed by
 * three flattened orbits that fade out over the ability's 1.3 s life.
 */
export function drawSingularity(
  g: Graphics,
  x: number,
  y: number,
  age: number,
) {
  g.circle(x, y, 50 * (1 + Math.sin(age * 30) * 0.06))
    .fill(0x182233)
    .circle(x, y, 60)
    .stroke({ color: 0xa7f6e8, width: 5 });
  for (let i = 0; i < 3; i++)
    g.ellipse(x, y, 85 + i * 12, 22 + i * 9).stroke({
      color: 0xbf90eb,
      width: 2,
      alpha: 1 - age / 1.3,
    });
}

/**
 * Three shock rings racing out from a triggered ability at `x`/`y`, tinted
 * per ability and thinning as `age` in seconds approaches the 1.3 s cutoff.
 */
export function drawAbilityRings(
  g: Graphics,
  ability: string,
  x: number,
  y: number,
  age: number,
) {
  const color =
    ability === 'ghost'
      ? 0x85fadd
      : ability === 'dynamite'
        ? 0xff8c55
        : 0xffec98;
  for (let i = 0; i < 3; i++)
    g.circle(x, y, Math.max(0, age - i * 0.1) * 260).stroke({
      color,
      width: Math.max(1, 8 - age * 5),
      alpha: Math.max(0, 1 - age),
    });
}
