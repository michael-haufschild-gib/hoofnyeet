import { jumpTarget } from '../simulation';
import { replayLeadIn } from '../replay';
import type { GameController, Recording, ViewState } from '../controller';

/**
 * Snapshots the session for React, copying every value the view can mutate.
 *
 * Events are stripped because they are consumed by the audio and effect
 * owners, not by the interface, and a run is cloned so a later mutation
 * cannot rewrite a rendered frame.
 */
export function viewState(c: GameController): ViewState {
  return {
    game: { ...c.state, events: [], rings: [...c.state.rings] },
    save: c.save,
    run: c.run ? structuredClone(c.run) : null,
    screen: c.screen,
    ready: c.ready && !c.graphicsLost,
    error: c.error,
    graphicsLost: c.graphicsLost,
    preparation: c.preparation ? { ...c.preparation } : null,
    tutorial: c.tutorial,
    newBest: c.newBest,
    newTourBest: c.newTourBest,
    newHats: c.newHats,
    wardrobe: c.wardrobe ? { ...c.wardrobe } : null,
    fps: Math.round(c.fps),
  };
}

/**
 * Flat reading of the live simulation for the browser suite, in world units,
 * metres and frames per second.
 *
 * `audio` reports 'locked' until the player's first gesture unlocks the audio
 * context.
 */
export function sessionSnapshot(c: GameController) {
  return {
    phase: c.state.phase,
    screen: c.screen,
    paused: c.state.paused,
    x: c.state.x,
    y: c.state.y,
    speed: c.state.speed,
    flaps: c.state.flaps,
    flips: c.state.flips,
    distance: c.state.distance,
    flightDistance: c.state.flightDistance,
    style: c.state.style,
    havoc: c.state.havoc,
    quality: c.state.quality,
    landing: c.state.landing,
    failed: c.state.failed,
    ready: c.ready,
    jump: jumpTarget(c.state),
    fps: Math.round(c.fps),
    audio: c.audio.context?.state ?? 'locked',
    run: c.run,
  };
}

/**
 * Packages the retained frames and events as a shareable incident.
 *
 * Everything is deep-copied, so the recording keeps the look of the attempt
 * that produced it even after the wardrobe changes. The lead-in replays the
 * effects that were already alive when the retained window opens.
 */
export function buildRecording(c: GameController): Recording {
  const frames = c.frames.map((f) => structuredClone(f));
  return {
    contentVersion: c.state.contentVersion,
    appearance: c.attemptAppearance
      ? { ...c.attemptAppearance }
      : {
          hat: c.renderer.hat,
          ponyId: c.renderer.ponyId,
          gentle: c.renderer.gentle,
          reduced: c.renderer.reduced,
        },
    frames,
    events: structuredClone([
      ...replayLeadIn(c.recordedEvents, frames, frames[0]?.time ?? 0),
      ...c.recordedEvents.filter(
        (e) => e.time !== undefined && e.time >= (frames[0]?.time ?? 0),
      ),
    ]),
    duration: frames.length ? frames.at(-1)!.time - frames[0].time : 0,
  };
}
