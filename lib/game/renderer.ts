import { CarnageEffects } from './effects/slapstick/carnage-effects';
import 'pixi.js/prepare';
import { SIDESHOW_ART } from './effects/motion/spectator-motion';
import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import { type GameState, type GameEvent, type Hat } from './simulation';
import { worldById, type WorldId, type Ability } from './content';
import { ImpactEffects } from './effects/impact-effects';
import { PerkEffects } from './effects/perk-effects';
import { RoutineShow } from './effects/shows/routine-show';
import { CombinationShow } from './effects/shows/combination-show';
import { WorldAtmosphere } from './effects/shaders/world-atmosphere';
import { drawTrampoline } from './art/trampoline';
import { drawJetstream } from './art/flight';
import { TITLE_PONY_X, type CameraFrame } from './camera';
import { RenderBudget } from './art/render-budget';
import {
  hatById,
  hatAsset,
  type PonyId,
  type PonyOutfit,
} from './catalogue/cosmetics';
import { Headwear } from './art/headwear';
import {
  buildActors,
  buildDecor,
  buildEffects,
  buildEquipment,
  buildSceneGraph,
} from './renderer/scene-build';
import {
  levelArtwork,
  loadArtwork,
  loadCarnageArt,
  preparePipelines,
  warmHatShader,
} from './renderer/asset-loading';
import {
  ponyPortraits,
  ponyTexture,
  terrainTexture,
} from './renderer/textures';
import { frameShot, paintBackdrop, poseSubject } from './renderer/camera-stage';
import {
  layoutLabels,
  paintAftermath,
  paintBestMarker,
  paintLanding,
  paintTerrain,
  prepareCourseLabels,
} from './renderer/course-layer';
import {
  paintCrowd,
  paintProps,
  paintRings,
  paintShadows,
} from './renderer/crowd-layer';
import {
  paintBodies,
  paintCrashHat,
  paintFlash,
  paintMarker,
  stepParticles,
  updateEffects,
} from './renderer/wreck-layer';

/** One piece of loose confetti: world-space velocity and remaining seconds. */
interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}

/**
 * Owns the Pixi application and paints one simulation frame onto the canvas.
 *
 * Nothing here advances the game: `draw` is a pure read of the state it is
 * handed, so a live frame, a paused frame and a replayed frame all render
 * through the same path. Every layer, texture cache and effect owner is
 * reachable as a field, because the browser suite inspects them directly.
 */
export class GameRenderer {
  canvas: HTMLCanvasElement;
  app = new Application();
  ready = false;
  w = 1000;
  h = 600;
  reduced = false;
  gentle = false;
  hat: Hat = 'helmet';
  ponyId: PonyId = 'buttercup';
  best = 0;
  cameraX = 0;
  cameraY = 0;
  zoom = 1;
  captionInset = 0;
  hudInset = 0;
  framing: CameraFrame | null = null;
  scene = new Container();
  background = new Container();
  world = new Container();
  track = new Graphics();
  terrain = new Container();
  groundBase = new Graphics();
  terrainTiles: Sprite[] = [];
  terrainTextures = new Map<WorldId, Texture>();
  decor = new Container();
  actors = new Container();
  fx = new Container();
  screenFx = new Graphics();
  textures: Record<string, Texture> = {};
  hatLoading = new Map<Hat, Promise<void>>();
  preparedHats = new Set<Hat>();
  paletteTextures = new Map<string, Texture>();
  portraits = new Map<string, Record<string, string>>();
  outfit: PonyOutfit = { hat: 'helmet', ponyId: 'buttercup' };
  headwear!: Headwear;
  crashHeadwear!: Headwear;
  backgrounds = new Map<WorldId, Texture>();
  loading = new Map<WorldId, Promise<void>>();
  appCreated = false;
  gear: Record<string, Sprite> = {};
  aura = new Graphics();
  bgSprites = [new Sprite()];
  impactEffects!: ImpactEffects;
  perkEffects!: PerkEffects;
  carnageEffects!: CarnageEffects;
  routineShow!: RoutineShow;
  combinationShow!: CombinationShow;
  atmosphere!: WorldAtmosphere;
  carnageLoading: Promise<void> | undefined;
  pony = new Container();
  ponyParts: Record<string, Sprite> = {};
  shadow = new Graphics();
  playerMarker = new Graphics();
  playerLabel = new Text({
    text: 'STILL YOU',
    style: {
      fontFamily: 'Lilita One',
      fontSize: 12,
      fill: '#fff7d6',
      stroke: { color: '#254637', width: 4 },
    },
  });
  landingLabel = new Text({
    text: '',
    style: {
      fontFamily: 'Lilita One',
      fontSize: 15,
      fill: '#fff8e8',
      stroke: { color: '#853f2f', width: 4 },
    },
  });
  bodySprites = new Map<number, Sprite>();
  particles: Particle[] = [];
  labels: Text[] = [];
  ringSprites: Graphics[] = [];
  spectators: Sprite[] = [];
  crowdLayer = new Container({ label: 'trackside-audience' });
  courseProps: Sprite[] = [];
  initialized = false;
  disposed = false;
  lastWorld: WorldId = 'farm';
  lastTime: number | null = null;
  budget: RenderBudget;
  constructor(
    canvas: HTMLCanvasElement,
    resolution = Math.min(2, devicePixelRatio || 1),
  ) {
    this.canvas = canvas;
    this.budget = new RenderBudget(resolution);
  }

