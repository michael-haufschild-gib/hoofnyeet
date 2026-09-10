/**
 * The relic catalogue: the fixed table of collectable items, the pairs that
 * combine into named synergies, and the sprite each relic paints with.
 *
 * The data is static and version-stamped by `CONTENT_VERSION` in `./content`,
 * which re-exports everything here so existing importers keep one entry point.
 * Index order is part of the save and share-link format: a challenge URL
 * encodes a relic pool as positions in `RELICS`, so entries may be appended
 * but never reordered or removed without a content-version bump.
 */

/** Identifier of the single manually triggered power a run carries. */
export type Ability =
  | 'eject'
  | 'honk'
  | 'ghost'
  | 'blackhole'
  | 'spring'
  | 'dynamite';

/**
 * One collectable item. `id` is the save-stable key, `icon` is a single
 * display glyph, and `category` decides where the item lands when taken:
 * `active` replaces the run's ability, everything else joins the passives.
 * `ability` is present only on `active` relics.
 */
export interface Relic {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'flight' | 'impact' | 'world' | 'body' | 'active';
  ability?: Ability;
}

/**
 * Every relic in the game, in the order the share-link pool format encodes.
 *
 * Authored as tuples of `[id, name, icon, description, category, ability]`
 * because the flat rows stay readable at this length; the map inflates them
 * into the `Relic` shape callers see.
 */
export const RELICS: Relic[] = [
  [
    'beans',
    'Bean propulsion',
    '♨',
    'Every flap fires a bean-powered fart. 35% more lift and forward boost.',
    'flight',
  ],
  [
    'wings',
    'Questionable wings',
    '↟',
    'Two extra panic flaps. Technically poultry.',
    'flight',
  ],
  [
    'rocket',
    'Unlicensed jetpack',
    '↗',
    'Launch 15% faster. Warranty already void.',
    'flight',
  ],
  [
    'feather',
    'Featherweight fraud',
    '≈',
    '15% less gravity. 100% less credibility.',
    'flight',
  ],
  [
    'acrobat',
    'Gymnastics receipt',
    '↻',
    'Flip 25% faster and earn 50 extra style.',
    'flight',
  ],
  [
    'tailwind',
    'Pocket weather',
    '≋',
    'A pocket cloud blows you forward throughout flight. Combines with beans for stronger fart boosts.',
    'flight',
  ],
  [
    'rubber',
    'Rubber bones',
    '〰',
    'Your wreck rebounds twice as enthusiastically.',
    'impact',
  ],
  [
    'heavy',
    'Lead-lined optimism',
    '▣',
    'Impact force and havoc rewards rise 25%.',
    'impact',
  ],
  [
    'confetti',
    'Explosive confetti',
    '✺',
    'The first major collision has a second opinion.',
    'impact',
  ],
  [
    'spikes',
    'Spicy horseshoes',
    '✷',
    'Prop damage earns 40% more havoc.',
    'impact',
  ],
  [
    'aftershock',
    'Delayed regret',
    '⌁',
    'A second blast arrives two seconds after impact.',
    'impact',
  ],
  [
    'pinball',
    'Pinball diploma',
    '◈',
    'Every panic kick is 35% stronger.',
    'impact',
  ],
  [
    'magnet',
    'Magnetic horseshoes',
    '∩',
    'Nearby metal is drawn into your personal problems.',
    'world',
  ],
  [
    'honey',
    'Forbidden honey',
    '⬡',
    'Collect bonuses from 60% farther away.',
    'world',
  ],
  [
    'salvage',
    'Receipt collector',
    '¤',
    'Salvage rewards increase by 40%.',
    'world',
  ],
  [
    'sheepish',
    'Sheep whisperer',
    '♧',
    'Three extremely helpful sheep join every wreck.',
    'world',
  ],
  [
    'piano',
    'Piano subscription',
    '♬',
    'One complimentary grand piano per accident.',
    'world',
  ],
  [
    'discount',
    'Corporate discount',
    '٪',
    'Insurance and rerolls cost 30% less.',
    'world',
  ],
  [
    'loose',
    'Detachable everything',
    '✂',
    'Limbs break loose sooner and score extra havoc.',
    'body',
  ],
  [
    'ghostly',
    'Ghost insurance',
    '♙',
    'The soul of your horse supplies a fourth kick.',
    'body',
  ],
  [
    'helmet',
    'Helmet collection',
    '◡',
    'Three helmets fly off at impact. Safety in numbers.',
    'body',
  ],
  [
    'eyes',
    'Googly hindsight',
    '◉',
    'Two wildly bouncing eyes contribute to collisions.',
    'body',
  ],
  [
    'long',
    'Suspiciously long neck',
    '↕',
    'A longer, more flexible neck catches more trouble.',
    'body',
  ],
  [
    'lucky',
    'Lucky last hoof',
    '☘',
    'First failed objective each run gets a free retry.',
    'body',
  ],
  [
    'eject',
    'Emergency Ejection',
    '↥',
    'Launch your head. Leave a forwarding address.',
    'active',
    'eject',
  ],
  [
    'honk',
    'Honk Cannon',
    '»',
    'A directional goose blast rearranges the scenery.',
    'active',
    'honk',
  ],
  [
    'ghost',
    'Ghost Shift',
    '♙',
    'Possess a nearby prop. Abandon previous management.',
    'active',
    'ghost',
  ],
  [
    'blackhole',
    'Pocket Black Hole',
    '◉',
    'Inhale the wreckage. Burp it into tomorrow.',
    'active',
    'blackhole',
  ],
  [
    'spring',
    'Spring-loaded Spine',
    '〰',
    'Compress, then rebound with unreasonable confidence.',
    'active',
    'spring',
  ],
  [
    'dynamite',
    'Dynamite Diaper',
    '✹',
    'Use the right control after landing. Go nuclear: blast your wreck forward and ignite nearby TNT.',
    'active',
    'dynamite',
  ],
].map(([id, name, icon, description, category, ability]) => ({
  id,
  name,
  icon,
  description,
  category: category as Relic['category'],
  ability: ability as Ability | undefined,
}));

