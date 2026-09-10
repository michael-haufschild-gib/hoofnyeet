import {
  act,
  applyCrashFrame,
  createClock,
  createGame,
  type Action,
  type GameState,
  type Hat,
} from './simulation';
import { GameRenderer } from './renderer';
import { type PonyId } from './catalogue/cosmetics';
import { HorseAudio } from './audio';
import { replayLeadIn } from './replay';
import { defaultSave, readSave, writeSave, type SaveData } from './storage';
import { CrashWorld, initPhysics } from './crash';
import { type WorldId } from './content';
import { type Campaign } from './campaign';
import {
  takeRelic,
  buyEquipment,
  buyInsurance,
  reroll,
  nextStage,
  type RunMode,
  type RunState,
} from './run';
import {
  buildRecording,
  sessionSnapshot,
  viewState,
} from './session/session-view';
import {
  bindSession,
  handleKeyDown,
  restorePicture,
  unbindSession,
} from './session/session-input';
import { applyPreference } from './session/session-preferences';
import {
  beginRun,
  chooseCampaign,
  startChallengeLink,
} from './session/session-progress';
import { launchLevel } from './session/level-preparation';
import { advanceFrame, drainEvents } from './session/frame-loop';

/** The interface surface currently on screen. */
export type Screen = 'home' | 'briefing' | 'game' | 'results' | 'pitstop';

/**
 * One published reading of the session for React.
 *
 * Every field is a copy, so holding a view state cannot mutate the live
 * session. `ready` folds in the picture's health: a lost WebGL context reads
 * as not ready even once loading has finished. `preparation` is non-null only
 * while a course is loading, and `fps` is a smoothed whole number.
 */
export interface ViewState {
  game: GameState;
  save: SaveData;
  run: RunState | null;
  screen: Screen;
  ready: boolean;
  error: string;
  graphicsLost: boolean;
  preparation: { world: WorldId; progress: number; failed: boolean } | null;
  tutorial: boolean;
  newBest: boolean;
  newTourBest: boolean;
  newHats: Hat[];
  wardrobe: { hat: Hat; loading: boolean; error: string } | null;
  fps: number;
}

/**
 * A shareable incident: the retained frames, the events that dressed them and
 * the outfit they were performed in.
 *
 * `duration` is in seconds of recording clock, which includes hit freezes.
 * `contentVersion` lets a later build reject a recording it can no longer
 * reproduce.
 */
export interface Recording {
  contentVersion?: number;
  appearance?: { hat: Hat; ponyId?: PonyId; gentle: boolean; reduced: boolean };
  frames: GameState[];
  events: GameState['events'];
  duration: number;
}

