import type { Hat } from '../simulation';

/**
 * Every playable pony, in unlock order. `rounds` and `wins` are the attempt and
 * completed-tour totals a save must reach, and `mane` and `coat` are RGB
 * components in 0..1 handed straight to the palette shader.
 */
export const PONIES = [
  {
    id: 'buttercup',
    name: 'Buttercup',
    tagline: 'Original equipment. No warranty.',
    requirement: 'Standard issue',
    rounds: 0,
    wins: 0,
    mane: [1, 0.39, 0.12],
    coat: [1, 0.9, 0.7],
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    tagline: 'Sweet. Structurally questionable.',
    requirement: '3 attempts',
    rounds: 3,
    wins: 0,
    mane: [0.98, 0.24, 0.57],
    coat: [1, 0.84, 0.87],
  },
  {
    id: 'pistachio',
    name: 'Pistachio',
    tagline: 'May contain traces of horse.',
    requirement: '8 attempts',
    rounds: 8,
    wins: 0,
    mane: [0.23, 0.7, 0.39],
    coat: [0.92, 0.94, 0.74],
  },
  {
    id: 'midnight',
    name: 'Midnight Snack',
    tagline: 'The moon declined responsibility.',
    requirement: 'Complete a tour',
    rounds: 0,
    wins: 1,
    mane: [0.38, 0.54, 1],
    coat: [0.62, 0.66, 0.85],
  },
] as const;
/** Identifier of one PONIES entry; a save naming anything else is rejected. */
export type PonyId = (typeof PONIES)[number]['id'];
/**
 * What a rig wears. Recorded with every replay frame, so archived footage keeps
 * the outfit it was captured in rather than the current selection.
 */
export interface PonyOutfit {
  hat: Hat;
  ponyId: PonyId;
}
/**
 * True when a save's attempt and tour totals both reach the pony's thresholds.
 * An unrecognised id reads as locked rather than throwing, so an imported save
 * cannot select a skin this build no longer ships.
 */
export function ponyUnlocked(
  id: PonyId,
  progress: { rounds: number; wins: number },
) {
  const pony = PONIES.find((p) => p.id === id);
  return !!pony && progress.rounds >= pony.rounds && progress.wins >= pony.wins;
}
/**
 * One headwear entry. `mount` places the art on the head: `anchor` is the
 * sprite pivot in 0..1 art space, `width` a multiple of the head width, `angle`
 * a radian offset from the head tilt, and `dome` seats a full-face helmet on
 * the visor instead of the crown. Without `mount` no sprite is drawn, and
 * `extra` art ships outside the base bundle and is fetched on demand.
 */
export interface HatDefinition {
  id: Hat;
  name: string;
  art: string;
  requirement: string;
  extra?: boolean;
  mount?: {
    anchor: [number, number];
    width: number;
    angle: number;
    dome?: boolean;
  };
}
/**
 * Headwear in unlock order. `requirement` is display copy for the milestone
 * that grants the hat; `id` is what a save stores.
 */
export const HATS: HatDefinition[] = [
  {
    id: 'helmet',
    name: 'Safety-ish',
    art: 'helmet',
    requirement: 'Standard issue',
  },
  {
    id: 'party',
    name: 'Party animal',
    art: 'party-cone',
    requirement: '100 metres',
    mount: { anchor: [0.43, 0.81], width: 44 / 71, angle: -0.32 },
  },
  {
    id: 'crown',
    name: 'Your Neighjesty',
    art: 'crown',
    requirement: '250 metres',
    mount: { anchor: [0.46, 0.845], width: 47 / 71, angle: -0.25 },
  },
  {
    id: 'space',
    name: 'Neigh-stronaut',
    art: 'astronaut-helmet',
    requirement: '400 metres',
    mount: { anchor: [0.5, 0.5], width: 1, angle: 0, dome: true },
  },
  {
    id: 'brain',
    name: 'Think tank',
    art: 'brain-bonnet',
    extra: true,
    requirement: '1,000 style in one attempt',
    mount: { anchor: [0.55, 0.94], width: 0.7, angle: -0.08 },
  },
  {
    id: 'disco',
    name: 'Disco mortis',
    art: 'disco-skull',
    extra: true,
    requirement: '3 different tricks in one flight',
    mount: { anchor: [0.49, 0.94], width: 0.72, angle: -0.1 },
  },
  {
    id: 'sausage',
    name: 'Wurst in show',
    art: 'sausage-crown',
    extra: true,
    requirement: 'Land in all 6 worlds',
    mount: { anchor: [0.53, 0.9], width: 0.88, angle: 0.12 },
  },
];
/**
 * The definition behind a hat id. The id must be one this build ships: an
 * unknown id yields undefined despite the type, so validate stored values.
 */
export function hatById(id: Hat) {
  return HATS.find((hat) => hat.id === id)!;
}
/**
 * Public URL of a hat's artwork. Unlockable extras live in the costumes bundle
 * and load on demand; the rest come from the preloaded sprite bundle.
 */
export function hatAsset(id: Hat) {
  const hat = hatById(id);
  return `/art/${hat.extra ? 'costumes' : 'sprites'}/${hat.art}.webp`;
}
