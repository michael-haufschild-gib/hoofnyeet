import type { CarnageFrame, GrabState } from '../catalogue/escalation';
import type { CombinationCue } from '../catalogue/combinations';
import type { LandingId } from '../simulation';
import type { CarnageLog } from './log';
import { SCALE, type CrashStage } from './stage';

/**
 * One painted body in a wreck frame. `x`/`y` are world pixels with `y` growing
 * downward, `angle` is radians, `w`/`h` are the painted size in pixels, `tint`
 * is 0xRRGGBB multiplied over the art, `alpha` runs 0-1, `injury` counts
 * accumulated gore stages 0-3, and `arriving` marks a prop still travelling in
 * on its scripted entrance rather than under physics.
 */
export interface BodyPose {
  id: number;
  part: string;
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
  tint: number;
  alpha: number;
  boss: boolean;
  injury?: number;
  charred?: boolean;
  arriving?: boolean;
}

/**
 * One published tick of the post-landing simulation: every painted body, the
 * comedy log, the score so far, and the point the camera should follow. Times
 * are seconds since impact and positions are world pixels. Consumers treat it
 * as immutable; the world hands out a fresh frame per call.
 */
export interface CrashFrame {
  combinations?: CombinationCue[];
  settled?: boolean;
  /** Stable attachment socket, retained when the head separates or changes expression. */
  headId?: number;
  carnage?: CarnageFrame;
  bodies: BodyPose[];
  time: number;
  kicks: number;
  abilityReady: boolean;
  abilityAge: number;
  focusX: number;
  focusY: number;
  focusId?: number;
  /** Recorded controlled-body velocity supports camera anticipation after kicks. */
  velocityX?: number;
  velocityY?: number;
  havoc: number;
  bossHits: number;
  caption: string;
  flash: number;
  synergy: string;
  aftermath?: {
    id: LandingId;
    anchorX: number;
    propId?: number;
    active: boolean;
  };
}

/**
 * The per-tick state a frame needs that does not live on the stage or the log:
 * `abilityAge` is seconds since the signature move fired, `anchorX` is the
 * landing set piece's world x in pixels before `origin` is added, and `elastic`
 * says whether the rig's severed limbs trail on rubber bands.
 */
export interface FrameParts {
  settled: boolean;
  broken: boolean;
  kicks: number;
  abilityReady: boolean;
  abilityAge: number;
  grab?: GrabState;
  landing: LandingId;
  anchorX: number;
  propId?: number;
  elastic: boolean;
}

/** Builds the immutable frame the renderer, camera and recorder all read. */
export function crashFrame(
  stage: CrashStage,
  log: CarnageLog,
  parts: FrameParts,
): CrashFrame {
  const c = stage.focus.translation();
  const velocity = stage.focus.linvel();
  return {
    combinations: log.combinations,
    settled: parts.settled,
    headId: stage.head.handle,
    bodies: [...stage.pieces.values()].map((p) => ({
      id: p.body.handle,
      part: p.part,
      x: stage.origin + p.body.translation().x * SCALE,
      y: p.body.translation().y * SCALE,
      angle: p.body.rotation(),
      w: p.w,
      h: p.h,
      tint: p.tint,
      alpha: p.alpha,
      boss: p.boss,
      injury: p.injury,
      charred: p.charred,
      arriving:
        p.enterAt !== undefined && stage.elapsed < p.enterAt ? true : undefined,
    })),
    carnage: {
      cues: log.carnage.map((c) => ({ ...c })),
      grab: parts.grab
        ? { ...parts.grab, queued: [...parts.grab.queued] }
        : undefined,
      attachments: parts.broken
        ? [...stage.pieces.values()]
            .filter(
              (p) =>
                p.horse &&
                p.body !== stage.torso &&
                !['helmet', 'crown', 'eye', 'ghost-head'].includes(p.part),
            )
            .slice(0, 5)
            .map((p) => ({
              from: stage.torso.handle,
              to: p.body.handle,
              elastic: parts.elastic,
            }))
        : [],
    },
    time: stage.elapsed,
    kicks: parts.kicks,
    abilityReady: parts.abilityReady,
    abilityAge: parts.abilityAge,
    focusX: stage.origin + c.x * SCALE,
    focusY: c.y * SCALE,
    focusId: stage.focus.handle,
    velocityX: velocity.x * SCALE,
    velocityY: velocity.y * SCALE,
    havoc: log.havoc,
    bossHits: log.bossHits,
    caption: log.caption,
    flash: log.flash,
    synergy: '',
    aftermath:
      stage.elapsed >= 3.8
        ? {
            id: parts.landing,
            anchorX: stage.origin + parts.anchorX,
            propId: parts.propId,
            active: stage.elapsed >= 4.2 && stage.elapsed < 7.4,
          }
        : undefined,
  };
}
