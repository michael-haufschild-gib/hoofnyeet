import { ovationReady } from './catalogue/combinations';
import { landingTimeline, replayDuration } from './catalogue/landing-timeline';
import {
  beginTrick,
  embellishTrick,
  completeTrick,
  routineRing,
  TRICKS,
} from './routine';
import {
  event,
  land,
  phase,
  startGame,
  trampolineDip,
  PHYSICS,
  RINGS,
  say,
  STEP,
  TRACK,
  type Action,
  type GameState,
  type Phase,
} from './game-state';

export {
  applyCrashFrame,
  chooseLanding,
  createGame,
  inJetstream,
  jumpTarget,
  land,
  LANDINGS,
  PHYSICS,
  RINGS,
  say,
  startGame,
  STEP,
  TRACK,
  trampolineDip,
} from './game-state';
export type {
  Action,
  GameEvent,
  GameState,
  Hat,
  LandingId,
  Phase,
} from './game-state';

/** Mashing builds run-up speed; the other control commits to the jump. */
function actRunup(s: GameState, action: Action) {
  if (action === 'primary') {
    s.speed = Math.min(PHYSICS.maxSpeed, s.speed + PHYSICS.tapBoost);
    s.taps++;
    event(s, 'tap');
    return;
  }
  s.vx = s.speed;
  s.vy = PHYSICS.jump;
  phase(s, 'approach');
  event(s, 'jump');
}

/** Spends a flap: lift, forward push, and an embellishment on an open trick. */
function flap(s: GameState) {
  s.flaps--;
  s.vy -= PHYSICS.flapLift * s.mod.flap;
  s.vx += 28 * s.mod.flap;
  s.flapCooldown = PHYSICS.flapCooldown;
  s.flapPose = 0.45;
  if (s.routine && s.flipActive)
    s.routine = embellishTrick(
      s.routine,
      s.flipProgress,
      s.equipment.includes('beans'),
    );
  say(
    s,
    ['A HORSE OF FEATHER.', 'EMERGENCY JAZZ HANDS!', 'PANIC FLAP!'][
      s.flaps % 3
    ],
  );
  event(s, 'flap');
}

/** Starts a rotation, opening a trick when a routine is being judged. */
function startFlip(s: GameState) {
  if (s.routine)
    s.routine = beginTrick(s.routine, {
      time: s.time,
      y: s.y,
      vy: s.vy,
      flapPose: s.flapPose,
      beans: s.equipment.includes('beans'),
    });
  s.flipActive = true;
  s.flipProgress = 0;
}

/** In flight the primary control flaps and the secondary starts a rotation. */
function actFlight(s: GameState, action: Action) {
  if (action === 'primary' && s.flaps > 0 && s.flapCooldown <= 0) {
    flap(s);
    return;
  }
  if (action === 'secondary' && !s.flipActive) startFlip(s);
}

/**
 * Routes one control press into the current phase: it starts a run from the
 * title or results screen, mashes or commits the jump during the run-up, and
 * flaps or opens a rotation in flight. Presses are ignored while paused, and
 * `repeated` marks an auto-repeat so a held key cannot mash for the player.
 */
export function act(s: GameState, action: Action, repeated = false) {
  if (s.paused || repeated) return;
  if (s.phase === 'title' || s.phase === 'results') {
    if (action === 'primary') startGame(s);
    return;
  }
  if (s.phase === 'runup') {
    actRunup(s, action);
    return;
  }
  if (s.phase === 'flight') actFlight(s, action);
}

/** Counts the beats in, then releases the pony onto the track. */
function stepCountdown(s: GameState) {
  const beat = Math.max(0, 3 - Math.floor(s.phaseTime / 0.72));
  if (beat !== s.countdownBeat) {
    s.countdownBeat = beat;
    event(s, 'count', beat);
  }
  if (s.phaseTime >= 2.16) {
    phase(s, 'runup');
    say(s, 'MASH FOR GLORY!', 1.1);
  }
}

/** Run-up speed decays unless the player keeps mashing; the trampoline is fatal. */
function stepRunup(s: GameState, dt: number) {
  s.speed = Math.max(PHYSICS.minSpeed, s.speed - PHYSICS.decay * dt);
  s.vx = s.speed;
  s.x += s.vx * dt;
  if (s.x >= TRACK.trampoline - TRACK.width / 2)
    land(s, true, 'THE TRAMPOLINE IS NOT A DOOR.');
}

/** Records a clean trampoline strike, scoring it by distance from centre. */
function landOnTrampoline(s: GameState, crossing: number) {
  s.x = crossing;
  s.y = TRACK.surface;
  s.vy = 0;
  s.quality = Math.max(
    0,
    1 - Math.abs(crossing - TRACK.trampoline) / (TRACK.width / 2),
  );
  phase(s, 'compression');
  say(s, s.quality > 0.68 ? 'ABSOLUTELY BOING-TIFUL!' : 'WE HAVE LIFTOFF!', 2);
}

