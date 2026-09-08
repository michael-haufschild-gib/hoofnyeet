import {
  LANDINGS,
  type GameState,
  type Hat,
  type LandingId,
} from './simulation';
import { CONTENT_VERSION, RELICS, WORLDS } from './content';
import { validDailyDate, type RunState } from './run';
import { PONIES, ponyUnlocked, type PonyId } from './cosmetics';
import {
  isChallengeRule,
  challengeUnlocked,
  insuranceCapacity,
  type ChallengeRule,
} from './challenge-rules';
export const STORAGE_KEY = 'hoof-and-yeet:v2';
export interface SaveData {
  version: 2;
  run: RunState | null;
  unlocked: string[];
  wins: number;
  bestHavoc: number;
  discoveries: string[];
  daily: Record<string, number>;
  assisted: boolean;
  gentle: boolean;
  primaryKey: string;
  secondaryKey: string;
  best: number;
  bestStyle: number;
  rounds: number;
  landings: LandingId[];
  hats: Hat[];
  hat: Hat;
  pony: PonyId;
  challenge: ChallengeRule;
  music: boolean;
  effects: boolean;
  reduced: boolean;
  last: { distance: number; landing: LandingId }[];
}
export function defaultSave(): SaveData {
  return {
    version: 2,
    run: null,
    unlocked: [
      'beans',
      'wings',
      'rocket',
      'rubber',
      'confetti',
      'pinball',
      'magnet',
      'salvage',
      'loose',
      'ghostly',
      'spring',
      'dynamite',
      'honk',
    ],
    wins: 0,
    bestHavoc: 0,
    discoveries: [],
    daily: {},
    assisted: false,
    gentle: false,
    primaryKey: 'Space',
    secondaryKey: 'ArrowUp',
    best: 0,
    bestStyle: 0,
    rounds: 0,
    landings: [],
    hats: ['helmet'],
    hat: 'helmet',
    pony: 'buttercup',
    challenge: 'standard',
    music: true,
    effects: true,
    reduced: false,
    last: [],
  };
}
const hats: Hat[] = ['helmet', 'party', 'crown', 'space'];
const validResult = (value: unknown) => {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    ['distance', 'style', 'havoc', 'bossHits'].every(
      (key) =>
        typeof result[key] === 'number' &&
        Number.isFinite(result[key]) &&
        result[key] >= 0,
    ) &&
    typeof result.failed === 'boolean' &&
    typeof result.disaster === 'string'
  );
};
export function readSave(storage?: Pick<Storage, 'getItem'>): SaveData {
  const d = defaultSave();
  try {
    const raw = JSON.parse(
      storage?.getItem(STORAGE_KEY) ||
        storage?.getItem('hoof-and-yeet:v1') ||
        'null',
    );
    if (!raw || ![1, 2].includes(raw.version)) return d;
    if (raw.version === 2) {
      if (Array.isArray(raw.unlocked))
        d.unlocked = [
          ...new Set([
            ...d.unlocked,
            ...raw.unlocked.filter((id: string) =>
              RELICS.some((r) => r.id === id),
            ),
          ]),
        ];
      for (const key of ['wins', 'bestHavoc'] as const)
        if (Number.isFinite(raw[key]) && raw[key] >= 0) d[key] = raw[key];
      for (const key of ['assisted', 'gentle'] as const)
        if (typeof raw[key] === 'boolean') d[key] = raw[key];
      for (const key of ['primaryKey', 'secondaryKey'] as const)
        if (
          typeof raw[key] === 'string' &&
          /^(Space|Arrow(Up|Down|Left|Right)|Key[A-Z])$/.test(raw[key])
        )
          d[key] = raw[key];
      if (d.primaryKey === d.secondaryKey) {
        d.primaryKey = 'Space';
        d.secondaryKey = 'ArrowUp';
      }
      if (Array.isArray(raw.discoveries))
        d.discoveries = raw.discoveries
          .filter((x: unknown) => typeof x === 'string')
          .slice(0, 100);
      if (raw.daily && typeof raw.daily === 'object')
        d.daily = Object.fromEntries(
          Object.entries(raw.daily)
            .filter(
              ([k, v]) =>
                /^(v[2345]:)?\d{4}-\d{2}-\d{2}(:assisted)?$/.test(k) &&
                typeof v === 'number' &&
                Number.isFinite(v) &&
                v >= 0,
            )
            .slice(-60)
            .map(([k, v]) => [k.startsWith('v') ? k : `v2:${k}`, v]),
        ) as Record<string, number>;
      const r = raw.run;
      if (
        r &&
        r.version === 2 &&
        (r.contentVersion === undefined ||
          [2, 3, 4, CONTENT_VERSION].includes(r.contentVersion)) &&
        Number.isSafeInteger(r.seed) &&
        r.seed >= 0 &&
        r.seed <= 0xffffffff &&
        Number.isInteger(r.stage) &&
        r.stage >= 0 &&
        r.stage < 9 &&
        ['tour', 'daily'].includes(r.mode) &&
        ['briefing', 'playing', 'pitstop'].includes(r.status) &&
        Array.isArray(r.passives) &&
        r.passives.length <= 4 &&
        new Set(r.passives).size === r.passives.length &&
        r.passives.every((id: string) =>
          RELICS.some((x) => x.id === id && x.category !== 'active'),
        ) &&
        RELICS.some((x) => x.id === r.ability && x.category === 'active') &&
        ['farm', 'candy', 'carnival', 'office', 'moon', 'afterlife'].includes(
          r.world,
        ) &&
        Number.isInteger(r.insurance) &&
        r.insurance > 0 &&
        r.insurance <= 3 &&
        Number.isFinite(r.salvage) &&
        r.salvage >= 0 &&
        Array.isArray(r.offers) &&
        r.offers.length <= 3 &&
        new Set(r.offers).size === r.offers.length &&
        r.offers.every((id: unknown) =>
          RELICS.some((relic) => relic.id === id),
        ) &&
        Array.isArray(r.route) &&
        r.route.length <= r.stage + 1 &&
        r.route.every((id: unknown, stage: number) =>
          WORLDS.some(
            (world) => world.id === id && world.act === Math.floor(stage / 3),
          ),
        ) &&
        WORLDS.some(
          (world) =>
            world.id === r.world && world.act === Math.floor(r.stage / 3),
        ) &&
        Array.isArray(r.history) &&
        r.history.length === r.stage + (r.status === 'pitstop' ? 1 : 0) &&
        r.history.every(validResult) &&
        (r.result === null || validResult(r.result))
      )
        d.run = {
          ...r,
          contentVersion: CONTENT_VERSION,
          mode:
            r.mode === 'daily' && r.contentVersion !== CONTENT_VERSION
              ? 'tour'
              : r.mode,
          updatedDaily:
            r.updatedDaily === true ||
            (r.mode === 'daily' && r.contentVersion !== CONTENT_VERSION),
          target: r.contentVersion === CONTENT_VERSION ? r.target : undefined,
          status: r.status === 'playing' ? 'briefing' : r.status,
          pool: Array.isArray(r.pool)
            ? [
                ...new Set<string>(
                  r.pool.filter((id: string) =>
                    RELICS.some((x) => x.id === id),
                  ),
                ),
              ]
            : [...d.unlocked],
          attempt:
            Number.isSafeInteger(r.attempt) && r.attempt >= 0 ? r.attempt : 0,
          settledAttempt: Number.isSafeInteger(r.settledAttempt)
            ? r.settledAttempt
            : -1,
          score: Number.isFinite(r.score) && r.score >= 0 ? r.score : 0,
          rerolls:
            Number.isSafeInteger(r.rerolls) && r.rerolls >= 0 ? r.rerolls : 0,
          assisted: r.assisted === true,
          rewardTaken: r.rewardTaken === true,
          luckyUsed: r.luckyUsed === true,
          insurance: Math.min(
            r.insurance,
            insuranceCapacity(
              r.mode === 'tour' && isChallengeRule(r.rules)
                ? r.rules
                : 'standard',
            ),
          ),
          rules:
            r.mode === 'tour' && isChallengeRule(r.rules)
              ? r.rules
              : 'standard',
          dailyDate: validDailyDate(r.dailyDate, r.seed)
            ? r.dailyDate
            : undefined,
        };
    }
    for (const key of ['best', 'bestStyle', 'rounds'] as const)
      if (
        typeof raw[key] === 'number' &&
        Number.isFinite(raw[key]) &&
        raw[key] >= 0
      )
        d[key] = raw[key];
    for (const key of ['music', 'effects', 'reduced'] as const)
      if (typeof raw[key] === 'boolean') d[key] = raw[key];
    if (Array.isArray(raw.landings))
      d.landings = [
        ...new Set<LandingId>(
          raw.landings.filter((x: string) => Object.hasOwn(LANDINGS, x)),
        ),
      ];
    if (Array.isArray(raw.hats))
      d.hats = [
        ...new Set<Hat>([
          'helmet',
          ...raw.hats.filter((x: Hat) => hats.includes(x)),
        ]),
      ];
    if (d.hats.includes(raw.hat)) d.hat = raw.hat;
    if (
      isChallengeRule(raw.challenge) &&
      challengeUnlocked(raw.challenge, d.wins)
    )
      d.challenge = raw.challenge;
    if (PONIES.some((p) => p.id === raw.pony) && ponyUnlocked(raw.pony, d))
      d.pony = raw.pony;
    if (Array.isArray(raw.last))
      d.last = raw.last
        .filter(
          (x: { distance: number; landing: LandingId }) =>
            x &&
            typeof x.distance === 'number' &&
            Number.isFinite(x.distance) &&
            x.distance >= 0 &&
            Object.hasOwn(LANDINGS, x.landing),
        )
        .slice(0, 5);
  } catch {
    /* Private browsing and invalid saves should never stop a horse. */
  }
  return d;
}
export function writeSave(save: SaveData, storage?: Pick<Storage, 'setItem'>) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(save));
    return !!storage;
  } catch {
    return false;
  }
}
export function finishRound(old: SaveData, s: GameState): SaveData {
  const save = {
    ...old,
    rounds: old.rounds + 1,
    best: Math.max(old.best, s.distance),
    bestStyle: Math.max(old.bestStyle, s.style),
    bestHavoc: Math.max(old.bestHavoc, s.havoc),
    unlocked: [...old.unlocked],
    discoveries: [...old.discoveries],
    hats: [...old.hats],
    landings: [...old.landings],
    last: [{ distance: s.distance, landing: s.landing }, ...old.last].slice(
      0,
      5,
    ),
  };
  const discover = `${s.world}:${s.disaster % 4}`;
  if (!s.failed && !save.discoveries.includes(discover))
    save.discoveries.push(discover);
  for (const r of RELICS.slice(
    0,
    Math.min(RELICS.length, 13 + save.rounds * 2),
  ))
    if (!save.unlocked.includes(r.id)) save.unlocked.push(r.id);
  if (!s.failed && !save.landings.includes(s.landing))
    save.landings.push(s.landing);
  if (s.distance >= 100 && !save.hats.includes('party'))
    save.hats.push('party');
  if (s.distance >= 250 && !save.hats.includes('crown'))
    save.hats.push('crown');
  if (s.distance >= 400 && !save.hats.includes('space'))
    save.hats.push('space');
  return save;
}
