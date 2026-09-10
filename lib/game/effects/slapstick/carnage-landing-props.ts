import { GROUND_Y } from '../../art/geometry';
import type { BodyPose } from '../../crash';
import type { CarnageCue } from '../../catalogue/escalation';
import type { GameState } from '../../simulation';
import { CREAM, INK, clamp, ease, type CarnageBrush } from './carnage-brush';

/**
 * One sausage in the marching line, `i` running 0..4. `local` is seconds since
 * that sausage stepped off the baler, so nothing is drawn before it does. The
 * last of the five is helmeted and vacuum-packed once `t` passes 4 s.
 */
function bale(
  brush: CarnageBrush,
  x: number,
  y: number,
  i: number,
  t: number,
  progress: number,
) {
  const local = t - i * 0.22 - 0.25;
  if (local < 0) return;
  const xx = x - 75 + progress * (i * 47 + 55);
  const walk = brush.reduced ? 0 : Math.abs(Math.sin(local * 13)) * 5;
  const shrink = i === 4 ? 1 - ease((t - 4) * 2) * 0.65 : 1;
  brush.art(
    'sausage',
    xx,
    y - 27 - walk,
    75 * shrink,
    54 * shrink,
    Math.sin(local * 9) * 0.04,
  );
  if (i) brush.ribbon(xx - 30, y - 29, xx - 52, y - 32, local, 5);
  brush.eyes(xx + 17, y - 39 - walk, 5 * shrink, local, true);
  if (i !== 4) return;
  brush.art('helmet', xx + 17, y - 53 - walk, 31, 25, -0.2);
  if (t <= 4) return;
  brush.drawings
    .roundRect(xx - 29, y - 56, 58, 52, 6)
    .fill({ color: 0xc6faf1, alpha: 0.22 })
    .stroke({ color: 0x92d6d8, width: 2 });
}

/** Flat-pack landing: a baler turns the wreck into a marching sausage line. */
export function haystack(brush: CarnageBrush, c: CarnageCue, t: number) {
  const x = c.x,
    y = GROUND_Y;
  const progress = ease((t - 0.2) / 2);
  brush.art('baler', x - 88, y - 69, 138, 138, Math.sin(t * 30) * 0.018);
  for (let i = 0; i < 5; i++) bale(brush, x, y, i, t, progress);
  brush.organ(x - 58, y - 16, 30, t);
}

/**
 * Spatter and a sweeping wiper painted in the ambulance's own frame, in
 * fractions of its sprite. Screen-space line work would hover over whichever
 * part of the rotating vehicle happened to be below it.
 */
function windscreen(brush: CarnageBrush, van: BodyPose, t: number) {
  const g = brush.localDrawing(van.x, van.y, van.angle, van.w, van.h);
  for (let i = 0; i < 4; i++)
    g.ellipse(
      -0.33 + i * 0.035,
      -0.19 + Math.sin(i * 2) * 0.03,
      0.033,
      0.024,
    ).fill({ color: brush.red, alpha: 0.85 });
  g.arc(-0.3, -0.087, 0.125, -2, -0.86).stroke({
    color: brush.red,
    width: 0.035,
    alpha: 0.42,
  });
  const sweep = Math.sin(t * 11) * 0.45 + 0.18;
  g.moveTo(-0.3, -0.087)
    .lineTo(-0.3 + Math.sin(sweep) * 0.11, -0.087 - Math.cos(sweep) * 0.16)
    .stroke({ color: INK, width: 0.012, cap: 'round' })
    .restore();
}

/** Three transfusion bags bobbing above the wreck on their own lines. */
function bloodBags(brush: CarnageBrush, x: number, y: number, t: number) {
  const g = brush.drawings;
  for (let i = 0; i < 3; i++) {
    const bx = x - 70 + i * 65,
      by = y - 70 - Math.sin(t * 3 + i) * 15;
    g.roundRect(bx - 13, by - 22, 26, 41, 5)
      .fill({ color: 0xfff3d8, alpha: 0.8 })
      .stroke({ color: INK, width: 2 });
    g.roundRect(bx - 10, by - 3, 20, 18, 3).fill(brush.red);
    brush.ribbon(bx, by + 20, x, y - 12, t + i, 3);
  }
}

