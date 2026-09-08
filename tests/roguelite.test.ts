import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRun,
  beginAttempt,
  settleAttempt,
  takeRelic,
  nextStage,
  objective,
  challengeUrl,
  parseChallenge,
  offers,
  buyEquipment,
  price,
  dailyKey,
} from '../lib/game/run';
import {
  CONTENT_VERSION,
  RELICS,
  WORLDS,
  modifiers,
  synergies,
} from '../lib/game/content';
import { createGame } from '../lib/game/simulation';
import { CrashWorld, initPhysics } from '../lib/game/crash';
import { readSave, defaultSave, STORAGE_KEY } from '../lib/game/storage';
const ids = RELICS.map((r) => r.id);
const good = {
  distance: 800,
  style: 400,
  havoc: 2000,
  failed: false,
  bossHits: 12,
  disaster: 'An incident',
};
void test('a tour settles nine events exactly once, progresses acts and finishes', () => {
  const run = newRun('tour', 12);
  for (let i = 0; i < 9; i++) {
    assert.equal(run.stage, i);
    assert.equal(beginAttempt(run), true);
    assert.equal(settleAttempt(run, good, ids), true);
    const score = run.score;
    assert.equal(settleAttempt(run, good, ids), false);
    assert.equal(run.score, score);
    if (i < 8) {
      assert.equal(run.status, 'pitstop');
      const id = run.offers[0];
      assert.equal(takeRelic(run, id, run.passives[0]), true);
      assert.equal(nextStage(run), true);
    }
  }
  assert.equal(run.status, 'won');
  assert.equal(run.history.length, 9);
  assert.equal(run.insurance, 3);
});
void test('failure spends insurance and permits the same event; zero ends run', () => {
  const run = newRun('tour', 4);
  for (let i = 0; i < 3; i++) {
    beginAttempt(run);
    settleAttempt(run, { ...good, distance: 0, failed: true }, ids);
    assert.equal(run.stage, 0);
    assert.equal(run.history.length, 0);
    assert.equal(run.insurance, 2 - i);
  }
  assert.equal(run.status, 'lost');
  assert.equal(beginAttempt(run), false);
});
void test('four passive slots require an explicit replacement; one reward per stop', () => {
  const run = newRun('tour', 5);
  run.status = 'pitstop';
  run.passives = ['beans', 'wings', 'rocket', 'feather'];
  run.offers = ['rubber', 'honk', 'ghost'];
  assert.equal(takeRelic(run, 'rubber'), false);
  assert.equal(takeRelic(run, 'rubber', 'beans'), true);
  assert.deepEqual(run.passives, ['rubber', 'wings', 'rocket', 'feather']);
  assert.equal(takeRelic(run, 'honk'), false);
});
void test('daily equipment choices are reproducible and independent of local unlocks', () => {
  const a = newRun('daily', 123),
    b = newRun('daily', 123);
  assert.deepEqual(offers(a, []), offers(b, ids));
  assert.notDeepEqual(offers(newRun('daily', 125), ids), offers(a, ids));
});
void test('all eight synergies activate only for their actual equipment pair', () => {
  assert.equal(synergies(ids).length, 8);
  assert.equal(synergies([]).length, 0);
  assert.equal(synergies(['magnet', 'blackhole'])[0].id, 'junk');
  assert.equal(modifiers(['wings', 'feather']).maxFlaps, 6);
});
void test('save migration retains v1 records and protects against invalid run data', () => {
  const old = {
    ...defaultSave(),
    version: 1,
    best: 321,
    hats: ['helmet', 'party'],
  };
  const migrated = readSave({
    getItem: (k) => (k === 'hoof-and-yeet:v1' ? JSON.stringify(old) : null),
  });
  assert.equal(migrated.best, 321);
  assert.equal(migrated.version, 2);
  assert.ok(migrated.hats.includes('party'));
  assert.equal(
    readSave({
      getItem: () =>
        JSON.stringify({ ...defaultSave(), run: { version: 2, stage: 900 } }),
    }).run,
    null,
  );
  const run = newRun('tour', 123);
  beginAttempt(run);
  const saved = { ...defaultSave(), run };
  assert.equal(
    readSave({
      getItem: (k) => (k === STORAGE_KEY ? JSON.stringify(saved) : null),
    }).run?.status,
    'briefing',
  );
});
void test('challenge descriptors reject untrusted versions and seeds', () => {
  const run = newRun('daily', 123, true);
  run.score = 1200;
  const parsed = parseChallenge(
    new URL(challengeUrl(run, 'https://example.com')).search,
  );
  assert.deepEqual(parsed, {
    seed: 123,
    assisted: true,
    target: 1200,
    mode: 'daily',
    rules: 'standard',
    date: undefined,
    pool: ids,
  });
  for (const search of [
    `?v=${CONTENT_VERSION}&seed=-1`,
    '?v=99&seed=123',
    `?v=${CONTENT_VERSION}&seed=1.5`,
    `?v=${CONTENT_VERSION}&seed=NaN`,
    `?v=${CONTENT_VERSION}&seed=2&target=Infinity`,
    `?v=${CONTENT_VERSION}&mode=tour&seed=123&pool=0.0.0.0.0`,
    `?v=${CONTENT_VERSION}&mode=tour&seed=123&pool=0.1.2.3.3`,
  ])
    assert.equal(parseChallenge(search), null);
});
void test('all boss objectives require distance, havoc and real boss contacts', () => {
  const r = newRun('tour', 1);
  r.stage = 2;
  const goal = objective(r);
  assert.ok(goal.boss && goal.bossHits > 0 && goal.havoc > 0);
  beginAttempt(r);
  settleAttempt(r, { ...good, bossHits: 0 }, ids);
  assert.equal(r.status, 'briefing');
});
void test('Rapier crash does not award the initial scenery settling or boss movement', async () => {
  await initPhysics();
  const s = createGame();
  s.boss = true;
  s.vx = 0;
  s.vy = 0;
  const c = new CrashWorld(s);
  for (let i = 0; i < 25; i++) c.step(1 / 120);
  const f = c.snapshot();
  assert.equal(f.havoc, 0);
  assert.equal(f.bossHits, 0);
  c.dispose();
});
void test('panic resources cannot be spammed and every ability is single-use', async () => {
  await initPhysics();
  for (const ability of [
    'eject',
    'honk',
    'ghost',
    'blackhole',
    'spring',
    'dynamite',
  ] as const) {
    const s = createGame();
    s.ability = ability;
    s.vx = 650;
    s.vy = 550;
    const c = new CrashWorld(s);
    c.action('primary');
    c.action('primary');
    assert.equal(c.snapshot().kicks, 2);
    c.action('secondary');
    assert.equal(c.snapshot().abilityReady, false);
    const count = c.drain().length;
    c.action('secondary');
    assert.equal(c.drain().length, 0);
    assert.ok(count > 0);
    for (let i = 0; i < 120; i++) c.step(1 / 120);
    assert.ok(
      c
        .snapshot()
        .bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)),
    );
    c.dispose();
  }
});
void test('all 24 crash setups remain bounded, finite, and emit unique event ids', async () => {
  await initPhysics();
  for (const w of WORLDS)
    for (let d = 0; d < 4; d++) {
      const s = createGame();
      s.world = w.id;
      s.disaster = d;
      s.vx = 700;
      s.vy = 450;
      s.mod = modifiers([], w.id);
      const c = new CrashWorld(s),
        events: string[] = [];
      for (let i = 0; i < 1200; i++) {
        if (i === 80) c.action('primary');
        if (i === 180) c.action('secondary');
        c.step(1 / 120);
        events.push(...c.drain().map((e) => e.id!));
      }
      const frame = c.snapshot();
      assert.ok(frame.bodies.length <= 80);
      assert.ok(
        frame.bodies.every((b) => Number.isFinite(b.x) && Number.isFinite(b.y)),
      );
      assert.equal(events.length, new Set(events).size);
      c.dispose();
    }
});

