import { GROUND_Y } from '../../art/geometry';
import type { CarnageCue } from '../../catalogue/escalation';
import type { LandingId } from '../../game-state';
import type { GameState } from '../../simulation';
import { AfterlifeQueue } from '../shows/afterlife-queue';
import type { CarnageBrush } from './carnage-brush';
import { ballet, fence, sheep } from './carnage-landing-acts';
import { accordion, cartwheel, haystack, mud } from './carnage-landing-props';

/**
 * Paints one landing tableau. `t` is seconds since the recorded stage-0 cue,
 * and may run past the set's own beats; every builder clamps its own window.
 */
export type LandingScene = (
  brush: CarnageBrush,
  c: CarnageCue,
  t: number,
  s: GameState,
) => void;

const SCENES: Partial<Record<LandingId, LandingScene>> = {
  haystack,
  mud,
  accordion,
  cartwheel,
  fence,
  sheep,
  ballet,
};

/**
 * Dispatches the recorded landing to its tableau. Owns the afterlife turnstile,
 * which is the one set that keeps state between frames; every other set is a
 * pure sample of the cue and the frame it is given.
 */
export class CarnageLandingScenes {
  private queue: AfterlifeQueue;
  constructor(private brush: CarnageBrush) {
    this.queue = new AfterlifeQueue(brush.drawings, (...args) =>
      brush.art(...args),
    );
  }

  draw(c: CarnageCue, t: number, s: GameState) {
    if (c.landing === 'dignified') {
      this.queue.draw(c.x, GROUND_Y, t, this.brush.reduced, this.brush.gentle);
      return;
    }
    if (c.landing) SCENES[c.landing]?.(this.brush, c, t, s);
  }
}
