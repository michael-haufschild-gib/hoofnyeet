import { ArrowUp, Play, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { ControlHint } from './control-hint';
import type { GameState } from '@/lib/game/simulation';
import type { SaveData } from '@/lib/game/storage';
import type { Derived } from './derive-view';

/** The first-run guide, shown once until the player dismisses it. */
export function TutorialDialog({
  open,
  save,
  onDismiss,
}: {
  open: boolean;
  save: SaveData;
  onDismiss: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DialogContent className="first-run-guide" showCloseButton={false}>
        <DialogTitle>How to play</DialogTitle>
        <DialogDescription>
          Keep tapping to build speed. Jump when the arrow turns green.
        </DialogDescription>
        <div className="first-run-actions">
          <div className="first-run-action">
            <Zap className="lesson-icon" size={34} aria-hidden="true" />
            <b>Tap to run</b>
            <ControlHint action="primary" keyCode={save.primaryKey} />
            <span>
              In air: <strong>Flap</strong>
            </span>
          </div>
          <div className="first-run-action jump-lesson">
            <ArrowUp className="lesson-icon" size={34} aria-hidden="true" />
            <b>Jump on green</b>
            <ControlHint action="secondary" keyCode={save.secondaryKey} />
            <span>
              In air: <strong>Roll</strong>
            </span>
          </div>
        </div>
        <button className="start-button" onClick={onDismiss}>
          LET’S GO <Play size={20} />
        </button>
      </DialogContent>
    </Dialog>
  );
}

/** The single sentence a screen reader is given when the moment changes. */
function announcement(game: GameState, derived: Derived) {
  if (derived.results) {
    return `Attempt complete. ${game.distance.toFixed(1)} metres. ${game.havoc} havoc.`;
  }
  if (game.phase === 'runup' && derived.jump.ready) return 'Jump now';
  return game.phase === 'countdown' ? 'Get ready' : '';
}

/** The polite live region that narrates the run for assistive technology. */
export function LiveAnnouncer({ derived }: { derived: Derived }) {
  return (
    <span className="sr-only" aria-live="polite">
      {announcement(derived.game, derived)}
    </span>
  );
}
