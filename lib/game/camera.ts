import type { GameState } from './simulation';
import { GROUND_Y } from './geometry';

export interface CameraFrame {
  x: number;
  y: number;
  zoom: number;
  ground: number;
  subjectTop: number;
  safeTop: number;
}

export const TITLE_PONY_X = 180;

/** Keep the landing plane in view. Flight height changes scale, not the horizon. */
export function frameGame(
  s: GameState,
  width: number,
  height: number,
  previous: CameraFrame | null,
  dt: number,
  reduced = false,
  bottomInset = 0,
  topInset?: number,
): CameraFrame {
  const crash = !!s.wreck && ['landing', 'results', 'replay'].includes(s.phase);
  const short = height < 350;
  const portrait = width < 600 || height > width;
  if (s.phase === 'title') {
    // Match the title's container query, including portrait tablets.
    const stacked = width <= 600 || (width <= 900 && height >= width);
    const zoom = Math.min(
      (width * (stacked ? 0.68 : 0.42)) / 180,
      (height * (stacked ? (width > 600 ? 0.33 : 0.29) : 0.62)) / 135,
      stacked ? 3.4 : 4.6,
    );
    // Centre the pony beside the menu, with its hooves on the track. Anchoring
    // the track to 80% of the screen separated them in tall desktop windows.
    // The compact title reserves room below the hooves for the control guide
    // and navigation, instead of letting the extra buttons cover the pony.
    const ground = stacked
      ? Math.min(height * 0.48, height - 355)
      : height * 0.5 + (135 * zoom) / 2;
    return {
      x: TITLE_PONY_X - (stacked ? 0 : (width * 0.25) / zoom),
      y: GROUND_Y - (ground - height * 0.58) / zoom,
      zoom,
      ground,
      subjectTop: ground - 135 * zoom,
      safeTop: 0,
    };
  }
  const safeTop = topInset ?? (short ? 96 : portrait ? 174 : 148);
  const ground = height - Math.max(short ? 46 : 74, bottomInset + 32);
  const focusX = crash ? s.wreck!.focusX : s.x;
  const focusY = crash ? s.wreck!.focusY : s.y;
  const focusBody = crash
    ? s.wreck!.bodies.find(
        (body) =>
          body.id === s.wreck!.focusId ||
          (body.x === focusX && body.y === focusY),
      )
    : undefined;
  const radiusX = focusBody
    ? (Math.abs(Math.cos(focusBody.angle)) * focusBody.w +
        Math.abs(Math.sin(focusBody.angle)) * focusBody.h) /
      2
    : 50;
  const radiusY = focusBody
    ? (Math.abs(Math.sin(focusBody.angle)) * focusBody.w +
        Math.abs(Math.cos(focusBody.angle)) * focusBody.h) /
      2
    : 70;
  const afterProp = crash
    ? s.wreck!.bodies.find((body) => body.id === s.wreck!.aftermath?.propId)
    : undefined;
  const subjectTop = Math.min(
    -110,
    focusY - (crash ? Math.max(100, radiusY + 30) : 120),
    afterProp
      ? afterProp.y - Math.hypot(afterProp.w, afterProp.h) * 0.5 - 20
      : 0,
  );
  // Anticipate upward motion so a flap does not push the pony into the HUD.
  const anticipatedTop = subjectTop - (crash ? 0 : Math.max(0, -s.vy) * 0.16);
  const nominal = crash
    ? portrait
      ? Math.min(2.8, width / 260)
      : Math.min(1.65, width / 460)
    : s.phase === 'flight'
      ? Math.min(1.15, width / 620)
      : Math.min(1.45, width / 520);
  const available = Math.max(45, ground - safeTop);
  const targetZoom = Math.min(nominal, available / (GROUND_Y - anticipatedTop));
  const targetX =
    focusX + (s.phase === 'runup' ? (portrait ? 85 : 160) : crash ? 60 : 110);
  const blend = reduced || !previous ? 1 : 1 - Math.exp(-dt * 5);
  let zoom = previous
    ? previous.zoom + (targetZoom - previous.zoom) * blend
    : targetZoom;
  // Smoothing must never override visibility, including after a resize or ejection.
  zoom = Math.min(
    zoom,
    available / (GROUND_Y - subjectTop),
    (width - 36) / (radiusX * 2),
  );
  let x = previous ? previous.x + (targetX - previous.x) * blend : targetX;
  {
    // Possession and ejection can change the subject in a single tick.
    const margin = Math.max(portrait ? 55 : 80, radiusX * zoom + 18);
    const reach = Math.max(0, (width / 2 - margin) / zoom);
    x = Math.max(focusX - reach, Math.min(focusX + reach, x));
  }
  return {
    x,
    y: GROUND_Y - (ground - height * 0.58) / zoom,
    zoom,
    ground,
    subjectTop: ground - (GROUND_Y - subjectTop) * zoom,
    safeTop,
  };
}
