import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../lib/game/simulation';
import { defaultSave, finishRound, readSave } from '../lib/game/storage';
import { beginTrick, completeTrick, newRoutine } from '../lib/game/routine';
import { HATS, hatAsset } from '../lib/game/catalogue/cosmetics';
import { WORLDS } from '../lib/game/content';
import fs from 'node:fs/promises';
import sharp from 'sharp';

void test('new outfits reward actual technique and world exploration, preserve older hats, and settle once', () => {
  let save = defaultSave();
  const s = createGame();
  s.distance = 650;
  s.style = 999;
  save = finishRound(save, s);
  assert.deepEqual(save.hats, ['helmet', 'party', 'crown', 'space']);
  s.style = 1000;
  save = finishRound(save, s);
  assert.ok(save.hats.includes('brain'));
  let routine = newRoutine();
  for (const [time, y, vy] of [
    [1, -400, 200],
    [3, -400, 0],
    [5, -90, 400],
  ]) {
    routine = completeTrick(
      beginTrick(routine, { time, y, vy, flapPose: 0, beans: false }),
      { time: time + 0.86, x: 2000, y, base: 100 },
    );
  }
  s.routine = routine;
  save = finishRound(save, s);
  assert.ok(save.hats.includes('disco'));
  for (const world of WORLDS) {
    s.world = world.id;
    save = finishRound(save, s);
  }
  assert.ok(save.hats.includes('sausage'));
  assert.equal(save.hats.length, 7);
  const old = JSON.stringify(save);
  const next = finishRound(save, s);
  assert.equal(JSON.stringify(save), old, 'previous save stays immutable');
  assert.equal(
    next.hats.length,
    7,
    'duplicate rounds cannot duplicate cosmetic awards',
  );
});

void test('interrupted or repeated identical tricks do not earn the variety hat', () => {
  const s = createGame();
  let routine = newRoutine();
  for (const time of [0, 3, 6])
    routine = completeTrick(
      beginTrick(routine, {
        time,
        y: -400,
        vy: 200,
        flapPose: 0,
        beans: false,
      }),
      { time: time + 0.86, x: 2000, y: -400, base: 100 },
    );
  routine = beginTrick(routine, {
    time: 9,
    y: -70,
    vy: 400,
    flapPose: 0,
    beans: false,
  });
  s.routine = routine;
  assert.equal(finishRound(defaultSave(), s).hats.includes('disco'), false);
});

void test('old records earn deserved new cosmetics while selected outfits and discoveries survive reload', () => {
  const source = {
    ...defaultSave(),
    bestStyle: 1400,
    discoveries: WORLDS.map((w) => `${w.id}:0`),
    hats: ['helmet', 'disco'],
    hat: 'disco',
  };
  const saved = readSave({ getItem: () => JSON.stringify(source) });
  assert.equal(saved.hat, 'disco');
  assert.ok(saved.hats.includes('brain'));
  assert.ok(saved.hats.includes('sausage'));
  assert.deepEqual(readSave({ getItem: () => JSON.stringify(saved) }), saved);
  const malformed = readSave({
    getItem: () =>
      JSON.stringify({ ...source, hats: ['nonsense'], hat: 'nonsense' }),
  });
  assert.equal(malformed.hat, 'helmet');
  assert.equal(malformed.hats.includes('disco'), false);
});

void test('all three separate headwear images have intact padded alpha, persistent masters and bounded dimensions', async () => {
  const manifest = JSON.parse(
    await fs.readFile('public/art/costumes/manifest.json', 'utf8'),
  );
  const startup = JSON.parse(
    await fs.readFile('public/art/sprites.json', 'utf8'),
  );
  let total = 0;
  for (const hat of HATS.filter((hat) => hat.extra)) {
    assert.equal(
      Object.values(startup).includes(hatAsset(hat.id)),
      false,
      'unequipped hats stay out of startup',
    );
    const asset = manifest.assets.find((a: { id: string }) => a.id === hat.art);
    await fs.access(asset.masterPath);
    const file = await fs.readFile(`public${hatAsset(hat.id)}`);
    total += file.length;
    const { data, info } = await sharp(file)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.ok(info.width <= 384 && info.height <= 384);
    for (let x = 0; x < info.width; x++) {
      assert.equal(data[x * 4 + 3], 0);
      assert.equal(data[((info.height - 1) * info.width + x) * 4 + 3], 0);
    }
    for (let y = 0; y < info.height; y++) {
      assert.equal(data[y * info.width * 4 + 3], 0);
      assert.equal(data[(y * info.width + info.width - 1) * 4 + 3], 0);
    }
    assert.ok(asset.prompt.length > 100 && asset.verified);
  }
  assert.ok(total < 130000);
});
