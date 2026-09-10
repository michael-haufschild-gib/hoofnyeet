import {
  CONTENT_VERSION,
  RELICS,
  dailySeed,
  modifiers,
  random,
  type WorldId,
} from './content';
import {
  insuranceCapacity,
  isChallengeRule,
  type ChallengeRule,
} from './catalogue/challenge-rules';
import {
  campaignOf,
  campaignStep,
  campaignWorlds,
  isCampaign,
  type Campaign,
} from './campaign';
/**
 * Which structure a run follows: a multi-event tour, the shared daily seed, or
 * a single throwaway event. Persisted in saves and share links verbatim.
 */
export type RunMode = 'tour' | 'daily' | 'quick';

/**
 * What one attempt achieved. `distance` is in world units, `style` and `havoc`
 * are raw point totals, `bossHits` counts landed blows on the act's boss,
 * `failed` marks a wipeout, and `disaster` is the comic headline to show.
 */
export interface RunResult {
  distance: number;
  style: number;
  havoc: number;
  failed: boolean;
  bossHits: number;
  disaster: string;
}
/**
 * The entire persisted run. `version` and `contentVersion` gate migration;
 * `seed` is the uint32 the generators branch from; `stage` counts cleared
 * events from 0 and `route` records the world each stage was played on;
 * `passives` plus `ability` are the equipped relics and `pool` the ids the
 * offer draw may use; `insurance` is remaining retries and `salvage` the
 * pitstop currency; `attempt` and `settledAttempt` make settlement idempotent.
 */
export interface RunState {
  version: 2;
  contentVersion: number;
  updatedDaily?: boolean;
  mode: RunMode;
  campaign: Campaign;
  seed: number;
  stage: number;
  world: WorldId;
  route: WorldId[];
  passives: string[];
  pool: string[];
  ability: string;
  insurance: number;
  salvage: number;
  score: number;
  status: 'briefing' | 'playing' | 'pitstop' | 'won' | 'lost';
  offers: string[];
  rewardTaken: boolean;
  result: RunResult | null;
  history: RunResult[];
  attempt: number;
  settledAttempt: number;
  rerolls: number;
  assisted: boolean;
  luckyUsed: boolean;
  target?: number;
  dailyDate?: string;
  rules: ChallengeRule;
}
/**
 * Narrows untrusted input to a `YYYY-MM-DD` UTC date that both round-trips
 * through `Date` and actually derives `seed`. Guards saves and share links
 * against a date and seed that were never generated together.
 */
export function validDailyDate(date: unknown, seed: number): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date &&
    dailySeed(parsed) === seed
  );
}
/**
 * Storage key this run's best daily score belongs under, or null when the run
 * is not a current-content daily whose date matches its seed.
 */
export function dailyRecordKey(run: RunState) {
  return run.mode === 'daily' &&
    run.contentVersion === CONTENT_VERSION &&
    validDailyDate(run.dailyDate, run.seed)
    ? dailyKey(run.dailyDate, run.assisted)
    : null;
}
/**
 * Storage key for one calendar day's leaderboard. Assisted play is recorded
 * separately so its scores never displace an unassisted best.
 */
export function dailyKey(date: string, assisted = false) {
  return `v${CONTENT_VERSION}:${date}${assisted ? ':assisted' : ''}`;
}
/**
 * Storage key this run's best tour score belongs under, or null when the run
 * is not a tour built from the current content revision. Tour length, rule set
 * and assistance each get their own key.
 */
export function tourRecordKey(run: RunState) {
  return run.mode === 'tour' && run.contentVersion === CONTENT_VERSION
    ? `v${CONTENT_VERSION}:${campaignOf(run)}:${run.rules}${run.assisted ? ':assisted' : ''}`
    : null;
}
/**
 * Reads a stored tour key back into its parts, or null when any segment is
 * unrecognised or the revision falls outside the readable range of 6 to the
 * current content version. Never throws on malformed input.
 */
