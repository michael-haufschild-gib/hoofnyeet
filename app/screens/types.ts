import type { GameController } from '@/lib/game/controller';
import type { RunMode } from '@/lib/game/run';
import type { Campaign } from '@/lib/game/campaign';

/**
 * Which modal the page is showing, or `null` for none. The page keeps the
 * chosen panel mounted through Base UI's exit animation, so this outlives the
 * open state by one animation.
 */
export type PanelId =
  | 'settings'
  | 'scrapbook'
  | 'clip'
  | 'levels'
  | 'upgrades'
  | 'replacement'
  | null;

/**
 * The live controller, or `null` before the canvas mounts and after it is
 * disposed. Screens read it through a ref because the controller outlives any
 * single render and must never be a render dependency.
 */
export type ControllerRef = { current: GameController | null };

/**
 * The callbacks every screen shares. They live on one object because the
 * screens are composition-root children: passing them individually would make
 * each level of the tree restate the same list.
 */
export interface ShellActions {
  focus: () => void;
  open: (panel: PanelId) => void;
  start: (mode: RunMode, campaign?: Campaign) => void;
  launch: () => void;
  takeUpgrade: (id: string, replace?: string) => void;
  continueTour: () => void;
  setShopping: (shopping: boolean) => void;
  openWardrobe: () => void;
  chooseOffer: (id: string, trigger: HTMLButtonElement) => void;
}
