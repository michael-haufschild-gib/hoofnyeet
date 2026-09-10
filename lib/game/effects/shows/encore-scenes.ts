import type { Graphics, Sprite } from 'pixi.js';
import { easeEncore as ease, type EncorePose } from '../motion/encore-motion';

const INK = 0x502638,
  CREAM = 0xffefcb,
  MINT = 0xa8efd9;

/** A point in the layer's own coordinates, in world units. */
interface Anchor {
  x: number;
  y: number;
}

/**
 * Everything a supporting act paints with. `red`, `reduced` and `gentle` are
 * refreshed by EncoreShow before every dispatch, so an act must read them off
 * the kit rather than capture them. `behind` is the layer drawn under the
 * illustrated machinery; `g` is the one drawn over it, and call order within
 * each layer is paint order.
 */
export interface EncoreKit {
  g: Graphics;
  behind: Graphics;
  red: number;
  reduced: boolean;
  gentle: boolean;
  art(
    key: string,
    x: number,
    y: number,
    w: number,
    h?: number,
    angle?: number,
    alpha?: number,
    tint?: number,
  ): Sprite | undefined;
  stand(
    key: string,
    x: number,
    w: number,
    h?: number,
    lift?: number,
  ): Sprite | undefined;
  point(
    sprite: Sprite | undefined,
    u: number,
    v: number,
    x: number,
    y: number,
  ): Anchor;
  local(x: number, y: number, angle?: number, target?: Graphics): Graphics;
  cord(
    x: number,
    y: number,
    xx: number,
    yy: number,
    t: number,
    width?: number,
  ): void;
  eye(x: number, y: number, size: number, time: number): void;
  cloud(
    x: number,
    y: number,
    age: number,
    variant: number,
    power?: number,
  ): void;
}

/** One printed colleague sliding out of the copier. `i` (0 to 3) staggers the
 * exit by 0.22s and alternates between a brain and a ribcage. */
function officeCopy(kit: EncoreKit, p: EncorePose, i: number) {
  const { x, age: t, consequence: c, payoff: end } = p;
  const out = ease((t - 2.4 - i * 0.22) / 0.55);
  if (!out) return;
  const xx = x + 34 + out * (28 + i * 22),
    yy = -47 + out * 29 - end * i * 7;
  kit
    .local(xx, yy, (i - 1) * 0.06, kit.behind)
    .rect(-18, -15, 36, 30)
    .fill(CREAM)
    .stroke({ color: INK, width: 2 })
    .restore();
  kit.art(i % 2 ? 'brain' : 'skeletal-torso', xx, yy - 1, 24, 23, -i * 0.1);
  if (c > 0) {
    const stride = kit.reduced ? 0 : Math.sin(t * 12 + i) * 0.4;
    kit.art('skeletal-front-leg-straight', xx - 9, -11, 10, 24, stride);
    kit.art('skeletal-front-leg-straight', xx + 9, -11, 10, 24, -stride);
  }
}

/** The office act: a clerk feeds the copier its own heart and the machine
 * prints four colleagues before it eats the clerk too. */
export function office(kit: EncoreKit, p: EncorePose) {
  const { x, age: t, windup, contact: k, payoff: end } = p;
  const copier = kit.stand('copier', x + 5, 126, 145, p.bob);
  if (copier && !kit.reduced) copier.rotation = Math.sin(t * 19) * k * 0.012;
  const clerk = kit.stand('officeGoose', x - 81 + windup * 22, 67, 90, p.bob);
  if (clerk) {
    clerk.scale.y *= 1 - end * 0.5;
    clerk.alpha *= 1 - end * 0.8;
  }
  if (windup > 0 && k < 1) {
    const heartX = x - 48 + windup * 50;
    kit.art('heart', heartX, -99 + windup * 14, 31, 36, windup * 1.3);
    kit.cord(x - 70, -50, heartX, -91, t);
  }
  for (let i = 0; i < 4; i++) officeCopy(kit, p, i);
  if (k > 0) {
    kit.g
      .moveTo(x - 26, -96)
      .lineTo(x + 39, -96)
      .stroke({ color: MINT, width: 4 });
    kit.cloud(x + 33, -46, t - 2.4, p.variant, 0.55);
  }
  if (end > 0) {
    kit.cord(x + 45, -48, x - 74, -55, t, 8);
    kit.art('wing-left', x - 76, -78 - end * 40, 31, 44, -end * 3);
    kit.eye(x + 6, -92, 32, t);
    kit.art('heart', x + 2, -36, 30, 38);
    kit.cloud(x, -90, t - 4.9, p.variant, 0.9);
  }
}

/** Three ingredients arc from the sheep into the jar, 0.18s apart, fading out
 * as they land and brightening again once contact begins. */
function moonSips(kit: EncoreKit, p: EncorePose) {
  const { x, age: t, contact: k } = p;
  for (let i = 0; i < 3; i++) {
    const sip = ease((t - 1.5 - i * 0.18) / 0.65),
      xx = x - 76 + sip * 107,
      yy = -52 - Math.sin(sip * Math.PI) * 38;
    kit.art(['eye', 'heart', 'bone'][i], xx, yy, 20, 24, sip * 3, 1 - sip + k);
  }
}

/** The jar's contents whirl faster the further the blend goes, over a shadow
 * that pools underneath as they liquefy. */
