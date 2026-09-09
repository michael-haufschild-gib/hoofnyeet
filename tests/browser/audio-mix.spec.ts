import { test, expect } from './fixtures';
import type { HorseAudio } from '../../lib/game/audio';
type AudioProbe = {
  voices: Map<AudioBufferSourceNode, { priority: number }>;
  buffers: Map<string, AudioBuffer>;
  loading: Map<string, Promise<AudioBuffer | null>>;
  load(id: string): Promise<AudioBuffer | null>;
};

test('the bounded mix preserves nuclear and player cues, then clears incident tails on reset', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const path = '/lib/game/audio.ts';
    const { HorseAudio: Audio } = await import(path);
    const audio = new Audio() as HorseAudio;
    await audio.unlock();
    await audio.prepareLevel('farm', false);
    const probe = audio as unknown as AudioProbe;
    for (let i = 0; i < 10; i++)
      audio.event({ kind: 'crunch', sound: 'blood-bag', x: 0, y: 0 });
    const full = probe.voices.size;
    audio.event({
      kind: 'crunch',
      sound: 'nuclear',
      id: 'one-nuke',
      x: 0,
      y: 0,
    });
    audio.event({ kind: 'flap', x: 0, y: 0 });
    const priorities = [...probe.voices.values()].map((v) => v.priority);
    audio.event({
      kind: 'crunch',
      sound: 'nuclear',
      id: 'one-nuke',
      x: 0,
      y: 0,
    });
    const unique = [...probe.voices.values()].filter(
      (v) => v.priority === 3,
    ).length;
    const old = [...probe.voices.keys()];
    audio.reset();
    const cleared = probe.voices.size === 0;
    audio.event({
      kind: 'crunch',
      sound: 'nuclear',
      id: 'one-nuke',
      x: 0,
      y: 0,
    });
    const fresh = [...probe.voices.keys()].every((v) => !old.includes(v));
    audio.dispose();
    return { full, priorities, unique, cleared, fresh };
  });
  expect(proof.full).toBe(10);
  expect(proof.priorities.length).toBe(10);
  expect(proof.priorities).toContain(3);
  expect(proof.priorities).toContain(2);
  expect(proof.unique).toBe(1);
  expect(proof.cleared && proof.fresh).toBe(true);
});

test('a stalled native decoder times out and a retry really decodes the sound', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const path = '/lib/game/audio.ts';
    const { HorseAudio: Audio } = await import(path);
    const audio = new Audio() as HorseAudio;
    await audio.unlock();
    const probe = audio as unknown as AudioProbe,
      context = audio.context!;
    const decode = context.decodeAudioData.bind(context);
    context.decodeAudioData = () => new Promise<AudioBuffer>(() => {});
    const timeout = window.setTimeout;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
      timeout(fn, ms === 20000 ? 80 : ms, ...args)) as typeof window.setTimeout;
    let first: AudioBuffer | null;
    try {
      first = await probe.load('kick');
    } finally {
      window.setTimeout = timeout;
      context.decodeAudioData = decode;
    }
    const retained = probe.loading.has('kick') || probe.buffers.has('kick');
    const retry = await probe.load('kick');
    audio.dispose();
    return {
      timedOut: first === null,
      retained,
      decoded: !!retry && retry.length > 0,
    };
  });
  expect(proof).toEqual({ timedOut: true, retained: false, decoded: true });
});
