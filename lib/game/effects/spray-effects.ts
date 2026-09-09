import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { GROUND_Y } from '../geometry';
import { noise, type CarnageCue } from '../escalation';
import {
  SPRAY_AIR_CAP,
  SPRAY_GROUND_CAP,
  sprayMaterial,
  sprayPose,
  type SprayTarget,
} from './spray-motion';

/** Independent decorative pools cannot displace a pony or a finale actor. */
export class SprayEffects {
  readonly air = new Container({ label: 'illustrated-impact-spray' });
  readonly ground = new Container({ label: 'contact-liquid-splats' });
  readonly ink = new Graphics({ label: 'spray-materials-and-magnetism' });
  private drops: Sprite[] = [];
  private splats: Sprite[] = [];
  private airborne = 0;
  private grounded = 0;
  private materialCount = 0;
  private gentle = false;
  private reduced = false;
  private density = 1;
  private left = 0;
  private right = 0;
  private disposed = false;

  constructor(private textures: Record<string, Texture>) {
    for (let i = 0; i < SPRAY_AIR_CAP; i++) {
      const p = new Sprite({ visible: false });
      this.drops.push(p);
      this.air.addChild(p);
    }
    for (let i = 0; i < SPRAY_GROUND_CAP; i++) {
      const p = new Sprite({ visible: false });
      this.splats.push(p);
      this.ground.addChild(p);
    }
    this.air.addChild(this.ink);
  }
  begin(
    gentle: boolean,
    reduced: boolean,
    density: number,
    left: number,
    right: number,
  ) {
    this.airborne = this.grounded = 0;
    this.materialCount = 0;
    this.ink.clear();
    this.gentle = gentle;
    this.reduced = reduced;
    this.density = density;
    this.left = left;
    this.right = right;
  }
  private sprite(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    angle = 0,
    alpha = 1,
    ground = false,
    stretch = false,
  ) {
    if (x + w < this.left || x - w > this.right || alpha <= 0) return;
    if (this.gentle && ['eye', 'bone', 'tooth'].includes(key)) key = 'cheese';
    const texture = this.textures[key];
    const pool = ground ? this.splats : this.drops;
    const used = ground ? this.grounded : this.airborne;
    if (!texture || used >= pool.length) return;
    const p = pool[used];
    if (ground) this.grounded++;
    else this.airborne++;
    p.texture = texture;
    p.label = `spray-${key}`;
    p.anchor.set(0.5, key === 'droplet' ? 0.77 : 0.5);
    const scale = Math.min(w / texture.width, h / texture.height);
    p.scale.set(
      stretch ? w / texture.width : scale,
      stretch ? h / texture.height : scale,
    );
    p.position.set(x, y);
    p.rotation = angle;
    p.alpha = alpha;
    p.visible = true;
    return p;
  }
  private liquid(
    x: number,
    y: number,
    r: number,
    elongation: number,
    angle: number,
    alpha = 1,
  ) {
    if (
      x + r * 4 < this.left ||
      x - r * 4 > this.right ||
      this.airborne >= SPRAY_AIR_CAP
    )
      return;
    if (!this.gentle) {
      this.sprite(
        'droplet',
        x,
        y,
        r * 2,
        r * 3.5 * elongation,
        angle,
        alpha,
        false,
        true,
      );
      return;
    }
    // Candy mode keeps the same silhouette and motion without red anatomy.
    this.drops[this.airborne++].visible = false;
    const g = this.ink,
      cs = Math.cos(angle),
      sn = Math.sin(angle);
    g.save().setTransform(cs, sn, -sn, cs, x, y);
    g.moveTo(0, -r * 2.5 * elongation)
      .bezierCurveTo(r * 0.25, -r * 0.6, r, -r * 0.3, r, 0)
      .bezierCurveTo(r, r * 1.2, -r, r * 1.2, -r, 0)
      .bezierCurveTo(
        -r,
        -r * 0.3,
        -r * 0.25,
        -r * 0.6,
        0,
        -r * 2.5 * elongation,
      )
      .fill({ color: 0xa579e6, alpha })
      .stroke({ color: 0x5c387b, alpha, width: 0.8 });
    g.ellipse(-r * 0.25, -r * 0.1, r * 0.2, r * 0.35).fill({
      color: 0xf1d5ff,
      alpha,
    });
    g.restore();
  }
  cue(cue: CarnageCue, age: number, magnet?: SprayTarget) {
    if (age < 0 || age > 18) return;
    const count = Math.ceil((this.reduced ? 7 : 23) * this.density * cue.power);
    for (let i = 0; i < count; i++) {
      const material = sprayMaterial(i);
      const p = sprayPose(
        cue,
        i,
        age,
        0,
        material === 'bone' ? magnet : undefined,
      );
      if (!p) continue;
      if (material === 'droplet') {
        if (!p.landed)
          this.liquid(p.x, p.y, p.radius, p.stretch, p.angle, p.alpha);
        else if (i % 3 === 1) this.splat(cue, i, p);
      } else if (!p.landed) {
        this.sprite(
          material,
          p.x,
          p.y,
          material === 'bone' ? 26 : 18,
          material === 'bone' ? 14 : 18,
          this.reduced ? 0 : p.spin,
          p.alpha,
        );
        if (p.magnetic && magnet && !this.reduced)
          this.ink
            .moveTo(p.x, p.y)
            .lineTo(magnet.x, magnet.y)
            .stroke({ color: 0x72f5e3, width: 1.2, alpha: p.alpha * 0.3 });
      }
      this.material(cue, i, age);
    }
    // Actual gold-filled teeth, in addition to every original eye and bone.
    for (
      let i = 0;
      i < Math.ceil((this.reduced ? 1 : 3) * this.density * cue.power);
      i++
    ) {
      const p = sprayPose(cue, i, age, 733, magnet);
      if (!p || (p.landed && p.groundAge > 2.5)) continue;
      const bounce =
        p.landed && !this.reduced
          ? Math.abs(Math.sin(p.groundAge * 12)) *
            Math.max(0, 1 - p.groundAge) *
            9
          : 0;
      this.sprite(
        'tooth',
        p.x,
        p.landed ? GROUND_Y - 10 - bounce : p.y,
        19,
        23,
        this.reduced
          ? 0
          : p.landed
            ? 0.3 * Math.max(0, 1 - p.groundAge)
            : p.spin,
        p.alpha,
      );
      if (p.magnetic && magnet && !this.reduced)
        this.ink
          .moveTo(p.x, p.y)
          .lineTo(magnet.x, magnet.y)
          .stroke({ color: 0x72f5e3, width: 1.5, alpha: p.alpha * 0.45 });
    }
  }
  private splat(
    cue: CarnageCue,
    index: number,
    p: NonNullable<ReturnType<typeof sprayPose>>,
  ) {
    const growth = 0.3 + 0.7 * p.squash;
    const width = (18 + p.radius * 5) * growth;
    const y = GROUND_Y + 3 + noise(cue.seed, index + 600) * 4;
    if (!this.gentle)
      this.sprite(
        'splat',
        p.contactX,
        y,
        width,
        width * 0.19,
        0,
        p.alpha * 0.9,
        true,
        true,
      );
    else {
      if (
        this.grounded >= SPRAY_GROUND_CAP ||
        p.contactX + width < this.left ||
        p.contactX - width > this.right
      )
        return;
      this.splats[this.grounded++].visible = false;
      this.ink
        .ellipse(p.contactX, y, width * 0.5, width * 0.08)
        .fill({ color: 0xa579e6, alpha: p.alpha * 0.8 });
      this.ink
        .ellipse(p.contactX - width * 0.1, y - 1, width * 0.18, 1)
        .fill({ color: 0xf1d5ff, alpha: p.alpha });
    }
    if (!this.reduced && p.groundAge < 0.26) {
      for (let j = 0; j < 3; j++) {
        const a = p.groundAge;
        const vx = (j - 1) * (20 + p.radius * 7);
        const vy = -42 - p.radius * 5;
        this.liquid(
          p.contactX + vx * a,
          GROUND_Y - 3 + vy * a + 300 * a * a,
          p.radius * 0.34,
          0.75,
          Math.atan2(vy + 600 * a, vx) - Math.PI / 2,
          (1 - a / 0.26) * p.alpha,
        );
      }
    }
  }
  smear(x: number, y: number, width: number, height: number) {
    if (!this.gentle)
      this.sprite('splat', x, y, width, height, 0, 0.94, true, true);
  }
  private material(cue: CarnageCue, index: number, age: number) {
    if (this.materialCount >= 64) return;
    if (index % 4 || !['farm', 'office', 'afterlife'].includes(cue.world))
      return;
    const p = sprayPose(cue, index, age, 419);
    if (!p || p.landed || p.x + 20 < this.left || p.x - 20 > this.right) return;
    this.materialCount++;
    const angle = this.reduced ? -0.4 : p.spin * 0.7;
    const cs = Math.cos(angle),
      sn = Math.sin(angle),
      g = this.ink;
    if (cue.world === 'afterlife') {
      this.sprite('ghost', p.x, p.y, 22, 28, 0, p.alpha * 0.6);
      return;
    }
    g.save().setTransform(cs, sn, -sn, cs, p.x, p.y);
    if (cue.world === 'farm') {
      g.moveTo(-8, 0)
        .lineTo(8, 0)
        .stroke({ color: 0x96632f, width: 3, alpha: p.alpha });
      g.moveTo(-8, -0.7)
        .lineTo(7, -0.7)
        .stroke({ color: 0xfbe499, width: 1.4, alpha: p.alpha });
      g.moveTo(-3, -3)
        .lineTo(-1, 0)
        .lineTo(-3, 3)
        .stroke({ color: 0xe7bf63, width: 1.5, alpha: p.alpha });
    } else {
      g.poly([-8, -5, 5, -5, 9, 0, 7, 6, -8, 4])
        .fill({ color: 0xffedbf, alpha: p.alpha })
        .stroke({ color: 0x846870, width: 0.8, alpha: p.alpha });
      g.moveTo(-5, -2)
        .lineTo(3, -2)
        .moveTo(-5, 1)
        .lineTo(5, 1)
        .stroke({
          color: this.gentle ? 0xb77ae4 : 0xb82148,
          width: 1,
          alpha: p.alpha,
        });
    }
    g.restore();
  }
  end() {
    for (let i = this.airborne; i < this.drops.length; i++)
      this.drops[i].visible = false;
    for (let i = this.grounded; i < this.splats.length; i++)
      this.splats[i].visible = false;
  }
  reset() {
    this.airborne = this.grounded = 0;
    this.ink.clear();
    this.end();
  }
  stats() {
    return {
      airborne: this.airborne,
      grounded: this.grounded,
      airCap: this.drops.length,
      groundCap: this.splats.length,
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.air.destroy({ children: true });
    this.ground.destroy({ children: true });
  }
}