/** The arc between jumping and hitting the trampoline, or the ground. */
function stepApproach(s: GameState, dt: number) {
  const oldX = s.x,
    oldY = s.y;
  s.x += s.vx * dt;
  s.y += s.vy * dt + 0.5 * PHYSICS.approachGravity * dt * dt;
  s.vy += PHYSICS.approachGravity * dt;
  if (oldY <= TRACK.surface && s.y >= TRACK.surface && s.vy > 0) {
    const crossing =
      oldX + ((s.x - oldX) * (TRACK.surface - oldY)) / (s.y - oldY);
    if (Math.abs(crossing - TRACK.trampoline) <= TRACK.width / 2)
      landOnTrampoline(s, crossing);
  }
  if (s.phase === 'approach' && s.y >= 0 && s.vy > 0)
    land(
      s,
      true,
      s.x < TRACK.trampoline
        ? 'A LITTLE EARLY, CAPTAIN.'
        : 'YOU OVERSHOT THE BOING.',
    );
}

/** The trampoline dips, then converts run-up speed and accuracy into launch. */
function stepCompression(s: GameState) {
  s.y = TRACK.surface + trampolineDip(s);
  if (s.phaseTime < TRACK.compressionTime) return;
  s.y = TRACK.surface;
  s.vx = (180 + s.speed * 1.65 + s.quality * 120) * s.mod.launch;
  s.vy = -(540 + s.speed * 0.65 + s.quality * 270) * PHYSICS.flightLiftScale;
  s.launched = true;
  phase(s, 'flight');
  event(s, 'bounce', s.quality);
}

/** Gravity, wind and drag for one flight tick, returning the previous position. */
function integrateFlight(s: GameState, dt: number) {
  const oldX = s.x,
    oldY = s.y;
  s.vy += PHYSICS.gravity * s.mod.gravity * dt;
  s.vx += s.mod.wind * dt;
  s.vx *= Math.exp(-0.018 * dt);
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  return { oldX, oldY };
}

/**
 * Lift carries the pony along a visible high-altitude lane. It continues to
 * decay under gravity, so flaps and world gravity still determine airtime.
 * Only entering the lane awards its boost; remaining in it cannot farm one.
 */
function enterJetstream(s: GameState, oldY: number) {
  if (s.y >= PHYSICS.jetstreamAltitude) return;
  s.y = PHYSICS.jetstreamAltitude;
  if (oldY <= PHYSICS.jetstreamAltitude) return;
  s.vx += PHYSICS.jetstreamBoost;
  event(s, 'glide', PHYSICS.jetstreamBoost);
  say(s, 'THE EXPRESS MANE! +45 MOMENTUM');
}

/** Adds the applause cue an ovation earns, which refunds one flap. */
function awardOvation(s: GameState) {
  const cue = {
    id: `${s.round}-combo-organ-applause`,
    kind: 'organ-applause' as const,
    at: s.time,
    x: s.x,
    y: s.y - 65,
    vx: s.vx,
    vy: s.vy,
    seed: s.seed,
  };
  s.combinations = [...(s.combinations ?? []), cue];
  s.flaps++;
  s.events.push({
    kind: 'synergy',
    id: cue.id,
    sound: cue.kind,
    x: cue.x,
    y: cue.y,
    value: 0.8,
  });
}

/** Credits the judged routine for a rotation that has just closed. */
function scoreCompletedTrick(s: GameState) {
  if (!s.routine?.active) return;
  const before = s.routine.artistry;
  s.routine = completeTrick(s.routine, {
    time: s.time,
    x: s.x,
    y: s.y,
    base: s.mod.style,
  });
  s.style += s.routine.artistry - before;
}

/** Names a finished rotation: the trick when it was clean, the tally otherwise. */
function flipHeadline(s: GameState) {
  const last = s.routine?.elements.at(-1);
  if (last?.clean) return `${TRICKS[last.trick].name.toUpperCase()}!`;
  return `${s.flips > 1 ? s.flips + '× ' : ''}UNSTABLE GYMNASTICS! +${s.mod.style}`;
}

/** Closes a rotation: scores it, may award an ovation, and announces it. */
function completeFlip(s: GameState) {
  s.flipActive = false;
  s.flipProgress = 0;
  s.rotation = 0;
  s.flips++;
  s.style += s.mod.style;
  scoreCompletedTrick(s);
  if (
    ovationReady(
      s.equipment,
      s.routine,
      s.combinations ?? [],
      s.flaps,
      s.maxFlaps,
    )
  )
    awardOvation(s);
  if (s.flips <= 3) s.vx += 30;
  event(s, 'flip');
  say(s, flipHeadline(s));
}

