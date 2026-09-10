import { useEffect, useRef, useState, type RefObject } from 'react';
import { downloadBlob, exportClip, incidentCard } from '@/lib/game/sharing';
import type { Recording } from '@/lib/game/controller';
import { challengeUrl, type RunState } from '@/lib/game/run';
import type { ControllerRef } from './types';

/** A recording queued for export, with the challenge link it can advertise. */
export interface SelectedRecording {
  recording: Recording;
  challenge?: { url: string; score: number };
}

/** The writers an export action needs to report progress and failures. */
interface ExportIo {
  controller: ControllerRef;
  abort: { current: AbortController | null };
  setNotice: (notice: string) => void;
  setClip: (clip: Blob | null) => void;
  setProgress: (progress: number | null) => void;
}

/** The recording to export: the one the player picked, else the latest attempt. */
function recordingFor(io: ExportIo, selected: SelectedRecording | null) {
  return selected?.recording ?? io.controller.current?.recording();
}

/** Renders the video, leaving the export paused for the encoder's whole run. */
async function runExport(
  io: ExportIo,
  selected: SelectedRecording | null,
  options: { portrait: boolean; captions: boolean; clipLength: number },
) {
  const recording = recordingFor(io, selected);
  if (!recording) return;
  const abort = new AbortController();
  io.abort.current = abort;
  io.setNotice('');
  io.setClip(null);
  io.setProgress(0);
  io.controller.current?.setExporting(true);
  try {
    io.setClip(
      await exportClip(recording, {
        portrait: options.portrait,
        captions: options.captions,
        duration: options.clipLength || undefined,
        signal: abort.signal,
        progress: io.setProgress,
      }),
    );
  } catch (e) {
    if ((e as Error).name !== 'AbortError') io.setNotice((e as Error).message);
  } finally {
    io.controller.current?.setExporting(false);
    io.setProgress(null);
  }
}

/** Saves the still incident card, which needs no encoder and cannot be cancelled. */
async function saveIncidentCard(
  io: ExportIo,
  selected: SelectedRecording | null,
) {
  try {
    const recording = recordingFor(io, selected);
    if (recording) {
      downloadBlob(await incidentCard(recording), 'hoof-and-yeet-incident.png');
    }
  } catch (e) {
    io.setNotice((e as Error).message);
  }
}

/** Shares the challenge link, falling back to the clipboard and then to text. */
async function shareChallenge(
  io: ExportIo,
  selected: SelectedRecording | null,
) {
  if (!selected?.challenge) return;
  const { url, score } = selected.challenge;
  try {
    if (navigator.share) {
      await navigator.share({
        title: 'Can your horse do worse?',
        text: `I caused ${score.toLocaleString()} points of trouble. Your turn.`,
        url,
      });
      return;
    }
    await navigator.clipboard.writeText(url);
    io.setNotice('Challenge link copied. Send it to a questionable friend.');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      io.setNotice('Copy this challenge: ' + url);
    }
  }
}

/** Wraps the latest attempt for the share dialog, with its challenge link. */
function currentSelection(
  controller: ControllerRef,
  run: RunState | null,
): SelectedRecording | null {
  const recording = controller.current?.recording();
  if (!recording) return null;
  if (!run) return { recording };
  return {
    recording,
    challenge: {
      url: challengeUrl(run, window.location.origin),
      score: run.score,
    },
  };
}

/**
 * Owns the share dialog's settings, its in-flight export, and the resulting
 * video. The caller supplies the abort ref so the page can also cancel an
 * encode when the controller is torn down.
 */
export function useClipExport(
  controller: ControllerRef,
  abort: RefObject<AbortController | null>,
) {
  const clipVideo = useRef<HTMLVideoElement>(null);
  const [portrait, setPortrait] = useState(true);
  const [captions, setCaptions] = useState(true);
  const [clipLength, setClipLength] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [clip, setClip] = useState<Blob | null>(null);
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<SelectedRecording | null>(null);

  useEffect(() => {
    if (!clip || !clipVideo.current) return;
    const url = URL.createObjectURL(clip);
    clipVideo.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [clip]);

  const io: ExportIo = { controller, abort, setNotice, setClip, setProgress };
  return {
    clipVideo,
    abort,
    portrait,
    setPortrait,
    captions,
    setCaptions,
    clipLength,
    setClipLength,
    progress,
    clip,
    notice,
    setNotice,
    selected,
    setSelected,
    selectCurrent: (run: RunState | null) => {
      setSelected(currentSelection(controller, run));
      setClip(null);
    },
    makeClip: () =>
      void runExport(io, selected, { portrait, captions, clipLength }),
    saveImage: () => void saveIncidentCard(io, selected),
    challenge: () => void shareChallenge(io, selected),
  };
}