export function parseTourRecordKey(key: string) {
  const [revision, campaign, rules, assisted, ...extra] = key.split(':');
  const version = Number(revision?.slice(1));
  if (
    revision !== `v${version}` ||
    !Number.isInteger(version) ||
    version < 6 ||
    version > CONTENT_VERSION ||
    !isCampaign(campaign) ||
    !isChallengeRule(rules) ||
    (assisted !== undefined && assisted !== 'assisted') ||
    extra.length
  )
    return null;
  return { version, campaign, rules, assisted: assisted === 'assisted' };
}
/**
 * Returns `records` with this run's score stored, if the run is a completed
 * tour whose score is a safe integer and beats the existing entry. Otherwise
 * the same object comes back; the input is never mutated.
 */
export function recordTourBest(records: Record<string, number>, run: RunState) {
  const key = tourRecordKey(run);
  if (
    !key ||
    run.status !== 'won' ||
    run.history.length !== campaignStep(run).events ||
    !Number.isSafeInteger(run.score) ||
    run.score <= (records[key] ?? 0)
  )
    return records;
  return { ...records, [key]: run.score };
}
/**
 * A fresh run at the briefing of its first event. Rule set and tour length
 * apply to tour mode only and are forced back to the defaults elsewhere. An
 * omitted `seed` is derived from `date` for a daily and drawn at random
 * otherwise; either way it is stored as a uint32.
 */
export function newRun(
  mode: RunMode,
  seed?: number,
  assisted = false,
  date = new Date().toISOString().slice(0, 10),
  rules: ChallengeRule = 'standard',
  campaign: Campaign = 'classic',
): RunState {
  if (mode !== 'tour') rules = 'standard';
  if (mode !== 'tour') campaign = 'classic';
  seed ??=
    mode === 'daily'
      ? dailySeed(new Date(`${date}T00:00:00.000Z`))
      : Math.floor(Math.random() * 0xffffffff);
  return {
    version: 2,
    contentVersion: CONTENT_VERSION,
    updatedDaily: false,
    mode,
    campaign,
    seed: seed >>> 0,
    stage: 0,
    world: 'farm',
    route: [],
    passives: [],
    pool: RELICS.map((r) => r.id),
    ability: 'spring',
    insurance: insuranceCapacity(rules),
    salvage: 0,
    score: 0,
    status: 'briefing',
    offers: [],
    rewardTaken: false,
    result: null,
    history: [],
    attempt: 0,
    settledAttempt: -1,
    rerolls: 0,
    assisted,
    luckyUsed: false,
    rules,
    dailyDate:
      mode === 'daily' && validDailyDate(date, seed) ? date : undefined,
  };
}
/**
 * What the current event must produce to count as cleared: a `distance` in
 * world units that climbs across the nine-event ladder (with a Grand Tour
 * surcharge on second legs), and, on a boss event, minimum `havoc` points and
 * `bossHits`. Quick play demands nothing.
 */
export function objective(run: RunState) {
  const { act, leg, eventInLeg, boss, campaign } = campaignStep(run);
  return {
    boss,
    distance:
      run.mode === 'quick'
        ? 0
        : [120, 180, 240, 240, 280, 320, 320, 380, 420][act * 3 + eventInLeg] +
          (campaign === 'grand' && leg % 2 === 1 ? 40 : 0),
    havoc: boss ? 400 + act * 200 : 0,
    bossHits: boss ? 3 + act * 2 : 0,
  };
}
/** Courses the player may choose from for the current event. */
export function availableWorlds(run: RunState) {
  return campaignWorlds(run);
}
/** Every equipped relic id: the passives followed by the active ability. */
export function items(run: RunState) {
  return [...run.passives, run.ability];
}
/**
 * Three relic ids to offer at the pitstop, drawn deterministically from the
 * run seed, stage and reroll count, so the same run always offers the same
 * cards. Relics already equipped are excluded, as are ids outside the run's
 * pool — or outside `unlocked` when the run has no pool. Daily runs draw from
 * the full catalogue regardless of what the player has unlocked.
 */
