import type { RefObject } from 'react';
import { Pause, Play } from 'lucide-react';
import type { ControllerRef } from './types';
import type { Derived } from './derive-view';

/** Pointer buttons the field accepts: 0 is the primary action, 2 the secondary. */
function actionForButton(button: number) {
  return button === 2 ? 'secondary' : 'primary';
}

/**
 * The play field. Pointer capture is claimed on press so a drag off the canvas
 * still releases the control, and the context menu is suppressed because the
 * right button is the secondary action.
 */
export function GameCanvas({
  canvasRef,
  controller,
  onFocus,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  controller: ControllerRef;
  onFocus: () => void;
}) {
  return (
    <canvas
      ref={canvasRef}
      tabIndex={0}
      aria-label="Hoof and Yeet game field"
      onPointerDown={(e) => {
        if (e.button !== 0 && e.button !== 2) return;
        e.preventDefault();
        onFocus();
        e.currentTarget.setPointerCapture(e.pointerId);
        const action = actionForButton(e.button);
        controller.current?.pointerDown(
          `field-${e.pointerId}-${action}`,
          action,
        );
      }}
      onPointerUp={(e) =>
        controller.current?.pointerUp(
          `field-${e.pointerId}-${actionForButton(e.button)}`,
        )
      }
      onPointerCancel={() => controller.current?.cancelPointer()}
      onLostPointerCapture={() => controller.current?.clearInputs()}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/** The event counter and pause control that sit over the top of the field. */
export function ArenaTop({
  derived,
  onPause,
}: {
  derived: Derived;
  onPause: () => void;
}) {
  const { game, run, route, playing } = derived;
  return (
    <div className="arena-top">
      {playing && run?.mode !== 'quick' && (
        <span className="event-chip">
          {(run?.stage ?? 0) + 1} / {route?.events}
        </span>
      )}
      {playing && (
        <button
          className="arena-pause"
          onClick={onPause}
          aria-label={game.paused ? 'Resume game' : 'Pause game'}
        >
          {game.paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
      )}
    </div>
  );
}
