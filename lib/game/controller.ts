import { INCIDENT_WINDOW } from './escalation';
import {
  act,
  applyCrashFrame,
  createClock,
  createGame,
  jumpTarget,
  startGame,
  STEP,
  type Action,
  type GameState,
  type Hat,
} from './simulation';
import { GameRenderer } from './renderer';
import { ponyUnlocked, type PonyId } from './cosmetics';
import {
  applyChallenge,
  challengeUnlocked,
  type ChallengeRule,
} from './challenge-rules';
import { HorseAudio } from './audio';
import { replayFrame } from './replay';
import {
  defaultSave,
  finishRound,
  readSave,
  writeSave,
  type SaveData,
} from './storage';
import { CrashWorld, initPhysics } from './crash';
import { saveIncident } from './sharing';
import { modifiers, worldById, type Ability, type WorldId } from './content';
import { recordPerkEvent } from './effects/perk-motion';
import {
  newRun,
  beginAttempt,
  settleAttempt,
  takeRelic,
  buyEquipment,
  buyInsurance,
  reroll,
  nextStage,
  items,
  objective,
  parseChallenge,
  dailyRecordKey,
  type RunMode,
  type RunState,
} from './run';
export type Screen = 'home' | 'briefing' | 'game' | 'results' | 'pitstop';
export interface ViewState {
  game: GameState;
  save: SaveData;
  run: RunState | null;
  screen: Screen;
  ready: boolean;
  error: string;
  graphicsLost: boolean;
  newBest: boolean;
  newHats: Hat[];
  fps: number;
}
export interface Recording {
  contentVersion?: number;
  appearance?: { hat: Hat; ponyId?: PonyId; gentle: boolean; reduced: boolean };
  frames: GameState[];
  events: GameState['events'];
  duration: number;
}
export class GameController {
  state = createGame();
  save = defaultSave();
  run: RunState | null = null;
  screen: Screen = 'home';
  renderer: GameRenderer;
  audio = new HorseAudio();
  ready = false;
  error = '';
  graphicsLost = false;
  newBest = false;
  newHats: Hat[] = [];
  fps = 60;
  private clock = createClock();
  private raf = 0;
  private last = 0;
  private lastPublish = 0;
  private frames: GameState[] = [];
  private attemptAppearance: Recording['appearance'];
  private recordedEvents: GameState['events'] = [];
  private recordTick = 0;
  private recordTime = 0;
  private disposed = false;
  private held = new Set<string>();
  private storage: Storage | undefined;
  private savedRound = -1;
  private observer: ResizeObserver;
  private caption: Element | null;
  private hud: Element | null = null;
  private resizePending = false;
  private crash: CrashWorld | null = null;
  private previousSimTime = 0;
  private replayTime = 0;
  private replayEvent = 0;
  private replaySession = 0;
  private lastAssist = 0;
  constructor(
    canvas: HTMLCanvasElement,
    private onView: (v: ViewState) => void,
  ) {
    this.renderer = new GameRenderer(canvas);
    try {
      this.storage = window.localStorage;
    } catch {}
    this.save = readSave(this.storage);
    this.syncPreferences();
    // Resize the drawing buffer in the next frame, outside observer delivery.
    this.observer = new ResizeObserver(() => {
      this.resizePending = true;
    });
    this.observer.observe(canvas.parentElement ?? canvas);
    this.caption = canvas.parentElement?.querySelector('.ticker') ?? null;
    if (this.caption) this.observer.observe(this.caption);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
    canvas.addEventListener('webglcontextlost', this.graphicsInterrupted);
    canvas.addEventListener('webglcontextrestored', this.graphicsRestored);
    void Promise.all([this.renderer.load(), initPhysics()])
      .then(() => {
        if (this.disposed) return;
        this.ready = true;
        const challenge = parseChallenge(window.location.search);
        if (challenge) {
          this.run = newRun(
            challenge.mode,
            challenge.seed,
            challenge.assisted,
            challenge.date,
            challenge.rules,
          );
          this.run.target = challenge.target;
          this.run.pool = challenge.pool;
          this.screen = 'briefing';
        }
        this.publish();
      })
      .catch((e: Error) => {
        this.error = e.message;
        this.publish();
      });
    this.raf = requestAnimationFrame(this.frame);
  }
  private syncPreferences() {
    this.audio.music = this.save.music;
    this.audio.effects = this.save.effects;
    this.renderer.reduced = this.save.reduced;
    this.renderer.gentle = this.save.gentle;
    this.renderer.hat = this.save.hat;
    this.renderer.ponyId = this.save.pony;
    this.renderer.best = this.save.best;
  }
  setPreference<
    K extends
      | 'music'
      | 'effects'
      | 'reduced'
      | 'hat'
      | 'pony'
      | 'challenge'
      | 'assisted'
      | 'gentle'
      | 'primaryKey'
      | 'secondaryKey',
  >(key: K, value: SaveData[K]) {
    if (key === 'hat' && !this.save.hats.includes(value as Hat)) return;
    if (key === 'pony' && !ponyUnlocked(value as PonyId, this.save)) return;
    if (
      key === 'challenge' &&
      !challengeUnlocked(value as ChallengeRule, this.save.wins)
    )
      return;
    if (
      (key === 'primaryKey' || key === 'secondaryKey') &&
      value === this.save[key === 'primaryKey' ? 'secondaryKey' : 'primaryKey']
    )
      return;
    this.save = { ...this.save, [key]: value };
    this.persist();
    this.syncPreferences();
    this.publish();
    if (key === 'music' || key === 'effects') void this.audio.unlock();
  }
  private persist() {
    // Preferences and a quick round must not erase a tour waiting to be resumed.
    if (this.run && this.run.mode !== 'quick')
      this.save.run = !['won', 'lost'].includes(this.run.status)
        ? structuredClone(this.run)
        : null;
    writeSave(this.save, this.storage);
  }
  startRun(mode: RunMode) {
    if (!this.ready || this.graphicsLost) return;
    this.run = newRun(
      mode,
      undefined,
      this.save.assisted,
      undefined,
      this.save.challenge,
    );
    if (mode !== 'daily') this.run.pool = [...this.save.unlocked];
    this.state = createGame(this.state.round);
    this.screen = 'briefing';
    this.crash?.dispose();
    this.crash = null;
    this.renderer.reset();
    this.persist();
    void this.audio.unlock();
    this.publish();
  }
  async resumeRun() {
    if (!this.save.run || !this.ready || this.graphicsLost) return;
    this.run = structuredClone(this.save.run);
    this.screen = this.run.status === 'pitstop' ? 'pitstop' : 'briefing';
    this.state = createGame(this.state.round);
    this.publish();
    if (
      this.screen === 'briefing' &&
      (this.run.stage % 3 !== 0 || this.run.result)
    )
      await this.launch();
  }
  home() {
    this.state = createGame(this.state.round);
    this.clearInputs();
    this.clock.reset();
    this.crash?.dispose();
    this.crash = null;
    this.renderer.reset();
    this.screen = 'home';
    this.syncPreferences();
    this.persist();
    this.publish();
  }
  start(world: WorldId = this.run?.mode === 'quick' ? this.run.world : 'farm') {
    this.startRun('quick');
    void this.launch(world);
  }
  async launch(world?: WorldId) {
    if (!this.ready || !this.run || this.graphicsLost) return;
    const selected = world ?? this.run.world;
    if (!['briefing', 'playing'].includes(this.run.status)) return;
    this.ready = false;
    this.error = '';
    this.publish();
    try {
      await this.renderer.loadWorld(selected);
      if (this.disposed || this.graphicsLost) return;
      if (!beginAttempt(this.run, selected)) return;
      this.attemptAppearance = {
        hat: this.save.hat,
        ponyId: this.save.pony,
        gentle: this.save.gentle,
        reduced: this.save.reduced,
      };
      Object.assign(this.renderer, this.attemptAppearance);
      startGame(this.state);
      if (this.run.attempt > 1 || this.save.rounds > 0)
        this.state.phaseTime = 1.45;
      const equipment = items(this.run),
        mod = applyChallenge(
          modifiers(equipment, this.run.world),
          this.run.rules,
        );
      Object.assign(this.state, {
        world: this.run.world,
        equipment,
        ability: this.run.ability as Ability,
        mod,
        reactive: true,
        boss: objective(this.run).boss,
        seed: this.run.seed + this.run.stage * 719,
        disaster: (this.run.seed + this.run.stage) % 4,
        maxFlaps: mod.maxFlaps,
        flaps: mod.maxFlaps,
      });
      this.screen = 'game';
      this.clock.reset();
      this.frames = [];
      this.recordedEvents = [];
      this.previousSimTime = 0;
      this.recordTick = 0;
      this.recordTime = 0;
      this.lastAssist = 0;
      this.crash?.dispose();
      this.crash = null;
      this.renderer.reset();
      this.audio.reset();
      this.held.clear();
      this.newBest = false;
      this.newHats = [];
      this.persist();
      void this.audio.unlock();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.ready = true;
      this.publish();
    }
  }
  pitstop() {
    if (this.run?.status === 'pitstop') {
      this.screen = 'pitstop';
      this.publish();
    }
  }
  choose(id: string, replace?: string) {
    if (
      this.run &&
      (this.run.rewardTaken
        ? buyEquipment(this.run, id, replace)
        : takeRelic(this.run, id, replace))
    ) {
      this.persist();
      this.audio.event({ kind: 'ring', sound: 'equip', x: 0, y: 0 });
      this.publish();
      return true;
    }
    return false;
  }
  insurance() {
    if (this.run && buyInsurance(this.run)) {
      this.persist();
      this.publish();
    }
  }
  reroll() {
    if (this.run && reroll(this.run, this.save.unlocked)) {
      this.persist();
      this.publish();
    }
  }
  async next(playImmediately = false) {
    if (this.run && nextStage(this.run)) {
      this.screen = 'briefing';
      this.state.phase = 'title';
      this.state.world = this.run.world;
      this.persist();
      this.publish();
      // World choice belongs at the start of an act. Regular events continue
      // directly after the player's upgrade, retaining the selected world.
      if (playImmediately && this.run.stage % 3 !== 0) await this.launch();
      else void this.renderer.loadWorld(this.run.world).catch(() => {});
    }
  }
  action(action: Action, repeated = false) {
    if (!this.ready || this.graphicsLost || repeated || this.state.paused)
      return;
    if (this.screen === 'home') {
      if (action === 'primary') this.start();
      return;
    }
    if (this.screen !== 'game') return;
    void this.audio.unlock();
    if (this.state.phase === 'landing' && this.crash) {
      this.crash.action(action);
      applyCrashFrame(this.state, this.crash.snapshot());
    } else act(this.state, action, repeated);
    this.drainEvents();
    this.publish();
  }
  pointerDown(id: string, action: Action) {
    if (this.held.has(id)) return;
    this.held.add(id);
    this.action(action);
  }
  pointerUp(id: string) {
    this.held.delete(id);
  }
  clearInputs() {
    this.held.clear();
  }
  cancelPointer() {
    this.clearInputs();
    this.pause(true);
  }
  pause(paused?: boolean) {
    if (this.screen !== 'game') return;
    this.state.paused = this.graphicsLost || (paused ?? !this.state.paused);
    this.clearInputs();
    this.clock.reset();
    if (this.state.paused) this.audio.pause();
    else void this.audio.unlock();
    this.publish();
  }
  replayIncident() {
    if (this.screen !== 'results' || !this.frames.length) return;
    this.state.phase = 'replay';
    this.screen = 'game';
    this.replayTime = 0;
    this.replayEvent = 0;
    this.replaySession++;
    this.state.paused = false;
    this.renderer.reset();
    this.audio.reset();
    void this.audio.unlock();
    this.publish();
  }
  skipReplay() {
    if (this.state.phase === 'replay') {
      this.state.phase = 'results';
      this.screen = 'results';
      this.renderer.reset();
      this.publish();
    }
  }
  recording(): Recording {
    const frames = this.frames.map((f) => structuredClone(f));
    return {
      contentVersion: this.state.contentVersion,
      appearance: this.attemptAppearance
        ? { ...this.attemptAppearance }
        : {
            hat: this.renderer.hat,
            ponyId: this.renderer.ponyId,
            gentle: this.renderer.gentle,
            reduced: this.renderer.reduced,
          },
      frames,
      events: structuredClone(
        this.recordedEvents.filter(
          (e) => e.time !== undefined && e.time >= (frames[0]?.time ?? 0),
        ),
      ),
      duration: frames.length ? frames.at(-1)!.time - frames[0].time : 0,
    };
  }
  private keyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.closest(
        '[role="dialog"],input,textarea,select,[contenteditable="true"]',
      )
    )
      return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (!e.repeat) {
        this.pause();
        e.preventDefault();
      }
      return;
    }
    if (![this.save.primaryKey, this.save.secondaryKey].includes(e.code))
      return;
    if (target.closest('button,a') && e.code === 'Space') return;
    e.preventDefault();
    if (e.repeat || this.held.has(e.code)) return;
    this.held.add(e.code);
    this.action(e.code === this.save.primaryKey ? 'primary' : 'secondary');
  };
  private keyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };
  private blur = () => {
    this.clearInputs();
    if (this.screen === 'game') this.pause(true);
    else this.audio.pause();
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };
  private graphicsInterrupted = (event: Event) => {
    event.preventDefault();
    this.graphicsLost = true;
    this.blur();
    this.clock.reset();
    this.publish();
  };
  private graphicsRestored = () => {
    // Pixi restores its GL systems in another listener on this same event.
    queueMicrotask(() => {
      if (this.disposed) return;
      try {
        this.renderer.restoreGraphics();
        this.graphicsLost = false;
        this.last = 0;
      } catch {
        this.error =
          'The picture could not recover. Reload to return to your saved event.';
      }
      this.publish();
    });
  };
  private drainEvents() {
    const events = [...this.state.events, ...(this.crash?.drain() ?? [])];
    this.state.events = [];
    for (const e of events) {
      const recorded = {
        ...recordPerkEvent(e, this.state),
        time: this.recordTime,
      };
      if (e.freeze && this.state.reactive && this.state.phase === 'landing')
        this.state.hitStop = Math.max(this.state.hitStop, e.freeze);
      this.audio.event(recorded);
      this.renderer.event(recorded);
      this.recordedEvents.push(recorded);
    }
    if (this.recordedEvents.length > 1500)
      this.recordedEvents.splice(0, this.recordedEvents.length - 1500);
    return events.length > 0;
  }
  private complete() {
    if (this.savedRound === this.state.round) return;
    this.savedRound = this.state.round;
    // Include the final physics tick even when it falls between replay samples.
    // Keep its landing pose; the results phase resets phaseTime to zero.
    const last = this.frames.at(-1);
    if (last) {
      this.frames.push({
        ...this.state,
        outfit: { hat: this.renderer.hat, ponyId: this.renderer.ponyId },
        phase: 'landing',
        phaseTime:
          last.phaseTime +
          Math.max(0, this.state.time - (last.sceneTime ?? last.time)),
        time: this.recordTime,
        sceneTime: this.state.time,
        events: [],
        rings: [...this.state.rings],
      });
      if (this.frames.length > 2400) this.frames.shift();
    }
    this.newBest = this.state.distance > this.save.best;
    const next = finishRound(this.save, this.state);
    this.newHats = next.hats.filter((h) => !this.save.hats.includes(h));
    this.save = next;
    if (this.run) {
      settleAttempt(
        this.run,
        {
          distance: this.state.distance,
          style: this.state.style,
          havoc: this.state.havoc,
          failed: this.state.failed,
          bossHits: this.state.bossHits,
          disaster: worldById(this.state.world).disasters[
            this.state.disaster % 4
          ],
        },
        this.save.unlocked,
      );
      if (this.run.status === 'won' && this.run.mode !== 'quick') {
        this.save.wins++;
        if (this.run.mode === 'daily') {
          const key = dailyRecordKey(this.run);
          if (key)
            this.save.daily[key] = Math.max(
              this.save.daily[key] ?? 0,
              this.run.score,
            );
        }
      }
    }
    this.screen = 'results';
    void saveIncident({
      id: `incident-${Date.now()}`,
      name: worldById(this.state.world).disasters[this.state.disaster % 4],
      distance: this.state.distance,
      havoc: this.state.havoc,
      created: Date.now(),
      recording: this.recording(),
    });
    this.persist();
    this.syncPreferences();
    this.audio.event({
      kind: 'record',
      sound: this.run?.status === 'lost' ? 'lose' : 'win',
      x: this.state.x,
      y: 0,
    });
  }
  exporting = false;
  observeHud(element: Element | null) {
    if (this.hud) this.observer.unobserve(this.hud);
    this.hud = element;
    if (element) this.observer.observe(element);
    this.resizePending = true;
  }
  setExporting(active: boolean) {
    this.exporting = active;
    if (active) this.audio.pause();
    else void this.audio.unlock();
  }
  private frame = (now: number) => {
    if (this.disposed) return;
    if (this.resizePending) {
      this.resizePending = false;
      const canvasTop = this.renderer.canvas.getBoundingClientRect().top;
      this.renderer.hudInset = Math.max(
        80,
        (this.hud?.getBoundingClientRect().bottom ?? canvasTop) -
          canvasTop +
          12,
      );
      this.renderer.resize(
        undefined,
        undefined,
        this.caption?.getBoundingClientRect().height ?? 0,
      );
    }
    const elapsed = this.last ? (now - this.last) / 1000 : 1 / 60;
    const dt = Math.min(0.1, elapsed);
    this.last = now;
    this.renderer.observeFrame(
      elapsed,
      !this.exporting &&
        !this.graphicsLost &&
        !this.state.paused &&
        (this.screen === 'game' || this.state.phase === 'replay'),
    );
    if (this.exporting || this.graphicsLost) {
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    this.fps = this.fps * 0.95 + (1 / Math.max(0.001, dt)) * 0.05;
    const previous = this.state.phase;
    if (this.ready && this.state.phase !== 'replay')
      this.clock.advance(this.state, dt, () => {
        if (
          this.state.phase === 'runup' &&
          this.run?.assisted &&
          this.state.time - this.lastAssist > 0.15 &&
          [...this.held].some(
            (id) => id === this.save.primaryKey || id.includes('primary'),
          )
        ) {
          act(this.state, 'primary');
          this.lastAssist = this.state.time;
        }
        if (this.state.phase === 'landing' && this.state.reactive) {
          this.crash ??= new CrashWorld(this.state);
          if (this.state.time > this.previousSimTime) this.crash.step(STEP);
          applyCrashFrame(this.state, this.crash.snapshot());
        }
        this.previousSimTime = this.state.time;
        this.recordTime += STEP;
        const beat = this.drainEvents();
        this.recordTick++;
        if (
          (beat || this.recordTick % 4 === 0) &&
          ['flight', 'landing'].includes(this.state.phase)
        ) {
          this.frames.push({
            ...this.state,
            outfit: { hat: this.renderer.hat, ponyId: this.renderer.ponyId },
            time: this.recordTime,
            sceneTime: this.state.time,
            events: [],
            rings: [...this.state.rings],
          });
          while (
            this.frames.length > 1 &&
            this.frames[1].time < this.recordTime - INCIDENT_WINDOW
          )
            this.frames.shift();
          if (this.frames.length > 2400) this.frames.shift();
        }
      });
    if (this.state.phase !== 'replay') this.drainEvents();
    if (this.state.phase === 'results' && previous !== 'results')
      this.complete();
    let render = this.state;
    if (this.state.phase === 'replay' && this.frames.length) {
      if (!this.state.paused) this.replayTime += dt * 0.7;
      const base = this.frames[0].time,
        at = base + this.replayTime;
      render = replayFrame(this.frames, at);
      while (this.replayEvent < this.recordedEvents.length) {
        const e = this.recordedEvents[this.replayEvent];
        if ((e.time ?? 0) > at) break;
        if ((e.time ?? 0) >= base) {
          this.audio.event({
            ...e,
            id: `replay-${this.replaySession}-${this.replayEvent}`,
          });
          this.renderer.event(e);
        }
        this.replayEvent++;
      }
      if (at >= this.frames.at(-1)!.time) this.skipReplay();
    }
    this.renderer.draw(render, this.state.paused ? 0 : dt, render.time);
    this.audio.tick(render);
    if (now - this.lastPublish > 70 || previous !== this.state.phase) {
      this.publish();
      this.lastPublish = now;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
  publish() {
    this.onView({
      game: { ...this.state, events: [], rings: [...this.state.rings] },
      save: this.save,
      run: this.run ? structuredClone(this.run) : null,
      screen: this.screen,
      ready: this.ready && !this.graphicsLost,
      error: this.error,
      graphicsLost: this.graphicsLost,
      newBest: this.newBest,
      newHats: this.newHats,
      fps: Math.round(this.fps),
    });
  }
  snapshot() {
    return {
      phase: this.state.phase,
      screen: this.screen,
      paused: this.state.paused,
      x: this.state.x,
      y: this.state.y,
      speed: this.state.speed,
      flaps: this.state.flaps,
      flips: this.state.flips,
      distance: this.state.distance,
      flightDistance: this.state.flightDistance,
      style: this.state.style,
      havoc: this.state.havoc,
      quality: this.state.quality,
      landing: this.state.landing,
      failed: this.state.failed,
      ready: this.ready,
      jump: jumpTarget(this.state),
      fps: Math.round(this.fps),
      audio: this.audio.context?.state ?? 'locked',
      run: this.run,
    };
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibility);
    this.renderer.canvas.removeEventListener(
      'webglcontextlost',
      this.graphicsInterrupted,
    );
    this.renderer.canvas.removeEventListener(
      'webglcontextrestored',
      this.graphicsRestored,
    );
    this.crash?.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
