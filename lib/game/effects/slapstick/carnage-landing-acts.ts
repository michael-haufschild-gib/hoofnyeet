import { GROUND_Y } from '../../art/geometry';
import type { BodyPose } from '../../crash';
import type { CarnageCue } from '../../catalogue/escalation';
import type { GameState } from '../../simulation';
import { anatomyPoint } from '../motion/anatomy-motion';
import { CREAM, INK, ease, type CarnageBrush } from './carnage-brush';

/** Washing strung above the fence, with three organs pegged out to dry. */
export function carnageLaundry(brush: CarnageBrush, x: number, t: number) {
  brush.ribbon(x - 105, -140, x + 115, -140, t, 3, CREAM, 20);
  brush.art('skin', x - 32, -79, 138, 105, Math.sin(t * 3) * 0.09);
  for (let i = 0; i < 3; i++) {
    const xx = x + 40 + i * 25;
    brush.drawings
      .roundRect(xx - 3, -135, 6, 18, 2)
      .fill(0xffd478)
      .stroke({ color: INK, width: 1 });
    brush.ribbon(xx, -119, xx + Math.sin(t * 4 + i) * 8, -82, t, 4);
    brush.organ(xx + Math.sin(t * 4 + i) * 8, -74, 17, t + i);
  }
}

/** A single molar rising out of the wreck as the set finishes, from 4.3 s. */
function molar(brush: CarnageBrush, x: number, y: number, t: number) {
  const yy = y - 47 - Math.max(0, 4.9 - t) * 170;
  brush.drawings
    .poly([
      x - 10,
      yy - 21,
      x + 4,
      yy - 21,
      x + 4,
      yy + 5,
      x + 19,
      yy + 9,
      x + 17,
      yy + 20,
      x - 10,
      yy + 17,
    ])
    .fill(0xffffec)
    .stroke({ color: INK, width: 2 });
}

/** Washing-line landing: laundry, a bystanding skeleton and a bone mangle. */
export function fence(brush: CarnageBrush, c: CarnageCue, t: number) {
  const x = c.x,
    y = GROUND_Y,
    g = brush.drawings;
  carnageLaundry(brush, x, t);
  brush.art(
    'skeleton',
    x - 117 + Math.sin(t * 5) * 12,
    y - 53,
    72,
    100,
    Math.sin(t * 7) * 0.13,
  );
  for (let i = 0; i < 5; i++) {
    const xx = x + 55 + i * 22,
      yy = y - 20 - Math.abs(Math.sin(t * 9 + i)) * 16;
    brush.ribbon(xx - 28, yy, xx, yy, t, 4);
    brush.art(i % 2 ? 'bone' : 'jam', xx, yy, 27, 24, t * 5 + i);
  }
  for (let i = 0; i < 2; i++) {
    g.roundRect(x + 66, y - 90 + i * 25, 82, 21, 10)
      .fill(0x7eaaa7)
      .stroke({ color: INK, width: 3 });
    for (let j = 0; j < 5; j++)
      g.moveTo(x + 73 + j * 15, y - 88 + i * 25)
        .lineTo(x + 78 + j * 15, y - 73 + i * 25)
        .stroke({ color: CREAM, width: 2 });
  }
  if (t > 4.3) molar(brush, x, y, t);
}

/**
 * A point on the recorded sheep in `u`,`v` sprite fractions, falling back to
 * the authored `dx`,`dy` world offset when the frame carries no sheep body.
 */
function sheepAnchor(
  body: BodyPose | undefined,
  xx: number,
  yy: number,
  u: number,
  v: number,
  dx: number,
  dy: number,
) {
  return body ? anatomyPoint(body, u, v) : { x: xx + dx, y: yy + dy };
}

/** Jaw gape 0..1: fast chewing for the first 2.4 s, then a held gloat. */
function chewGape(t: number) {
  return t < 2.4 ? 0.65 + Math.sin(t * 12) * 0.3 : 0.85;
}

/** Locates the recorded sheep prop this tableau attaches itself to. */
function sheepProp(s: GameState, c: CarnageCue) {
  return s.wreck!.bodies.find((b) => b.id === c.propId && b.part === 'sheep');
}

/** The swallowed torso coming back up between 2.4 s and 4.1 s, eye first. */
function regurgitate(brush: CarnageBrush, xx: number, yy: number, t: number) {
  const b = t - 2.4;
  brush.art(
    'torso',
    xx + 50 + b * 65,
    yy - 15 - b * 28,
    110 + b * 45,
    83 + b * 25,
    -0.3,
    (1 - b / 1.7) * 0.5,
    brush.red,
  );
  brush.art('eye', xx + 75 + b * 70, yy - 60 + b * b * 40, 22, 26, b * 6);
}

/** A second head arrives from 3.8 s and starts on the leftovers. */
function secondCourse(
  brush: CarnageBrush,
  body: BodyPose | undefined,
  xx: number,
  yy: number,
  scale: number,
  angle: number,
  t: number,
) {
  const head = sheepAnchor(body, xx, yy, -0.24, -0.175, -39, -25);
  brush.art(
    'offended-head',
    head.x,
    head.y,
    76 * scale,
    84 * scale,
    angle - 0.4,
  );
  const jaw = sheepAnchor(body, xx, yy, -0.073, -0.042, -12, -6);
  brush.mouth(
    jaw.x,
    jaw.y,
    31 * scale,
    28 * scale,
    t,
    0.4 + Math.abs(Math.sin(t * 11)) * 0.6,
    angle,
  );
}

