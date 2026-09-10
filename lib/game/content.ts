/**
 * Revision stamp for every piece of authored content and every save shape that
 * depends on it. Daily seeds, share links and stored records embed this number
 * and are discarded when it moves, so bump it whenever a balance change would
 * make an old record incomparable.
 */
export const CONTENT_VERSION = 6;

/** Save-stable key of a course. Persisted in runs and share links verbatim. */
export type WorldId =
  | 'farm'
  | 'candy'
  | 'carnival'
  | 'office'
  | 'moon'
  | 'afterlife';

/**
 * One course. `act` groups worlds into the 0-2 difficulty tiers a tour visits
 * in order, `gravity` is a multiplier on the base fall rate, `wind` is a
 * constant horizontal push in world units per second (negative blows back),
 * `art` names the backdrop asset folder and `disasters` supplies the comic
 * headlines a failed landing draws from.
 */
export interface WorldDefinition {
  id: WorldId;
  name: string;
  act: number;
  boss: string;
  color: string;
  sky: string;
  ground: string;
  gravity: number;
  wind: number;
  art: string;
  disasters: string[];
  description: string;
}

/**
 * Every course, ordered by act and then by the pair within that act. Grand
 * Tour relies on exactly two worlds sharing each act.
 */
export const WORLDS: WorldDefinition[] = [
  {
    id: 'farm',
    name: 'Borrowed Farm',
    act: 0,
    boss: 'Commissioner Combine',
    color: '#e9be52',
    sky: '#9ce4dc',
    ground: '#73b447',
    gravity: 1,
    wind: 0,
    art: 'countryside',
    disasters: [
      'Flat-pack thoroughbred',
      'Silence of the yams',
      'Hay fever, terminal',
      'Fence of no return',
    ],
    description: 'Organic machinery. Free-range liability.',
  },
  {
    id: 'candy',
    name: 'Candy Crematorium',
    act: 0,
    boss: 'The Jawbreaker',
    color: '#ef84a8',
    sky: '#f7c3d9',
    ground: '#bb72a2',
    gravity: 0.96,
    wind: 12,
    art: 'candy-crematorium',
    disasters: [
      'Chew on this',
      'Taffy last words',
      'Fondue you regret it?',
      'Lollipop chop shop',
    ],
    description: 'The sweets have developed a taste for athlete.',
  },
  {
    id: 'carnival',
    name: 'Carnage Carnival',
    act: 1,
    boss: 'The Pianomancer',
    color: '#b19ce9',
    sky: '#413a7a',
    ground: '#7360a0',
    gravity: 1,
    wind: -14,
    art: 'dark-carnival',
    disasters: [
      'A flat mare',
      'Punchline delivery',
      'Wheel of misfortune',
      'The last encore',
    ],
    description: 'Every ride is your last. Until the next one.',
  },
  {
    id: 'office',
    name: 'Ministry of Horse Affairs',
    act: 1,
    boss: 'Human Resources Goose',
    color: '#87c9b6',
    sky: '#afc3c6',
    ground: '#779b91',
    gravity: 1.06,
    wind: 18,
    art: 'horse-affairs',
    disasters: [
      'Press F for horse',
      'Shred of dignity',
      'Out of bodywork',
      'Your claim was denied',
    ],
    description: 'Please submit your skeleton in triplicate.',
  },
  {
    id: 'moon',
    name: 'Cheese Moon',
    act: 2,
    boss: 'The Udder Mothership',
    color: '#c7db78',
    sky: '#212c62',
    ground: '#c5a04f',
    gravity: 0.72,
    wind: 0,
    art: 'cheese-moon',
    disasters: [
      'Bone voyage',
      'Unidentified frying object',
      'Fond farewell',
      'One giant leak for horsekind',
    ],
    description: 'One small hoof. One enormous dairy incident.',
  },
  {
    id: 'afterlife',
    name: 'Afterlife Leisure Centre',
    act: 2,
    boss: 'The Lifeguard of Death',
    color: '#87dbe7',
    sky: '#455784',
    ground: '#559ba8',
    gravity: 0.88,
    wind: 10,
    art: 'afterlife-leisure',
    disasters: [
      'Dead relaxed',
      'Soul on a roll',
      'Rest in pieces',
      'The late checkout',
    ],
    description: 'You can check out any time. Your limbs cannot.',
  },
];

