import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newRun,
  recordTourBest,
  tourRecordKey,
  parseTourRecordKey,
} from '../lib/game/run';
import { CONTENT_VERSION } from '../lib/game/content';
import { defaultSave, readSave, writeSave } from '../lib/game/storage';

const clear = {
  distance: 800,
  style: 1500,
  havoc: 2200,
  failed: false,
  bossHits: 9,
  disaster: 'Encore',
};
function win(campaign: 'classic' | 'grand' = 'grand') {
  const run = newRun('tour', 81, false, undefined, 'standard', campaign);
  run.stage = campaign === 'grand' ? 17 : 8;
  run.history = Array.from({ length: run.stage + 1 }, () => ({ ...clear }));
  run.status = 'won';
  run.score = 212345;
  return run;
}
void test('only a complete winning tour can improve its record and older snapshots stay immutable', () => {
  const run = win();
  const old = { [tourRecordKey(run)!]: 200000 };
  const next = recordTourBest(old, run);
  assert.deepEqual(next, { [tourRecordKey(run)!]: 212345 });
  assert.equal(old[tourRecordKey(run)!], 200000);
  assert.equal(recordTourBest(next, run), next);
  for (const mutation of [
    { status: 'lost' },
    { status: 'playing' },
    { history: run.history.slice(0, 17) },
    { score: 100000 },
    { score: NaN },
    { mode: 'quick' },
    { mode: 'daily' },
    { contentVersion: 5 },
  ] as const)
    assert.equal(recordTourBest(next, { ...run, ...mutation }), next);
});
void test('Classic, Grand, assisted, special rules and content revisions never share a personal target', () => {
  const run = win();
  const cases = [
    run,
    win('classic'),
    { ...run, assisted: true },
    { ...run, rules: 'uninsured' as const },
    { ...run, rules: 'one-flap' as const },
  ];
  const records = cases.reduce(
    (saved, attempt) => recordTourBest(saved, attempt),
    {},
  );
  assert.equal(Object.keys(records).length, 5);
  for (const attempt of cases) {
    const key = tourRecordKey(attempt)!;
    assert.deepEqual(parseTourRecordKey(key), {
      version: CONTENT_VERSION,
      campaign: attempt.campaign,
      rules: attempt.rules,
      assisted: attempt.assisted,
    });
  }
  assert.equal(tourRecordKey({ ...run, contentVersion: 5 }), null);
});
void test('old saves gain an empty record book; valid totals persist and malformed conditions are dropped', () => {
  const old = {
    ...defaultSave(),
    tourBests: undefined,
    best: 987,
    hats: ['helmet', 'party'],
    daily: { 'v5:2026-09-08': 8888 },
  };
  const migrated = readSave({ getItem: () => JSON.stringify(old) });
  assert.deepEqual(migrated.tourBests, {});
  assert.equal(migrated.best, 987);
  assert.deepEqual(migrated.hats, old.hats);
  assert.deepEqual(migrated.daily, old.daily);
  const valid = tourRecordKey(win())!;
  const saved = readSave({
    getItem: () =>
      JSON.stringify({
        ...old,
        tourBests: {
          [valid]: 212345,
          'v06:grand:standard': 1,
          'v999:grand:standard': 2,
          'v6:daily:standard': 3,
          'v6:grand:made-up': 4,
          'v6:grand:standard:assisted:extra': 5,
          'v6:classic:standard': -1,
          'v6:classic:one-flap': '900',
          'v6:classic:uninsured': 1.5,
        },
      }),
  });
  assert.deepEqual(saved.tourBests, { [valid]: 212345 });
  let stored = '';
  assert.equal(
    writeSave(saved, {
      setItem: (_key, value) => {
        stored = value;
      },
    }),
    true,
  );
  assert.deepEqual(
    readSave({ getItem: () => stored }).tourBests,
    saved.tourBests,
  );
  assert.equal(
    writeSave(saved, {
      setItem: () => {
        throw new Error('Unavailable');
      },
    }),
    false,
  );
  assert.deepEqual(saved.tourBests, { [valid]: 212345 });
});
