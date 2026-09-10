import { startGame } from '../simulation';
import { applyChallenge } from '../catalogue/challenge-rules';
import { modifiers, relicArt, type Ability, type WorldId } from '../content';
import { beginAttempt, items, objective, type RunState } from '../run';
import type { GameController } from '../controller';

/**
 * Keeps the ability illustration resident before the in-game hint mounts.
 *
 * Rejects after 20 seconds so a stalled image cannot hold the course loader
 * open indefinitely. Already-decoded artwork returns at once.
 */
export async function prepareAbilityIcon(c: GameController, ability: string) {
  const src = relicArt(ability);
  if (c.abilityIcons.has(src)) return;
  // Pixi's ImageBitmap cache is separate from HTML <img> decoding. Keep the
  // actual HUD image resident before React mounts the in-game ability hint.
  const image = new Image();
  image.src = src;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      image.decode(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Ability illustration timed out. Try again.')),
          20000,
        );
      }),
    ]);
    if (!c.disposed) c.abilityIcons.set(src, image);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Loads artwork, audio and the ability icon for one course together, reporting
 * a blended 0 to 1 through the session's preparation state.
 *
 * Progress from a superseded preparation is discarded, so an abandoned course
 * cannot drive the visible bar.
 */
async function prepareCourse(
  c: GameController,
  run: RunState,
  selected: WorldId,
  preparationId: number,
) {
  const completion = [0, 0, 0];
  const progress = (part: number, value: number) => {
    if (c.disposed || preparationId !== c.preparationId || !c.preparation)
      return;
    completion[part] = value;
    c.preparation.progress =
      completion[0] * 0.48 + completion[1] * 0.48 + completion[2] * 0.04;
    c.publish();
  };
  await Promise.all([
    c.renderer.prepareLevel(
      selected,
      c.save.pony,
      (p) => progress(0, p),
      run.ability as Ability,
    ),
    c.audio.prepareLevel(
      selected,
      objective({ ...run, world: selected }).boss,
      (p) => progress(1, p),
    ),
    prepareAbilityIcon(c, run.ability).then(() => progress(2, 1)),
  ]);
}

/**
 * Locks in the outfit the attempt is recorded with, then seeds the simulation
 * from the run's equipment, challenge rules and stage seed.
 *
 * A first-time player starts paused behind the control guide; a returning one
 * starts part-way through the countdown.
 */
function dressAttempt(c: GameController, run: RunState) {
  c.attemptAppearance = {
    hat: c.save.hat,
    ponyId: c.save.pony,
    gentle: c.save.gentle,
    reduced: c.save.reduced,
  };
  Object.assign(c.renderer, c.attemptAppearance);
  startGame(c.state);
  c.tutorial = !c.save.controlsSeen && c.save.rounds === 0;
  c.state.paused = c.tutorial || c.preparationInterrupted || document.hidden;
  if (run.attempt > 1 || c.save.rounds > 0) c.state.phaseTime = 1.45;
  const equipment = items(run),
    mod = applyChallenge(modifiers(equipment, run.world), run.rules);
  Object.assign(c.state, {
    world: run.world,
    equipment,
    ability: run.ability as Ability,
    mod,
    reactive: true,
    boss: objective(run).boss,
    seed: run.seed + run.stage * 719,
    disaster: (run.seed + run.stage) % 4,
    maxFlaps: mod.maxFlaps,
    flaps: mod.maxFlaps,
  });
}

/** Clears the recording buffers, physics and celebration flags of the last go. */
function resetAttempt(c: GameController) {
  c.screen = 'game';
  c.preparation = null;
  c.clock.reset();
  c.frames = [];
  c.recordedEvents = [];
  c.previousSimTime = 0;
  c.recordTick = 0;
  c.recordTime = 0;
  c.lastAssist = 0;
  c.crash?.dispose();
  c.crash = null;
  c.renderer.reset();
  c.audio.reset();
  c.pausedPictureReady = false;
  c.held.clear();
  c.newBest = false;
  c.newTourBest = false;
  c.newHats = [];
  c.persist();
  if (c.state.paused) c.audio.pause();
}

/** Surfaces a preparation failure on the loader, unless it was superseded. */
function reportPreparationFailure(
  c: GameController,
  error: Error,
  preparationId: number,
) {
  if (c.disposed || preparationId !== c.preparationId) return;
  c.error = error.message;
  if (c.preparation) c.preparation.failed = true;
}

/** Hands control back to the player once this preparation is the current one. */
function finishPreparation(c: GameController, preparationId: number) {
  if (!c.disposed && preparationId === c.preparationId) {
    c.ready = true;
    c.publish();
  }
}

/**
 * Prepares a course and drops the player into it, or leaves a retryable error
 * on the loading overlay.
 *
 * Only a briefing or an in-progress run can launch. A newer launch, a dispose
 * or a swapped run abandons this one silently; a lost picture fails loudly,
 * because the course cannot be drawn.
 */
export async function launchLevel(c: GameController, world?: WorldId) {
  if (!c.ready || !c.run || c.graphicsLost) return;
  const selected = world ?? c.run.world,
    run = c.run;
  if (!['briefing', 'playing'].includes(run.status)) return;
  c.ready = false;
  c.error = '';
  const preparationId = ++c.preparationId;
  c.preparationInterrupted = false;
  c.preparation = { world: selected, progress: 0, failed: false };
  c.clearInputs();
  // Invoke inside the original click/tap, before awaiting any network work.
  // Context creation is synchronous; suspended contexts can still decode.
  void c.audio.unlock();
  c.publish();
  try {
    await prepareCourse(c, run, selected, preparationId);
    if (c.disposed || preparationId !== c.preparationId || c.run !== run)
      return;
    if (c.graphicsLost)
      throw new Error(
        'Course preparation was interrupted. Try again when the picture recovers.',
      );
    if (!beginAttempt(run, selected)) {
      c.preparation = null;
      return;
    }
    dressAttempt(c, run);
    resetAttempt(c);
  } catch (e) {
    reportPreparationFailure(c, e as Error, preparationId);
  } finally {
    finishPreparation(c, preparationId);
  }
}
