import { ChevronRight, MoveRight, Play, RotateCcw, Share2 } from 'lucide-react';
import { RoutineVerdict } from '../performance';
import { hatAsset, hatById } from '@/lib/game/catalogue/cosmetics';
import { LANDINGS, type GameState, type Hat } from '@/lib/game/simulation';
import { objective, type RunState } from '@/lib/game/run';
import { campaignStep } from '@/lib/game/campaign';

type Route = ReturnType<typeof campaignStep> | null;
type Goal = ReturnType<typeof objective> | null;

/** Metres gained after touchdown, which the flight distance does not include. */
function afterLandingMetres(game: GameState) {
  return Math.max(0, game.distance - (game.flightDistance ?? game.distance));
}

/** The banner across the top: how the run ended, or how good the attempt was. */
function stampText(run: RunState, route: Route, newBest: boolean) {
  if (run.status === 'won' && run.mode !== 'quick') {
    return `${route?.campaign === 'grand' ? 'GRAND ' : ''}TOUR COMPLETE`;
  }
  if (run.status === 'lost') return 'OUT OF TRIES';
  if (run.status === 'briefing') return `${run.insurance} TRIES LEFT`;
  return newBest ? 'NEW BEST' : 'NICE YEET.';
}

/** Why the event was not cleared, when the attempt fell short. */
function ResultReason({
  game,
  run,
  goal,
}: {
  game: GameState;
  run: RunState;
  goal: Goal;
}) {
  const shortfall =
    game.failed || run.status === 'briefing' || run.status === 'lost';
  if (!shortfall) return null;
  return <p className="result-reason">{reasonText(game, goal)}</p>;
}

/** The sentence inside the shortfall note. */
function reasonText(game: GameState, goal: Goal) {
  if (game.failed) return game.failureReason;
  if (goal?.boss && game.bossHits < goal.bossHits) {
    const remaining = goal.bossHits - game.bossHits;
    return `${game.bossHits}/${goal.bossHits} boss hits · ${remaining} more needed.`;
  }
  return `Reach ${goal?.distance} m to clear this event.`;
}

/** The three headline numbers, plus the tour total outside quick play. */
function ResultStats({
  game,
  run,
  newTourBest,
}: {
  game: GameState;
  run: RunState;
  newTourBest: boolean;
}) {
  return (
    <div className="result-stats">
      <span>
        <b>{game.havoc}</b> havoc
      </span>
      <span>
        <b>{game.style}</b> style
      </span>
      {run.mode !== 'quick' && (
        <span
          className={newTourBest ? 'new-tour-record' : ''}
          aria-label="Tour score"
        >
          <b>{run.score.toLocaleString()}</b>{' '}
          {newTourBest ? 'tour best' : 'total'}
        </span>
      )}
    </div>
  );
}

/** Shortcut into the wardrobe when this attempt unlocked a hat. */
function UnlockNote({ hats, onOpen }: { hats: Hat[]; onOpen: () => void }) {
  const latest = hats.at(-1);
  if (!latest) return null;
  return (
    <button className="unlock-note" onClick={onOpen}>
      <img src={hatAsset(latest)} width={23} height={23} alt="" />
      {hatById(latest).name} unlocked
      {hats.length > 1 && ` +${hats.length - 1}`}
      <ChevronRight size={13} />
    </button>
  );
}

/** The one primary button, whose destination depends on how the run stands. */
function MainAction({
  run,
  onNext,
  onRetry,
  onAgain,
}: {
  run: RunState;
  onNext: () => void;
  onRetry: () => void;
  onAgain: () => void;
}) {
  if (run.status === 'pitstop') {
    return (
      <button className="start-button" onClick={onNext}>
        NEXT <MoveRight size={20} />
      </button>
    );
  }
  if (run.status === 'briefing') {
    return (
      <button className="start-button" onClick={onRetry}>
        TRY AGAIN <RotateCcw size={18} />
      </button>
    );
  }
  return (
    <button className="start-button" onClick={onAgain}>
      {run.mode === 'quick' ? 'AGAIN' : 'PLAY AGAIN'} <RotateCcw size={18} />
    </button>
  );
}

/** The post-attempt scorecard and the ways onward from it. */
export function AttemptResults({
  game,
  run,
  route,
  goal,
  newBest,
  newTourBest,
  newHats,
  notice,
  onWardrobe,
  onNext,
  onRetry,
  onAgain,
  onReplay,
  onShare,
}: {
  game: GameState;
  run: RunState;
  route: Route;
  goal: Goal;
  newBest: boolean;
  newTourBest: boolean;
  newHats: Hat[];
  notice: string;
  onWardrobe: () => void;
  onNext: () => void;
  onRetry: () => void;
  onAgain: () => void;
  onReplay: () => void;
  onShare: () => void;
}) {
  return (
    <section className="result-screen" aria-label="Attempt results">
      <div className="result-content">
        <div className="result-overview">
          <div className={`result-stamp ${newBest ? 'new-best' : ''}`}>
            {stampText(run, route, newBest)}
          </div>
          <h2>
            {game.failed ? 'Premature yeet.' : LANDINGS[game.landing].name}
          </h2>
          <p className="result-measure">
            {(game.flightDistance ?? game.distance).toFixed(1)} m jump +{' '}
            {afterLandingMetres(game).toFixed(1)} m after landing
          </p>
          <div className="result-distance">
            {game.distance.toFixed(1)}
            <span>m</span>
          </div>
          <ResultStats game={game} run={run} newTourBest={newTourBest} />
          <ResultReason game={game} run={run} goal={goal} />
          <UnlockNote hats={newHats} onOpen={onWardrobe} />
        </div>
        <RoutineVerdict game={game} />
      </div>
      <div className="result-main-actions">
        <MainAction
          run={run}
          onNext={onNext}
          onRetry={onRetry}
          onAgain={onAgain}
        />
      </div>
      <div className="result-links">
        <button onClick={onReplay}>
          <Play size={14} /> Replay
        </button>
        <button onClick={onShare}>
          <Share2 size={15} /> Share
        </button>
      </div>
      {notice && <p className="inline-notice">{notice}</p>}
    </section>
  );
}
