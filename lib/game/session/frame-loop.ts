import { INCIDENT_WINDOW } from '../catalogue/escalation';
import { act, applyCrashFrame, STEP } from '../simulation';
import { CrashWorld } from '../crash';
import { replayFrame, replayEvent } from '../replay';
import { recordPerkEvent } from '../effects/motion/perk-motion';
import { completeRound } from './session-progress';
import type { GameState } from '../simulation';
import type { GameController } from '../controller';

/** Retained events beyond this count are dropped from the oldest end. */
const EVENT_LIMIT = 1500;

/** Retained frames beyond this count are dropped from the oldest end. */
const FRAME_LIMIT = 2400;

/**
 * Delivers the tick's simulation and physics events to audio, effects and the
 * incident recording, and reports whether anything happened.
 *
 * Each event is stamped with the recording clock rather than the wall clock,
 * so a replay can re-fire it at the same moment. A freeze request only lands
 * during a reactive landing, where the hit stop is legible.
 */
export function drainEvents(c: GameController) {
  const events = [...c.state.events, ...(c.crash?.drain() ?? [])];
  c.state.events = [];
  for (const e of events) {
    const recorded = {
      ...recordPerkEvent(e, c.state),
      time: c.recordTime,
    };
    if (e.freeze && c.state.reactive && c.state.phase === 'landing')
      c.state.hitStop = Math.max(c.state.hitStop, e.freeze);
    c.audio.event(recorded);
    c.renderer.event(recorded);
    c.recordedEvents.push(recorded);
  }
  if (c.recordedEvents.length > EVENT_LIMIT)
    c.recordedEvents.splice(0, c.recordedEvents.length - EVENT_LIMIT);
  return events.length > 0;
}

/** Matches the drawing buffer and the HUD insets to the current layout. */
function syncViewport(c: GameController) {
  c.resizePending = false;
  c.pausedPictureReady = false;
  const canvasTop = c.renderer.canvas.getBoundingClientRect().top;
  c.renderer.hudInset = Math.max(
    80,
    (c.hud?.getBoundingClientRect().bottom ?? canvasTop) - canvasTop + 12,
  );
  c.renderer.resize(
    undefined,
    undefined,
    c.caption?.getBoundingClientRect().height ?? 0,
  );
}

/** True when this frame is really painting the game, for the quality budget. */
function liveShot(c: GameController) {
  return (
    !c.exporting &&
    !c.graphicsLost &&
    !c.state.paused &&
    (c.screen === 'game' || c.state.phase === 'replay')
  );
}

/**
 * True when the frame should be skipped entirely.
 *
 * Keeps the RAF timestamp current for a smooth resume, but leaves an
 * unchanged paused picture on the compositor instead of repainting it.
 * Layout, preferences, preparation and graphics recovery invalidate it.
 */
function skipFrame(c: GameController) {
  return (
    c.exporting || c.graphicsLost || (c.state.paused && c.pausedPictureReady)
  );
}

/** Converts a held control into taps during an assisted run-up. */
function assistRunup(c: GameController) {
  if (c.state.phase !== 'runup' || !c.run?.assisted) return;
  if (c.state.time - c.lastAssist <= 0.15) return;
  const holding = [...c.held].some(
    (id) => id === c.save.primaryKey || id.includes('primary'),
  );
  if (!holding) return;
  act(c.state, 'primary');
  c.lastAssist = c.state.time;
}

/** Advances the ragdoll world and folds its pose back into the game state. */
function stepCrash(c: GameController) {
  if (c.state.phase !== 'landing' || !c.state.reactive) return;
  c.crash ??= new CrashWorld(c.state);
  if (c.state.time > c.previousSimTime) c.crash.step(STEP);
  applyCrashFrame(c.state, c.crash.snapshot());
}

