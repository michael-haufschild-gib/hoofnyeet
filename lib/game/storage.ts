import {
  LANDINGS,
  type GameState,
  type Hat,
  type LandingId,
} from './simulation';
import { CONTENT_VERSION, RELICS, WORLDS } from './content';
import {
  campaignOf,
  campaignStep,
  campaignWorlds,
  validCampaignRoute,
  isCampaign,
  type Campaign,
} from './campaign';
import { validDailyDate, parseTourRecordKey, type RunState } from './run';
import { HATS, PONIES, ponyUnlocked, type PonyId } from './catalogue/cosmetics';
import {
  isChallengeRule,
  challengeUnlocked,
  insuranceCapacity,
  type ChallengeRule,
} from './catalogue/challenge-rules';

/** Where the browser keeps the v2 save. The retired v1 key is read once, on migration. */
export const STORAGE_KEY = 'hoof-and-yeet:v2';

/**
 * Everything that survives a reload: progress, unlocks, the interrupted run and
 * every setting. Scores are non-negative and finite; `daily` and `tourBests`
 * map a record key to a score; `last` holds the five most recent attempts,
 * newest first. This is the only shape written to storage.
 */
export interface SaveData {
  version: 2;
  run: RunState | null;
  unlocked: string[];
  wins: number;
  bestHavoc: number;
  discoveries: string[];
  daily: Record<string, number>;
  tourBests: Record<string, number>;
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
  campaign: Campaign;
  music: boolean;
  effects: boolean;
  reduced: boolean;
  controlsSeen: boolean;
  last: { distance: number; landing: LandingId }[];
}

/** A first-time player's save: nothing achieved, the starter relics, sound on. */
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
    tourBests: {},
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
    campaign: 'classic',
    music: true,
    effects: true,
    reduced: false,
    controlsSeen: false,
    last: [],
  };
}
const hats: Hat[] = HATS.map((hat) => hat.id);
function grantHat(save: Pick<SaveData, 'hats'>, hat: Hat) {
  if (!save.hats.includes(hat)) save.hats.push(hat);
}
function explorationComplete(discoveries: string[]) {
  return WORLDS.every((world) =>
    discoveries.some((discovery) => discovery.startsWith(`${world.id}:`)),
  );
}
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

/** Parsed JSON straight out of storage: nothing in it is trusted until proved. */
type StoredSave = Record<string, unknown>;

/**
 * A run as a valid save would hold it. The field types say what the readers
 * below expect to find, never what the parsed JSON actually contains: nothing
 * here reaches the game until every check in `validRun*` has passed. The four
 * loosened fields are the ones a save may legitimately omit or predate.
 */
interface StoredRun extends Omit<
  RunState,
  'campaign' | 'contentVersion' | 'dailyDate' | 'rules'
> {
  campaign?: Campaign;
  contentVersion?: number;
  dailyDate?: unknown;
  rules?: unknown;
}

/** True for a real, finite number that is zero or above: every stored tally. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Owned relics: the starter set plus any stored id that still exists. */
function readUnlocked(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return [
    ...new Set([
      ...fallback,
      ...value.filter((id: string) => RELICS.some((r) => r.id === id)),
    ]),
  ];
}

/** Lifetime tallies, each left at its default when the stored value is not a count. */
function readTallies(raw: StoredSave, d: SaveData) {
  for (const key of ['wins', 'bestHavoc'] as const)
    if (isCount(raw[key])) d[key] = raw[key];
}

/** Difficulty aids, which only a stored boolean may turn on. */
function readAids(raw: StoredSave, d: SaveData) {
  for (const key of ['assisted', 'gentle'] as const)
    if (typeof raw[key] === 'boolean') d[key] = raw[key];
}

/**
 * The two jump keys, accepting only codes the control guide can name. Binding
 * both to one key would leave the second control dead, so that pair resets.
 */
function readKeyBindings(raw: StoredSave, d: SaveData) {
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
}

