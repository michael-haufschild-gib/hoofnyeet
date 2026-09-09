import { Container, Graphics, Sprite, Texture, Rectangle } from 'pixi.js';
import { GROUND_Y } from '../geometry';
import { noise, type CarnageCue } from '../escalation';
import type { BodyPose } from '../crash';
import type { GameState } from '../simulation';
import { SpectatorShow } from './spectator-show';
import { AfterlifeQueue } from './afterlife-queue';
import { CombustionEffects } from './combustion';
import { SprayEffects } from './spray-effects';
import { BossShow } from './boss-show';
import {
  anatomyPoint,
  tissueSocket,
  anatomyIncident,
  anatomyAntic,
} from './anatomy-motion';

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
  private combustion = new CombustionEffects();
  private spray: SprayEffects;
  private toothCrown?: Texture;
  private stains = new Graphics({ label: 'persistent-blood-smears' });
  private tissue = new Graphics({ label: 'elastic-anatomy' });
  private drawings = new Graphics({ label: 'animated-mouths-and-machinery' });
  private afterlifeQueue = new AfterlifeQueue(this.drawings, (...args) =>
    this.art(...args),
  );
  private spectatorInk = new Graphics({ label: 'spectator-sideshow' });
  private sideshow = new SpectatorShow(this.spectatorInk, (...args) =>
    this.art(...args),
  );
  private bossShow = new BossShow(
    this.drawings,
    (...args) => this.art(...args),
    (...args) => this.mouth(...args),
    (...args) => this.organ(...args),
    (...args) => this.ribbon(...args),
  );
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
    this.spray = new SprayEffects(textures);
    this.behind.addChild(
      this.stains,
      this.spray.ground,
      this.combustion.view,
      this.tissue,
    );
    this.front.addChild(
      this.spray.air,
      this.actors,
      this.drawings,
      this.spectatorInk,
    );
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
      if (key === 'heart') key = 'pastry';
      if (key === 'brain') key = 'donut';
      if (key === 'sausage') key = 'cube';
      if (
        key.startsWith('skeletal') ||
        ['bone', 'jam', 'eye', 'skeleton', 'tooth', 'droplet'].includes(key)
      )
        key = key.includes('leg') ? 'straightLeg' : 'cheese';
      if (key === 'bouquet') key = 'crown';
    }
    const texture = this.textures[key];
    if (!texture) return;
    const p = this.pool[this.used++];
    p.label = `carnage-${key}`;
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
  private organ(x: number, y: number, size: number, t: number, angle = 0) {
    y = Math.min(y, GROUND_Y - size * 0.58);
    const g = this.localDrawing(x, y, angle),
      pulse = this.reduced ? 1 : 1 + Math.sin(t * 8) * 0.09;
    x = y = 0;
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
      g.restore();
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
    g.restore();
  }
  private mouth(
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    open = 1,
    angle = 0,
  ) {
    const rootX = x,
      rootY = y,
      rootCos = Math.cos(angle),
      rootSin = Math.sin(angle);
    const tooth = this.textures.tooth;
    if (tooth && !this.toothCrown)
      this.toothCrown = new Texture({
        source: tooth.source,
        frame: new Rectangle(
          0,
          0,
          tooth.width,
          Math.floor(tooth.height * 0.57),
        ),
      });
    const g = this.localDrawing(x, y, angle),
      height = Math.max(8, h * open);
    x = y = 0;
    g.ellipse(x, y, w / 2 + 5, height / 2 + 5)
      .fill(this.pink)
      .stroke({ color: INK, width: 4 });
    g.ellipse(x, y + 2, w / 2 + 1, height / 2 + 2).stroke({
      color: this.red,
      width: 5,
    });
    g.ellipse(x, y, w / 2, height / 2).fill(0x451329);
    g.ellipse(x, y + height * 0.07, w * 0.43, height * 0.34).fill(0x602037);
    g.ellipse(
      x + (this.reduced ? 0 : Math.sin(t * 4) * w * 0.06),
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
        if (this.toothCrown && !this.gentle && w > 38) {
          const length = Math.min(height * 0.31, w * 0.16);
          const cy = yy - side * length * 0.44;
          const a = angle + (side < 0 ? Math.PI : 0);
          const cs = Math.cos(a),
            sn = Math.sin(a);
          g.save().setTransform(
            cs,
            sn,
            -sn,
            cs,
            rootX + rootCos * xx - rootSin * cy,
            rootY + rootSin * xx + rootCos * cy,
          );
          g.texture(
            this.toothCrown,
            0xffffff,
            -w * 0.055,
            -length * 0.45,
            w * 0.11,
            length * 0.9,
          );
          g.restore();
        }
      }
    }
    if (!this.gentle)
      for (let i = 0; i < 3; i++)
        g.ellipse(
          x + (i - 1) * w * 0.22,
          y + height * 0.43 + 6 + i * 3,
          3.5,
          10 + (this.reduced ? 0 : Math.sin(t * 5 + i) * 3),
        ).fill(this.red);
    g.moveTo(-w * 0.34, -height * 0.34)
      .bezierCurveTo(
        -w * 0.18,
        -height * 0.56,
        w * 0.14,
        -height * 0.58,
        w * 0.29,
        -height * 0.42,
      )
      .stroke({
        color: this.gentle ? 0xf9d6ff : 0xffc3c3,
        width: Math.max(1.5, w * 0.012),
        alpha: 0.8,
        cap: 'round',
      });
    g.restore();
  }
  private eyes(
    x: number,
    y: number,
    size: number,
    t: number,
    angry = false,
    angle = 0,
  ) {
    const g = this.localDrawing(x, y, angle);
    x = y = 0;
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
    g.restore();
  }
  private sprays(cue: CarnageCue, age: number, magnet?: BodyPose) {
    if (age < 0) return;
    this.spray.cue(cue, age, magnet);
    // Moving droplets can remain visible after their emitter leaves the camera.
    // Only source-local effects use the narrow emitter cull.
    if (cue.x < this.left - 230 || cue.x > this.right + 230) return;
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
        this.spray.smear(
          xx,
          GROUND_Y + 2 + noise(cue.seed, i + 112) * 13,
          (12 + noise(cue.seed, i + 120) * 38) * growth * 2.5,
          (3 + noise(cue.seed, i + 128) * 6) * growth * 2.8,
        );
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
  private localDrawing(x: number, y: number, angle: number, sx = 1, sy = sx) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    // Pixi's rotateTransform pre-multiplies translation. Set the full local-to-
    // world matrix so a jaw turns at its socket, never around the world's origin.
    return this.drawings
      .save()
      .setTransform(c * sx, s * sx, -s * sy, c * sy, x, y);
  }
  private anatomicalCharacter(b: BodyPose, s: GameState) {
    const head = b.part.toLowerCase().includes('head');
    const cue = anatomyIncident(s.wreck!.carnage!.cues, b.id, this.time);
    const pose = cue && anatomyAntic(b, cue, this.time, this.reduced);
    if (head && (!pose || b.injury! < 2)) return;
    const root = pose?.root ?? anatomyPoint(b, 0.13, 0.08);
    const size = pose?.size ?? Math.max(30, Math.min(54, b.w * 0.5));
    const sx = pose?.scaleX ?? 1,
      sy = pose?.scaleY ?? 1;
    const angle = pose?.angle ?? b.angle;
    const x = pose?.x ?? root.x;
    const y = Math.min(pose?.y ?? root.y, GROUND_Y - size * sy * 0.5 - 2);
    const t = pose?.age ?? 0;
    const key = head ? 'brain' : 'heart';
    // The persistent liver/strands remain. A distinct expressive organ sprouts
    // from the same wound, with a stem connecting it throughout its antics.
    this.ribbon(
      root.x,
      root.y,
      x,
      y + size * 0.22,
      this.time,
      head ? 4 : 5,
      this.red,
      12,
    );
    const actor = this.art(key, x, y, head ? size : size * 0.68, size, angle);
    if (actor) {
      actor.scale.x *= sx;
      actor.scale.y *= sy;
    }
    if (this.gentle) this.eyes(x + size * 0.06, y, size * 0.12, this.time);
    if (!pose || this.reduced) return;
    const g = this.drawings;
    if (pose.kind === 'defibrillator' && t > 0.55 && t < 2.5) {
      const ready = ease((t - 0.55) / 0.5),
        retreat = ease((t - 1.8) / 0.7);
      const reach = size * (0.68 - ready * 0.32 + retreat * 0.42);
      for (const side of [-1, 1]) {
        const px = x + side * reach,
          py = y + size * 0.13;
        this.ribbon(
          root.x + side * 8,
          root.y,
          px,
          py,
          this.time,
          3,
          this.pink,
          15,
        );
        this.art('bone', px, py - 8, 30, 11, side * (-0.9 + ready * 0.8));
        g.roundRect(px - 5, py - 12, 10, 19, 3)
          .fill(0xa6dcd0)
          .stroke({ color: INK, width: 2 });
      }
      if (pose.shock > 0.08) {
        g.moveTo(x - reach, y);
        for (let i = 1; i <= 9; i++)
          g.lineTo(
            x - reach + (i / 9) * reach * 2,
            y + (i % 2 ? -1 : 1) * (8 + pose.shock * 8),
          );
        g.stroke({ color: 0xc2fff1, width: 4 });
        g.star(
          x,
          y,
          9,
          size * (0.58 + pose.shock * 0.12),
          size * 0.45,
          t,
        ).stroke({ color: 0xffeb9a, width: 2, alpha: pose.shock });
      }
    } else if (pose.kind === 'balloon') {
      if (t > 0.8 && t < 2.1) {
        for (let i = 0; i < 3; i++) {
          const yy = y + size * (0.05 + i * 0.15);
          g.moveTo(x + size * 0.48, yy)
            .quadraticCurveTo(x + size * 0.75, yy - 8, x + size * 0.8, yy + 2)
            .stroke({ color: CREAM, width: 2.2, alpha: pose.balloon });
        }
      }
      if (t > 2 && t < 2.8) {
        const a = (t - 2) / 0.8;
        for (let i = 0; i < 7; i++) {
          const angle = (i * Math.PI * 2) / 7;
          this.art(
            i % 2 ? 'eye' : 'heart',
            x + Math.cos(angle) * (16 + a * 62),
            y + Math.sin(angle) * (16 + a * 47) + a * a * 22,
            16,
            19,
            angle + a * 4,
            1 - a,
          );
        }
      }
    } else if (pose.kind === 'helicopter' && t > 0.22 && t < 3.0) {
      const snap = Math.max(0, t - 2),
        hubY = y - size * 0.51;
      g.moveTo(x, y - size * 0.31)
        .lineTo(x, hubY)
        .stroke({ color: this.pink, width: 4 });
      if (!snap) {
        for (let i = 0; i < 2; i++) {
          const turn = t * 28 + (i * Math.PI) / 2;
          this.art('bone', x, hubY, 76, 18, turn);
        }
        g.ellipse(x, hubY, 41, 7).stroke({
          color: CREAM,
          width: 2,
          alpha: 0.6,
        });
      } else
        for (const side of [-1, 1]) {
          this.art(
            'bone',
            x + side * snap * 78,
            hubY - snap * 50 + snap * snap * 85,
            47,
            15,
            side * snap * 10,
            Math.max(0, 1 - snap),
          );
        }
    } else if (pose.kind === 'parachute' && t > 0.2 && t < 3.4) {
      const close = ease((t - 2.15) / 0.3);
      const canopyY = y - size * (0.8 - close * 0.48);
      const canopy = this.art(
        'helmet',
        x,
        canopyY,
        size * (1.5 - close * 0.25),
        size * 0.92,
        -0.1 + Math.sin(t * 7) * 0.12,
      );
      if (canopy) canopy.scale.y *= 1 - close * 0.5;
      for (const side of [-1, 1])
        this.ribbon(
          x + side * size * 0.49,
          canopyY + size * 0.09,
          x + side * size * 0.2,
          y - size * 0.1,
          this.time,
          2,
          CREAM,
          0,
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
      const start = tissueSocket(from, true),
        end = tissueSocket(to, false);
      this.ribbon(
        start.x,
        start.y,
        end.x,
        end.y,
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
        const a = anatomyPoint(b, -0.12, -0.12),
          z = anatomyPoint(b, 0.12, -0.12);
        this.drawings.circle(a.x, a.y, 4).circle(z.x, z.y, 4).fill(0xfff0c4);
      }
      if (b.part.includes('torso') || b.part === 'cube') {
        const liver = anatomyPoint(b, -0.1, 0.23);
        this.organ(liver.x, liver.y, b.w * 0.23, this.time, b.angle);
        for (let i = 0; i < 3; i++) {
          const root = anatomyPoint(b, -0.18 + i * 0.14, 0.24);
          this.ribbon(
            root.x,
            root.y,
            root.x + Math.sin(this.time * 3 + i) * 10,
            Math.min(GROUND_Y - 6, root.y + 35 + i * 8),
            this.time + i,
            6,
          );
        }
        this.anatomicalCharacter(b, s);
      } else if (b.part.includes('head') || b.part === 'surprisedHead') {
        const wound = anatomyPoint(b, -0.13, 0.28);
        const yy = Math.min(GROUND_Y - 6, wound.y);
        this.localDrawing(wound.x, yy, b.angle)
          .ellipse(0, 0, 10, 4)
          .fill(this.red)
          .restore();
        if (b.injury >= 2)
          this.ribbon(
            wound.x,
            yy,
            wound.x - 12,
            yy + 20 + Math.sin(this.time * 5) * 6,
            this.time,
            5,
          );
        this.anatomicalCharacter(b, s);
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
        if (ambulance) {
          // Painted windshield coordinates, not a screen-space line hovering
          // over whichever part of the rotating vehicle happens to be below it.
          this.localDrawing(
            ambulance.x,
            ambulance.y,
            ambulance.angle,
            ambulance.w,
            ambulance.h,
          );
          for (let i = 0; i < 4; i++)
            g.ellipse(
              -0.33 + i * 0.035,
              -0.19 + Math.sin(i * 2) * 0.03,
              0.033,
              0.024,
            ).fill({ color: this.red, alpha: 0.85 });
          g.arc(-0.3, -0.087, 0.125, -2, -0.86).stroke({
            color: this.red,
            width: 0.035,
            alpha: 0.42,
          });
          const sweep = Math.sin(t * 11) * 0.45 + 0.18;
          g.moveTo(-0.3, -0.087)
            .lineTo(
              -0.3 + Math.sin(sweep) * 0.11,
              -0.087 - Math.cos(sweep) * 0.16,
            )
            .stroke({ color: INK, width: 0.012, cap: 'round' })
            .restore();
        }
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
        g.roundRect(x - 94, y - 20, 194, 15, 7)
          .fill(this.red)
          .stroke({ color: INK, width: 3 });
        g.ellipse(x + 7, y - 11, 106, 8).fill({ color: this.pink, alpha: 0.4 });
        for (let i = 0; i < 8; i++) {
          const xx = x - 76 + i * 22;
          const strike =
            t < 4.2 ? Math.max(0, Math.cos(t * 9 - i * 0.85)) ** 8 : 0;
          this.art('bone', xx, y - 36 + strike * 7, 59, 21, Math.PI / 2);
          // Ivory ribs form actual playable keys. Bone sprites remain as the
          // knuckles; the authored key silhouette stays clear of the red base.
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
            this.art(
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
        for (let i = 0; i < 2; i++)
          this.art(
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
            y - 68 - Math.max(0, 4.9 - t) * 260,
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
        const mouth = sheep
          ? anatomyPoint(sheep, 0.17, 0.056)
          : { x: xx + 27, y: yy + 8 };
        const eyes = sheep
          ? anatomyPoint(sheep, 0.06, -0.266)
          : { x: xx + 10, y: yy - 38 };
        const scale = sheep ? sheep.w / 163 : 1,
          angle = sheep?.angle ?? 0;
        this.mouth(mouth.x, mouth.y, 88 * scale, 91 * scale, t, chew, angle);
        this.eyes(eyes.x, eyes.y, 15 * scale, t, true, angle);
        for (let i = 0; i < 3; i++) {
          const bone = sheep
            ? anatomyPoint(sheep, -0.215 + i * 0.08, 0.06)
            : { x: xx - 35 + i * 13, y: yy + 9 };
          this.art(
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
          const head = sheep
            ? anatomyPoint(sheep, -0.24, -0.175)
            : { x: xx - 39, y: yy - 25 };
          this.art(
            'offended-head',
            head.x,
            head.y,
            76 * scale,
            84 * scale,
            angle - 0.4,
          );
          const bite = sheep
            ? anatomyPoint(sheep, -0.073, -0.042)
            : { x: xx - 12, y: yy - 6 };
          this.mouth(
            bite.x,
            bite.y,
            31 * scale,
            28 * scale,
            t,
            0.4 + Math.abs(Math.sin(t * 11)) * 0.6,
            angle,
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
        this.afterlifeQueue.draw(x, y, t, this.reduced, this.gentle);
        break;
      }
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
    this.spray.reset();
    this.combustion.reset();
    this.stains.clear();
    this.tissue.clear();
    this.drawings.clear();
    this.screen.clear();
    this.spectatorInk.clear();
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
      this.spray.begin(gentle, reduced, density, this.left, this.right);
      this.combustion.update(
        frame.cues,
        w.time,
        this.left,
        this.right,
        reduced,
        gentle,
        density,
      );
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
        this.sideshow.draw(scene, w.time, gentle, reduced);
      } else if (s.landing === 'fence' && w.time >= 4.2)
        this.laundry(w.aftermath!.anchorX, w.time);
      for (const c of frame.cues)
        if (c.kind === 'boss')
          this.bossShow.draw(
            c,
            w.time,
            w.bodies.find((b) => b.id === c.bodyId),
            gentle,
            reduced,
          );
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
      for (const c of frame.cues.toReversed())
        if (['impact', 'ignite', 'confetti', 'release'].includes(c.kind))
          this.sprays(c, w.time - c.at, magnet);
      this.spray.end();
    }
    for (let i = this.used; i < this.pool.length; i++)
      this.pool[i].visible = false;
  }
  reset() {
    this.spray.reset();
    this.combustion.reset();
    this.stains.clear();
    this.tissue.clear();
    this.drawings.clear();
    this.screen.clear();
    this.spectatorInk.clear();
    for (const p of this.pool) p.visible = false;
    this.used = 0;
  }
  dispose() {
    this.toothCrown?.destroy();
    this.spray.dispose();
    this.combustion.dispose();
  }
  stats() {
    return { allocatedSprites: this.pool.length, visibleSprites: this.used };
  }
}
