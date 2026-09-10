import { useState } from 'react';
import type { Incident } from '@/lib/game/sharing';
import type { ReplacementChoice } from '../equipment-choice';
import type { RemapTarget, SettingsTab } from '../panels/settings-panel';
import type { PanelId } from './types';

/**
 * The modal state the page owns. `panel` outlives `open` by one exit
 * animation, because Base UI keeps the popup mounted while it plays.
 */
export function usePanelState() {
  const [panel, setPanel] = useState<PanelId>(null);
  const [open, setOpen] = useState(false);
  const [replacement, setReplacement] = useState<ReplacementChoice | null>(
    null,
  );
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [remap, setRemap] = useState<RemapTarget>(null);
  const [tab, setTab] = useState<SettingsTab>('controls');
  return {
    panel,
    setPanel,
    open,
    setOpen,
    replacement,
    setReplacement,
    incidents,
    setIncidents,
    remap,
    setRemap,
    tab,
    setTab,
  };
}

/** The shape `usePanelState` returns, threaded through the dialog tree. */
export type PanelStateStore = ReturnType<typeof usePanelState>;