/** The `world:disaster` pairs already seen, capped at 100 entries. */
function readDiscoveries(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((x: unknown) => typeof x === 'string').slice(0, 100);
}

/**
 * Daily best scores, keyed by date and content revision, newest 60 kept. A key
 * from before revisions were recorded is adopted into `v2:`, where it was set.
 */
function readDaily(value: unknown, fallback: Record<string, number>) {
  if (!value || typeof value !== 'object') return fallback;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([k, v]) =>
          /^(v[23456]:)?\d{4}-\d{2}-\d{2}(:assisted)?$/.test(k) &&
          typeof v === 'number' &&
          Number.isFinite(v) &&
          v >= 0,
      )
      .slice(-60)
      .map(([k, v]) => [k.startsWith('v') ? k : `v2:${k}`, v]),
  ) as Record<string, number>;
}

/** Tour records, keyed by route and rules, newest 72 kept. */
function readTourBests(value: unknown, fallback: Record<string, number>) {
  if (!value || typeof value !== 'object') return fallback;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, score]) =>
          parseTourRecordKey(key) &&
          typeof score === 'number' &&
          Number.isSafeInteger(score) &&
          score >= 0,
      )
      .slice(-72),
  ) as Record<string, number>;
}

/** Identity of a stored run: a known format, seed, stage, campaign and status. */
function validRunHeader(r: StoredRun) {
  return (
    r.version === 2 &&
    (r.contentVersion === undefined ||
      [2, 3, 4, 5, CONTENT_VERSION].includes(r.contentVersion)) &&
    Number.isSafeInteger(r.seed) &&
    r.seed >= 0 &&
    r.seed <= 0xffffffff &&
    Number.isInteger(r.stage) &&
    r.stage >= 0 &&
    (r.campaign === undefined || isCampaign(r.campaign)) &&
    (r.mode === 'tour' || r.campaign !== 'grand') &&
    r.stage < campaignStep(r).events &&
    ['tour', 'daily'].includes(r.mode) &&
    ['briefing', 'playing', 'pitstop'].includes(r.status)
  );
}

/** What the run is carrying: distinct relics that exist, and spendable resources. */
function validRunLoadout(r: StoredRun) {
  return (
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
    r.offers.every((id: unknown) => RELICS.some((relic) => relic.id === id))
  );
}

/**
 * How far the run has come: a route this campaign could have produced, ending
 * on the stored world, with one recorded result per stage already settled.
 */
function validRunProgress(r: StoredRun) {
  return (
    Array.isArray(r.route) &&
    r.route.length >= r.stage &&
    r.route.length <= r.stage + 1 &&
    validCampaignRoute(r) &&
    campaignWorlds(r).some((world) => world.id === r.world) &&
    Array.isArray(r.history) &&
    r.history.length === r.stage + (r.status === 'pitstop' ? 1 : 0) &&
    r.history.every(validResult) &&
    (r.result === null || validResult(r.result))
  );
}

/** A daily run whose content has moved on continues as an ordinary tour. */
function migratedMode(r: StoredRun) {
  return r.mode === 'daily' && r.contentVersion !== CONTENT_VERSION
    ? 'tour'
    : r.mode;
}

/** True once a run has been carried across a content bump, however it started. */
function migratedDaily(r: StoredRun) {
  return (
    r.updatedDaily === true ||
    (r.mode === 'daily' && r.contentVersion !== CONTENT_VERSION)
  );
}

/** Only a tour carries its own challenge rules; anything else runs standard. */
function migratedRules(r: StoredRun): ChallengeRule {
  return r.mode === 'tour' && isChallengeRule(r.rules) ? r.rules : 'standard';
}

/** The stored draw pool with retired relics dropped, or everything unlocked. */
function migratedPool(r: StoredRun, unlocked: string[]) {
  return Array.isArray(r.pool)
    ? [
        ...new Set<string>(
          r.pool.filter((id: string) => RELICS.some((x) => x.id === id)),
        ),
      ]
    : [...unlocked];
}

