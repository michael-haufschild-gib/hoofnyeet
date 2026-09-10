import { Graphics, type Sprite } from 'pixi.js';
import { artFoot } from '../../art/geometry';
import type { Illustration } from './spectator-show';
import {
  encorePose,
  type EncorePose,
  type EncoreSource,
} from '../motion/encore-motion';
import { afterlife, moon, office, type EncoreKit } from './encore-scenes';

const INK = 0x502638,
  CREAM = 0xffefcb;
// Alpha-bottom measurements from the isolated production illustrations.
const FOOT: Record<string, number> = {
  'organ-cart': 0.982759,
  'lunar-blender': 0.982507,
  'soul-toaster': 0.982955,
  camera: 1,
  popcorn: 1,
  copier: 1,
};

/** Supporting cartoons, sampled from the recorded finale receipt. They share
 * the existing bounded decorative pool and never capture the controlled pony. */
export class EncoreShow {
  readonly behind = new Graphics({ label: 'encore-behind-machine-lips' });
  private density = 1;
  private opacity = 1;
  private readonly kit: EncoreKit;
  constructor(
    private g: Graphics,
    private illustrate: Illustration,
  ) {
    this.kit = {
      g: this.g,
      behind: this.behind,
      red: 0xc51c49,
      reduced: false,
      gentle: false,
      art: this.art.bind(this),
      stand: this.stand.bind(this),
      point: this.point.bind(this),
      local: this.local.bind(this),
      cord: this.cord.bind(this),
      eye: this.eye.bind(this),
      cloud: this.cloud.bind(this),
    };
  }

