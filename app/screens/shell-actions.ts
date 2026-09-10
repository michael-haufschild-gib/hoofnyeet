import type { RefObject } from 'react';
import { listIncidents } from '@/lib/game/sharing';
import type { Campaign } from '@/lib/game/campaign';
import type { RunMode, RunState } from '@/lib/game/run';
import { relicById } from '@/lib/game/content';
import type { ControllerRef, PanelId, ShellActions } from './types';
import type { useClipExport } from './use-clip-export';
import type { PanelStateStore } from './use-panel-state';

/** Everything the page-level actions read or write. */
export interface ShellContext {
  controller: ControllerRef;
  canvas: RefObject<HTMLCanvasElement | null>;
  replacementTrigger: RefObject<HTMLButtonElement | null>;
  panels: PanelStateStore;
  shopping: boolean;
  setShopping: (shopping: boolean) => void;
  playing: boolean;
  run: RunState | null;
  clipExport: ReturnType<typeof useClipExport>;
}

/**
 * The context is produced lazily, once an action actually runs. Building it
 * during render would put React refs in an object the renderer can see, which
 * the React compiler rejects.
 */
type ShellContextFactory = () => ShellContext;

/** Returns focus to the play field without scrolling the page to reach it. */
function focusField(ctx: ShellContext) {
  ctx.canvas.current?.focus({ preventScroll: true });
}

/**
 * Where focus lands after the replace-a-perk dialog closes: back to the button
 * that opened it when it still exists, and otherwise to whatever the current
 * screen offers, so focus is never dropped onto the document body.
 */
function replacementFocus(ctx: ShellContext) {
  const screen = ctx.controller.current?.screen;
  if (screen === 'game') return ctx.canvas.current;
  if (screen === 'briefing') {
    return document.querySelector<HTMLButtonElement>(
      '.route-card:not(:disabled)',
    );
  }
  const trigger = ctx.replacementTrigger.current;
  if (trigger?.isConnected && !trigger.disabled) return trigger;
  return document.querySelector<HTMLButtonElement>(
    '.pitstop-tools .start-button',
  );
}

/**
 * Closes the open panel. Base UI keeps the popup mounted through its exit
 * animation, so identity and contents are preserved until `finishClose`.
 */
function closePanel(ctx: ShellContext) {
  ctx.clipExport.abort.current?.abort();
  ctx.panels.setOpen(false);
  ctx.panels.setRemap(null);
}

/** Drops the closed panel's contents once its exit animation has finished. */
function finishClose(ctx: ShellContext) {
  ctx.panels.setPanel(null);
  ctx.panels.setReplacement(null);
}

/** Opens a panel, pausing a live run and loading whatever that panel shows. */
function openPanel(ctx: ShellContext, panel: PanelId) {
  if (ctx.playing) ctx.controller.current?.pause(true);
  ctx.panels.setPanel(panel);
  ctx.panels.setOpen(panel !== null);
  ctx.clipExport.setNotice('');
  if (panel === 'scrapbook') void listIncidents().then(ctx.panels.setIncidents);
  if (panel === 'clip') ctx.clipExport.selectCurrent(ctx.run);
}

/** Equips an offer, closing the replace dialog and moving on unless shopping. */
function takeUpgrade(ctx: ShellContext, id: string, replace?: string) {
  const controller = ctx.controller.current;
  if (!controller?.choose(id, replace)) return;
  if (ctx.panels.panel === 'replacement') closePanel(ctx);
  if (!ctx.shopping) void controller.next(true).then(() => focusField(ctx));
}

/**
 * Takes an offer directly, unless it is a passive and the build is already
 * full, in which case the player must first choose what it replaces.
 */
function chooseOffer(
  ctx: ShellContext,
  id: string,
  trigger: HTMLButtonElement,
) {
  const run = ctx.run;
  if (run && relicById(id).category !== 'active' && run.passives.length >= 4) {
    ctx.replacementTrigger.current = trigger;
    ctx.panels.setReplacement({
      incoming: id,
      passives: [...run.passives],
      ability: run.ability,
    });
    openPanel(ctx, 'replacement');
    return;
  }
  takeUpgrade(ctx, id);
}

/** Starts a run, clearing any notice left over from the previous one. */
function startRun(ctx: ShellContext, mode: RunMode, campaign?: Campaign) {
  ctx.controller.current?.startRun(mode, campaign);
  ctx.clipExport.setNotice('');
}

/** Leaves the pit stop for the next event. */
function continueTour(ctx: ShellContext) {
  ctx.setShopping(false);
  void ctx.controller.current?.next(true).then(() => focusField(ctx));
}

/** Opens the wardrobe, which lives behind the settings dialog's second tab. */
function openWardrobe(ctx: ShellContext) {
  ctx.panels.setTab('wardrobe');
  openPanel(ctx, 'settings');
}

/** Binds the page-level actions to one lazy context, for the screens and dialogs. */
export function shellActions(context: ShellContextFactory) {
  const actions: ShellActions = {
    focus: () => focusField(context()),
    open: (panel) => openPanel(context(), panel),
    start: (mode, campaign) => startRun(context(), mode, campaign),
    launch: () => {
      const ctx = context();
      void ctx.controller.current?.launch().then(() => focusField(ctx));
    },
    takeUpgrade: (id, replace) => takeUpgrade(context(), id, replace),
    continueTour: () => continueTour(context()),
    setShopping: (shopping) => context().setShopping(shopping),
    openWardrobe: () => openWardrobe(context()),
    chooseOffer: (id, trigger) => chooseOffer(context(), id, trigger),
  };
  return {
    ...actions,
    close: () => closePanel(context()),
    finishClose: () => finishClose(context()),
    replacementFocus: () => replacementFocus(context()),
    setPanel: (panel: PanelId) => context().panels.setPanel(panel),
    setReplacement: (
      choice: Parameters<PanelStateStore['setReplacement']>[0],
    ) => context().panels.setReplacement(choice),
    setSettingsTab: (tab: Parameters<PanelStateStore['setTab']>[0]) =>
      context().panels.setTab(tab),
    setRemap: (target: Parameters<PanelStateStore['setRemap']>[0]) =>
      context().panels.setRemap(target),
  };
}
