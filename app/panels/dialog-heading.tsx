import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { SaveData } from '@/lib/game/storage';
import type { PanelId } from '../screens/types';
import type { SettingsTab } from './settings-panel';

/** Heading for the open panel. Settings changes with the tab it is showing. */
function panelTitle(panel: PanelId, tab: SettingsTab) {
  if (panel === 'settings') {
    return tab === 'wardrobe' ? 'Pony & hats' : 'Settings';
  }
  if (panel === 'replacement') return 'Replace a perk';
  if (panel === 'clip') return 'Share your yeet';
  if (panel === 'levels') return 'Choose a level';
  if (panel === 'upgrades') return 'Upgrades';
  return 'Scrapbook';
}

/** Screen-reader description for the open panel. */
function panelDescription(panel: PanelId, save: SaveData) {
  if (panel === 'settings') {
    return 'Dress for the job. Reassign the buttons. Negotiate with gravity.';
  }
  if (panel === 'replacement') {
    return 'Choose one equipped perk to replace. Your build stays unchanged until you choose.';
  }
  if (panel === 'clip') {
    return 'Your actual recorded disaster, with sound. Nothing is uploaded automatically.';
  }
  if (panel === 'levels') {
    return 'Quick play in any of the six worlds. Your tour stays saved.';
  }
  if (panel === 'upgrades') {
    return 'Win tour events to choose upgrades. Abilities are used after landing; perks work automatically.';
  }
  return `${save.rounds} attempts. ${save.wins} completed tours. ${save.discoveries.length}/24 discoveries. Saved on this device.`;
}

/** Title and screen-reader description for whichever panel the dialog holds. */
export function DialogHeading({
  panel,
  tab,
  save,
}: {
  panel: PanelId;
  tab: SettingsTab;
  save: SaveData;
}) {
  return (
    <div className="dialog-heading">
      <DialogTitle>{panelTitle(panel, tab)}</DialogTitle>
      <DialogDescription className="sr-only">
        {panelDescription(panel, save)}
      </DialogDescription>
    </div>
  );
}

/** Extra classes the dialog shell needs for the panel it is showing. */
export function dialogClassName(panel: PanelId) {
  const clip = panel === 'clip' ? 'clip-dialog' : '';
  const browse =
    panel === 'levels' || panel === 'upgrades' ? 'browse-dialog' : '';
  const equipment = panel === 'replacement' ? 'equipment-dialog' : '';
  return `horse-dialog ${clip} ${browse} ${equipment}`;
}
