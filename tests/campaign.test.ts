import test from 'node:test';
import assert from 'node:assert/strict';
import {
  campaignItinerary,
  campaignStep,
  validCampaignRoute,
} from '../lib/game/campaign';
import {
  availableWorlds,
  beginAttempt,
  challengeUrl,
  newRun,
  nextStage,
  objective,
  parseChallenge,
  settleAttempt,
  takeRelic,
} from '../lib/game/run';
import { CONTENT_VERSION, RELICS } from '../lib/game/content';
import { defaultSave, readSave, writeSave } from '../lib/game/storage';

const ids = RELICS.map((r) => r.id);
const good = {
  distance: 800,
  style: 1000,
  havoc: 2000,
  failed: false,
  bossHits: 12,
  disaster: 'A reasonable performance',
};
const bad = { ...good, failed: true, distance: 0 };
const grand = () => newRun('tour', 118, false, undefined, 'standard', 'grand');
const restore = (run: ReturnType<typeof newRun>) =>
  readSave({
    getItem: () => JSON.stringify({ ...defaultSave(), run, campaign: 'grand' }),
  });

void test('Grand Tour visits all six worlds and six bosses in the selected order, completing only event 18', () => {
  for (const chooseLast of [false, true]) {
    const run = grand();
    const stops: string[] = [],
      bosses: string[] = [];
    for (let stage = 0; stage < 18; stage++) {
      const step = campaignStep(run);
      const worlds = availableWorlds(run);
      if (stage % 6 === 0) assert.equal(worlds.length, 2);
      else assert.equal(worlds.length, 1);
      const world = worlds[chooseLast ? worlds.length - 1 : 0].id;
      if (stage % 3 === 0) stops.push(world);
      if (step.boss) bosses.push(world);
      assert.equal(beginAttempt(run, world), true);
      assert.equal(validCampaignRoute(run), true);
      assert.equal(
        objective(run).distance,
        [
          120, 180, 240, 160, 220, 280, 240, 280, 320, 280, 320, 360, 320, 380,
          420, 360, 420, 460,
        ][stage],
      );
      assert.equal(
        objective(run).bossHits,
        step.boss ? 3 + Math.floor(stage / 6) * 2 : 0,
      );
      assert.equal(settleAttempt(run, good, ids), true);
      const settled = structuredClone(run);
      assert.equal(settleAttempt(run, good, ids), false);
      assert.deepEqual(
        run,
        settled,
        'no duplicate score, heal, history, or offer',
      );
      if (stage < 17) {
        assert.equal(run.status, 'pitstop');
        assert.equal(
          restore(run).run?.stage,
          stage,
          'every checkpoint survives',
        );
        assert.equal(takeRelic(run, run.offers[0], run.passives[0]), true);
        assert.equal(nextStage(run), true);
        assert.equal(
          restore(run).run?.stage,
          stage + 1,
          'every next-stage starting state survives',
        );
      }
    }
    assert.deepEqual(
      stops,
      chooseLast
        ? ['candy', 'farm', 'office', 'carnival', 'afterlife', 'moon']
        : ['farm', 'candy', 'carnival', 'office', 'moon', 'afterlife'],
    );
    assert.deepEqual(bosses, stops);
    assert.equal(run.status, 'won');
    assert.equal(run.history.length, 18);
    assert.equal(run.score, 18 * 11000);
  }
});

void test('Grand boss healing is earned once after all objectives, respects cap and uninsured rules', () => {
  for (const [campaign, rules, heal] of [
    ['grand', 'standard', true],
    ['classic', 'standard', false],
    ['grand', 'uninsured', false],
  ] as const) {
    const run = newRun('tour', 118, false, undefined, rules, campaign);
    run.stage = 2;
    run.route = ['farm', 'farm'];
    run.insurance = rules === 'uninsured' ? 1 : 2;
    beginAttempt(run);
    settleAttempt(run, good, ids);
    assert.equal(run.insurance, rules === 'uninsured' ? 1 : heal ? 3 : 2);
    settleAttempt(run, good, ids);
    assert.equal(run.insurance, rules === 'uninsured' ? 1 : heal ? 3 : 2);
  }
  const run = grand();
  run.stage = 2;
  run.route = ['farm', 'farm'];
  beginAttempt(run);
  settleAttempt(run, { ...good, bossHits: 2 }, ids);
  assert.equal(run.insurance, 2, 'missing boss contacts spends a stamp');
  assert.equal(run.status, 'briefing');
  beginAttempt(run);
  settleAttempt(run, good, ids);
  assert.equal(run.insurance, 3, 'a successful retry earns the recovery');
});

