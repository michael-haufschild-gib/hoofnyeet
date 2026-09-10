import type { GameState } from '../simulation';
import type { CarnageLog } from './log';
import { SCALE, type CrashStage, type Piece } from './stage';

/**
 * How the wreck comes apart: blast waves, armed explosives, and the one-way
 * skeletonising that turns the intact pony into loose parts. `broken` flips
 * true the first time the rig is taken apart and never flips back. Blast
 * positions are pixels, fuses and ages are seconds on the crash clock.
 */
export class Demolition {
  broken = false;
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
    private rng: () => number,
  ) {}
  /**
   * Explodes at a world pixel position: nearby scenery is thrown outward and
   * lit, the wreck rides the blast down-track, and anything close is scorched.
   */
  burst(x: number, y: number, power = 10) {
    const focus = this.stage.focus.translation();
    const reach = Math.hypot(focus.x - x / SCALE, focus.y - y / SCALE);
    this.scatter(x, y, power);
    // Scenery scatters radially; the playable wreck rides the blast down-track.
    // A blast at its own centre must still provide horizontal propulsion.
    if (reach < 11)
      this.stage.propel(
        (5 + power * 0.45) / (1 + reach * 0.15),
        7 + power * 0.2,
      );
    this.log.gore('ignite', x, y, Math.min(2.2, power / 9));
    this.charScorch(x, y);
    if (this.stage.has('confetti')) this.log.gore('confetti', x, y, 1.5);
    this.log.flash = 1;
    this.log.emit('explosion', x, y, 0.8, 0.065);
  }
  private scatter(x: number, y: number, power: number) {
    for (const p of this.stage.pieces.values()) {
      if (p.boss) continue;
      const v = p.body.translation(),
        dx = v.x - x / SCALE,
        dy = v.y - y / SCALE,
        len = Math.max(0.6, Math.hypot(dx, dy));
      if (len >= 11) continue;
      p.activated = true;
      this.ignite(p, 0.12 + len * 0.018);
      if (p.body === this.stage.focus || (!this.broken && p.horse)) continue;
      p.body.applyImpulse(
        {
          x: ((dx / len) * power) / (1 + len * 0.2),
          y: ((dy / len - 0.55) * power) / (1 + len * 0.2),
        },
        true,
      );
    }
  }
  private charScorch(x: number, y: number) {
    for (const p of this.stage.pieces.values())
      if (
        p.horse &&
        Math.hypot(
          p.body.translation().x * SCALE - x,
          p.body.translation().y * SCALE - y,
        ) < 190
      )
        p.charred = true;
  }
  /** True when this part goes off rather than merely being thrown around. */
  explosive(p: Piece) {
    return (
      p.part === 'tnt' ||
      p.part === 'barrel' ||
      (p.part === 'piano' && this.stage.has('confetti'))
    );
  }
  /** Arms an explosive so it goes off `fuse` seconds from now. */
  ignite(p: Piece, fuse = 0.16) {
    if (!this.explosive(p) || p.detonateAt !== undefined) return;
    p.detonateAt = this.stage.elapsed + fuse;
    p.activated = true;
    p.tint = 0xff8050;
  }
  /**
   * Retires an armed piece and replaces it with a blast: the score is credited
   * once, and a possessed explosive hands control back to the offended head so
   * the camera never follows a body that has left the world.
   */
  private detonate(p: Piece) {
    const position = p.body.translation();
    const x = position.x * SCALE,
      y = position.y * SCALE;
    if (!p.scored) this.log.havoc += Math.round(60 * this.s.mod.havoc);
    p.scored = true;
    if (this.stage.focus === p.body) {
      this.stage.possess(this.stage.head);
      this.stage.head.setTranslation(position, true);
      this.stage.head.setLinvel(p.body.linvel(), true);
    }
    this.stage.retire(p);
    this.burst(x, y, 15);
  }
  /** Blows up every piece whose fuse has run out on this tick. */
  detonateDue() {
    for (const p of this.stage.pieces.values())
      if (p.detonateAt !== undefined && this.stage.elapsed >= p.detonateAt)
        this.detonate(p);
  }
  /**
   * Cuts the rig apart for good: joints are removed, the parts are repainted as
   * a skeleton, and the landing's own breakup plays out. Only the first call
   * does anything.
   */
  disassemble() {
    if (this.broken) return;
    this.broken = true;
    const at = this.stage.focus.translation();
    this.log.gore(
      'impact',
      at.x * SCALE,
      at.y * SCALE,
      2,
      this.stage.focus.handle,
    );
    for (const piece of this.stage.pieces.values())
      if (piece.horse) piece.injury = 2;
    this.stage.clearJoints();
    const torso = this.stage.pieces.get(this.stage.torso.handle);
    if (torso) {
      this.skeletonise(torso);
      this.landingBreakup();
    }
    this.spillGuts();
    this.log.caption = 'SOME ASSEMBLY REQUIRED.';
    this.log.emit(
      'boneclatter',
      this.stage.focus.translation().x * SCALE,
      this.stage.focus.translation().y * SCALE,
      0.8,
      0.08,
    );
    if (this.stage.has('confetti')) {
      const blast = this.stage.focus.translation();
      this.burst(blast.x * SCALE, blast.y * SCALE, 12);
    }
  }
  private skeletonise(torso: Piece) {
    this.stage.reskin(
      torso,
      this.s.landing === 'haystack' ? 'cube' : 'skeletal-torso',
      108,
      75,
    );
    const head = this.stage.pieces.get(this.stage.head.handle);
    if (head) this.stage.reskin(head, 'offended-head', 72, 76);
    let legIndex = 0;
    for (const piece of this.stage.pieces.values())
      if (piece.horse && piece.part === 'straightLeg') {
        this.stage.reskin(
          piece,
          [
            'skeletal-front-leg-bent',
            'skeletal-front-leg-straight',
            'skeletal-hind-leg',
            'skeletal-hind-leg-flailing',
          ][legIndex++ % 4],
          33,
          58,
        );
      }
  }
  private landingBreakup() {
    if (this.s.landing === 'accordion') {
      this.stage.torso.setLinvel(
        { x: Math.max(12, this.stage.torso.linvel().x), y: -15 },
        true,
      );
      this.log.caption = 'YOUR SPINE HAS FILED FOR SEPARATION.';
    }
    if (this.s.landing === 'mud') {
      this.stage.torso.setLinvel(
        { x: Math.max(25, this.stage.torso.linvel().x), y: 0 },
        true,
      );
      for (let i = 0; i < 5; i++) this.stage.spawn('jam', i * 45, 18, 95, 15);
    }
    if (this.s.landing === 'ballet') {
      this.stage.torso.setAngvel(9, true);
      this.stage.torso.setLinvel(
        { x: Math.max(4, this.stage.torso.linvel().x), y: -8 },
        true,
      );
    }
    if (this.s.landing === 'sheep') {
      for (let i = 0; i < 3; i++) {
        const sheep = this.stage.spawn(
          'sheep',
          this.stage.head.translation().x * SCALE + i * 45,
          -150,
          80,
          72,
        );
        sheep.body.setLinvel({ x: -5, y: 8 }, true);
      }
    }
  }
  private spillGuts() {
    for (let i = 0; i < 7; i++) {
      const p = this.stage.spawn(
        i < 2 ? (i ? 'eyeball-up' : 'eyeball-right') : 'jam',
        this.stage.focus.translation().x * SCALE,
        -70,
        20 + this.rng() * 15,
        22,
      );
      p.body.setLinvel(
        { x: (this.rng() - 0.5) * 12, y: -this.rng() * 9 },
        true,
      );
    }
  }
}
