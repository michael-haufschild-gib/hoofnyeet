import { INCIDENT_WINDOW } from './escalation';
import { GameRenderer } from './renderer';
import { HorseAudio } from './audio';
import { replayFrame } from './replay';
import type { Recording } from './controller';
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
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore('incidents', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveIncident(incident: Incident) {
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('incidents', 'readwrite'),
        store = tx.objectStore('incidents');
      store.put(incident);
      const all = store.getAll();
      all.onsuccess = () => {
        const rows = (all.result as Incident[]).sort(
          (a, b) => b.created - a.created,
        );
        for (const row of rows.slice(5)) store.delete(row.id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}
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
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
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
export async function exportClip(
  recording: Recording,
  options: {
    portrait: boolean;
    duration?: number;
    captions: boolean;
    signal: AbortSignal;
    progress: (n: number) => void;
  },
): Promise<Blob> {
  if (!recording.frames.length)
    throw new Error('There is no incident to export yet.');
  if (typeof MediaRecorder === 'undefined')
    throw new Error(
      'This browser cannot record a clip. You can still save an incident card.',
    );
  const mime = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ].find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime)
    throw new Error(
      'No supported video format. Save an incident card instead.',
    );
  const width = options.portrait ? 720 : 1280,
    height = options.portrait ? 1280 : 720,
    captionHeight = options.captions ? (options.portrait ? 120 : 100) : 0,
    actionHeight = height - captionHeight,
    canvas = document.createElement('canvas'),
    source = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const renderer = new GameRenderer(source, 1),
    audio = new HorseAudio();
  let stream: MediaStream | null = null,
    recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  try {
    await audio.unlock();
    await renderer.load();
    if (recording.appearance) Object.assign(renderer, recording.appearance);
    renderer.resize(width, actionHeight);
    await renderer.loadWorld(recording.frames[0].world);
    await audio.prepare(recording.events, recording.frames[0]);
    if (options.signal.aborted)
      throw new DOMException('Export cancelled', 'AbortError');
    stream = canvas.captureStream(30);
    const audioStream = audio.recordingStream();
    if (audioStream)
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 3500000,
      audioBitsPerSecond: 128000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve, reject) => {
      recorder!.onstop = () => resolve();
      recorder!.onerror = () =>
        reject(
          new Error(
            'Your browser could not finish recording. Try an incident card.',
          ),
        );
    });
    const duration = Math.min(
        INCIDENT_WINDOW,
        recording.duration,
        Math.max(8, options.duration ?? recording.duration),
      ),
      first = Math.max(
        recording.frames[0].time,
        recording.frames.at(-1)!.time - duration,
      );
    let last = performance.now(),
      elapsed = 0,
      eventIndex = 0;
    recorder.start();
    while (elapsed < duration) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      if (options.signal.aborted)
        throw new DOMException('Export cancelled', 'AbortError');
      if (document.hidden)
        throw new Error(
          'Keep this tab visible while creating your clip. Your incident is safe.',
        );
      const now = performance.now(),
        dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      elapsed += dt;
      const at = first + elapsed,
        frame = replayFrame(recording.frames, at);

      audio.tick(frame);
      while (
        eventIndex < recording.events.length &&
        (recording.events[eventIndex].time ?? 0) <= at
      ) {
        const e = recording.events[eventIndex++];
        if ((e.time ?? 0) >= first) {
          audio.event(e);
          renderer.event(e);
        }
      }
      renderer.draw(frame, dt, frame.time);
      ctx.drawImage(source, 0, 0, width, actionHeight);
      ctx.fillStyle = '#fff5d9';
      ctx.font = '28px "Lilita One"';
      ctx.textAlign = 'left';
      ctx.fillText('hoof & yeet', 28, 42);
      if (options.captions) {
        const caption =
          frame.wreck?.caption ?? 'THIS WAS A PERFECTLY REASONABLE IDEA.';
        ctx.fillStyle = '#20372edc';
        ctx.fillRect(0, actionHeight, width, captionHeight);
        ctx.fillStyle = '#fff5d9';
        ctx.font = `${options.portrait ? 24 : 28}px "Lilita One"`;
        ctx.textAlign = 'center';
        const lines: string[] = [];
        let line = '';
        for (const word of caption.split(' ')) {
          const candidate = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(candidate).width > width - 48) {
            lines.push(line);
            line = word;
          } else line = candidate;
        }
        if (line) lines.push(line);
        const lineHeight = options.portrait ? 29 : 30;
        lines.forEach((text, i) =>
          ctx.fillText(
            text,
            width / 2,
            height - 50 - (lines.length - 1 - i) * lineHeight,
          ),
        );
        ctx.font = '20px Nunito';
        ctx.fillText(
          `${frame.distance.toFixed(1)}m  ·  ${frame.havoc} HAVOC`,
          width / 2,
          height - 20,
        );
      }
      options.progress(Math.min(1, elapsed / duration));
    }
    recorder.stop();
    await done;
    return new Blob(chunks, { type: recorder.mimeType });
  } finally {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    for (const track of stream?.getTracks() ?? []) track.stop();
    renderer.dispose();
    audio.dispose();
  }
}
export async function incidentCard(recording: Recording): Promise<Blob> {
  const frame = recording.frames[Math.max(0, recording.frames.length - 30)];
  if (!frame) throw new Error('Complete an attempt first.');
  const source = document.createElement('canvas'),
    renderer = new GameRenderer(source, 1);
  try {
    await renderer.load();
    if (recording.appearance) Object.assign(renderer, recording.appearance);
    renderer.resize(1200, 800);
    await renderer.loadWorld(frame.world);
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