  private art(
    key: string,
    x: number,
    y: number,
    w: number,
    h = w,
    angle = 0,
    alpha = 1,
    tint = 0xffffff,
  ) {
    const sprite = this.illustrate(
      key,
      x,
      y,
      w,
      h,
      angle,
      alpha * this.opacity,
      tint,
    );
    if (sprite) sprite.label = `encore-${key}`;
    return sprite;
  }
  private stand(key: string, x: number, w: number, h = w, lift = 0) {
    const sprite = this.art(key, x, 0, w, h);
    if (sprite)
      sprite.y =
        -(FOOT[key]
          ? (FOOT[key] - 0.5) * sprite.height
          : artFoot(key, sprite.width, sprite.height)) - lift;
    return sprite;
  }
  private point(
    sprite: Sprite | undefined,
    u: number,
    v: number,
    x: number,
    y: number,
  ) {
    return sprite
      ? {
          x: sprite.x + (u - 0.5) * sprite.width,
          y: sprite.y + (v - 0.5) * sprite.height,
        }
      : { x, y };
  }
  private local(x: number, y: number, angle = 0, target = this.g) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return target.save().setTransform(c, s, -s, c, x, y);
  }
  private cord(
    x: number,
    y: number,
    xx: number,
    yy: number,
    t: number,
    width = 5,
  ) {
    const sway = this.kit.reduced ? 0 : Math.sin(t * 8) * 10;
    const path = () =>
      this.g
        .moveTo(x, y)
        .bezierCurveTo(x + sway, y + 35, xx - sway, yy + 24, xx, yy);
    path().stroke({ color: INK, width: width + 3 });
    path().stroke({ color: this.kit.red, width });
    path().stroke({ color: this.kit.gentle ? 0xefcaff : 0xffa6af, width: 1.5 });
  }
  private eye(x: number, y: number, size: number, time: number) {
    const blink = !this.kit.reduced && Math.sin(time * 2.7) > 0.99 ? 0.12 : 1;
    const eye = this.art('eye', x, y, size, size * 1.15);
    if (eye) eye.scale.y *= blink;
  }
  private cloud(x: number, y: number, age: number, variant: number, power = 1) {
    if (age < 0 || age > 1.7) return;
    const reduced = this.kit.reduced;
    const count = reduced ? 3 : Math.round(12 * this.density);
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399 + variant * 0.8,
        flight = reduced ? Math.min(age, 0.5) : age,
        xx = x + Math.cos(angle) * (65 + i * 5) * flight * power,
        yy = Math.min(
          -11,
          y - (85 + i * 6) * flight * power + 95 * flight * flight,
        );
      this.art(
        ['tooth', 'bone', 'heart', 'eye'][i % 4],
        xx,
        yy,
        13 + (i % 3) * 4,
        22,
        reduced ? angle : angle + age * 6,
        Math.min(1, (1.7 - age) * 3),
      );
      if (!reduced)
        this.g
          .ellipse(xx + 5, yy + 6, 2 + (i % 3), 4 + (i % 2))
          .fill(this.kit.red);
    }
  }
  private cone(x: number, y: number, size: number, angle = 0) {
    const g = this.local(x, y, angle);
    g.poly([-size * 0.5, 0, size * 0.5, 0, 0, size * 1.3])
      .fill(0xe6b678)
      .stroke({ color: INK, width: 2 });
    for (let i = 0; i < 3; i++)
      g.moveTo(-size * (0.38 - i * 0.11), size * (0.24 + i * 0.3))
        .lineTo(size * (0.38 - i * 0.11), size * (0.1 + i * 0.3))
        .stroke({ color: 0xa97550, width: 1.5 });
    g.restore();
  }
  private chomp(x: number, y: number, width: number, open: number) {
    const h = 3 + open * 16;
    this.g
      .ellipse(x, y, width, h)
      .fill(INK)
      .stroke({ color: this.kit.red, width: 4 });
    for (let i = 0; i < 5; i++) {
      const xx = x - width * 0.7 + i * width * 0.35;
      this.g
        .poly([xx - 4, y - h + 2, xx + 4, y - h + 2, xx, y - h + 10])
        .fill(CREAM);
      this.g
        .poly([xx - 4, y + h - 2, xx + 4, y + h - 2, xx, y + h - 10])
        .fill(CREAM);
    }
  }
  private bounceLegs(x: number, y: number, t: number, moving: boolean) {
    for (const side of [-1, 1]) {
      const angle =
        this.kit.reduced || !moving
          ? side * 0.15
          : Math.sin(t * 14) * side * 0.5;
      const leg = this.art(
        'skeletal-front-leg-straight',
        x + side * 22,
        y,
        15,
        38,
        angle,
      );
      if (leg)
        leg.y = -artFoot(
          'skeletal-front-leg-straight',
          leg.width,
          leg.height,
          angle,
        );
    }
  }

  /** The X-ray the shutter leaves behind, plus the flash beam itself, which is
   * only painted while the shock lasts. */
  private farmSkeleton(p: EncorePose, victimX: number) {
    const { x, contact: k, payoff: end } = p;
    const skeleton = this.stand('skeleton', victimX, 67, 82);
    if (skeleton) {
      skeleton.alpha *= k * (1 - end);
      skeleton.scale.y *= 1 - end * 0.8;
    }
    if (!this.kit.reduced && p.shock > 0)
      this.g
        .poly([x - 32, -99, x - 32, -66, victimX - 34, -3, victimX - 34, -103])
        .fill({ color: CREAM, alpha: p.shock * 0.72 });
  }
  /** The developed print, which grows a face of its own, blinks, and finally
   * bites down on whatever it photographed. */
  private farmPhoto(p: EncorePose, victimX: number) {
    const { x, age: t, consequence: c, payoff: end } = p;
    const photoX = x + 12 + c * 54 - end * 98,
      photoY = -64 + c * 11,
      angle = -0.08 - end * 0.2;
    this.local(photoX, photoY, angle, this.behind)
      .roundRect(-27, -33, 54, 69, 3)
      .fill(CREAM)
      .stroke({ color: INK, width: 3 })
      .restore();
    this.art('offended-head', photoX, photoY - 8, 34, 37, angle);
    this.eye(photoX - 9, photoY - 15, 12, t);
    this.eye(photoX + 9, photoY - 15, 12, t + 0.1);
    this.chomp(
      photoX,
      photoY + 12,
      23,
      end * (this.kit.reduced ? 0.6 : 0.5 + Math.sin(t * 20) * 0.5),
    );
    if (end > 0) {
      this.cord(victimX, -44, photoX - 6, photoY + 15, t);
      this.art('helmet', photoX + 6, photoY - 37, 25, 24, end * 0.2);
      this.cloud(photoX, photoY + 4, t - 4.9, p.variant);
    }
  }
  private farm(p: EncorePose) {
    const { x, age: t, contact: k, consequence: c, payoff: end } = p;
    const victimX = x - 72 + end * 48;
    this.bounceLegs(x, -18, t, p.arrive < 1 || p.leave > 0);
    this.art('bone', x - 15, -34, 60, 14, -0.85);
    this.art('bone', x + 18, -34, 60, 14, 0.85);
    this.art(
      'camera',
      x + 2,
      -77 - p.bob,
      102,
      92,
      this.kit.reduced ? 0 : p.shock * 0.08,
    );
    const victim = this.stand(
      p.variant === 1 ? 'sheep' : 'goose',
      victimX,
      65,
      78,
      p.bob,
    );
    if (victim) {
      victim.alpha *= (1 - k) * (1 - end);
      victim.tint = k > 0 ? 0x593144 : 0xffffff;
    }
    if (k > 0) this.farmSkeleton(p, victimX);
    if (c > 0) this.farmPhoto(p, victimX);
  }

  private candy(p: EncorePose) {
    const { x, age: t, windup, contact: k, consequence: c, payoff: end } = p;
    const cart = this.stand('organ-cart', x + 19, 194, 178, p.bob);
    const mouth = this.point(cart, 0.73, 0.465, x + 55, -99);
    const gooseX = x - 89 + k * 45;
    const goose = this.stand('goose', gooseX, 58, 80, p.bob);
    if (goose) {
      goose.scale.set(
        goose.scale.x * (1 - k * 0.78),
        goose.scale.y * (1 - k * 0.7),
      );
      goose.y = -artFoot('goose', goose.width, goose.height) - k * 48;
      goose.alpha *= 1 - c;
    }
    const servingX = mouth.x - windup * 114 + c * 66,
      servingY = mouth.y + 16 + windup * 5 - k * 5;
    this.cone(servingX, servingY + 5, 24, -windup * 0.17);
    this.art(
      p.variant === 0 ? 'brain' : p.variant === 1 ? 'heart' : 'eye',
      servingX,
      servingY - 8,
      33 + k * 13,
      36 + k * 11,
      -windup * 0.1,
    );
    if (k > 0) {
      this.cord(gooseX, -54, servingX, servingY - 2, t);
      this.cloud(servingX, servingY, t - 2.4, p.variant, 0.65);
      this.eye(servingX - 8, servingY - 11, 13, t);
      this.eye(servingX + 10, servingY - 9, 13, t + 0.1);
    }
    if (c > 0) {
      this.cone(mouth.x + 9, mouth.y + 27, 33);
      this.art('offended-head', mouth.x + 9, mouth.y + 8, 41, 47);
      this.art(
        'wing-left',
        mouth.x - 15,
        mouth.y + 14,
        20,
        36,
        this.kit.reduced ? -0.3 : Math.sin(t * 11) * 0.6,
      );
    }
    if (end > 0) {
      this.chomp(servingX, servingY + 1, 22, end);
      const tongueX = mouth.x - end * 44;
      this.cord(mouth.x, mouth.y + 19, tongueX, mouth.y - end * 20, t, 8);
      this.art('brain', tongueX, mouth.y - end * 20 - 9, 27, 24, -end * 0.3);
      this.cloud(mouth.x, mouth.y, t - 4.9, p.variant, 0.8);
    }
  }

  /** Five ribs hop out of the bucket, gain eyes on contact and finally scatter
   * outward as the payoff throws them clear. */
  private carnivalRibs(p: EncorePose) {
    const { x, age: t, contact: k, consequence: c, payoff: end } = p;
    for (let i = 0; i < 5; i++) {
      const offset = i - 2,
        jump = this.kit.reduced ? 0 : Math.abs(Math.sin(t * 13 - i)) * c * 10,
        xx = x + offset * 24 + end * offset * 32,
        yy = -23 - jump - end * (55 + i * 8);
      this.art('bone', xx, yy, 17, 42 - i * 4, end * offset * 1.5);
      if (k > 0) this.eye(xx, yy - 14, 12, t + i * 0.2);
      if (c > 0 && !this.kit.reduced)
        this.g
          .circle(xx, yy - 25 - Math.abs(Math.sin(t * 8 + i)) * 12, 2.5)
          .fill(this.kit.red);
    }
  }
  private carnival(p: EncorePose) {
    const { x, age: t, contact: k, consequence: c, payoff: end } = p;
    const moving = p.arrive < 1 || p.leave > 0;
    this.bounceLegs(x, -18, t, moving);
    this.art(
      this.kit.gentle ? 'pastry' : 'popcorn',
      x,
      -63 - p.bob,
      102,
      108,
      this.kit.reduced ? 0 : Math.sin(t * 13) * k * 0.035,
    );
    this.art('brain', x, -116 - p.bob, 44, 35);
    for (const side of [-1, 1]) {
      const handX = x + side * (37 + k * 5),
        handY = -90 - (this.kit.reduced ? 0 : Math.sin(t * 13 + side) * 15 * c);
      this.cord(x + side * 24, -87, handX, handY, t, 4);
      this.art(
        'bone',
        handX + side * 8,
        handY - 5,
        42,
        12,
        side * (0.5 - c * 0.8),
      );
      this.art('straightLeg', handX, handY, 18, 22, side * 0.5);
    }
    this.carnivalRibs(p);
    if (k > 0) this.cloud(x, -94, t - 2.4, p.variant, 0.65);
    if (end > 0) {
      this.art('skeletal-torso', x + 80 * end, -53 - end * 70, 67, 61, end * 4);
      this.art('crown', x + 70 * end, -90 - end * 80, 31, 29, end * 2);
      this.cloud(x, -105, t - 4.9, p.variant, 1.15);
      this.art('eye', x, -43 - p.bob, 32, 37);
    }
  }

  draw(
    cue: EncoreSource,
    time: number,
    gentle: boolean,
    reduced: boolean,
    density: number,
    left: number,
    right: number,
  ) {
    const p = encorePose(cue, time, reduced, { left, right });
    if (!p || p.x + 220 < left || p.x - 220 > right) return;
    this.kit.gentle = gentle;
    this.kit.reduced = reduced;
    this.density = density;
    this.opacity = p.alpha;
    this.g.alpha = p.alpha;
    this.behind.alpha = p.alpha;
    this.kit.red = gentle ? 0xa477d7 : 0xc51c49;
    this.g.ellipse(p.x + 15, -1, 99, 6).fill({ color: INK, alpha: 0.15 });
    switch (cue.world) {
      case 'farm':
        this.farm(p);
        break;
      case 'candy':
        this.candy(p);
        break;
      case 'carnival':
        this.carnival(p);
        break;
      case 'office':
        office(this.kit, p);
        break;
      case 'moon':
        moon(this.kit, p);
        break;
      case 'afterlife':
        afterlife(this.kit, p);
        break;
    }
  }

  reset() {
    this.g.clear();
    this.behind.clear();
  }
}
