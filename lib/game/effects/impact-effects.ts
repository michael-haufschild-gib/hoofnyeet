import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import { comicBurst } from './comic-burst';
import { ImpactLens } from './impact-lens';
import { portalVortex } from './portal-vortex';
import { NuclearEffects } from './nuclear';
import { eventSceneTime, impactMote, type MoteMotion } from './impact-motion';
import { hashSeed, random } from '../content';
import type { GameEvent, GameState } from '../simulation';
interface Mote extends MoteMotion {
  sprite: Sprite;
}
interface Burst {
  sprite: Sprite;
  filter: ReturnType<typeof comicBurst>;
  age: number;
  born: number;
  life: number;
  label: Text;
  labelY: number;
}
// Short burst/shard and sparkle-tail curves adapted from Slot's pixi-runtime
// particle presets. One manually advanced clock, no ticker or asynchronous replay.
export class ImpactEffects {
  density = 1;
  container = new Container();
  backdrop = new Container();
  readonly lens = new ImpactLens();
  readonly nuclear: NuclearEffects;
  private front = new Container();
  private motes: Mote[] = [];
  private bursts: Burst[] = [];
  private textures: Texture[] = [];
  private lastBurst = -Infinity;
  private lastExplosion = -Infinity;
  private elapsed = 0;
  private shakeBorn = -Infinity;
  private shakePower = 0;
  private seen = new Set<string>();
  private flightTrail: Sprite[] = [];
  private waves = new Graphics();
  private portal = new Sprite({
    texture: Texture.WHITE,
    anchor: 0.5,
    label: 'ability-vortex',
  });
  private portalFilter = portalVortex();
  constructor(app: Application, artwork: Record<string, Texture>) {
    this.nuclear = new NuclearEffects(artwork);
    this.backdrop.addChild(this.nuclear.view);
    this.container.addChild(
      this.waves,
      this.portal,
      this.front,
      this.nuclear.foreground,
    );
    this.portal.filters = [this.portalFilter];
    this.portal.visible = false;
    this.textures = this.createTextures(app);
    for (let i = 0; i < 12; i++) {
      const sprite = new Sprite({
        texture: this.textures[1],
        anchor: 0.5,
        label: 'flight-spark',
      });
      sprite.tint = 0xffe798;
      sprite.visible = false;
      this.front.addChild(sprite);
      this.flightTrail.push(sprite);
    }
    for (let i = 0; i < 3; i++) {
      const sprite = new Sprite(Texture.WHITE),
        filter = comicBurst();
      sprite.anchor.set(0.5);
      sprite.width = sprite.height = 300;
      sprite.filters = [filter];
      sprite.visible = false;
      const label = new Text({
        text: '',
        style: {
          fontFamily: 'Lilita One',
          fontSize: 36,
          fill: '#fff8d3',
          stroke: { color: '#283f37', width: 7 },
          dropShadow: {
            color: '#2a242a',
            alpha: 0.35,
            blur: 0,
            angle: 1.2,
            distance: 5,
          },
        },
      });
      label.anchor.set(0.5);
      label.visible = false;
      this.backdrop.addChild(sprite);
      this.front.addChild(label);
      this.bursts.push({
        sprite,
        filter,
        label,
        age: 10,
        born: -Infinity,
        life: 0.65,
        labelY: 0,
      });
    }
  }
  private createTextures(app: Application) {
    return [
      new Graphics().circle(16, 16, 15).fill(0xffffff),
      new Graphics().star(16, 16, 4, 15, 4).fill(0xffffff),
      new Graphics().poly([0, 0, 19, 4, 7, 17]).fill(0xffffff),
    ].map((shape) => {
      const texture = app.renderer.generateTexture(shape);
      shape.destroy();
      return texture;
    });
  }

  /** Keep the recorded event history, living debris and burst clocks intact.
   * Only GPU-generated textures and released caption rasters need rebuilding. */
  restoreGraphics(app: Application) {
    const previous = this.textures;
    this.textures = this.createTextures(app);
    for (const sprite of [
      ...this.flightTrail,
      ...this.motes.map((m) => m.sprite),
    ]) {
      const index = previous.indexOf(sprite.texture);
      if (index >= 0) sprite.texture = this.textures[index];
    }
    for (const texture of previous) texture.destroy(true);
    for (const burst of this.bursts) burst.label.unload();
    this.nuclear.prepare(app.renderer, true);
  }

