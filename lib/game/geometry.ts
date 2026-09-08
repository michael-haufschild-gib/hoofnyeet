import measurements from './art-metrics.json';

/** World coordinates: y=0 is both the visible contact line and the collider surface. */
export const GROUND_Y = 0;
export const PONY_BODY_Y = -57;
export const LEG_SIZE = { width: 23, height: 58, anchorY: 0.1 };
export const LEG_HIPS = [
  { key: 'backLeg1', x: -31, y: 5 },
  { key: 'backLeg2', x: -40, y: 5 },
  { key: 'frontLeg1', x: 27, y: 5 },
  { key: 'frontLeg2', x: 36, y: 5 },
] as const;

export function artGeometry(part: string) {
  return measurements[part as keyof typeof measurements] ?? measurements.crate;
}

export function fitArt(part: string, width: number, height: number) {
  const art = artGeometry(part),
    scale = Math.min(width / art.width, height / art.height);
  return { w: art.width * scale, h: art.height * scale };
}

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
