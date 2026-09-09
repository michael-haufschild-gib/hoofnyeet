import { CARNAGE_SOUNDS } from './escalation';
import type { GameEvent } from './simulation';
import type { WorldId } from './content';

/** Every possible short cue is shared by a level: abilities and landings can
 * introduce materials from other worlds. Music stays scoped to the course. */
export const EFFECT_AUDIO = [
  ...CARNAGE_SOUNDS,
  'gallop',
  'flip',
  'ring',
  'ui-click',
  'honk',
  'warning',
  'rebound',
  'explosion',
  'nuclear',
  'woodbreak',
  'metalcrash',
  'glassbreak',
  'teethchomp',
  'baler',
  'piano',
  'stamp',
  'ghost',
  'ufo',
  'splat',
  'water',
  'sheep',
  'goose',
  'crowd',
  'laugh',
  'eject',
  'blackhole',
  'equip',
  'upgrade',
  'insurance',
  'win',
  'lose',
  'fanfare',
  'wind',
  'boing',
  'flap',
  'kick',
  'squish',
  'coin',
  'jump',
  'boneclatter',
] as const;
export const MUSIC_AUDIO = [
  'main',
  'farm',
  'candy',
  'carnival',
  'office',
  'moon',
  'afterlife',
  'boss-act1',
  'boss-act2',
  'boss-act3',
] as const;
export type AudioId =
  | (typeof EFFECT_AUDIO)[number]
  | (typeof MUSIC_AUDIO)[number];
const known = new Set<string>([...EFFECT_AUDIO, ...MUSIC_AUDIO]);
/** Gameplay feedback wins over incidental debris within the same voice cap. */
export function soundPriority(id: AudioId) {
  if (id === 'nuclear') return 3;
  if (
    [
      'boing',
      'jump',
      'eject',
      'blackhole',
      'rebound',
      'kick',
      'flap',
      'win',
      'lose',
      'fanfare',
    ].includes(id)
  )
    return 2;
  if (
    [
      'explosion',
      'honk',
      'baler',
      'piano',
      'stamp',
      'teethchomp',
      'warning',
    ].includes(id)
  )
    return 1;
  return 0;
}
const aliases: Partial<Record<GameEvent['kind'], AudioId>> = {
  tap: 'gallop',
  bounce: 'boing',
  land: 'squish',
  crunch: 'boneclatter',
  record: 'win',
  count: 'ui-click',
  glide: 'wind',
};
export function eventAudio(e: GameEvent): AudioId[] {
  if (e.propulsion) return ['squish', 'flap'];
  const id = e.sound ?? aliases[e.kind] ?? e.kind;
  return known.has(id) ? [id as AudioId] : [];
}
export function levelAudio(world: WorldId, boss: boolean): AudioId[] {
  const act = ['farm', 'candy'].includes(world)
    ? 1
    : ['carnival', 'office'].includes(world)
      ? 2
      : 3;
  return [
    ...EFFECT_AUDIO,
    'main',
    world,
    ...(boss ? [`boss-act${act}` as AudioId] : []),
  ];
}
