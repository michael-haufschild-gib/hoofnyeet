import {
  Container,
  Graphics,
  Sprite,
  Text,
  type Texture,
  type Renderer,
} from 'pixi.js';
import {
  combinationAge,
  COMBINATION_LIFE,
  type CombinationCue,
} from '../../catalogue/combinations';
import type { GameState } from '../../simulation';
import type { BodyPose } from '../../crash';
import { noise } from '../../catalogue/escalation';

const INK = 0x462d45,
  MINT = 0xa7ffc1,
  GOLD = 0xffdc72;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
/** Stand-ins the gentle setting swaps in for the anatomical art. */
const GENTLE_SUBSTITUTE: Record<string, string> = {
  jam: 'donut',
  skeleton: 'ghost',
  eye: 'helmet',
};

/** Picks the illustration actually drawn while the gentle setting is on. Every
 * skeletal limb collapses to one plain leg; anything unlisted is drawn as-is. */
function gentleKey(key: string): string {
  if (key.startsWith('skeletal-')) return 'straightLeg';
  return GENTLE_SUBSTITUTE[key] ?? key;
}

/** Recorded interaction theatre, with a fixed 40-sprite pool. Every little
 * spectator/rocket/conductor is a sampled pose, never another physical body. */
export class CombinationShow {
  readonly view = new Container({ label: 'equipment-combination-show' });
  private ink = new Graphics({ label: 'combination-anatomy-and-electricity' });
  private sprites: Sprite[] = [];
  private awards: Text[] = [];
  private used = 0;
  private awardUsed = 0;
  private gentle = false;
  private prepared = false;
  constructor(private textures: Record<string, Texture>) {
    for (let i = 0; i < 40; i++) {
      const sprite = new Sprite({ anchor: 0.5, visible: false });
      this.sprites.push(sprite);
      this.view.addChild(sprite);
    }
    this.view.addChild(this.ink);
    for (let i = 0; i < 2; i++) {
      const label = new Text({
        text: '+1',
        anchor: 0.5,
        style: {
          fontFamily: 'Lilita One',
          fontSize: 27,
          fill: '#fff6c9',
          stroke: { color: '#462d45', width: 5 },
        },
      });
      label.visible = false;
      this.awards.push(label);
      this.view.addChild(label);
    }
  }
  private art(
    key: string,
    x: number,
    y: number,
    width: number,
    angle: number,
    alpha: number,
    tint = 0xffffff,
  ) {
    const name = this.gentle ? gentleKey(key) : key;
    const texture = this.textures[name],
      p = this.sprites[this.used];
    if (!texture || !p) return;
    this.used++;
    p.texture = texture;
    p.label = `combination-${name}`;
    p.position.set(x, y);
    p.scale.set(width / texture.width);
    p.rotation = angle;
    p.alpha = alpha;
    p.tint = tint;
    p.visible = true;
  }
  private heart(x: number, y: number, scale: number, alpha: number) {
    const g = this.ink,
      red = this.gentle ? 0xbc91f2 : 0xee4b77;
    g.moveTo(x, y + scale * 0.8)
      .bezierCurveTo(
        x - scale * 1.5,
        y - scale * 0.05,
        x - scale,
        y - scale * 1.1,
        x,
        y - scale * 0.45,
      )
      .bezierCurveTo(
        x + scale,
        y - scale * 1.1,
        x + scale * 1.5,
        y - scale * 0.05,
        x,
        y + scale * 0.8,
      )
      .fill({ color: red, alpha })
      .stroke({ color: INK, width: 2, alpha });
    g.circle(x - scale * 0.3, y - scale * 0.23, scale * 0.12).fill({
      color: 0xffd7cc,
      alpha,
    });
  }
  private reward(
    x: number,
    y: number,
    age: number,
    alpha: number,
    flap: boolean,
  ) {
    const p = this.awards[this.awardUsed++];
    if (!p) return;
    p.position.set(x + 23, y - 95 - Math.min(1, age) * 20);
    p.alpha = alpha;
    p.scale.set(0.85 + Math.sin(Math.min(1, age * 3) * Math.PI) * 0.14);
    p.visible = true;
    this.art(
      flap ? 'wing-right' : 'straightLeg',
      x - 8,
      p.y + 1,
      30,
      flap ? -0.4 : -0.7,
      alpha,
    );
  }
  reset() {
    this.ink.clear();
    for (const p of this.sprites) p.visible = false;
    for (const p of this.awards) p.visible = false;
    this.used = this.awardUsed = 0;
  }
  prepare(renderer: Renderer) {
    if (this.prepared) return;
    for (const p of this.awards) {
      const visible = p.visible;
      try {
        p.visible = true;
        renderer.generateTexture(p).destroy(true);
      } finally {
        p.visible = visible;
      }
    }
    this.prepared = true;
  }
  restoreGraphics() {
    for (const p of this.awards) p.unload();
  }
  update(
    s: GameState,
    time: number,
    gentle: boolean,
    reduced: boolean,
    density: number,
  ) {
    this.reset();
    this.gentle = gentle;
    for (const cue of s.combinations ?? [])
      this.draw(cue, time, s.wreck?.bodies ?? [], reduced, density);
    for (const cue of s.wreck?.combinations ?? [])
      this.draw(cue, s.wreck!.time, s.wreck!.bodies, reduced, density);
  }
  /** A gas-propelled intestinal coil visibly unspools behind the wreck. It is
   * traced twice so the dark outline sits under the coloured stroke. */
  private gasCoil(x: number, y: number, beat: number) {
    const g = this.ink;
    g.moveTo(x - 10, y + 8);
    for (let i = 1; i <= 10; i++)
      g.lineTo(
        x - 10 - i * 8,
        y + 8 + Math.sin(i * 2.4 - beat * 15) * (this.gentle ? 9 : 14),
      );
    return g;
  }
  private gasSpring(
    x: number,
    y: number,
    alpha: number,
    beat: number,
    reduced: boolean,
    density: number,
    red: number,
  ) {
    const count = reduced ? 2 : Math.ceil(7 * density);
    for (let i = count - 1; i >= 0; i--) {
      const pulse = reduced ? 0.5 : (beat * 2.5 + i / count) % 1;
      const px = x - 25 - pulse * 240,
        py = y + Math.sin(i * 2.1) * (8 + pulse * 20);
      this.art(
        'bean-propulsion-cloud',
        px,
        py,
        45 + pulse * 100,
        Math.sin(i) * 0.2,
        alpha * (1 - pulse) * 0.75,
        i % 2 ? 0xdcff86 : 0xffd789,
      );
      if (!reduced)
        this.art(
          'bone',
          px - 16,
          py + 13,
          20,
          beat * 9 + i,
          alpha * (1 - pulse),
        );
    }
    this.gasCoil(x, y, beat).stroke({ color: INK, width: 9, alpha });
    this.gasCoil(x, y, beat).stroke({ color: red, width: 5, alpha });
    this.art('jam', x - 102, y + 12, 33, beat * 5, alpha);
  }
  /** One jagged discharge from the eye to its victim, re-traced per stroke. */
  private bolt(
    x: number,
    y: number,
    tx: number,
    ty: number,
    beat: number,
    reduced: boolean,
  ) {
    const g = this.ink;
    g.moveTo(x, y);
    for (let i = 1; i <= 9; i++) {
      const t = i / 9;
      const jitter =
        Math.sin(t * Math.PI) *
        (reduced ? 4 : Math.sin(i * 14 + Math.floor(beat * 18)) * 21);
      g.lineTo(x + (tx - x) * t, y + (ty - y) * t + jitter);
    }
    return g;
  }
  private retinaZap(
    cue: CombinationCue,
    target: BodyPose | undefined,
    x: number,
    y: number,
    age: number,
    alpha: number,
    beat: number,
    reduced: boolean,
  ) {
    const g = this.ink;
    const tx = target?.x ?? cue.targetX ?? cue.x + 110,
      ty = target?.y ?? cue.targetY ?? cue.y;
    const energy = reduced ? 0.4 : Math.max(0, 1 - age / 1.2);
    g.circle(x, y, 20 + Math.sin(beat * 18) * 3).stroke({
      color: INK,
      width: 7,
      alpha,
    });
    g.circle(x, y, 20 + Math.sin(beat * 18) * 3).stroke({
      color: MINT,
      width: 3,
      alpha,
    });
    const power = alpha * energy;
    this.bolt(x, y, tx, ty, beat, reduced).stroke({
      color: INK,
      width: 8,
      alpha: power,
    });
    this.bolt(x, y, tx, ty, beat, reduced).stroke({
      color: GOLD,
      width: 4,
      alpha: power,
    });
    this.bolt(x, y, tx, ty, beat, reduced).stroke({
      color: 0xf0fff4,
      width: 1.5,
      alpha: power,
    });
    // The eye briefly sees its own X-ray, then its pupil falls out as a tooth.
    this.art(
      'skeleton',
      x,
      y - 37 - age * 19,
      37,
      Math.sin(beat * 11) * 0.1,
      alpha * 0.8,
      MINT,
    );
    if (age > 0.8)
      this.art(
        'bone',
        x + (age - 0.8) * 30,
        y - 10 + (age - 0.8) ** 2 * 70,
        17,
        beat * 6,
        alpha,
      );
  }
  private hauntedEncore(
    body: BodyPose | undefined,
    x: number,
    y: number,
    age: number,
    alpha: number,
    beat: number,
  ) {
    const rise = clamp(age * 2),
      bob = Math.sin(beat * 8) * 5;
    this.art(
      'ghost',
      x,
      y - 70 * rise + bob,
      85,
      Math.sin(beat * 3) * 0.1,
      alpha * 0.8,
      MINT,
    );
    // A rib keyboard stays rooted in the actual piano, even when it tips.
    const angle = body?.angle ?? 0;
    for (let i = 0; i < 7; i++) {
      const dx = (i - 3) * 12,
        dy = -17;
      const kx = x + Math.cos(angle) * dx - Math.sin(angle) * dy;
      const ky = y + Math.sin(angle) * dx + Math.cos(angle) * dy;
      this.art('bone', kx, ky, 23, angle + Math.PI / 2, alpha);
    }
    for (let side = -1; side <= 1; side += 2) {
      this.art(
        'skeletal-front-leg-straight',
        x + side * 46,
        y - 45 + Math.sin(beat * 17 + side) * 13,
        32,
        side * 1.0,
        alpha,
      );
    }
    this.heart(x + 66, y - 50 - age * 35, 13, alpha);
    this.reward(x, y - 20, age, alpha, false);
  }
  /** The rising hearts the applause throws off, seeded per cue so two crashes
   * never scatter them the same way. */
  private applauseHearts(
    cue: CombinationCue,
    x: number,
    y: number,
    age: number,
    alpha: number,
    reduced: boolean,
    density: number,
  ) {
    for (let i = 0; i < (reduced ? 2 : Math.ceil(7 * density)); i++) {
      const sign = i % 2 ? 1 : -1;
      const px = x + sign * (25 + age * (35 + noise(cue.seed, i) * 40));
      const py = y - 50 - age * (45 + i * 7) + age * age * 35;
      this.heart(px, py, 5 + (i % 3) * 2, alpha);
    }
  }
  private organApplause(
    cue: CombinationCue,
    x: number,
    y: number,
    age: number,
    alpha: number,
    beat: number,
    reduced: boolean,
    density: number,
  ) {
    const g = this.ink;
    const pairs = reduced ? 1 : Math.max(2, Math.ceil(3 * density));
    for (let i = 0; i < pairs; i++) {
      const angle = -Math.PI + (i / Math.max(1, pairs - 1)) * Math.PI;
      const spread = 82 + clamp(age * 4) * 28;
      const px = x + Math.cos(angle) * spread,
        py = y + Math.sin(angle) * 76 + 12;
      const clap = reduced ? 0.5 : 0.5 + Math.sin(beat * 22 - i * 2) * 0.5;
      for (let side = -1; side <= 1; side += 2)
        this.art(
          'skeletal-front-leg-straight',
          px + side * (8 + clap * 12),
          py,
          32,
          side * (0.4 + clap * 0.4),
          alpha,
        );
      this.art('eye', px, py - 27, 22, 0, alpha);
      if (clap < 0.12) g.star(px, py + 13, 5, 17).fill({ color: GOLD, alpha });
    }
    this.applauseHearts(cue, x, y, age, alpha, reduced, density);
    this.reward(x, y, age, alpha, true);
  }
  private draw(
    cue: CombinationCue,
    time: number,
    bodies: BodyPose[],
    reduced: boolean,
    density: number,
  ) {
    const age = combinationAge(cue, time);
    if (age === null) return;
    const life = COMBINATION_LIFE[cue.kind];
    const alpha = Math.min(1, age * 15) * Math.min(1, (life - age) * 3);
    const body = bodies.find((b) => b.id === cue.bodyId),
      target = bodies.find((b) => b.id === cue.targetId);
    const x = body?.x ?? cue.x + cue.vx * age * 0.75;
    const y = body?.y ?? cue.y + cue.vy * age * 0.25;
    const beat = reduced ? 0 : age;
    const red = this.gentle ? 0xb797f1 : 0xdd3764;
    switch (cue.kind) {
      case 'gas-spring':
        this.gasSpring(x, y, alpha, beat, reduced, density, red);
        break;
      case 'retina-zap':
        this.retinaZap(cue, target, x, y, age, alpha, beat, reduced);
        break;
      case 'haunted-encore':
        this.hauntedEncore(body, x, y, age, alpha, beat);
        break;
      case 'organ-applause':
        this.organApplause(cue, x, y, age, alpha, beat, reduced, density);
        break;
    }
  }
}
