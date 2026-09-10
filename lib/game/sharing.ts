import { INCIDENT_WINDOW } from './catalogue/escalation';
import { GameRenderer } from './renderer';
import { HorseAudio } from './audio';
import { replayFrame, replayEvent, replayLeadIn } from './replay';
import type { GameState } from './simulation';
import type { Recording } from './controller';

/**
 * One archived crash, as stored in IndexedDB. `distance` is metres and `havoc`
 * the destruction score of the attempt, both as they stood when it ended;
 * `created` is a `Date.now()` millisecond stamp used to keep the newest five.
 */
export interface Incident {
  id: string;
  name: string;
  distance: number;
  havoc: number;
  created: number;
  recording: Recording;
}
const DB = 'hoof-incidents-v2';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 2);
    r.onupgradeneeded = () => {
      const store = r.result.objectStoreNames.contains('incidents')
        ? r.transaction!.objectStore('incidents')
        : r.result.createObjectStore('incidents', { keyPath: 'id' });
      if (!store.indexNames.contains('created'))
        store.createIndex('created', 'created');
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
  });
}

/**
 * Stores one incident and prunes the archive to the five newest, resolving
 * `true` once the write committed and `false` when storage is unavailable or
 * refused it. A rejected write is never fatal: the run itself is unaffected.
 */
export async function saveIncident(incident: Incident) {
  let db: IDBDatabase | undefined;
  try {
    db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db!.transaction('incidents', 'readwrite'),
        store = tx.objectStore('incidents');
      store.put(incident);
      // Prune by indexed keys. Reading every full recording here cloned five
      // large replay histories into memory after each round just to sort them.
      let retained = 0;
      const oldest = store.index('created').openKeyCursor(null, 'prev');
      oldest.onsuccess = () => {
        const cursor = oldest.result;
        if (!cursor) return;
        if (++retained > 5) store.delete(cursor.primaryKey);
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  } finally {
    db?.close();
  }
}

/**
 * Every archived incident, newest first. Resolves to an empty list rather than
 * rejecting when the database cannot be opened, as private browsing does.
 */
export async function listIncidents(): Promise<Incident[]> {
  try {
    const db = await database();
    const rows = await new Promise<Incident[]>((resolve, reject) => {
      const tx = db.transaction('incidents'),
        r = tx.objectStore('incidents').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rows.sort((a, b) => b.created - a.created);
  } catch {
    return [];
  }
}

/**
 * Hands the blob to the browser as a download named `name`, then releases the
 * object URL ten seconds later, by when the transfer has started.
 */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Offers the blob through the system share sheet, falling back to a download
 * when sharing files is unsupported or fails. A share the user dismisses is
 * left alone: no download follows a deliberate cancellation.
 */
export async function shareFile(blob: Blob, name: string) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Hoof & Yeet — an incident occurred',
      });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadBlob(blob, name);
}

/** Containers to record in, most portable first; the first supported one wins. */
const CLIP_FORMATS = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

/** What the caller asks of an export, and how it hears back about progress. */
interface ClipOptions {
  portrait: boolean;
  duration?: number;
  captions: boolean;
  signal: AbortSignal;
  progress: (n: number) => void;
}

/** Pixel geometry of the exported frame: the action fills all but the caption band. */
interface ClipLayout {
  width: number;
  height: number;
  captionHeight: number;
  actionHeight: number;
}

/** Everything the per-frame pass paints with, gathered once before recording. */
interface ClipStage {
  ctx: CanvasRenderingContext2D;
  source: HTMLCanvasElement;
  renderer: GameRenderer;
  audio: HorseAudio;
  layout: ClipLayout;
}

/** Portrait exports are taller than wide and give the caption a deeper band. */
function clipLayout(portrait: boolean, captions: boolean): ClipLayout {
  const width = portrait ? 720 : 1280,
    height = portrait ? 1280 : 720,
    captionHeight = captions ? (portrait ? 120 : 100) : 0;
  return { width, height, captionHeight, actionHeight: height - captionHeight };
}

/**
 * The first container this browser can record, or a throw carrying the reason
 * a clip is impossible here, phrased for the player rather than the console.
 */
function clipFormat(): string {
  if (typeof MediaRecorder === 'undefined')
    throw new Error(
      'This browser cannot record a clip. You can still save an incident card.',
    );
  const mime = CLIP_FORMATS.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime)
    throw new Error(
      'No supported video format. Save an incident card instead.',
    );
  return mime;
}