  /**
   * Creates the WebGL context, loads the shared artwork and builds the scene.
   *
   * Resolves once the renderer can draw. A dispose that lands mid-load is
   * honoured at the next checkpoint, so nothing is built onto a dead context.
   */
  async load() {
    await this.app.init({
      canvas: this.canvas,
      width: 1000,
      height: 600,
      autoStart: false,
      autoDensity: false,
      resolution: this.budget.resolution,
      preference: 'webgl',
      antialias: true,
      background: '#9ce4dc',
    });
    this.appCreated = true;
    if (this.disposed) {
      this.dispose();
      return;
    }
    buildSceneGraph(this);
    const art = await loadArtwork();
    if (this.disposed) return;
    this.textures = art.textures;
    await this.loadHat(this.hat);
    if (this.disposed) return;
    this.terrain.addChild(this.groundBase);
    this.decor.addChild(this.landingLabel);
    buildEffects(this);
    this.backgrounds.set('farm', art.bg);
    for (const b of this.bgSprites) {
      b.texture = art.bg;
      this.background.addChild(b);
    }
    buildActors(this);
    buildDecor(this);
    this.ready = true;
    this.resize();
    buildEquipment(this);
    this.headwear = new Headwear(this.textures);
    this.crashHeadwear = new Headwear(this.textures);
    this.pony.addChild(this.headwear.view);
    this.actors.addChild(this.crashHeadwear.view);
  }

  /** True when wearing the hat costs no further loading or shader work. */
  hatReady(hat: Hat) {
    return !hatById(hat).extra || this.preparedHats.has(hat);
  }

  /**
   * Loads the artwork for one hat, sharing a single request per hat.
   *
   * Hats bundled in the atlas resolve immediately. A disposed renderer drops
   * the arriving texture rather than caching it.
   */
  async loadHat(hat: Hat) {
    const definition = hatById(hat);
    if (!definition.extra || this.textures[definition.art]) return;
    const pending = this.hatLoading.get(hat);
    if (pending) return pending;
    const request = Assets.load<Texture>(hatAsset(hat))
      .then((texture) => {
        if (!this.disposed) this.textures[definition.art] = texture;
      })
      .finally(() => this.hatLoading.delete(hat));
    this.hatLoading.set(hat, request);
    return request;
  }

  /** Loads, uploads and shader-warms a hat so wearing it cannot stutter. */
  async prepareHat(hat: Hat) {
    await this.loadHat(hat);
    if (this.disposed || this.hatReady(hat)) return;
    await this.app.renderer.prepare.upload(this.textures[hatById(hat).art]);
    if (this.disposed) return;
    warmHatShader(this, hat);
    this.preparedHats.add(hat);
  }

  /** Prepares every hat a recording wears, so replay playback never stalls. */
  async prepareOutfits(frames: readonly GameState[]) {
    await Promise.all(
      [...new Set(frames.map((frame) => frame.outfit?.hat ?? this.hat))].map(
        (hat) => this.prepareHat(hat),
      ),
    );
  }

