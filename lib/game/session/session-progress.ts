import { createGame } from '../simulation';
import { worldById } from '../content';
import { finishRound } from '../storage';
import { saveIncident } from '../sharing';
import { isCampaign, type Campaign } from '../campaign';
import {
  newRun,
  parseChallenge,
  settleAttempt,
  recordTourBest,
  dailyRecordKey,
  type RunMode,
  type RunState,
} from '../run';
import type { GameController } from '../controller';

/**
 * Restores a shared challenge from the page's query string, leaving the
 * session on its briefing.
 *
 * A link that carries no challenge is ignored, so a plain visit still opens
 * on the home screen.
 */
export function startChallengeLink(c: GameController, search: string) {
  const challenge = parseChallenge(search);
  if (!challenge) return;
  c.run = newRun(
    challenge.mode,
    challenge.seed,
    challenge.assisted,
    challenge.date,
    challenge.rules,
    challenge.campaign,
  );
  c.run.target = challenge.target;
  c.run.pool = challenge.pool;
  c.screen = 'briefing';
}

/**
 * Starts a fresh run and returns the session to its briefing.
 *
 * Does nothing while the renderer is still loading or the picture is lost,
 * because the first course could not be prepared. The daily run keeps its own
 * fixed pool rather than the save's unlocked set.
 */
export function beginRun(c: GameController, mode: RunMode, campaign: Campaign) {
  if (!c.ready || c.graphicsLost) return;
  c.error = '';
  c.preparation = null;
  c.run = newRun(
    mode,
    undefined,
    c.save.assisted,
    undefined,
    c.save.challenge,
    campaign,
  );
  if (mode !== 'daily') c.run.pool = [...c.save.unlocked];
  c.state = createGame(c.state.round);
  c.screen = 'briefing';
  c.crash?.dispose();
  c.crash = null;
  c.renderer.reset();
  c.persist();
  void c.audio.unlock();
  c.publish();
}

/**
 * Picks the storyline for a tour that has not started yet.
 *
 * Ignored once the first attempt is under way, or on a shared challenge whose
 * storyline came with the link, so a run's identity cannot change mid-flight.
 */
export function chooseCampaign(c: GameController, campaign: Campaign) {
  const run = c.run;
  if (
    !isCampaign(campaign) ||
    !run ||
    run.mode !== 'tour' ||
    run.stage !== 0 ||
    run.attempt !== 0 ||
    run.status !== 'briefing' ||
    run.target !== undefined ||
    c.preparation
  )
    return;
  run.campaign = campaign;
  c.save = { ...c.save, campaign };
  c.persist();
  c.publish();
}

/** Appends the settled landing pose so the recording ends where the pony did. */
function recordFinalFrame(c: GameController) {
  // Include the final physics tick even when it falls between replay samples.
  // Keep its landing pose; the results phase resets phaseTime to zero.
  const last = c.frames.at(-1);
  if (!last) return;
  c.frames.push({
    ...c.state,
    outfit: { hat: c.renderer.hat, ponyId: c.renderer.ponyId },
    phase: 'landing',
    phaseTime:
      last.phaseTime +
      Math.max(0, c.state.time - (last.sceneTime ?? last.time)),
    time: c.recordTime,
    sceneTime: c.state.time,
    events: [],
    rings: [...c.state.rings],
  });
  if (c.frames.length > 2400) c.frames.shift();
}

/** Scores the attempt against the run, then banks any record it just set. */
function settleRun(c: GameController, run: RunState) {
  settleAttempt(
    run,
    {
      distance: c.state.distance,
      style: c.state.style,
      havoc: c.state.havoc,
      failed: c.state.failed,
      bossHits: c.state.bossHits,
      disaster: worldById(c.state.world).disasters[c.state.disaster % 4],
    },
    c.save.unlocked,
  );
  if (run.status !== 'won' || run.mode === 'quick') return;
  c.save.wins++;
  const records = recordTourBest(c.save.tourBests, run);
  c.newTourBest = records !== c.save.tourBests;
  c.save.tourBests = records;
  if (run.mode !== 'daily') return;
  const key = dailyRecordKey(run);
  if (key) c.save.daily[key] = Math.max(c.save.daily[key] ?? 0, run.score);
}

/**
 * Banks one finished attempt: records, unlocks, run progress and the incident.
 *
 * Guarded by the round number, so a phase that settles across several frames
 * only ever scores once. Saving the incident is fire-and-forget.
 */
export function completeRound(c: GameController) {
  if (c.savedRound === c.state.round) return;
  c.savedRound = c.state.round;
  recordFinalFrame(c);
  c.newBest = c.state.distance > c.save.best;
  const next = finishRound(c.save, c.state);
  c.newHats = next.hats.filter((h) => !c.save.hats.includes(h));
  c.save = next;
  if (c.run) settleRun(c, c.run);
  c.screen = 'results';
  void saveIncident({
    id: `incident-${Date.now()}`,
    name: worldById(c.state.world).disasters[c.state.disaster % 4],
    distance: c.state.distance,
    havoc: c.state.havoc,
    created: Date.now(),
    recording: c.recording(),
  });
  c.persist();
  c.syncPreferences();
  c.audio.event({
    kind: 'record',
    sound: c.run?.status === 'lost' ? 'lose' : 'win',
    x: c.state.x,
    y: 0,
  });
}
