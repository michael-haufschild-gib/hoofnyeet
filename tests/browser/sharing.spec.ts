import { test, expect } from './fixtures';

test('incident storage is bounded, cancellation is recoverable, and video fallback decodes', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('phone'));
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const sharingPath = '/lib/game/sharing.ts',
      simPath = '/lib/game/simulation.ts',
      contentPath = '/lib/game/content.ts',
      motionPath = '/lib/game/effects/perk-motion.ts';
    const sharing = await import(sharingPath),
      sim = await import(simPath),
      content = await import(contentPath),
      motion = await import(motionPath);
    const c = window.__hoof;
    c.setExporting(true);
    const before = JSON.stringify(c.save);
    const state = sim.createGame();
    Object.assign(state, {
      phase: 'flight',
      world: 'farm',
      x: 2300,
      y: -110,
      distance: 120,
      equipment: ['beans', 'tailwind'],
      mod: content.modifiers(['beans', 'tailwind']),
    });
    const flap = motion.recordPerkEvent(
      { kind: 'flap', x: state.x, y: state.y },
      { ...state, time: 0.2 },
    );
    const recording = {
      appearance: {
        hat: 'party',
        ponyId: 'bubblegum',
        gentle: false,
        reduced: false,
      },
      frames: [
        { ...state, time: 0 },
        { ...state, time: 8, x: 2800, y: -40 },
      ],
      events: [{ ...flap, sound: 'flap', time: 0.2, id: 'fixture-flap' }],
      duration: 8,
    };
    for (let i = 0; i < 8; i++)
      await sharing.saveIncident({
        id: `sharing-${i}`,
        name: 'Recorded fixture',
        distance: 120,
        havoc: 100,
        created: i,
        recording,
      });
    const rows = await sharing.listIncidents();
    const database = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get() {
        throw new Error('Storage unavailable');
      },
    });
    const unavailable = {
      rows: await sharing.listIncidents(),
      saved: await sharing.saveIncident(rows[0]),
    };
    if (database) Object.defineProperty(window, 'indexedDB', database);
    else Reflect.deleteProperty(window, 'indexedDB');
    const abort = new AbortController();
    let cancelled = '';
    try {
      await sharing.exportClip(recording, {
        portrait: true,
        duration: 8,
        captions: true,
        signal: abort.signal,
        progress: (n: number) => {
          if (n > 0.03) abort.abort();
        },
      });
    } catch (e) {
      cancelled = (e as Error).name;
    }
    const nativeSupport = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    const webmSupported = nativeSupport('video/webm;codecs=vp8,opus');
    // Exercise the real WebM encoder while making MP4 unavailable to selection.
    if (webmSupported)
      MediaRecorder.isTypeSupported = (mime: string) =>
        mime.startsWith('video/webm') && nativeSupport(mime);
    let blob: Blob;
    try {
      blob = await sharing.exportClip(recording, {
        portrait: false,
        duration: 8,
        captions: true,
        signal: new AbortController().signal,
        progress: () => {},
      });
    } finally {
      MediaRecorder.isTypeSupported = nativeSupport;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(blob);
    const loaded = new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Clip failed to decode'));
    });
    video.src = url;
    await loaded;
    const dimensions = [video.videoWidth, video.videoHeight];
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
    const card = await sharing.incidentCard(recording);
    c.setExporting(false);
    return {
      stored: rows.map((r: { id: string }) => r.id),
      unavailable,
      cancelled,
      webmSupported,
      type: blob.type,
      bytes: blob.size,
      dimensions,
      card: { type: card.type, bytes: card.size },
      unchanged: before === JSON.stringify(c.save),
    };
  });
  expect(report.stored).toEqual([
    'sharing-7',
    'sharing-6',
    'sharing-5',
    'sharing-4',
    'sharing-3',
  ]);
  expect(report.unavailable).toEqual({ rows: [], saved: false });
  expect(report.cancelled).toBe('AbortError');
  if (report.webmSupported) expect(report.type).toContain('webm');
  expect(report.dimensions).toEqual([1280, 720]);
  expect(report.bytes).toBeGreaterThan(10000);
  expect(report.card.type).toBe('image/png');
  expect(report.card.bytes).toBeGreaterThan(10000);
  expect(report.unchanged).toBe(true);
  expect(errors).toEqual([]);
  await info.attach('sharing-capabilities', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
});
