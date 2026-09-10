import { jumpTarget, PHYSICS, type GameState } from '@/lib/game/simulation';
import { campaignStep } from '@/lib/game/campaign';
import {
  availableWorlds,
  dailyKey,
  objective,
  tourRecordKey,
  type RunState,
} from '@/lib/game/run';
import { WORLDS } from '@/lib/game/content';
import type { ViewState } from '@/lib/game/controller';

/** Levels the run may choose between. Quick play never leaves the first world. */
function worldsFor(run: RunState | null) {
  if (!run) return [];
  return run.mode === 'quick' ? [WORLDS[0]] : availableWorlds(run);
}

/** Run-up speed as a 0..1 fraction of the playable range, for the meter. */
function speedFraction(game: GameState) {
  const span = PHYSICS.maxSpeed - PHYSICS.minSpeed;
  return Math.max(0, (game.speed - PHYSICS.minSpeed) / span);
}

/** True once this attempt has met every requirement of the current event. */
function contractCleared(
  game: GameState,
  goal: ReturnType<typeof objective> | null,
) {
  return (
    !!goal &&
    !game.failed &&
    game.distance >= goal.distance &&
    game.havoc >= goal.havoc &&
    game.bossHits >= goal.bossHits
  );
}

/** The personal best for today's daily under the current tapping mode. */
function dailyBestOf(view: ViewState) {
  const today = new Date().toISOString().slice(0, 10);
  return view.save.daily[dailyKey(today, view.save.assisted)];
}

/**
 * Everything the screens read that is a pure function of the view state.
 * Deriving it in one place keeps the page component free of the branching
 * these values would otherwise scatter through the markup.
 */
export function deriveView(view: ViewState) {
  const game = view.game;
  const run = view.run;
  const goal = run ? objective(run) : null;
  const tourKey = run ? tourRecordKey(run) : null;
  return {
    game,
    run,
    goal,
    home: view.screen === 'home',
    playing: view.screen === 'game',
    results: view.screen === 'results',
    crashing: game.phase === 'landing',
    air: game.phase === 'flight',
    replay: game.phase === 'replay',
    route: run ? campaignStep(run) : null,
    worlds: worldsFor(run),
    jump: jumpTarget(game),
    speed: speedFraction(game),
    build: run ? [...run.passives, run.ability] : [],
    contractClear: contractCleared(game, goal),
    dailyBest: dailyBestOf(view),
    tourBest: tourKey ? view.save.tourBests[tourKey] : 0,
  };
}

/** The shape `deriveView` returns, passed down to every screen. */
export type Derived = ReturnType<typeof deriveView>;