/** Twelve claim forms drifting across the set on a slow sine. */
function paperwork(brush: CarnageBrush, x: number, y: number, t: number) {
  const g = brush.drawings;
  for (let i = 0; i < 12; i++) {
    const xx = x - 110 + i * 20,
      yy = y - 100 + Math.sin(t * 4 + i * 0.55) * 28;
    g.poly([
      xx - 11,
      yy - 11,
      xx + 11,
      yy - 8,
      xx + 11,
      yy + 12,
      xx - 11,
      yy + 9,
    ])
      .fill(CREAM)
      .stroke({ color: INK, width: 1 });
    g.moveTo(xx - 7, yy - 3)
      .lineTo(xx + 6, yy - 3)
      .moveTo(xx - 7, yy + 2)
      .lineTo(xx + 3, yy + 2)
      .stroke({ color: INK, width: 1 });
  }
}

/** Rescue landing: an ambulance, bagged blood, claim forms and one auditor. */
export function mud(
  brush: CarnageBrush,
  c: CarnageCue,
  t: number,
  s: GameState,
) {
  const x = c.x,
    y = GROUND_Y;
  const van = s.wreck!.bodies.find((b) => b.part === 'rescue');
  if (van) windscreen(brush, van, t);
  bloodBags(brush, x, y, t);
  paperwork(brush, x, y, t);
  if (t <= 2.4) return;
  brush.art(
    'officeGoose',
    x + 130 - (t - 2.4) * 70,
    y - 80 - Math.sin(clamp((t - 2.4) / 3) * Math.PI) * 95,
    65,
    77,
    (t - 2.4) * 5,
  );
}

/** The tractor beam claims the skeleton once the sneeze has played out. */
function abduction(brush: CarnageBrush, x: number, y: number, t: number) {
  const travel = ease((t - 3.6) / 1.6);
  brush.art(
    'skeleton',
    x + travel * 80,
    y - 57 - travel * 60,
    76,
    110,
    -travel * 0.8,
  );
  brush.art(
    'magnetic-horseshoe',
    x + travel * 80,
    y - 120 - travel * 60,
    49,
    43,
    Math.PI,
  );
  brush.ribbon(
    x + travel * 80,
    y - 130 - travel * 60,
    x + 90,
    y - 230,
    t,
    3,
    0x617a89,
    0,
  );
}

/** Abduction landing: a UFO inhales the wreck, then sneezes the bones out. */
export function accordion(brush: CarnageBrush, c: CarnageCue, t: number) {
  const x = c.x,
    y = GROUND_Y,
    yy = y - 135;
  brush.art('ufo', x, yy - 35, 165, 114, Math.sin(t * 6) * 0.06);
  for (let i = 0; i < 6; i++) {
    const fly = Math.max(0, t - 2.4);
    brush.art(
      i % 2 ? 'skeletal-front-leg-straight' : 'bone',
      x + Math.sin(i * 2 + t) * (25 + fly * 53),
      yy + 10 + i * 7 + fly * fly * 34,
      55,
      40,
      i * 1.4 + fly * 8,
    );
  }
  brush.art('offended-head', x, yy + 38, 59, 64, t < 2.4 ? Math.PI : 0);
  brush.drawings
    .roundRect(x - 47, yy - 26, 94, 99, 23)
    .fill({ color: 0xacfde3, alpha: 0.17 })
    .stroke({ color: 0x81ecd7, width: 3 });
  if (t > 3.6) abduction(brush, x, y, t);
}

/**
 * One rib of the xylophone piano, `i` running 0..7. Ivory ribs form actual
 * playable keys; bone sprites remain as the knuckles, and the authored key
 * silhouette stays clear of the red base. Struck notes stop at 4.2 s.
 */