function moonBlend(kit: EncoreKit, p: EncorePose, jar: Anchor) {
  const { age: t, consequence: c, payoff: end } = p;
  for (let i = 0; i < (kit.reduced ? 3 : 7); i++) {
    const angle = i * 2.4 + (kit.reduced ? 0 : t * (5 + c * 8)),
      radius = 12 + (i % 3) * 4;
    kit.art(
      ['eye', 'bone', 'tooth'][i % 3],
      jar.x + Math.cos(angle) * radius,
      jar.y + Math.sin(angle) * radius * 0.85,
      14,
      17,
      angle,
      1 - end * 0.8,
    );
  }
  kit.g
    .ellipse(jar.x, jar.y + 27, 30, 7)
    .fill({ color: kit.red, alpha: 0.35 + c * 0.45 });
}

/** The moon act: a sheep tips its own contents into the lunar blender and the
 * resulting ghost leaves the crater wearing a helmet. */
export function moon(kit: EncoreKit, p: EncorePose) {
  const { x, age: t, windup, contact: k, consequence: c, payoff: end } = p;
  const blender = kit.stand('lunar-blender', x + 15, 188, 170, p.bob);
  const jar = kit.point(blender, 0.6, 0.405, x + 35, -102);
  const sheep = kit.stand('sheep', x - 95 + windup * 27, 74, 62, p.bob);
  if (sheep) {
    sheep.scale.x *= 1 - k * 0.6;
    sheep.scale.y *= 1 - k * 0.45;
    sheep.alpha *= 1 - c;
  }
  if (windup > 0) {
    kit.cord(x - 82 + windup * 27, -39, x - 54, -47, t, 4 + k * 3);
    moonSips(kit, p);
  }
  if (k > 0) moonBlend(kit, p, jar);
  if (c > 0) {
    kit.art(
      'brain',
      jar.x,
      jar.y - 2,
      32,
      27,
      kit.reduced ? 0 : Math.sin(t * 8) * 0.15,
      c,
    );
    kit.eye(jar.x - 8, jar.y - 5, 11, t);
    kit.eye(jar.x + 10, jar.y - 5, 11, t + 0.15);
  }
  if (end > 0) {
    kit.cloud(jar.x + 46, jar.y - 35, t - 4.9, p.variant, 1.15);
    kit.art(
      'ghost-head',
      jar.x + end * 55,
      jar.y - end * 77,
      42,
      49,
      end * 0.35,
      0.75,
    );
    kit.art('helmet', jar.x + end * 55, jar.y - end * 77 - 21, 29, 25);
    kit.cord(jar.x, jar.y + 17, jar.x + end * 55, jar.y - end * 77 + 18, t);
  }
}

/** The loaves are behind the illustrated lip and rise through the actual slots.
 * Each one is a framed ghost that browns once contact passes 0.7. */
function afterlifeSlots(kit: EncoreKit, p: EncorePose) {
  const { x, age: t, windup, contact: k, consequence: c, payoff: end } = p;
  const toastX = x + 10,
    toastY = -109;
  for (const side of [-1, 1]) {
    const rise = Math.sin(k * Math.PI) * 65 + c * 28 - end * 40,
      xx = toastX + side * 22 + end * side * 27,
      yy = toastY - rise + windup * 12;
    const frame = kit.local(xx, yy, side * (0.12 + end * 0.4), kit.behind);
    frame
      .roundRect(-17, -23, 34, 45, 9)
      .fill(kit.gentle ? 0xc6eddd : 0xd6a774)
      .stroke({ color: INK, width: 3 });
    frame
      .roundRect(-12, -17, 24, 32, 7)
      .fill(k > 0.7 && !kit.gentle ? 0x684254 : CREAM)
      .restore();
    kit.art('ghost-head', xx, yy - 3, 25, 31, side * 0.1, 0.85);
    if (c > 0) kit.cord(xx, yy + 9, x + side * 18, -55, t, 3);
  }
}

/** The afterlife act: the soul toaster pops two ghosts, and the reaper feeding
 * it shrinks away as its own replacement rises. */
export function afterlife(kit: EncoreKit, p: EncorePose) {
  const { x, age: t, windup, contact: k, payoff: end } = p;
  afterlifeSlots(kit, p);
  const toaster = kit.stand('soul-toaster', x + 12, 185, 172, p.bob);
  if (toaster && !kit.reduced)
    toaster.rotation = Math.sin(t * 18) * windup * (1 - k) * 0.025;
  const reaperX = x - 83 + end * 31;
  const reaper = kit.stand('reaper', reaperX, 68, 104, p.bob);
  if (reaper) {
    reaper.scale.y *= 1 - end * 0.6;
    reaper.alpha *= 1 - end * 0.7;
  }
  if (k > 0) {
    kit.art('bone', x - 45, -108 + k * 37, 42, 14, -k * 0.8);
    kit.cloud(x + 19, -118, t - 2.4, p.variant, 0.55);
  }
  if (end > 0) {
    kit.cord(x - 68, -26, reaperX, -72, t, 7);
    kit.art('ghost', x + 80 * end, -90 - end * 48, 55, 73, end * 0.4, 0.7);
    kit.art('bone', x + 88 * end, -107 - end * 48, 39, 12, end * 1.5);
    kit.cloud(x - 70, -65, t - 4.9, p.variant, 0.75);
  }
}