void test('saved mid-attempt restores the exact seed and loadout at the same stage', () => {
  const save = defaultSave(),
    run = newRun('tour', 987, true);
  for (let stage = 0; stage < 4; stage++) {
    beginAttempt(run);
    settleAttempt(run, good, ids);
    takeRelic(run, run.offers[0], run.passives[0]);
    nextStage(run);
  }
  run.world = 'office';
  run.passives = ['beans', 'rubber'];
  run.ability = 'honk';
  beginAttempt(run);
  save.run = run;
  const restored = readSave({
    getItem: (k) => (k === STORAGE_KEY ? JSON.stringify(save) : null),
  });
  assert.equal(restored.run?.status, 'briefing');
  assert.equal(restored.run?.stage, 4);
  assert.equal(restored.run?.seed, 987);
  assert.deepEqual(restored.run?.passives, run.passives);
  assert.equal(restored.run?.ability, 'honk');
  assert.equal(restored.run?.assisted, true);
});
void test('six boss motion profiles are distinct and impacts provide exact-clock effects', async () => {
  await initPhysics();
  const bossPositions = [];
  for (const w of WORLDS) {
    const s = createGame();
    Object.assign(s, {
      world: w.id,
      boss: true,
      vx: 720,
      vy: 660,
      mod: modifiers([], w.id),
      impactX: 2000,
    });
    const c = new CrashWorld(s);
    const events = [];
    for (let i = 0; i < 360; i++) {
      c.step(1 / 120);
      events.push(...c.drain());
    }
    const b = c.snapshot().bodies.find((b) => b.boss)!;
    bossPositions.push([b.x.toFixed(1), b.y.toFixed(1)].join(':'));
    assert.ok(events.some((e) => e.freeze && e.time));
    assert.ok(
      events.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)),
    );
    c.dispose();
  }
  assert.equal(new Set(bossPositions).size, 6);
});

