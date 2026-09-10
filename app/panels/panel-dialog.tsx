import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DialogHeading, dialogClassName } from './dialog-heading';
import { LevelsPanel, UpgradesPanel } from './browse-panels';
import {
  SettingsPanel,
  type RemapTarget,
  type SettingsTab,
} from './settings-panel';
import { ScrapbookPanel } from './scrapbook-panel';
import { ClipPanel } from './clip-panel';
import { EquipmentChoice, type ReplacementChoice } from '../equipment-choice';
import type { ControllerRef, PanelId } from '../screens/types';
import type { useClipExport } from '../screens/use-clip-export';
import type { Incident } from '@/lib/game/sharing';
import type { ViewState } from '@/lib/game/controller';

/** The state the dialog owns on behalf of whichever panel is showing. */
export interface PanelState {
  panel: PanelId;
  open: boolean;
  replacement: ReplacementChoice | null;
  incidents: Incident[];
  settingsTab: SettingsTab;
  remap: RemapTarget;
  portraits: Record<string, string>;
  portraitError: string;
}

/** The writers and actions the panels call back into. */
export interface PanelActions {
  setPanel: (panel: PanelId) => void;
  setReplacement: (choice: ReplacementChoice | null) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setRemap: (target: RemapTarget) => void;
  retryPortraits: () => void;
  close: () => void;
  finishClose: () => void;
  focus: () => void;
  open: (panel: PanelId) => void;
  takeUpgrade: (id: string, replace?: string) => void;
  replacementFocus: () => HTMLElement | null;
}

/** Renders whichever panel the dialog currently holds. */
function PanelBody({
  view,
  state,
  actions,
  clipExport,
  controller,
}: {
  view: ViewState;
  state: PanelState;
  actions: PanelActions;
  clipExport: ReturnType<typeof useClipExport>;
  controller: ControllerRef;
}) {
  const { panel } = state;
  return (
    <div className="dialog-body">
      {panel === 'replacement' && state.replacement && (
        <EquipmentChoice
          choice={state.replacement}
          onChoose={actions.takeUpgrade}
        />
      )}
      {panel === 'levels' && (
        <LevelsPanel
          ready={view.ready}
          onPlay={(world) => {
            actions.close();
            controller.current?.start(world);
            actions.focus();
          }}
        />
      )}
      {panel === 'upgrades' && <UpgradesPanel save={view.save} />}
      {panel === 'settings' && (
        <SettingsPanel
          save={view.save}
          wardrobe={view.wardrobe}
          tab={state.settingsTab}
          onSelectTab={actions.setSettingsTab}
          remap={state.remap}
          onRemap={actions.setRemap}
          portraits={state.portraits}
          portraitError={state.portraitError}
          onRetryPortrait={actions.retryPortraits}
          onScrapbook={() => actions.open('scrapbook')}
          controller={controller}
        />
      )}
      {panel === 'scrapbook' && (
        <ScrapbookPanel
          save={view.save}
          incidents={state.incidents}
          onSelectIncident={(incident) => {
            clipExport.setSelected({ recording: incident.recording });
            actions.setPanel('clip');
          }}
        />
      )}
      {panel === 'clip' && (
        <ClipPanel
          clip={clipExport.clip}
          clipVideo={clipExport.clipVideo}
          progress={clipExport.progress}
          notice={clipExport.notice}
          portrait={clipExport.portrait}
          onPortrait={clipExport.setPortrait}
          clipLength={clipExport.clipLength}
          onClipLength={clipExport.setClipLength}
          captions={clipExport.captions}
          onCaptions={clipExport.setCaptions}
          canChallenge={!!clipExport.selected?.challenge}
          onChallenge={clipExport.challenge}
          onCancel={() => clipExport.abort.current?.abort()}
          onMakeClip={clipExport.makeClip}
          onSaveImage={clipExport.saveImage}
        />
      )}
    </div>
  );
}

/** The one modal shell every panel is rendered inside. */
export function PanelDialog({
  view,
  state,
  actions,
  clipExport,
  controller,
}: {
  view: ViewState;
  state: PanelState;
  actions: PanelActions;
  clipExport: ReturnType<typeof useClipExport>;
  controller: ControllerRef;
}) {
  const { panel } = state;
  return (
    <Dialog
      open={state.open}
      onOpenChange={(next) => {
        if (!next) actions.close();
      }}
      onOpenChangeComplete={(next) => {
        if (!next && !state.open) actions.finishClose();
      }}
    >
      <DialogContent
        className={dialogClassName(panel)}
        finalFocus={
          panel === 'replacement' ? actions.replacementFocus : undefined
        }
      >
        <DialogHeading panel={panel} tab={state.settingsTab} save={view.save} />
        <PanelBody
          view={view}
          state={state}
          actions={actions}
          clipExport={clipExport}
          controller={controller}
        />
        {panel === 'replacement' && (
          <div className="equipment-footer">
            <button className="text-button" onClick={actions.close}>
              Cancel
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
