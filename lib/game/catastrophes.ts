import type { WorldId } from './content';
export type Mechanism =
  | 'press'
  | 'swarm'
  | 'blast'
  | 'fence'
  | 'chomp'
  | 'roller'
  | 'pendulum'
  | 'piano'
  | 'glove'
  | 'carousel'
  | 'shredder'
  | 'tractor'
  | 'slide'
  | 'portal';
export interface Catastrophe {
  mechanism: Mechanism;
  prop: string;
  trap: string;
  count: number;
  beat: number;
  punchline: string;
}
const c = (
  mechanism: Mechanism,
  prop: string,
  trap: string,
  count: number,
  beat: number,
  punchline: string,
): Catastrophe => ({ mechanism, prop, trap, count, beat, punchline });
export const CATASTROPHES: Record<WorldId, Catastrophe[]> = {
  farm: [
    c('press', 'hay', 'baler', 7, 1.2, 'NOW AVAILABLE IN ECONOMY SIZE.'),
    c(
      'swarm',
      'sheep',
      'jaws',
      12,
      0.9,
      'THE SHEEP WERE VEGETARIAN. PAST TENSE.',
    ),
    c('blast', 'tnt', 'baler', 7, 1.8, '100% ORGANIC. 200% FLAMMABLE.'),
    c(
      'fence',
      'bone',
      'grave',
      10,
      1.1,
      'YOUR EXTERIOR WILL BE FORWARDED SEPARATELY.',
    ),
  ],
  candy: [
    c(
      'chomp',
      'donut',
      'jaws',
      8,
      0.8,
      'DENTIST-RECOMMENDED. HORSE-DISAPPROVED.',
    ),
    c('roller', 'pastry', 'donut', 8, 1.3, 'STRETCH GOALS ACHIEVED.'),
    c('blast', 'tnt', 'jaws', 9, 2, 'A FONDUE FAREWELL.'),
    c('pendulum', 'donut', 'bone', 8, 0.7, 'THE LOLLIPOP HAS RIGHT OF WAY.'),
  ],
  carnival: [
    c(
      'piano',
      'bone',
      'piano',
      10,
      1.4,
      'ANOTHER STANDING OVATION. ANOTHER PIANO.',
    ),
    c('glove', 'helmet', 'glove', 8, 0.6, 'THE PUNCHLINE HAS ARRIVED.'),
    c(
      'carousel',
      'drum',
      'glove',
      10,
      1,
      'PLEASE REMAIN SEATED INSIDE YOUR SKELETON.',
    ),
    c('piano', 'piano', 'piano', 6, 2, 'THE ENCORE WAS NOT OPTIONAL.'),
  ],
  office: [
    c('press', 'cabinet', 'cabinet', 7, 1, 'PLEASE INITIAL EVERY FRACTURE.'),
    c(
      'shredder',
      'cabinet',
      'officeGoose',
      12,
      0.9,
      'YOUR COMPLAINT HAS BEEN SHREDDED.',
    ),
    c('fence', 'cabinet', 'officeGoose', 8, 1.5, 'WE VALUE YOUR BODY OF WORK.'),
    c(
      'glove',
      'helmet',
      'officeGoose',
      10,
      1.2,
      'YOUR CLAIM HAS BEEN VIOLENTLY DENIED.',
    ),
  ],
  moon: [
    c('tractor', 'bone', 'ufo', 12, 1, 'ONE SMALL STEP. MANY SMALL PIECES.'),
    c('portal', 'helmet', 'ufo', 8, 1.6, 'TAKE US TO YOUR VETERINARIAN.'),
    c('blast', 'cheese', 'barrel', 10, 1.1, 'THE MOON IS LACTOSE INTOLERANT.'),
    c(
      'carousel',
      'cheese',
      'ufo',
      9,
      0.8,
      'ORBITAL DECAY OF PERSONAL DIGNITY.',
    ),
  ],
  afterlife: [
    c('slide', 'swimring', 'reaper', 8, 1.4, 'RELAX. YOUR SKELETON HAS THIS.'),
    c('roller', 'bonepile', 'ghost', 8, 1, 'SOUL REMOVAL IS INCLUDED.'),
    c('portal', 'ghost', 'grave', 8, 1.7, 'WE HAVE LOST YOUR RETURN ADDRESS.'),
    c('press', 'grave', 'reaper', 9, 2, 'LATE CHECKOUT. VERY LATE.'),
  ],
};
