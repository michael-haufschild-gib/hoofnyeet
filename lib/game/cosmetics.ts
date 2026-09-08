import type { Hat } from './simulation';

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
export type PonyId = (typeof PONIES)[number]['id'];
export interface PonyOutfit {
  hat: Hat;
  ponyId: PonyId;
}
export function ponyUnlocked(
  id: PonyId,
  progress: { rounds: number; wins: number },
) {
  const pony = PONIES.find((p) => p.id === id);
  return !!pony && progress.rounds >= pony.rounds && progress.wins >= pony.wins;
}
export const HATS: {
  id: Hat;
  name: string;
  art: string;
  requirement: string;
}[] = [
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
  },
  {
    id: 'crown',
    name: 'Your Neighjesty',
    art: 'crown',
    requirement: '250 metres',
  },
  {
    id: 'space',
    name: 'Neigh-stronaut',
    art: 'astronaut-helmet',
    requirement: '400 metres',
  },
];