export function offers(run: RunState, unlocked: string[]) {
  const rng = random(run.seed + run.stage * 9137 + run.rerolls * 1213);
  const pool = RELICS.filter(
    (r) =>
      !items(run).includes(r.id) &&
      (run.mode === 'daily' || (run.pool ?? unlocked).includes(r.id)),
  );
  return pool
    .map((r) => ({ id: r.id, n: rng() }))
    .sort((a, b) => a.n - b.n)
    .slice(0, 3)
    .map((r) => r.id);
}
/**
 * Starts an attempt on `world`, mutating the run into `playing` and bumping
 * the attempt counter. Returns false, changing nothing, when the run is not
 * waiting to play or the world is not on offer for this event.
 */
export function beginAttempt(run: RunState, world = run.world) {
  if (run.status !== 'briefing' && run.status !== 'playing') return false;
  if (!availableWorlds(run).some((w) => w.id === world) && run.mode !== 'quick')
    return false;
  run.world = world;
  run.route[run.stage] = world;
  run.status = 'playing';
  run.attempt++;
  run.result = null;
  return true;
}
/** The thresholds one attempt is judged against. */
type Objective = ReturnType<typeof objective>;

/** True when the attempt met every part of the event's objective. */
function attemptCleared(result: RunResult, goal: Objective) {
  return (
    !result.failed &&
    result.distance >= goal.distance &&
    result.havoc >= goal.havoc &&
    result.bossHits >= goal.bossHits
  );
}

/** Points one attempt is worth: distance dominates, style and havoc top up. */
function attemptScore(result: RunResult) {
  return Math.round(result.distance * 10 + result.style + result.havoc);
}

/**
 * Books a missed objective, mutating the run. The lucky relic absorbs the
 * first miss of a run; otherwise a policy is spent, and running out of them
 * ends the run rather than returning to the briefing.
 */
function settleFailure(run: RunState) {
  if (run.passives.includes('lucky') && !run.luckyUsed) run.luckyUsed = true;
  else run.insurance--;
  run.status = run.insurance <= 0 ? 'lost' : 'briefing';
}

/**
 * Books a cleared objective, mutating the run: the result joins the history,
 * score and salvage are credited, a Grand Tour boss refunds one policy unless
 * the rules forbid insurance, and the pitstop opens with a fresh offer — or
 * the run is won when this was the final event.
 */
function settleSuccess(
  run: RunState,
  result: RunResult,
  goal: Objective,
  unlocked: string[],
) {
  run.history.push({ ...result });
  run.score += attemptScore(result);
  run.salvage += Math.round(
    (35 + result.havoc / 30) * modifiers(items(run), run.world).salvage,
  );
  if (campaignOf(run) === 'grand' && goal.boss && run.rules !== 'uninsured')
    run.insurance = Math.min(insuranceCapacity(run.rules), run.insurance + 1);
  run.status = run.stage === campaignStep(run).events - 1 ? 'won' : 'pitstop';
  run.offers = offers(run, unlocked);
  run.rewardTaken = false;
}

/**
 * Scores the attempt just played and advances the run, mutating it. Idempotent
 * per attempt: a second call for the same attempt returns false and changes
 * nothing, as does a call while no attempt is in progress. Quick play always
 * ends as won; a tour or daily either banks the result or spends a retry.
 */
export function settleAttempt(
  run: RunState,
  result: RunResult,
  unlocked: string[],
) {
  if (run.status !== 'playing' || run.settledAttempt === run.attempt)
    return false;
  run.settledAttempt = run.attempt;
  run.result = { ...result };
  const goal = objective(run);
  if (run.mode === 'quick') {
    run.status = 'won';
    run.score = attemptScore(result);
  } else if (!attemptCleared(result, goal)) settleFailure(run);
  else settleSuccess(run, result, goal, unlocked);
  return true;
}
/**
 * Equips an offered relic, mutating the run. An active relic replaces the
 * ability; a passive fills a free slot, or replaces the id named by `replace`
 * once all four are full. Returns false, changing nothing, when the pitstop is
 * closed, a reward is already taken, the id was not offered, or no slot and no
 * valid replacement exist.
 */
