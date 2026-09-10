import RAPIER from '@dimforge/rapier2d-compat';
import {
  ESCALATION_AT,
  ESCALATION_BEATS,
  LANDING_SOUNDS,
  type CarnageCue,
} from '../catalogue/escalation';
import { artFoot, fitArt, GROUND_Y } from '../art/geometry';
import { AFTERMATHS } from '../catalogue/landing-timeline';
import type { GameState, LandingId } from '../simulation';
import type { CarnageLog } from './log';
import type { PropDrops } from './props';
import { pieceWithPart, SCALE, type CrashStage, type Piece } from './stage';

type AftermathScript = (typeof AFTERMATHS)[LandingId];

/** Splits a contact pair into the scripted aftermath prop and what it struck. */
function afterRolePair(a: Piece, b: Piece) {
  const prop = a.afterRole ? a : b.afterRole ? b : null;
  return { prop, other: prop === a ? b : a };
}

/**
 * The scripted show that plays out after the wreck stops being funny on its
 * own: a warning at 3.8 s, the landing's set piece at 4.2 s, the punchline at
 * 7.4 s (6.4 s for a dignified exit), and the three escalation cues that carry
 * the incident to its verdict. Every time here is a second on the crash clock.
 */
export class AftermathDirector {
  private anchor = 0;
  private entryY = 0;
  private laundry: Piece | undefined;
  private laundryJoint: RAPIER.ImpulseJoint | null = null;
  private helmetPunchline = false;
  private escalationProp: Piece | undefined;
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
    private props: PropDrops,
  ) {}
  /** World x, in pixels, the landing's set piece was anchored to. */
  get anchorX() {
    return this.anchor;
  }
  /** Plays whichever landing beats this tick of `dt` seconds has reached. */
  update(dt: number) {
    const id = this.s.landing,
      script = AFTERMATHS[id];
    this.log.beat('after-warning', 3.8, () => {
      this.log.announce(script.warning);
      this.log.emit('warning', undefined, undefined, 0.3);
    });
    this.log.beat('after-arrival', 4.2, () => {
      this.landingArrival(id, script);
    });
    this.tractorBeam(id, dt);
    this.log.beat('after-surprise', id === 'dignified' ? 6.4 : 7.4, () => {
      this.landingSurprise(id, script);
    });
    if (id === 'dignified')
      this.log.beat('helmet-arrival', 7.7, () => {
        this.helmetArrival();
      });
  }
  private landingArrival(id: LandingId, script: AftermathScript) {
    this.anchor = this.stage.focus.translation().x * SCALE;
    const hero = this.stage.pieces.get(this.stage.focus.handle)!;
    this.log.announce(script.arrival);
    switch (id) {
      case 'haystack':
        this.stage.reskin(hero, 'cube', 105, 75);
        this.props.appendage(hero.body, 'straightLeg', -24, 38, 15, 30);
        this.props.appendage(hero.body, 'straightLeg', 24, 38, 15, 30);
        hero.body.setLinvel(
          { x: Math.max(13, hero.body.linvel().x), y: -2 },
          true,
        );
        break;
      case 'mud':
        this.props.rescue();
        break;
      case 'accordion': {
        this.entryY = hero.body.translation().y * SCALE - 500;
        const p = this.stage.spawn(
          'ufo',
          this.anchor,
          Math.min(-780, hero.body.translation().y * SCALE - 500),
          180,
          140,
        );
        p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
        this.props.prop = p;
        this.log.emit('ufo');
        break;
      }
      case 'cartwheel':
        this.props.fallingPunchline('piano', 175, 175, 'first');
        break;
      case 'fence':
        this.fenceArrival();
        break;
      case 'sheep': {
        const size = fitArt('sheep', 170, 150);
        const sheep = this.stage.spawn(
          'sheep',
          this.anchor + 170,
          GROUND_Y - artFoot('sheep', size.w, size.h),
          size.w,
          size.h,
        );
        sheep.body.setLinvel({ x: -5, y: 0 }, true);
        this.props.prop = sheep;
        this.log.emit('sheep');
        break;
      }
      case 'ballet':
        this.balletArrival();
        break;
      case 'dignified':
        this.props.appendage(this.stage.head, 'crown', 0, -47, 44, 32, true);
        this.log.emit('fanfare');
        break;
    }
  }
  private fenceArrival() {
    for (const side of [-1, 1]) {
      const pole = this.stage.spawn(
        'bone',
        this.anchor + side * 95,
        -68,
        145,
        100,
      );
      pole.body.setRotation(Math.PI / 2, true);
      pole.body.setTranslation(
        {
          x: pole.body.translation().x,
          y:
            (GROUND_Y - artFoot(pole.part, pole.w, pole.h, Math.PI / 2)) /
            SCALE,
        },
        true,
      );
      pole.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    }
    // The discarded suit takes the clothespin. Keep the player's wreck
    // where physics put it, including if it has escaped high overhead.
    const laundry = this.stage.spawn('torso', this.anchor, -78, 105, 75);
    laundry.protected = true;
    laundry.body.setRotation(Math.PI / 2, true);
    this.laundry = laundry;
    const peg = this.stage.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        this.anchor / SCALE,
        -128 / SCALE,
      ),
    );
    this.laundryJoint = this.stage.connect(
      peg,
      laundry.body,
      { x: 0, y: 0 },
      { x: -50, y: 0 },
    );
    this.log.emit('woodbreak');
  }
  private balletArrival() {
    const head = this.stage.head.translation(),
      focus = this.stage.focus.translation();
    // A nearby head can take the bow; a distant head is an independent
    // performer, never a forced camera/control jump back to the wreck.
    if (Math.hypot(head.x - focus.x, head.y - focus.y) * SCALE < 140)
      this.stage.possess(this.stage.head);
    this.stage.head.setLinvel(
      { x: Math.max(3, this.stage.head.linvel().x), y: -7 },
      true,
    );
    this.stage.head.setAngvel(0.4, true);
    this.props.appendage(this.stage.head, 'crown', 0, -47, 44, 32, true);
    this.log.emit('fanfare');
  }
  private tractorBeam(id: LandingId, dt: number) {
    if (
      id !== 'accordion' ||
      !this.props.prop ||
      this.stage.elapsed < 4.2 ||
      this.stage.elapsed >= 7.4
    )
      return;
    const entryAge = this.stage.elapsed - 4.2;
    if (entryAge < 0.9) this.accordionEntry(this.props.prop, entryAge);
    this.accordionPull(this.props.prop.body.translation(), dt);
  }
  private accordionEntry(prop: Piece, entryAge: number) {
    const progress = Math.min(1, entryAge / 0.85);
    const start = Math.min(-780, this.entryY);
    const target = Math.min(-250, this.entryY + 360);
    prop.body.setNextKinematicTranslation({
      x: this.anchor / SCALE,
      y:
        (start + (target - start) * progress * progress * (3 - 2 * progress)) /
        SCALE,
    });
  }
  private accordionPull(center: { x: number; y: number }, dt: number) {
    for (const piece of this.stage.pieces.values())
      if (this.pulled(piece)) this.pullInto(piece, center, dt);
  }
  private pulled(piece: Piece) {
    return (
      piece.horse &&
      (piece.body !== this.stage.focus ||
        (this.stage.elapsed >= this.stage.boostUntil &&
          piece.body.linvel().x < 4))
    );
  }
  private pullInto(piece: Piece, center: { x: number; y: number }, dt: number) {
    const p = piece.body.translation(),
      v = piece.body.linvel();
    if (Math.abs(p.x - center.x) > 13) return;
    const force = (n: number) =>
      Math.max(-28, Math.min(28, n)) * piece.body.mass() * dt;
    piece.body.applyImpulse(
      {
        x: force((center.x - p.x) * 5 - v.x * 2),
        y: force((center.y + 2 - p.y) * 6 - v.y * 3 - 11 * this.s.mod.gravity),
      },
      true,
    );
  }
  private landingSurprise(id: LandingId, script: AftermathScript) {
    switch (id) {
      case 'haystack':
        this.props.fallingPunchline('baler', 180, 190, 'surprise');
        break;
      case 'mud':
        this.props.fallingPunchline('cabinet', 125, 150, 'surprise');
        break;
      case 'accordion':
        this.props.prop!.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        this.props.prop!.body.setLinvel({ x: 0, y: 9 }, true);
        this.log.announce(script.verdict);
        this.log.emit('metalcrash');
        break;
      case 'cartwheel':
        this.props.fallingPunchline('piano', 95, 100, 'surprise');
        break;
      case 'fence':
        if (this.laundryJoint) {
          this.stage.world.removeImpulseJoint(this.laundryJoint, true);
          this.laundryJoint = null;
        }
        this.laundry?.body.setLinvel({ x: 11, y: -3 }, true);
        this.props.rescue();
        this.log.announce(script.verdict);
        break;
      case 'sheep':
        if (this.props.prop)
          this.props.appendage(
            this.props.prop.body,
            'helmet',
            this.props.prop.w * 0.21,
            -this.props.prop.h * 0.36,
            64,
            45,
            true,
          );
        this.log.announce(script.verdict);
        this.log.emit('crowd');
        break;
      case 'ballet':
        this.props.fallingPunchline('glove', 170, 170, 'surprise');
        break;
      case 'dignified': {
        const pos = this.stage.focus.translation();
        const ghost = this.stage.spawn(
          'ghost-head',
          pos.x * SCALE,
          pos.y * SCALE,
          90,
          115,
          true,
        );
        ghost.body.setLinvel(
          { x: Math.max(1, this.stage.focus.linvel().x), y: -9 },
          true,
        );
        ghost.body.setGravityScale(-0.1, true);
        this.stage.possess(ghost.body);
        this.props.prop = ghost;
        this.log.announce(script.arrival);
        this.log.emit('ghost');
        break;
      }
    }
  }
  private helmetArrival() {
    const pos = this.stage.focus.translation();
    const helmet = this.stage.spawn(
      'helmet',
      pos.x * SCALE,
      Math.min(-650, pos.y * SCALE - 650),
      70,
      65,
    );
    helmet.body.setLinvel({ x: 0, y: 25 }, true);
    this.props.prop = helmet;
    this.log.announce('YOUR HELMET WOULD LIKE A WORD.');
  }
  /** Delivers the verdict when a scripted prop finally hits something awake. */
  contact(a: Piece, b: Piece) {
    const { prop, other } = afterRolePair(a, b);
    if (!prop || !other.activated) return;
    const key = `after-contact-${prop.afterRole}`;
    if (this.log.done(key)) return;
    this.log.mark(key);
    const script = AFTERMATHS[this.s.landing];
    this.log.announce(
      prop.afterRole === 'first' ? script.arrival : script.verdict,
    );
    if (prop.afterRole === 'vehicle' && other.horse)
      other.body.setLinvel({ x: 24, y: -8 }, true);
    if (this.s.landing === 'haystack' && other.horse)
      this.stage.reskin(
        other,
        'cube',
        Math.max(35, other.w),
        Math.max(35, other.h),
      );
    this.log.emit(
      script.sound,
      prop.body.translation().x * SCALE,
      prop.body.translation().y * SCALE,
      0.8,
      0.065,
    );
  }
  /** The dignified exit's last word: the helmet catches up with the ghost. */
  helmetGag(pa: Piece, pb: Piece) {
    const ghost = pieceWithPart(pa, pb, 'ghost-head');
    const helmet = pieceWithPart(pa, pb, 'helmet');
    if (!ghost || !helmet || this.helmetPunchline || this.stage.elapsed <= 7.7)
      return;
    this.helmetPunchline = true;
    ghost.body.setGravityScale(1.4, true);
    ghost.body.setLinvel({ x: 4, y: 17 }, true);
    this.log.announce(AFTERMATHS.dignified.verdict);
    this.log.emit(
      'metalcrash',
      ghost.body.translation().x * SCALE,
      ghost.body.translation().y * SCALE,
      0.85,
      0.1,
    );
  }
  /** Fires the three landing cues that carry the incident to its verdict. */
  escalate() {
    for (const [stage, delay] of ESCALATION_BEATS.entries())
      this.log.beat(`escalation-${stage}`, ESCALATION_AT + delay, () => {
        this.escalationBeat(stage);
      });
  }
  private landingCue() {
    const found = this.log.carnage.find((c) => c.kind === 'landing');
    if (found) return found;
    const at = this.stage.focus.translation();
    const origin = this.log.gore(
      'landing',
      at.x * SCALE,
      Math.min(-70, at.y * SCALE),
      1,
      this.stage.focus.handle,
      this.props.prop?.body.handle,
    );
    origin.landing = this.s.landing;
    origin.encore = 1;
    return origin;
  }
  private escalationBeat(stage: number) {
    const origin = this.landingCue();
    // Stage cue captures the physical location on its own tick. It never
    // moves an escaped player back to the scripted scene.
    const cue =
      stage === 0
        ? origin
        : this.log.gore(
            'landing',
            origin.x - this.stage.origin,
            origin.y,
            1,
            origin.bodyId,
            origin.propId,
          );
    cue.landing = this.s.landing;
    cue.stage = stage;
    this.log.cueSound(
      cue,
      LANDING_SOUNDS[this.s.landing][stage],
      stage === 2 ? 0.04 : 0,
    );
    if (stage === 2) this.finaleCue(cue);
  }
  private finaleCue(cue: CarnageCue) {
    this.log.gore('impact', cue.x - this.stage.origin, cue.y, 2.1, cue.bodyId);
    if (this.s.landing !== 'cartwheel') return;
    this.props.fallingPunchline('piano', 215, 210, 'surprise');
    this.escalationProp = this.props.prop ?? undefined;
    if (!this.escalationProp) return;
    this.escalationProp.protected = true;
    cue.propId = this.escalationProp.body.handle;
  }
}