/** Looks a relic up by `id`, asserting the id came from this catalogue. */
export const relicById = (id: string) => RELICS.find((r) => r.id === id)!;

/**
 * Named pairs that reward carrying two specific relics at once. `items` lists
 * the relic ids required; `effect` is the short HUD label and `description`
 * the longer briefing line. Owning both members applies the bonus implicitly,
 * so nothing here is spent, equipped or otherwise consumed.
 */
export const SYNERGIES = [
  {
    id: 'meteor',
    name: 'The Meat-eor',
    effect: 'Stronger launch',
    items: ['rocket', 'heavy'],
    description: 'Extra launch speed. Catastrophic arrival.',
  },
  {
    id: 'beanstorm',
    name: 'Category Five Flatulence',
    effect: 'Stronger fart boosts',
    items: ['beans', 'tailwind'],
    description: 'Flaps propel the entire weather system.',
  },
  {
    id: 'poultry',
    name: 'Legally a Chicken',
    effect: '+1 flap · slower falling',
    items: ['wings', 'feather'],
    description: 'An extra flap and slower falling.',
  },
  {
    id: 'arcade',
    name: 'Four-legged Pinball',
    effect: 'Stronger kicks & rebounds',
    items: ['rubber', 'pinball'],
    description: 'Unreasonably energetic kicks and rebounds.',
  },
  {
    id: 'junk',
    name: 'Scrap Metal Supernova',
    effect: 'Larger black-hole pull',
    items: ['magnet', 'blackhole'],
    description: 'Your black hole has a much larger appetite.',
  },
  {
    id: 'haunted',
    name: 'Possession Is Nine Tenths',
    effect: 'Stronger possessed props',
    items: ['ghostly', 'ghost'],
    description: 'Possessed props receive a violent second wind.',
  },
  {
    id: 'recital',
    name: 'Explosive Classical Music',
    effect: 'Exploding pianos',
    items: ['piano', 'confetti'],
    description: 'The complimentary piano also explodes.',
  },
  {
    id: 'party',
    name: 'Surprise Funeral',
    effect: 'Explosive loose limbs',
    items: ['loose', 'dynamite'],
    description: 'A spectacularly distributed family reunion.',
  },
  {
    id: 'gas-spring',
    name: 'Internal Combustion',
    effect: 'Stronger spring rebound',
    items: ['beans', 'spring'],
    description: 'Stored gas launches your spring rebound farther forward.',
  },
  {
    id: 'retina-zap',
    name: 'Shock & Eyeballs',
    effect: 'Eye + metal → forward boost',
    items: ['eyes', 'magnet'],
    description:
      'An eyeball hitting metal discharges a forward boost. Once per crash.',
  },
  {
    id: 'haunted-encore',
    name: 'Dead Man’s Encore',
    effect: 'Piano hit → +1 kick',
    items: ['piano', 'ghostly'],
    description:
      'A piano hitting your remains restores one kick. Once per crash.',
  },
  {
    id: 'organ-applause',
    name: 'Organ Ovation',
    effect: '3 different tricks → +1 flap',
    items: ['acrobat', 'confetti'],
    description: 'Complete three different air tricks to earn one extra flap.',
  },
];

/** Every synergy whose required relics are all present in `items`. */
export function synergies(items: readonly string[]) {
  return SYNERGIES.filter((s) => s.items.every((id) => items.includes(id)));
}

/** Presentation only: compare a proposed swap without spending or equipping. */
export function synergyChanges(
  items: readonly string[],
  incoming: string,
  outgoing?: string,
) {
  const before = synergies(items);
  const after = synergies([...items.filter((id) => id !== outgoing), incoming]);
  return {
    gained: after.filter((pair) => !before.includes(pair)),
    lost: before.filter((pair) => !after.includes(pair)),
  };
}

/**
 * Path to the sprite that stands in for a relic on cards and pickups.
 * Falls back to the helmet sprite for an unknown id, so a stale save never
 * paints a broken image.
 */
export function relicArt(id: string) {
  if (id === 'tailwind') return '/art/sprites/pocket-weather.svg';
  const names: Record<string, string> = {
    beans: 'bean-propulsion-cloud',
    wings: 'wings',
    rocket: 'jetpack',
    feather: 'wing-left',
    acrobat: 'offended-head',
    rubber: 'skeletal-torso',
    heavy: 'helmet',
    confetti: 'party-cone',
    spikes: 'magnetic-horseshoe',
    aftershock: 'tnt',
    pinball: 'donut',
    magnet: 'magnetic-horseshoe',
    honey: 'donut',
    salvage: 'bone',
    sheepish: 'sheep',
    piano: 'piano',
    discount: 'officeGoose',
    loose: 'skeletal-hind-leg-flailing',
    ghostly: 'ghost-head',
    helmet: 'helmet',
    eyes: 'eyeball-up',
    long: 'head',
    lucky: 'crown',
    eject: 'offended-head',
    honk: 'goose',
    ghost: 'ghost-head',
    blackhole: 'ghost-portal-ring',
    spring: 'skeletal-torso',
    dynamite: 'tnt',
  };
  return `/art/sprites/${names[id] ?? 'helmet'}.webp`;
}
