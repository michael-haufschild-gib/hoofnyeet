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
    if (!active || !Number.isFinite(dt) || dt <= 0 || dt > 0.25) {
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
    const average = this.seconds / this.frames;
    const lateRatio = this.lateFrames / this.frames;
    // Respond sooner to a genuinely sustained half-rate scene. Eighteen
    // samples prevent a texture upload or one long task from lowering quality.
    const severe =
      this.seconds >= 0.6 &&
      this.frames >= 18 &&
      average > 1 / 42 &&
      lateRatio > 0.65;
    if (!severe && (this.seconds < 1.2 || this.frames < 20)) return false;
    const overloaded = average > 1 / 55 && lateRatio > 0.12;
    this.seconds = this.frames = this.lateFrames = 0;
    if (!overloaded) return false;
    this.level++;
    this.cooldown = severe ? 0.2 : 0.4;
    return true;
  }
}