function ribKey(
  brush: CarnageBrush,
  x: number,
  y: number,
  i: number,
  t: number,
) {
  const g = brush.drawings;
  const xx = x - 76 + i * 22;
  const strike = t < 4.2 ? Math.max(0, Math.cos(t * 9 - i * 0.85)) ** 8 : 0;
  brush.art('bone', xx, y - 36 + strike * 7, 59, 21, Math.PI / 2);
  const ky = y - 61 + strike * 7;
  g.moveTo(xx - 8, ky + 4)
    .quadraticCurveTo(xx - 11, ky - 3, xx - 4, ky)
    .quadraticCurveTo(xx, ky - 4, xx + 4, ky)
    .quadraticCurveTo(xx + 11, ky - 3, xx + 8, ky + 4)
    .lineTo(xx + 7, y - 13)
    .quadraticCurveTo(xx, y - 8, xx - 7, y - 13)
    .closePath()
    .fill(CREAM)
    .stroke({ color: INK, width: 2 });
  g.moveTo(xx - 3, ky + 9)
    .lineTo(xx - 3, y - 18)
    .stroke({ color: 0xffffff, width: 2, alpha: 0.65 });
  if (i % 3 !== 0 && i < 7)
    g.roundRect(xx + 8, ky + 5, 9, 22, 3)
      .fill(0x64353b)
      .stroke({ color: INK, width: 1.5 });
  if (i % 2 === 0)
    brush.art(
      'eye',
      xx,
      y -
        68 -
        Math.abs(Math.sin(Math.min(t, 4.2) * 4.5 - i * 0.425)) *
          43 *
          (1 - ease((t - 4.2) * 3)),
      22,
      25,
    );
}

/** The lid stays with the recorded piano body while it is still falling. */
function pianoLid(brush: CarnageBrush, s: GameState, t: number) {
  const cue = s.wreck!.carnage!.cues.find(
    (v) => v.kind === 'landing' && v.stage === 2,
  );
  const piano = s.wreck!.bodies.find((b) => b.id === cue?.propId);
  if (!piano || t >= 3.8) return;
  const g = brush.drawings;
  const py = piano.y - piano.h * 0.6 - 35;
  g.moveTo(piano.x - 30, py)
    .quadraticCurveTo(piano.x, py - 27, piano.x + 30, py)
    .closePath()
    .fill(0xffdc85)
    .stroke({ color: INK, width: 2 });
  for (const side of [-1, 1])
    g.moveTo(piano.x + side * 30, py)
      .lineTo(piano.x + side * 42, piano.y - piano.h * 0.3)
      .stroke({ color: CREAM, width: 2 });
}

/** Recital landing: the ribcage becomes a keyboard a falling piano plays. */
export function cartwheel(
  brush: CarnageBrush,
  c: CarnageCue,
  t: number,
  s: GameState,
) {
  const x = c.x,
    y = GROUND_Y,
    g = brush.drawings;
  g.roundRect(x - 94, y - 20, 194, 15, 7)
    .fill(brush.red)
    .stroke({ color: INK, width: 3 });
  g.ellipse(x + 7, y - 11, 106, 8).fill({ color: brush.pink, alpha: 0.4 });
  for (let i = 0; i < 8; i++) ribKey(brush, x, y, i, t);
  for (let i = 0; i < 2; i++)
    brush.art(
      'straightLeg',
      x - 60 + i * 115,
      y -
        88 -
        Math.abs(Math.sin(Math.min(t, 4.2) * 4.5 + i * 1.5)) *
          22 *
          (1 - ease((t - 4.2) * 3)),
      33,
      58,
      i ? 0.7 : -0.7,
    );
  pianoLid(brush, s, t);
  if (t > 4.4)
    brush.art('bone', x + 15, y - 68 - Math.max(0, 4.9 - t) * 260, 16, 22, 0.2);
}
