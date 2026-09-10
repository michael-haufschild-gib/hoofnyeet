import { PONY_BODY_Y } from '../../art/geometry';
import { ponyPose } from '../../art/pose';
import type { GameEvent, GameState } from '../../simulation';

/** Capture the nozzle at the real flap, including rolls. Replay never guesses
 * the equipment or uses the horse's later position to start an old effect. */
export function recordPerkEvent(event: GameEvent, state: GameState): GameEvent {
  const recorded = { ...event, sceneTime: state.time };
  if (event.kind !== 'flap' || !state.equipment.includes('beans'))
    return recorded;
  const pose = ponyPose(state, state.time);
  const angle = state.rotation + pose.bodyAngle;
  const x = -58 * pose.xScale,
    y = 9 * pose.yScale;
  return {
    ...recorded,
    propulsion: {
      x: event.x + Math.cos(angle) * x - Math.sin(angle) * y,
      y:
        event.y +
        PONY_BODY_Y +
        pose.bob +
        Math.sin(angle) * x +
        Math.cos(angle) * y,
      angle,
      vx: state.vx,
      vy: state.vy,
      power: state.equipment.includes('tailwind') ? 1.6 : 1,
    },
  };
}

/**
 * Seconds a single exhaust puff lives. Puffs in one burst start 0.045 s apart
 * by index, so the burst as a whole outlasts this by its own stagger.
 */
export const PUFF_LIFE = 1.25;
/** Absolute-time curves give the same puff at 30, 60, 120 fps or in a clip. */
export function propulsionPuff(event: GameEvent, index: number, time: number) {
  const burst = event.propulsion;
  if (!burst) return null;
  const age = time - (event.sceneTime ?? event.time ?? 0) - index * 0.045;
  if (age < 0 || age >= PUFF_LIFE) return null;
  const progress = age / PUFF_LIFE;
  const spread = Math.sin(index * 2.4) * 0.35;
  const angle = burst.angle + spread;
  const travel = (1 - Math.exp(-age * 2.5)) * (105 + index * 11) * burst.power;
  return {
    x: burst.x + burst.vx * age * 0.6 - Math.cos(angle) * travel,
    y:
      burst.y +
      burst.vy * age * 0.6 -
      Math.sin(angle) * travel -
      age * age * 24,
    size:
      (30 + index * 3 + Math.sin(progress * Math.PI * 0.65) * 100) *
      Math.sqrt(burst.power),
    angle: burst.angle + Math.sin(index * 7) * age * 0.35,
    alpha: Math.min(1, age * 24) * Math.min(1, (1 - progress) * 2) * 0.86,
  };
}
