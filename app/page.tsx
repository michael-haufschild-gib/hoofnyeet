import { useCallback, useEffect, useRef, useState } from 'react';
import { Topbar } from './screens/topbar';
import { Arena } from './screens/arena';
import { ActionPads } from './screens/action-pads';
import { LiveAnnouncer, TutorialDialog } from './screens/shell-chrome';
import { PanelDialog } from './panels/panel-dialog';
import { deriveView } from './screens/derive-view';
import { shellActions } from './screens/shell-actions';
import { useClipExport } from './screens/use-clip-export';
import { usePanelState, type PanelStateStore } from './screens/use-panel-state';
import { usePonyPortraits } from './screens/use-pony-portraits';
import type { ControllerRef } from './screens/types';
import { GameController, type ViewState } from '@/lib/game/controller';
import { createGame } from '@/lib/game/simulation';
import { defaultSave } from '@/lib/game/storage';
import { registerGameTools } from '@/lib/game/webmcp';
import { parseChallenge } from '@/lib/game/run';

const initial: ViewState = {
  game: createGame(),
  save: defaultSave(),
  run: null,
  screen: 'home',
  ready: false,
  error: '',
  graphicsLost: false,
  preparation: null,
  tutorial: false,
  newBest: false,
  newTourBest: false,
  newHats: [],
  wardrobe: null,
  fps: 60,
};

/** Warns when the address carries a challenge this build can no longer run. */
function challengeWarningFor() {
  const search = window.location.search;
  if (!new URLSearchParams(search).has('seed')) return '';
  if (parseChallenge(search)) return '';
  return 'That challenge uses an older or unsupported course. Start a fresh run below.';
}

/** The class list on the page root, which drives the per-screen layout. */
function pageClassName(view: ViewState, home: boolean, playing: boolean) {
  const reduced = view.save.reduced ? 'reduced-motion' : '';
  const state = `${home ? 'is-home' : ''} ${playing ? 'is-active' : ''}`;
  return `game-page unstable play-first ${state} ${reduced}`;
}

/**
 * Constructs the controller against the mounted canvas and returns the
 * teardown that disposes it, unregisters its tools, and cancels any export
 * still encoding. Called from an effect, never during render.
 */
function attachController(
  canvas: HTMLCanvasElement,
  controller: ControllerRef,
  exportAbort: { current: AbortController | null },
  setView: (view: ViewState) => void,
) {
  const session = new GameController(canvas, setView);
  controller.current = session;
  const unregister = registerGameTools(session);
  if (import.meta.env.DEV) {
    (window as Window & { __hoof?: GameController }).__hoof = session;
  }
  return () => {
    exportAbort.current?.abort();
    unregister();
    session.dispose();
    controller.current = null;
    Reflect.deleteProperty(window, '__hoof');
  };
}

/** The two dialogs the page can raise over the arena. */
function Dialogs({
  view,
  panels,
  portraits,
  clipExport,
  controller,
  actions,
}: {
  view: ViewState;
  panels: PanelStateStore;
  portraits: ReturnType<typeof usePonyPortraits>;
  clipExport: ReturnType<typeof useClipExport>;
  controller: ControllerRef;
  actions: ReturnType<typeof shellActions>;
}) {
  return (
    <>
      <PanelDialog
        view={view}
        state={{
          panel: panels.panel,
          open: panels.open,
          replacement: panels.replacement,
          incidents: panels.incidents,
          settingsTab: panels.tab,
          remap: panels.remap,
          portraits: portraits.portraits,
          portraitError: portraits.error,
        }}
        actions={{ ...actions, retryPortraits: portraits.retry }}
        clipExport={clipExport}
        controller={controller}
      />
      <TutorialDialog
        open={view.tutorial}
        save={view.save}
        onDismiss={() => {
          controller.current?.dismissTutorial();
          actions.focus();
        }}
      />
    </>
  );
}

/**
 * The single page. It owns the controller, the view state the controller
 * publishes, and the panel state the dialogs read; every screen below it is a
 * pure function of those.
 */
export default function Home() {
  const [challengeWarning] = useState(challengeWarningFor);
  const canvas = useRef<HTMLCanvasElement>(null),
    controller = useRef<GameController | null>(null),
    exportAbort = useRef<AbortController | null>(null),
    shop = useRef<HTMLDivElement | null>(null),
    replacementTrigger = useRef<HTMLButtonElement | null>(null);
  const [view, setView] = useState(initial),
    [shopping, setShopping] = useState(false);
  const panels = usePanelState();
  const clipExport = useClipExport(controller, exportAbort);
  const portraits = usePonyPortraits(
    controller,
    view,
    panels.panel === 'settings' && panels.tab === 'wardrobe',
  );

  useEffect(() => {
    if (shopping) shop.current?.scrollIntoView({ block: 'nearest' });
  }, [shopping]);
  useEffect(() => {
    if (!canvas.current) return;
    return attachController(canvas.current, controller, exportAbort, setView);
  }, []);
  const hudRef = useCallback((node: HTMLDivElement | null) => {
    controller.current?.observeHud(node);
  }, []);

  const derived = deriveView(view);
  const actions = shellActions(() => ({
    controller,
    canvas,
    replacementTrigger,
    panels,
    shopping,
    setShopping,
    playing: derived.playing,
    run: derived.run,
    clipExport,
  }));

  return (
    <main className={pageClassName(view, derived.home, derived.playing)}>
      <Topbar
        soundOn={!!(view.save.music || view.save.effects)}
        onHome={() => controller.current?.home()}
        onToggleSound={() => {
          const on = !(view.save.music || view.save.effects);
          controller.current?.setPreference('music', on);
          controller.current?.setPreference('effects', on);
        }}
        onSettings={() => actions.open('settings')}
      />
      <Arena
        view={view}
        derived={derived}
        controller={controller}
        canvasRef={canvas}
        hudRef={hudRef}
        shopRef={shop}
        challengeWarning={challengeWarning}
        shopping={shopping}
        notice={clipExport.notice}
        actions={actions}
      />
      {derived.playing ? (
        <ActionPads
          game={derived.game}
          save={view.save}
          crashing={derived.crashing}
          air={derived.air}
          controller={controller}
        />
      ) : null}
      <Dialogs
        view={view}
        panels={panels}
        portraits={portraits}
        clipExport={clipExport}
        controller={controller}
        actions={actions}
      />
      <LiveAnnouncer derived={derived} />
    </main>
  );
}
