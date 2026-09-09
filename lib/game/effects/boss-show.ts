import { Graphics } from 'pixi.js';
import type { BodyPose } from '../crash';
import { type CarnageCue, noise } from '../escalation';
import { artFoot, GROUND_Y } from '../geometry';
import type { Illustration } from './spectator-show';
import {
  bossBirth,
  bossEmission,
  bossShow,
  bossSocket,
  bossEase as ease,
} from './boss-motion';

type Mouth = (
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  open?: number,
  angle?: number,
) => void;
type Organ = (
  x: number,
  y: number,
  size: number,
  t: number,
  angle?: number,
) => void;
type Ribbon = (
  x: number,
  y: number,
  xx: number,
  yy: number,
  t: number,
  width?: number,
  color?: number,
  sag?: number,
) => void;
type Pose = NonNullable<ReturnType<typeof bossShow>>;
const INK = 0x502638,
  CREAM = 0xffedbf,
  MINT = 0xa7efda;

/** The existing six boss signatures, attached to their single recorded defeat
 * cue. Machinery keeps moving; released props keep their own release point. */
export class BossShow {
  private reduced = false;
  private gentle = false;
  private red = 0xbd1742;
  private opacity = 1;
  constructor(
    private g: Graphics,
    private illustrate: Illustration,
    private mouth: Mouth,
    private organ: Organ,
    private ribbon: Ribbon,
  ) {}