/**
 * Owns one play session: the save, the run, the input, the frame loop and the
 * renderer it drives.
 *
 * Construction starts the animation loop immediately, so the title screen
 * paints while the artwork is still loading. Every state change ends in
 * `publish`, which is the only way the interface hears about it. Call
 * `dispose` to release the listeners, the physics world and the canvas.
 */
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
  preparation: ViewState['preparation'] = null;
  tutorial = false;
  newBest = false;
  newTourBest = false;
  newHats: Hat[] = [];
  wardrobe: ViewState['wardrobe'] = null;
  hatRequest = 0;
  fps = 60;
  clock = createClock();
  raf = 0;
  last = 0;
  lastPublish = 0;
  frames: GameState[] = [];
  attemptAppearance: Recording['appearance'];
  recordedEvents: GameState['events'] = [];
  recordTick = 0;
  recordTime = 0;
  disposed = false;
  held = new Set<string>();
  storage: Storage | undefined;
  savedRound = -1;
  observer: ResizeObserver;
  caption: Element | null;
  hud: Element | null = null;
  resizePending = false;
  pausedPictureReady = false;
  crash: CrashWorld | null = null;
  previousSimTime = 0;
  replayTime = 0;
  replayEvent = 0;
  replaySession = 0;
  lastAssist = 0;
  preparationId = 0;
  preparationInterrupted = false;
  abilityIcons = new Map<string, HTMLImageElement>();
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
    bindSession(this, canvas);
    void Promise.all([this.renderer.load(), initPhysics()])
      .then(() => {
        if (this.disposed) return;
        this.ready = true;
        startChallengeLink(this, window.location.search);
        this.publish();
      })
      .catch((e: Error) => {
        this.error = e.message;
        this.publish();
      });
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Pushes the saved settings onto the audio and drawing owners. */
  syncPreferences() {
    this.pausedPictureReady = false;
    this.audio.music = this.save.music;
    this.audio.effects = this.save.effects;
    this.renderer.reduced = this.save.reduced;
    this.renderer.gentle = this.save.gentle;
    this.renderer.hat = this.save.hat;
    this.renderer.ponyId = this.save.pony;
    this.renderer.best = this.save.best;
  }

  /**
   * Changes one saved setting, persists it and republishes.
   *
   * A locked pony, a locked challenge, an unowned hat or a key already bound
   * to the other control is rejected silently. Choosing a hat whose artwork is
   * not resident yet defers the change until it loads.
   */
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
    applyPreference(this, key, value);
  }

  /** Writes the save, keeping a resumable tour alongside it. */
  persist() {
    // Preferences and a quick round must not erase a tour waiting to be resumed.
    if (this.run && this.run.mode !== 'quick')
      this.save.run = !['won', 'lost'].includes(this.run.status)
        ? structuredClone(this.run)
        : null;
    writeSave(this.save, this.storage);
  }

  /** Starts a fresh run of `mode` and shows its briefing. */
  startRun(mode: RunMode, campaign = this.save.campaign) {
    beginRun(this, mode, campaign);
  }

  /** Picks the storyline for a tour that has not taken its first attempt. */
  selectCampaign(campaign: Campaign) {
    chooseCampaign(this, campaign);
  }

  /**
   * Reopens the saved tour where it left off.
   *
   * A stage that is mid-act, or one already carrying a result, launches
   * straight into its course instead of stopping on the briefing.
   */
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

  /** Abandons whatever is on screen and returns to the title. */
  home() {
    this.tutorial = false;
    this.preparationId++;
    this.preparation = null;
    this.error = '';
    this.ready = this.renderer.ready;
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

  /** Starts a one-off round, defaulting to the world a quick run is already on. */
  start(world: WorldId = this.run?.mode === 'quick' ? this.run.world : 'farm') {
    this.startRun('quick');
    void this.launch(world);
  }

  /** Prepares a course and drops the player into it. */
  async launch(world?: WorldId) {
    await launchLevel(this, world);
  }

  /** Opens the between-stage shop when the run has reached one. */
  pitstop() {
    if (this.run?.status === 'pitstop') {
      this.screen = 'pitstop';
      this.publish();
    }
  }

  /**
   * Takes the stage reward or buys an item, optionally replacing one held.
   *
   * Returns false when the run cannot afford it or the slot cannot be filled,
   * leaving the save untouched.
   */
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

  /** Buys the run one retry, if it can afford one. */
  insurance() {
    if (this.run && buyInsurance(this.run)) {
      this.persist();
      this.publish();
    }
  }

  /** Pays to redraw the shop's offer, if the run can afford it. */
  reroll() {
    if (this.run && reroll(this.run, this.save.unlocked)) {
      this.persist();
      this.publish();
    }
  }

  /**
   * Advances the run to its next stage.
   *
   * World choice belongs at the start of an act, so `playImmediately` only
   * skips the briefing for a stage inside one; otherwise the next world's
   * artwork is fetched in the background while the player chooses.
   */
  async next(playImmediately = false) {
    if (this.run && nextStage(this.run)) {
      this.screen = 'briefing';
      this.state.phase = 'title';
      this.state.world = this.run.world;
      this.persist();
      this.publish();
      if (playImmediately && this.run.stage % 3 !== 0) await this.launch();
      else void this.renderer.loadWorld(this.run.world).catch(() => {});
    }
  }

  /**
   * Applies one control press, from the keyboard or a pointer.
   *
   * Ignored while paused, unready or picture-less. On the title the primary
   * control starts a quick round; during a landing it steers the ragdoll
   * instead of the pony.
   */
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
    drainEvents(this);
    this.publish();
  }

  /** Presses a control, ignoring a pointer already held down. */
  pointerDown(id: string, action: Action) {
    if (this.held.has(id)) return;
    this.held.add(id);
    this.action(action);
  }

  /** Releases one held pointer. */
  pointerUp(id: string) {
    this.held.delete(id);
  }

  /** Forgets every held control, so nothing repeats across a screen change. */
  clearInputs() {
    this.held.clear();
  }

  /** Treats a cancelled gesture as leaving the game, which pauses it. */
  cancelPointer() {
    this.clearInputs();
    this.pause(true);
  }

  /**
   * Pauses or resumes play, toggling when `paused` is omitted.
   *
   * The tutorial and a lost picture hold the pause regardless of the request,
   * because neither can be played through.
   */
  pause(paused?: boolean) {
    if (this.screen !== 'game') return;
    this.state.paused =
      this.tutorial || this.graphicsLost || (paused ?? !this.state.paused);
    this.clearInputs();
    this.clock.reset();
    this.pausedPictureReady = false;
    if (this.state.paused) this.audio.pause();
    else void this.audio.unlock();
    this.publish();
  }

  /** Closes the control guide for good and resumes if the tab is visible. */
  dismissTutorial() {
    if (!this.tutorial) return;
    this.tutorial = false;
    this.save.controlsSeen = true;
    this.persist();
    this.pause(document.hidden || this.graphicsLost);
  }

  /**
   * Replays the retained incident from the results screen.
   *
   * The lead-in re-fires the effects that were already alive when the window
   * opens, so the cut starts mid-carnage rather than on a clean stage.
   */
  replayIncident() {
    if (this.screen !== 'results' || !this.frames.length) return;
    this.state.phase = 'replay';
    this.screen = 'game';
    this.replayTime = 0;
    this.replayEvent = 0;
    this.replaySession++;
    this.state.paused = false;
    this.renderer.reset();
    for (const event of replayLeadIn(
      this.recordedEvents,
      this.frames,
      this.frames[0].time,
    ))
      this.renderer.event(event);
    this.audio.reset();
    void this.audio.unlock();
    this.publish();
  }

  /** Cuts the replay short and returns to the results screen. */
  skipReplay() {
    if (this.state.phase === 'replay') {
      this.state.phase = 'results';
      this.screen = 'results';
      this.renderer.reset();
      this.publish();
    }
  }

  /** A deep copy of the retained incident, safe to store or share. */
  recording(): Recording {
    return buildRecording(this);
  }

  /** Keyboard entry point, retained so it can be unsubscribed on dispose. */
  keyDown = (e: KeyboardEvent) => handleKeyDown(this, e);

  /** Releases a key so its control can fire again. */
  keyUp = (e: KeyboardEvent) => {
    this.held.delete(e.code);
  };

  /** Leaving the window drops held controls and stops the sound. */
  blur = () => {
    if (this.preparation) this.preparationInterrupted = true;
    this.clearInputs();
    if (this.screen === 'game') this.pause(true);
    else this.audio.pause();
  };

  /** A hidden tab is treated exactly as a lost focus. */
  visibility = () => {
    if (document.hidden) this.blur();
  };

  /** A lost WebGL context stops play and asks the browser for a restore. */
  graphicsInterrupted = (event: Event) => {
    event.preventDefault();
    this.graphicsLost = true;
    this.blur();
    this.clock.reset();
    this.publish();
  };

  /** Rebuilds the picture once the browser hands the context back. */
  graphicsRestored = () => {
    // A microtask can run between native event listeners. Wait until the
    // complete restored-event dispatch finishes before touching Pixi's caches.
    setTimeout(() => restorePicture(this), 0);
  };

  exporting = false;

  /** Watches the HUD so the camera can keep the pony clear of it. */
  observeHud(element: Element | null) {
    if (this.hud) this.observer.unobserve(this.hud);
    this.hud = element;
    if (element) this.observer.observe(element);
    this.resizePending = true;
  }

  /** Hands the frame loop to an external driver, such as a capture harness. */
  setExporting(active: boolean) {
    this.exporting = active;
    if (active) this.audio.pause();
    else void this.audio.unlock();
  }

  /** The animation-frame callback, retained so it can be cancelled. */
  frame = (now: number) => advanceFrame(this, now);

  /** Publishes the current session to the interface. */
  publish() {
    this.onView(viewState(this));
  }

  /** Flat reading of the live simulation, for the browser suite. */
  snapshot() {
    return sessionSnapshot(this);
  }

  /** Releases the listeners, the physics world, the audio and the canvas. */
  dispose() {
    this.preparationId++;
    this.disposed = true;
    this.abilityIcons.clear();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    unbindSession(this, this.renderer.canvas);
    this.crash?.dispose();
    this.audio.dispose();
    this.renderer.dispose();
  }
}
