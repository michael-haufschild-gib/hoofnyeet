/** The skating programme lives on the simulation clock. Every update returns a
 * new snapshot: recorded frames must never inherit a later trick or verdict. */
export const TRICKS = {
  tuck: {
    name: 'Tuck & pray',
    short: 'Tuck',
    instruction: 'Roll while rising or falling',
    difficulty: 0,
    color: 0xffdb72,
  },
  corkscrew: {
    name: 'Corkscrew',
    short: 'Link',
    instruction: 'Roll again just after a roll',
    difficulty: 20,
    color: 0x81e7c1,
  },
  layback: {
    name: 'Dramatic layback',
    short: 'Layback',
    instruction: 'Roll at the top of your flight',
    difficulty: 30,
    color: 0x95cfff,
  },
  spiral: {
    name: 'Death spiral',
    short: 'Low!',
    instruction: 'Roll low; finish before touchdown',
    difficulty: 55,
    color: 0xff8776,
  },
  axel: {
    name: 'Unlicensed axel',
    short: 'Axel',
    instruction: 'Flap, then immediately roll',
    difficulty: 35,
    color: 0xffb6dc,
  },
  star: {
    name: 'Emergency splits',
    short: 'Splits',
    instruction: 'Flap during a roll',
    difficulty: 45,
    color: 0xf7f0b0,
  },
  bean: {
    name: 'Gastric axel',
    short: 'Gas!',
    instruction: 'Fart boost during a roll',
    difficulty: 45,
    color: 0xbedf6f,
  },
} as const;
/** Key of one entry in the trick table, stored verbatim in saved incidents. */
export type Trick = keyof typeof TRICKS;

/**
 * One landed or bailed manoeuvre. `at` is the simulation clock in seconds,
 * `x`/`y` the world position it finished at, `base` the technical points the
 * simulation awarded, `bonus` the artistry this module computed, `chain` the
 * link length it belonged to (1 when unlinked), `repeat` how many of the same
 * trick preceded it, `clean` false for a bail, and `low` true near the ground.
 */
export interface RoutineElement {
  id: number;
  trick: Trick;
  at: number;
  x: number;
  y: number;
  base: number;
  bonus: number;
  chain: number;
  repeat: number;
  clean: boolean;
  low: boolean;
}
/**
 * The whole programme as of one simulation frame. Treat it as immutable: every
 * function here returns a fresh snapshot so a recorded frame can never inherit
 * a later trick or verdict. `technical`, `artistry` and `finish` are the three
 * point pools; `chain` is the live link length and `bestChain` its high-water
 * mark; `lastAt` is the clock of the last landing, or null before the first;
 * `settled` freezes the routine once the verdict at `verdictAt` is in.
 */
export interface Routine {
  active: { trick: Trick; at: number; linked: boolean; height: number } | null;
  elements: readonly RoutineElement[];
  counts: Partial<Record<Trick, number>>;
  technical: number;
  artistry: number;
  finish: number;
  completed: number;
  chain: number;
  bestChain: number;
  lastAt: number | null;
  lowFinishes: number;
  ringCount: number;
  /** Optional for incidents recorded before the detailed verdict was added. */
  ringPoints?: number;
  settled: boolean;
  cleanFinish: boolean;
  verdictAt: number | null;
}
/**
 * Seconds after a landing during which the next trick still counts as linked.
 * Widening it makes chains easier and inflates every artistry award.
 */
export const ROUTINE_LINK_WINDOW = 0.72;

/** An empty programme at the start of an attempt, with every pool at zero. */
export function newRoutine(): Routine {
  return {
    active: null,
    elements: [],
    counts: {},
    technical: 0,
    artistry: 0,
    finish: 0,
    completed: 0,
    chain: 0,
    bestChain: 0,
    lastAt: null,
    lowFinishes: 0,
    ringCount: 0,
    ringPoints: 0,
    settled: false,
    cleanFinish: false,
    verdictAt: null,
  };
}
/** The pose the pony is caught in when a roll starts, in simulation units. */
interface TrickEntry {
  time: number;
  y: number;
  vy: number;
  flapPose: number;
  beans: boolean;
}

/**
 * Names the manoeuvre a roll becomes, from altitude, vertical speed and what
 * else the pony is doing. The tests run in priority order: a low descent is
 * always the death spiral, a roll out of a flap is an axel (gastric with
 * beans), a roll near the apex is a layback, and anything else is a plain tuck
 * unless it lands inside the link window, which makes it a corkscrew.
 */
function selectTrick(context: TrickEntry, linked: boolean): Trick {
  if (context.y > -180 && context.vy > 0) return 'spiral';
  if (context.flapPose > 0.18) return context.beans ? 'bean' : 'axel';
  if (Math.abs(context.vy) < 115) return 'layback';
  return linked ? 'corkscrew' : 'tuck';
}

/**
 * Opens a manoeuvre, choosing which one from the pose in `context`. Ignored
 * once the routine has settled or while another trick is still running, in
 * which case the same snapshot comes back unchanged.
 */
export function beginTrick(
  r: Routine,
  context: {
    time: number;
    y: number;
    vy: number;
    flapPose: number;
    beans: boolean;
  },
): Routine {
  if (r.settled || r.active) return r;
  const linked =
    r.lastAt !== null && context.time - r.lastAt <= ROUTINE_LINK_WINDOW;
  return {
    ...r,
    active: {
      trick: selectTrick(context, linked),
      at: context.time,
      linked,
      height: -context.y,
    },
  };
}

