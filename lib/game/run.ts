import {
  CONTENT_VERSION,
  RELICS,
  WORLDS,
  dailySeed,
  modifiers,
  random,
  type WorldId,
} from './content';
import {
  insuranceCapacity,
  isChallengeRule,
  type ChallengeRule,
} from './challenge-rules';
export type RunMode = 'tour' | 'daily' | 'quick';
export interface RunResult {
  distance: number;
  style: number;
  havoc: number;
  failed: boolean;
  bossHits: number;
  disaster: string;
}
export interface RunState {
  version: 2;
  contentVersion: number;
  updatedDaily?: boolean;
  mode: RunMode;
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
export function dailyRecordKey(run: RunState) {
  return run.mode === 'daily' &&
    run.contentVersion === CONTENT_VERSION &&
    validDailyDate(run.dailyDate, run.seed)
    ? dailyKey(run.dailyDate, run.assisted)
    : null;
}
export function dailyKey(date: string, assisted = false) {
  return `v${CONTENT_VERSION}:${date}${assisted ? ':assisted' : ''}`;
}
export function newRun(
  mode: RunMode,
  seed?: number,
  assisted = false,
  date = new Date().toISOString().slice(0, 10),
  rules: ChallengeRule = 'standard',
): RunState {
  if (mode !== 'tour') rules = 'standard';
  seed ??=
    mode === 'daily'
      ? dailySeed(new Date(`${date}T00:00:00.000Z`))
      : Math.floor(Math.random() * 0xffffffff);
  return {
    version: 2,
    contentVersion: CONTENT_VERSION,
    updatedDaily: false,
    mode,
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
export function objective(run: RunState) {
  const act = Math.floor(run.stage / 3),
    boss = run.stage % 3 === 2 && run.mode !== 'quick';
  return {
    boss,
    distance:
      run.mode === 'quick'
        ? 0
        : [120, 180, 240, 240, 280, 320, 320, 380, 420][run.stage],
    havoc: boss ? 400 + act * 200 : 0,
    bossHits: boss ? 3 + act * 2 : 0,
  };
}
export function availableWorlds(run: RunState) {
  return WORLDS.filter((w) => w.act === Math.floor(run.stage / 3));
}
export function items(run: RunState) {
  return [...run.passives, run.ability];
}
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
  const clear =
    !result.failed &&
    result.distance >= goal.distance &&
    result.havoc >= goal.havoc &&
    result.bossHits >= goal.bossHits;
  if (run.mode === 'quick') {
    run.status = 'won';
    run.score = Math.round(result.distance * 10 + result.style + result.havoc);
    return true;
  }
  if (!clear) {
    if (run.passives.includes('lucky') && !run.luckyUsed) run.luckyUsed = true;
    else run.insurance--;
    run.status = run.insurance <= 0 ? 'lost' : 'briefing';
    return true;
  }
  run.history.push({ ...result });
  run.score += Math.round(result.distance * 10 + result.style + result.havoc);
  run.salvage += Math.round(
    (35 + result.havoc / 30) * modifiers(items(run), run.world).salvage,
  );
  run.status = run.stage === 8 ? 'won' : 'pitstop';
  run.offers = offers(run, unlocked);
  run.rewardTaken = false;
  return true;
}
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
export function price(
  run: RunState,
  type: 'insurance' | 'reroll' | 'equipment',
) {
  return Math.ceil(
    (type === 'insurance' ? 70 : type === 'equipment' ? 90 : 25) *
      (run.passives.includes('discount') ? 0.7 : 1),
  );
}
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
export function reroll(run: RunState, unlocked: string[]) {
  const cost = price(run, 'reroll');
  if (run.status !== 'pitstop' || run.rewardTaken || run.salvage < cost)
    return false;
  run.salvage -= cost;
  run.rerolls++;
  run.offers = offers(run, unlocked);
  return true;
}
export function nextStage(run: RunState) {
  if (run.status !== 'pitstop' || !run.rewardTaken) return false;
  run.stage++;
  run.status = 'briefing';
  run.result = null;
  if (!availableWorlds(run).some((w) => w.id === run.world))
    run.world = availableWorlds(run)[0].id;
  return true;
}
export function challengeUrl(run: RunState, origin: string) {
  const u = new URL(origin);
  u.search = '';
  u.searchParams.set('v', String(CONTENT_VERSION));
  u.searchParams.set('mode', run.mode);
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
export function parseChallenge(search: string) {
  const p = new URLSearchParams(search);
  if (!p.has('seed')) return null;
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
  const mode = p.get('mode') ?? 'daily';
  if (!['daily', 'tour', 'quick'].includes(mode)) return null;
  const rules = p.get('rules') ?? 'standard';
  if (!isChallengeRule(rules) || (mode !== 'tour' && rules !== 'standard'))
    return null;
  const date = p.get('date');
  if (date && (mode !== 'daily' || !validDailyDate(date, seed))) return null;
  const indices = (p.get('pool') ?? '').split('.').filter(Boolean).map(Number);
  if (
    mode === 'tour' &&
    (indices.length < 5 ||
      indices.length > 30 ||
      new Set(indices).size !== indices.length ||
      indices.some((i) => !Number.isInteger(i) || i < 0 || i >= RELICS.length))
  )
    return null;
  return {
    seed,
    assisted: p.get('assist') === '1',
    target,
    mode: mode as RunMode,
    rules,
    date: date ?? undefined,
    pool:
      mode === 'tour'
        ? indices.map((i) => RELICS[i].id)
        : RELICS.map((r) => r.id),
  };
}
