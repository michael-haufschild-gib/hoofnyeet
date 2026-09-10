import type { RefObject } from 'react';
import { ArenaTop, GameCanvas } from './game-canvas';
import { TitleScreen } from './title-screen';
import { Briefing } from './briefing';
import { PitStop } from './pit-stop';
import { PlayHud } from './play-hud';
import { AttemptResults } from './attempt-results';
import { CourseLoading, ErrorPanel, PauseScreen, Ticker } from './overlays';
import type { ControllerRef, ShellActions } from './types';
import type { Derived } from './derive-view';
import type { ViewState } from '@/lib/game/controller';

/** The class list the arena carries, which drives its per-screen layout. */
function arenaClassName(view: ViewState, derived: Derived) {
  const title = derived.home ? 'is-title' : 'is-playing';
  return `arena ${title} ${derived.air ? 'in-air' : ''} screen-${view.screen}`;
}

/** The screens the player navigates between: title, briefing and pit stop. */
function PlanningScreens({
  view,
  derived,
  controller,
  shopRef,
  challengeWarning,
  shopping,
  actions,
}: {
  view: ViewState;
  derived: Derived;
  controller: ControllerRef;
  shopRef: RefObject<HTMLDivElement | null>;
  challengeWarning: string;
  shopping: boolean;
  actions: ShellActions;
}) {
  const { run, goal, route } = derived;
  return (
    <>
      {derived.home && (
        <TitleScreen
          save={view.save}
          ready={view.ready}
          challengeWarning={challengeWarning}
          dailyBest={derived.dailyBest}
          onPlayTour={() => {
            if (view.save.run) {
              void controller.current?.resumeRun().then(actions.focus);
              return;
            }
            actions.start('tour');
          }}
          onNewTour={() => actions.start('tour')}
          onQuickPlay={() => {
            controller.current?.start();
            actions.focus();
          }}
          onDaily={() => actions.start('daily')}
          onLevels={() => actions.open('levels')}
          onWardrobe={actions.openWardrobe}
          onUpgrades={() => actions.open('upgrades')}
        />
      )}
      {view.screen === 'briefing' && run && (
        <Briefing
          run={run}
          route={route}
          goal={goal}
          worlds={derived.worlds}
          ready={view.ready}
          tourBest={derived.tourBest}
          onSelectCampaign={(campaign) =>
            controller.current?.selectCampaign(campaign)
          }
          onPlayWorld={(world) => {
            void controller.current?.launch(world).then(actions.focus);
          }}
        />
      )}
      {view.screen === 'pitstop' && run && (
        <PitStop
          run={run}
          route={route}
          build={derived.build}
          ready={view.ready}
          shopping={shopping}
          shopRef={shopRef}
          onChooseOffer={actions.chooseOffer}
          onToggleShopping={() => actions.setShopping(!shopping)}
          onInsurance={() => controller.current?.insurance()}
          onReroll={() => controller.current?.reroll()}
          onContinue={actions.continueTour}
        />
      )}
    </>
  );
}

/** Pause, course loading and recoverable failures, none of which are screens. */
function TransientOverlays({
  view,
  derived,
  controller,
  actions,
}: {
  view: ViewState;
  derived: Derived;
  controller: ControllerRef;
  actions: ShellActions;
}) {
  const game = derived.game;
  return (
    <>
      {game.paused && derived.playing && !view.tutorial && (
        <PauseScreen
          onResume={() => {
            controller.current?.pause(false);
            actions.focus();
          }}
          onSettings={() => actions.open('settings')}
          onHome={() => controller.current?.home()}
        />
      )}
      {view.preparation && !view.preparation.failed && !view.graphicsLost && (
        <CourseLoading
          progress={view.preparation.progress}
          onBack={() => controller.current?.home()}
        />
      )}
      {(view.error || view.graphicsLost) && (
        <ErrorPanel
          error={view.error}
          graphicsLost={view.graphicsLost}
          onRetry={() => {
            if (view.preparation && !view.graphicsLost) {
              void controller.current?.launch(view.preparation.world);
              return;
            }
            window.location.reload();
          }}
        />
      )}
    </>
  );
}

/** The screens drawn over a live or just-finished attempt. */
function PlayScreens({
  view,
  derived,
  controller,
  hudRef,
  notice,
  actions,
}: {
  view: ViewState;
  derived: Derived;
  controller: ControllerRef;
  hudRef: (node: HTMLDivElement | null) => void;
  notice: string;
  actions: ShellActions;
}) {
  const { game, run, goal, route } = derived;
  return (
    <>
      {derived.playing && (
        <PlayHud
          game={game}
          run={run}
          goal={goal}
          jump={derived.jump}
          speed={derived.speed}
          crashing={derived.crashing}
          replay={derived.replay}
          contractClear={derived.contractClear}
          hudRef={hudRef}
          onSkipReplay={() => controller.current?.skipReplay()}
        />
      )}
      {derived.results && run && (
        <AttemptResults
          game={game}
          run={run}
          route={route}
          goal={goal}
          newBest={view.newBest}
          newTourBest={view.newTourBest}
          newHats={view.newHats}
          notice={notice}
          onWardrobe={actions.openWardrobe}
          onNext={() => {
            actions.setShopping(false);
            controller.current?.pitstop();
          }}
          onRetry={actions.launch}
          onAgain={() => {
            if (run.mode === 'quick') controller.current?.start();
            else actions.start(run.mode, run.campaign);
          }}
          onReplay={() => {
            controller.current?.replayIncident();
            actions.focus();
          }}
          onShare={() => actions.open('clip')}
        />
      )}
      <TransientOverlays
        view={view}
        derived={derived}
        controller={controller}
        actions={actions}
      />
    </>
  );
}

/** The play field and every screen that is drawn over it. */
export function Arena({
  view,
  derived,
  controller,
  canvasRef,
  hudRef,
  shopRef,
  challengeWarning,
  shopping,
  notice,
  actions,
}: {
  view: ViewState;
  derived: Derived;
  controller: ControllerRef;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hudRef: (node: HTMLDivElement | null) => void;
  shopRef: RefObject<HTMLDivElement | null>;
  challengeWarning: string;
  shopping: boolean;
  notice: string;
  actions: ShellActions;
}) {
  const game = derived.game;
  return (
    <section
      className={arenaClassName(view, derived)}
      aria-label="Hoof and Yeet game"
    >
      <GameCanvas
        canvasRef={canvasRef}
        controller={controller}
        onFocus={actions.focus}
      />
      <ArenaTop derived={derived} onPause={() => controller.current?.pause()} />
      <PlanningScreens
        view={view}
        derived={derived}
        controller={controller}
        shopRef={shopRef}
        challengeWarning={challengeWarning}
        shopping={shopping}
        actions={actions}
      />
      <PlayScreens
        view={view}
        derived={derived}
        controller={controller}
        hudRef={hudRef}
        notice={notice}
        actions={actions}
      />
      <Ticker
        game={game}
        showing={
          derived.playing &&
          (derived.crashing || derived.replay) &&
          !game.paused
        }
      />
    </section>
  );
}