export function takeRelic(run: RunState, id: string, replace?: string) {
  if (run.status !== 'pitstop' || run.rewardTaken || !run.offers.includes(id))
    return false;
  const relic = RELICS.find((r) => r.id === id);
  if (!relic) return false;
  if (relic.category === 'active') run.ability = id;
  else if (run.passives.length < 4) run.passives.push(id);
  else {
    const i = run.passives.indexOf(replace ?? '');
    if (i < 0) return false;
    run.passives[i] = id;
  }
  run.rewardTaken = true;
  return true;
}
/** Salvage cost of one pitstop purchase, discounted 30% by the relic. */
export function price(
  run: RunState,
  type: 'insurance' | 'reroll' | 'equipment',
) {
  return Math.ceil(
    (type === 'insurance' ? 70 : type === 'equipment' ? 90 : 25) *
      (run.passives.includes('discount') ? 0.7 : 1),
  );
}
/**
 * Spends salvage on a second relic from the same offer, mutating the run.
 * Available only after the free reward has been taken. Returns false, spending
 * nothing, when the run cannot afford it or the relic cannot be equipped.
 */
export function buyEquipment(run: RunState, id: string, replace?: string) {
  const cost = price(run, 'equipment');
  if (
    run.status !== 'pitstop' ||
    !run.rewardTaken ||
    run.salvage < cost ||
    !run.offers.includes(id) ||
    items(run).includes(id)
  )
    return false;
  run.rewardTaken = false;
  const taken = takeRelic(run, id, replace);
  run.rewardTaken = true;
  if (taken) run.salvage -= cost;
  return taken;
}
/**
 * Spends salvage on one retry, mutating the run. Returns false, spending
 * nothing, outside the pitstop, at the rule set's cap, or when short of funds.
 */
export function buyInsurance(run: RunState) {
  const cost = price(run, 'insurance');
  if (
    run.status !== 'pitstop' ||
    run.insurance >= insuranceCapacity(run.rules) ||
    run.salvage < cost
  )
    return false;
  run.salvage -= cost;
  run.insurance++;
  return true;
}
/**
 * Spends salvage to draw a fresh set of offers, mutating the run. Returns
 * false, spending nothing, once the reward is taken or funds are short.
 */
export function reroll(run: RunState, unlocked: string[]) {
  const cost = price(run, 'reroll');
  if (run.status !== 'pitstop' || run.rewardTaken || run.salvage < cost)
    return false;
  run.salvage -= cost;
  run.rerolls++;
  run.offers = offers(run, unlocked);
  return true;
}
/**
 * Closes the pitstop and moves the run to the next event's briefing, mutating
 * it. The selected world falls back to the first available course when the old
 * one no longer belongs to this act. Returns false before a reward is taken.
 */
export function nextStage(run: RunState) {
  if (run.status !== 'pitstop' || !run.rewardTaken) return false;
  run.stage++;
  run.status = 'briefing';
  run.result = null;
  if (!availableWorlds(run).some((w) => w.id === run.world))
    run.world = availableWorlds(run)[0].id;
  return true;
}
/**
 * An absolute URL on `origin` that recreates this run's setup for someone
 * else: content revision, mode, tour length, rule set, daily date, relic pool,
 * seed, assistance, and the score to beat. Any existing query is discarded.
 */
