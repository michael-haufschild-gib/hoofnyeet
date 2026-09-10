import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { GROUND_Y } from '../../art/geometry';

/** Outline stroke shared by every illustrated carnage prop. */
export const INK = 0x502638;
/** Full-strength blood, used whenever the squeamish palette is off. */
export const RED = 0xbd1742;
/** Lighter blood, painted as the highlight along a strand of tissue. */
export const PINK = 0xf67687;
/** Bone, tooth and paper ivory. */
export const CREAM = 0xffedbf;

/** Folds any real number into the closed 0..1 range. */
export const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Smoothstep over 0..1, so a beat opens and closes without a linear edge. */
export const ease = (n: number) => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};

/** Organs and viscera become confectionery under the squeamish palette. */
const GENTLE_PROPS: Record<string, string> = {
  skin: 'torso',
  heart: 'pastry',
  brain: 'donut',
  sausage: 'cube',
  bouquet: 'crown',
};

/** Skeletal art that has no confectionery twin and becomes dairy instead. */
const GENTLE_BONES = new Set([
  'bone',
  'jam',
  'eye',
  'skeleton',
  'tooth',
  'droplet',
]);

/**
 * Substitute art key for the squeamish palette. Anything skeletal turns into a
 * limb or wedge of cheese; the listed organs turn into baking. An unlisted key
 * comes back unchanged, so the caller can always index the texture table.
 */
function gentleKey(key: string): string {
  if (key.startsWith('skeletal') || GENTLE_BONES.has(key))
    return key.includes('leg') ? 'straightLeg' : 'cheese';
  return GENTLE_PROPS[key] ?? key;
}

/**
 * The drawing kit every carnage tableau shares: one fixed sprite pool, one
 * canvas layer for line work and a second for stretched tissue.
 *
 * `left` and `right` are world-x culling bounds, `time` is wreck seconds, and
 * `gentle` and `reduced` select the squeamish palette and the still-frame
 * variants. The owner assigns those five fields once per frame, before any
 * drawing, and calls `rewind` so the pool hands out sprites from the start.
 */