  private mote(
    x: number,
    y: number,
    rng: () => number,
    kind: 'dust' | 'shard' | 'star',
    color: number,
    reduced: boolean,
    born: number,
  ) {
    if (this.motes.length >= (reduced ? 60 : 260) * this.density) return;
    const dust = kind === 'dust',
      star = kind === 'star';
    const sprite = new Sprite(this.textures[dust ? 0 : star ? 1 : 2]);
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.tint = color;
    const a = rng() * Math.PI * 2,
      speed = dust ? 30 + rng() * 80 : 70 + rng() * 250;
    const size = dust
      ? 18 + rng() * 24
      : star
        ? 5 + rng() * 12
        : 4 + rng() * 13;
    sprite.rotation = rng() * 6.28;
    sprite.visible = false;
    this.front.addChild(sprite);
    this.motes.push({
      sprite,
      born,
      x,
      y,
      angle: sprite.rotation,
      life: dust ? 0.45 + rng() * 0.4 : 0.42 + rng() * 0.43,
      vx: Math.cos(a) * speed,
      vy: dust ? -25 - rng() * 70 : Math.sin(a) * speed - 60,
      gravity: dust ? -20 : star ? 30 : 320,
      size,
      grow: dust ? 2.7 : 0,
      spin: dust ? 0.3 : 4 + rng() * 9,
      opacity: dust ? 0.35 : 1,
    });
  }
  event(e: GameEvent, reduced: boolean, gentle: boolean) {
    if (e.id && this.seen.has(e.id)) return;
    if (e.id) {
      this.seen.add(e.id);
      if (this.seen.size > 1600)
        this.seen.delete(this.seen.values().next().value!);
    }
    const born = eventSceneTime(e, this.elapsed);
    // Capacity is evaluated at the contact tick, including when several ticks
    // arrive between renders. Slow rendering must not discard different debris.
    this.motes = this.motes.filter((m) => {
      if (born < m.born + m.life) return true;
      m.sprite.destroy();
      return false;
    });
    const sound = e.sound ?? e.kind,
      rng = random(hashSeed(e.id ?? `${sound}:${e.x}:${born}`));
    this.lens.event(e, this.elapsed);
    const impact = [
      'land',
      'bounce',
      'explosion',
      'boneclatter',
      'metalcrash',
      'woodbreak',
      'piano',
      'baler',
      'teethchomp',
    ].includes(sound);
    if (sound === 'tap' || sound === 'jump') {
      for (let i = 0; i < Math.ceil((reduced ? 1 : 4) * this.density); i++)
        this.mote(e.x - 35, e.y + 5, rng, 'dust', 0xffe3a9, reduced, born);
    } else if (
      (['ring', 'flap', 'flip', 'ghost'].includes(sound) && !e.propulsion) ||
      e.kind === 'glide'
    ) {
      for (let i = 0; i < Math.ceil((reduced ? 3 : 10) * this.density); i++)
        this.mote(
          e.x,
          e.y - 30,
          rng,
          'star',
          sound === 'ghost' ? 0x8dfbe0 : 0xffdf72,
          reduced,
          born,
        );
    }
    if (!impact) return;
    this.shakePower = Math.max(
      this.shakeAt(born),
      sound === 'explosion' ? 14 : 6,
    );
    this.shakeBorn = born;
    const big =
      sound === 'explosion' ||
      sound === 'bounce' ||
      sound === 'land' ||
      sound === 'boneclatter';
    for (
      let i = 0;
      i < Math.ceil((reduced ? 6 : big ? 42 : 16) * this.density);
      i++
    )
      this.mote(
        e.x,
        e.y,
        rng,
        i < 8 ? 'dust' : i % 4 === 0 ? 'star' : 'shard',
        [0xffdd65, 0xf2b278, gentle ? 0xff8dd9 : 0xe46a53, 0x83cfaa][i % 4],
        reduced,
        born,
      );
    // A landing or disassembly in the same frame must not swallow the blast.
    // Chain explosions still share a short visual cooldown to keep them legible.
    const last = sound === 'explosion' ? this.lastExplosion : this.lastBurst;
    if (born - last < (big ? 0.15 : 0.55) || reduced) return;
    if (sound === 'explosion') this.lastExplosion = born;
    this.lastBurst = born;
    const b = this.bursts.reduce((a, b) => (a.born < b.born ? a : b));
    b.born = born;
    b.age = 0;
    b.life = big ? 0.7 : 0.48;
    b.sprite.position.set(e.x, e.y - 20);
    b.sprite.width = b.sprite.height = big ? 370 : 240;
    b.sprite.visible = b.label.visible = true;
    b.label.text =
      (
        {
          explosion: 'KABLOOEY!',
          bounce: 'BOI-OI-OING!',
          land: 'OH, HAY NO.',
          boneclatter: 'SOME ASSEMBLY!',
          metalcrash: 'CLONK!',
          piano: 'B FLAT.',
          baler: 'BALED IT!',
          teethchomp: 'CHOMP!',
        } as Record<string, string>
      )[sound] ?? 'CRUNCH!';
    b.label.position.set(
      e.x,
      e.y - (sound === 'land' || sound === 'bounce' ? 175 : 100),
    );
    b.labelY = b.label.y;
    b.label.rotation = -0.12 + rng() * 0.2;
    b.label.style.fontSize = big ? 33 : 25;
  }
  shakeAt(time: number) {
    if (time < this.shakeBorn) return 0;
    return this.shakePower * Math.exp(-Math.max(0, time - this.shakeBorn) * 12);
  }
  update(
    time: number,
    s: GameState,
    reduced: boolean,
    world: Container,
    gentle = false,
  ) {
    this.elapsed = time;
    this.nuclear.update(
      s.wreck?.carnage?.cues ?? [],
      s.wreck?.time ?? 0,
      reduced,
      gentle,
      this.density,
    );
    this.lens.update(time, s, world, reduced, this.density);
    for (let i = 0; i < this.flightTrail.length; i++) {
      const p = this.flightTrail[i];
      const age = (time % 0.05) + i * 0.05;
      p.visible =
        s.phase === 'flight' &&
        !reduced &&
        !s.equipment.includes('beans') &&
        i < 12 * this.density;
      if (!p.visible) continue;
      p.position.set(
        s.x - 45 - s.vx * age * 0.7,
        s.y - 40 - s.vy * age * 0.5 + Math.sin(time * 9 - i) * 7,
      );
      p.rotation = time * 3 + i * 1.7;
      p.width = p.height = (7 + Math.sin(i * 3.7) * 3) * (1 - age);
      p.alpha = (1 - age / 0.6) * 0.75;
    }
    for (const b of this.bursts) {
      b.age = time - b.born;
      const p = b.age / b.life;
      b.sprite.visible = b.label.visible = p >= 0 && p < 1 && !reduced;
      if (!b.sprite.visible) continue;
      const u = b.filter.resources.burst.uniforms;
      u.uProgress = p;
      u.uTime = time;
      b.label.alpha = Math.min(1, (1 - p) * 4);
      b.label.scale.set(
        0.8 + Math.sin((Math.min(1, p * 4) * Math.PI) / 2) * 0.2,
      );
      b.label.y = b.labelY - b.age * 18;
    }
    for (const m of this.motes) {
      const pose = impactMote(m, time);
      m.sprite.visible = !!pose;
      if (pose) {
        m.sprite.position.set(pose.x, pose.y);
        m.sprite.rotation = pose.angle;
        m.sprite.alpha = pose.alpha;
        m.sprite.width = m.sprite.height = pose.size;
      } else if (time >= m.born + m.life) m.sprite.destroy();
    }
    this.motes = this.motes.filter((m) => !m.sprite.destroyed);
    this.waves.clear();
    const wreck = s.wreck;
    this.portal.visible = false;
    if (wreck && !wreck.abilityReady) {
      const age = wreck.abilityAge ?? 10,
        x = wreck.focusX,
        y = wreck.focusY;
      if (age >= 0 && age < 1.3 && ['blackhole', 'ghost'].includes(s.ability)) {
        this.portal.visible = true;
        this.portal.position.set(x, y);
        this.portal.width = this.portal.height =
          s.ability === 'blackhole' ? 330 : 245;
        const u = this.portalFilter.resources.portal.uniforms;
        u.uAge = reduced ? 0.5 : age;
        u.uTime = reduced ? 0 : age;
        u.uGhost = s.ability === 'ghost' ? 1 : 0;
        u.uOpacity =
          Math.min(1, age * 12) *
          Math.min(1, (1.3 - age) / 0.25) *
          (reduced ? 0.45 : 1);
      }
      if (age < 1.3 && !reduced) {
        if (s.ability === 'blackhole') {
          this.waves
            .circle(x, y, 50 * (1 + Math.sin(age * 30) * 0.06))
            .fill(0x182233)
            .circle(x, y, 60)
            .stroke({ color: 0xa7f6e8, width: 5 });
          for (let i = 0; i < 3; i++)
            this.waves
              .ellipse(x, y, 85 + i * 12, 22 + i * 9)
              .stroke({ color: 0xbf90eb, width: 2, alpha: 1 - age / 1.3 });
        } else {
          const color =
            s.ability === 'ghost'
              ? 0x85fadd
              : s.ability === 'dynamite'
                ? 0xff8c55
                : 0xffec98;
          for (let i = 0; i < 3; i++)
            this.waves.circle(x, y, Math.max(0, age - i * 0.1) * 260).stroke({
              color,
              width: Math.max(1, 8 - age * 5),
              alpha: Math.max(0, 1 - age),
            });
        }
      }
    }
  }
  reset() {
    this.elapsed = 0;
    this.shakeBorn = -Infinity;
    this.shakePower = 0;
    this.seen.clear();
    this.lens.reset();
    this.nuclear.reset();
    this.portal.visible = false;
    this.portalFilter.resources.portal.uniforms.uOpacity = 0;
    for (const p of this.flightTrail) p.visible = false;
    for (const m of this.motes) m.sprite.destroy();
    this.motes = [];
    for (const b of this.bursts) {
      b.age = 10;
      b.born = -Infinity;
      b.sprite.visible = b.label.visible = false;
    }
    this.lastBurst = -Infinity;
    this.lastExplosion = -Infinity;
    this.waves.clear();
  }
  dispose() {
    this.reset();
    this.lens.dispose();
    this.nuclear.dispose();
    this.portalFilter.destroy();
    for (const b of this.bursts) b.filter.destroy();
    for (const t of this.textures) t.destroy(true);
  }
}