void test('an interrupted late Grand attempt restores seed, route, loadout and exact starting state', () => {
  const run = grand();
  for (let stage = 0; stage < 13; stage++) {
    beginAttempt(run);
    settleAttempt(run, good, ids);
    takeRelic(run, run.offers[0], run.passives[0]);
    nextStage(run);
  }
  beginAttempt(run);
  const saved = restore(run);
  assert.equal(saved.campaign, 'grand');
  assert.equal(saved.run?.status, 'briefing');
  assert.deepEqual(saved.run, {
    ...run,
    status: 'briefing',
    target: undefined,
  });
  assert.equal(
    writeSave(saved, {
      setItem() {
        throw new Error('quota');
      },
    }),
    false,
  );
  assert.equal(
    readSave({
      getItem() {
        throw new Error('denied');
      },
    }).campaign,
    'classic',
  );
  const before = saved.run!.insurance;
  beginAttempt(saved.run!);
  settleAttempt(saved.run!, bad, ids);
  assert.equal(saved.run!.insurance, before - 1);
  assert.equal(saved.run!.stage, 13);
});

void test('legacy classic checkpoints stay classic and malformed Grand routes are rejected without losing records', () => {
  const run = newRun('tour', 18);
  beginAttempt(run);
  const legacy = { ...run, campaign: undefined, contentVersion: 5 };
  const migrated = readSave({
    getItem: () => JSON.stringify({ ...defaultSave(), run: legacy }),
  });
  assert.equal(migrated.run?.campaign, 'classic');
  assert.equal(migrated.run?.contentVersion, CONTENT_VERSION);
  assert.equal(campaignStep(migrated.run!).events, 9);
  for (const mutation of [
    { campaign: 'endless' },
    { stage: 18 },
    { mode: 'daily' },
    {
      stage: 3,
      route: ['farm', 'farm', 'farm', 'farm'],
      world: 'farm',
      history: [good, good, good],
    },
    { stage: 2, route: ['farm', 'candy', 'farm'], history: [good, good] },
    { stage: 6, route: [], world: 'office', history: Array(6).fill(good) },
  ]) {
    const invalid = { ...grand(), ...mutation };
    const saved = readSave({
      getItem: () =>
        JSON.stringify({ ...defaultSave(), best: 890, run: invalid }),
    });
    assert.equal(saved.run, null, JSON.stringify(mutation));
    assert.equal(saved.best, 890);
  }
});

void test('friend descriptors preserve campaign and pool, while Daily and Quick cannot inherit Grand rules', () => {
  const run = grand();
  run.pool = ids.slice(0, 7);
  run.score = 1000;
  const parsed = parseChallenge(
    new URL(challengeUrl(run, 'https://horse.test')).search,
  )!;
  assert.equal(parsed.campaign, 'grand');
  assert.deepEqual(parsed.pool, run.pool);
  const friend = newRun(
    parsed.mode,
    parsed.seed,
    parsed.assisted,
    parsed.date,
    parsed.rules,
    parsed.campaign,
  );
  assert.deepEqual(availableWorlds(friend), availableWorlds(run));
  assert.equal(campaignStep(friend).events, 18);
  for (const mode of ['daily', 'quick'] as const) {
    const other = newRun(mode, 118, false, undefined, 'standard', 'grand');
    assert.equal(other.campaign, 'classic');
    const u = new URL(challengeUrl(other, 'https://horse.test'));
    u.searchParams.set('campaign', 'grand');
    assert.equal(parseChallenge(u.search), null);
  }
});

void test('route progress predicts the paired stop and marks completed events without a parallel route state', () => {
  const run = grand();
  beginAttempt(run, 'candy');
  let route = campaignItinerary(run);
  assert.equal(route[0].world, 'candy');
  assert.equal(route[1].world, 'farm');
  assert.equal(route[2].world, undefined);
  for (let i = 0; i < 3; i++) {
    settleAttempt(run, good, ids);
    takeRelic(run, run.offers[0], run.passives[0]);
    nextStage(run);
    if (i < 2) beginAttempt(run);
  }
  route = campaignItinerary(run);
  assert.equal(route[0].state, 'done');
  assert.equal(route[1].state, 'current');
  assert.deepEqual(
    availableWorlds(run).map((w) => w.id),
    ['farm'],
  );
  assert.equal(
    beginAttempt(run, 'candy'),
    false,
    'completed world cannot be replayed as its paired stop',
  );
});