/** Retains one sampled frame, trimming the window from the oldest end. */
function recordFrame(c: GameController) {
  c.frames.push({
    ...c.state,
    outfit: { hat: c.renderer.hat, ponyId: c.renderer.ponyId },
    time: c.recordTime,
    sceneTime: c.state.time,
    events: [],
    rings: [...c.state.rings],
  });
  while (
    c.frames.length > 1 &&
    c.frames[1].time < c.recordTime - INCIDENT_WINDOW
  )
    c.frames.shift();
  if (c.frames.length > FRAME_LIMIT) c.frames.shift();
}

/**
 * Runs one fixed simulation step: assistance, physics, events and recording.
 *
 * Frames are sampled every fourth tick, plus any tick that produced an event,
 * and only while the pony is airborne or wrecked.
 */
function stepSimulation(c: GameController) {
  assistRunup(c);
  stepCrash(c);
  c.previousSimTime = c.state.time;
  c.recordTime += STEP;
  const beat = drainEvents(c);
  c.recordTick++;
  if (
    (beat || c.recordTick % 4 === 0) &&
    ['flight', 'landing'].includes(c.state.phase)
  )
    recordFrame(c);
}

/** Re-fires the recorded events whose stamps fall inside the played window. */
function emitReplayEvents(c: GameController, base: number, at: number) {
  while (c.replayEvent < c.recordedEvents.length) {
    const e = c.recordedEvents[c.replayEvent];
    if ((e.time ?? 0) > at) break;
    if ((e.time ?? 0) >= base) {
      c.audio.event({
        ...e,
        id: `replay-${c.replaySession}-${c.replayEvent}`,
      });
      c.renderer.event(replayEvent(e, c.frames));
    }
    c.replayEvent++;
  }
}

/**
 * Advances the replay clock at 70% speed and returns the frame to draw.
 *
 * Reaching the end of the retained window ends the replay, so the returned
 * frame is the last one the incident holds.
 */
function playReplay(c: GameController, dt: number): GameState {
  if (!c.state.paused) c.replayTime += dt * 0.7;
  const base = c.frames[0].time,
    at = base + c.replayTime;
  const render = replayFrame(c.frames, at);
  emitReplayEvents(c, base, at);
  if (at >= c.frames.at(-1)!.time) c.skipReplay();
  return render;
}

/** Republishes the view on a phase change, or at roughly 14 times a second. */
function publishFrame(c: GameController, now: number, previous: string) {
  if (now - c.lastPublish <= 70 && previous === c.state.phase) return;
  c.publish();
  c.lastPublish = now;
}

/**
 * Steps the simulation for `dt` seconds, then draws and presents the frame.
 *
 * A replaying session draws a recorded frame instead of the live state, and a
 * paused one is drawn with a zero delta so nothing animates under it.
 */
function presentFrame(c: GameController, now: number, dt: number) {
  c.fps = c.fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
  const previous = c.state.phase;
  if (c.ready && c.state.phase !== 'replay')
    c.clock.advance(c.state, dt, () => stepSimulation(c));
  if (c.state.phase !== 'replay') drainEvents(c);
  if (c.state.phase === 'results' && previous !== 'results') completeRound(c);
  const replaying = c.state.phase === 'replay' && c.frames.length > 0;
  const render = replaying ? playReplay(c, dt) : c.state;
  c.renderer.draw(render, c.state.paused ? 0 : dt, render.time);
  c.pausedPictureReady = c.state.paused;
  c.audio.tick(render);
  publishFrame(c, now, previous);
}

/**
 * One animation frame, at `now` milliseconds of RAF timestamp.
 *
 * Always schedules the next frame, even when this one paints nothing, so a
 * resume never has to restart the loop. The elapsed time is clamped to 100 ms
 * so a backgrounded tab cannot teleport the simulation on return.
 */
export function advanceFrame(c: GameController, now: number) {
  if (c.disposed) return;
  if (c.resizePending) syncViewport(c);
  const elapsed = c.last ? (now - c.last) / 1000 : 1 / 60;
  const dt = Math.min(0.1, elapsed);
  c.last = now;
  c.renderer.observeFrame(elapsed, liveShot(c));
  if (!skipFrame(c)) presentFrame(c, now, dt);
  c.raf = requestAnimationFrame(c.frame);
}
