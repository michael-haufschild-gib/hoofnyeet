import type { GameController } from '../controller';

/** Selectors whose focused element owns the keyboard instead of the game. */
const TEXT_ENTRY =
  '[role="dialog"],input,textarea,select,[contenteditable="true"]';

/** Subscribes the session to keyboard, focus and WebGL context events. */
export function bindSession(c: GameController, canvas: HTMLCanvasElement) {
  window.addEventListener('keydown', c.keyDown);
  window.addEventListener('keyup', c.keyUp);
  window.addEventListener('blur', c.blur);
  document.addEventListener('visibilitychange', c.visibility);
  canvas.addEventListener('webglcontextlost', c.graphicsInterrupted);
  canvas.addEventListener('webglcontextrestored', c.graphicsRestored);
}

/** Removes every listener `bindSession` added, using the same references. */
export function unbindSession(c: GameController, canvas: HTMLCanvasElement) {
  window.removeEventListener('keydown', c.keyDown);
  window.removeEventListener('keyup', c.keyUp);
  window.removeEventListener('blur', c.blur);
  document.removeEventListener('visibilitychange', c.visibility);
  canvas.removeEventListener('webglcontextlost', c.graphicsInterrupted);
  canvas.removeEventListener('webglcontextrestored', c.graphicsRestored);
}

/** Toggles pause on a fresh press, ignoring the auto-repeat that follows. */
function togglePause(c: GameController, e: KeyboardEvent) {
  if (e.repeat) return;
  c.pause();
  e.preventDefault();
}

/**
 * Routes one key press to the game, unless a text field or dialog owns it.
 *
 * Only the two bound action keys and the pause keys are claimed; everything
 * else keeps its default behaviour, including Space on a focused button so the
 * interface stays operable from the keyboard alone.
 */
export function handleKeyDown(c: GameController, e: KeyboardEvent) {
  const target = e.target as HTMLElement;
  if (target.closest(TEXT_ENTRY)) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    togglePause(c, e);
    return;
  }
  if (![c.save.primaryKey, c.save.secondaryKey].includes(e.code)) return;
  if (target.closest('button,a') && e.code === 'Space') return;
  e.preventDefault();
  if (e.repeat || c.held.has(e.code)) return;
  c.held.add(e.code);
  c.action(e.code === c.save.primaryKey ? 'primary' : 'secondary');
}

/**
 * Rebuilds the picture after the browser restores the WebGL context.
 *
 * A rebuild that throws leaves the session in an error state rather than a
 * blank canvas, because the saved event is still recoverable by reloading.
 */
export function restorePicture(c: GameController) {
  if (c.disposed) return;
  try {
    c.renderer.restoreGraphics();
    c.graphicsLost = false;
    c.pausedPictureReady = false;
    c.last = 0;
  } catch {
    c.error =
      'The picture could not recover. Reload to return to your saved event.';
  }
  c.publish();
}
