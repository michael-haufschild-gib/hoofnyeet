import type { Catastrophe } from '../catalogue/catastrophes';
import { BOSS_SOUNDS } from '../catalogue/escalation';
import { worldById } from '../content';
import type { GameState } from '../simulation';
import type { AftermathDirector } from './aftermath';
import type { Demolition } from './demolition';
import type { GrabDirector } from './grab';
import type { HazardDirector } from './hazards';
import type { CarnageLog } from './log';
import { SCALE, type CrashStage, type Piece } from './stage';

/**
 * Contact speed in metres per second: the larger of the speed recorded just
 * before the solver ran and the speed it left behind, so a body stopped dead by
 * the impact is still scored on how hard it arrived.
 */
function speedOf(p: Piece) {
  return Math.max(
    p.impactSpeed,
    Math.hypot(p.body.linvel().x, p.body.linvel().y),
  );
}

/** Impact sound per debris part; anything unlisted clatters as wood. */
const DEBRIS_SOUNDS: Record<string, string> = {
  cabinet: 'metalcrash',
  drum: 'boing',
  pastry: 'squish',
  cheese: 'splat',
  swimring: 'water',
  piano: 'piano',
  helmet: 'metalcrash',
  officeGoose: 'stamp',
  goose: 'goose',
  sheep: 'sheep',
  ufo: 'ufo',
  ghost: 'ghost',
  donut: 'teethchomp',
  jaws: 'teethchomp',
  baler: 'baler',
  rescue: 'honk',
  jam: 'splat',
};

/** Names the crunch a scored piece of scenery makes when it is written off. */
function debrisSound(part: string) {
  return ['bone', 'skeleton', 'bonepile'].includes(part)
    ? 'boneclatter'
    : (DEBRIS_SOUNDS[part] ?? 'woodbreak');
}

/**
 * Turns one Rapier contact into consequences: gore, ignition, scored debris,
 * boss damage, the machine grab and the caption. Contacts below 1.5 m/s or
 * between two bodies nothing has woken yet are ignored, and `contactBreak`
 * records that the rig has to come apart once the contact pass is over.
 */
export class CollisionRouter {
  contactBreak = false;
  private bossPairs = new Set<string>();
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
    private demolition: Demolition,
    private after: AftermathDirector,
    private hazards: HazardDirector,
    private grabs: GrabDirector,
  ) {}
  /**
   * Routes one started Rapier contact. Either side may be missing when a body
   * struck the ground rather than another piece.
   */
  contact(spec: Catastrophe, pa: Piece | undefined, pb: Piece | undefined) {
    if (!pa || !pb) {
      this.singleContact(pa ?? pb);
      return;
    }
    this.after.contact(pa, pb);
    this.log.contactGore(pa, Math.max(speedOf(pa), speedOf(pb)));
    this.log.contactGore(pb, Math.max(speedOf(pa), speedOf(pb)));
    this.machineGrab(spec, pa, pb);
    this.after.helmetGag(pa, pb);
    if (
      Math.max(speedOf(pa), speedOf(pb)) < 1.5 ||
      (!pa.activated && !pb.activated)
    )
      return;
    this.log.combinationContact(pa, pb);
    this.breakOnContact(pa, pb);
    this.spreadContact(spec, pa, pb);
    this.scoreDebris(pa, pb);
    this.bossHit(pa, pb);
  }
  private singleContact(piece: Piece | undefined) {
    if (piece?.activated && speedOf(piece) > 1.5) this.demolition.ignite(piece);
    if (piece) this.log.contactGore(piece, speedOf(piece));
  }
  private machineGrab(spec: Catastrophe, pa: Piece, pb: Piece) {
    const machine = this.hazards.find(pa, pb);
    if (
      machine &&
      (pa.body === this.stage.focus || pb.body === this.stage.focus) &&
      ['press', 'chomp', 'roller', 'shredder'].includes(spec.mechanism) &&
      this.stage.elapsed < 3
    )
      this.grabs.offer(machine);
  }
  private breakOnContact(pa: Piece, pb: Piece) {
    if (
      this.demolition.broken ||
      this.stage.elapsed <= 0.1 ||
      pa.horse === pb.horse
    )
      return;
    if (Math.max(speedOf(pa), speedOf(pb)) > 4) this.contactBreak = true;
  }
  private spreadContact(spec: Catastrophe, pa: Piece, pb: Piece) {
    if (
      this.stage.elapsed >= this.log.verdictUntil &&
      this.hazards.holds(pa, pb)
    )
      this.log.caption = spec.punchline;
    if (pa.activated && !pb.boss) pb.activated = true;
    if (pb.activated && !pa.boss) pa.activated = true;
    this.demolition.ignite(pa);
    this.demolition.ignite(pb);
  }
  private scoreDebris(pa: Piece, pb: Piece) {
    for (const p of [pa, pb]) {
      if (p.horse || p.boss || p.scored) continue;
      p.scored = true;
      this.log.havoc += Math.round(60 * this.s.mod.havoc);
      if (this.demolition.explosive(p)) continue;
      this.log.emit(
        debrisSound(p.part),
        p.body.translation().x * SCALE,
        p.body.translation().y * SCALE,
        0.5,
      );
    }
  }
  private bossHit(pa: Piece, pb: Piece) {
    const boss = pa.boss ? pa : pb.boss ? pb : null;
    const other = pa.boss ? pb : pa;
    if (!boss) return;
    const key = String(other.body.handle);
    if (this.bossPairs.has(key)) return;
    this.bossPairs.add(key);
    this.log.bossHits++;
    if (
      this.log.bossHits >= 3 + worldById(this.s.world).act * 2 &&
      !this.log.done('boss-carnage')
    )
      this.bossCarnage(boss);
    this.log.havoc += 120;
    boss.tint = 0xffa2ac;
    this.log.flash = 0.5;
    this.log.emit(
      'metalcrash',
      boss.body.translation().x * SCALE,
      boss.body.translation().y * SCALE,
      0.7,
      0.04,
    );
    if (this.stage.elapsed >= this.log.verdictUntil)
      this.log.caption = `BOSS LIABILITY: ${this.log.bossHits} CONFIRMED INCIDENTS.`;
  }
  private bossCarnage(boss: Piece) {
    this.log.mark('boss-carnage');
    const p = boss.body.translation();
    const cue = this.log.gore(
      'boss',
      p.x * SCALE,
      p.y * SCALE,
      2,
      boss.body.handle,
    );
    this.log.cueSound(cue, BOSS_SOUNDS[this.s.world], 0.06);
  }
  /** Lights an explosive that took a hard shove without a fresh contact. */
  forces(a: Piece | undefined, b: Piece | undefined) {
    if (
      !(a?.activated || b?.activated) ||
      Math.max(a ? speedOf(a) : 0, b ? speedOf(b) : 0) < 1.5
    )
      return;
    if (a) this.demolition.ignite(a);
    if (b) this.demolition.ignite(b);
  }
}
