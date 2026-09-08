import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { GROUND_Y } from '../geometry';
import { noise, type CarnageCue } from '../escalation';
import type { BodyPose } from '../crash';
import type { GameState } from '../simulation';

const INK = 0x502638;
const RED = 0xbd1742;
const PINK = 0xf67687;
const CREAM = 0xffedbf;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** An illustrated, additive layer. Every pose is a pure sample of CrashFrame;
 * no tickers, random calls, collision callbacks or audio live in the renderer. */
export class CarnageEffects {
  readonly behind = new Container({ label: 'carnage-ground-and-tissue' });
  readonly front = new Container({ label: 'carnage-illustrated-scenes' });
  readonly screen = new Graphics({ label: 'brief-lens-splatter' });
  private stains = new Graphics({ label: 'persistent-blood-smears' });
  private tissue = new Graphics({ label: 'elastic-anatomy' });
  private drawings = new Graphics({ label: 'animated-mouths-and-machinery' });
  private actors = new Container({ label: 'carnage-sprite-pool' });
  private pool: Sprite[] = [];
  private used = 0;
  private gentle = false;
  private reduced = false;
  private density = 1;
  private time = 0;
  private left = -Infinity;
  private right = Infinity;
  constructor(private textures: Record<string, Texture>) {
    this.behind.addChild(this.stains, this.tissue);
    this.front.addChild(this.actors, this.drawings);
    for (let i = 0; i < 192; i++) {
      const sprite = new Sprite({ visible: false, anchor: 0.5 });
      this.actors.addChild(sprite);
      this.pool.push(sprite);
    }
  }
  private get red() {
    return this.gentle ? 0xa472e5 : RED;
  }
  private get pink() {
    return this.gentle ? 0xf2b5ff : PINK;
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
    if (
      x + w < this.left ||
      x - w > this.right ||
      this.used === this.pool.length
    )
      return;
    if (this.gentle) {
      if (key === 'skin') key = 'torso';
      if (key === 'sausage') key = 'cube';
      if (
        key.startsWith('skeletal') ||
        ['bone', 'jam', 'eye', 'skeleton'].includes(key)
      )
        key = key.includes('leg') ? 'straightLeg' : 'cheese';
      if (key === 'bouquet') key = 'crown';
    }
    const texture = this.textures[key];
    if (!texture) return;
    const p = this.pool[this.used++];
    p.texture = texture;
    const scale = Math.min(w / texture.width, h / texture.height);
    p.position.set(x, y);
    p.scale.set(scale);
    p.rotation = angle;
    p.alpha = alpha;
    p.tint = tint;
    p.visible = true;
    return p;
  }
  private ribbon(
    x: number,
    y: number,
    xx: number,
    yy: number,
    age: number,
    width = 8,
    color = this.red,
    sag = 36,
  ) {
    y = Math.min(y, GROUND_Y - 2);
    yy = Math.min(yy, GROUND_Y - 2);
    const wave = this.reduced ? 0 : Math.sin(age * 6 + x * 0.02) * 15;
    const path = () =>
      this.tissue
        .moveTo(x, y)
        .bezierCurveTo(
          x + (xx - x) * 0.25,
          Math.min(GROUND_Y - 1, y + sag + wave),
          xx - (xx - x) * 0.2,
          Math.min(GROUND_Y - 1, yy + sag - wave),
          xx,
          yy,
        );
    path().stroke({
      color: INK,
      width: width + 4,
      cap: 'round',
      join: 'round',
    });
    path().stroke({ color, width, cap: 'round', join: 'round' });
    path().stroke({
      color: this.pink,
      width: Math.max(1.5, width * 0.25),
      cap: 'round',
      join: 'round',
      alpha: 0.8,
    });
  }
  private organ(x: number, y: number, size: number, t: number) {
    y = Math.min(y, GROUND_Y - size * 0.58);
    const g = this.drawings,
      pulse = this.reduced ? 1 : 1 + Math.sin(t * 8) * 0.09;
    if (this.gentle) {
      g.poly([
        x - size * 0.6,
        y,
        x - size,
        y - size * 0.3,
        x - size,
        y + size * 0.3,
      ]).fill(0xc4a8f5);
      g.poly([
        x + size * 0.6,
        y,
        x + size,
        y - size * 0.3,
        x + size,
        y + size * 0.3,
      ]).fill(0xc4a8f5);
      g.ellipse(x, y, size * 0.6, size * 0.4)
        .fill(0xf9bee8)
        .stroke({ color: INK, width: 2 });
      g.ellipse(
        x - size * 0.15,
        y - size * 0.12,
        size * 0.22,
        size * 0.08,
      ).fill(CREAM);
      return;
    }
    g.ellipse(x - size * 0.18, y, size * 0.52, size * 0.38 * pulse)
      .ellipse(
        x + size * 0.22,
        y + size * 0.13,
        size * 0.36,
        size * 0.43 * pulse,
      )
      .fill(this.red)
      .stroke({ color: INK, width: 2.5 });
    g.ellipse(x - size * 0.22, y - size * 0.12, size * 0.18, size * 0.06).fill({
      color: 0xffc3bc,
      alpha: 0.8,
    });
    g.moveTo(x, y - size * 0.12)
      .lineTo(x + size * 0.1, y + size * 0.26)
      .moveTo(x + size * 0.02, y)
      .lineTo(x + size * 0.24, y - size * 0.1)
      .stroke({ color: INK, width: 1.8 });
  }
  private mouth(
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    open = 1,
  ) {
    const g = this.drawings,
      height = Math.max(8, h * open);
    g.ellipse(x, y, w / 2 + 5, height / 2 + 5)
      .fill(this.pink)
      .stroke({ color: INK, width: 4 });
    g.ellipse(x, y, w / 2, height / 2).fill(0x451329);
    g.ellipse(
      x + Math.sin(t * 4) * w * 0.06,
      y + height * 0.23,
      w * 0.27,
      height * 0.18,
    ).fill(this.red);
    for (let i = 0; i < 7; i++) {
      const xx = x - w * 0.39 + (i / 6) * w * 0.78;
      const rim = Math.sqrt(Math.max(0, 1 - ((xx - x) / (w * 0.5)) ** 2));
      for (const side of [-1, 1]) {
        const yy = y + side * height * 0.46 * rim;
        g.poly([
          xx - w * 0.055,
          yy,
          xx + w * 0.055,
          yy,
          xx,
          yy - side * Math.min(height * 0.31, w * 0.16),
        ])
          .fill(CREAM)
          .stroke({ color: INK, width: 1.4 });
      }
    }
    if (!this.gentle)
      for (let i = 0; i < 3; i++)
        g.ellipse(
          x + (i - 1) * w * 0.22,
          y + height * 0.43 + 6 + i * 3,
          3.5,
          10 + Math.sin(t * 5 + i) * 3,
        ).fill(this.red);
  }
  private eyes(x: number, y: number, size: number, t: number, angry = false) {
    const g = this.drawings;
    for (const side of [-1, 1]) {
      const xx = x + side * size * 0.67;
      g.ellipse(xx, y, size * 0.57, size * 0.75)
        .fill(CREAM)
        .stroke({ color: INK, width: 2 });
      g.ellipse(
        xx + Math.sin(t * 2.5) * size * 0.18,
        y + 2,
        size * 0.21,
        size * 0.4,
      ).fill(0x18757e);
      g.circle(xx + Math.sin(t * 2.5) * size * 0.18, y + 2, size * 0.1).fill(
        INK,
      );
      g.circle(xx - 1, y - size * 0.22, size * 0.09).fill(0xffffff);
      if (angry)
        g.moveTo(xx - size * 0.55, y - size * (side < 0 ? 0.9 : 0.55))
          .lineTo(xx + size * 0.55, y - size * (side < 0 ? 0.55 : 0.9))
          .stroke({ color: INK, width: 4 });
    }
  }
  private sprays(cue: CarnageCue, age: number, magnet?: BodyPose) {
    if (age < 0) return;
    const count = Math.ceil((this.reduced ? 7 : 23) * this.density * cue.power);
    const moon = cue.world === 'moon';
    const life = moon ? 3.7 : 1.8;
    if (age < life)
      for (let i = 0; i < count; i++) {
        const n = (k: number) => noise(cue.seed, i * 7 + k);
        const a = -Math.PI * n(0),
          speed = (80 + n(1) * 260) * Math.min(1.6, cue.power);
        let x = cue.x + Math.cos(a) * speed * age;
        let y =
          cue.y + Math.sin(a) * speed * age + (moon ? 38 : 205) * age * age;
        const tooth = i % 7 === 0,
          bone = i % 11 === 0;
        if (magnet && (tooth || bone)) {
          const pull = ease(age / life);
          x += (magnet.x - x) * pull;
          y += (magnet.y - y) * pull;
          if (!this.reduced)
            this.tissue
              .moveTo(x, y)
              .lineTo(magnet.x, magnet.y)
              .stroke({ color: 0x72f5e3, width: 1.5, alpha: 0.35 });
        }
        if (y > GROUND_Y - 3) continue;
        const alpha = Math.min(1, (life - age) * 3);
        if (tooth || bone)
          this.art(
            bone ? 'bone' : 'eye',
            x,
            y,
            bone ? 26 : 16,
            bone ? 14 : 18,
            age * (n(2) - 0.5) * 15,
            alpha,
          );
        else {
          const r = 2.5 + n(3) * 6;
          this.drawings
            .ellipse(x, y, r, r * (1.2 + n(4)))
            .fill({ color: i % 3 ? this.red : this.pink, alpha });
          if (i % 3 === 0)
            this.drawings
              .circle(x - r * 0.2, y - r * 0.45, r * 0.27)
              .fill({ color: 0xffc1aa, alpha });
        }
        if (cue.world === 'farm' && i % 4 === 0)
          this.drawings
            .moveTo(x, y)
            .lineTo(x + 12, y - 7)
            .stroke({ color: 0xf9cf67, width: 3, alpha });
        if (cue.world === 'office' && i % 4 === 0)
          this.drawings.rect(x, y, 13, 8).fill({ color: CREAM, alpha });
        if (cue.world === 'afterlife' && i % 5 === 0)
          this.art('ghost', x, y - 15, 22, 28, 0, alpha * 0.6);
      }
    if (age > 0.2) {
      const growth = ease((age - 0.2) * 2);
      const g = this.stains;
      for (let i = 0; i < (this.reduced ? 2 : 5); i++) {
        const xx = cue.x + (noise(cue.seed, i + 101) - 0.5) * 150 * cue.power;
        g.ellipse(
          xx,
          GROUND_Y + 2 + noise(cue.seed, i + 112) * 13,
          (12 + noise(cue.seed, i + 120) * 38) * growth,
          (3 + noise(cue.seed, i + 128) * 6) * growth,
        ).fill({ color: this.red, alpha: 0.8 });
        g.ellipse(xx - 3, GROUND_Y + 1, 8 * growth, 1.6).fill({
          color: this.pink,
          alpha: 0.65,
        });
      }
    }
    if (cue.kind === 'ignite' && age < 0.8) {
      for (let i = 0; i < 6; i++) {
        const x = cue.x + (i - 2.5) * age * 90,
          y = cue.y - Math.sin(i * 2 + 1) * age * 45;
        const r = Math.sin(Math.min(1, age / 0.8) * Math.PI) * (20 + i * 2);
        this.drawings
          .ellipse(x, y, r, r * 1.4)
          .fill({ color: i % 2 ? 0xffce64 : 0xff692d, alpha: 0.8 - age * 0.6 });
      }
    }
    if (cue.kind === 'confetti' && age < 2)
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4;
        this.art(
          i % 2 ? 'eye' : 'bone',
          cue.x + Math.cos(a) * age * 150,
          cue.y - 120 * age + age * age * 70,
          18,
          20,
          age * 6 + a,
        );
      }
  }
  private injuries(s: GameState) {
    const w = s.wreck!;
    const byId = new Map(w.bodies.map((b) => [b.id, b]));
    for (const a of w.carnage!.attachments) {
      const from = byId.get(a.from),
        to = byId.get(a.to);
      if (
        !from ||
        !to ||
        Math.hypot(from.x - to.x, from.y - to.y) > (a.elastic ? 650 : 310)
      )
        continue;
      this.ribbon(
        from.x,
        from.y + 10,
        to.x,
        to.y,
        this.time,
        a.elastic ? 11 : 6,
        this.red,
        a.elastic ? 95 : 30,
      );
    }
    for (const b of w.bodies) {
      if (!b.injury || b.part === 'eye' || b.part === 'tail') continue;
      if (b.x < this.left - 100 || b.x > this.right + 100) continue;
      if (b.charred && !this.gentle) {
        this.art(b.part, b.x, b.y, b.w, b.h, b.angle, 0.62, 0x321f36);
        this.drawings
          .circle(b.x - 8, b.y - 12, 4)
          .circle(b.x + 8, b.y - 12, 4)
          .fill(0xfff0c4);
      }
      if (b.part.includes('torso') || b.part === 'cube') {
        this.organ(
          b.x + Math.cos(b.angle) * 15,
          b.y + 13,
          b.w * 0.28,
          this.time,
        );
        for (let i = 0; i < 3; i++)
          this.ribbon(
            b.x - 18 + i * 14,
            b.y + 20,
            b.x - 18 + i * 15 + Math.sin(this.time * 3 + i) * 10,
            Math.min(GROUND_Y - 6, b.y + 55 + i * 8),
            this.time + i,
            6,
          );
      } else if (b.part.includes('head') || b.part === 'surprisedHead') {
        const yy = Math.min(GROUND_Y - 6, b.y + b.h * 0.28);
        this.drawings.ellipse(b.x - 5, yy, 10, 4).fill(this.red);
        if (b.injury >= 2)
          this.ribbon(
            b.x - 15,
            yy,
            b.x - 23,
            yy + 20 + Math.sin(this.time * 5) * 6,
            this.time,
            5,
          );
      }
    }
    const grab = w.carnage!.grab;
    if (grab) {
      const body = byId.get(grab.bodyId),
        prop = byId.get(grab.propId);
      if (body && prop) {
        this.ribbon(prop.x, prop.y, body.x, body.y, this.time, 15);
        this.drawings
          .circle(body.x, body.y, 52)
          .stroke({ color: 0xffdc83, width: 3, alpha: 0.7 });
        for (let i = 0; i < grab.queued.length; i++)
          this.art(
            'straightLeg',
            body.x - 24 + i * 16,
            body.y - 57,
            12,
            24,
            -0.3 + Math.sin(this.time * 8) * 0.2,
          );
      }
    }
  }
  private spectators(c: CarnageCue, age: number) {
    if (age < 0.7) return;
    for (let i = 0; i < 3; i++) {
      const local = age - 0.7 - i * 0.45;
      if (local < 0) continue;
      const x = c.x - 175 + i * 170;
      const faint = i === 1 && local > 1.7;
      this.art(
        i === 0 ? 'sheep' : 'goose',
        x,
        GROUND_Y - (faint ? 19 : 36),
        61,
        74,
        faint ? ease(local - 1.7) * 1.5 : Math.sin(local * 8) * 0.08,
      );
      if (i === 0) {
        this.mouth(x + 8, GROUND_Y - 28, 30, 22, local, local > 1.3 ? 0.6 : 1);
        if (local > 1.3)
          this.ribbon(
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
      if (i === 2 && local > 2) {
        this.art(
          'bone',
          x - 20,
          GROUND_Y - 40,
          37,
          17,
          Math.sin(local * 9) * 0.4,
        );
        this.eyes(x + 9, GROUND_Y - 47, 7, local);
      }
    }
  }
  private laundry(x: number, t: number) {
    this.ribbon(x - 105, -140, x + 115, -140, t, 3, CREAM, 20);
    this.art('skin', x - 32, -79, 138, 105, Math.sin(t * 3) * 0.09);
    for (let i = 0; i < 3; i++) {
      const xx = x + 40 + i * 25;
      this.drawings
        .roundRect(xx - 3, -135, 6, 18, 2)
        .fill(0xffd478)
        .stroke({ color: INK, width: 1 });
      this.ribbon(xx, -119, xx + Math.sin(t * 4 + i) * 8, -82, t, 4);
      this.organ(xx + Math.sin(t * 4 + i) * 8, -74, 17, t + i);
    }
  }
  private lateScene(c: CarnageCue, t: number, s: GameState) {
    const x = c.x,
      y = GROUND_Y,
      g = this.drawings;
    switch (c.landing) {
      case 'haystack': {
        const progress = ease((t - 0.2) / 2);
        this.art('baler', x - 88, y - 69, 138, 138, Math.sin(t * 30) * 0.018);
        for (let i = 0; i < 5; i++) {
          const local = t - i * 0.22 - 0.25;
          if (local < 0) continue;
          const xx = x - 75 + progress * (i * 47 + 55);
          const walk = this.reduced ? 0 : Math.abs(Math.sin(local * 13)) * 5;
          const shrink = i === 4 ? 1 - ease((t - 4) * 2) * 0.65 : 1;
          this.art(
            'sausage',
            xx,
            y - 27 - walk,
            75 * shrink,
            54 * shrink,
            Math.sin(local * 9) * 0.04,
          );
          if (i) this.ribbon(xx - 30, y - 29, xx - 52, y - 32, local, 5);
          this.eyes(xx + 17, y - 39 - walk, 5 * shrink, local, true);
          if (i === 4) {
            this.art('helmet', xx + 17, y - 53 - walk, 31, 25, -0.2);
            if (t > 4)
              g.roundRect(xx - 29, y - 56, 58, 52, 6)
                .fill({ color: 0xc6faf1, alpha: 0.22 })
                .stroke({ color: 0x92d6d8, width: 2 });
          }
        }
        this.organ(x - 58, y - 16, 30, t);
        break;
      }
      case 'mud': {
        const ambulance = s.wreck!.bodies.find((b) => b.part === 'rescue');
        const xx = ambulance?.x ?? x,
          yy = ambulance?.y ?? y - 55;
        for (let i = 0; i < 4; i++)
          g.ellipse(xx + i * 10 - 20, yy - 12, 9, 6).fill({
            color: this.red,
            alpha: 0.85,
          });
        const sweep = Math.sin(t * 11) * 0.9;
        g.moveTo(xx + 15, yy + 10)
          .lineTo(
            xx + 15 + Math.sin(sweep) * 39,
            yy + 10 - Math.cos(sweep) * 39,
          )
          .stroke({ color: INK, width: 4 });
        for (let i = 0; i < 3; i++) {
          const bx = x - 70 + i * 65,
            by = y - 70 - Math.sin(t * 3 + i) * 15;
          g.roundRect(bx - 13, by - 22, 26, 41, 5)
            .fill({ color: 0xfff3d8, alpha: 0.8 })
            .stroke({ color: INK, width: 2 });
          g.roundRect(bx - 10, by - 3, 20, 18, 3).fill(this.red);
          this.ribbon(bx, by + 20, x, y - 12, t + i, 3);
        }
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
        if (t > 2.4)
          this.art(
            'officeGoose',
            x + 130 - (t - 2.4) * 70,
            y - 80 - Math.sin(clamp((t - 2.4) / 3) * Math.PI) * 95,
            65,
            77,
            (t - 2.4) * 5,
          );
        break;
      }
      case 'accordion': {
        const yy = y - 135;
        this.art('ufo', x, yy - 35, 165, 114, Math.sin(t * 6) * 0.06);
        for (let i = 0; i < 6; i++) {
          const fly = Math.max(0, t - 2.4);
          this.art(
            i % 2 ? 'skeletal-front-leg-straight' : 'bone',
            x + Math.sin(i * 2 + t) * (25 + fly * 53),
            yy + 10 + i * 7 + fly * fly * 34,
            55,
            40,
            i * 1.4 + fly * 8,
          );
        }
        this.art('offended-head', x, yy + 38, 59, 64, t < 2.4 ? Math.PI : 0);
        g.roundRect(x - 47, yy - 26, 94, 99, 23)
          .fill({ color: 0xacfde3, alpha: 0.17 })
          .stroke({ color: 0x81ecd7, width: 3 });
        if (t > 3.6) {
          const travel = ease((t - 3.6) / 1.6);
          this.art(
            'skeleton',
            x + travel * 80,
            y - 57 - travel * 60,
            76,
            110,
            -travel * 0.8,
          );
          this.art(
            'magnetic-horseshoe',
            x + travel * 80,
            y - 120 - travel * 60,
            49,
            43,
            Math.PI,
          );
          this.ribbon(
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
        break;
      }
      case 'cartwheel': {
        for (let i = 0; i < 8; i++) {
          const xx = x - 76 + i * 22;
          this.art(
            'bone',
            xx,
            y - 30 - Math.abs(Math.sin(t * 7 + i)) * 5,
            21,
            59,
            Math.PI / 2,
          );
          if (i % 2 === 0)
            this.art(
              'eye',
              xx,
              y - 55 - Math.abs(Math.sin(t * 7 + i)) * 48,
              22,
              25,
            );
        }
        for (let i = 0; i < 2; i++)
          this.art(
            'straightLeg',
            x - 60 + i * 115,
            y - 89 - Math.sin(t * 9 + i * 3) * 12,
            33,
            58,
            i ? 0.7 : -0.7,
          );
        const pianoCue = s.wreck!.carnage!.cues.find(
          (v) => v.kind === 'landing' && v.stage === 2,
        );
        const piano = s.wreck!.bodies.find((b) => b.id === pianoCue?.propId);
        if (piano && t < 3.8) {
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
        if (t > 4.4)
          this.art(
            'bone',
            x + 15,
            y - 26 - Math.max(0, 4.9 - t) * 260,
            16,
            22,
            0.2,
          );
        break;
      }
      case 'fence': {
        this.laundry(x, t);
        this.art(
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
          this.ribbon(xx - 28, yy, xx, yy, t, 4);
          this.art(i % 2 ? 'bone' : 'jam', xx, yy, 27, 24, t * 5 + i);
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
        if (t > 4.3) {
          const yy = y - 47 - Math.max(0, 4.9 - t) * 170;
          g.poly([
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
        break;
      }
      case 'sheep': {
        const sheep = s.wreck!.bodies.find(
          (b) => b.id === c.propId && b.part === 'sheep',
        );
        const xx = sheep?.x ?? x,
          yy = sheep?.y ?? y - 67;
        if (!sheep) this.art('sheep', xx, yy, 163, 143);
        const chew = t < 2.4 ? 0.65 + Math.sin(t * 12) * 0.3 : 0.85;
        this.mouth(xx + 27, yy + 8, 88, 91, t, chew);
        this.eyes(xx + 10, yy - 38, 15, t, true);
        for (let i = 0; i < 3; i++)
          this.art('bone', xx - 35 + i * 13, yy + 9, 24, 44, t + i, 0.45, INK);
        if (t > 2.4 && t < 4.1) {
          const b = t - 2.4;
          this.art(
            'torso',
            xx + 50 + b * 65,
            yy - 15 - b * 28,
            110 + b * 45,
            83 + b * 25,
            -0.3,
            (1 - b / 1.7) * 0.5,
            this.red,
          );
          this.art(
            'eye',
            xx + 75 + b * 70,
            yy - 60 + b * b * 40,
            22,
            26,
            b * 6,
          );
        }
        if (t > 3.8) {
          this.art('offended-head', xx - 39, yy - 25, 76, 84, -0.4);
          this.mouth(
            xx - 12,
            yy - 6,
            31,
            28,
            t,
            0.4 + Math.abs(Math.sin(t * 11)) * 0.6,
          );
        }
        break;
      }
      case 'ballet': {
        const spin = t < 2.4 ? t * (4 + t * 3) : t * 4;
        for (let i = 0; i < 4; i++) {
          const a = spin + (i * Math.PI) / 2;
          const outward = t > 2.4 ? Math.min(110, (t - 2.4) * 100) : 32;
          const xx = x + Math.sin(a) * outward;
          this.art(
            'skeletal-front-leg-straight',
            xx,
            y - 37 - Math.abs(Math.cos(a)) * 12,
            35,
            65,
            Math.sin(a) * 0.9,
          );
          if (t < 3)
            this.ribbon(x, y - 63, xx, y - 50, t + i, 8, this.red, -27);
        }
        this.art('crown', x, y - 109, 50, 38, Math.sin(t * 7) * 0.25);
        if (t > 3.8) {
          const enter = ease((t - 3.8) * 2);
          this.art(
            'bouquet',
            x + 110 - enter * 90,
            y - 56,
            111,
            130,
            -0.2 + Math.sin(t * 9) * 0.05,
          );
          if (t < 4.9)
            this.art(
              'straightLeg',
              x - 10,
              y - 38,
              27,
              66,
              Math.sin(t * 5) * 0.3,
            );
          if (t > 4.9) this.art('straightLeg', x + 31, y - 70, 17, 23, 1.4);
        }
        break;
      }
      case 'dignified': {
        const gateX = x + 72;
        g.roundRect(gateX - 8, y - 122, 16, 113, 4)
          .fill(0x7799a8)
          .stroke({ color: INK, width: 3 });
        for (let i = 0; i < 3; i++) {
          const a = t * 3 + (i * Math.PI * 2) / 3;
          g.moveTo(gateX, y - 67)
            .lineTo(gateX + Math.cos(a) * 42, y - 67 + Math.sin(a) * 30)
            .stroke({ color: CREAM, width: 7 });
        }
        this.art(
          'reaper',
          gateX + 61,
          y - 70,
          101,
          145,
          Math.sin(t * 4) * 0.05,
        );
        for (let i = 0; i < 5; i++) {
          const local = t - i * 0.35;
          if (local < 0) continue;
          const reject = clamp((local - 1.8) / 0.5);
          const size = 74 - i * 9;
          const xx = x - 97 + i * 23 + Math.min(65, local * 30) - reject * 100;
          const yy = y - 82 - Math.sin(local * 3) * 8 + reject * 43;
          this.art(
            i % 2 ? 'skeleton' : 'ghost-head',
            xx,
            yy,
            size,
            size * 1.15,
            reject * 5,
            0.65,
            0xa9ffe9,
          );
        }
        if (t > 4) {
          this.art('helmet', x, y - 31, 78, 62);
          const escape = 1 - ease((t - 4.4) / 0.8);
          this.art(
            'ghost-head',
            x,
            y - 38 - escape * 61,
            15 + escape * 12,
            22 + escape * 16,
            0,
            0.8,
          );
          g.moveTo(x - 11, y - 56)
            .quadraticCurveTo(x - 22, y - 91, x - 5, y - 103)
            .stroke({ color: 0xbdfae8, width: 2, alpha: 0.7 });
        }
        break;
      }
    }
  }
  private boss(c: CarnageCue, t: number, s: GameState) {
    if (t < 0 || t > 6) return;
    const b = s.wreck!.bodies.find((b) => b.id === c.bodyId);
    const x = b?.x ?? c.x,
      y = b?.y ?? c.y,
      g = this.drawings;
    switch (c.world) {
      case 'farm':
        for (let i = 0; i < 4; i++) {
          const age = Math.max(0, t - i * 0.25),
            xx = x - age * 65,
            yy = Math.min(GROUND_Y - 20, y + age * age * 35);
          this.art('sausage', xx, yy, 66, 48, age * 2);
          this.ribbon(x, y + 20, xx, yy, age, 7);
          g.circle(xx, yy, 13).stroke({ color: this.red, width: 3 });
        }
        break;
      case 'candy':
        for (let i = 0; i < 4; i++)
          this.mouth(
            x + Math.sin(t * 3 + i) * 35,
            y + i * 9,
            135 - i * 27,
            128 - i * 24,
            t + i,
            0.8 + Math.sin(t * 7 + i) * 0.18,
          );
        break;
      case 'carnival':
        for (let i = 0; i < 3; i++) {
          const xx = x - 100 + i * 100;
          this.art(
            'skeleton',
            xx,
            Math.min(-60, y + 95),
            66,
            103,
            Math.sin(t * 9 + i) * 0.15,
          );
          this.art('bone', xx + 28, y + 60, 40, 13, Math.sin(t * 10 + i) * 0.9);
          if (t > 2.4)
            this.art(
              'piano',
              xx,
              Math.min(GROUND_Y - 35, y - 190 + (t - 2.4) ** 2 * 130),
              85,
              86,
              0.1,
            );
        }
        break;
      case 'office':
        for (let i = 0; i < 5; i++) {
          const xx = x - 110 + i * 45,
            yy = Math.min(GROUND_Y - 18, y + 70 + Math.sin(t * 8 + i) * 11);
          this.organ(xx, yy, 26, t + i);
          g.rect(xx - 13, yy - 20, 26, 12)
            .fill(CREAM)
            .stroke({ color: this.red, width: 2 });
          this.art(
            'wing-left',
            xx,
            y - 50 - Math.sin(t * 4 + i) * 50,
            25,
            40,
            t + i,
          );
        }
        break;
      case 'moon':
        for (let i = 0; i < 8; i++) {
          const outward = t > 2.4 ? 1 + (t - 2.4) * 0.8 : 1 - t * 0.25;
          const a = t * 3 + (i * Math.PI) / 4;
          const xx = x + Math.cos(a) * 110 * outward,
            yy = y + Math.sin(a) * 70 * outward;
          this.art(i % 2 ? 'bone' : 'eye', xx, yy, 32, 32, a);
          this.ribbon(x, y, xx, yy, t + i, 3, 0xaff3c5, 0);
        }
        break;
      case 'afterlife':
        this.art('skeletal-torso', x, y + 65, 112, 70, Math.sin(t * 8) * 0.1);
        for (let i = 0; i < 4; i++) {
          const rise = Math.max(0, t - i * 0.35);
          this.art(
            'ghost-head',
            x + Math.sin(rise * 3) * 25,
            y + 40 - rise * 65,
            54 - i * 7,
            67 - i * 7,
            0,
            clamp(1 - rise / 4),
            0xa9ffe9,
          );
        }
        if (t > 2.4)
          this.ribbon(
            x + 50,
            y - 90,
            x - 50 + Math.sin(t * 5) * 20,
            y + 65,
            t,
            6,
            CREAM,
            -30,
          );
        break;
    }
  }
  update(
    s: GameState,
    gentle: boolean,
    reduced: boolean,
    density: number,
    cameraX: number,
    width: number,
    zoom: number,
    height: number,
  ) {
    this.used = 0;
    this.stains.clear();
    this.tissue.clear();
    this.drawings.clear();
    this.screen.clear();
    this.gentle = gentle;
    this.reduced = reduced;
    this.density = density;
    const w = s.wreck,
      frame = w?.carnage;
    this.behind.visible = this.front.visible = !!frame;
    if (w && frame) {
      this.time = w.time;
      this.left = cameraX - width / zoom / 2 - 80;
      this.right = cameraX + width / zoom / 2 + 80;
      const magnet = s.equipment.includes('magnet')
        ? w.bodies.find((b) => b.id === w.focusId)
        : undefined;
      // Large illustrations get first claim on the pool. Optional particles
      // never crowd out the punchline when the renderer reduces its budget.
      const scene = frame.cues.find(
        (c) => c.kind === 'landing' && c.stage === 0,
      );
      if (scene) {
        this.lateScene(scene, w.time - scene.at, s);
        this.spectators(scene, w.time - scene.at);
      } else if (s.landing === 'fence' && w.time >= 4.2)
        this.laundry(w.aftermath!.anchorX, w.time);
      for (const c of frame.cues)
        if (c.kind === 'boss') this.boss(c, w.time - c.at, s);
      this.injuries(s);
      if (!reduced) {
        const splash = frame.cues.findLast(
          (c) => c.kind === 'impact' && c.power >= 1.8 && w.time - c.at < 0.55,
        );
        if (splash)
          for (let i = 0; i < 8; i++) {
            const age = w.time - splash.at,
              side = i % 2;
            const x = side
              ? width - noise(splash.seed, i) * width * 0.065
              : noise(splash.seed, i) * width * 0.065;
            const y =
              height * (0.42 + noise(splash.seed, i + 8) * 0.36) + age * 25;
            const alpha = clamp((0.55 - age) * 2) * 0.65;
            this.screen
              .ellipse(x, y, 9 + noise(splash.seed, i + 17) * 19, 13 + age * 30)
              .fill({ color: this.red, alpha });
          }
      }
      for (const c of frame.cues)
        if (
          ['impact', 'ignite', 'confetti', 'release'].includes(c.kind) &&
          c.x > this.left - 230 &&
          c.x < this.right + 230
        )
          this.sprays(c, w.time - c.at, magnet);
    }
    for (let i = this.used; i < this.pool.length; i++)
      this.pool[i].visible = false;
  }
  reset() {
    this.stains.clear();
    this.tissue.clear();
    this.drawings.clear();
    this.screen.clear();
    for (const p of this.pool) p.visible = false;
    this.used = 0;
  }
  stats() {
    return { allocatedSprites: this.pool.length, visibleSprites: this.used };
  }
}
