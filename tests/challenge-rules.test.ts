import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChallenge,
  challengeUnlocked,
  insuranceCapacity,
  isChallengeRule,
} from '../lib/game/challenge-rules';
import { CONTENT_VERSION, modifiers } from '../lib/game/content';

void test('tour challenges unlock from wins and constrain equipment without changing the shared modifier source', () => {
  const mod = modifiers(['wings', 'feather'], 'moon');
  assert.ok(mod.maxFlaps > 3);
  const challenge = applyChallenge(mod, 'one-flap');
  assert.equal(challenge.maxFlaps, 1);
  assert.equal(challenge.gravity, mod.gravity);
  assert.ok(mod.maxFlaps > 3);
  assert.deepEqual(applyChallenge(mod, 'standard'), mod);
  assert.equal(insuranceCapacity('uninsured'), 1);
  assert.equal(insuranceCapacity('standard'), 3);
  assert.equal(challengeUnlocked('one-flap', 0), false);
  assert.equal(challengeUnlocked('one-flap', 1), true);
  assert.equal(challengeUnlocked('uninsured', 1), false);
  assert.equal(challengeUnlocked('uninsured', 2), true);
  assert.equal(isChallengeRule('some-made-up-mode'), false);
});

void test('run rules persist in friend links and checkpoints while daily conditions stay standard', async () => {
  const {
    newRun,
    challengeUrl,
    parseChallenge,
    beginAttempt,
    settleAttempt,
    buyInsurance,
  } = await import('../lib/game/run');
  const { defaultSave, readSave } = await import('../lib/game/storage');
  const run = newRun('tour', 118, false, undefined, 'uninsured');
  assert.equal(run.insurance, 1);
  const link = new URL(challengeUrl(run, 'https://horse.test'));
  assert.equal(parseChallenge(link.search)?.rules, 'uninsured');
  const resumed = readSave({
    getItem: () => JSON.stringify({ ...defaultSave(), run }),
  });
  assert.equal(resumed.run?.rules, 'uninsured');
  beginAttempt(run);
  settleAttempt(
    run,
    {
      distance: 500,
      style: 100,
      havoc: 800,
      bossHits: 4,
      failed: false,
      disaster: 'fixture',
    },
    [],
  );
  run.salvage = 1000;
  assert.equal(buyInsurance(run), false);
  assert.equal(run.insurance, 1);
  assert.equal(
    newRun('daily', 123, false, undefined, 'uninsured').rules,
    'standard',
  );
  assert.equal(
    newRun('quick', 123, false, undefined, 'one-flap').rules,
    'standard',
  );
  assert.equal(
    parseChallenge(`?v=${CONTENT_VERSION}&mode=daily&seed=123&rules=uninsured`),
    null,
  );
  assert.equal(
    parseChallenge(`?v=${CONTENT_VERSION}&seed=123&rules=invalid`),
    null,
  );
});
