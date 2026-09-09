import { test, expect } from './fixtures';
import type { GameState } from '../../lib/game/simulation';
import type { NuclearEffects } from '../../lib/game/effects/nuclear';
import type { WebGLRenderer } from 'pixi.js';

declare global {
  interface Window {
    __nuclearState: GameState;
  }
}

test('nuclear cloud is preloaded with dynamite and its whole incident survives pause and replay cuts', async ({
  page,
}, info) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('request', (r) => {
    if (r.url().includes('nuclear-cloud')) requests.push(r.url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  expect(requests).toEqual([]);
  const proof = await page.evaluate(async () => {
    const crashPath = '/lib/game/crash.ts',
      simPath = '/lib/game/simulation.ts',
      motionPath = '/lib/game/effects/nuclear-motion.ts';
    const { CrashWorld, initPhysics } = await import(crashPath);
    const { createGame, STEP } = await import(simPath);
    const { nuclearPose } = await import(motionPath);
    await initPhysics();
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    await r.prepareLevel('farm', 'buttercup', undefined, 'dynamite');
    const effect = (
      r as unknown as { impactEffects: { nuclear: NuclearEffects } }
    ).impactEffects.nuclear;
    const s = createGame() as GameState;
    Object.assign(s, {
      phase: 'landing',
      world: 'farm',
      impactX: 2600,
      x: 2600,
      y: -40,
      reactive: true,
      vx: 480,
      vy: 400,
      ability: 'dynamite',
    });
    const crash = new CrashWorld(s);
    for (let i = 0; i < 120; i++) crash.step(STEP);
    crash.drain();
    crash.action('secondary');
    s.wreck = crash.snapshot();
    const cue = s.wreck!.carnage!.cues.find((c) => c.kind === 'nuclear')!;
    crash.dispose();
    // Review the recorded event at its origin; the live player remains free to
    // travel onward. Sampling never executes the ability or any physics again.
    s.wreck!.focusX = s.x = cue.x;
    s.wreck!.focusY = s.y = cue.y;
    const shots: { id: string; url: string }[] = [];
    const image = () => r.canvas.toDataURL('image/webp', 0.9);
    let freeze = true,
      replay = true,
      immutable = true,
      helmetEntranceY = 0;
    for (const age of [0.08, 0.35, 0.9, 1.5, 3.55, 4.101, 4.3, 4.45, 5.4]) {
      s.sceneTime = s.time = s.wreck!.time = cue.at + age;
      r.reset();
      const before = JSON.stringify(s);
      r.draw(s, 0, s.time);
      if (age === 4.101)
        helmetEntranceY = effect.foreground.toGlobal({
          x: 135,
          y: nuclearPose(cue, s.time)!.helmetY - cue.y,
        }).y;
      const live = image();
      shots.push({ id: `age-${age}`, url: live });
      r.draw(s, 0.5, s.time);
      freeze &&= live === image();
      r.reset();
      r.draw({ ...s, time: 90 }, 0, 90);
      replay &&= live === image();
      immutable &&= before === JSON.stringify(s);
    }
    r.gentle = true;
    r.draw(s, 0, s.time);
    shots.push({ id: 'gentle', url: image() });
    r.reduced = true;
    r.draw(s, 0, s.time);
    const reduced = image();
    r.draw(s, 1, s.time);
    freeze &&= reduced === image();
    shots.push({ id: 'reduced', url: reduced });
    const pool =
      effect.view.children.length + (effect.foreground.parent ? 1 : 0);
    const world = effect.view.parent!.parent!;
    const foregroundAboveCloud =
      world.getChildIndex(effect.foreground.parent!.parent!) >
      world.getChildIndex(effect.view.parent!);
    r.reset();
    const reset = !effect.view.visible && !effect.foreground.visible;
    r.gentle = r.reduced = false;
    s.wreck!.time = cue.at + 6.21;
    r.draw(s, 0, s.time);
    const expired = !effect.view.visible && !effect.foreground.visible;
    s.sceneTime = s.time = s.wreck!.time = cue.at + 4.3;
    r.reset();
    r.event({
      id: 'recovery-live-impact',
      kind: 'crunch',
      sound: 'explosion',
      x: cue.x + 70,
      y: cue.y - 120,
      value: 0.8,
      sceneTime: s.time - 0.12,
    });
    r.draw(s, 0, s.time);
    window.__nuclearState = s;
    const extension = (r.app.renderer as WebGLRenderer).gl.getExtension(
      'WEBGL_lose_context',
    );
    if (extension) window.__contextLoss = extension;
    return {
      shots,
      freeze,
      replay,
      immutable,
      pool,
      reset,
      expired,
      helmetEntranceY,
      foregroundAboveCloud,
      recoverable: !!extension,
      beforeRecovery: image(),
      queue: r.app.renderer.prepare.getQueue().length,
    };
  });
  for (const shot of proof.shots)
    await info.attach(`${info.project.name}-nuclear-${shot.id}`, {
      body: Buffer.from(shot.url.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
  expect(requests.length).toBe(1);
  expect(proof.freeze).toBe(true);
  expect(proof.replay).toBe(true);
  expect(proof.immutable).toBe(true);
  expect(proof.pool).toBe(4);
  expect(proof.reset).toBe(true);
  expect(proof.expired).toBe(true);
  expect(proof.helmetEntranceY).toBeLessThan(0);
  expect(proof.foregroundAboveCloud).toBe(true);
  expect(proof.queue).toBe(0);
  if (proof.recoverable) {
    await page.evaluate(() => window.__contextLoss.loseContext());
    await expect
      .poll(() => page.evaluate(() => window.__hoof.graphicsLost))
      .toBe(true);
    await page.evaluate(() => window.__contextLoss.restoreContext());
    await expect
      .poll(() => page.evaluate(() => window.__hoof.graphicsLost))
      .toBe(false);
    const restored = await page.evaluate(() => {
      const r = window.__hoof.renderer;
      r.draw(window.__nuclearState, 0, window.__nuclearState.time);
      return r.canvas.toDataURL('image/webp', 0.9);
    });
    await info.attach(`${info.project.name}-nuclear-restored`, {
      body: Buffer.from(restored.split(',')[1], 'base64'),
      contentType: 'image/webp',
    });
    expect(
      restored === proof.beforeRecovery,
      'the entire living impact must survive recovery',
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('actual dynamite level loading waits for its cloud, then launches without late art or audio', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/art/carnage/nuclear-cloud.webp', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.evaluate(() => {
    const c = window.__hoof;
    c.startRun('tour');
    c.run!.ability = 'dynamite';
    void c.launch('farm');
  });
  await expect(
    page.getByText('Preparing course', { exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__hoof.run!.attempt)).toBe(0);
  release();
  await page.waitForFunction(() => window.__hoof.screen === 'game');
  const late: string[] = [];
  page.on('request', (r) => {
    if (/\/(art|audio)\//.test(r.url())) late.push(r.url());
  });
  await page.evaluate(() =>
    window.__hoof.audio.event({ kind: 'crunch', sound: 'nuclear', x: 0, y: 0 }),
  );
  await page.waitForTimeout(200);
  expect(late).toEqual([]);
  expect(await page.evaluate(() => window.__hoof.state.ability)).toBe(
    'dynamite',
  );
});
