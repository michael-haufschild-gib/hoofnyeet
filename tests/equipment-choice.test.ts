import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELICS, synergies, synergyChanges } from '../lib/game/content';
import { items, newRun, takeRelic } from '../lib/game/run';

void test('a replacement shows both broken pairs while preserving an independent pair', () => {
  const build = ['magnet', 'eyes', 'piano', 'ghostly', 'blackhole'];
  const before = JSON.stringify(build);
  const changes = synergyChanges(build, 'confetti', 'magnet');
  assert.deepEqual(
    changes.gained.map((pair) => pair.id),
    ['recital'],
  );
  assert.deepEqual(
    changes.lost.map((pair) => pair.id),
    ['junk', 'retina-zap'],
  );
  assert.equal(JSON.stringify(build), before);
  const safer = synergyChanges(build, 'confetti', 'eyes');
  assert.deepEqual(
    safer.gained.map((pair) => pair.id),
    ['recital'],
  );
  assert.deepEqual(
    safer.lost.map((pair) => pair.id),
    ['retina-zap'],
  );
});

void test('every offered swap preview agrees with the actual four-slot equipment transaction', () => {
  const base = ['beans', 'tailwind', 'acrobat', 'magnet'];
  for (const relic of RELICS.filter(
    (relic) => ![...base, 'blackhole'].includes(relic.id),
  )) {
    for (const outgoing of relic.category === 'active' ? ['blackhole'] : base) {
      const run = newRun('tour', 82);
      run.passives = [...base];
      run.ability = 'blackhole';
      run.status = 'pitstop';
      run.offers = [relic.id];
      const before = synergies(items(run));
      const untouched = JSON.stringify(run);
      const prediction = synergyChanges(items(run), relic.id, outgoing);
      assert.equal(JSON.stringify(run), untouched);
      assert.equal(takeRelic(run, relic.id, outgoing), true);
      const actual = synergies(items(run));
      assert.deepEqual(
        prediction.gained,
        actual.filter((pair) => !before.includes(pair)),
        `${relic.id}/${outgoing} gains`,
      );
      assert.deepEqual(
        prediction.lost,
        before.filter((pair) => !actual.includes(pair)),
        `${relic.id}/${outgoing} losses`,
      );
      assert.equal(run.passives.length, 4);
      assert.equal(takeRelic(run, relic.id, outgoing), false);
    }
  }
});
