import { Graphics, type Sprite } from 'pixi.js';
import { GROUND_Y, artFoot } from '../geometry';
import type { CarnageCue } from '../escalation';
import { spectatorPose, easeSideshow as ease } from './spectator-motion';

export type Illustration = (
  key: string,
  x: number,
  y: number,
  w: number,
  h?: number,
  angle?: number,
  alpha?: number,
  tint?: number,
) => Sprite | undefined;
type Pose = NonNullable<ReturnType<typeof spectatorPose>>;
const INK = 0x502638,
  CREAM = 0xffedbf,
  MINT = 0xa7e9d7;

/** Six tiny silent cartoons share the parent's fixed sprite pool and canvas
 * drawing layer. Every call reconstructs one absolute recorded pose. */
export class SpectatorShow {
  private red = 0xbd1742;
  private reduced = false;
  private gentle = false;
  private opacity = 1;
  constructor(
    private g: Graphics,
    private illustrate: Illustration,
  ) {}

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
    const p = this.illustrate(
      key,
      x,
      y,
      w,
      h,
      angle,
      alpha * this.opacity,
      tint,
    );
    if (p) p.label = `sideshow-${key}`;
    return p;
  }
  private stand(
    key: string,
    x: number,
    w: number,
    h: number,
    angle = 0,
    lift = 0,
  ) {
    const p = this.art(key, x, 0, w, h, angle);
    if (p) p.y = GROUND_Y - artFoot(key, p.width, p.height, angle) - lift;
    return p;
  }
  private local(x: number, y: number, angle = 0) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return this.g.save().setTransform(c, s, -s, c, x, y);
  }
  private cord(x: number, y: number, xx: number, yy: number, bulge = 24) {
    const path = () =>
      this.g
        .moveTo(x, y)
        .bezierCurveTo(x + bulge, y + 25, xx - bulge, yy + 25, xx, yy);
    path().stroke({ color: INK, width: 7, alpha: this.opacity });
    path().stroke({ color: this.red, width: 4, alpha: this.opacity });
  }
  private bits(x: number, y: number, t: number, count = 9, spread = 95) {
    if (this.reduced || t < 0 || t > 1.7) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.4,
        xx = x + Math.cos(a) * spread * t,
        yy = Math.min(-9, y - (80 + i * 5) * t + 90 * t * t);
      this.art(
        i % 3 === 0 ? 'bone' : i % 3 === 1 ? 'eye' : 'heart',
        xx,
        yy,
        18,
        22,
        a + t * 5,
        Math.min(1, (1.7 - t) * 3),
      );
      if (!this.reduced)
        this.g
          .ellipse(xx + 8, yy + 9, 4, 7)
          .fill({ color: this.red, alpha: this.opacity });
    }
  }
  private flash(x: number, y: number, power: number) {
    if (this.reduced || power <= 0) return;
    this.g
      .star(x, y, 9, 32 + power * 18, 12, 0.2)
      .fill({ color: CREAM, alpha: power * 0.8 * this.opacity });
  }

  private camera(p: Pose) {
    const { x, age: t, contact: k, punch, windup } = p;
    const cameraY = -83;
    const goose = this.stand(
      'goose',
      x - 42,
      63,
      87,
      -windup * 0.12 + k * 0.22,
      p.bob,
    );
    this.art('bone', x + 9, -31, 66, 16, -0.95);
    this.art('bone', x + 29, -31, 66, 16, 0.95);
    this.art(
      'camera',
      x + 19,
      cameraY,
      82,
      82,
      this.reduced ? 0 : Math.sin(t * 19) * p.shock * 0.08,
    );
    this.flash(x + 9, -118, p.shock);
    if (k > 0) {
      const eyeX = x + 39 + k * 63 - punch * 88,
        eyeY = -78 - Math.sin(k * Math.PI) * 58 + punch * 47;
      this.cord(x + 31, -78, eyeX, eyeY);
      this.art('eye', eyeX, eyeY, 30 + punch * 18, 34 + punch * 20, k * 5);
      if (goose && punch > 0) {
        goose.rotation += punch * 1.25;
        goose.y = -artFoot('goose', goose.width, goose.height, goose.rotation);
      }
    }
    if (t > 2.3) {
      const out = ease((t - 2.3) / 0.65),
        angle = -0.12 + punch * 0.7,
        support =
          Math.abs(Math.sin(angle)) * 21 + Math.abs(Math.cos(angle)) * 28,
        paperY = -64 + out * (64 - support);
      // The picture belongs behind the drawn frame, so leave the actual image
      // window transparent instead of painting over its sprite.
      this.local(x + 24, paperY, angle)
        .rect(-21, -26, 42, 4)
        .rect(-21, 10, 42, 18)
        .rect(-21, -22, 4, 32)
        .rect(17, -22, 4, 32)
        .fill(CREAM)
        .roundRect(-21, -26, 42, 54, 3)
        .stroke({ color: INK, width: 2.5 })
        .restore();
      this.art(
        p.variant ? 'skeletal-torso' : 'offended-head',
        x + 24 + Math.sin(angle) * 6,
        paperY - Math.cos(angle) * 6,
        29,
        29,
        angle,
      );
      if (punch > 0.5) this.art('helmet', x - 34, -22, 29, 23, punch * 2);
    }
  }
  private candy(p: Pose) {
    const { x, age: t, contact: k, punch } = p;
    const goose = this.stand('goose', x - 33, 60, 84, -0.14 * k, p.bob);
    const donut = this.art(
      'donut',
      x + 28,
      -54,
      60 + 46 * k,
      60 + 46 * k,
      -0.2 + k * 0.25,
    );
    if (donut && punch > 0) donut.scale.y *= 1 - punch * 0.2;
    this.art(
      'heart',
      x + 20 - k * 16,
      -82 - k * 10,
      25,
      31,
      this.reduced ? 0 : t * 0.1,
    );
    this.g
      .moveTo(x + 20, -72)
      .lineTo(x + 20, -41)
      .stroke({ color: CREAM, width: 5 });
    if (k > 0) {
      this.cord(x - 19, -42, x + 14, -49, -18);
      if (goose) {
        goose.x += k * 28;
        goose.scale.x *= 1 - k * 0.38;
        goose.scale.y *= 1 - k * 0.42;
        goose.y = -artFoot('goose', goose.width, goose.height, goose.rotation);
      }
      this.bits(x + 20, -62, t - 1.5, 8, 65);
    }
    if (punch > 0) {
      const legs = this.art('straightLeg', x + 11, -17, 18, 39, punch * 0.22);
      if (legs) legs.y = -18 - p.bob;
      this.art('straightLeg', x + 46, -17 - p.bob, 18, 39, -punch * 0.25);
      this.art('eye', x + 16, -65, 18, 20, -0.2);
      this.art('eye', x + 48, -65, 18, 20, 0.2);
      this.bits(x + 32, -83, t - 4.15, 6, 85);
      this.art('crown', x + 32, -100 + 12 * punch, 31, 27, -0.1);
    }
  }
  private popcorn(p: Pose) {
    const { x, age: t, contact: k, punch } = p;
    const escape = punch * (this.reduced ? 20 : 72),
      bucketX = x + 20 + escape;
    const goose = this.stand(
      'goose',
      x - 35 + punch * 25,
      62,
      86,
      -p.windup * 0.25 + k * 0.4,
      p.bob,
    );
    this.art(
      this.gentle ? 'pastry' : 'popcorn',
      bucketX,
      -42 - p.bob,
      80,
      80,
      this.reduced ? 0 : Math.sin(t * 11) * k * 0.04,
    );
    if (k > 0) {
      this.cord(x - 20, -47, bucketX - 20, -55, -14);
      this.bits(bucketX, -77, t - 1.45, 12, 105);
    }
    if (punch > 0) {
      for (const side of [-1, 1]) {
        const leg = this.art(
          'skeletal-front-leg-straight',
          bucketX + side * 17,
          -19,
          18,
          39,
          this.reduced ? side * 0.1 : side * Math.sin(t * 11) * 0.35,
        );
        if (leg)
          leg.y = -artFoot(
            'skeletal-front-leg-straight',
            leg.width,
            leg.height,
            leg.rotation,
          );
      }
      this.art('brain', bucketX, -91 - p.bob, 29, 24, 0.1);
      this.cord(bucketX, -79 - p.bob, bucketX, -66 - p.bob, 5);
      if (goose) {
        goose.rotation = punch * 1.4;
        goose.y = -artFoot('goose', goose.width, goose.height, goose.rotation);
      }
      this.art(
        p.variant ? 'party-cone' : 'helmet',
        x - 19,
        -15,
        31,
        28,
        punch * 1.9,
      );
    }
  }
  private office(p: Pose) {
    const { x, age: t, contact: k, punch } = p;
    const copy = this.art(
      'copier',
      x + 18,
      -51,
      117,
      102,
      this.reduced ? 0 : Math.sin(t * 21) * p.shock * 0.025,
    );
    if (copy) copy.y = -copy.height * 0.49;
    const goose = this.stand(
      'goose',
      x - 51,
      56,
      78,
      -p.windup * 0.15 + k * 0.3,
      p.bob,
    );
    // Scanner sweeps under the operator, followed by increasingly bad copies.
    if (t > 0.5 && t < 2.2)
      this.g
        .moveTo(x - 18, -77)
        .lineTo(x + 48, -77)
        .stroke({ color: MINT, width: 5, alpha: 0.75 * this.opacity });
    if (k > 0) {
      for (let i = 0; i < 5; i++) {
        const out = ease((t - 1.45 - i * 0.18) / 0.7),
          xx = x + 31 + out * (38 + i * 10),
          angle = out * (0.1 + i * 0.06),
          support = Math.abs(Math.sin(angle)) * 17 + Math.cos(angle) * 12,
          yy = -31 + out * (31 - support - i * 1.5);
        const paper = this.local(xx, yy, angle)
          .rect(-17, -12, 34, 24)
          .fill(CREAM)
          .stroke({ color: INK, width: 1.3 });
        if (i % 2) {
          paper
            .moveTo(-8, 0)
            .lineTo(9, 0)
            .stroke({ color: 0x347887, width: 2 });
          for (let rib = 0; rib < 4; rib++)
            paper
              .ellipse(-6 + rib * 4, 0, 2.5, 6)
              .stroke({ color: 0x347887, width: 1.5 });
        } else
          paper
            .ellipse(0, 0, 9, 7)
            .fill(0x85c9c0)
            .circle(2, 0, 4)
            .fill(INK)
            .circle(0, -2, 1.6)
            .fill(0xffffff);
        paper.restore();
      }
      this.cord(x - 38, -47, x + 5, -49, -20);
      if (goose) {
        goose.x += punch * 47;
        goose.scale.x *= 1 - punch * 0.7;
        goose.scale.y *= 1 - punch * 0.5;
        goose.y = -artFoot('goose', goose.width, goose.height, goose.rotation);
      }
    }
    if (punch > 0) {
      this.bits(x + 18, -43, t - 3.85, 10, 88);
      this.art('wing-left', x + 5, -54, 32, 48, punch * 3);
      this.art('officeGoose', x + 90, -30, 41, 54, punch * 0.12);
      this.art(
        'bone',
        x + 91,
        -9,
        31,
        12,
        this.reduced ? 0 : Math.sin(t * 8) * 0.1,
      );
    }
  }
  private moon(p: Pose) {
    const { x, age: t, contact: k, punch } = p;
    const sheep = this.stand(
      'sheep',
      x,
      94,
      78,
      this.reduced ? 0 : Math.sin(t * 3) * 0.025,
      p.bob,
    );
    const domeY = -67 - k * 49 + punch * 13;
    this.art(
      'astronaut-helmet',
      x + 17,
      domeY,
      91,
      96,
      k * 0.3 - punch * 0.5,
      0.86,
    );
    if (k > 0) {
      this.cord(x + 15, -47, x + 17, domeY + 23);
      this.art('heart', x + 18, domeY + 4, 31, 38, this.reduced ? 0 : t * 0.18);
      for (let i = 0; i < 7; i++) {
        const a = t * (this.reduced ? 0 : 1.6) + i * 2.4;
        this.g
          .circle(
            x + 17 + Math.cos(a) * (15 + i * 2),
            domeY + Math.sin(a) * (18 + i * 2),
            4 + (i % 3),
          )
          .fill({ color: this.red, alpha: 0.8 * this.opacity });
      }
      if (sheep) {
        sheep.scale.y *= 1 - k * 0.25;
        sheep.y = -artFoot('sheep', sheep.width, sheep.height, sheep.rotation);
      }
    }
    if (punch > 0) {
      for (let i = 0; i < 3; i++) {
        const a = (this.reduced ? 0 : t * 2) + (i * Math.PI * 2) / 3;
        this.art(
          'bone',
          x + 17 + Math.cos(a) * 69,
          domeY + Math.sin(a) * 22,
          34,
          13,
          a,
        );
      }
      this.art('ufo', x + 96, -111, 64, 46, -0.2);
      this.art(
        'eye',
        x + 17 + punch * 57,
        domeY - punch * 12,
        24,
        28,
        punch * 4,
      );
      this.g
        .ellipse(x + 17, domeY, 71, 24)
        .stroke({ color: MINT, width: 2, alpha: 0.5 * this.opacity });
    }
  }
  private afterlife(p: Pose) {
    const { x, age: t, contact: k, punch } = p;
    const ghostY = -63 - k * 42;
    this.art('ghost', x - 31, ghostY, 74, 92, -0.15 + k * 0.3, 0.8);
    this.art('skeletal-torso', x + 32, -38, 83, 63, 0.1);
    this.art('swimring', x + 30, -44 - k * 24, 99, 58, k * 0.2);
    this.cord(x - 21, ghostY + 16, x + 22, -43 - k * 24, -12);
    if (k > 0) {
      const souls = this.reduced ? 1 : 3;
      for (let i = 0; i < souls; i++)
        this.art(
          'ghost-head',
          x + 28 + (i - 1) * 24,
          -50 - k * (40 + i * 17) + punch * 50,
          34 - i * 5,
          38 - i * 5,
          (i - 1) * 0.2,
          0.7,
        );
    }
    if (punch > 0) {
      this.art('grave', x + 97, -28, 46, 57, -0.15);
      this.g
        .moveTo(x + 94, -54)
        .quadraticCurveTo(x + 92, -124, x + 42, -118)
        .quadraticCurveTo(x + 17, -116, x + 25, -97)
        .stroke({ color: CREAM, width: 5, alpha: this.opacity });
      this.art('reaper', x + 99, -74, 36, 59, -0.2);
      this.art('swimring', x - 29, ghostY + 10, 67, 40, punch * 1.4);
      this.bits(x + 32, -50, t - 3.95, 7, 65);
    }
  }

  draw(cue: CarnageCue, time: number, gentle: boolean, reduced: boolean) {
    const p = spectatorPose(cue, time, reduced);
    if (!p) return;
    this.g.alpha = p.alpha;
    this.gentle = gentle;
    this.reduced = reduced;
    this.red = gentle ? 0xa472e5 : 0xbd1742;
    this.opacity = p.alpha;
    // The existing three reactions remain in CarnageEffects.spectators.
    switch (cue.world) {
      case 'farm':
        this.camera(p);
        break;
      case 'candy':
        this.candy(p);
        break;
      case 'carnival':
        this.popcorn(p);
        break;
      case 'office':
        this.office(p);
        break;
      case 'moon':
        this.moon(p);
        break;
      case 'afterlife':
        this.afterlife(p);
        break;
    }
  }
}
