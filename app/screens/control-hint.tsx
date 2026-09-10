import { ArrowUp, Zap } from 'lucide-react';
import type { Action } from '@/lib/game/simulation';

const ARROW_LABELS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/** Renders a `KeyboardEvent.code` as the glyph a player recognises on a key cap. */
function keyLabel(code: string) {
  return ARROW_LABELS[code] ?? code.replace(/^Key|^Digit/, '');
}

/**
 * The keyboard, mouse and touch bindings for one action, shown on the title
 * screen and in the first-run guide. `keyCode` is a `KeyboardEvent.code`.
 */
export function ControlHint({
  action,
  keyCode,
}: {
  action: Action;
  keyCode: string;
}) {
  const primary = action === 'primary';
  return (
    <div className="guide-input">
      <span className="guide-keyboard">
        <kbd className={`guide-key ${action}`}>{keyLabel(keyCode)}</kbd>
        <span className="guide-mouse">
          or {primary ? 'left click' : 'right click'}
        </span>
      </span>
      <span className="guide-touch">
        <span className={`guide-key ${action}`} aria-hidden="true">
          {primary ? <Zap size={18} /> : <ArrowUp size={18} />}
        </span>
        <b>{primary ? 'Tap left' : 'Tap right'}</b>
      </span>
    </div>
  );
}
