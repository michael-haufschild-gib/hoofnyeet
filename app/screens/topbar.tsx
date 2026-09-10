import { Settings2, Volume2, VolumeX } from 'lucide-react';

/**
 * The persistent header: the brand button returns home, and the two icon
 * buttons toggle all sound and open settings. `soundOn` is true when either
 * the music or the effects preference is enabled.
 */
export function Topbar({
  soundOn,
  onHome,
  onToggleSound,
  onSettings,
}: {
  soundOn: boolean;
  onHome: () => void;
  onToggleSound: () => void;
  onSettings: () => void;
}) {
  return (
    <header className="topbar">
      <button
        className="brand"
        onClick={onHome}
        aria-label="Hoof and Yeet home"
      >
        hoof<span>&</span>yeet
      </button>
      <div className="header-actions">
        <button
          className="icon-button"
          aria-label={soundOn ? 'Mute sound' : 'Enable sound'}
          onClick={onToggleSound}
        >
          {soundOn ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
        <button
          className="icon-button"
          aria-label="Settings and hats"
          onClick={onSettings}
        >
          <Settings2 size={19} />
        </button>
      </div>
    </header>
  );
}
