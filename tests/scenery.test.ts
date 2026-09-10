import test from 'node:test';
import assert from 'node:assert/strict';
import { spectatorCells } from '../lib/game/art/terrain';
import { trampolineBed } from '../lib/game/art/trampoline';
import { createGame, STEP, stepGame, TRACK } from '../lib/game/simulation';

void test('camera scroll preserves visible spectator world cells across negative and positive tile boundaries', () => {
  for (const boundary of [-1200, -600, -145, 0, 145, 600, 1200]) {
    const before = spectatorCells(boundary - 0.1, boundary + 1400);
    const after = spectatorCells(boundary + 0.1, boundary + 1400.2);
    const shared = (id: number) =>
      id * 145 > boundary + 0.1 && id * 145 < boundary + 1400;
    assert.deepEqual(before.filter(shared), after.filter(shared));
    assert.equal(new Set(after).size, after.length);
  }
  for (const width of [370, 1280, 2000, 16000, 50000]) {
    const cells = spectatorCells(-3500, -3500 + width);
    assert.ok(cells.length <= 96);
    assert.ok(cells[0] * 145 <= -3500);
    assert.ok(cells.at(-1)! * 145 >= -3500 + width);
  }
});

void test('the compressed trampoline supports the horse on its actual net while springs and feet stay above the road', () => {
  for (const offset of [-78, 0, 78]) {
    const s = createGame();
    Object.assign(s, {
      phase: 'compression',
      x: TRACK.trampoline + offset,
      y: TRACK.surface,
    });
    for (let tick = 0; tick < 57; tick++) {
      stepGame(s, STEP);
      assert.equal(s.phase, 'compression');
      const bed = trampolineBed(s);
      assert.ok(Math.abs(bed.top(offset) - s.y) < 1e-8);
      assert.equal(bed.top(-88), TRACK.surface);
      assert.equal(bed.top(88), TRACK.surface);
      assert.equal(bed.springFoot, -4);
      for (let x = -72; x <= 72; x += 18)
        assert.ok(
          bed.top(x) + bed.depth < bed.springFoot,
          'net and springs must not cross the road',
        );
    }
    stepGame(s, STEP);
    assert.equal(s.phase, 'flight');
    assert.equal(s.y, TRACK.surface);
  }
});
