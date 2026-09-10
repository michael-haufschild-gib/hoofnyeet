import { Graphics } from 'pixi.js';
import type { BodyPose } from '../../crash';
import { type CarnageCue, noise } from '../../catalogue/escalation';
import { artFoot, GROUND_Y } from '../../art/geometry';
import type { Illustration } from './spectator-show';
import {
  bossBirth,
  bossEmission,
  bossShow,
  bossSocket,
  bossEase as ease,
} from '../motion/boss-motion';
import {
  afterlife,
  moon,
  office,
  type BossKit,
  type Organ,
  type Pose,
  type Ribbon,
} from './boss-scenes';

type Mouth = (
  x: number,
  y: number,
  w: number,
  h: number,
  t: number,
  open?: number,
  angle?: number,
) => void;
const INK = 0x502638,
  CREAM = 0xffedbf;

/** The existing six boss signatures, attached to their single recorded defeat
 * cue. Machinery keeps moving; released props keep their own release point. */
export class BossShow {
  private opacity = 1;
  private readonly kit: BossKit;
  constructor(
    private g: Graphics,
    private illustrate: Illustration,
    private mouth: Mouth,
    private organ: Organ,
    private ribbon: Ribbon,
  ) {
    this.kit = {
      red: 0xbd1742,
      reduced: false,
      gentle: false,
      organ: this.organ,
      ribbon: this.ribbon,
      art: this.art.bind(this),
      stand: this.stand.bind(this),
      foregroundArt: this.foregroundArt.bind(this),
      local: this.local.bind(this),
      flash: this.flash.bind(this),
      bits: this.bits.bind(this),
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
    if (this.kit.reduced || age < 0 || age > 0.22) return;
    this.g
      .star(x, y, 9, 18 + age * 120, 8 + age * 30, 0.3)
      .fill({ color: CREAM, alpha: (1 - age / 0.22) * 0.9 });
  }
  private bits(x: number, y: number, age: number, seed: number, count = 9) {
    if (this.kit.reduced || age < 0 || age > 1.45) return;
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
  /** Four parcels leave the machine a quarter second apart, each still trailing
   * the ribbon that fed it and stamped with its own seal. */
  private farmPackages(
    c: CarnageCue,
    b: BodyPose,
    t: number,
    inlet: Pose['socket'],
  ) {
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
        this.kit.reduced ? 0 : age * 2 * (1 - ease((age - 0.7) / 0.5)),
      );
      if (pack) pack.label = `boss-farm-package-${i}`;
      this.ribbon(inlet.x, inlet.y, x, y, age, 7);
      this.g.circle(x, y, 13).stroke({ color: this.kit.red, width: 3 });
    }
  }
  /** The packaging is still attached: the machine gift-wraps itself. Three
   * strands cross its body and the bow opens from 3.3s. */
  private farmWrap(b: BodyPose, t: number, wrap: number) {
    const g = this.local(b.x, b.y, b.angle);
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
      strand().stroke({ color: this.kit.red, width: 5 });
    }
    const bow = ease((t - 3.3) / 0.5);
    for (const side of [-1, 1]) {
      const loop = () => g.ellipse(side * 17 * bow, 0, 20 * bow, 11 * bow);
      loop().stroke({ color: INK, width: 8 });
      loop().stroke({ color: this.kit.red, width: 5 });
    }
    g.circle(0, 0, 6 * bow).fill(CREAM);
    g.restore();
  }
  /** The machine's own offended face, plus the shipping label and eye that get
   * stuck to its flank once the wrapping is done. */
  private farmTag(b: BodyPose, t: number, punch: number) {
    const face = bossSocket(b, 0.32, 0.35);
    this.art(
      'offended-head',
      face.x,
      face.y + (1 - punch) * 24,
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
  private farm(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age;
    this.farmPackages(c, b, t, p.socket);
    if (t < 2.4) return;
    this.farmWrap(b, t, p.reverse);
    if (t > 3.8) this.farmTag(b, t, p.punch);
  }
  /** Preserve all four nested jaws, now rooted inside the painted mouth. */
  private candyJaws(b: BodyPose, t: number, source: Pose['socket']) {
    for (let i = 0; i < 4; i++)
      this.mouth(
        source.x + (this.kit.reduced ? 0 : Math.sin(t * 3 + i) * 13),
        source.y + i * 7,
        135 - i * 27,
        128 - i * 24,
        t + i,
        0.8 + (this.kit.reduced ? 0 : Math.sin(t * 7 + i) * 0.18),
        b.angle,
      );
  }
  /** The visiting fairy, shrinking as `bite` closes on it. */
  private candyFairy(
    fairyX: number,
    fairyY: number,
    side: number,
    bite: number,
    t: number,
  ) {
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
        wing * (0.5 + (this.kit.reduced ? 0 : Math.sin(t * 20) * 0.35)),
      );
    this.art('tooth', fairyX - side * 14, fairyY + 23, 21, 25);
  }
  /** What the jaws spit back out, on a ballistic arc from the mouth. */
  private candyExit(source: Pose['socket'], side: number, age: number) {
    this.art(
      'goose',
      source.x + side * (35 + age * 62),
      Math.min(-19, source.y - 90 * age + 65 * age * age),
      25,
      34,
      this.kit.reduced ? 0 : side * age * 4,
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
  private candy(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age,
      source = p.socket;
    this.candyJaws(b, t, source);
    if (t < 2.4) return;
    const visit = ease((t - 2.4) / 0.85),
      bite = ease((t - 3.8) / 0.14);
    const side = p.variation;
    const fairyX = source.x + side * (145 * (1 - visit) + 32 * (1 - bite));
    const fairyY = source.y - 18 - Math.sin(visit * Math.PI) * 40;
    if (t < 3.98) this.candyFairy(fairyX, fairyY, side, bite, t);
    this.flash(source.x, source.y + 10, t - 3.8);
    this.bits(source.x, source.y, t - 3.8, c.seed, 12);
    if (t >= 4.05) this.candyExit(source, side, t - 4.05);
  }
  /** One member of the skeleton band. Index 0 gets a torso, 1 a drum and 2 a
   * second bone; from 2.4s each also drops the piano it was standing under. */
  private carnivalPlayer(c: CarnageCue, b: BodyPose, t: number, i: number) {
    const xx = c.x - 100 + i * 100;
    const performer = this.stand(
      'skeleton',
      xx,
      66,
      103,
      this.kit.reduced ? 0 : Math.sin(t * 9 + i) * 0.1,
    );
    const shoulderY = performer ? performer.y - 9 : -65;
    this.art(
      'bone',
      xx + 28,
      shoulderY,
      40,
      13,
      this.kit.reduced ? 0.2 : Math.sin(t * 10 + i) * 0.9,
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
  /** The piano that lands on the conductor from 3.4s, and the leg still
   * twitching out of it afterwards. */
  private carnivalFinale(c: CarnageCue, b: BodyPose, t: number) {
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
        this.kit.reduced ? -0.6 : -0.6 + Math.sin((t - 4.25) * 13) * 0.35,
      );
  }
  private carnival(c: CarnageCue, b: BodyPose, p: Pose) {
    const t = p.age;
    for (let i = 0; i < 3; i++) this.carnivalPlayer(c, b, t, i);
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
        b.angle + side * (0.4 + (this.kit.reduced ? 0 : Math.sin(t * 8) * 0.7)),
      );
    if (t > 3.4) this.carnivalFinale(c, b, t);
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
    this.kit.gentle = gentle;
    this.kit.reduced = reduced;
    this.kit.red = gentle ? 0xa472e5 : 0xbd1742;
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
        office(this.kit, cue, body, p);
        break;
      case 'moon':
        moon(this.kit, cue, body, p);
        break;
      case 'afterlife':
        afterlife(this.kit, cue, body, p);
        break;
    }
  }
}
