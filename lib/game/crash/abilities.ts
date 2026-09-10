import { CRASH_DURATION } from '../catalogue/escalation';
import type { GameState } from '../simulation';
import type { Demolition } from './demolition';
import type { CarnageLog } from './log';
import { SCALE, type CrashStage, type Piece } from './stage';

/**
 * The run's one signature move and everything it sets in motion afterwards.
 * `ready` is false once the move is spent, `at` is the crash-clock second it
 * fired (-10 before then, so ages read as long past), and the per-frame
 * releases finish the moves that resolve a beat or a second later.
 */
export class Abilities {
  ready = true;
  at = -10;
  private springSpeed = 0;
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
    private demolition: Demolition,
  ) {}
  /** Spends the signature move and plays it out from the wreck's position. */
  use() {
    this.ready = false;
    this.at = this.stage.elapsed;
    const pos = this.stage.focus.translation();
    const at = { x: pos.x, y: pos.y };
    switch (this.s.ability) {
      case 'eject':
        this.abilityEject(at);
        break;
      case 'honk':
        this.abilityHonk();
        break;
      case 'ghost':
        this.abilityGhost(at);
        break;
      case 'blackhole':
        this.abilityBlackhole();
        break;
      case 'spring':
        this.abilitySpring();
        break;
      case 'dynamite':
        this.abilityDynamite(at);
        break;
    }
  }
  private abilityEject(at: { x: number; y: number }) {
    this.demolition.disassemble();
    this.stage.possess(this.stage.head);
    const head = this.stage.head.translation();
    const dx = Math.max(at.x, head.x) - head.x;
    const dy = at.y - 0.8 - head.y;
    // Carry attached headwear too; an old crown joint otherwise drags
    // the ejected head all the way back to its previous resting place.
    for (const body of this.stage.connectedBodies().values()) {
      const to = body.translation();
      body.setTranslation({ x: to.x + dx, y: to.y + dy }, true);
    }
    this.stage.propel(8, 16, 25);
    this.log.caption = 'FORWARD ALL MAIL TO MY HEAD.';
    this.log.emit('eject');
  }
  private abilityHonk() {
    for (const p of this.stage.pieces.values())
      if (!p.boss && p.body !== this.stage.focus) {
        p.activated = true;
        p.body.applyImpulse({ x: 22, y: -4 }, true);
      }
    this.stage.propel(12, 6);
    this.log.caption = 'HONK IF YOU REQUIRE MEDICAL ATTENTION.';
    this.log.emit('honk');
    this.log.flash = 0.5;
  }
  private abilityGhost(at: { x: number; y: number }) {
    const x = at.x * SCALE,
      y = at.y * SCALE;
    const target = this.nearestProp(at);
    if (target) {
      this.stage.possess(target.body);
      target.activated = true;
      target.tint = 0x91fff0;
      this.stage.propel(8, 14, this.stage.has('ghostly') ? 25 : 18);
    } else {
      this.stage.possess(this.stage.spawn('ghost', x, y, 80, 100, true).body);
      this.stage.propel(8, 14, 18);
    }
    this.stage.spawn('ghost', x, y - 100, 80, 100, true);
    this.log.caption = 'NEW BODY. SAME TERRIBLE DRIVER.';
    this.log.emit('ghost');
  }
  private nearestProp(at: { x: number; y: number }) {
    return [...this.stage.pieces.values()]
      .filter(
        (p) =>
          !p.horse &&
          !p.boss &&
          p.body.isDynamic() &&
          Math.hypot(
            p.body.translation().x - at.x,
            p.body.translation().y - at.y,
          ) < 15,
      )
      .sort((a, b) => {
        const distance = (piece: Piece) => {
          const to = piece.body.translation();
          return (
            Math.hypot(to.x - at.x, to.y - at.y) + (to.x < at.x - 1 ? 15 : 0)
          );
        };
        return distance(a) - distance(b);
      })[0];
  }
  private abilityBlackhole() {
    this.log.caption = 'PLEASE KEEP ALL LIMBS INSIDE THE SINGULARITY.';
    this.log.emit('blackhole');
  }
  private abilitySpring() {
    this.springSpeed = Math.max(0, this.stage.focus.linvel().x);
    this.stage.focus.setLinvel({ x: this.springSpeed * 0.6, y: 0 }, true);
    this.log.caption = 'YOUR SPINE IS BUFFERING…';
  }
  private abilityDynamite(at: { x: number; y: number }) {
    const x = at.x * SCALE,
      y = at.y * SCALE;
    this.demolition.disassemble();
    this.demolition.burst(x, y, this.stage.has('loose') ? 30 : 22);
    this.log.cueSound(
      this.log.gore('nuclear', x, y, 1, this.stage.focus.handle),
      'nuclear',
    );
    this.log.caption = 'THE DIAPER WAS LOAD-BEARING.';
  }
  /** Fires the coiled spring 0.22 s after it was wound, once. */
  releaseSpring() {
    if (
      this.s.ability !== 'spring' ||
      this.at < 0 ||
      this.stage.elapsed - this.at < 0.22 ||
      this.log.done('spring-release')
    )
      return;
    this.log.mark('spring-release');
    this.stage.propel(
      this.stage.has('beans') ? 14 : 8,
      15,
      Math.max(this.stage.has('beans') ? 30 : 24, this.springSpeed),
    );
    if (this.stage.has('beans')) this.log.combination('gas-spring');
    this.log.caption = 'SPINAL TAP. THE SEQUEL.';
    this.log.emit('rebound', undefined, undefined, 0.9, 0.04);
  }
  private attracting() {
    return (
      (this.stage.has('magnet') &&
        (this.stage.elapsed < CRASH_DURATION ||
          this.stage.elapsed < this.stage.boostUntil)) ||
      (this.s.ability === 'blackhole' && this.stage.elapsed - this.at < 1)
    );
  }
  /** Pulls loose scenery toward the wreck for one tick of `dt` seconds. */
  applyAttraction(dt: number) {
    if (!this.attracting()) return;
    const center = this.stage.focus.translation();
    const reach = this.stage.has('magnet') ? 15 : 10;
    for (const p of this.stage.pieces.values()) {
      if (p.horse || p.boss) continue;
      const v = p.body.translation(),
        dx = center.x - v.x,
        dy = center.y - v.y,
        len = Math.max(1, Math.hypot(dx, dy));
      if (len < reach)
        p.body.applyImpulse(
          { x: (dx / len) * dt * 25, y: (dy / len) * dt * 25 },
          true,
        );
    }
  }
  /** Collapses the singularity one second after it opened, once. */
  releaseBlackhole() {
    if (
      this.s.ability !== 'blackhole' ||
      this.at < 0 ||
      this.stage.elapsed - this.at < 1 ||
      this.log.done('blackhole-release')
    )
      return;
    this.log.mark('blackhole-release');
    const p = this.stage.focus.translation();
    this.demolition.burst(
      p.x * SCALE,
      p.y * SCALE,
      this.stage.has('magnet') ? 30 : 22,
    );
    this.log.caption = 'GRAVITY HAS BEEN REVOKED.';
  }
  /** True while a move has fired but its delayed release has not. */
  pending() {
    return (
      this.at >= 0 &&
      ((this.s.ability === 'spring' && !this.log.done('spring-release')) ||
        (this.s.ability === 'blackhole' && !this.log.done('blackhole-release')))
    );
  }
}
