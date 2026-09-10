import RAPIER from '@dimforge/rapier2d-compat';
import type { Catastrophe } from '../catalogue/catastrophes';
import { CRASH_DURATION } from '../catalogue/escalation';
import { fitArt } from '../art/geometry';
import {
  bossPose,
  drivenMechanisms,
  MACHINE_ENTRANCE,
  mechanismEntrance,
  mechanismPose,
} from '../catalogue/machinery';
import type { GameState } from '../simulation';
import type { Demolition } from './demolition';
import type { CarnageLog } from './log';
import type { PropDrops } from './props';
import { SCALE, type CrashStage, type Piece } from './stage';

/**
 * Everything the course throws at the wreck on a timer: the disaster's machine,
 * which travels in on a scripted entrance before physics takes it over, and the
 * world's boss, which follows an authored path and sweeps loose debris along
 * with it. Ages are seconds since the machine's own arrival beat.
 */
export class HazardDirector {
  private mechanisms: {
    piece: Piece;
    anchorX: number;
    startedAt: number;
    released: boolean;
  }[] = [];
  constructor(
    private s: GameState,
    private stage: CrashStage,
    private log: CarnageLog,
    private props: PropDrops,
    private demolition: Demolition,
  ) {}
  /** True when this piece is a scripted machine rather than loose scenery. */
  owns(piece: Piece) {
    return this.mechanisms.some((m) => m.piece === piece);
  }
  /** True when either side of a contact pair is a scripted machine. */
  holds(pa: Piece, pb: Piece) {
    return this.owns(pa) || this.owns(pb);
  }
  /** The scripted machine involved in a contact pair, if there is one. */
  find(pa: Piece, pb: Piece) {
    return this.mechanisms.find(({ piece }) => piece === pa || piece === pb)
      ?.piece;
  }
  /** Drops a machine whose body has been removed from the world. */
  forget(piece: Piece) {
    this.mechanisms = this.mechanisms.filter(({ piece: p }) => p !== piece);
  }
  /** Fires the entrance beats, then advances every machine already on stage. */
  update(spec: Catastrophe, dt: number) {
    this.stepMachineBeats(spec);
    this.updateMechanisms(spec, dt);
  }
  private stepMachineBeats(spec: Catastrophe) {
    this.log.beat(
      'machine-warning',
      Math.max(0.05, spec.beat - MACHINE_ENTRANCE),
      () => {
        this.spawnMechanism(spec);
      },
    );
    this.log.beat('machine-arrival', spec.beat, () => {
      this.arriveMechanism(spec);
    });
  }
  private spawnMechanism(spec: Catastrophe) {
    this.log.caption = 'LOOK OUT. THE EQUIPMENT HAS OPINIONS.';
    this.log.emit(
      'warning',
      this.stage.focus.translation().x * SCALE,
      -250,
      0.35,
    );
    const target = this.stage.focus.translation();
    const lead = Math.max(0, spec.beat - this.stage.elapsed);
    const anchorX =
      target.x * SCALE + this.stage.focus.linvel().x * SCALE * lead + 110;
    const size = fitArt(spec.trap, 155, 160);
    const at = mechanismEntrance(spec.mechanism, -lead, anchorX, {
      part: spec.trap,
      ...size,
    });
    const trap = this.stage.spawn(spec.trap, at.x, at.y, size.w, size.h);
    trap.enterAt = spec.beat;
    this.mechanisms.push({
      piece: trap,
      anchorX,
      startedAt: spec.beat,
      released: false,
    });
    trap.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    trap.body.collider(0).setEnabled(false);
  }
  private arriveMechanism(spec: Catastrophe) {
    this.log.caption = 'THIS IS PROBABLY FINE.';
    if (spec.mechanism === 'slide') {
      const slide = this.stage.spawn('bone', 250, 0, 430, 35);
      slide.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
      slide.body.setRotation(0.23, true);
    }
  }
  private updateMechanisms(spec: Catastrophe, dt: number) {
    for (const mechanism of this.mechanisms) {
      const { piece: trap, anchorX, startedAt } = mechanism;
      const age = Math.min(this.stage.elapsed, CRASH_DURATION) - startedAt,
        pos = trap.body.translation();
      if (age < 0) {
        this.glideMechanism(spec, trap, anchorX, age);
        continue;
      }
      if (!mechanism.released) this.releaseMechanism(spec, mechanism);
      if (drivenMechanisms.includes(spec.mechanism))
        this.driveMechanism(spec, trap, anchorX, age);
      this.mechanismEffect(spec, age, pos, dt);
    }
  }
  private glideMechanism(
    spec: Catastrophe,
    trap: Piece,
    anchorX: number,
    age: number,
  ) {
    const at = mechanismEntrance(spec.mechanism, age, anchorX, trap);
    trap.body.setNextKinematicTranslation({
      x: at.x / SCALE,
      y: at.y / SCALE,
    });
    trap.body.setNextKinematicRotation(at.angle);
  }
  private releaseMechanism(
    spec: Catastrophe,
    mechanism: { piece: Piece; released: boolean },
  ) {
    const trap = mechanism.piece;
    mechanism.released = true;
    trap.body.collider(0).setEnabled(true);
    if (!drivenMechanisms.includes(spec.mechanism)) {
      trap.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      trap.body.setLinvel({ x: 0, y: 14 }, true);
    }
  }
  private driveMechanism(
    spec: Catastrophe,
    trap: Piece,
    anchorX: number,
    age: number,
  ) {
    const at = mechanismPose(spec.mechanism, age, anchorX, trap);
    trap.body.setNextKinematicTranslation({
      x: at.x / SCALE,
      y: at.y / SCALE,
    });
    trap.body.setNextKinematicRotation(at.angle);
  }
  private mechanismEffect(
    spec: Catastrophe,
    age: number,
    pos: { x: number; y: number },
    dt: number,
  ) {
    switch (spec.mechanism) {
      case 'tractor':
        this.tractorLift(dt);
        break;
      case 'portal':
        this.portalWarp(age, pos);
        break;
      case 'shredder':
        this.shredderBurst(age, pos);
        break;
    }
  }
  private tractorLift(dt: number) {
    for (const p of this.stage.pieces.values())
      if (p.horse && this.stage.elapsed < CRASH_DURATION)
        p.body.applyImpulse({ x: 0, y: -dt * 12 }, true);
  }
  private portalWarp(age: number, pos: { x: number; y: number }) {
    if (age <= 0.6 || this.log.done('portal-warp')) return;
    this.log.mark('portal-warp');
    const player = this.stage.focus.translation();
    // Portals catch only nearby bodies and release them ahead of entry.
    // The old fixed destination pulled escaped players back to the start.
    if (Math.hypot(player.x - pos.x, player.y - pos.y) < 6) {
      this.stage.focus.setTranslation(
        { x: player.x + 4, y: player.y - 2 },
        true,
      );
      this.stage.propel(8, 6, 16);
    }
    this.log.emit('ufo');
  }
  private shredderBurst(age: number, pos: { x: number; y: number }) {
    if (age <= 0.5 || this.log.done('shredder-burst')) return;
    this.log.mark('shredder-burst');
    this.demolition.burst(pos.x * SCALE, pos.y * SCALE, 18);
  }
  /** Walks every boss along its authored path for one tick of `dt` seconds. */
  updateBosses(dt: number) {
    for (const p of this.stage.pieces.values())
      if (p.boss) this.driveBoss(p, dt);
  }
  private driveBoss(boss: Piece, dt: number) {
    const t = Math.min(this.stage.elapsed, CRASH_DURATION);
    const at = bossPose(this.s.world, t, boss);
    boss.body.setNextKinematicTranslation({ x: at.x / SCALE, y: at.y / SCALE });
    if (
      this.stage.elapsed < CRASH_DURATION &&
      (this.s.world === 'moon' || this.s.world === 'farm')
    )
      this.bossSweep(at, dt);
    if (this.s.world === 'carnival' || this.s.world === 'afterlife')
      this.bossAttacks(at);
  }
  private bossSweep(at: { x: number; y: number }, dt: number) {
    const lift = this.s.world === 'moon' ? -dt * 18 : 0;
    for (const part of this.stage.pieces.values()) {
      if (
        !part.activated ||
        part.boss ||
        (part.body === this.stage.focus &&
          this.stage.elapsed < this.stage.boostUntil)
      )
        continue;
      const q = part.body.translation(),
        dx = at.x / SCALE - q.x;
      if (Math.abs(dx) < 6)
        part.body.applyImpulse({ x: dx * dt * 1.5, y: lift }, true);
    }
  }
  private bossAttacks(at: { x: number; y: number }) {
    for (const when of [2.2, 4.4, 6.6])
      this.log.beat(`boss-attack-${when}`, when, () => {
        this.bossAttack(at);
      });
  }
  private bossAttack(at: { x: number; y: number }) {
    this.props.deliverProp(
      this.s.world === 'carnival' ? 'piano' : 'ghost',
      80,
      95,
      at.x - 100,
      -5,
    );
    this.log.emit(
      this.s.world === 'carnival' ? 'piano' : 'ghost',
      at.x,
      -300,
      0.4,
    );
  }
}
