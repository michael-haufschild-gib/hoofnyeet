import { visualSeed, type CarnageCue } from '../catalogue/escalation';
import {
  METAL_PARTS,
  type Combination,
  type CombinationCue,
} from '../catalogue/combinations';
import type { GameEvent, GameState } from '../simulation';
import { pieceWithPart, SCALE, type CrashStage, type Piece } from './stage';

/**
 * The running comedy record of one crash: the visual cues the renderer replays,
 * the sounds the mixer plays, the caption on screen, the score, and the set of
 * one-shot beats that have already fired. Times are seconds since impact and
 * every cue is published in world pixels, so `origin` is added on the way out.
 */
export class CarnageLog {
  carnage: CarnageCue[] = [];
  combinations: CombinationCue[] = [];
  pendingCombinations: {
    kind: Combination;
    source: Piece;
    target: Piece;
  }[] = [];
  events: GameEvent[] = [];
  caption = 'THREE KICKS. ONE TERRIBLE IDEA.';
  flash = 0;
  havoc = 0;
  bossHits = 0;
  verdictUntil = 0;
  private beats = new Set<string>();
  private lastGore = -1;
  private serial = 0;
  constructor(
    private s: GameState,
    private stage: CrashStage,
  ) {}
  /** True once the named one-shot beat has fired. */
  done(id: string) {
    return this.beats.has(id);
  }
  /** Records that the named one-shot beat has fired. */
  mark(id: string) {
    this.beats.add(id);
  }
  /** Hands over the queued sounds and starts a fresh batch. */
  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }
  /**
   * Records a one-off equipment interaction, sourced from `source` and aimed at
   * `target`, and cues its sound. A kind already recorded is ignored, so the
   * same synergy can never score twice in one incident.
   */
  combination(kind: Combination, source = this.stage.focus, target?: Piece) {
    if (this.combinations.some((cue) => cue.kind === kind)) return;
    const p = source.translation(),
      v = source.linvel(),
      t = target?.body.translation();
    const cue: CombinationCue = {
      id: `${this.s.round}-combo-${kind}`,
      kind,
      at: this.stage.elapsed,
      x: this.stage.origin + p.x * SCALE,
      y: p.y * SCALE,
      vx: v.x * SCALE,
      vy: v.y * SCALE,
      seed: visualSeed(`${this.s.seed}:${kind}`),
      bodyId: source.handle,
      targetId: target?.body.handle,
      targetX: t && this.stage.origin + t.x * SCALE,
      targetY: t && t.y * SCALE,
    };
    this.combinations = [...this.combinations, cue];
    this.events.push({
      kind: 'synergy',
      id: cue.id,
      sound: kind,
      time: this.stage.elapsed,
      x: cue.x,
      y: cue.y,
      value: 0.9,
    });
    this.stage.stir();
  }
  /** Queues whatever synergy this contact pair earns, if any. */
  combinationContact(a: Piece, b: Piece) {
    this.zapContact(a, b);
    this.encoreContact(a, b);
  }
  private queueCombination(kind: Combination, source: Piece, target: Piece) {
    if (
      this.combinations.some((c) => c.kind === kind) ||
      this.pendingCombinations.some((c) => c.kind === kind)
    )
      return;
    this.pendingCombinations.push({ kind, source, target });
  }
  private zapContact(a: Piece, b: Piece) {
    if (!this.stage.has('eyes') || !this.stage.has('magnet')) return;
    const eye = pieceWithPart(a, b, 'eye');
    const metal = eye === a ? b : a;
    if (eye && METAL_PARTS.has(metal.part))
      this.queueCombination('retina-zap', eye, metal);
  }
  private encoreContact(a: Piece, b: Piece) {
    if (!this.stage.has('piano') || !this.stage.has('ghostly')) return;
    const piano = pieceWithPart(a, b, 'piano');
    const horse = piano === a ? b : a;
    if (piano && horse.horse)
      this.queueCombination('haunted-encore', piano, horse);
  }
  /**
   * Runs `action` once, the first tick at or after `at` seconds on the crash
   * clock. Later ticks and repeat ids do nothing.
   */
  beat(id: string, at: number, action: () => void) {
    if (this.stage.elapsed < at || this.beats.has(id)) return;
    this.beats.add(id);
    action();
  }
  /**
   * Queues a sound at a world pixel position, defaulting to the followed body.
   * `value` scales loudness 0-1 and `freeze` is the hit-stop it buys, in
   * seconds.
   */
  emit(
    sound: string,
    x = this.stage.focus.translation().x * SCALE,
    y = this.stage.focus.translation().y * SCALE,
    value = 1,
    freeze = 0,
  ) {
    this.events.push({
      kind: 'crunch',
      sound,
      id: `${this.s.round}-wreck-${this.serial++}`,
      time: this.stage.elapsed,
      x: this.stage.origin + x,
      y,
      value,
      freeze,
    });
  }
  /**
   * Records a visual cue at a world pixel position for the renderer to replay,
   * returning it so the caller can attach a sound or amend it. The oldest
   * decorative cue is dropped once eighty are held.
   */
  gore(
    kind: CarnageCue['kind'],
    x: number,
    y: number,
    power: number,
    bodyId?: number,
    propId?: number,
  ): CarnageCue {
    const id = `${this.s.round}-carnage-${this.serial++}`;
    const cue: CarnageCue = {
      id,
      kind,
      at: this.stage.elapsed,
      x: this.stage.origin + x,
      y,
      seed: visualSeed(`${this.s.seed}:${id}`),
      power,
      bodyId,
      propId,
      world: this.s.world,
    };
    this.carnage.push(cue);
    // Significant scenes remain; only the oldest decorative contact is retired.
    if (this.carnage.length > 80) {
      const index = this.carnage.findIndex((c) =>
        ['impact', 'ignite', 'confetti', 'release', 'grab'].includes(c.kind),
      );
      if (index >= 0) this.carnage.splice(index, 1);
    }
    return cue;
  }
  /** Plays `sound` at a recorded cue and staples a copy of it to the event. */
  cueSound(cue: CarnageCue, sound: string, freeze = 0) {
    this.emit(
      sound,
      cue.x - this.stage.origin,
      cue.y,
      Math.min(0.9, cue.power),
      freeze,
    );
    this.events[this.events.length - 1].carnage = { ...cue };
  }
  /**
   * Adds an injury stage and a wet cue when a character part is hit at more
   * than 2.5 m/s, at most once every 0.16 s so a pile-up stays readable.
   */
  contactGore(piece: Piece, force: number) {
    if (
      !piece.horse ||
      force < 2.5 ||
      this.stage.elapsed - this.lastGore < 0.16
    )
      return;
    this.lastGore = this.stage.elapsed;
    piece.injury = Math.min(3, (piece.injury ?? 0) + 1);
    const p = piece.body.translation();
    const cue = this.gore(
      'impact',
      p.x * SCALE,
      p.y * SCALE,
      Math.min(2.2, force / 8),
      piece.body.handle,
    );
    this.cueSound(cue, force > 12 ? 'blood-bag' : 'bone-pop');
  }
  /** Puts a verdict on screen and holds it against overwrites for 1.4 s. */
  announce(text: string) {
    this.caption = text;
    this.verdictUntil = this.stage.elapsed + 1.4;
  }
}
