import { test, expect } from './fixtures';
import type { HorseAudio } from '../../lib/game/audio';
import type { GameState } from '../../lib/game/simulation';

type Mix = { musicGain: GainNode; effectGain: GainNode };

test('muting each sound bus stays absolute through dense impact ducking and later unmute', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const audioPath = '/lib/game/audio.ts',
      simPath = '/lib/game/simulation.ts';
    const { HorseAudio: Audio } = await import(audioPath);
    const { createGame } = await import(simPath);
    const audio = new Audio() as HorseAudio;
    try {
      await audio.unlock();
      await audio.prepareLevel('farm', false);
      const state = createGame() as GameState;
      audio.tick(state);
      audio.music = false;
      audio.effects = false;
      const mix = audio as unknown as Mix;
      const samples: number[][] = [];
      for (let i = 0; i < 4; i++) {
        audio.event({ kind: 'crunch', sound: 'nuclear', x: 0, y: 0 });
        await new Promise((resolve) => setTimeout(resolve, 100));
        samples.push([mix.musicGain.gain.value, mix.effectGain.gain.value]);
      }
      audio.music = true;
      audio.effects = true;
      const unmuted = [mix.musicGain.gain.value, mix.effectGain.gain.value];
      return { samples, unmuted };
    } finally {
      audio.dispose();
    }
  });
  expect(proof.samples).toEqual([
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ]);
  expect(proof.unmuted[0]).toBeCloseTo(0.28);
  expect(proof.unmuted[1]).toBe(1);
});

test('changing sound preferences during pause keeps audio and game clocks frozen until resume', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.waitForFunction(
    () => window.__hoof.audio.context?.state === 'suspended',
  );
  const frozen = await page.evaluate(() => {
    const c = window.__hoof;
    const clocks = { game: c.state.time, audio: c.audio.context!.currentTime };
    c.setPreference('music', false);
    c.setPreference('effects', false);
    return clocks;
  });
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => ({
      game: window.__hoof.state.time,
      audio: window.__hoof.audio.context!.currentTime,
      state: window.__hoof.audio.context!.state,
    })),
  ).toEqual({ ...frozen, state: 'suspended' });
  await page.getByRole('button', { name: 'RESUME', exact: true }).click();
  await page.waitForFunction(
    () => window.__hoof.audio.context?.state === 'running',
  );
  const gains = await page.evaluate(() => {
    const mix = window.__hoof.audio as unknown as Mix;
    return [mix.musicGain.gain.value, mix.effectGain.gain.value];
  });
  expect(gains).toEqual([0, 0]);
});
