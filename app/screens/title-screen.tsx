import {
  Map,
  MoveRight,
  Package,
  Play,
  Skull,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ControlHint } from './control-hint';
import { CAMPAIGNS, campaignStep } from '@/lib/game/campaign';
import type { SaveData } from '@/lib/game/storage';

/** One row of the how-to-play table: the phase, then each control's verb. */
const GUIDE_ROWS: [phase: string, primary: string, secondary: string][] = [
  ['On track', 'Run', 'Jump'],
  ['In air', 'Flap', 'Roll'],
  ['On landing', 'Kick', 'Ability'],
];

/** The static control guide shown above the play buttons. */
function ControlGuide({ save }: { save: SaveData }) {
  return (
    <fieldset className="home-controls" aria-label="How to play">
      <div className="guide-row guide-inputs">
        <span aria-hidden="true" />
        <ControlHint action="primary" keyCode={save.primaryKey} />
        <ControlHint action="secondary" keyCode={save.secondaryKey} />
      </div>
      {GUIDE_ROWS.map(([phase, primary, secondary]) => (
        <div className="guide-row" key={phase}>
          <span className="guide-phase">{phase}</span>
          <span className="guide-action">
            <b>{primary}</b>
            {primary === 'Run' && <small>(tap)</small>}
          </span>
          <span className="guide-action">
            <b>{secondary}</b>
          </span>
        </div>
      ))}
    </fieldset>
  );
}

/** Subtitle under the main button: where a saved tour stands, or what a new one is. */
function tourSubtitle(save: SaveData) {
  if (!save.run) return CAMPAIGNS[save.campaign].detail;
  return `Event ${save.run.stage + 1} / ${campaignStep(save.run).events}`;
}

/** The title screen: the control guide, the two ways in, and the side doors. */
export function TitleScreen({
  save,
  ready,
  challengeWarning,
  dailyBest,
  onPlayTour,
  onNewTour,
  onQuickPlay,
  onDaily,
  onLevels,
  onWardrobe,
  onUpgrades,
}: {
  save: SaveData;
  ready: boolean;
  challengeWarning: string;
  dailyBest: number | undefined;
  onPlayTour: () => void;
  onNewTour: () => void;
  onQuickPlay: () => void;
  onDaily: () => void;
  onLevels: () => void;
  onWardrobe: () => void;
  onUpgrades: () => void;
}) {
  return (
    <div className="tour-home">
      <h1 aria-label="Hoof & Yeet">
        hoof<span>&</span>yeet
      </h1>
      <ControlGuide save={save} />
      {challengeWarning && (
        <p className="challenge-warning">{challengeWarning}</p>
      )}
      <div className="home-actions">
        <button className="start-button" disabled={!ready} onClick={onPlayTour}>
          <span>
            <b>{save.run ? 'RESUME TOUR' : 'PLAY TOUR'}</b>
            <small>{tourSubtitle(save)}</small>
          </span>
          <Play size={22} fill="currentColor" />
        </button>
        <button className="quick-play" disabled={!ready} onClick={onQuickPlay}>
          <Zap size={20} />
          <span>Quick play</span>
        </button>
      </div>
      <nav className="home-destinations" aria-label="Explore the game">
        <button onClick={onLevels}>
          <Map />
          <span>Levels</span>
        </button>
        <button disabled={!ready} onClick={onWardrobe}>
          <Sparkles />
          <span>Pony & hats</span>
        </button>
        <button onClick={onUpgrades}>
          <Package />
          <span>Upgrades</span>
        </button>
      </nav>
      <div className="mode-buttons">
        {save.run && (
          <button disabled={!ready} onClick={onNewTour}>
            New tour <MoveRight size={15} />
          </button>
        )}
        <button
          disabled={!ready}
          onClick={onDaily}
          title={
            dailyBest
              ? `Daily best: ${dailyBest.toLocaleString()}`
              : 'Today’s shared course'
          }
        >
          Daily <Skull size={15} />
        </button>
      </div>
    </div>
  );
}
