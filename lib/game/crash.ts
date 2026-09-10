import RAPIER from '@dimforge/rapier2d-compat';
import { CATASTROPHES } from './catalogue/catastrophes';
import { random } from './content';
import { CRASH_DURATION, queueGrabAction } from './catalogue/escalation';
import { collisionOutline, fitArt } from './art/geometry';
import type { Action, GameState } from './simulation';
import { Abilities } from './crash/abilities';
import { AftermathDirector } from './crash/aftermath';
import { CollisionRouter } from './crash/collisions';
import { Demolition } from './crash/demolition';
import { crashFrame, type CrashFrame } from './crash/frame';
import { GrabDirector } from './crash/grab';
import { HazardDirector } from './crash/hazards';
import { CarnageLog } from './crash/log';
import { Momentum } from './crash/momentum';
import { PropDrops } from './crash/props';
import {
  buildPony,
  buildScenery,
  createCrashWorld,
  orientRig,
} from './crash/rig';
import { SCALE, type CrashStage, type Piece } from './crash/stage';

export type { BodyPose, CrashFrame } from './crash/frame';

let initPromise: Promise<void> | undefined;
/**
 * Loads the Rapier WebAssembly module once per process, returning the same
 * promise on later calls. Await it before constructing a `CrashWorld`.
 */
export function initPhysics() {
  return (initPromise ??= RAPIER.init());
}

/**
 * The post-landing physics sandbox: a Rapier world holding the wreck, the
 * scenery it can destroy and the scripted machinery that arrives to make things
 * worse. Construct one per landing after `initPhysics()` resolves, drive it with
 * `step(dt)` in fixed 1/120 s ticks, read `snapshot()` for the frame to paint
 * and `drain()` for the sounds to play, and call `dispose()` to free the world.
 *
 * The comedy itself lives in the directors under `./crash`; this class owns the
 * bodies, the clock and the order the directors run in, and is the `CrashStage`
 * they all reach back through.
 */
