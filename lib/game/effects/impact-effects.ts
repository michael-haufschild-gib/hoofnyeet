import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
  type Renderer,
} from 'pixi.js';
import { prepareFilters } from './shaders/prepare-pipelines';
import { comicBurst } from './comic-burst';
import { ImpactLens } from './impact-lens';
import { portalVortex } from './shaders/portal-vortex';
import { NuclearEffects } from './nuclear';
import { eventSceneTime, impactMote } from './motion/impact-motion';
import {
  BIG_SOUNDS,
  BURST_LABELS,
  debrisKind,
  debrisTint,
  drawAbilityRings,
  drawSingularity,
  IMPACT_SOUNDS,
  pruneMotes,
  sparkleCue,
  spawnMote,
  type Mote,
  type MoteKind,
} from './impact-debris';
import { hashSeed, random } from '../content';
import type { GameEvent, GameState } from '../simulation';
type Wreck = NonNullable<GameState['wreck']>;
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
/**
 * Impact feedback for one attempt: pooled debris sprites, comic captions, the
 * decaying camera shake read back through `shakeAt`, and the ability portal.
 * Every visual is sampled from the clock handed to `update` in seconds, so a
 * replay repaints identically and nothing runs between calls. `event` may be
 * fed the same cue twice; identified cues are remembered and ignored. Owns
 * the textures it generates, which `dispose` releases.
 */
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
  private prepared = false;
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
    const shapes = [
      new Graphics().circle(16, 16, 15).fill(0xffffff),
      new Graphics().star(16, 16, 4, 15, 4).fill(0xffffff),
      new Graphics().poly([0, 0, 19, 4, 7, 17]).fill(0xffffff),
    ];
    const textures: Texture[] = [];
    try {
      for (const shape of shapes)
        textures.push(app.renderer.generateTexture(shape));
      return textures;
    } catch (error) {
      for (const texture of textures) texture.destroy(true);
      throw error;
    } finally {
      for (const shape of shapes) shape.destroy();
    }
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
    this.prepare(app.renderer, true);
  }

  prepare(renderer: Renderer, force = false) {
    // The cloud may arrive on a later course when dynamite is first equipped.
    this.nuclear.prepare(renderer, force);
    if (this.prepared && !force) return;
    prepareFilters(renderer, [
      this.bursts[0].filter,
      this.portalFilter,
      this.lens.filter,
    ]);
    this.prepared = true;
  }

  private mote(
    x: number,
    y: number,
    rng: () => number,
    kind: MoteKind,
    color: number,
    reduced: boolean,
    born: number,
  ) {
    if (this.motes.length >= (reduced ? 60 : 260) * this.density) return;
    const mote = spawnMote(this.textures, kind, x, y, color, born, rng);
    this.front.addChild(mote.sprite);
    this.motes.push(mote);
  }

  /** Records an identified cue and reports whether it is new. Unidentified
   * cues are always new: they are already keyed by position and time. */
  private remember(e: GameEvent) {
    if (!e.id) return true;
    if (this.seen.has(e.id)) return false;
    this.seen.add(e.id);
    if (this.seen.size > 1600)
      this.seen.delete(this.seen.values().next().value!);
    return true;
  }

  /** Dust under a hoof tap or the launch jump, thrown behind and below it. */
  private tapDust(
    e: GameEvent,
    rng: () => number,
    reduced: boolean,
    born: number,
  ) {
    const count = Math.ceil((reduced ? 1 : 4) * this.density);
    for (let i = 0; i < count; i++)
      this.mote(e.x - 35, e.y + 5, rng, 'dust', 0xffe3a9, reduced, born);
  }

  /** Sparkles above a flourish, in ghost green when the pony phases through. */
  private glideSparkles(
    e: GameEvent,
    sound: string,
    rng: () => number,
    reduced: boolean,
    born: number,
  ) {
    const count = Math.ceil((reduced ? 3 : 10) * this.density);
    const tint = sound === 'ghost' ? 0x8dfbe0 : 0xffdf72;
    for (let i = 0; i < count; i++)
      this.mote(e.x, e.y - 30, rng, 'star', tint, reduced, born);
  }

  /** Routes a weightless cue to the flourish that suits it, if any. */
  private flourishMotes(
    e: GameEvent,
    sound: string,
    rng: () => number,
    reduced: boolean,
    born: number,
  ) {
    if (sound === 'tap' || sound === 'jump')
      this.tapDust(e, rng, reduced, born);
    else if (sparkleCue(e, sound))
      this.glideSparkles(e, sound, rng, reduced, born);
  }

  /** The full debris spread of one impact, widest for the heaviest sounds. */
  private impactMotes(
    e: GameEvent,
    rng: () => number,
    reduced: boolean,
    born: number,
    big: boolean,
    gentle: boolean,
  ) {
    const count = Math.ceil((reduced ? 6 : big ? 42 : 16) * this.density);
    for (let i = 0; i < count; i++)
      this.mote(
        e.x,
        e.y,
        rng,
        debrisKind(i),
        debrisTint(i, gentle),
        reduced,
        born,
      );
  }

  /** Claims the caption slot for this impact, or reports that the cooldown
   * still holds it. A landing or disassembly in the same frame must not
   * swallow the blast, so explosions run their own cooldown; chain explosions
   * still share a short one to keep the captions legible. */
  private takeBurstSlot(
    sound: string,
    big: boolean,
    born: number,
    reduced: boolean,
  ) {
    const last = sound === 'explosion' ? this.lastExplosion : this.lastBurst;
    if (born - last < (big ? 0.15 : 0.55) || reduced) return false;
    if (sound === 'explosion') this.lastExplosion = born;
    this.lastBurst = born;
    return true;
  }

  /** Restarts the least recently used burst on the impact, reusing its pooled
   * sprite and caption rather than adding anything to the scene. */
  private captionBurst(
    e: GameEvent,
    sound: string,
    rng: () => number,
    big: boolean,
    born: number,
  ) {
    const b = this.bursts.reduce((a, b) => (a.born < b.born ? a : b));
    b.born = born;
    b.age = 0;
    b.life = big ? 0.7 : 0.48;
    b.sprite.position.set(e.x, e.y - 20);
    b.sprite.width = b.sprite.height = big ? 370 : 240;
    b.sprite.visible = b.label.visible = true;
    b.label.text = BURST_LABELS[sound] ?? 'CRUNCH!';
    b.label.position.set(
      e.x,
      e.y - (sound === 'land' || sound === 'bounce' ? 175 : 100),
    );
    b.labelY = b.label.y;
    b.label.rotation = -0.12 + rng() * 0.2;
    b.label.style.fontSize = big ? 33 : 25;
  }

  event(e: GameEvent, reduced: boolean, gentle: boolean) {
    if (!this.remember(e)) return;
    const born = eventSceneTime(e, this.elapsed);
    // Capacity is evaluated at the contact tick, including when several ticks
    // arrive between renders. Slow rendering must not discard different debris.
    this.motes = pruneMotes(this.motes, born);
    const sound = e.sound ?? e.kind,
      rng = random(hashSeed(e.id ?? `${sound}:${e.x}:${born}`));
    this.lens.event(e, this.elapsed);
    this.flourishMotes(e, sound, rng, reduced, born);
    if (!IMPACT_SOUNDS.includes(sound)) return;
    this.shakePower = Math.max(
      this.shakeAt(born),
      sound === 'explosion' ? 14 : 6,
    );
    this.shakeBorn = born;
    const big = BIG_SOUNDS.includes(sound);
    this.impactMotes(e, rng, reduced, born, big, gentle);
    if (!this.takeBurstSlot(sound, big, born, reduced)) return;
    this.captionBurst(e, sound, rng, big, born);
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
    this.updateFlightTrail(time, s, reduced);
    this.updateBursts(time, reduced);
    this.updateMotes(time);
    this.waves.clear();
    const wreck = s.wreck;
    this.portal.visible = false;
    if (wreck && !wreck.abilityReady) this.updateAbility(s, wreck, reduced);
  }

  /** Poses the sparkle tail behind a pony in flight. The pool is fixed and
   * every sample is a fraction of a 0.05 s cycle behind the one before it, so
   * the tail reads the same at any frame rate. Beans replace it with a plume. */
  private updateFlightTrail(time: number, s: GameState, reduced: boolean) {
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
  }

  /** Advances each pooled burst over its own life, hiding the ones that have
   * not started or have finished. Reduced motion hides every one of them. */
  private updateBursts(time: number, reduced: boolean) {
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
  }

  /** Re-poses every live mote from its closed-form motion and retires the
   * ones whose life has run out, so a rewound clock keeps its debris. */
  private updateMotes(time: number) {
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
  }

  /** Paints the 1.3 s of feedback that follows a spent ability: the vortex
   * for the two that displace the pony, and the shock waves for all of them. */
  private updateAbility(s: GameState, wreck: Wreck, reduced: boolean) {
    const age = wreck.abilityAge ?? 10,
      x = wreck.focusX,
      y = wreck.focusY;
    if (age >= 0 && age < 1.3 && ['blackhole', 'ghost'].includes(s.ability))
      this.showPortal(x, y, age, s.ability, reduced);
    if (age < 1.3 && !reduced) {
      if (s.ability === 'blackhole') drawSingularity(this.waves, x, y, age);
      else drawAbilityRings(this.waves, s.ability, x, y, age);
    }
  }

  /** Opens the shared vortex sprite on the handoff. Reduced motion freezes
   * its swirl at a fixed phase and dims it rather than hiding it. */
  private showPortal(
    x: number,
    y: number,
    age: number,
    ability: string,
    reduced: boolean,
  ) {
    this.portal.visible = true;
    this.portal.position.set(x, y);
    this.portal.width = this.portal.height =
      ability === 'blackhole' ? 330 : 245;
    const u = this.portalFilter.resources.portal.uniforms;
    u.uAge = reduced ? 0.5 : age;
    u.uTime = reduced ? 0 : age;
    u.uGhost = ability === 'ghost' ? 1 : 0;
    u.uOpacity =
      Math.min(1, age * 12) *
      Math.min(1, (1.3 - age) / 0.25) *
      (reduced ? 0.45 : 1);
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
