import type RAPIER from '@dimforge/rapier2d-compat';
import type { Action } from '../simulation';

/** Pixels per physics metre; Rapier works in metres, the art in pixels. */
export const SCALE = 40;

/**
 * One rigid body in the wreck, paired with how it is painted. `w`/`h` are the
 * drawn size in pixels, `impactSpeed` is the speed in metres per second
 * recorded just before the last solver run, `detonateAt` is the crash-clock
 * second an armed explosive goes off, `injury` counts gore stages 0-3, and
 * `afterRole` marks a body the landing script owns rather than loose scenery.
 */
export interface Piece {
  body: RAPIER.RigidBody;
  part: string;
  w: number;
  h: number;
  tint: number;
  alpha: number;
  scored: boolean;
  horse: boolean;
  boss: boolean;
  activated: boolean;
  impactSpeed: number;
  detonateAt?: number;
  protected?: boolean;
  injury?: number;
  charred?: boolean;
  afterRole?: 'first' | 'surprise' | 'vehicle';
  enterAt?: number;
}

/**
 * The slice of the physics world a crash director may touch: the bodies, the
 * body it follows, and the handful of operations that keep the piece ledger,
 * the collider ledger and the Rapier world in step with one another. Positions
 * passed in are pixels unless a parameter is named for metres, and `elapsed` is
 * seconds since impact. `CrashWorld` is the only implementation.
 */
export interface CrashStage {
  readonly world: RAPIER.World;
  readonly pieces: Map<number, Piece>;
  readonly focus: RAPIER.RigidBody;
  readonly head: RAPIER.RigidBody;
  readonly torso: RAPIER.RigidBody;
  readonly elapsed: number;
  readonly origin: number;
  readonly boostUntil: number;
  readonly kickAt: number;
  /** True when the run carries the named equipment. */
  has(id: string): boolean;
  /** Points the camera and the controls at another body. */
  possess(body: RAPIER.RigidBody): void;
  spawn(
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    horse?: boolean,
    boss?: boolean,
  ): Piece;
  connect(
    a: RAPIER.RigidBody,
    b: RAPIER.RigidBody,
    aa: { x: number; y: number },
    bb: { x: number; y: number },
    fixed?: boolean,
  ): RAPIER.ImpulseJoint;
  /** Cuts every joint holding the pony rig together. */
  clearJoints(): void;
  /** Repaints a piece and refits its collider to the new art. */
  reskin(piece: Piece, part: string, width: number, height: number): void;
  /** Removes a body from the world and from every ledger that held it. */
  retire(piece: Piece): void;
  /** Sets forward and upward speed on the whole connected rig, in m/s. */
  propel(forward: number, lift: number, minimumSpeed?: number): void;
  /** The followed body plus everything still jointed to it. */
  connectedBodies(): Map<number, RAPIER.RigidBody>;
  /** Restarts the settling clock because something loud just happened. */
  stir(): void;
  /** Runs a player input now, or queues it when a grab holds the wreck. */
  action(action: Action): void;
}

/** Whichever side of a contact pair is painted as `part`, or null for neither. */
export function pieceWithPart(a: Piece, b: Piece, part: string) {
  return a.part === part ? a : b.part === part ? b : null;
}
