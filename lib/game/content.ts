export const CONTENT_VERSION = 5;
export type WorldId =
  | 'farm'
  | 'candy'
  | 'carnival'
  | 'office'
  | 'moon'
  | 'afterlife';
export type Ability =
  | 'eject'
  | 'honk'
  | 'ghost'
  | 'blackhole'
  | 'spring'
  | 'dynamite';
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
export const worldById = (id: WorldId) => WORLDS.find((w) => w.id === id)!;
export interface Relic {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'flight' | 'impact' | 'world' | 'body' | 'active';
  ability?: Ability;
}
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
    'Use the right control after landing. Blast your wreck and ignite nearby TNT.',
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
export const relicById = (id: string) => RELICS.find((r) => r.id === id)!;
export const SYNERGIES = [
  {
    id: 'meteor',
    name: 'The Meat-eor',
    items: ['rocket', 'heavy'],
    description: 'Extra launch speed. Catastrophic arrival.',
  },
  {
    id: 'beanstorm',
    name: 'Category Five Flatulence',
    items: ['beans', 'tailwind'],
    description: 'Flaps propel the entire weather system.',
  },
  {
    id: 'poultry',
    name: 'Legally a Chicken',
    items: ['wings', 'feather'],
    description: 'An extra flap and slower falling.',
  },
  {
    id: 'arcade',
    name: 'Four-legged Pinball',
    items: ['rubber', 'pinball'],
    description: 'Unreasonably energetic kicks and rebounds.',
  },
  {
    id: 'junk',
    name: 'Scrap Metal Supernova',
    items: ['magnet', 'blackhole'],
    description: 'Your black hole has a much larger appetite.',
  },
  {
    id: 'haunted',
    name: 'Possession Is Nine Tenths',
    items: ['ghostly', 'ghost'],
    description: 'Possessed props receive a violent second wind.',
  },
  {
    id: 'recital',
    name: 'Explosive Classical Music',
    items: ['piano', 'confetti'],
    description: 'The complimentary piano also explodes.',
  },
  {
    id: 'party',
    name: 'Surprise Funeral',
    items: ['loose', 'dynamite'],
    description: 'A spectacularly distributed family reunion.',
  },
];
export function synergies(items: string[]) {
  return SYNERGIES.filter((s) => s.items.every((id) => items.includes(id)));
}
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
export function modifiers(items: string[], world: WorldId = 'farm'): Modifiers {
  const has = (id: string) => items.includes(id),
    w = worldById(world);
  return {
    launch:
      (has('rocket') ? 1.15 : 1) * (has('rocket') && has('heavy') ? 1.08 : 1),
    gravity:
      w.gravity *
      (has('feather') ? 0.85 : 1) *
      (has('wings') && has('feather') ? 0.92 : 1),
    flap: has('beans') ? (has('tailwind') ? 1.6 : 1.35) : 1,
    maxFlaps:
      3 + (has('wings') ? 2 : 0) + (has('wings') && has('feather') ? 1 : 0),
    flip: has('acrobat') ? 0.75 : 1,
    style: has('acrobat') ? 150 : 100,
    wind: w.wind + (has('tailwind') ? 35 : 0),
    bounce: has('rubber') ? 0.72 : 0.22,
    kick: has('pinball') ? (has('rubber') ? 1.65 : 1.35) : 1,
    havoc: (has('heavy') ? 1.25 : 1) * (has('spikes') ? 1.4 : 1),
    salvage: has('salvage') ? 1.4 : 1,
    reach: has('honey') ? 1.6 : 1,
  };
}
export function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashSeed(value: string) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function dailySeed(date = new Date()) {
  return hashSeed(
    `hoof-v${CONTENT_VERSION}-${date.toISOString().slice(0, 10)}`,
  );
}

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
