import { test, expect } from './fixtures';

test('a cold course waits for both illustrations and decoded sound before spending an attempt', async ({
  page,
}, info) => {
  let releaseImage!: () => void, releaseSound!: () => void;
  const image = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  const sound = new Promise<void>((resolve) => {
    releaseSound = resolve;
  });
  await page.route('**/art/carnage/heart.webp', async (route) => {
    await image;
    await route.continue();
  });
  await page.route('**/audio/gore-ignite.mp3', async (route) => {
    await sound;
    await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await expect(
    page.getByText('Preparing course', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(500);
  expect(
    await page.evaluate(() => ({
      phase: window.__hoof.state.phase,
      attempt: window.__hoof.run?.attempt,
      ready: window.__hoof.ready,
    })),
  ).toEqual({ phase: 'title', attempt: 0, ready: false });
  await page.screenshot({
    path: `output/playwright/preparing-${info.project.name}.png`,
  });
  releaseImage();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__hoof.run?.attempt)).toBe(0);
  releaseSound();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  await expect(
    page.getByText('Preparing course', { exact: true }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => window.__hoof.run?.attempt)).toBe(1);
  expect(
    await page.evaluate(
      () => window.__hoof.renderer.app.renderer.prepare.getQueue().length,
    ),
  ).toBe(0);
});

for (const asset of ['art/carnage/brain.webp', 'audio/tissue-stretch.mp3']) {
  test(`a failed ${asset} retries without reloading or consuming insurance`, async ({
    page,
  }) => {
    let requests = 0;
    await page.route(`**/${asset}`, async (route) => {
      requests++;
      if (requests === 1)
        await route.fulfill({ status: 503, body: 'temporary failure' });
      else await route.continue();
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__hoof?.ready);
    await page.getByRole('button', { name: 'Quick play', exact: true }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    const before = await page.evaluate(() => ({
      attempt: window.__hoof.run?.attempt,
      insurance: window.__hoof.run?.insurance,
      seed: window.__hoof.run?.seed,
    }));
    expect(before.attempt).toBe(0);
    await page.getByRole('button', { name: 'TRY AGAIN', exact: true }).click();
    await page.waitForFunction(() => window.__hoof.screen === 'game');
    expect(
      await page.evaluate(() => ({
        attempt: window.__hoof.run?.attempt,
        insurance: window.__hoof.run?.insurance,
        seed: window.__hoof.run?.seed,
      })),
    ).toEqual({ ...before, attempt: 1 });
    expect(requests).toBe(2);
    await expect(page.getByRole('alert')).not.toBeVisible();
  });
}

test('leaving preparation cannot launch a stale round and focus loss pauses a prepared round', async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/audio/gore-ignite.mp3', async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await expect(
    page.getByText('Preparing course', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  release();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__hoof.screen)).toBe('home');
  expect(await page.evaluate(() => window.__hoof.run?.attempt)).toBe(0);
  // Hold the public GPU preparation boundary to exercise an interruption after
  // network completion, without changing simulation or mocking browser audio.
  await page.evaluate(() => {
    const c = window.__hoof,
      prepare = c.renderer.prepareLevel.bind(c.renderer);
    c.renderer.prepareLevel = async (...args) => {
      await prepare(...args);
      window.dispatchEvent(new Event('blur'));
    };
  });
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  expect(await page.evaluate(() => window.__hoof.state.paused)).toBe(true);
  await expect(
    page.getByRole('button', { name: 'RESUME', exact: true }),
  ).toBeVisible();
});

test('all six prepared worlds play their complete sound catalog without late asset requests', async ({
  page,
}) => {
  test.setTimeout(90000);
  const late: string[] = [],
    errors: string[] = [];
  let playing = false;
  page.on('request', (request) => {
    if (playing && /\/(art|audio)\//.test(request.url()))
      late.push(request.url());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  for (const world of [
    'farm',
    'candy',
    'carnival',
    'office',
    'moon',
    'afterlife',
  ] as const) {
    await page.evaluate(async (world) => {
      const c = window.__hoof;
      c.home();
      c.startRun('tour');
      c.run!.stage = ['farm', 'candy'].includes(world)
        ? 2
        : ['carnival', 'office'].includes(world)
          ? 5
          : 8;
      await c.launch(world);
      c.pause(true);
    }, world);
    expect(await page.evaluate(() => window.__hoof.error)).toBe('');
    playing = true;
    const proof = await page.evaluate(async (world) => {
      const path = '/lib/game/catalogue/audio-assets.ts';
      const { EFFECT_AUDIO, MUSIC_AUDIO, levelAudio } = await import(path);
      const c = window.__hoof;
      const buffers = (
        c.audio as unknown as { buffers: Map<string, AudioBuffer> }
      ).buffers;
      const missing = levelAudio(world, true).filter(
        (id: string) => !buffers.has(id),
      );
      const tracks = MUSIC_AUDIO.filter((id: string) => buffers.has(id));
      for (const sound of EFFECT_AUDIO)
        c.audio.event({ kind: 'crunch', sound, x: 0, y: 0 });
      c.renderer.draw(c.state, 0, c.state.time);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return {
        missing,
        tracks,
        queued: c.renderer.app.renderer.prepare.getQueue().length,
      };
    }, world);
    expect(proof.missing).toEqual([]);
    expect(proof.tracks.length).toBe(3);
    expect(proof.queued).toBe(0);
    playing = false;
  }
  expect(late).toEqual([]);
  expect(errors).toEqual([]);
});
