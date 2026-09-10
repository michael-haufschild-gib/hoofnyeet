import type { Routine } from '../routine';

/** The equipment interactions a flight or crash can stage, one per synergy. */
export type Combination =
  | 'gas-spring'
  | 'retina-zap'
  | 'haunted-encore'
  | 'organ-applause';
/** A completed equipment interaction, captured by simulation. `at` is the
 * owning phase's clock: flight uses GameState.time, crashes use CrashFrame.time. */
export interface CombinationCue {
  id: string;
  kind: Combination;
  at: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number;
  bodyId?: number;
  targetId?: number;
  targetX?: number;
  targetY?: number;
}
/**
 * Art parts that count as metal when debris pairs up, so a loose eye striking
 * one of them stages a retina zap instead of an ordinary impact.
 */
export const METAL_PARTS = new Set([
  'cabinet',
  'piano',
  'helmet',
  'drum',
  'tnt',
  'baler',
  'rescue',
  'ufo',
]);
/**
 * Seconds each combination stays on screen after its cue time. The effect is
 * dropped once a cue is older, which is what bounds a replayed recording.
 */
export const COMBINATION_LIFE: Record<Combination, number> = {
  'gas-spring': 1.75,
  'retina-zap': 1.5,
  'haunted-encore': 2.4,
  'organ-applause': 2.1,
};
/**
 * True when a completed flip may be cashed as an ovation: acrobat and confetti
 * are both equipped, the routine has landed three distinct tricks and is
 * neither running nor already scored, fewer than `capacity` flaps are spent,
 * and no ovation cue has fired yet. Awarding it is the caller's job.
 */
export function ovationReady(
  equipment: readonly string[],
  routine: Routine | undefined,
  cues: readonly CombinationCue[],
  flaps: number,
  capacity: number,
) {
  return (
    equipment.includes('acrobat') &&
    equipment.includes('confetti') &&
    !!routine &&
    !routine.settled &&
    !routine.active &&
    Object.values(routine.counts).filter((n) => n > 0).length >= 3 &&
    flaps < capacity &&
    !cues.some((cue) => cue.kind === 'organ-applause')
  );
}

/** Age gates are reversible: seeking a recording cannot fire an effect early. */
export function combinationAge(cue: CombinationCue, time: number) {
  const age = time - cue.at;
  return age >= 0 && age < COMBINATION_LIFE[cue.kind] ? age : null;
}