export class CrashWorld implements CrashStage {
  world: RAPIER.World;
  readonly pieces = new Map<number, Piece>();
  head!: RAPIER.RigidBody;
  torso!: RAPIER.RigidBody;
  elapsed = 0;
  origin: number;
  kickAt = -10;
  private queue = new RAPIER.EventQueue(true);
  private colliders = new Map<number, Piece>();
  private joints: RAPIER.ImpulseJoint[] = [];
  private controlled!: RAPIER.RigidBody;
  private kicks = 3;
  private rng: () => number;
  private log: CarnageLog;
  private props: PropDrops;
  private demolition: Demolition;
  private abilities: Abilities;
  private grabs: GrabDirector;
  private momentum: Momentum;
  private after: AftermathDirector;
  private hazards: HazardDirector;
  private contacts: CollisionRouter;
  constructor(private s: GameState) {
    this.origin = s.impactX;
    this.rng = random(s.seed + s.disaster * 113);
    this.kicks = s.equipment.includes('ghostly') ? 4 : 3;
    this.world = createCrashWorld(s);
    this.log = new CarnageLog(s, this);
    this.props = new PropDrops(s, this, this.log);
    this.demolition = new Demolition(s, this, this.log, this.rng);
    this.abilities = new Abilities(s, this, this.log, this.demolition);
    this.grabs = new GrabDirector(this, this.log);
    this.momentum = new Momentum(s, this, this.log, this.grabs, this.abilities);
    this.after = new AftermathDirector(s, this, this.log, this.props);
    this.hazards = new HazardDirector(
      s,
      this,
      this.log,
      this.props,
      this.demolition,
    );
    this.contacts = new CollisionRouter(
      s,
      this,
      this.log,
      this.demolition,
      this.after,
      this.hazards,
      this.grabs,
    );
    const rig = buildPony(this);
    this.torso = rig.torso;
    this.head = rig.head;
    orientRig(this, s);
    this.controlled = this.torso;
    buildScenery(this, s);
  }
  /** The body the camera follows and the player's inputs act on. */
  get focus() {
    return this.controlled;
  }
  /** Crash-clock second the current forward boost expires. */
  get boostUntil() {
    return this.momentum.boostUntil;
  }
  /** Points the camera and the controls at another body. */
  possess(body: RAPIER.RigidBody) {
    this.controlled = body;
  }
  /** True when the run carries the named equipment. */
  has(id: string) {
    return this.s.equipment.includes(id);
  }
  /** Restarts the settling clock because something loud just happened. */
  stir() {
    this.momentum.stir();
  }
  /** Sets forward and upward speed on the whole connected rig, in m/s. */
  propel(forward: number, lift: number, minimumSpeed = 0) {
    this.momentum.propel(forward, lift, minimumSpeed);
  }
  /** Cuts every joint holding the pony rig together. */
  clearJoints() {
    for (const j of this.joints) this.world.removeImpulseJoint(j, true);
    this.joints = [];
  }
  /** Breaks the pony rig into loose parts; only the first call does work. */
  disassemble() {
    this.demolition.disassemble();
  }
  /** Detonates a blast of `power` centred on a world pixel position. */
  burst(x: number, y: number, power = 10) {
    this.demolition.burst(x, y, power);
  }
  /** Removes a body from the world and from every ledger that held it. */
  retire(piece: Piece) {
    for (const [handle, p] of this.colliders)
      if (p === piece) this.colliders.delete(handle);
    this.hazards.forget(piece);
    this.props.forget(piece);
    this.pieces.delete(piece.body.handle);
    this.world.removeRigidBody(piece.body);
  }
  /**
   * Adds a body at a world pixel position with the collider its art implies.
   * `horse` marks a character part, which never collides with its own rig;
   * `boss` marks the world's machine. The oldest disposable piece is evicted
   * once eighty are live.
   */
  spawn(
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    horse = false,
    boss = false,
  ): Piece {
    if (this.pieces.size >= 80) this.evictDebris();
    if (!horse) ({ w, h } = fitArt(part, w, h));
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x / SCALE, y / SCALE)
        .setLinearDamping(0.13)
        .setAngularDamping(0.2)
        .setCcdEnabled(true),
    );
    const shape = RAPIER.ColliderDesc.convexHull(
      collisionOutline(part, w, h, SCALE),
    )!;
    const collider = this.world.createCollider(
      shape
        // Illustrated limbs overlap in a side view. They collide with the course,
        // not with the other layers of the same character.
        .setCollisionGroups(horse ? 0x00020001 : 0x0001ffff)
        .setDensity(horse ? (this.has('heavy') ? 2.8 : 1.8) : 0.8)
        .setRestitution(this.s.mod.bounce)
        .setFriction(0.4)
        .setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS |
            RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        )
        .setContactForceEventThreshold(4),
      body,
    );
    const p = {
      body,
      part,
      w,
      h,
      tint: 0xffffff,
      alpha: 1,
      scored: false,
      horse,
      boss,
      activated: horse,
      impactSpeed: 0,
    };
    this.pieces.set(body.handle, p);
    this.colliders.set(collider.handle, p);
    return p;
  }
  private disposable(p: Piece) {
    return (
      !p.horse &&
      !p.boss &&
      !p.protected &&
      !p.afterRole &&
      p.body !== this.controlled &&
      p !== this.props.prop &&
      !this.hazards.owns(p)
    );
  }
  private evictDebris() {
    const old = [...this.pieces.values()].find((p) => this.disposable(p));
    if (!old) return;
    for (const [handle, p] of this.colliders)
      if (p === old) this.colliders.delete(handle);
    this.pieces.delete(old.body.handle);
    this.world.removeRigidBody(old.body);
  }
  /**
   * Joints two bodies at anchors given in each body's own frame, in pixels.
   * Contacts between the pair are disabled so overlapping art does not fight.
   */
  connect(
    a: RAPIER.RigidBody,
    b: RAPIER.RigidBody,
    aa: { x: number; y: number },
    bb: { x: number; y: number },
    fixed = false,
  ) {
    const anchorA = { x: aa.x / SCALE, y: aa.y / SCALE };
    const anchorB = { x: bb.x / SCALE, y: bb.y / SCALE };
    const joint = this.world.createImpulseJoint(
      fixed
        ? RAPIER.JointData.fixed(anchorA, 0, anchorB, 0)
        : RAPIER.JointData.revolute(anchorA, anchorB),
      a,
      b,
      true,
    );
    joint.setContactsEnabled(false);
    this.joints.push(joint);
    return joint;
  }
  /** Repaints a piece and refits its collider to the new art. */
  reskin(piece: Piece, part: string, width: number, height: number) {
    const size = fitArt(part, width, height);
    piece.part = part;
    piece.w = size.w;
    piece.h = size.h;
    const shape = RAPIER.ColliderDesc.convexHull(
      collisionOutline(part, piece.w, piece.h, SCALE),
    )!.shape;
    piece.body.collider(0).setShape(shape);
  }
  /** The followed body plus everything still jointed to it. */
  connectedBodies() {
    const connected = new Map([[this.controlled.handle, this.controlled]]);
    for (const body of connected.values())
      this.world.impulseJoints.forEachJointHandleAttachedToRigidBody(
        body.handle,
        (handle) => {
          if (handle === this.grabs.jointHandle) return;
          const joint = this.world.impulseJoints.get(handle);
          if (!joint) return;
          for (const part of [joint.body1(), joint.body2()])
            connected.set(part.handle, part);
        },
      );
    return connected;
  }
  /**
   * Applies one player input: a kick while kicks remain, or the run's signature
   * move. Inputs arriving mid-grab are queued until the grab lets go, and a
   * settled incident ignores them entirely.
   */
  action(action: Action) {
    if (this.momentum.settled) return;
    if (this.grabs.grab) {
      queueGrabAction(
        this.grabs.grab,
        action,
        this.kicks,
        this.abilities.ready,
      );
      return;
    }
    this.kick(action);
    if (action !== 'secondary' || !this.abilities.ready) return;
    this.stir();
    this.abilities.use();
  }
  private kick(action: Action) {
    if (
      action !== 'primary' ||
      this.kicks <= 0 ||
      this.elapsed - this.kickAt <= 0.35
    )
      return;
    this.kicks--;
    this.stir();
    this.kickAt = this.elapsed;
    this.propel(8 * this.s.mod.kick, 10 * this.s.mod.kick);
    this.controlled.setAngvel(-5, true);
    this.log.emit('kick');
    if (this.has('beans')) {
      const p = this.controlled.translation();
      this.log.gore('ignite', p.x * SCALE - 30, p.y * SCALE, 1.2);
    }
    this.log.caption = 'A STRONG ARGUMENT AGAINST GRAVITY.';
  }
  /**
   * Advances the incident by `dt` seconds: scripted beats, machine kinematics,
   * the solver, then the consequences of everything it touched. The order here
   * is the recorded order of an incident and is not safe to rearrange.
   */
  step(dt: number) {
    this.elapsed += dt;
    this.grabs.update();
    this.log.flash = Math.max(0, this.log.flash - dt * 3);
    this.log.beat('disassembly', this.has('loose') ? 0.2 : 1.1, () => {
      this.disassemble();
    });
    const spec = CATASTROPHES[this.s.world][this.s.disaster % 4];
    this.hazards.update(spec, dt);
    this.abilities.releaseSpring();
    this.log.beat('equipment-followup', 2.4, () => {
      this.pianoFollowup();
    });
    this.log.beat('aftershock', 2, () => {
      this.aftershock();
    });
    this.after.update(dt);
    this.after.escalate();
    this.abilities.applyAttraction(dt);
    this.abilities.releaseBlackhole();
    this.hazards.updateBosses(dt);
    this.clampCharacterVelocity();
    this.markImpactSpeeds();
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((a, b, started) => {
      if (!started) return;
      this.contacts.contact(spec, this.colliders.get(a), this.colliders.get(b));
    });
    this.queue.drainContactForceEvents((event) => {
      this.contacts.forces(
        this.colliders.get(event.collider1()),
        this.colliders.get(event.collider2()),
      );
    });
    this.resolvePendingCombinations();
    if (this.contacts.contactBreak && !this.demolition.broken)
      this.disassemble();
    this.grabs.settle();
    // Remove consumed bodies only after both Rapier event queues are drained.
    this.demolition.detonateDue();
    this.momentum.recover();
    // A missed falling helmet must not leave the playable soul ascending forever.
    if (this.elapsed >= CRASH_DURATION && this.controlled.gravityScale() < 0)
      this.controlled.setGravityScale(1, true);
    this.momentum.update(dt);
  }
  private pianoFollowup() {
    if (!this.has('piano')) return;
    this.props.deliverProp('piano', 165, 155);
  }
  private aftershock() {
    if (!this.has('aftershock')) return;
    const at = this.controlled.translation();
    this.burst(at.x * SCALE, at.y * SCALE, 15);
  }
  private resolvePendingCombinations() {
    for (const combo of this.log.pendingCombinations) {
      this.log.combination(combo.kind, combo.source.body, combo.target);
      if (combo.kind === 'retina-zap') this.propel(9, 8, 20);
      if (combo.kind === 'haunted-encore') {
        this.kicks = Math.min(5, this.kicks + 1);
        this.log.verdictUntil = Math.max(
          this.log.verdictUntil,
          this.elapsed + 1.5,
        );
      }
    }
    this.log.pendingCombinations = [];
  }
  private clampCharacterVelocity() {
    // A chain of simultaneous blasts must remain readable and playable. This
    // limits character knockback, while loose scenery keeps its full impulse.
    for (const piece of this.pieces.values())
      if (piece.horse || piece.body === this.controlled) {
        const v = piece.body.linvel();
        const ceiling = -16 * Math.sqrt(this.s.mod.gravity);
        if (v.y < ceiling || Math.abs(v.x) > 32)
          piece.body.setLinvel(
            { x: Math.max(-32, Math.min(32, v.x)), y: Math.max(ceiling, v.y) },
            true,
          );
      }
  }
  private markImpactSpeeds() {
    for (const p of this.pieces.values()) {
      const velocity = p.body.linvel();
      p.impactSpeed = Math.hypot(velocity.x, velocity.y);
      if (p.detonateAt !== undefined)
        p.tint = Math.floor(this.elapsed * 24) % 2 ? 0xff7050 : 0xfff0a0;
    }
  }
  /** The frame to paint, record and hand to the camera for this tick. */
  snapshot(): CrashFrame {
    return crashFrame(this, this.log, {
      settled: this.momentum.settled,
      broken: this.demolition.broken,
      kicks: this.kicks,
      abilityReady: this.abilities.ready,
      abilityAge: this.elapsed - this.abilities.at,
      grab: this.grabs.grab,
      landing: this.s.landing,
      anchorX: this.after.anchorX,
      propId: this.props.prop?.body.handle,
      elastic: this.has('rubber'),
    });
  }
  /** Hands over the sounds queued since the last call. */
  drain() {
    return this.log.drain();
  }
  /** Frees the Rapier world; the instance is unusable afterwards. */
  dispose() {
    this.queue.free();
    this.world.free();
  }
}