/** Replacement landing: a sheep eats the wreck, then thinks better of it. */
export function sheep(
  brush: CarnageBrush,
  c: CarnageCue,
  t: number,
  s: GameState,
) {
  const body = sheepProp(s, c);
  const xx = body?.x ?? c.x,
    yy = body?.y ?? GROUND_Y - 67;
  if (!body) brush.art('sheep', xx, yy, 163, 143);
  const jaw = sheepAnchor(body, xx, yy, 0.17, 0.056, 27, 8);
  const gaze = sheepAnchor(body, xx, yy, 0.06, -0.266, 10, -38);
  const scale = body ? body.w / 163 : 1,
    angle = body?.angle ?? 0;
  brush.mouth(jaw.x, jaw.y, 88 * scale, 91 * scale, t, chewGape(t), angle);
  brush.eyes(gaze.x, gaze.y, 15 * scale, t, true, angle);
  for (let i = 0; i < 3; i++) {
    const bone = sheepAnchor(
      body,
      xx,
      yy,
      -0.215 + i * 0.08,
      0.06,
      -35 + i * 13,
      9,
    );
    brush.art(
      'bone',
      bone.x,
      bone.y,
      44 * scale,
      24 * scale,
      t + i + angle,
      0.45,
      INK,
    );
  }
  if (t > 2.4 && t < 4.1) regurgitate(brush, xx, yy, t);
  if (t > 3.8) secondCourse(brush, body, xx, yy, scale, angle, t);
}

/** The bouquet arrives from 3.8 s and the final pose settles at 4.9 s. */
function curtainCall(brush: CarnageBrush, x: number, y: number, t: number) {
  const enter = ease((t - 3.8) * 2);
  brush.art(
    'bouquet',
    x + 110 - enter * 90,
    y - 56,
    111,
    130,
    -0.2 + Math.sin(t * 9) * 0.05,
  );
  if (t < 4.9)
    brush.art('straightLeg', x - 10, y - 38, 27, 66, Math.sin(t * 5) * 0.3);
  if (t > 4.9) brush.art('straightLeg', x + 31, y - 70, 17, 23, 1.4);
}

/** Pirouette landing: the wreck spins on one leg, then takes its bows. */
export function ballet(brush: CarnageBrush, c: CarnageCue, t: number) {
  const x = c.x,
    y = GROUND_Y;
  const spin = t < 2.4 ? t * (4 + t * 3) : t * 4;
  for (let i = 0; i < 4; i++) {
    const a = spin + (i * Math.PI) / 2;
    const outward = t > 2.4 ? Math.min(110, (t - 2.4) * 100) : 32;
    const xx = x + Math.sin(a) * outward;
    brush.art(
      'skeletal-front-leg-straight',
      xx,
      y - 37 - Math.abs(Math.cos(a)) * 12,
      35,
      65,
      Math.sin(a) * 0.9,
    );
    if (t < 3) brush.ribbon(x, y - 63, xx, y - 50, t + i, 8, brush.red, -27);
  }
  brush.art('crown', x, y - 109, 50, 38, Math.sin(t * 7) * 0.25);
  if (t > 3.8) curtainCall(brush, x, y, t);
}

/** The front-row sheep bleats, then brings its own lunch back up. */
function bleater(brush: CarnageBrush, x: number, local: number) {
  brush.mouth(x + 8, GROUND_Y - 28, 30, 22, local, local > 1.3 ? 0.6 : 1);
  if (local <= 1.3) return;
  brush.ribbon(
    x + 19,
    GROUND_Y - 25,
    x + 40 + Math.sin(local * 8) * 6,
    GROUND_Y,
    local,
    7,
    0x99b94b,
    -12,
  );
}

/**
 * One member of the front row, `i` running 0..2 left to right, `local` seconds
 * since it walked on. The middle goose faints once it has watched for 1.7 s.
 */
function onlooker(brush: CarnageBrush, x: number, i: number, local: number) {
  const faint = i === 1 && local > 1.7;
  brush.art(
    i === 0 ? 'sheep' : 'goose',
    x,
    GROUND_Y - (faint ? 19 : 36),
    61,
    74,
    faint ? ease(local - 1.7) * 1.5 : Math.sin(local * 8) * 0.08,
  );
  if (i === 0) bleater(brush, x, local);
  if (i === 2 && local > 2) {
    brush.art('bone', x - 20, GROUND_Y - 40, 37, 17, Math.sin(local * 9) * 0.4);
    brush.eyes(x + 9, GROUND_Y - 47, 7, local);
  }
}

/**
 * Three onlookers wander in behind the landing, staggered 0.45 s apart and
 * starting 0.7 s after contact. `age` is seconds since the landing cue.
 */
export function carnageSpectators(
  brush: CarnageBrush,
  c: CarnageCue,
  age: number,
) {
  if (age < 0.7) return;
  for (let i = 0; i < 3; i++) {
    const local = age - 0.7 - i * 0.45;
    if (local < 0) continue;
    onlooker(brush, c.x - 175 + i * 170, i, local);
  }
}
