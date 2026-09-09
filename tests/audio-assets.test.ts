import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  EFFECT_AUDIO,
  MUSIC_AUDIO,
  eventAudio,
  levelAudio,
} from '../lib/game/audio-assets';

void test('the level preload catalog covers every bundled effect and only the selected music', () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL('../public/audio/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const delivered = manifest.artifacts as {
    id: string;
    filename: string;
    kind: string;
  }[];
  assert.deepEqual(
    new Set(delivered.map((a) => a.id)),
    new Set([...EFFECT_AUDIO, ...MUSIC_AUDIO]),
  );
  for (const asset of delivered)
    assert.ok(
      statSync(new URL(`../public/audio/${asset.filename}`, import.meta.url))
        .size > 100,
    );
  for (const world of [
    'farm',
    'candy',
    'carnival',
    'office',
    'moon',
    'afterlife',
  ] as const) {
    const normal = levelAudio(world, false),
      boss = levelAudio(world, true);
    assert.equal(new Set(normal).size, normal.length);
    assert.ok(EFFECT_AUDIO.every((id) => normal.includes(id)));
    assert.deepEqual(
      normal.filter((id) =>
        MUSIC_AUDIO.includes(id as (typeof MUSIC_AUDIO)[number]),
      ),
      ['main', world],
    );
    assert.equal(boss.length, normal.length + 1);
    assert.equal(
      boss.at(-1),
      `boss-act${world === 'farm' || world === 'candy' ? 1 : world === 'carnival' || world === 'office' ? 2 : 3}`,
    );
  }
});
void test('live and recorded event mapping never requests a nonexistent event filename', () => {
  for (const kind of [
    'tap',
    'jump',
    'bounce',
    'flap',
    'flip',
    'ring',
    'glide',
    'land',
    'count',
    'record',
    'crunch',
    'ghost',
  ] as const)
    assert.equal(eventAudio({ kind, x: 0, y: 0 }).length, 1);
  assert.deepEqual(eventAudio({ kind: 'glide', x: 0, y: 0 }), ['wind']);
  assert.deepEqual(
    eventAudio({ kind: 'crunch', sound: 'unknown-legacy-cue', x: 0, y: 0 }),
    [],
  );
  assert.deepEqual(
    eventAudio({
      kind: 'flap',
      x: 0,
      y: 0,
      propulsion: { x: 0, y: 0, angle: 0, vx: 1, vy: 0, power: 1 },
    }),
    ['squish', 'flap'],
  );
});