/** Looks a course up by `id`, asserting the id came from this table. */
export const worldById = (id: WorldId) => WORLDS.find((w) => w.id === id)!;

export {
  RELICS,
  SYNERGIES,
  relicArt,
  relicById,
  synergies,
  synergyChanges,
} from './catalogue/relics';
export type { Ability, Relic } from './catalogue/relics';

/**
 * Every value the simulation reads off the equipped relics and the current
 * course, resolved once per attempt.
 *
 * `launch`, `gravity`, `flap`, `flip`, `kick`, `havoc`, `salvage` and `reach`
 * are multipliers where 1 means unmodified; `maxFlaps` is a whole count of
 * mid-air flaps; `style` is a flat point award; `wind` is world units per
 * second; `bounce` is the restitution used when the wreck strikes ground.
 */
export interface Modifiers {
  launch: number;
  gravity: number;
  flap: number;
  maxFlaps: number;
  flip: number;
  style: number;
  wind: number;
  bounce: number;
  kick: number;
  havoc: number;
  salvage: number;
  reach: number;
}

/** Membership test over the equipped item ids, closed over one run's kit. */
type RelicTest = (id: string) => boolean;

/** Launch-speed multiplier: the jetpack, amplified by extra mass. */
function launchScale(has: RelicTest): number {
  return (
    (has('rocket') ? 1.15 : 1) * (has('rocket') && has('heavy') ? 1.08 : 1)
  );
}

/** The course gravity thinned by featherweight relics. */
function gravityScale(has: RelicTest, base: number): number {
  return (
    base *
    (has('feather') ? 0.85 : 1) *
    (has('wings') && has('feather') ? 0.92 : 1)
  );
}

/** Lift multiplier per flap. Only beans propel; weather amplifies them. */
function flapPower(has: RelicTest): number {
  return has('beans') ? (has('tailwind') ? 1.6 : 1.35) : 1;
}

/** Total mid-air flaps available, counting the poultry synergy's extra one. */
function flapCount(has: RelicTest): number {
  return 3 + (has('wings') ? 2 : 0) + (has('wings') && has('feather') ? 1 : 0);
}

/** Panic-kick force multiplier, boosted further by a rebounding skeleton. */
function kickScale(has: RelicTest): number {
  return has('pinball') ? (has('rubber') ? 1.65 : 1.35) : 1;
}

/** Havoc award multiplier from mass and from sharpened horseshoes. */
function havocScale(has: RelicTest): number {
  return (has('heavy') ? 1.25 : 1) * (has('spikes') ? 1.4 : 1);
}

/**
 * Resolves the equipped item ids against a course into the tuning the
 * simulation reads. Pure: neither `items` nor the world table is mutated.
 */
export function modifiers(items: string[], world: WorldId = 'farm'): Modifiers {
  const has = (id: string) => items.includes(id),
    w = worldById(world);
  return {
    launch: launchScale(has),
    gravity: gravityScale(has, w.gravity),
    flap: flapPower(has),
    maxFlaps: flapCount(has),
    flip: has('acrobat') ? 0.75 : 1,
    style: has('acrobat') ? 150 : 100,
    wind: w.wind + (has('tailwind') ? 35 : 0),
    bounce: has('rubber') ? 0.72 : 0.22,
    kick: kickScale(has),
    havoc: havocScale(has),
    salvage: has('salvage') ? 1.4 : 1,
    reach: has('honey') ? 1.6 : 1,
  };
}

/**
 * Builds a deterministic generator over `seed` (coerced to uint32) returning
 * values in [0, 1). Every call advances the closed-over state, so a replay
 * must recreate the generator from the same seed to see the same stream.
 */
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a digest of `value` as a uint32, used to derive reproducible seeds. */
export function hashSeed(value: string) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

/**
 * Seed shared by everyone playing the same UTC calendar day. Derived from the
 * date's `YYYY-MM-DD` form and the content revision, so a content bump starts
 * a fresh daily rather than reusing yesterday's course.
 */
export function dailySeed(date = new Date()) {
  return hashSeed(
    `hoof-v${CONTENT_VERSION}-${date.toISOString().slice(0, 10)}`,
  );
}