export function challengeUrl(run: RunState, origin: string) {
  const u = new URL(origin);
  u.search = '';
  u.searchParams.set('v', String(CONTENT_VERSION));
  u.searchParams.set('mode', run.mode);
  if (campaignOf(run) === 'grand') u.searchParams.set('campaign', 'grand');
  if (run.rules !== 'standard') u.searchParams.set('rules', run.rules);
  if (run.mode === 'daily' && validDailyDate(run.dailyDate, run.seed))
    u.searchParams.set('date', run.dailyDate);
  if (run.mode === 'tour')
    u.searchParams.set(
      'pool',
      run.pool.map((id) => RELICS.findIndex((r) => r.id === id)).join('.'),
    );
  u.searchParams.set('seed', String(run.seed));
  u.searchParams.set('assist', run.assisted ? '1' : '0');
  if (run.score) u.searchParams.set('target', String(run.score));
  return u.href;
}
/**
 * The seed and target score carried by a challenge link, or null when the
 * revision does not match or either number is outside its accepted range:
 * `seed` a uint32, `target` a finite score of at most one billion.
 */
function challengeNumbers(p: URLSearchParams) {
  const seed = Number(p.get('seed')),
    target = Number(p.get('target') ?? 0);
  if (
    p.get('v') !== String(CONTENT_VERSION) ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff ||
    !Number.isFinite(target) ||
    target < 0 ||
    target > 1e9
  )
    return null;
  return { seed, target };
}

/** The link's run mode, defaulting to daily, or null when unrecognised. */
function challengeMode(p: URLSearchParams) {
  const mode = p.get('mode') ?? 'daily';
  return ['daily', 'tour', 'quick'].includes(mode) ? (mode as RunMode) : null;
}

/**
 * The link's tour length, defaulting to Classic. Null when unrecognised, or
 * when a non-tour link tries to carry anything but the default.
 */
function challengeCampaign(p: URLSearchParams, mode: RunMode) {
  const campaign = p.get('campaign') ?? 'classic';
  if (!isCampaign(campaign)) return null;
  return mode === 'tour' || campaign === 'classic' ? campaign : null;
}

/**
 * The link's rule set, defaulting to standard. Null when unrecognised, or when
 * a non-tour link tries to carry anything but the default.
 */
function challengeRules(p: URLSearchParams, mode: RunMode) {
  const rules = p.get('rules') ?? 'standard';
  if (!isChallengeRule(rules)) return null;
  return mode === 'tour' || rules === 'standard' ? rules : null;
}

/**
 * True when the link either omits a date or carries one that belongs to a
 * daily and derives `seed`. A date on any other mode is a forgery.
 */
function validChallengeDate(date: string | null, mode: RunMode, seed: number) {
  if (!date) return true;
  return mode === 'daily' && validDailyDate(date, seed);
}

/**
 * Relic ids the link's pool decodes to. Non-tour links always use the whole
 * catalogue. A tour pool is encoded as catalogue positions and must hold
 * between 5 and 30 distinct in-range indices; anything else returns null.
 */
function challengePool(p: URLSearchParams, mode: RunMode) {
  const indices = (p.get('pool') ?? '').split('.').filter(Boolean).map(Number);
  if (mode !== 'tour') return RELICS.map((r) => r.id);
  if (
    indices.length < 5 ||
    indices.length > 30 ||
    new Set(indices).size !== indices.length ||
    indices.some((i) => !Number.isInteger(i) || i < 0 || i >= RELICS.length)
  )
    return null;
  return indices.map((i) => RELICS[i].id);
}

/**
 * Reads a challenge link's query string back into the setup it encodes, or
 * null when the seed is absent or any field fails validation. Pure and
 * total: hostile input yields null rather than an exception or a partial run.
 */
export function parseChallenge(search: string) {
  const p = new URLSearchParams(search);
  if (!p.has('seed')) return null;
  const numbers = challengeNumbers(p);
  const mode = challengeMode(p);
  if (!numbers || !mode) return null;
  const campaign = challengeCampaign(p, mode);
  const rules = challengeRules(p, mode);
  const date = p.get('date');
  if (!campaign || !rules || !validChallengeDate(date, mode, numbers.seed))
    return null;
  const pool = challengePool(p, mode);
  if (!pool) return null;
  return {
    seed: numbers.seed,
    assisted: p.get('assist') === '1',
    target: numbers.target,
    mode,
    campaign,
    rules,
    date: date ?? undefined,
    pool,
  };
}
