import { Skull } from 'lucide-react';
import { StyleReadout } from '../performance';
import { relicArt, relicById } from '@/lib/game/content';
import { jumpTarget, type GameState } from '@/lib/game/simulation';
import { objective, type RunState } from '@/lib/game/run';

type Goal = ReturnType<typeof objective> | null;

/** Metres gained after touchdown, which the flight distance does not include. */
function afterLandingMetres(game: GameState) {
  return Math.max(0, game.distance - (game.flightDistance ?? game.distance));
}

/** Distance while airborne and after landing; a speed meter before launch. */
function HudMetric({
  game,
  run,
  goal,
  crashing,
  speed,
  contractClear,
}: {
  game: GameState;
  run: RunState | null;
  goal: Goal;
  crashing: boolean;
  speed: number;
  contractClear: boolean;
}) {
  return (
    <div className="hud-metric">
      {game.launched ? (
        <>
          <span>{crashing ? 'Total distance' : 'Distance'}</span>
          <strong>
            {game.distance.toFixed(1)}
            <small> m</small>
          </strong>
          {crashing && (
            <span>+{afterLandingMetres(game).toFixed(1)} m after landing</span>
          )}
        </>
      ) : (
        <>
          <span>Speed</span>
          <meter
            className="speed-track"
            aria-label="Speed"
            value={Math.round(speed * 100)}
            min={0}
            max={100}
          />
        </>
      )}
      {game.launched && !crashing && run?.mode !== 'quick' && (
        <span className={contractClear ? 'target-cleared' : ''}>
          {game.distance >= (goal?.distance ?? 0) ? '✓' : '↗'} {goal?.distance}{' '}
          m target
        </span>
      )}
    </div>
  );
}

/** Wording for the ability slot, which depends on whether it is still spendable. */
function abilityStatus(game: GameState, crashing: boolean) {
  if (!crashing) return 'Right control after landing';
  return game.wreck?.abilityReady ? 'Use the right control now' : 'Used';
}

/** The equipped ability, highlighted while it can still be spent. */
function AbilityHint({
  game,
  crashing,
}: {
  game: GameState;
  crashing: boolean;
}) {
  const ready = crashing && game.wreck?.abilityReady;
  return (
    <div
      className={`ability-hint ${ready ? 'is-ready' : ''}`}
      aria-label="Equipped ability"
    >
      <img src={relicArt(game.ability)} alt="" width={32} height={32} />
      <span>
        <b>{relicById(game.ability).name}</b>
        <small>{abilityStatus(game, crashing)}</small>
      </span>
    </div>
  );
}

/** Prompt telling the player when to hit the jump during the run-up. */
function timingLabel(jump: ReturnType<typeof jumpTarget>) {
  if (jump.ready) return '↑ JUMP!';
  return jump.late ? '↑ LAST CHANCE!' : 'TAP TO GALLOP';
}

/** The in-play overlay: readouts, the countdown, the jump cue and the replay exit. */
export function PlayHud({
  game,
  run,
  goal,
  jump,
  speed,
  crashing,
  replay,
  contractClear,
  hudRef,
  onSkipReplay,
}: {
  game: GameState;
  run: RunState | null;
  goal: Goal;
  jump: ReturnType<typeof jumpTarget>;
  speed: number;
  crashing: boolean;
  replay: boolean;
  contractClear: boolean;
  hudRef: (node: HTMLDivElement | null) => void;
  onSkipReplay: () => void;
}) {
  return (
    <>
      <div className="hud" ref={hudRef}>
        <HudMetric
          game={game}
          run={run}
          goal={goal}
          crashing={crashing}
          speed={speed}
          contractClear={contractClear}
        />
        <StyleReadout game={game} />
        {game.phase !== 'title' && !replay && (
          <AbilityHint game={game} crashing={crashing} />
        )}
        {game.boss && game.launched && (
          <div className="boss-progress" aria-label="Boss objective">
            <span>
              <Skull size={15} /> {game.bossHits}/{goal?.bossHits} hits
            </span>
            <span>
              {game.havoc}/{goal?.havoc} havoc
            </span>
          </div>
        )}
      </div>
      {game.phase === 'countdown' && !game.paused && (
        <div className="countdown">
          <b key={game.countdownBeat}>{game.countdownBeat || 'GO!'}</b>
        </div>
      )}
      {game.phase === 'runup' && !game.paused && (
        <div className={`timing-cue ${jump.ready ? 'jump-now' : ''}`}>
          <span>{timingLabel(jump)}</span>
        </div>
      )}
      {replay && (
        <button className="skip-replay" onClick={onSkipReplay}>
          Done
        </button>
      )}
    </>
  );
}