void test('malformed checkpoint contents cannot create broken routes or equipment screens', () => {
  const run = newRun('tour', 22);
  beginAttempt(run);
  for (const invalid of [
    { offers: ['missing-relic'] },
    { passives: ['beans', 'beans'] },
    { route: ['afterlife'] },
    { world: 'moon' },
    { insurance: 1.5 },
    { history: [null] },
    { result: { distance: 'many' } },
  ]) {
    const data = { ...defaultSave(), best: 987, run: { ...run, ...invalid } };
    const restored = readSave({ getItem: () => JSON.stringify(data) });
    assert.equal(restored.run, null);
    assert.equal(
      restored.best,
      987,
      'retain records while rejecting the broken checkpoint',
    );
  }
});

void test('paid replacement charges salvage once and only after the replacement is valid', () => {
  const run = newRun('tour', 55);
  run.status = 'pitstop';
  run.rewardTaken = true;
  run.passives = ['beans', 'rubber', 'wings', 'magnet'];
  run.offers = ['feather'];
  run.salvage = 200;
  assert.equal(buyEquipment(run, 'feather'), false);
  assert.equal(run.salvage, 200);
  assert.equal(buyEquipment(run, 'feather', 'beans'), true);
  assert.equal(run.salvage, 200 - price(run, 'equipment'));
  const paid = run.salvage;
  assert.equal(buyEquipment(run, 'feather', 'rubber'), false);
  assert.equal(run.salvage, paid);
  assert.equal(run.rewardTaken, true);
});