/** Throws the caller's expected cancellation once the export is aborted. */
function assertNotAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/**
 * Throws when the export cannot continue. A hidden tab stops painting frames,
 * so recording on would produce a frozen clip rather than the incident.
 */
function assertClipCanContinue(signal: AbortSignal) {
  assertNotAborted(signal);
  if (document.hidden)
    throw new Error(
      'Keep this tab visible while creating your clip. Your incident is safe.',
    );
}

/** Loads the renderer, outfits, level and audio the recorded run needs. */
async function prepareClipStage(
  renderer: GameRenderer,
  audio: HorseAudio,
  recording: Recording,
  layout: ClipLayout,
) {
  await audio.unlock();
  await renderer.load();
  if (recording.appearance) Object.assign(renderer, recording.appearance);
  await renderer.prepareOutfits(recording.frames);
  renderer.resize(layout.width, layout.actionHeight);
  await renderer.prepareLevel(
    recording.frames[0].world,
    renderer.ponyId,
    undefined,
    recording.frames[0].ability,
  );
  await audio.prepare(recording.events, recording.frames[0]);
}

/** The canvas at 30fps, carrying the game's audio when the mix is available. */
function clipStream(canvas: HTMLCanvasElement, audio: HorseAudio): MediaStream {
  const stream = canvas.captureStream(30);
  const audioStream = audio.recordingStream();
  if (audioStream)
    for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
  return stream;
}

/**
 * A recorder appending to `chunks`, with a promise that settles when it stops:
 * it resolves on a clean stop and rejects if the browser gives up mid-clip.
 */
function clipRecorder(stream: MediaStream, mime: string, chunks: Blob[]) {
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 3500000,
    audioBitsPerSecond: 128000,
  });
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const done = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () =>
      reject(
        new Error(
          'Your browser could not finish recording. Try an incident card.',
        ),
      );
  });
  return { recorder, done };
}

/**
 * The slice of the recording to export: `duration` seconds ending at the last
 * recorded frame, capped by the incident window and never below eight seconds
 * of the run. `first` is the recording time the clip starts from.
 */
function clipWindow(recording: Recording, requested?: number) {
  const duration = Math.min(
      INCIDENT_WINDOW,
      recording.duration,
      Math.max(8, requested ?? recording.duration),
    ),
    first = Math.max(
      recording.frames[0].time,
      recording.frames.at(-1)!.time - duration,
    );
  return { duration, first };
}