/** Advances an open rotation, closing it on the final turn. */
function advanceFlip(s: GameState, dt: number) {
  if (!s.flipActive) return;
  s.flipProgress += dt / (PHYSICS.flipTime * s.mod.flip);
  s.rotation = s.flipProgress * Math.PI * 2;
  if (s.flipProgress >= 1) completeFlip(s);
}

/** Collects any delivery ring the pony has reached this tick. */
function collectRings(s: GameState) {
  RINGS.forEach((ring, i) => {
    if (s.rings.includes(i)) return;
    if (Math.hypot(s.x - ring.x, s.y - ring.y) >= 92 * s.mod.reach) return;
    s.rings.push(i);
    s.vx += 60;
    s.vy -= PHYSICS.ringLift;
    s.style += 75;
    if (s.routine) s.routine = routineRing(s.routine, 75);
    event(s, 'ring');
    say(s, 'EXPRESS DELIVERY! +75');
  });
}

/** One airborne tick: physics, the jetstream lane, tricks, rings and touchdown. */
function stepFlight(s: GameState, dt: number) {
  const { oldX, oldY } = integrateFlight(s, dt);
  enterJetstream(s, oldY);
  advanceFlip(s, dt);
  collectRings(s);
  s.maxHeight = Math.max(s.maxHeight, -s.y / 10);
  s.distance = Math.max(0, (s.x - TRACK.trampoline) / 10);
  if (oldY < 0 && s.y >= 0) {
    s.x = oldX + ((s.x - oldX) * -oldY) / (s.y - oldY);
    land(s);
  }
}

/** Fires the scripted crunches and ghost beat as the landing animation passes them. */
function stepLandingBeats(s: GameState, dt: number) {
  const timeline = landingTimeline(s.landing);
  for (const at of [timeline.impact, timeline.secondImpact])
    if (s.phaseTime - dt < at && s.phaseTime >= at) {
      event(s, 'crunch');
      s.hitStop = timeline.freeze;
    }
  if (s.phaseTime - dt < timeline.ghost && s.phaseTime >= timeline.ghost)
    event(s, 'ghost');
  if (s.phaseTime >= timeline.end) phase(s, 'results');
}

/** A reactive landing is driven by the physics world, not the scripted timeline. */
function stepLanding(s: GameState, dt: number) {
  if (s.reactive) {
    if (s.failed && s.phaseTime >= 2.2) phase(s, 'results');
    return;
  }
  stepLandingBeats(s, dt);
}

const PHASE_STEPS: Partial<Record<Phase, (s: GameState, dt: number) => void>> =
  {
    countdown: stepCountdown,
    runup: stepRunup,
    approach: stepApproach,
    compression: stepCompression,
    flight: stepFlight,
    landing: stepLanding,
  };

/**
 * Advances `s` in place by `dt` seconds — one `STEP` unless a caller overrides
 * it — running the clocks, cooldowns and message timer before handing the tick
 * to the current phase. A pending hit-stop consumes the tick without advancing
 * simulation time at all, and a paused run does nothing.
 */
export function stepGame(s: GameState, dt = STEP) {
  if (s.paused) return;
  if (s.hitStop > 0) {
    s.hitStop = Math.max(0, s.hitStop - dt);
    return;
  }
  s.time += dt;
  s.phaseTime += dt;
  s.messageTime = Math.max(0, s.messageTime - dt);
  s.flapCooldown = Math.max(0, s.flapCooldown - dt);
  s.flapPose = Math.max(0, s.flapPose - dt);
  const step = PHASE_STEPS[s.phase];
  if (step) {
    step(s, dt);
    return;
  }
  if (s.phase === 'replay' && s.phaseTime >= replayDuration(s.landing))
    phase(s, 'results');
}
/**
 * A fixed-timestep accumulator over `stepGame`. `advance` folds `seconds` of
 * real time — clamped to 0.1 so a backgrounded tab cannot simulate a minute in
 * one frame — into whole `STEP` ticks, calling `afterStep` after each, and
 * banks nothing while paused. `reset` drops the partial tick, which a seek or
 * a new run must do so the next frame does not inherit a stale fraction.
 */
export function createClock() {
  let accumulator = 0;
  return {
    advance(s: GameState, seconds: number, afterStep?: () => void) {
      if (s.paused) {
        accumulator = 0;
        return;
      }
      accumulator += Math.min(0.1, Math.max(0, seconds));
      while (accumulator + 1e-10 >= STEP) {
        stepGame(s);
        afterStep?.();
        accumulator -= STEP;
      }
    },
    reset() {
      accumulator = 0;
    },
  };
}