/** Attempt, score and reroll counters, each falling back to a fresh-run value. */
function migratedCounters(r: StoredRun) {
  return {
    attempt: Number.isSafeInteger(r.attempt) && r.attempt >= 0 ? r.attempt : 0,
    settledAttempt: Number.isSafeInteger(r.settledAttempt)
      ? r.settledAttempt
      : -1,
    score: Number.isFinite(r.score) && r.score >= 0 ? r.score : 0,
    rerolls: Number.isSafeInteger(r.rerolls) && r.rerolls >= 0 ? r.rerolls : 0,
  };
}

/**
 * Brings a validated run up to the current content: a run interrupted mid-jump
 * resumes at its briefing, a target set under older content is dropped, and
 * insurance is capped at what the run's rules actually allow.
 */
function migrateRun(r: StoredRun, unlocked: string[]): RunState {
  return {
    ...r,
    contentVersion: CONTENT_VERSION,
    campaign: campaignOf(r),
    mode: migratedMode(r),
    updatedDaily: migratedDaily(r),
    target: r.contentVersion === CONTENT_VERSION ? r.target : undefined,
    status: r.status === 'playing' ? 'briefing' : r.status,
    pool: migratedPool(r, unlocked),
    ...migratedCounters(r),
    assisted: r.assisted === true,
    rewardTaken: r.rewardTaken === true,
    luckyUsed: r.luckyUsed === true,
    insurance: Math.min(r.insurance, insuranceCapacity(migratedRules(r))),
    rules: migratedRules(r),
    dailyDate: validDailyDate(r.dailyDate, r.seed) ? r.dailyDate : undefined,
  };
}

/** Fields only a v2 save holds: unlocks, tallies, bindings and the saved run. */
function readVersion2(raw: StoredSave, d: SaveData) {
  d.unlocked = readUnlocked(raw.unlocked, d.unlocked);
  readTallies(raw, d);
  readAids(raw, d);
  readKeyBindings(raw, d);
  d.discoveries = readDiscoveries(raw.discoveries, d.discoveries);
  d.daily = readDaily(raw.daily, d.daily);
  d.tourBests = readTourBests(raw.tourBests, d.tourBests);
  const r = raw.run as StoredRun | undefined;
  if (r && validRunHeader(r) && validRunLoadout(r) && validRunProgress(r))
    d.run = migrateRun(r, d.unlocked);
}

/** Personal bests and the round count, which every save version has carried. */
function readRecords(raw: StoredSave, d: SaveData) {
  for (const key of ['best', 'bestStyle', 'rounds'] as const)
    if (isCount(raw[key])) d[key] = raw[key];
}

/** Audio and motion preferences, each only a stored boolean may change. */
function readSettings(raw: StoredSave, d: SaveData) {
  for (const key of ['music', 'effects', 'reduced'] as const)
    if (typeof raw[key] === 'boolean') d[key] = raw[key];
}

/** Landings and hats owned, including the hats past progress alone has earned. */
function readCosmetics(raw: StoredSave, d: SaveData) {
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
  if (d.bestStyle >= 1000) grantHat(d, 'brain');
  if (explorationComplete(d.discoveries)) grantHat(d, 'sausage');
  if (d.hats.includes(raw.hat as Hat)) d.hat = raw.hat as Hat;
}

/** Chosen hat aside: the challenge, campaign and pony, each only while unlocked. */
function readSelection(raw: StoredSave, d: SaveData) {
  if (
    isChallengeRule(raw.challenge) &&
    challengeUnlocked(raw.challenge, d.wins)
  )
    d.challenge = raw.challenge;
  if (isCampaign(raw.campaign)) d.campaign = raw.campaign;
  const pony = raw.pony as PonyId;
  if (PONIES.some((p) => p.id === pony) && ponyUnlocked(pony, d)) d.pony = pony;
}

/** The five most recent attempts the title screen lists, newest first. */
function readLast(value: unknown, fallback: SaveData['last']) {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter(
      (x: { distance: number; landing: LandingId }) =>
        x &&
        typeof x.distance === 'number' &&
        Number.isFinite(x.distance) &&
        x.distance >= 0 &&
        Object.hasOwn(LANDINGS, x.landing),
    )
    .slice(0, 5);
}