/** Greedy word wrap: breaks only between words, so one long word overhangs. */
function wrapCaption(
  ctx: CanvasRenderingContext2D,
  caption: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of caption.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/** Paints the caption band: the wreck's line, then the run's distance and havoc. */
function drawCaption(
  ctx: CanvasRenderingContext2D,
  frame: GameState,
  layout: ClipLayout,
  portrait: boolean,
) {
  const caption =
    frame.wreck?.caption ?? 'THIS WAS A PERFECTLY REASONABLE IDEA.';
  ctx.fillStyle = '#20372edc';
  ctx.fillRect(0, layout.actionHeight, layout.width, layout.captionHeight);
  ctx.fillStyle = '#fff5d9';
  ctx.font = `${portrait ? 24 : 28}px "Lilita One"`;
  ctx.textAlign = 'center';
  const lines = wrapCaption(ctx, caption, layout.width - 48);
  const lineHeight = portrait ? 29 : 30;
  lines.forEach((text, i) =>
    ctx.fillText(
      text,
      layout.width / 2,
      layout.height - 50 - (lines.length - 1 - i) * lineHeight,
    ),
  );
  ctx.font = '20px Nunito';
  ctx.fillText(
    `${frame.distance.toFixed(1)}m  ·  ${frame.havoc} HAVOC`,
    layout.width / 2,
    layout.height - 20,
  );
}

/** Composites the rendered action onto the output canvas and brands it. */
function composeClipFrame(
  stage: ClipStage,
  frame: GameState,
  options: ClipOptions,
) {
  const { ctx, layout } = stage;
  ctx.drawImage(stage.source, 0, 0, layout.width, layout.actionHeight);
  ctx.fillStyle = '#fff5d9';
  ctx.font = '28px "Lilita One"';
  ctx.textAlign = 'left';
  ctx.fillText('hoof & yeet', 28, 42);
  if (options.captions) drawCaption(ctx, frame, layout, options.portrait);
}

/**
 * Fires every recorded event up to `at` into the renderer and the audio mix,
 * returning the cursor to resume from. Events before `first` are skipped: the
 * lead-in already applied them, and firing them again would restage the crash.
 */
function playClipEvents(
  stage: ClipStage,
  recording: Recording,
  bounds: { first: number; at: number },
  eventIndex: number,
) {
  while (
    eventIndex < recording.events.length &&
    (recording.events[eventIndex].time ?? 0) <= bounds.at
  ) {
    const e = recording.events[eventIndex++];
    if ((e.time ?? 0) >= bounds.first) {
      stage.audio.event(e);
      stage.renderer.event(replayEvent(e, recording.frames));
    }
  }
  return eventIndex;
}

/**
 * Draws the clip in real time, one animation frame at a time, reporting
 * progress from 0 to 1. Wall-clock deltas are capped at 100ms so a stalled
 * frame slows the replay instead of skipping through it.
 */
async function renderClipFrames(
  stage: ClipStage,
  recording: Recording,
  options: ClipOptions,
  window: { duration: number; first: number },
) {
  let last = performance.now(),
    elapsed = 0,
    eventIndex = 0;
  while (elapsed < window.duration) {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    assertClipCanContinue(options.signal);
    const now = performance.now(),
      dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    elapsed += dt;
    const at = window.first + elapsed,
      frame = replayFrame(recording.frames, at);

    stage.audio.tick(frame);
    eventIndex = playClipEvents(
      stage,
      recording,
      { first: window.first, at },
      eventIndex,
    );
    stage.renderer.draw(frame, dt, frame.time);
    composeClipFrame(stage, frame, options);
    options.progress(Math.min(1, elapsed / window.duration));
  }
}

/**
 * Renders the tail of a recording to a video blob in the browser's best
 * container, in real time: the export takes as long as the clip lasts and
 * needs the tab to stay visible throughout. Rejects with a player-facing
 * message when recording is unsupported, the tab hides, or `options.signal`
 * aborts. Every renderer, audio and recorder resource is released either way.
 */
export async function exportClip(
  recording: Recording,
  options: ClipOptions,
): Promise<Blob> {
  if (!recording.frames.length)
    throw new Error('There is no incident to export yet.');
  const mime = clipFormat();
  const layout = clipLayout(options.portrait, options.captions);
  const canvas = document.createElement('canvas'),
    source = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const stage: ClipStage = {
    ctx: canvas.getContext('2d')!,
    source,
    renderer: new GameRenderer(source, 1),
    audio: new HorseAudio(),
    layout,
  };
  let stream: MediaStream | null = null,
    recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  try {
    await prepareClipStage(stage.renderer, stage.audio, recording, layout);
    assertNotAborted(options.signal);
    stream = clipStream(canvas, stage.audio);
    const started = clipRecorder(stream, mime, chunks);
    recorder = started.recorder;
    const window = clipWindow(recording, options.duration);
    for (const event of replayLeadIn(
      recording.events,
      recording.frames,
      window.first,
    ))
      stage.renderer.event(event);
    recorder.start();
    await renderClipFrames(stage, recording, options, window);
    recorder.stop();
    await started.done;
    return new Blob(chunks, { type: recorder.mimeType });
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    for (const track of stream?.getTracks() ?? []) track.stop();
    stage.renderer.dispose();
    stage.audio.dispose();
  }
}

/**
 * A 1200x900 PNG of the moment just before the recording ends, captioned with
 * the run's distance and havoc. Rejects when the attempt holds no frames or
 * the canvas cannot be encoded.
 */
export async function incidentCard(recording: Recording): Promise<Blob> {
  const frame = recording.frames[Math.max(0, recording.frames.length - 30)];
  if (!frame) throw new Error('Complete an attempt first.');
  const source = document.createElement('canvas'),
    renderer = new GameRenderer(source, 1);
  try {
    await renderer.load();
    if (recording.appearance) Object.assign(renderer, recording.appearance);
    await renderer.prepareOutfits([frame]);
    renderer.resize(1200, 800);
    await renderer.prepareLevel(
      frame.world,
      renderer.ponyId,
      undefined,
      frame.ability,
    );
    renderer.draw(frame, 1, frame.time);
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(0, 0, 1200, 900);
    ctx.drawImage(source, 0, 0);
    ctx.font = '42px "Lilita One"';
    ctx.fillStyle = '#244d3d';
    ctx.fillText(
      `hoof & yeet · ${frame.distance.toFixed(1)}m · ${frame.havoc} havoc`,
      35,
      865,
    );
    return await new Promise<Blob>((resolve, reject) =>
      c.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(new Error('Could not create the incident card.')),
        'image/png',
      ),
    );
  } finally {
    renderer.dispose();
  }
}
