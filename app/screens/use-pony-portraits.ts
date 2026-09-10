import { useState } from 'react';
import type { ControllerRef } from './types';
import type { ViewState } from '@/lib/game/controller';

/** Portrait data URLs by pony id, plus the message shown when they fail. */
interface Portraits {
  portraits: Record<string, string>;
  error: string;
}

/** Reads the four previews from the renderer, reporting a lost GPU as a message. */
function readPortraits(
  controller: ControllerRef,
  view: ViewState,
  active: boolean,
): Portraits {
  if (!active || !view.ready) return { portraits: {}, error: '' };
  try {
    const portraits =
      controller.current?.renderer.ponyPortraits(view.save.hat) ?? {};
    return { portraits, error: '' };
  } catch {
    return { portraits: {}, error: 'Pony preview couldn’t load. Try again.' };
  }
}

/**
 * The four pony previews for the wardrobe tab.
 *
 * They are read during render rather than in an effect. The renderer caches
 * each set under its hat and gore setting, so a repeat read is a map lookup,
 * while an effect would set state synchronously and cascade a second render.
 * The retry counter exists only to schedule another read: nothing is cached
 * when generation throws, so the next render rebuilds the previews.
 */
export function usePonyPortraits(
  controller: ControllerRef,
  view: ViewState,
  active: boolean,
) {
  const [, scheduleRetry] = useState(0);
  const { portraits, error } = readPortraits(controller, view, active);
  return {
    portraits,
    error,
    retry: () => scheduleRetry((attempt) => attempt + 1),
  };
}
