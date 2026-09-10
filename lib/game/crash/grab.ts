import RAPIER from '@dimforge/rapier2d-compat';
import type { GrabState } from '../catalogue/escalation';
import type { Action } from '../simulation';
import type { CarnageLog } from './log';
import { SCALE, type CrashStage, type Piece } from './stage';

/**
 * The short window where a machine has hold of the wreck. While `grab` is set
 * the player's inputs are parked in `queued` and replayed the instant the joint
 * lets go, so a kick pressed mid-grab is never silently lost. A grab lasts 0.85
 * crash-clock seconds and ends with a forward shove.
 */
export class GrabDirector {
  grab: GrabState | undefined;
  private joint: RAPIER.ImpulseJoint | undefined;
  private candidate: Piece | undefined;
  private queued: Action[] = [];
  constructor(
    private stage: CrashStage,
    private log: CarnageLog,
  ) {}
  /** How many player inputs are parked behind the current grab. */
  get pending() {
    return this.queued.length;
  }
  /** Handle of the grab joint, which never counts as part of the rig. */
  get jointHandle() {
    return this.joint?.handle;
  }
  /** Nominates the machine that just caught the wreck. */
  offer(machine: Piece) {
    this.candidate = machine;
  }
  /** Starts a grab on the nominated machine, once the contact pass is over. */
  settle() {
    if (!this.candidate) return;
    this.begin(this.candidate);
    this.candidate = undefined;
  }
  /**
   * Joints the wreck to a machine within reach, for 0.85 s. Refused while
   * another grab runs, during a boost, before 0.3 s, and after 12 s.
   */
  begin(prop: Piece) {
    if (
      this.grab ||
      this.stage.elapsed < this.stage.boostUntil ||
      this.stage.elapsed > 12 ||
      this.stage.elapsed < 0.3 ||
      !this.stage.pieces.has(prop.body.handle)
    )
      return;
    const key = `grab-${prop.body.handle}`;
    if (this.log.done(key)) return;
    this.log.mark(key);
    const p = prop.body.translation(),
      c = this.stage.focus.translation();
    if (
      Math.hypot(p.x - c.x, p.y - c.y) * SCALE >
      Math.hypot(prop.w, prop.h) / 2 + 85
    )
      return;
    const angle = -prop.body.rotation(),
      dx = c.x - p.x,
      dy = c.y - p.y;
    const joint = RAPIER.JointData.revolute(
      {
        x: dx * Math.cos(angle) - dy * Math.sin(angle),
        y: dx * Math.sin(angle) + dy * Math.cos(angle),
      },
      { x: 0, y: 0 },
    );
    this.joint = this.stage.world.createImpulseJoint(
      joint,
      prop.body,
      this.stage.focus,
      true,
    );
    this.joint.setContactsEnabled(false);
    this.grab = {
      bodyId: this.stage.focus.handle,
      propId: prop.body.handle,
      at: this.stage.elapsed,
      until: this.stage.elapsed + 0.85,
      queued: [],
    };
    this.log.cueSound(
      this.log.gore(
        'grab',
        c.x * SCALE,
        c.y * SCALE,
        0.6,
        this.stage.focus.handle,
        prop.body.handle,
      ),
      'tissue-stretch',
    );
  }
  /** Ends an expired grab with a shove and replays whatever was queued. */
  update() {
    if (
      this.grab &&
      (this.stage.elapsed >= this.grab.until ||
        !this.stage.pieces.has(this.grab.propId))
    ) {
      if (this.joint?.isValid())
        this.stage.world.removeImpulseJoint(this.joint, true);
      this.joint = undefined;
      this.queued.push(...this.grab.queued);
      const p = this.stage.focus.translation();
      this.log.gore(
        'release',
        p.x * SCALE,
        p.y * SCALE,
        1.2,
        this.stage.focus.handle,
      );
      this.grab = undefined;
      this.stage.propel(8, 7);
    }
    if (
      !this.grab &&
      this.queued.length &&
      (this.queued[0] !== 'primary' ||
        this.stage.elapsed - this.stage.kickAt > 0.35)
    )
      this.stage.action(this.queued.shift()!);
  }
}