export class CarnageBrush {
  readonly actors = new Container({ label: 'carnage-sprite-pool' });
  readonly tissue = new Graphics({ label: 'elastic-anatomy' });
  readonly drawings = new Graphics({ label: 'animated-mouths-and-machinery' });
  readonly pool: Sprite[] = [];
  gentle = false;
  reduced = false;
  time = 0;
  left = -Infinity;
  right = Infinity;
  private used = 0;
  private toothCrown?: Texture;
  constructor(private textures: Record<string, Texture>) {
    for (let i = 0; i < 192; i++) {
      const sprite = new Sprite({ visible: false, anchor: 0.5 });
      this.actors.addChild(sprite);
      this.pool.push(sprite);
    }
  }
  /** Sprites handed out since the last rewind. */
  get visible() {
    return this.used;
  }
  /** Blood, swapped for grape juice under the squeamish palette. */
  get red() {
    return this.gentle ? 0xa472e5 : RED;
  }
  /** Tissue highlight, swapped for candy under the squeamish palette. */
  get pink() {
    return this.gentle ? 0xf2b5ff : PINK;
  }
  /** Frees the whole pool for reuse without touching the canvas layers. */
  rewind() {
    this.used = 0;
  }
  /** Empties both canvas layers, leaving the pool as it stands. */
  clear() {
    this.tissue.clear();
    this.drawings.clear();
  }
  /** Hides whatever the frame just built did not claim. */
  hideUnused() {
    for (let i = this.used; i < this.pool.length; i++)
      this.pool[i].visible = false;
  }
  /** Hides the whole pool and frees it, for a hard reset between runs. */
  releaseAll() {
    for (const p of this.pool) p.visible = false;
    this.used = 0;
  }
  /** Frees the one derived texture this kit owns. */
  dispose() {
    this.toothCrown?.destroy();
  }
  /**
   * Claims one pooled sprite for an authored art key, scaled to fit `w`x`h`
   * world units and centred on `x`,`y` with `angle` in radians. Returns
   * nothing when the request lies outside the culling bounds, the pool is
   * exhausted, or the key has no texture.
   */
  art(
    key: string,
    x: number,
    y: number,
    w: number,
    h = w,
    angle = 0,
    alpha = 1,
    tint = 0xffffff,
  ): Sprite | undefined {
    if (
      x + w < this.left ||
      x - w > this.right ||
      this.used === this.pool.length
    )
      return;
    if (this.gentle) key = gentleKey(key);
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
  /**
   * A slack strand of tissue from `x`,`y` to `xx`,`yy`, drawn as outline, body
   * and highlight. `sag` is how far the middle drops in world units, `age`
   * seconds drives the travelling wave, and both ends are held above ground.
   */
  ribbon(
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
  /**
   * A beating heart of `size` world units centred on `x`,`y` and turned by
   * `angle` radians, kept clear of the ground. `t` seconds drives the pulse,
   * which the reduced-motion variant holds still.
   */
  organ(x: number, y: number, size: number, t: number, angle = 0) {
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
  /**
   * A chewing mouth centred on `x`,`y`, `w` wide and `h` tall at full gape.
   * `open` scales that gape over 0..1, `t` seconds drives the tongue and
   * drool, and `angle` radians turns the whole mouth about its centre.
   */
  mouth(
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    open = 1,
    angle = 0,
  ) {
    this.growToothCrown();
    const g = this.localDrawing(x, y, angle),
      height = Math.max(8, h * open);
    this.cavity(g, w, height, t);
    this.teeth(g, w, height, x, y, angle);
    this.drool(g, w, height, t);
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
  /**
   * A pair of eyes `size` world units across, centred on `x`,`y` and turned by
   * `angle` radians. `t` seconds drifts the pupils; `angry` adds brows.
   */
  eyes(
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
  /**
   * Opens a local frame on the line-work layer at `x`,`y` rotated by `angle`
   * and scaled by `sx`,`sy`. The caller draws in that frame and must call
   * `restore` on the returned canvas.
   */
  localDrawing(x: number, y: number, angle: number, sx = 1, sy = sx) {
    const c = Math.cos(angle),
      s = Math.sin(angle);
    // Pixi's rotateTransform pre-multiplies translation. Set the full local-to-
    // world matrix so a jaw turns at its socket, never around the world's origin.
    return this.drawings
      .save()
      .setTransform(c * sx, s * sx, -s * sy, c * sy, x, y);
  }
  /** Crops the upper 57% of the tooth art once, for enamel over each spike. */
  private growToothCrown() {
    const tooth = this.textures.tooth;
    if (!tooth || this.toothCrown) return;
    this.toothCrown = new Texture({
      source: tooth.source,
      frame: new Rectangle(0, 0, tooth.width, Math.floor(tooth.height * 0.57)),
    });
  }
  /** Lips, throat and tongue, drawn in the mouth's own local frame. */
  private cavity(g: Graphics, w: number, height: number, t: number) {
    g.ellipse(0, 0, w / 2 + 5, height / 2 + 5)
      .fill(this.pink)
      .stroke({ color: INK, width: 4 });
    g.ellipse(0, 2, w / 2 + 1, height / 2 + 2).stroke({
      color: this.red,
      width: 5,
    });
    g.ellipse(0, 0, w / 2, height / 2).fill(0x451329);
    g.ellipse(0, height * 0.07, w * 0.43, height * 0.34).fill(0x602037);
    g.ellipse(
      this.reduced ? 0 : Math.sin(t * 4) * w * 0.06,
      height * 0.23,
      w * 0.27,
      height * 0.18,
    ).fill(this.red);
  }
  /**
   * Seven spikes on each jaw, following the lip's curve. `rootX`, `rootY` and
   * `angle` describe the mouth's world placement, which the enamel needs
   * because it sets its own absolute transform rather than nesting.
   */
  private teeth(
    g: Graphics,
    w: number,
    height: number,
    rootX: number,
    rootY: number,
    angle: number,
  ) {
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    const length = Math.min(height * 0.31, w * 0.16);
    for (let i = 0; i < 7; i++) {
      const xx = -w * 0.39 + (i / 6) * w * 0.78;
      const rim = Math.sqrt(Math.max(0, 1 - (xx / (w * 0.5)) ** 2));
      for (const side of [-1, 1]) {
        const yy = side * height * 0.46 * rim;
        g.poly([xx - w * 0.055, yy, xx + w * 0.055, yy, xx, yy - side * length])
          .fill(CREAM)
          .stroke({ color: INK, width: 1.4 });
        if (this.toothCrown && !this.gentle && w > 38) {
          const cy = yy - side * length * 0.44;
          // side is -1 or 1, so (1 - side) / 2 turns the lower row upside down.
          const turn = angle + Math.PI * ((1 - side) / 2);
          const cs = Math.cos(turn),
            sn = Math.sin(turn);
          g.save().setTransform(
            cs,
            sn,
            -sn,
            cs,
            rootX + cos * xx - sin * cy,
            rootY + sin * xx + cos * cy,
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
  }
  /** Three strings of spit below the lower lip, absent on the gentle palette. */
  private drool(g: Graphics, w: number, height: number, t: number) {
    if (this.gentle) return;
    for (let i = 0; i < 3; i++)
      g.ellipse(
        (i - 1) * w * 0.22,
        height * 0.43 + 6 + i * 3,
        3.5,
        10 + (this.reduced ? 0 : Math.sin(t * 5 + i) * 3),
      ).fill(this.red);
  }
}
