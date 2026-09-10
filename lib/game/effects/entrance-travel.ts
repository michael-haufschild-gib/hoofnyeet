/**
 * The horizontal extent of the current camera shot in world units, so an
 * effect can work out how far outside it a prop has to begin.
 */
export interface SceneBounds {
  left: number;
  right: number;
}

/** Resting positions and contact times remain in world space. Only the unseen
 * travel grows when another disaster opens a wider camera shot. */
export function entranceTravel(
  anchor: number,
  side: -1 | 1,
  bounds?: SceneBounds,
  minimum = 1420,
  margin = 260,
) {
  if (!bounds) return minimum;
  return Math.max(
    minimum,
    side > 0 ? bounds.right + margin - anchor : anchor - bounds.left + margin,
  );
}