  /**
   * Loads a world's backdrop and its sideshow props, once per world.
   *
   * The shared gore artwork is fetched on the first call of the session and
   * retried on the next call if it failed. Concurrent callers share one
   * request, and an already-loaded world resolves without any network work.
   */
  async loadWorld(id: WorldId): Promise<void> {
    if (!this.carnageLoading) {
      this.carnageLoading = loadCarnageArt(this).catch((error) => {
        this.carnageLoading = undefined;
        throw error;
      });
    }
    await this.carnageLoading;
    const props = SIDESHOW_ART[id];
    if (this.backgrounds.has(id) && props.every((key) => this.textures[key]))
      return;
    const pending = this.loading.get(id);
    if (pending) return pending;
    const request = Promise.all([
      this.backgrounds.get(id) ??
        Assets.load<Texture>(`/art/${worldById(id).art}.webp`),
      ...props.map((key) => Assets.load<Texture>(`/art/carnage/${key}.webp`)),
    ])
      .then(([texture, ...illustrations]) => {
        if (!this.disposed) {
          this.backgrounds.set(id, texture);
          props.forEach((key, i) => {
            this.textures[key] = illustrations[i];
          });
        }
      })
      .finally(() => this.loading.delete(id));
    this.loading.set(id, request);
    return request;
  }

  /** Loads the one ability illustration that lives outside the atlas. */
  async loadAbility(ability: Ability) {
    if (ability !== 'dynamite' || this.textures['nuclear-cloud']) return;
    const texture = await Assets.load<Texture>(
      '/art/carnage/nuclear-cloud.webp',
    );
    if (!this.disposed) this.textures['nuclear-cloud'] = texture;
  }

  /**
   * Gets one course ready to run, reporting 0 to 1 through `progress`.
   *
   * Resolving does not mean success for a disposed renderer: every stage
   * checks and returns quietly, leaving the caller's own guards to decide.
   */
  async prepareLevel(
    id: WorldId,
    pony: PonyId,
    progress: (value: number) => void = () => {},
    ability: Ability = 'spring',
  ) {
    await Promise.all([
      this.loadWorld(id),
      this.loadAbility(ability),
      this.prepareHat(this.hat),
    ]);
    if (this.disposed) return;
    progress(0.65);
    await Promise.all([
      document.fonts.load('20px "Lilita One"'),
      document.fonts.load('700 20px "Nunito"'),
    ]);
    if (this.disposed) return;
    const artwork = levelArtwork(this, id, pony);
    prepareCourseLabels(this);
    progress(0.8);
    // Assets.load finishes decoding; prepare performs the otherwise deferred
    // GPU uploads in small batches while the course-loading overlay is visible.
    // Do not send existing Text nodes through Pixi 8.16 Prepare: its text hook
    // recreates their batch data. Course labels are already rendered on the
    // title with resident fonts and are reused unchanged across worlds.
    await this.app.renderer.prepare.upload(artwork);
    if (!this.disposed) {
      preparePipelines(this);
      progress(1);
    }
  }

  /** Cached ground strip for a world, generated on first use. */
  terrainTexture(id: WorldId) {
    return terrainTexture(this, id);
  }

  /**
   * Matches the drawing buffer to the canvas, in CSS pixels.
   *
   * `bottomInset` is the height of the caption bar overlapping the canvas, and
   * is retained for later resizes. Identical dimensions are ignored.
   */
  resize(width?: number, height?: number, bottomInset = this.captionInset) {
    this.captionInset = Math.max(0, bottomInset);
    const r = this.canvas.getBoundingClientRect();
    const w = width ?? Math.max(1, Math.round(r.width));
    const h = height ?? Math.max(1, Math.round(r.height));
    if (
      w === this.w &&
      h === this.h &&
      (!this.ready ||
        (this.app.screen.width === w && this.app.screen.height === h))
    )
      return;
    this.w = w;
    this.h = h;
    if (this.scene.filterArea) {
      this.scene.filterArea.width = w;
      this.scene.filterArea.height = h;
    }
    this.budget.resetSampling();
    if (this.ready) this.app.renderer.resize(this.w, this.h);
  }

  /**
   * Feeds one frame time, in seconds, to the adaptive quality budget.
   *
   * `active` marks frames that actually painted the game, so idle menus cannot
   * drag the resolution down. A decided change resizes the buffer at once.
   */
  observeFrame(dt: number, active: boolean) {
    if (!this.ready || !this.budget.sample(dt, active)) return;
    this.impactEffects.density = this.budget.density;
    this.app.renderer.resize(this.w, this.h, this.budget.resolution);
  }

