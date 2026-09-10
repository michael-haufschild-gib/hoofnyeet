/**
 * A frame that says nothing about steady presentation cost: the scene is idle,
 * or the delta is not a positive interval below the 0.25 s stall threshold.
 */
function unusableFrame(dt: number, active: boolean): boolean {
  return !active || !Number.isFinite(dt) || dt <= 0 || dt > 0.25;
}

/**
 * A sustained half-rate window: at least 0.6 s over 18 frames whose mean frame
 * time passes 1/42 s with more than 65% of frames late. Responds sooner than
 * the normal window to a genuinely slow scene. Eighteen samples prevent a
 * texture upload or one long task from lowering quality.
 */
function severeWindow(
  seconds: number,
  frames: number,
  lateFrames: number,
): boolean {
  return (
    seconds >= 0.6 &&
    frames >= 18 &&
    seconds / frames > 1 / 42 &&
    lateFrames / frames > 0.65
  );
}

/** The normal window has not gathered its 1.2 s or 20 frames of evidence yet. */
function shortWindow(seconds: number, frames: number): boolean {
  return seconds < 1.2 || frames < 20;
}

/** Mean frame time is past 1/55 s and more than 12% of frames arrived late. */
function overloadedWindow(
  seconds: number,
  frames: number,
  lateFrames: number,
): boolean {
  return seconds / frames > 1 / 55 && lateFrames / frames > 0.12;
}

/** Session-local presentation budget. Never alters simulation or saved preferences. */
export class RenderBudget {
  private level = 0;
  private seconds = 0;
  private frames = 0;
  private lateFrames = 0;
  private cooldown = 0.4;
  readonly maximumResolution: number;

  constructor(resolution: number) {
    this.maximumResolution = Math.max(0.5, Math.min(2, resolution || 1));
  }
  get resolution() {
    const scale = [1, 1, 0.75, 0.5][this.level];
    return Math.min(
      this.maximumResolution,
      Math.max(1, this.maximumResolution * scale),
    );
  }
  get density() {
    return [1, 0.55, 0.55, 0.35][this.level];
  }
  resetSampling() {
    this.seconds = this.frames = this.lateFrames = 0;
    this.cooldown = 0.4;
  }
  sample(dt: number, active: boolean) {
    if (unusableFrame(dt, active)) {
      this.resetSampling();
      return false;
    }
    if (this.level === 3) return false;
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return false;
    }
    this.seconds += dt;
    this.frames++;
    if (dt > 1 / 50) this.lateFrames++;
    const severe = severeWindow(this.seconds, this.frames, this.lateFrames);
    if (!severe && shortWindow(this.seconds, this.frames)) return false;
    const overloaded = overloadedWindow(
      this.seconds,
      this.frames,
      this.lateFrames,
    );
    this.seconds = this.frames = this.lateFrames = 0;
    if (!overloaded) return false;
    this.level++;
    this.cooldown = severe ? 0.2 : 0.4;
    return true;
  }
}
