import {
  Container,
  Graphics,
  type Renderer,
  type Sprite,
  type Texture,
} from 'pixi.js';
import { GROUND_Y } from '../../art/geometry';
import {
  noise,
  type CarnageCue,
  type CarnageFrame,
} from '../../catalogue/escalation';
import type { BodyPose, CrashFrame } from '../../crash';
import type { GameState } from '../../simulation';
import { SpectatorShow, type Illustration } from '../shows/spectator-show';
import { EncoreShow } from '../shows/encore-show';
import { CombustionEffects } from '../combustion';
import { SprayEffects } from '../spray-effects';
import { BossShow } from '../shows/boss-show';
import { CarnageBrush, clamp, ease } from './carnage-brush';
import { CarnageAnatomyShow } from './carnage-anatomy-show';
import { CarnageLandingScenes } from './carnage-landing-scenes';
import { carnageLaundry, carnageSpectators } from './carnage-landing-acts';

/** Cue kinds that throw fluid, and so run through the spray emitters. */
const SPRAY_KINDS = ['impact', 'ignite', 'confetti', 'release'];

/** An illustrated, additive layer. Every pose is a pure sample of CrashFrame;
 * no tickers, random calls, collision callbacks or audio live in the renderer. */
export class CarnageEffects {
  readonly behind = new Container({ label: 'carnage-ground-and-tissue' });
  readonly front = new Container({ label: 'carnage-illustrated-scenes' });
  readonly screen = new Graphics({ label: 'brief-lens-splatter' });
  private combustion = new CombustionEffects();
  private spray: SprayEffects;
  private stains = new Graphics({ label: 'persistent-blood-smears' });
  private spectatorInk = new Graphics({ label: 'spectator-sideshow' });
  private encoreInk = new Graphics({ label: 'spectator-encore' });
  private brush: CarnageBrush;
  private pool: Sprite[];
  private drawings: Graphics;
  private anatomy: CarnageAnatomyShow;
  private scenes: CarnageLandingScenes;
  private sideshow: SpectatorShow;
  private encore: EncoreShow;
  private bossShow: BossShow;
  private density = 1;
  constructor(textures: Record<string, Texture>) {
    this.spray = new SprayEffects(textures);
    const brush = new CarnageBrush(textures);
    this.brush = brush;
    this.pool = brush.pool;
    this.drawings = brush.drawings;
    const illustrate: Illustration = (...args) => brush.art(...args);
    this.anatomy = new CarnageAnatomyShow(brush);
    this.scenes = new CarnageLandingScenes(brush);
    this.sideshow = new SpectatorShow(this.spectatorInk, illustrate);
    this.encore = new EncoreShow(this.encoreInk, illustrate);
    this.bossShow = new BossShow(
      this.drawings,
      illustrate,
      (...args) => brush.mouth(...args),
      (...args) => brush.organ(...args),
      (...args) => brush.ribbon(...args),
    );
    this.behind.addChild(
      this.stains,
      this.spray.ground,
      this.combustion.view,
      brush.tissue,
    );
    this.front.addChild(
      this.spray.air,
      this.encore.behind,
      brush.actors,
      this.drawings,
      this.spectatorInk,
      this.encoreInk,
    );
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
    this.beginFrame(gentle, reduced, density);
    const w = s.wreck,
      frame = w?.carnage;
    this.behind.visible = this.front.visible = !!frame;
    if (w && frame) this.drawFrame(s, w, frame, cameraX, width, zoom, height);
    this.brush.hideUnused();
  }
  reset() {
    this.encore.reset();
    this.spray.reset();
    this.combustion.reset();
    this.stains.clear();
    this.brush.clear();
    this.screen.clear();
    this.spectatorInk.clear();
    this.brush.releaseAll();
  }
  dispose() {
    this.brush.dispose();
    this.spray.dispose();
    this.combustion.dispose();
  }
  prepare(renderer: Renderer, force = false) {
    this.combustion.prepare(renderer, force);
  }
  stats() {
    return {
      allocatedSprites: this.pool.length,
      visibleSprites: this.brush.visible,
    };
  }
  /** Empties every layer this class owns and adopts the frame's settings. */
  private beginFrame(gentle: boolean, reduced: boolean, density: number) {
    this.brush.rewind();
    this.spray.reset();
    this.combustion.reset();
    this.stains.clear();
    this.brush.clear();
    this.screen.clear();
    this.spectatorInk.clear();
    this.encore.reset();
    this.brush.gentle = gentle;
    this.brush.reduced = reduced;
    this.density = density;
  }
  /** One wreck frame, in the draw order the finished picture depends on. */
  private drawFrame(
    s: GameState,
    w: CrashFrame,
    frame: CarnageFrame,
    cameraX: number,
    width: number,
    zoom: number,
    height: number,
  ) {
    const brush = this.brush;
    brush.time = w.time;
    brush.left = cameraX - width / zoom / 2 - 80;
    brush.right = cameraX + width / zoom / 2 + 80;
    this.spray.begin(
      brush.gentle,
      brush.reduced,
      this.density,
      brush.left,
      brush.right,
    );
    this.combustion.update(
      frame.cues,
      w.time,
      brush.left,
      brush.right,
      brush.reduced,
      brush.gentle,
      this.density,
    );
    const magnet = s.equipment.includes('magnet')
      ? w.bodies.find((b) => b.id === w.focusId)
      : undefined;
    // Large illustrations get first claim on the pool. Optional particles
    // never crowd out the punchline when the renderer reduces its budget.
    const scene = frame.cues.find((c) => c.kind === 'landing' && c.stage === 0);
    this.stage(s, w, scene);
    this.bosses(frame, w);
    this.anatomy.draw(s);
    if (scene)
      this.encore.draw(
        scene,
        w.time,
        brush.gentle,
        brush.reduced,
        this.density,
        brush.left,
        brush.right,
      );
    if (!brush.reduced) this.lensSplatter(frame, w, width, height);
    this.sprayCues(frame, w, magnet);
    this.spray.end();
  }
  /** The landing tableau and its front row, or the washing left behind once
   * the fence's own set has finished playing. */
  private stage(s: GameState, w: CrashFrame, scene?: CarnageCue) {
    const brush = this.brush;
    if (scene) {
      this.scenes.draw(scene, w.time - scene.at, s);
      carnageSpectators(brush, scene, w.time - scene.at);
      this.sideshow.draw(scene, w.time, brush.gentle, brush.reduced, {
        left: brush.left,
        right: brush.right,
      });
      return;
    }
    if (s.landing === 'fence' && w.time >= 4.2)
      carnageLaundry(brush, w.aftermath!.anchorX, w.time);
  }
  /** Every recorded boss defeat, each still bound to the body it happened to. */
  private bosses(frame: CarnageFrame, w: CrashFrame) {
    for (const c of frame.cues) {
      if (c.kind !== 'boss') continue;
      this.bossShow.draw(
        c,
        w.time,
        w.bodies.find((b) => b.id === c.bodyId),
        this.brush.gentle,
        this.brush.reduced,
      );
    }
  }
  /** Fluid cues, newest first, so recent spray covers older stains. */
  private sprayCues(frame: CarnageFrame, w: CrashFrame, magnet?: BodyPose) {
    for (const c of frame.cues.toReversed())
      if (SPRAY_KINDS.includes(c.kind)) this.sprays(c, w.time - c.at, magnet);
  }
  /**
   * Eight droplets down the edges of the lens after a heavy hit, in screen
   * pixels rather than world units. Fades out over the 0.55 s the cue lives.
   */
  private lensSplatter(
    frame: CarnageFrame,
    w: CrashFrame,
    width: number,
    height: number,
  ) {
    const splash = frame.cues.findLast(
      (c) => c.kind === 'impact' && c.power >= 1.8 && w.time - c.at < 0.55,
    );
    if (!splash) return;
    const age = w.time - splash.at;
    const alpha = clamp((0.55 - age) * 2) * 0.65;
    for (let i = 0; i < 8; i++) {
      const side = i % 2;
      const x = side
        ? width - noise(splash.seed, i) * width * 0.065
        : noise(splash.seed, i) * width * 0.065;
      const y = height * (0.42 + noise(splash.seed, i + 8) * 0.36) + age * 25;
      this.screen
        .ellipse(x, y, 9 + noise(splash.seed, i + 17) * 19, 13 + age * 30)
        .fill({ color: this.brush.red, alpha });
    }
  }
  /** One fluid cue `age` seconds old, with `magnet` as the optional attractor. */
  private sprays(cue: CarnageCue, age: number, magnet?: BodyPose) {
    if (age < 0) return;
    this.spray.cue(cue, age, magnet);
    // Moving droplets can remain visible after their emitter leaves the camera.
    // Only source-local effects use the narrow emitter cull.
    if (cue.x < this.brush.left - 230 || cue.x > this.brush.right + 230) return;
    if (age > 0.2) this.groundStains(cue, age);
    if (cue.kind === 'ignite' && age < 0.8) this.igniteFlash(cue, age);
    if (cue.kind === 'confetti' && age < 2) this.confettiBurst(cue, age);
  }
  /** Permanent smears at ground level, growing for the first half second. */
  private groundStains(cue: CarnageCue, age: number) {
    const growth = ease((age - 0.2) * 2);
    const g = this.stains;
    for (let i = 0; i < (this.brush.reduced ? 2 : 5); i++) {
      const xx = cue.x + (noise(cue.seed, i + 101) - 0.5) * 150 * cue.power;
      const yy = GROUND_Y + 2 + noise(cue.seed, i + 112) * 13;
      const rx = (12 + noise(cue.seed, i + 120) * 38) * growth;
      const ry = (3 + noise(cue.seed, i + 128) * 6) * growth;
      g.ellipse(xx, yy, rx, ry).fill({ color: this.brush.red, alpha: 0.8 });
      g.ellipse(xx - 3, GROUND_Y + 1, 8 * growth, 1.6).fill({
        color: this.brush.pink,
        alpha: 0.65,
      });
      this.spray.smear(xx, yy, rx * 2.5, ry * 2.8);
    }
  }
  /** Six expanding flame blobs over the first 0.8 s of an ignition. */
  private igniteFlash(cue: CarnageCue, age: number) {
    for (let i = 0; i < 6; i++) {
      const x = cue.x + (i - 2.5) * age * 90,
        y = cue.y - Math.sin(i * 2 + 1) * age * 45;
      const r = Math.sin(Math.min(1, age / 0.8) * Math.PI) * (20 + i * 2);
      this.drawings
        .ellipse(x, y, r, r * 1.4)
        .fill({ color: i % 2 ? 0xffce64 : 0xff692d, alpha: 0.8 - age * 0.6 });
    }
  }
  /** Nine eyes and bones thrown on a ballistic arc for the first 2 s. */
  private confettiBurst(cue: CarnageCue, age: number) {
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      this.brush.art(
        i % 2 ? 'eye' : 'bone',
        cue.x + Math.cos(a) * age * 150,
        cue.y - 120 * age + age * age * 70,
        18,
        20,
        age * 6 + a,
      );
    }
  }
}
