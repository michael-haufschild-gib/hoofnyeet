import type RAPIER from '@dimforge/rapier2d-compat';
import {
  CRASH_DURATION,
  CRASH_SETTLE_SECONDS,
  NUCLEAR_LIFE,
} from '../catalogue/escalation';
import type { GameState } from '../simulation';
import type { Abilities } from './abilities';
import type { GrabDirector } from './grab';
import type { CarnageLog } from './log';
import type { CrashStage } from './stage';

/**
 * The wreck's forward-motion budget and the clock that decides when the run is
 * over. A kick or a blast buys a boost that decays over 0.65 s; the wreck only
 * counts as settling while it is slow, unheld, and actually resting on
 * something, and the incident ends after `CRASH_SETTLE_SECONDS` of that.
 */
export class Momentum {
  boostUntil = -1;
  private boostSpeed = 0;
  private quiet = 0;
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
    private grabs: GrabDirector,
    private abilities: Abilities,
  ) {}
  /** Restarts the settling clock because something loud just happened. */
  stir() {
    this.quiet = 0;
  }
  /** Advances or resets the settling clock for one tick of `dt` seconds. */
  update(dt: number) {
    this.quiet = this.grounded() ? this.quiet + dt : 0;
  }
  /**
   * Sets the whole connected rig moving at `forward` m/s plus its own forward
   * speed, capped at 32, and at least `lift` m/s upward, then opens a 0.65 s
   * window in which that speed is protected.
   */
  propel(forward: number, lift: number, minimumSpeed = 0) {
    this.quiet = 0;
    const v = this.stage.focus.linvel();
    const velocity = {
      x: Math.min(32, Math.max(minimumSpeed, Math.max(0, v.x) + forward)),
      y: Math.max(
        -16 * Math.sqrt(this.s.mod.gravity),
        Math.min(v.y, -lift * Math.sqrt(this.s.mod.gravity)),
      ),
    };
    // Delta velocity makes a kick useful even when possessing a heavy machine.
    // Carry the connected rig together so its joints do not swallow the boost.
    for (const body of this.stage.connectedBodies().values())
      body.setLinvel(velocity, true);
    this.boostSpeed = Math.max(
      this.stage.elapsed < this.boostUntil ? this.boostSpeed : 0,
      velocity.x * 0.7,
    );
    this.boostUntil = (this.grabs.grab?.until ?? this.stage.elapsed) + 0.65;
  }
  /** Restores the protected speed a pile-up stole, while the window lasts. */
  recover() {
    if (this.grabs.grab || this.stage.elapsed >= this.boostUntil) return;
    const v = this.stage.focus.linvel();
    const minimum =
      this.boostSpeed *
      Math.min(1, (this.boostUntil - this.stage.elapsed) / 0.65);
    if (v.x >= minimum) return;
    // Briefly turn pile-up recoil into a forward hop. This expires, costs no
    // extra action, and never moves a body or adds distance outside physics.
    this.stage.focus.setLinvel(
      { x: minimum, y: Math.min(v.y, -4 * Math.sqrt(this.s.mod.gravity)) },
      true,
    );
  }
  /** True when the wreck is slow, unheld and actually resting on something. */
  grounded() {
    if (
      this.grabs.grab ||
      this.grabs.pending ||
      this.abilities.pending() ||
      this.stage.elapsed < this.boostUntil
    )
      return false;
    const v = this.stage.focus.linvel();
    if (
      Math.hypot(v.x, v.y) >= 0.45 ||
      Math.abs(this.stage.focus.angvel()) >= 0.65
    )
      return false;
    // A walking cube stands on attached legs, not its own collider. Follow
    // only live joints so detached debris cannot make an airborne head land.
    const connected = this.stage.connectedBodies();
    let supported = false;
    for (const body of connected.values())
      if (this.restingOn(connected, body)) supported = true;
    return supported;
  }
  private restingOn(
    connected: Map<number, RAPIER.RigidBody>,
    body: RAPIER.RigidBody,
  ) {
    const collider = body.collider(0);
    let supported = false;
    this.stage.world.contactPairsWith(collider, (other) => {
      if (connected.has(other.parent()?.handle ?? -1)) return;
      this.stage.world.contactPair(collider, other, (manifold) => {
        if (manifold.numContacts() && Math.abs(manifold.normal().y) > 0.35)
          supported = true;
      });
    });
    return supported;
  }
  /** True once the incident is over and the run may move on. */
  get settled() {
    const blast = this.log.carnage.find((cue) => cue.kind === 'nuclear');
    return (
      this.stage.elapsed >=
        Math.max(CRASH_DURATION, blast ? blast.at + NUCLEAR_LIFE : 0) &&
      this.quiet >= CRASH_SETTLE_SECONDS
    );
  }
}
