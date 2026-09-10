import type RAPIER from '@dimforge/rapier2d-compat';
import { artFoot, fitArt, GROUND_Y } from '../art/geometry';
import type { GameState } from '../simulation';
import type { CarnageLog } from './log';
import { SCALE, type CrashStage, type Piece } from './stage';

/**
 * Everything the landing script drops into the scene: limbs bolted to a body,
 * punchlines that fall from above, props delivered on a ballistic arc timed to
 * land near the wreck, and the rescue truck. `prop` is the piece the camera and
 * the aftermath beats currently care about, or null when nothing is in play.
 */
export class PropDrops {
  prop: Piece | null = null;
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
  ) {}
  /** Drops the tracked prop when the body behind it leaves the world. */
  forget(piece: Piece) {
    if (this.prop === piece) this.prop = null;
  }
  /**
   * Spawns `part` at an offset in the parent's own rotated frame, in pixels,
   * and joints it there so it travels with the parent.
   */
  appendage(
    parent: RAPIER.RigidBody,
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fixed = false,
  ) {
    const at = parent.translation(),
      a = parent.rotation();
    const piece = this.stage.spawn(
      part,
      at.x * SCALE + x * Math.cos(a) - y * Math.sin(a),
      at.y * SCALE + x * Math.sin(a) + y * Math.cos(a),
      w,
      h,
      true,
    );
    piece.body.setRotation(a, true);
    piece.body.setLinvel(parent.linvel(), true);
    this.stage.connect(parent, piece.body, { x, y }, { x: 0, y: 0 }, fixed);
    return piece;
  }
  /**
   * Drops a prop from above and ahead of the wreck so it lands on the wreck's
   * current course, and makes it the tracked prop.
   */
  fallingPunchline(
    part: string,
    w: number,
    h: number,
    role: Piece['afterRole'],
  ) {
    const at = this.stage.focus.translation(),
      v = this.stage.focus.linvel();
    const piece = this.stage.spawn(
      part,
      at.x * SCALE + v.x * 8,
      Math.min(-700, at.y * SCALE - 700),
      w,
      h,
    );
    piece.body.setLinvel({ x: v.x * 0.45, y: 22 }, true);
    piece.afterRole = role;
    this.prop = piece;
    return piece;
  }
  /**
   * Drops a prop on a ballistic arc timed to reach the wreck's position, with
   * `x` and `vx` overriding the lead the arc would otherwise take.
   */
  deliverProp(part: string, w: number, h: number, x?: number, vx?: number) {
    const at = this.stage.focus.translation(),
      velocity = this.stage.focus.linvel();
    const fallDistance = 1400,
      descent = 880,
      gravity = 440 * this.s.mod.gravity;
    const travel =
      (Math.sqrt(descent * descent + 2 * gravity * fallDistance) - descent) /
      gravity;
    const piece = this.stage.spawn(
      part,
      x ?? at.x * SCALE + Math.max(0, velocity.x) * SCALE * travel * 0.55,
      Math.min(-fallDistance, at.y * SCALE - fallDistance),
      w,
      h,
    );
    piece.body.setLinvel(
      { x: vx ?? Math.max(0, velocity.x) * 0.5, y: descent / SCALE },
      true,
    );
    return piece;
  }
  /** Sends the recovery truck in from off screen at 30 m/s. */
  rescue() {
    const size = fitArt('rescue', 190, 100);
    const piece = this.stage.spawn(
      'rescue',
      this.stage.focus.translation().x * SCALE - 900,
      GROUND_Y - artFoot('rescue', size.w, size.h),
      size.w,
      size.h,
    );
    piece.body.setLinvel({ x: 30, y: 0 }, true);
    piece.afterRole = 'vehicle';
    this.prop = piece;
    this.log.emit(
      'honk',
      piece.body.translation().x * SCALE,
      piece.body.translation().y * SCALE,
    );
  }
}