/**
 * Upgrades the manoeuvre in flight to the splits, or the gastric variant with
 * beans, when a flap arrives between 6% and 78% through the roll. Outside that
 * window, or with no trick running, the snapshot comes back unchanged.
 */
export function embellishTrick(
  r: Routine,
  progress: number,
  beans: boolean,
): Routine {
  if (!r.active || r.settled || progress < 0.06 || progress > 0.78) return r;
  return { ...r, active: { ...r.active, trick: beans ? 'bean' : 'star' } };
}
/**
 * Lands the manoeuvre in flight and books its points. Artistry rises with the
 * trick's difficulty, a first-time bonus, a low-altitude bonus and the chain
 * multiplier, and falls off sharply for each earlier repeat of the same trick.
 * The element list is capped at the most recent 24 entries. Returns the
 * snapshot unchanged when nothing is in flight or the routine has settled.
 */
export function completeTrick(
  r: Routine,
  context: { time: number; x: number; y: number; base: number },
): Routine {
  if (!r.active || r.settled) return r;
  const { trick, linked } = r.active;
  const repeat = r.counts[trick] ?? 0;
  const chain = linked ? Math.min(8, r.chain + 1) : 1;
  const multiplier = 1 + Math.min(4, chain - 1) * 0.25;
  const low = context.y > -145;
  const bonus = Math.round(
    ((TRICKS[trick].difficulty + (repeat === 0 ? 20 : 0) + (low ? 30 : 0)) *
      multiplier) /
      (1 + repeat * 0.75) +
      Math.min(4, chain - 1) * 8,
  );
  const element: RoutineElement = {
    id: r.completed + 1,
    trick,
    at: context.time,
    x: context.x,
    y: context.y,
    base: context.base,
    bonus,
    chain,
    repeat,
    clean: true,
    low,
  };
  return {
    ...r,
    active: null,
    elements: [...r.elements, element].slice(-24),
    counts: { ...r.counts, [trick]: repeat + 1 },
    technical: r.technical + context.base,
    artistry: r.artistry + bonus,
    completed: r.completed + 1,
    chain,
    bestChain: Math.max(r.bestChain, chain),
    lastAt: context.time,
    lowFinishes: r.lowFinishes + Number(low),
  };
}
/**
 * Credits `points` of technical score for flying through a ring, and counts
 * the ring. Ignored once the routine has settled.
 */
export function routineRing(r: Routine, points: number): Routine {
  if (r.settled) return r;
  return {
    ...r,
    technical: r.technical + points,
    ringCount: r.ringCount + 1,
    ringPoints: routineRingScore(r) + points,
  };
}
/**
 * Total technical points that came from rings rather than tricks. Incidents
 * recorded before the count was stored are reconstructed from the ring tally.
 */
export function routineRingScore(r: Routine) {
  // Earlier recorded routines awarded exactly75 points per ring.
  return r.ringPoints ?? r.ringCount * 75;
}
/**
 * Closes the programme and freezes it. The finish pool rewards variety, plus a
 * completion bonus when the pony neither failed nor was interrupted mid-trick.
 * A failed landing scores no finish at all. An interrupted trick is recorded
 * as a bail element worth nothing. Ignored once already settled.
 */
export function finishRoutine(
  r: Routine,
  context: {
    time: number;
    x: number;
    y: number;
    failed: boolean;
    interrupted: boolean;
  },
): Routine {
  if (r.settled) return r;
  const cleanFinish =
    !context.failed && !context.interrupted && r.completed > 0;
  const finish = context.failed
    ? 0
    : Object.keys(r.counts).length * 25 +
      (cleanFinish ? Math.min(120, 20 + r.completed * 8) : 0);
  const bail: RoutineElement | null =
    r.active && context.interrupted
      ? {
          id: r.completed + 1,
          trick: r.active.trick,
          at: context.time,
          x: context.x,
          y: context.y,
          base: 0,
          bonus: 0,
          chain: 0,
          repeat: 0,
          clean: false,
          low: true,
        }
      : null;
  return {
    ...r,
    active: null,
    settled: true,
    cleanFinish,
    finish,
    verdictAt: context.time,
    chain: 0,
    elements: bail ? [...r.elements, bail].slice(-24) : r.elements,
  };
}
/** Combined technical, artistry and finish points for the programme. */
export function routineScore(r: Routine) {
  return r.technical + r.artistry + r.finish;
}
/**
 * Link length still live at `time`, for the HUD: the current chain while a
 * trick is running or the link window is open, and 0 once it lapses or the
 * routine settles.
 */
export function routineChain(r: Routine, time: number) {
  if (r.settled || r.lastAt === null) return 0;
  return r.active?.linked || time - r.lastAt <= ROUTINE_LINK_WINDOW
    ? r.chain
    : 0;
}
/**
 * The three panel marks, each rounded to one decimal and capped at 10:
 * execution from landings, rings and a clean finish; composition from trick
 * variety and the best chain; and daring from low finishes and the riskier
 * tricks. Presentation only — the marks feed no score.
 */
export function routineJudges(r: Routine): readonly [number, number, number] {
  const cap = (value: number) => Math.round(Math.min(10, value) * 10) / 10;
  return [
    cap(r.completed * 0.9 + r.ringCount * 0.8 + Number(r.cleanFinish) * 2.2),
    cap(Object.keys(r.counts).length * 1.7 + Math.min(8, r.bestChain) * 0.45),
    cap(
      r.lowFinishes * 2.4 +
        (r.counts.spiral ?? 0) * 1.4 +
        (r.counts.star ?? 0) * 0.8 +
        (r.counts.bean ?? 0) * 0.8,
    ),
  ];
}
