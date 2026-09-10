import { Home as HomeIcon, Play, Settings2 } from 'lucide-react';
import type { GameState } from '@/lib/game/simulation';

/** The pause menu, which only appears once the first-run guide is dismissed. */
export function PauseScreen({
  onResume,
  onSettings,
  onHome,
}: {
  onResume: () => void;
  onSettings: () => void;
  onHome: () => void;
}) {
  return (
    <div className="pause-screen">
      <h2>Paused.</h2>
      <button className="start-button" onClick={onResume}>
        RESUME <Play size={19} />
      </button>
      <button className="text-button" onClick={onSettings}>
        <Settings2 size={16} /> Settings
      </button>
      <button className="text-button" onClick={onHome}>
        <HomeIcon size={16} /> Home
      </button>
    </div>
  );
}

/** Asset-loading progress for a course. `progress` is a 0..1 fraction. */
export function CourseLoading({
  progress,
  onBack,
}: {
  progress: number;
  onBack: () => void;
}) {
  return (
    <output className="course-loading" aria-live="polite">
      <div className="course-loading-card">
        <span className="loading-hoof" aria-hidden="true">
          ✦
        </span>
        <b>Preparing course</b>
        <progress aria-label="Course assets" max={1} value={progress} />
        <span>{Math.round(progress * 100)}%</span>
        <button className="text-button" onClick={onBack}>
          Back
        </button>
      </div>
    </output>
  );
}

/**
 * The recoverable-failure panel. A lost WebGL context is reported separately
 * from a game error because only the former is worth a full reload.
 */
export function ErrorPanel({
  error,
  graphicsLost,
  onRetry,
}: {
  error: string;
  graphicsLost: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="error-panel" role="alert">
      <b>
        {graphicsLost
          ? 'The picture needs a moment.'
          : 'The horse needs a moment.'}
      </b>
      <p>
        {error ||
          'Your run is paused while the picture recovers. You can reload if it does not return.'}
      </p>
      <button className="start-button" onClick={onRetry}>
        {graphicsLost ? 'RELOAD GAME' : 'TRY AGAIN'}
      </button>
    </div>
  );
}

/** The live commentary strip, which only carries text during a crash or replay. */
export function Ticker({
  game,
  showing,
}: {
  game: GameState;
  showing: boolean;
}) {
  return (
    <div className={`ticker ${showing ? 'has-commentary' : ''}`}>
      <div className="play-caption" aria-live="polite" aria-atomic="true">
        {showing ? game.wreck?.caption : ''}
      </div>
    </div>
  );
}
