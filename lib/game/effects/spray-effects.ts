import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { GROUND_Y } from '../art/geometry';
import { noise, type CarnageCue } from '../catalogue/escalation';
import {
  SPRAY_AIR_CAP,
  SPRAY_GROUND_CAP,
  sprayMaterial,
  sprayPose,
  type SprayTarget,
} from './motion/spray-motion';

type SprayPose = NonNullable<ReturnType<typeof sprayPose>>;

/** Anatomy candy mode replaces with cheese, so nothing reads as a body part. */
const GORE_KEYS = ['eye', 'bone', 'tooth'];
/** Only these sets carry loose material worth painting between the samples. */
const MATERIAL_WORLDS = ['farm', 'office', 'afterlife'];

/**
 * Sizes a pooled sprite to at most `w`x`h` pixels. The default preserves the
 * artwork's aspect inside that box; `stretch` fills it exactly, which is what
 * a smeared splat and an elongated droplet need. Writes the sprite's scale in
 * place rather than returning a value, so a full frame allocates nothing.
 */
function fitSprite(
  p: Sprite,
  texture: Texture,
  w: number,
  h: number,
  stretch: boolean,
) {
  const scale = Math.min(w / texture.width, h / texture.height);
  p.scale.set(
    stretch ? w / texture.width : scale,
    stretch ? h / texture.height : scale,
  );
}

/** Radians of tilt for a tooth: airborne it keeps tumbling, and once it has
 * settled it eases level over its first second. Reduced motion never spins. */
function toothSpin(p: SprayPose, reduced: boolean) {
  if (reduced) return 0;
  return p.landed ? 0.3 * Math.max(0, 1 - p.groundAge) : p.spin;
}

/** A straw stalk with its split tip, drawn in the caller's rotated frame. */
function drawStraw(g: Graphics, alpha: number) {
  g.moveTo(-8, 0).lineTo(8, 0).stroke({ color: 0x96632f, width: 3, alpha });
  g.moveTo(-8, -0.7)
    .lineTo(7, -0.7)
    .stroke({ color: 0xfbe499, width: 1.4, alpha });
  g.moveTo(-3, -3)
    .lineTo(-1, 0)
    .lineTo(-3, 3)
    .stroke({ color: 0xe7bf63, width: 1.5, alpha });
}

/** A torn memo with two lines of ruined text, in the caller's rotated frame.
 * Candy mode inks the text violet so the page never reads as blood-spotted. */
function drawPaper(g: Graphics, alpha: number, gentle: boolean) {
  g.poly([-8, -5, 5, -5, 9, 0, 7, 6, -8, 4])
    .fill({ color: 0xffedbf, alpha })
    .stroke({ color: 0x846870, width: 0.8, alpha });
  g.moveTo(-5, -2)
    .lineTo(3, -2)
    .moveTo(-5, 1)
    .lineTo(5, 1)
    .stroke({
      color: gentle ? 0xb77ae4 : 0xb82148,
      width: 1,
      alpha,
    });
}

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
  /** True when the mark falls entirely outside the drawn span or is clear. */
  private offstage(x: number, w: number, alpha: number) {
    return x + w < this.left || x - w > this.right || alpha <= 0;
  }

  /** Hands out the next unused sprite of the airborne or settled pool and
   * advances that pool's cursor, or nothing once the contact has filled it. */
  private claim(ground: boolean) {
    const pool = ground ? this.splats : this.drops;
    const used = ground ? this.grounded : this.airborne;
    if (used >= pool.length) return;
    if (ground) this.grounded++;
    else this.airborne++;
    return pool[used];
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
    if (this.offstage(x, w, alpha)) return;
    if (this.gentle && GORE_KEYS.includes(key)) key = 'cheese';
    const texture = this.textures[key];
    if (!texture) return;
    const p = this.claim(ground);
    if (!p) return;
    p.texture = texture;
    p.label = `spray-${key}`;
    p.anchor.set(0.5, key === 'droplet' ? 0.77 : 0.5);
    fitSprite(p, texture, w, h, stretch);
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
    for (let i = 0; i < count; i++) this.piece(cue, i, age, magnet);
    // Actual gold-filled teeth, in addition to every original eye and bone.
    const teeth = Math.ceil((this.reduced ? 1 : 3) * this.density * cue.power);
    for (let i = 0; i < teeth; i++) this.goldTooth(cue, i, age, magnet);
  }

  /** One sample of the main fan, plus whatever loose material rides with it.
   * Samples whose pose has expired paint nothing at all, material included. */
  private piece(
    cue: CarnageCue,
    index: number,
    age: number,
    magnet?: SprayTarget,
  ) {
    const material = sprayMaterial(index);
    const p = sprayPose(
      cue,
      index,
      age,
      0,
      material === 'bone' ? magnet : undefined,
    );
    if (!p) return;
    if (material === 'droplet') this.dropletPiece(cue, index, p);
    else if (!p.landed) this.solidPiece(material, p, magnet);
    this.material(cue, index, age);
  }

  /** Liquid streaks while airborne; every third one stains where it lands. */
  private dropletPiece(cue: CarnageCue, index: number, p: SprayPose) {
    if (!p.landed) this.liquid(p.x, p.y, p.radius, p.stretch, p.angle, p.alpha);
    else if (index % 3 === 1) this.splat(cue, index, p);
  }

  /** An airborne eye or bone, with the tether drawn while a magnet pulls it. */
  private solidPiece(
    material: 'bone' | 'eye',
    p: SprayPose,
    magnet?: SprayTarget,
  ) {
    const bone = material === 'bone';
    this.sprite(
      material,
      p.x,
      p.y,
      bone ? 26 : 18,
      bone ? 14 : 18,
      this.reduced ? 0 : p.spin,
      p.alpha,
    );
    if (p.magnetic && magnet && !this.reduced)
      this.ink
        .moveTo(p.x, p.y)
        .lineTo(magnet.x, magnet.y)
        .stroke({ color: 0x72f5e3, width: 1.2, alpha: p.alpha * 0.3 });
  }

  /** One tooth from the separate seeded fan. It hops on the track for its
   * first second after contact and is dropped once it has lain there 2.5 s. */
  private goldTooth(
    cue: CarnageCue,
    index: number,
    age: number,
    magnet?: SprayTarget,
  ) {
    const p = sprayPose(cue, index, age, 733, magnet);
    if (!p || (p.landed && p.groundAge > 2.5)) return;
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
      toothSpin(p, this.reduced),
      p.alpha,
    );
    if (p.magnetic && magnet && !this.reduced)
      this.ink
        .moveTo(p.x, p.y)
        .lineTo(magnet.x, magnet.y)
        .stroke({ color: 0x72f5e3, width: 1.5, alpha: p.alpha * 0.45 });
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
    if (index % 4 || !MATERIAL_WORLDS.includes(cue.world)) return;
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
    if (cue.world === 'farm') drawStraw(g, p.alpha);
    else drawPaper(g, p.alpha, this.gentle);
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