  /** Rebuilds every GPU-owned resource after a lost WebGL context. */
  restoreGraphics() {
    if (!this.ready) return;
    this.budget.resetSampling();
    // Pixi 8.16 rebinds only the first 16 texture slots on context restoration.
    // On GPUs with larger sprite batches, clear every cached slot before the
    // first restored draw so image-backed spectators and text upload again.
    this.app.renderer.resetState();
    // Canvas text releases its rasterization canvas after uploading. Drop its
    // managed GPU references so the original labels are rasterized again.
    for (const label of [...this.labels, this.playerLabel, this.landingLabel])
      label.unload();
    // GPU-generated textures have no image source to upload after context loss.
    for (const texture of this.terrainTextures.values()) texture.destroy(true);
    for (const texture of this.paletteTextures.values()) texture.destroy(true);
    this.terrainTextures.clear();
    this.paletteTextures.clear();
    this.preparedHats.clear();
    this.impactEffects.restoreGraphics(this.app);
    this.carnageEffects.prepare(this.app.renderer, true);
    this.perkEffects.prepare(this.app.renderer, true);
    this.routineShow.restoreGraphics();
    this.combinationShow.restoreGraphics();
    this.atmosphere.restoreGraphics();
  }

  /** Clears every transient effect so the next frame starts a fresh shot. */
  reset() {
    this.budget.resetSampling();
    this.initialized = false;
    this.framing = null;
    this.lastTime = null;
    for (const p of this.particles) p.sprite.destroy();
    this.particles = [];
    this.impactEffects?.reset();
    this.perkEffects?.reset();
    this.carnageEffects?.reset();
    this.routineShow?.reset();
    this.combinationShow?.reset();
  }

  /** Hands one simulation event to the effect owners that illustrate it. */
  event(e: GameEvent) {
    if (!this.ready) return;
    this.impactEffects.event(e, this.reduced, this.gentle);
    this.perkEffects.event(e);
  }

  /**
   * Paints one frame and presents it.
   *
   * The passed `dt` and `time` are ignored whenever the frame carries its own
   * scene clock, because a recorded frame already includes hit freezes and
   * replay speed. Camera, particles and procedural poses share that clock, so
   * a paused or replayed frame stays consistent with a live one.
   */
  draw(s: GameState, dt: number, time: number) {
    this.outfit = s.outfit ?? { hat: this.hat, ponyId: this.ponyId };
    if (!this.ready) return;
    time = s.sceneTime ?? time;
    dt =
      this.lastTime === null
        ? 0
        : Math.max(0, Math.min(0.1, time - this.lastTime));
    prepareCourseLabels(this);
    if (this.lastWorld !== s.world) {
      this.lastWorld = s.world;
      void this.loadWorld(s.world).catch(() => {});
    }
    const crash =
        !!s.wreck && ['landing', 'results', 'replay'].includes(s.phase),
      title = s.phase === 'title';
    const ponyX = title ? TITLE_PONY_X : s.x;
    this.pony.visible = !crash;
    const rig = poseSubject(this, s, time, crash, title, ponyX);
    frameShot(this, s, dt, time, rig);
    const groundY = paintBackdrop(this, s, time, title);
    this.track.clear();
    const left = this.cameraX - (this.w / 2 + 32) / this.zoom;
    drawJetstream(
      this.track,
      s,
      left,
      left + (this.w + 64) / this.zoom,
      time,
      this.reduced,
    );
    paintTerrain(this, s, left);
    layoutLabels(this, s, title, groundY);
    paintLanding(this, s, crash);
    paintAftermath(this, s, time, crash);
    drawTrampoline(this.track, s, this.reduced);
    paintCrowd(this, s, time, title, left);
    paintProps(this, s, time, title);
    paintRings(this, s, time, title, crash);
    paintBestMarker(this);
    paintShadows(this, s, crash, ponyX);
    paintMarker(this, s, crash);
    paintBodies(this, s, crash);
    paintCrashHat(this, s, time, crash);
    stepParticles(this, dt);
    paintFlash(this, s);
    updateEffects(this, s, time);
    this.lastTime = time;
    this.app.render();
  }

  /** Releases the WebGL context and every resource this renderer created. */
  dispose() {
    this.disposed = true;
    if (this.appCreated) {
      this.appCreated = false;
      this.impactEffects?.dispose();
      this.perkEffects?.dispose();
      this.carnageEffects?.dispose();
      this.atmosphere?.dispose();
      this.headwear?.dispose();
      this.crashHeadwear?.dispose();
      for (const texture of this.terrainTextures.values())
        texture.destroy(true);
      for (const texture of this.paletteTextures.values())
        texture.destroy(true);
      this.app.destroy(false, { children: true });
      this.ready = false;
    }
  }

  /** One body-part texture, recoloured and cached for the selected pony. */
  ponyTexture(part: string, id = this.outfit.ponyId): Texture {
    return ponyTexture(this, part, id);
  }

  /** Wardrobe previews as PNG data URLs, keyed by pony id and cached per hat. */
  ponyPortraits(hat = this.hat) {
    return ponyPortraits(this, hat);
  }
}