  private art(
    key: string,
    x: number,
    y: number,
    w: number,
    h = w,
    angle = 0,
    alpha = 1,
  ) {
    const p = this.illustrate(key, x, y, w, h, angle, alpha * this.opacity);
    if (p) p.label = `boss-show-${key}`;
    return p;
  }
  private stand(key: string, x: number, w: number, h = w, angle = 0, lift = 0) {
    const p = this.art(key, x, 0, w, h, angle);
    if (p) p.y = GROUND_Y - artFoot(key, p.width, p.height, angle) - lift;
    return p;
  }
  private foregroundArt(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    angle = 0,
  ) {
    const p = this.art(key, x, y, w, h, angle);
    if (!p) return;
    this.local(x, y, angle)
      .setFillStyle({ color: 0xffffff, alpha: this.opacity })
      .texture(
        p.texture,
        0xffffff,
        -p.width / 2,
        -p.height / 2,
        p.width,
        p.height,
      )
      .restore();
    p.visible = false;
  }
  private local(x: number, y: number, angle = 0) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return this.g.save().setTransform(c, s, -s, c, x, y);
  }
  private flash(x: number, y: number, age: number) {
    if (this.reduced || age < 0 || age > 0.22) return;
    this.g
      .star(x, y, 9, 18 + age * 120, 8 + age * 30, 0.3)
      .fill({ color: CREAM, alpha: (1 - age / 0.22) * 0.9 });
  }
  private bits(x: number, y: number, age: number, seed: number, count = 9) {
    if (this.reduced || age < 0 || age > 1.45) return;
    for (let i = 0; i < count; i++) {
      const a = i * 2.4 + noise(seed, i) * 0.4;
      this.art(
        i % 3 === 0 ? 'tooth' : i % 3 === 1 ? 'eye' : 'bone',
        x + Math.cos(a) * age * 115,
        Math.min(-10, y - (70 + i * 6) * age + 100 * age * age),
        17,
        21,
        age * 5 + a,
        Math.min(1, (1.45 - age) * 3),
      );
    }
  }
  private farm(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age,
      inlet = p.socket;
    for (let i = 0; i < 4; i++) {
      const age = bossBirth(t, i, 0.25);
      if (age === null) continue;
      const source = bossEmission(c, b, i * 0.25);
      const x = source.x - age * 65;
      const y = Math.min(GROUND_Y - 18, source.y - 28 * age + age * age * 35);
      const pack = this.art(
        'sausage',
        x,
        y,
        66,
        48,
        this.reduced ? 0 : age * 2 * (1 - ease((age - 0.7) / 0.5)),
      );
      if (pack) pack.label = `boss-farm-package-${i}`;
      this.ribbon(inlet.x, inlet.y, x, y, age, 7);
      this.g.circle(x, y, 13).stroke({ color: this.red, width: 3 });
    }
    if (t < 2.4) return;
    // The packaging is still attached: the machine gift-wraps itself.
    const g = this.local(b.x, b.y, b.angle),
      wrap = p.reverse;
    for (let i = 0; i < 3; i++) {
      const yy = (i - 1) * b.h * 0.2;
      const strand = () =>
        g
          .moveTo(-b.w * 0.46, yy - 10)
          .bezierCurveTo(
            -b.w * 0.2,
            yy + 20,
            b.w * 0.2,
            yy - 20,
            b.w * 0.46 * wrap,
            yy + 7,
          );
      strand().stroke({ color: INK, width: 8 });
      strand().stroke({ color: this.red, width: 5 });
    }
    const bow = ease((t - 3.3) / 0.5);
    for (const side of [-1, 1]) {
      const loop = () => g.ellipse(side * 17 * bow, 0, 20 * bow, 11 * bow);
      loop().stroke({ color: INK, width: 8 });
      loop().stroke({ color: this.red, width: 5 });
    }
    g.circle(0, 0, 6 * bow).fill(CREAM);
    g.restore();
    if (t > 3.8) {
      const face = bossSocket(b, 0.32, 0.35);
      this.art(
        'offended-head',
        face.x,
        face.y + (1 - p.punch) * 24,
        48,
        57,
        b.angle,
      );
      const tag = this.local(b.x + b.w * 0.38, b.y - 5, b.angle + 0.22);
      tag
        .roundRect(-14, -16, 28, 32, 4)
        .fill(CREAM)
        .stroke({ color: INK, width: 2 });
      tag.circle(0, -10, 2).fill(INK);
      tag.restore();
      this.foregroundArt('eye', b.x + b.w * 0.38, b.y + 1, 15, 17, b.angle);
      this.flash(face.x, face.y, t - 3.8);
    }
  }
  private candy(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age,
      source = p.socket;
    // Preserve all four nested jaws, now rooted inside the painted mouth.
    for (let i = 0; i < 4; i++)
      this.mouth(
        source.x + (this.reduced ? 0 : Math.sin(t * 3 + i) * 13),
        source.y + i * 7,
        135 - i * 27,
        128 - i * 24,
        t + i,
        0.8 + (this.reduced ? 0 : Math.sin(t * 7 + i) * 0.18),
        b.angle,
      );
    if (t < 2.4) return;
    const visit = ease((t - 2.4) / 0.85),
      bite = ease((t - 3.8) / 0.14);
    const side = p.variation;
    const fairyX = source.x + side * (145 * (1 - visit) + 32 * (1 - bite));
    const fairyY = source.y - 18 - Math.sin(visit * Math.PI) * 40;
    if (t < 3.98) {
      this.art(
        'goose',
        fairyX,
        fairyY,
        40 * (1 - bite * 0.8),
        54 * (1 - bite * 0.8),
        side * 0.2 + bite * side,
      );
      for (const wing of [-1, 1])
        this.art(
          'wing-left',
          fairyX + wing * 20,
          fairyY + 3,
          22,
          26,
          wing * (0.5 + (this.reduced ? 0 : Math.sin(t * 20) * 0.35)),
        );
      this.art('tooth', fairyX - side * 14, fairyY + 23, 21, 25);
    }
    this.flash(source.x, source.y + 10, t - 3.8);
    this.bits(source.x, source.y, t - 3.8, c.seed, 12);
    if (t >= 4.05) {
      const age = t - 4.05;
      this.art(
        'goose',
        source.x + side * (35 + age * 62),
        Math.min(-19, source.y - 90 * age + 65 * age * age),
        25,
        34,
        this.reduced ? 0 : side * age * 4,
      );
      this.art(
        'bone',
        source.x + side * (35 + age * 62),
        Math.min(-19, source.y - 90 * age + 65 * age * age) + 3,
        28,
        9,
        0,
      );
    }
  }
  private carnival(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age;
    for (let i = 0; i < 3; i++) {
      const xx = c.x - 100 + i * 100;
      const performer = this.stand(
        'skeleton',
        xx,
        66,
        103,
        this.reduced ? 0 : Math.sin(t * 9 + i) * 0.1,
      );
      const shoulderY = performer ? performer.y - 9 : -65;
      this.art(
        'bone',
        xx + 28,
        shoulderY,
        40,
        13,
        this.reduced ? 0.2 : Math.sin(t * 10 + i) * 0.9,
      );
      if (i === 0)
        this.art('skeletal-torso', xx + 30, shoulderY + 9, 34, 39, 0.3);
      if (i === 1) this.art('drum', xx + 27, -22, 43, 44);
      if (i === 2) this.art('bone', xx + 22, shoulderY - 10, 54, 14, -0.18);
      if (t > 2.4) {
        const release = bossEmission(c, b, 2.4);
        const h = 86,
          foot = artFoot('piano', 85, h, 0.1);
        const yy = Math.min(
          GROUND_Y - foot,
          release.y - 190 + (t - 2.4) ** 2 * 130,
        );
        this.art('piano', xx, yy, 85, h, 0.1);
      }
    }
    // The conductor is the keyboard's own skull; the encore lands on it.
    const face = bossSocket(b, 0.5, 0.22);
    this.art('ghost-head', face.x, face.y, 46, 52, b.angle, 0.9);
    for (const side of [-1, 1])
      this.art(
        'bone',
        face.x + side * 34,
        face.y + 15,
        40,
        12,
        b.angle + side * (0.4 + (this.reduced ? 0 : Math.sin(t * 8) * 0.7)),
      );
    if (t > 3.4) {
      const fall = ease((t - 3.4) / 0.65);
      const top = bossSocket(b, 0.5, 0.08);
      this.art(
        'piano',
        top.x,
        top.y - 135 * (1 - fall) - 25,
        86,
        80,
        Math.PI / 2,
      );
      this.flash(top.x, top.y, t - 4.05);
      this.bits(top.x, top.y, t - 4.05, c.seed);
      if (t > 4.25)
        this.art(
          'straightLeg',
          top.x + 49,
          top.y - 8,
          18,
          40,
          this.reduced ? -0.6 : -0.6 + Math.sin((t - 4.25) * 13) * 0.35,
        );
    }
  }
  private office(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age,
      tableY = GROUND_Y - 27;
    for (let i = 0; i < 5; i++) {
      const xx = c.x - 110 + i * 45;
      const arrival = bossBirth(t, i, 0.24);
      if (arrival === null) continue;
      const entry = ease(arrival / 0.2);
      this.organ(xx, tableY + (1 - entry) * 12, 26, t + i);
      const card = this.local(xx, tableY - 25, (1 - entry) * -0.25);
      card
        .roundRect(-15, -9, 30, 18, 2)
        .fill(CREAM)
        .stroke({ color: this.red, width: 2 });
      if (arrival > 0.17) {
        card.circle(4, 0, 5).stroke({ color: 0x41877d, width: 1.5 });
        card
          .moveTo(1, 0)
          .lineTo(3, 3)
          .lineTo(8, -3)
          .stroke({ color: 0x41877d, width: 2 });
      }
      card.restore();
      this.foregroundArt(i % 2 ? 'heart' : 'brain', xx, tableY + 4, 26, 27);
    }
    if (t < 1.5) {
      const index = Math.min(4, Math.floor(t / 0.24));
      const phase = t / 0.24 - index;
      const stampX = c.x - 110 + index * 45;
      const stampY =
        tableY - 25 - (1 - Math.sin(Math.min(1, phase) * Math.PI)) * 32;
      this.ribbon(
        p.socket.x,
        p.socket.y,
        stampX,
        stampY - 12,
        t,
        8,
        this.gentle ? MINT : 0xf2ae8b,
        0,
      );
      const g = this.local(stampX, stampY);
      g.roundRect(-8, -23, 16, 18, 4)
        .fill(0x9b6141)
        .stroke({ color: INK, width: 2 });
      g.roundRect(-20, -7, 40, 10, 3)
        .fill(this.red)
        .stroke({ color: INK, width: 3 });
      g.restore();
    }
    const copierX = c.x + 135 + (1 - ease(t / 0.8)) * 900;
    const copier = this.stand('copier', copierX, 79, 84);
    if (copier) copier.y = GROUND_Y - copier.height / 2;
    for (let i = 0; i < 5; i++) {
      const start = bossSocket(b, 0.5, 0.19);
      const progress = ease((t - 2.4 - i * 0.14) / 0.85);
      const xx = start.x + (copierX - start.x) * progress;
      const yy =
        start.y +
        (-44 - start.y) * progress -
        Math.sin(progress * Math.PI) * 32;
      if (progress < 1)
        this.art('wing-left', xx, yy, 25, 40, this.reduced ? 0 : t + i);
    }
    if (t > 3.1) {
      for (let i = 0; i < 7; i++) {
        const age = t - 3.1 - i * 0.11;
        if (age < 0) continue;
        const x = copierX + 15 + age * 24,
          y = Math.min(-9, -49 - 37 * age + 31 * age * age);
        const paper = this.local(x, y, this.reduced ? 0.2 : age * 0.7);
        paper
          .rect(-8, -10, 16, 20)
          .fill(CREAM)
          .stroke({ color: INK, width: 1 });
        paper
          .moveTo(-4, -5)
          .lineTo(3, 5)
          .moveTo(3, -5)
          .lineTo(-4, 5)
          .stroke({ color: this.red, width: 2 });
        paper.restore();
      }
    }
    if (t > 4.15) {
      const rise = ease((t - 4.15) / 0.4);
      this.art(
        'officeGoose',
        copierX,
        -55 - rise * 37,
        43,
        58,
        this.reduced ? 0 : Math.sin(t * 5) * 0.08,
      );
      this.art('bone', copierX + 21, -70 - rise * 33, 31, 12, -0.5);
      this.flash(copierX, -64, t - 4.15);
    }
  }
  private moon(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age,
      nozzle = p.socket;
    for (let i = 0; i < 8; i++) {
      const outward = t > 2.4 ? 1 + (t - 2.4) * 0.8 : 1 - t * 0.25;
      const a = (this.reduced ? 0 : t * 3) + (i * Math.PI) / 4;
      const xx = b.x + Math.cos(a) * 110 * outward;
      const yy = b.y + Math.sin(a) * 70 * outward;
      this.art(i % 2 ? 'bone' : 'eye', xx, yy, 32, 32, this.reduced ? 0 : a);
      this.ribbon(nozzle.x, nozzle.y, xx, yy, t + i, 3, 0xaff3c5, 0);
    }
    // A heart blocks the intake, then the existing reversal ejects the pilot.
    if (t < 2.4) {
      const clog = ease((t - 0.55) / 0.8);
      const pulse = this.reduced ? 0 : Math.sin(t * 18) * clog * 3;
      this.art(
        'heart',
        nozzle.x,
        nozzle.y + 27 * (1 - clog),
        44 + pulse,
        57 + pulse,
        b.angle,
      );
      for (const side of [-1, 1])
        this.art(
          'droplet',
          nozzle.x + side * 27,
          nozzle.y + 12,
          7,
          18,
          side * -0.3,
        );
    }
    if (t >= 2.4) {
      const release = bossEmission(c, b, 2.4),
        age = t - 2.4;
      const pilotX = release.x + p.variation * age * 75;
      const pilotY = Math.min(-27, release.y + 35 - 93 * age + 25 * age * age);
      this.art(
        'ghost-head',
        pilotX,
        pilotY,
        43,
        55,
        this.reduced ? 0 : p.variation * age * 0.7,
      );
      if (age < 1.2)
        this.ribbon(nozzle.x, nozzle.y, pilotX, pilotY, age, 5, MINT, -20);
      else {
        const chute = ease((age - 1.2) / 0.3);
        this.art('brain', pilotX, pilotY - 46 * chute, 63, 46, 0);
        this.ribbon(
          pilotX - 22 * chute,
          pilotY - 36 * chute,
          pilotX,
          pilotY - 8,
          age,
          2,
          CREAM,
          0,
        );
        this.ribbon(
          pilotX + 22 * chute,
          pilotY - 36 * chute,
          pilotX,
          pilotY - 8,
          age,
          2,
          CREAM,
          0,
        );
      }
      this.bits(release.x, release.y, age, c.seed, 12);
      this.flash(nozzle.x, nozzle.y, age);
      if (age > 1.6) this.art('heart', nozzle.x, nozzle.y, 34, 43, b.angle);
    }
  }
  private afterlife(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age,
      patientX = c.x,
      patientY = GROUND_Y - 39;
    const beat = Math.min(3, Math.floor(t / 0.35));
    const pulseAge = t - beat * 0.35;
    const compression =
      t < 1.4 ? Math.sin(Math.min(1, pulseAge / 0.35) * Math.PI) : 0;
    this.art(
      'skeletal-torso',
      patientX,
      patientY + compression * 8,
      112,
      70 - compression * 14,
      0,
    );
    const hand = bossSocket(b, 0.17, 0.48);
    if (t < 1.5) {
      this.ribbon(
        hand.x,
        hand.y,
        patientX,
        patientY - 15 + compression * 12,
        t,
        8,
        CREAM,
        0,
      );
      this.art('bone', patientX, patientY - 14 + compression * 12, 38, 12, 0);
    }
    for (let i = 0; i < 4; i++) {
      const rise = bossBirth(t, i, 0.35);
      if (rise === null) continue;
      const x = patientX + (this.reduced ? 0 : Math.sin(rise * 3) * 25);
      this.art(
        'ghost-head',
        x,
        patientY - rise * 65,
        54 - i * 7,
        67 - i * 7,
        0,
        ease(rise / 0.08) * Math.max(0, 1 - rise / 4),
      );
    }
    if (t > 2.4) {
      const rescue = ease((t - 2.4) / 0.85);
      const ring = bossSocket(b, 0.5, 0.3);
      this.ribbon(
        ring.x + 50,
        ring.y - 90,
        patientX - 50,
        patientY + 20,
        t,
        6,
        CREAM,
        -30,
      );
      this.art('swimring', ring.x, ring.y - (1 - rescue) * 90, 82, 63, b.angle);
      if (t > 3.4) {
        const lift = ease((t - 3.4) / 0.65);
        const hood = bossSocket(b, 0.44, 0.18);
        this.art(
          'reaper',
          hood.x + p.variation * lift * 17,
          hood.y - lift * 62,
          42,
          66,
          b.angle + p.variation * 0.18,
          0.72,
        );
        this.art('ghost-head', hood.x, hood.y + 2, 34, 44, b.angle, 0.9);
        this.flash(hood.x, hood.y, t - 3.4);
        if (t > 4.3)
          this.art(
            'helmet',
            hood.x + p.variation * 12,
            hood.y - 20,
            42,
            33,
            b.angle,
          );
      }
    }
  }
  draw(
    cue: CarnageCue,
    time: number,
    body: BodyPose | undefined,
    gentle: boolean,
    reduced: boolean,
  ) {
    const p = bossShow(cue, time, body);
    if (!p || !body) return;
    this.gentle = gentle;
    this.reduced = reduced;
    this.red = gentle ? 0xa472e5 : 0xbd1742;
    this.opacity = p.alpha;
    switch (cue.world) {
      case 'farm':
        this.farm(cue, body, p);
        break;
      case 'candy':
        this.candy(cue, body, p);
        break;
      case 'carnival':
        this.carnival(cue, body, p);
        break;
      case 'office':
        this.office(cue, body, p);
        break;
      case 'moon':
        this.moon(cue, body, p);
        break;
      case 'afterlife':
        this.afterlife(cue, body, p);
        break;
    }
  }
}
