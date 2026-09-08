import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from 'pixi.js';
import {
  TRACK,
  RINGS,
  jumpTarget,
  type GameState,
  type GameEvent,
  type Hat,
} from './simulation';
import { worldById, synergies, type WorldId } from './content';
import { CATASTROPHES } from './catastrophes';
import { ImpactEffects } from './effects/impact-effects';
import { PerkEffects } from './effects/perk-effects';
import { terrainGraphic, spectatorCells } from './terrain';
import { drawTrampoline } from './trampoline';
import { drawJetstream } from './flight';
import { ponyPose } from './pose';
import { frameGame, TITLE_PONY_X, type CameraFrame } from './camera';
import { RenderBudget } from './render-budget';
import { PONIES, type PonyId } from './cosmetics';
import { ponyPalette } from './effects/pony-palette';
import {
  GROUND_Y,
  PONY_BODY_Y,
  LEG_HIPS,
  LEG_SIZE,
  hoofSupport,
  artFoot,
} from './geometry';
interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
}
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
  private scene = new Container();
  private background = new Container();
  private world = new Container();
  private track = new Graphics();
  private terrain = new Container();
  private groundBase = new Graphics();
  private terrainTiles: Sprite[] = [];
  private terrainTextures = new Map<WorldId, Texture>();
  private decor = new Container();
  private actors = new Container();
  private fx = new Container();
  private screenFx = new Graphics();
  private textures: Record<string, Texture> = {};
  private paletteTextures = new Map<string, Texture>();
  private portraits: Record<string, string> | null = null;
  private backgrounds = new Map<WorldId, Texture>();
  private loading = new Map<WorldId, Promise<void>>();
  private appCreated = false;
  private gear: Record<string, Sprite> = {};
  private aura = new Graphics();
  private bgSprites = [new Sprite()];
  private impactEffects!: ImpactEffects;
  private perkEffects!: PerkEffects;
  private pony = new Container();
  private ponyParts: Record<string, Sprite> = {};
  private shadow = new Graphics();
  private playerMarker = new Graphics();
  private playerLabel = new Text({
    text: 'STILL YOU',
    style: {
      fontFamily: 'Lilita One',
      fontSize: 12,
      fill: '#fff7d6',
      stroke: { color: '#254637', width: 4 },
    },
  });
  private landingLabel = new Text({
    text: '',
    style: {
      fontFamily: 'Lilita One',
      fontSize: 15,
      fill: '#fff8e8',
      stroke: { color: '#853f2f', width: 4 },
    },
  });
  private bodySprites = new Map<number, Sprite>();
  private particles: Particle[] = [];
  private labels: Text[] = [];
  private ringSprites: Graphics[] = [];
  private spectators: Sprite[] = [];
  private courseProps: Sprite[] = [];
  private initialized = false;
  private disposed = false;
  private shake = 0;
  private labelWorld: WorldId | null = null;
  private lastWorld: WorldId = 'farm';
  private lastTime: number | null = null;
  private budget: RenderBudget;
  constructor(
    canvas: HTMLCanvasElement,
    resolution = Math.min(2, devicePixelRatio || 1),
  ) {
    this.canvas = canvas;
    this.budget = new RenderBudget(resolution);
  }
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
    this.app.stage.addChild(this.scene);
    this.scene.addChild(this.background, this.world, this.screenFx);
    this.world.addChild(
      this.terrain,
      this.track,
      this.decor,
      this.shadow,
      this.actors,
      this.fx,
    );
    const paths = (await fetch('/art/sprites.json').then((r) =>
      r.json(),
    )) as Record<string, string>;
    const [bg, sprites] = await Promise.all([
      Assets.load<Texture>('/art/countryside.webp'),
      Promise.all(
        Object.entries(paths).map(
          async ([id, path]) => [id, await Assets.load<Texture>(path)] as const,
        ),
      ),
    ]);
    if (this.disposed) return;
    this.textures = Object.fromEntries(sprites);
    this.terrain.addChild(this.groundBase);
    this.decor.addChild(this.landingLabel);
    this.impactEffects = new ImpactEffects(this.app);
    this.perkEffects = new PerkEffects(this.textures['bean-propulsion-cloud']);
    this.world.addChildAt(
      this.perkEffects.behind,
      this.world.getChildIndex(this.actors),
    );
    this.world.addChildAt(
      this.impactEffects.backdrop,
      this.world.getChildIndex(this.actors),
    );
    this.fx.addChild(this.impactEffects.container);
    this.backgrounds.set('farm', bg);
    for (const b of this.bgSprites) {
      b.texture = bg;
      this.background.addChild(b);
    }
    for (const key of [
      'tail',
      'backLeg1',
      'frontLeg1',
      'torso',
      'backLeg2',
      'frontLeg2',
      'head',
    ]) {
      const part = key.includes('Leg') ? 'straightLeg' : key;
      const sprite = new Sprite(this.textures[part]);
      sprite.anchor.set(0.5, key.includes('Leg') ? LEG_SIZE.anchorY : 0.5);
      if (key.endsWith('Leg1')) sprite.tint = 0xc6bca5;
      this.pony.addChild(sprite);
      this.ponyParts[key] = sprite;
    }
    this.pony.addChildAt(this.aura, 0);
    this.actors.addChild(this.pony, this.playerMarker, this.playerLabel);
    this.actors.addChild(this.perkEffects.attached);
    this.fx.addChild(this.perkEffects.front);
    this.playerLabel.anchor.set(0.5);
    for (let i = 0; i < 3; i++) {
      const ring = new Graphics()
        .circle(0, 0, 65)
        .stroke({ color: 0x755d2b, width: 12 })
        .circle(0, 0, 65)
        .stroke({ color: 0xffd56b, width: 8 })
        .arc(0, 0, 65, Math.PI, Math.PI * 1.85)
        .stroke({ color: 0xfff7d0, width: 3 })
        .circle(0, 0, 76)
        .stroke({ color: 0xfff2ca, width: 2, alpha: 0.6 })
        .star(0, 0, 4, 17, 6)
        .fill({ color: 0xffeb9d, alpha: 0.9 });
      this.decor.addChild(ring);
      this.ringSprites.push(ring);
    }
    for (let i = 0; i < 12; i++) {
      const sprite = new Sprite(this.textures.cube);
      sprite.anchor.set(0.5, 1);
      this.decor.addChild(sprite);
      this.courseProps.push(sprite);
    }
    this.ready = true;
    this.resize();
    this.loadEquipment();
  }
  private loadEquipment() {
    for (const key of [
      'jetpack',
      'wing-left',
      'wing-right',
      'party-cone',
      'crown',
      'astronaut-helmet',
      'magnetic-horseshoe',
      'ghost-portal-ring',
      'tnt',
    ]) {
      const sprite = new Sprite(this.textures[key]);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.pony.addChild(sprite);
      this.gear[key] = sprite;
    }
  }
  async loadWorld(id: WorldId): Promise<void> {
    if (this.backgrounds.has(id)) return;
    const pending = this.loading.get(id);
    if (pending) return pending;
    const request = Assets.load<Texture>(`/art/${worldById(id).art}.webp`)
      .then((texture) => {
        if (!this.disposed) this.backgrounds.set(id, texture);
      })
      .finally(() => this.loading.delete(id));
    this.loading.set(id, request);
    return request;
  }
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
    this.budget.resetSampling();
    if (this.ready) this.app.renderer.resize(this.w, this.h);
  }
  observeFrame(dt: number, active: boolean) {
    if (!this.ready || !this.budget.sample(dt, active)) return;
    this.impactEffects.density = this.budget.density;
    this.app.renderer.resize(this.w, this.h, this.budget.resolution);
  }
  restoreGraphics() {
    if (!this.ready) return;
    this.budget.resetSampling();
    // GPU-generated textures have no image source to upload after context loss.
    for (const texture of this.terrainTextures.values()) texture.destroy(true);
    for (const texture of this.paletteTextures.values()) texture.destroy(true);
    this.terrainTextures.clear();
    this.paletteTextures.clear();
    this.impactEffects.dispose();
    this.impactEffects.backdrop.destroy({ children: true });
    this.impactEffects.container.destroy({ children: true });
    this.impactEffects = new ImpactEffects(this.app);
    this.world.addChildAt(
      this.impactEffects.backdrop,
      this.world.getChildIndex(this.actors),
    );
    this.impactEffects.density = this.budget.density;
    this.fx.addChild(this.impactEffects.container);
  }
  reset() {
    this.budget.resetSampling();
    this.initialized = false;
    this.framing = null;
    this.lastTime = null;
    this.shake = 0;
    for (const p of this.particles) p.sprite.destroy();
    this.particles = [];
    this.impactEffects?.reset();
    this.perkEffects?.reset();
  }
  event(e: GameEvent) {
    if (!this.ready) return;
    const sound = e.sound ?? e.kind;
    const impact = [
      'land',
      'bounce',
      'explosion',
      'boneclatter',
      'metalcrash',
      'piano',
      'baler',
      'woodbreak',
      'teethchomp',
    ].includes(sound);
    if (impact)
      this.shake = Math.max(this.shake, sound === 'explosion' ? 14 : 6);
    this.impactEffects.event(e, this.reduced, this.gentle);
    this.perkEffects.event(e);
  }
  private part(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation = 0,
  ) {
    const p = this.ponyParts[key];
    if (key !== 'head')
      p.texture = this.ponyTexture(key.includes('Leg') ? 'straightLeg' : key);
    p.position.set(x, y);
    p.width = w;
    p.height = h;
    p.rotation = rotation;
  }
  private horse(s: GameState, time: number) {
    const running = s.phase === 'runup' || s.phase === 'title',
      cycle = running ? s.x / 35 : time * 4,
      air = ['flight', 'approach'].includes(s.phase);
    const pose = ponyPose(s, time);
    const grounded = ['title', 'countdown', 'runup', 'compression'].includes(
      s.phase,
    );
    const bodyY = grounded
      ? -hoofSupport(
          pose.legs,
          pose.xScale,
          pose.yScale,
          s.rotation + pose.bodyAngle,
        )
      : PONY_BODY_Y + pose.bob;
    this.pony.position.set(s.x, s.y + bodyY);
    this.pony.rotation = s.rotation + pose.bodyAngle;
    this.pony.scale.set(pose.xScale, pose.yScale);
    this.part('tail', -63, -1, 43, 65, pose.tailAngle);
    this.part('torso', 0, 0, 108, 75);
    for (let i = 0; i < LEG_HIPS.length; i++) {
      const hip = LEG_HIPS[i];
      this.part(
        hip.key,
        hip.x,
        hip.y,
        LEG_SIZE.width,
        LEG_SIZE.height,
        pose.legs[i],
      );
    }
    this.ponyParts.head.texture = this.ponyTexture(
      air ? 'surprisedHead' : 'head',
    );
    this.part('head', 47, -27 + pose.headY, 71, 87, pose.headAngle);
    const combos = synergies(s.equipment).map((c) => c.id);
    const has = (id: string) => s.equipment.includes(id);
    const gear = (
      id: string,
      on: boolean,
      x: number,
      y: number,
      w: number,
      h: number,
      angle = 0,
    ) => {
      const p = this.gear[id];
      if (!p) return;
      p.visible = on;
      p.position.set(x, y);
      p.width = w;
      p.height = h;
      p.rotation = angle;
    };
    for (const p of Object.values(this.gear)) p.visible = false;
    gear('jetpack', has('rocket'), -34, -25, 56, 70, air ? -0.22 : 0);
    gear('tnt', s.ability === 'dynamite', -26, 10, 42, 42, -0.12);
    gear(
      'wing-left',
      has('wings'),
      -30,
      -35,
      combos.includes('poultry') ? 95 : 63,
      85,
      pose.wingAngle - 0.4,
    );
    gear(
      'wing-right',
      has('wings'),
      13,
      -44,
      combos.includes('poultry') ? 100 : 65,
      85,
      -pose.wingAngle + 0.4,
    );
    gear(
      'magnetic-horseshoe',
      has('magnet'),
      28,
      62,
      30,
      34,
      Math.sin(cycle) * 0.2,
    );
    gear(
      'ghost-portal-ring',
      combos.includes('haunted'),
      0,
      -10,
      180,
      200,
      time * 0.4,
    );
    gear(
      'party-cone',
      this.hat === 'party' || combos.includes('party'),
      49,
      -78,
      44,
      58,
      0.17,
    );
    gear('crown', this.hat === 'crown', 50, -74, 54, 43, 0.1);
    gear('astronaut-helmet', this.hat === 'space', 47, -28, 91, 103);
    this.ponyParts.torso.tint = combos.includes('arcade')
      ? 0x94fadd
      : combos.includes('meteor')
        ? 0xffa472
        : 0xffffff;
    this.ponyParts.head.alpha = combos.includes('haunted') ? 0.72 : 1;
    this.aura.clear();
    if (!this.reduced) {
      if (combos.includes('meteor'))
        this.aura
          .poly([-30, -45, -180, 0, -40, 40, -110, 0])
          .fill({ color: 0xff773d, alpha: 0.5 });
      if (combos.includes('arcade'))
        this.aura
          .circle(0, 0, 85 + Math.sin(time * 8) * 5)
          .stroke({ color: 0x4ceabf, width: 3, alpha: 0.7 });
      for (let i = 0; i < 8; i++) {
        const a = time * 2 + (i * Math.PI) / 4;
        if (combos.includes('junk'))
          this.aura
            .roundRect(Math.cos(a) * 90, Math.sin(a) * 70, 12, 7, 2)
            .fill(0x68879a);
        if (combos.includes('recital') || combos.includes('party'))
          this.aura
            .star(Math.cos(a) * 95, Math.sin(a) * 90, 5, 6)
            .fill([0xff7b8d, 0xffdb63, 0x5cdeb7][i % 3]);
      }
    }
  }
  private label(
    text: string,
    x: number,
    y: number,
    size = 20,
    color = '#315343',
  ) {
    const t = new Text({
      text,
      style: {
        fontFamily: 'Lilita One',
        fontSize: size,
        fill: color,
        stroke: { color: '#fff6d8', width: 3 },
        align: 'center',
      },
    });
    t.anchor.set(0.5);
    t.position.set(x, y);
    this.decor.addChild(t);
    this.labels.push(t);
  }
  private rebuildLabels(s: GameState) {
    for (const t of this.labels) t.destroy();
    this.labels = [];
    this.labelWorld = s.world;
    this.label('NO REFUNDS BEYOND THIS POINT', 580, 65, 14);
    this.label('THE BOUNCY BIT', TRACK.trampoline, -145, 19);
    for (let i = 1; i < 16; i++)
      this.label(`${i * 100} m`, TRACK.trampoline + i * 1000, 45, 17);
  }
  draw(s: GameState, dt: number, time: number) {
    if (!this.ready) return;
    time = s.sceneTime ?? time;
    // Recorded simulation time includes the exact hit freezes and replay speed.
    // Camera, particles and procedural poses all advance with that same clock.
    dt =
      this.lastTime === null
        ? 0
        : Math.max(0, Math.min(0.1, time - this.lastTime));
    if (this.labelWorld !== s.world) this.rebuildLabels(s);
    if (this.lastWorld !== s.world) {
      this.lastWorld = s.world;
      void this.loadWorld(s.world).catch(() => {});
    }
    const crash =
        !!s.wreck && ['landing', 'results', 'replay'].includes(s.phase),
      title = s.phase === 'title';
    this.framing = frameGame(
      s,
      this.w,
      this.h,
      this.initialized ? this.framing : null,
      dt,
      this.reduced,
      this.captionInset,
      this.hudInset || undefined,
    );
    this.cameraX = this.framing.x;
    this.cameraY = this.framing.y;
    this.zoom = this.framing.zoom;
    this.initialized = true;
    this.shake *= Math.exp(-dt * 12);
    const shake = this.reduced ? 0 : this.shake;
    this.world.position.set(
      this.w * 0.5 - this.cameraX * this.zoom + Math.sin(time * 91) * shake,
      this.h * 0.58 -
        this.cameraY * this.zoom +
        Math.cos(time * 73) * shake * 0.5,
    );
    this.world.scale.set(this.zoom);
    const bg = this.backgrounds.get(s.world) ?? this.backgrounds.get('farm')!;
    const horizon = s.world === 'farm' ? 0.84 : 0.73;
    const bw = Math.max(this.w * 1.22, (this.h / horizon) * 1.5),
      bh = bw / 1.5;
    const groundY =
      this.h * 0.58 - this.cameraY * this.zoom + GROUND_Y * this.zoom;
    const p = this.bgSprites[0];
    p.texture = bg;
    p.width = bw;
    p.height = bh;
    // A single overscanned illustration: bounded parallax, no repeated edge.
    p.position.set(
      -(bw - this.w) / 2 -
        Math.sin(
          this.cameraX / 4200 + (title && !this.reduced ? time * 0.025 : 0),
        ) *
          (bw - this.w) *
          0.28,
      Math.min(0, groundY - bh * horizon),
    );
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
    let terrainTexture = this.terrainTextures.get(s.world);
    if (!terrainTexture) {
      const g = terrainGraphic(s.world);
      terrainTexture = this.app.renderer.generateTexture(g);
      g.destroy();
      this.terrainTextures.set(s.world, terrainTexture);
    }
    const tileCount = Math.ceil((this.w + 64) / this.zoom / 1024) + 1;
    while (this.terrainTiles.length < tileCount) {
      const tile = new Sprite();
      this.terrainTiles.push(tile);
      this.terrain.addChild(tile);
    }
    this.groundBase
      .clear()
      .rect(left, GROUND_Y, (this.w + 64) / this.zoom, this.h / this.zoom)
      .fill(worldById(s.world).ground);
    for (let i = 0; i < this.terrainTiles.length; i++) {
      const p = this.terrainTiles[i];
      p.visible = i < tileCount;
      if (!p.visible) continue;
      p.texture = terrainTexture;
      p.position.set(Math.floor(left / 1024) * 1024 + i * 1024, GROUND_Y);
      p.width = 1024;
      p.height = 360;
    }
    for (const label of this.labels) {
      const distanceMarker = /^\d/.test(String(label.text));
      label.visible = !title && (distanceMarker || !s.launched);
      label.scale.set(
        distanceMarker
          ? Math.min(1.25 / this.zoom, Math.max(1, 0.55 / this.zoom))
          : 1,
      );
      if (distanceMarker)
        label.y = Math.min(
          45,
          (this.h - this.captionInset - groundY - 10) / this.zoom -
            label.height / 2,
        );
    }
    this.landingLabel.visible = crash && !s.failed;
    if (this.landingLabel.visible) {
      // Show where the jump ended while kicks and rebounds extend the total.
      const x = s.impactX;
      this.track
        .moveTo(x, GROUND_Y + 8 / this.zoom)
        .lineTo(x, GROUND_Y - 46 / this.zoom)
        .stroke({ color: 0xfff8e8, width: 5 / this.zoom })
        .moveTo(x, GROUND_Y + 8 / this.zoom)
        .lineTo(x, GROUND_Y - 46 / this.zoom)
        .stroke({ color: 0xc96040, width: 2 / this.zoom });
      this.landingLabel.text = `JUMP · ${(s.flightDistance ?? s.distance).toFixed(1)} m`;
      this.landingLabel.scale.set(1 / this.zoom);
      this.landingLabel.position.set(
        x + 8 / this.zoom,
        GROUND_Y - 46 / this.zoom,
      );
    }
    const cue = jumpTarget(s);
    const after = s.wreck?.aftermath;
    if (crash && after?.id === 'fence' && s.wreck!.time >= 4.2) {
      const x = after.anchorX;
      if (after.active)
        this.track
          .moveTo(x - 95, -138)
          .quadraticCurveTo(x, -118, x + 95, -138)
          .stroke({ color: 0x514840, width: 3 });
      else {
        this.track
          .moveTo(x - 95, -138)
          .lineTo(x - 13, -105)
          .stroke({ color: 0x514840, width: 3 });
        this.track
          .moveTo(x + 95, -138)
          .lineTo(x + 13, -105)
          .stroke({ color: 0x514840, width: 3 });
      }
      this.track.roundRect(x - 5, -139, 10, 20, 3).fill(0xe8b84f);
    }
    if (crash && after?.id === 'accordion' && after.active) {
      const magnet = s.wreck!.bodies.find((body) => body.id === after.propId);
      if (magnet) {
        const bottom = Math.max(magnet.y + 170, s.wreck!.focusY + 65);
        this.track
          .poly([
            magnet.x - 32,
            magnet.y + 24,
            magnet.x + 32,
            magnet.y + 24,
            magnet.x + 135,
            bottom,
            magnet.x - 135,
            bottom,
          ])
          .fill({ color: 0x9cffe8, alpha: 0.18 + Math.sin(time * 8) * 0.04 });
        for (let i = 0; i < 4; i++) {
          const y =
            magnet.y +
            60 +
            ((time * 85 + i * 47) % Math.max(80, bottom - magnet.y - 60));
          this.track
            .ellipse(magnet.x, y, 48 + (y - magnet.y) * 0.2, 7)
            .stroke({ color: 0xc9fff4, width: 2, alpha: 0.4 });
        }
      }
    }
    this.track
      .roundRect(cue.start, GROUND_Y + 7, 110, 12, 6)
      .fill({ color: 0xffd75d, alpha: 0.75 });
    drawTrampoline(this.track, s);
    const cells = spectatorCells(left, left + (this.w + 64) / this.zoom);
    while (this.spectators.length < cells.length) {
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 1);
      this.decor.addChild(sprite);
      this.spectators.push(sprite);
    }
    for (let i = 0; i < this.spectators.length; i++) {
      const p = this.spectators[i];
      const cell = cells[i];
      p.visible = cell !== undefined;
      if (!p.visible) continue;
      const crowd = {
        farm: ['sheep', 'goose'],
        candy: ['donut', 'goose'],
        carnival: ['goose', 'glove'],
        office: ['officeGoose', 'goose'],
        moon: ['ufo', 'helmet'],
        afterlife: ['ghost', 'skeleton'],
      }[s.world];
      const part = crowd[((cell % 2) + 2) % 2];
      p.texture = this.textures[part];
      p.width = s.world === 'farm' ? 55 : 42;
      p.height = (p.width * p.texture.height) / p.texture.width;
      p.x = cell * 145;
      // Sway around planted feet; hovering is reserved for ghosts and saucers.
      const hovering = ['ufo', 'ghost'].includes(part);
      p.rotation = Math.sin(time * 2 + cell * 0.73) * 0.04;
      p.y =
        GROUND_Y -
        artFoot(part, p.width, p.height, p.rotation, 1) -
        (hovering ? 30 + Math.sin(time * 3 + cell) * 5 : 0);
      p.visible = !title && (crash || Math.abs(p.x - s.x) > 120);
    }
    for (let i = 0; i < this.courseProps.length; i++) {
      const p = this.courseProps[i];
      const distance = (i + 1) * 100;
      const spec = CATASTROPHES[s.world][(s.disaster + i + 1) % 4];
      p.texture = this.textures[spec.trap] ?? this.textures.cube;
      p.width = 135;
      p.height = (p.width * p.texture.height) / p.texture.width;
      p.rotation = Math.sin(time * 1.8 + i) * 0.03;
      p.position.set(
        TRACK.trampoline + distance * 10 + 180,
        GROUND_Y - artFoot(spec.trap, p.width, p.height, p.rotation, 1),
      );
      p.visible = !crash && !title;
    }
    for (let i = 0; i < RINGS.length; i++) {
      const p = this.ringSprites[i];
      p.position.set(RINGS[i].x, RINGS[i].y);
      p.visible = !crash && !title && !s.rings.includes(i);
      p.scale.set(1 + Math.sin(time * 3 + i) * 0.05);
    }
    if (this.best > 0) {
      const x = TRACK.trampoline + this.best * 10;
      this.track
        .moveTo(x, GROUND_Y)
        .lineTo(x, -140)
        .stroke({ color: 0xffce58, width: 4 })
        .poly([x, -140, x + 45, -125, x, -110])
        .fill(0xffce58);
    }
    this.shadow.clear();
    for (const p of [...this.spectators, ...this.courseProps]) {
      if (p.visible)
        this.shadow
          .ellipse(p.x, GROUND_Y + 2, p.width * 0.32, 3)
          .fill({ color: 0x244237, alpha: 0.15 });
    }
    if (crash)
      for (const b of s.wreck!.bodies) {
        const a = Math.max(0, 1 + Math.min(0, b.y) / 400) * 0.18;
        this.shadow
          .ellipse(b.x, GROUND_Y + 2, Math.max(8, b.w * 0.42), 5)
          .fill({ color: 0x223a30, alpha: a });
      }
    const ponyX = title ? TITLE_PONY_X : s.x;
    if (!crash)
      this.shadow
        .ellipse(ponyX, GROUND_Y + 2, 50, 9)
        .fill({ color: 0x244237, alpha: 0.18 });
    this.pony.visible = !crash;
    this.horse(title ? { ...s, x: ponyX, y: 0 } : s, time);
    this.playerMarker.clear();
    this.playerLabel.visible = crash;
    if (crash) {
      const x = s.wreck!.focusX,
        y = s.wreck!.focusY;
      this.playerMarker
        .ellipse(x, y + 48, 44, 8)
        .stroke({ color: 0xffe77b, width: 3, alpha: 0.85 });
      this.playerMarker
        .poly([x - 5, y - 67, x + 5, y - 67, x, y - 59])
        .fill(0xffeb83);
      this.playerLabel.position.set(x, y - 80);
    }
    const visible = new Set<number>();
    if (crash) {
      for (const b of s.wreck!.bodies) {
        visible.add(b.id);
        let sprite = this.bodySprites.get(b.id);
        const key =
          this.gentle &&
          (b.part.startsWith('skeletal') ||
            ['jam', 'skeleton', 'bone'].includes(b.part))
            ? b.part.includes('leg')
              ? 'straightLeg'
              : 'cube'
            : b.part;
        const aliases: Record<string, string> = {
          donut: 'jaws',
          tnt: 'cube',
          lollipop: 'bone',
          glove: 'helmet',
          officeGoose: 'goose',
          ufo: 'helmet',
          reaper: 'ghost',
          rescue: 'baler',
        };
        const texture =
          this.ponyTexture(key) ?? this.textures[aliases[key] ?? 'cube'];
        if (!sprite) {
          sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          this.actors.addChild(sprite);
          this.bodySprites.set(b.id, sprite);
        }
        sprite.texture = texture;
        sprite.visible = true;
        sprite.position.set(b.x, b.y);
        sprite.rotation = b.angle;
        sprite.width = b.w;
        sprite.height = b.h;
        sprite.tint = b.tint;
        sprite.alpha = b.alpha;
      }
    }
    for (const [id, p] of this.bodySprites)
      if (!visible.has(id)) {
        p.destroy();
        this.bodySprites.delete(id);
      }
    for (const p of this.particles) {
      p.life -= dt;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      p.vy += 200 * dt;
      p.sprite.rotation += dt * 4;
      p.sprite.alpha = Math.max(0, p.life);
    }
    this.particles = this.particles.filter((p) => {
      if (p.life <= 0) {
        p.sprite.destroy();
        return false;
      }
      return true;
    });
    this.screenFx.clear();
    if (!this.reduced && s.wreck && s.wreck.flash > 0)
      this.screenFx
        .rect(0, 0, this.w, this.h)
        .fill({ color: 0xfff0bc, alpha: s.wreck.flash * 0.25 });
    this.perkEffects.update(
      s,
      time,
      this.pony,
      this.zoom,
      this.reduced,
      this.budget.density,
    );
    this.impactEffects.update(dt, time, s, this.reduced);
    this.lastTime = time;
    this.app.render();
  }
  dispose() {
    this.disposed = true;
    if (this.appCreated) {
      this.appCreated = false;
      this.impactEffects?.dispose();
      for (const texture of this.terrainTextures.values())
        texture.destroy(true);
      for (const texture of this.paletteTextures.values())
        texture.destroy(true);
      this.app.destroy(false, { children: true });
      this.ready = false;
    }
  }
  private ponyTexture(part: string, id = this.ponyId): Texture {
    const base = this.textures[part];
    if (
      id === 'buttercup' ||
      ![
        'head',
        'surprisedHead',
        'offended-head',
        'tail',
        'torso',
        'straightLeg',
        'cube',
      ].includes(part)
    )
      return base;
    const key = `${id}:${part}`;
    let texture = this.paletteTextures.get(key);
    if (!texture) {
      const sprite = new Sprite(base);
      const filter = ponyPalette(id);
      sprite.filters = [filter];
      texture = this.app.renderer.generateTexture({
        target: sprite,
        resolution: 1,
      });
      this.paletteTextures.set(key, texture);
      sprite.destroy();
      filter.destroy();
    }
    return texture;
  }
  ponyPortraits() {
    if (!this.ready) return {};
    if (this.portraits) return this.portraits;
    this.portraits = {};
    for (const pony of PONIES) {
      const sprite = new Sprite(this.ponyTexture('head', pony.id));
      sprite.width = 112;
      sprite.height = 140;
      const canvas = this.app.renderer.extract.canvas({
        target: sprite,
        resolution: 1,
      });
      this.portraits[pony.id] = canvas.toDataURL?.('image/png') ?? '';
      sprite.destroy();
    }
    return this.portraits;
  }
}