/** Fields both save versions carry, read after any version-specific migration. */
function readCommon(raw: StoredSave, d: SaveData) {
  readRecords(raw, d);
  readSettings(raw, d);
  d.controlsSeen = raw.controlsSeen === true || d.rounds > 0;
  readCosmetics(raw, d);
  readSelection(raw, d);
  d.last = readLast(raw.last, d.last);
}

/**
 * The stored save, field by field, with every value that fails its check
 * replaced by the default. Absent, unreadable and corrupt storage all yield a
 * plain `defaultSave()`, so a bad save can never stop the game from starting.
 */
export function readSave(storage?: Pick<Storage, 'getItem'>): SaveData {
  const d = defaultSave();
  try {
    const raw: StoredSave = JSON.parse(
      storage?.getItem(STORAGE_KEY) ||
        storage?.getItem('hoof-and-yeet:v1') ||
        'null',
    );
    if (!raw || ![1, 2].includes(raw.version as number)) return d;
    if (raw.version === 2) readVersion2(raw, d);
    readCommon(raw, d);
  } catch {
    /* Private browsing and invalid saves should never stop a horse. */
  }
  return d;
}

/**
 * Writes the save, reporting whether it landed. A refusal — private browsing,
 * a full quota, no storage at all — returns `false` instead of throwing, since
 * losing the write is never worth losing the run in progress.
 */
export function writeSave(save: SaveData, storage?: Pick<Storage, 'setItem'>) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(save));
    return !!storage;
  } catch {
    return false;
  }
}

/** Records the world and disaster pair just survived as one more discovery. */
function recordDiscovery(save: SaveData, s: GameState) {
  const discover = `${s.world}:${s.disaster % 4}`;
  if (!s.failed && !save.discoveries.includes(discover))
    save.discoveries.push(discover);
}

/** Widens the relic pool by two more relics for every round played. */
function unlockRelics(save: SaveData) {
  for (const r of RELICS.slice(
    0,
    Math.min(RELICS.length, 13 + save.rounds * 2),
  ))
    if (!save.unlocked.includes(r.id)) save.unlocked.push(r.id);
}

/** Marks the landing site as visited, which a failed attempt never does. */
function recordLanding(save: SaveData, s: GameState) {
  if (!s.failed && !save.landings.includes(s.landing))
    save.landings.push(s.landing);
}

/** Hats earned purely by flying far: 100m, 250m and 400m in one attempt. */
function awardDistanceHats(save: SaveData, s: GameState) {
  if (s.distance >= 100 && !save.hats.includes('party'))
    save.hats.push('party');
  if (s.distance >= 250 && !save.hats.includes('crown'))
    save.hats.push('crown');
  if (s.distance >= 400 && !save.hats.includes('space'))
    save.hats.push('space');
}

/** Hats earned by how the attempt was flown, and by finishing exploration. */
function awardSkillHats(save: SaveData, s: GameState) {
  if (!s.failed && s.style >= 1000) grantHat(save, 'brain');
  if (
    !s.failed &&
    s.routine &&
    Object.values(s.routine.counts).filter((count) => count > 0).length >= 3
  )
    grantHat(save, 'disco');
  if (explorationComplete(save.discoveries)) grantHat(save, 'sausage');
}

/**
 * The save as it stands after an attempt: bests raised, the attempt pushed onto
 * the recent five, and any milestone it crossed granted. The argument is left
 * untouched — every array the result shares with it is copied first.
 */
export function finishRound(old: SaveData, s: GameState): SaveData {
  const save = {
    ...old,
    rounds: old.rounds + 1,
    controlsSeen: true,
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
  recordDiscovery(save, s);
  unlockRelics(save);
  recordLanding(save, s);
  awardDistanceHats(save, s);
  awardSkillHats(save, s);
  return save;
}