void test('daily dates survive midnight, friend links and checkpoints without recording a different day', async () => {
  const { dailyRecordKey, validDailyDate } = await import('../lib/game/run');
  const { dailySeed } = await import('../lib/game/content');
  const day = '2026-09-07';
  const run = newRun('daily', undefined, true, day);
  assert.equal(run.seed, dailySeed(new Date(`${day}T23:59:59Z`)));
  assert.equal(dailyRecordKey(run), dailyKey(day, true));
  const parsed = parseChallenge(
    new URL(challengeUrl(run, 'https://horse.test')).search,
  )!;
  assert.equal(parsed.date, day);
  const friend = newRun(parsed.mode, parsed.seed, parsed.assisted, parsed.date);
  assert.equal(dailyRecordKey(friend), dailyKey(day, true));
  assert.equal(
    parseChallenge(
      `?v=${CONTENT_VERSION}&mode=daily&seed=${run.seed}&date=2026-09-08`,
    ),
    null,
  );
  assert.equal(validDailyDate('2026-02-30', run.seed), false);
  assert.equal(dailyRecordKey(newRun('daily', 123)), null);
  const restored = readSave({
    getItem: () => JSON.stringify({ ...defaultSave(), run }),
  });
  assert.equal(dailyRecordKey(restored.run!), dailyKey(day, true));
});

void test('pony appearances follow permanent progress and migrate old saves safely', async () => {
  const { ponyUnlocked } = await import('../lib/game/cosmetics');
  assert.equal(ponyUnlocked('bubblegum', { rounds: 2, wins: 0 }), false);
  assert.equal(ponyUnlocked('bubblegum', { rounds: 3, wins: 0 }), true);
  assert.equal(ponyUnlocked('midnight', { rounds: 99, wins: 0 }), false);
  assert.equal(ponyUnlocked('midnight', { rounds: 9, wins: 1 }), true);
  for (const [pony, rounds, expected] of [
    ['pistachio', 8, 'pistachio'],
    ['pistachio', 2, 'buttercup'],
    ['unknown', 8, 'buttercup'],
  ] as const) {
    const save = readSave({
      getItem: () => JSON.stringify({ ...defaultSave(), pony, rounds }),
    });
    assert.equal(save.pony, expected);
  }
  const old = readSave({
    getItem: () => JSON.stringify({ version: 1, best: 420, hats: ['space'] }),
  });
  assert.equal(old.pony, 'buttercup');
  assert.equal(old.best, 420);
  assert.ok(old.hats.includes('space'));
});

void test('an earlier daily keeps progress as a tour and its records stay separate from the current course', async () => {
  const { dailyRecordKey } = await import('../lib/game/run');
  const day = '2026-09-07';
  const run = newRun('daily', undefined, true, day);
  beginAttempt(run);
  settleAttempt(run, good, ids);
  takeRelic(run, run.offers[0]);
  nextStage(run);
  beginAttempt(run);
  const checkpoint = { ...run, contentVersion: 2, target: 12345 };
  const source = {
    ...defaultSave(),
    best: 987,
    hats: ['helmet', 'crown'],
    run: checkpoint,
    daily: { [day]: 8000, [`${day}:assisted`]: 9000, [dailyKey(day)]: 6000 },
  };
  const saved = readSave({ getItem: () => JSON.stringify(source) });
  assert.equal(saved.run?.mode, 'tour');
  assert.equal(saved.run?.updatedDaily, true);
  assert.equal(saved.run?.status, 'briefing');
  assert.equal(saved.run?.contentVersion, CONTENT_VERSION);
  assert.equal(saved.run?.target, undefined);
  assert.equal(dailyRecordKey(saved.run!), null);
  for (const key of [
    'seed',
    'stage',
    'salvage',
    'insurance',
    'passives',
    'ability',
    'route',
    'history',
  ] as const)
    assert.deepEqual(saved.run?.[key], checkpoint[key]);
  assert.equal(saved.best, 987);
  assert.deepEqual(saved.hats, ['helmet', 'crown']);
  assert.deepEqual(saved.daily, {
    [`v2:${day}`]: 8000,
    [`v2:${day}:assisted`]: 9000,
    [dailyKey(day)]: 6000,
  });
  assert.deepEqual(readSave({ getItem: () => JSON.stringify(saved) }), saved);
  assert.equal(parseChallenge(`?v=2&mode=daily&seed=${run.seed}`), null);
});
