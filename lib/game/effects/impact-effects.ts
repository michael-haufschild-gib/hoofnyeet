import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import { comicBurst } from './comic-burst';
import { hashSeed, random } from '../content';
import type { GameEvent, GameState } from '../simulation';
interface Mote {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  gravity: number;
  size: number;
  grow: number;
  spin: number;
  opacity: number;
}
interface Burst {
  sprite: Sprite;
  filter: ReturnType<typeof comicBurst>;
  age: number;
  life: number;
  label: Text;
}
// Short burst/shard and sparkle-tail curves adapted from Slot's pixi-runtime
// particle presets. One manually advanced clock, no ticker or asynchronous replay.
export class ImpactEffects {
  density = 1;
  container = new Container();
  backdrop = new Container();
  private front = new Container();
  private motes: Mote[] = [];
  private bursts: Burst[] = [];
  private textures: Texture[] = [];
  private lastBurst = -Infinity;
  private lastExplosion = -Infinity;
  private elapsed = 0;
  private trail = 0;
  private waves = new Graphics();
  constructor(app: Application) {
    this.container.addChild(this.front, this.waves);
    const shapes = [
      new Graphics().circle(16, 16, 15).fill(0xffffff),
      new Graphics().star(16, 16, 4, 15, 4).fill(0xffffff),
      new Graphics().poly([0, 0, 19, 4, 7, 17]).fill(0xffffff),
    ];
    this.textures = shapes.map((g) => {
      const t = app.renderer.generateTexture(g);
      g.destroy();
      return t;
    });
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
      this.bursts.push({ sprite, filter, label, age: 10, life: 0.65 });
    }
  }
  private mote(
    x: number,
    y: number,
    rng: () => number,
    kind: 'dust' | 'shard' | 'star',
    color: number,
    reduced: boolean,
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
    this.front.addChild(sprite);
    this.motes.push({
      sprite,
      age: 0,
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
    const sound = e.sound ?? e.kind,
      rng = random(hashSeed(e.id ?? `${sound}:${e.x}:${e.time}`));
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
        this.mote(e.x - 35, e.y + 5, rng, 'dust', 0xffe3a9, reduced);
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
        );
    }
    if (!impact) return;
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
      );
    // A landing or disassembly in the same frame must not swallow the blast.
    // Chain explosions still share a short visual cooldown to keep them legible.
    const last = sound === 'explosion' ? this.lastExplosion : this.lastBurst;
    if (this.elapsed - last < (big ? 0.15 : 0.55) || reduced) return;
    if (sound === 'explosion') this.lastExplosion = this.elapsed;
    this.lastBurst = this.elapsed;
    const b = this.bursts.reduce((a, b) => (a.age > b.age ? a : b));
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
    b.label.rotation = -0.12 + rng() * 0.2;
    b.label.style.fontSize = big ? 33 : 25;
  }
  update(dt: number, time: number, s: GameState, reduced: boolean) {
    this.elapsed += dt;
    this.trail += dt;
    if (
      this.trail > 0.05 / this.density &&
      s.phase === 'flight' &&
      !reduced &&
      !s.equipment.includes('beans')
    ) {
      this.trail = 0;
      const rng = random(Math.floor(time * 120));
      this.mote(s.x - 45, s.y - 40, rng, 'star', 0xffe798, false);
    }
    for (const b of this.bursts) {
      b.age += dt;
      const p = b.age / b.life;
      b.sprite.visible = b.label.visible = p < 1;
      if (p >= 1) continue;
      const u = b.filter.resources.burst.uniforms;
      u.uProgress = p;
      u.uTime = time;
      b.label.alpha = Math.min(1, (1 - p) * 4);
      b.label.scale.set(
        0.8 + Math.sin((Math.min(1, p * 4) * Math.PI) / 2) * 0.2,
      );
      b.label.y -= dt * 18;
    }
    for (const m of this.motes) {
      m.age += dt;
      const p = Math.min(1, m.age / m.life);
      m.sprite.x += m.vx * dt;
      m.sprite.y += m.vy * dt;
      m.vy += m.gravity * dt;
      m.vx *= Math.exp(-dt * 1.8);
      m.sprite.rotation += dt * m.spin;
      m.sprite.alpha =
        m.opacity * Math.sin((Math.min(1, p * 5) * Math.PI) / 2) * (1 - p);
      m.sprite.width = m.sprite.height = m.size * (1 - p + p * m.grow);
      if (p >= 1) m.sprite.destroy();
    }
    this.motes = this.motes.filter((m) => m.age < m.life);
    this.waves.clear();
    const wreck = s.wreck;
    if (wreck && !wreck.abilityReady) {
      const age = wreck.abilityAge ?? 10,
        x = wreck.focusX,
        y = wreck.focusY;
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
    this.trail = 0;
    for (const m of this.motes) m.sprite.destroy();
    this.motes = [];
    for (const b of this.bursts) {
      b.age = 10;
      b.sprite.visible = b.label.visible = false;
    }
    this.lastBurst = -Infinity;
    this.lastExplosion = -Infinity;
    this.waves.clear();
  }
  dispose() {
    this.reset();
    for (const b of this.bursts) b.filter.destroy();
    for (const t of this.textures) t.destroy(true);
  }
}
