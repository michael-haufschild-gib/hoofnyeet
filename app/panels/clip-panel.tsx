import type { RefObject } from 'react';
import { Download, Film, Share2, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { downloadBlob, shareFile } from '@/lib/game/sharing';

/** File extension matching whatever container the recorder actually produced. */
function clipExtension(clip: Blob) {
  return clip.type.includes('mp4') ? 'mp4' : 'webm';
}

/** Aspect, length and caption choices, locked while an export is running. */
function ExportOptions({
  portrait,
  onPortrait,
  clipLength,
  onClipLength,
  captions,
  onCaptions,
  busy,
}: {
  portrait: boolean;
  onPortrait: (portrait: boolean) => void;
  clipLength: number;
  onClipLength: (seconds: number) => void;
  captions: boolean;
  onCaptions: (captions: boolean) => void;
  busy: boolean;
}) {
  return (
    <details className="export-options">
      <summary>
        Video options · {portrait ? 'vertical' : 'landscape'},{' '}
        {clipLength ? `${clipLength}s` : 'full incident'}
      </summary>
      <div className="clip-options">
        <button
          className={portrait ? 'selected' : ''}
          onClick={() => onPortrait(true)}
          disabled={busy}
        >
          ▯ VERTICAL · 9:16
        </button>
        <button
          className={!portrait ? 'selected' : ''}
          onClick={() => onPortrait(false)}
          disabled={busy}
        >
          ▭ LANDSCAPE · 16:9
        </button>
        <label htmlFor="clip-length">
          Highlight length
          <select
            id="clip-length"
            value={clipLength}
            disabled={busy}
            onChange={(e) => onClipLength(Number(e.target.value))}
          >
            <option value={0}>Full incident</option>
            <option value={12}>12s · extended highlight</option>
            <option value={10}>10s · impact to punchline</option>
            <option value={8}>8s · concentrated chaos</option>
          </select>
        </label>
        <label htmlFor="clip-captions">
          Incident captions{' '}
          <Switch
            id="clip-captions"
            checked={captions}
            onCheckedChange={onCaptions}
            disabled={busy}
          />
        </label>
      </div>
    </details>
  );
}

/** Headline over the export stage, which tracks the three export states. */
function stageHeadline(clip: Blob | null, busy: boolean) {
  if (clip) return 'Ready to share';
  return busy ? 'Making your video…' : 'Save the best twelve seconds.';
}

/** The export status card, including the progress bar while encoding. */
function ClipStage({
  clip,
  progress,
}: {
  clip: Blob | null;
  progress: number | null;
}) {
  const busy = progress !== null;
  return (
    <div className="clip-stage">
      <Film size={42} />
      <b>{stageHeadline(clip, busy)}</b>
      <p>
        {busy
          ? 'Keep this tab visible. This takes about twelve seconds.'
          : 'Your landing, with sound.'}
      </p>
      {busy && (
        <div className="clip-progress">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** The primary export button, which becomes Cancel then Share as work proceeds. */
function ClipPrimaryActions({
  clip,
  progress,
  onCancel,
  onMakeClip,
}: {
  clip: Blob | null;
  progress: number | null;
  onCancel: () => void;
  onMakeClip: () => void;
}) {
  if (progress !== null) {
    return (
      <button className="start-button" onClick={onCancel}>
        CANCEL <X size={18} />
      </button>
    );
  }
  if (!clip) {
    return (
      <button className="start-button" onClick={onMakeClip}>
        MAKE VIDEO <Film size={18} />
      </button>
    );
  }
  const name = `hoof-and-yeet.${clipExtension(clip)}`;
  return (
    <>
      <button
        className="start-button"
        onClick={() => void shareFile(clip, name)}
      >
        SHARE VIDEO <Share2 size={18} />
      </button>
      <button onClick={() => downloadBlob(clip, name)}>
        <Download size={17} /> Download
      </button>
    </>
  );
}

/** The share dialog: export options, a preview, and the ways to send it out. */
export function ClipPanel({
  clip,
  clipVideo,
  progress,
  notice,
  portrait,
  onPortrait,
  clipLength,
  onClipLength,
  captions,
  onCaptions,
  canChallenge,
  onChallenge,
  onCancel,
  onMakeClip,
  onSaveImage,
}: {
  clip: Blob | null;
  clipVideo: RefObject<HTMLVideoElement | null>;
  progress: number | null;
  notice: string;
  portrait: boolean;
  onPortrait: (portrait: boolean) => void;
  clipLength: number;
  onClipLength: (seconds: number) => void;
  captions: boolean;
  onCaptions: (captions: boolean) => void;
  canChallenge: boolean;
  onChallenge: () => void;
  onCancel: () => void;
  onMakeClip: () => void;
  onSaveImage: () => void;
}) {
  const busy = progress !== null;
  return (
    <>
      <ExportOptions
        portrait={portrait}
        onPortrait={onPortrait}
        clipLength={clipLength}
        onClipLength={onClipLength}
        captions={captions}
        onCaptions={onCaptions}
        busy={busy}
      />
      {clip && (
        <video
          className="clip-preview"
          ref={clipVideo}
          controls
          playsInline
          aria-label="Your incident highlight"
        >
          <track
            kind="captions"
            src="/audio/incident-captions.vtt"
            srcLang="en"
            label="Sound descriptions"
          />
        </video>
      )}
      <ClipStage clip={clip} progress={progress} />
      {notice && <output className="inline-notice">{notice}</output>}
      <div className="clip-actions">
        {canChallenge && (
          <button disabled={busy} onClick={onChallenge}>
            <Share2 size={16} /> Challenge a friend
          </button>
        )}
        <ClipPrimaryActions
          clip={clip}
          progress={progress}
          onCancel={onCancel}
          onMakeClip={onMakeClip}
        />
        <button disabled={busy} onClick={onSaveImage}>
          Save image
        </button>
      </div>
    </>
  );
}
