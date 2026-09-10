import measurements from '../art-metrics.json';

/** World coordinates: y=0 is both the visible contact line and the collider surface. */
export const GROUND_Y = 0;
/**
 * World y of the pony's body origin while airborne, above the GROUND_Y contact
 * line. Grounded poses solve for hoof contact instead of using it.
 */
export const PONY_BODY_Y = -57;
/**
 * Leg sprite size in world units. `anchorY` is the fraction down the sprite
 * that pivots at the hip, so most of the leg hangs below the joint.
 */
export const LEG_SIZE = { width: 23, height: 58, anchorY: 0.1 };
/**
 * Hip joints in body-local world units, in the order a pose supplies its leg
 * angles; `key` names the sprite each joint drives.
 */
export const LEG_HIPS = [
  { key: 'backLeg1', x: -31, y: 5 },
  { key: 'backLeg2', x: -40, y: 5 },
  { key: 'frontLeg1', x: 27, y: 5 },
  { key: 'frontLeg2', x: 36, y: 5 },
] as const;

/**
 * Authored metrics for one art part: pixel `width` and `height` plus a `hull`
 * of 0..1 UV points. An unknown part falls back to the crate, so missing
 * metrics degrade to a box rather than throwing.
 */
export function artGeometry(part: string) {
  return measurements[part as keyof typeof measurements] ?? measurements.crate;
}

/**
 * The size the part's art takes when scaled to fill a `width` by `height` box
 * without distortion; the result is in the units of that box.
 */
export function fitArt(part: string, width: number, height: number) {
  const art = artGeometry(part),
    scale = Math.min(width / art.width, height / art.height);
  return { w: art.width * scale, h: art.height * scale };
}

/**
 * The part's hull as flat x, y pairs centred on the sprite and sized to
 * `width` by `height`. `units` divides the result: pass the pixels per physics
 * unit to build a collider, or leave it at 1 to stay in art units.
 */
export function collisionOutline(
  part: string,
  width: number,
  height: number,
  units = 1,
) {
  return new Float32Array(
    artGeometry(part).hull.flatMap(([x, y]) => [
      ((x - 0.5) * width) / units,
      ((y - 0.5) * height) / units,
    ]),
  );
}

/**
 * How far the lowest hull point falls below the anchor row once the art is
 * rotated by `angle` radians, in the units of `width` and `height`. Placing art
 * at `GROUND_Y - artFoot(...)` stands it on the track at any tilt.
 */
export function artFoot(
  part: string,
  width: number,
  height: number,
  angle = 0,
  anchorY = 0.5,
) {
  return Math.max(
    ...artGeometry(part).hull.map(
      ([u, v]) =>
        Math.sin(angle) * (u - 0.5) * width +
        Math.cos(angle) * (v - anchorY) * height,
    ),
  );
}

/**
 * Distance from the body origin down to the lowest hoof, for four leg `angles`
 * in radians ordered like LEG_HIPS, a rig squashed by `xScale` and `yScale`,
 * and a `bodyAngle` tilt in radians. The rig sits at the negated distance so
 * no hoof sinks through the track.
 */
export function hoofSupport(
  angles: number[],
  xScale: number,
  yScale: number,
  bodyAngle: number,
) {
  const feet = LEG_HIPS.flatMap((hip, i) =>
    artGeometry('straightLeg').hull.map(([u, v]) => {
      const tipX = (u - 0.5) * LEG_SIZE.width;
      const tipY = (v - LEG_SIZE.anchorY) * LEG_SIZE.height;
      const x =
        (hip.x + Math.cos(angles[i]) * tipX - Math.sin(angles[i]) * tipY) *
        xScale;
      const y =
        (hip.y + Math.sin(angles[i]) * tipX + Math.cos(angles[i]) * tipY) *
        yScale;
      return Math.sin(bodyAngle) * x + Math.cos(bodyAngle) * y;
    }),
  );
  return Math.max(...feet);
}
