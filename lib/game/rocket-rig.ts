import { TRACK, type GameState } from './simulation';

/** Normalized sockets measured on the trimmed jetpack artwork. Both exhaust
 * renderers use these same nozzle lips, including the source's diagonal axis. */
export const ROCKET_ART = {
  anchor: { x: 0.76, y: 0.57 },
  nozzles: [
    { x: 0.156, y: 0.552 },
    { x: 0.43, y: 0.69 },
  ],
  axis: 2.06,
  height: 74,
} as const;

const smooth = (n: number) => {
  const t = Math.max(0, Math.min(1, n));
  return t * t * (3 - 2 * t);
};

export function rocketRigPose(s: Pick<GameState, 'phase' | 'phaseTime'>) {
  // Stay folded through the approach. The trampoline's existing compression
  // anticipates the ignition, ending exactly at the airborne firing angle.
  const deployed =
    s.phase === 'flight'
      ? 1
      : s.phase === 'compression'
        ? smooth(s.phaseTime / TRACK.compressionTime)
        : 0;
  return { x: -19, y: -18, angle: 0.12 + deployed * 0.96 };
}
