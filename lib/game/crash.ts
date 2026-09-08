import RAPIER from '@dimforge/rapier2d-compat';
import {
  GROUND_Y,
  PONY_BODY_Y,
  LEG_HIPS,
  LEG_SIZE,
  fitArt,
  collisionOutline,
  artFoot,
} from './geometry';
import { random } from './content';
import { CATASTROPHES } from './catastrophes';
import { AFTERMATHS } from './landing-timeline';
import { bossPose, drivenMechanisms, mechanismPose } from './machinery';
import type { Action, GameEvent, GameState, LandingId } from './simulation';
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
}
export interface CrashFrame {
  bodies: BodyPose[];
  time: number;
  kicks: number;
  abilityReady: boolean;
  abilityAge: number;
  focusX: number;
  focusY: number;
  focusId?: number;
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
interface Piece {
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
  afterRole?: 'first' | 'surprise' | 'vehicle';
}
let initPromise: Promise<void> | undefined;
export function initPhysics() {
  return (initPromise ??= RAPIER.init());
}
const SCALE = 40;
export class CrashWorld {
  private world: RAPIER.World;
  private queue = new RAPIER.EventQueue(true);
  private pieces = new Map<number, Piece>();
  private colliders = new Map<number, Piece>();
  private joints: RAPIER.ImpulseJoint[] = [];
  private broken = false;
  private contactBreak = false;
  private beats = new Set<string>();
  private bossPairs = new Set<string>();
  private controlled!: RAPIER.RigidBody;
  private head!: RAPIER.RigidBody;
  private torso!: RAPIER.RigidBody;
  private helmetPunchline = false;
  private afterProp: Piece | null = null;
  private afterAnchor = 0;
  private laundryJoint: RAPIER.ImpulseJoint | null = null;
  private verdictUntil = 0;
  private elapsed = 0;
  private abilityAt = -10;
  private kickAt = -10;
  private serial = 0;
  private rng: () => number;
  private events: GameEvent[] = [];
  private caption = 'THREE KICKS. ONE TERRIBLE IDEA.';
  private flash = 0;
  private kicks = 3;
  private abilityReady = true;
  private havoc = 0;
  private bossHits = 0;
  private origin: number;
  private mechanismBodies: {
    piece: Piece;
    anchorX: number;
    startedAt: number;
  }[] = [];
  constructor(private s: GameState) {
    this.origin = s.impactX;
    this.rng = random(s.seed + s.disaster * 113);
    this.kicks = s.equipment.includes('ghostly') ? 4 : 3;
    this.world = new RAPIER.World({ x: 0, y: 11 * s.mod.gravity });
    this.world.timestep = 1 / 120;
    const ground = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_Y / SCALE + 0.35),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(150, 0.35).setFriction(0.55),
      ground,
    );
    const vx = Math.max(3, Math.min(19, s.vx / SCALE)),
      vy = Math.min(12, Math.max(2, s.vy / SCALE));
    this.torso = this.spawn('torso', 0, PONY_BODY_Y, 108, 75, true).body;
    this.head = this.spawn(
      'surprisedHead',
      this.has('long') ? 85 : 47,
      this.has('long') ? -130 : -84,
      71,
      87,
      true,
    ).body;
    this.connect(
      this.torso,
      this.head,
      { x: this.has('long') ? 65 : 35, y: this.has('long') ? -60 : -20 },
      { x: this.has('long') ? -20 : -12, y: this.has('long') ? 13 : 7 },
    );
    for (let i = 0; i < 4; i++) {
      const leg = this.spawn(
        'straightLeg',
        LEG_HIPS[i].x,
        PONY_BODY_Y +
          LEG_HIPS[i].y +
          LEG_SIZE.height * (0.5 - LEG_SIZE.anchorY),
        LEG_SIZE.width,
        LEG_SIZE.height,
        true,
      );
      this.connect(
        this.torso,
        leg.body,
        { x: LEG_HIPS[i].x, y: LEG_HIPS[i].y },
        { x: 0, y: -LEG_SIZE.height * (0.5 - LEG_SIZE.anchorY) },
      );
    }
    const tail = this.spawn('tail', -63, -58, 43, 65, true);
    this.connect(this.torso, tail.body, { x: -42, y: -10 }, { x: 21, y: -9 });
    for (const p of this.pieces.values()) {
      const q = p.body.translation(),
        a = s.impactRotation,
        xx = q.x,
        yy = q.y - PONY_BODY_Y / SCALE;
      p.body.setTranslation(
        {
          x: xx * Math.cos(a) - yy * Math.sin(a),
          y: xx * Math.sin(a) + yy * Math.cos(a) + PONY_BODY_Y / SCALE,
        },
        true,
      );
      p.body.setRotation(a, true);
      p.body.setLinvel({ x: vx, y: vy }, true);
      p.body.setAngvel(s.impactRotation ? 4 : 1, true);
    }
    // The rotated rig enters physics at first opaque contact, never inside the floor.
    const lowest = Math.max(
      ...[...this.pieces.values()].map(
        (p) =>
          p.body.translation().y * SCALE +
          artFoot(p.part, p.w, p.h, p.body.rotation()),
      ),
    );
    for (const p of this.pieces.values()) {
      const at = p.body.translation();
      p.body.setTranslation(
        { x: at.x, y: at.y + (GROUND_Y - lowest) / SCALE },
        true,
      );
    }
    this.controlled = this.torso;
    const spec = CATASTROPHES[s.world][s.disaster % 4],
      part = spec.prop;
    for (let i = 0; i < spec.count; i++) {
      const col = i % 3,
        row = Math.floor(i / 3);
      const x =
        spec.mechanism === 'fence'
          ? 120 + i * 45
          : spec.mechanism === 'swarm'
            ? 180 + i * 62
            : 160 + col * 65;
      const p = this.spawn(
        part,
        x,
        spec.mechanism === 'fence' ? -75 : -20 - row * 58,
        spec.mechanism === 'fence' ? 24 : 58,
        spec.mechanism === 'fence' ? 170 : 58,
      );
      if (spec.mechanism === 'swarm') p.body.setLinvel({ x: -4, y: 0 }, true);
    }
    for (let i = 0; i < 4; i++)
      this.spawn(i % 2 ? 'bone' : 'helmet', 420 + i * 85, -25, 45, 38);
    if (s.equipment.includes('sheepish'))
      for (let i = 0; i < 3; i++) this.spawn('sheep', 80 + i * 90, -80, 75, 68);
    if (s.equipment.includes('helmet'))
      for (let i = 0; i < 3; i++)
        this.spawn('helmet', i * 25 - 20, -170, 35, 30, true);
    if (s.equipment.includes('eyes'))
      for (let i = 0; i < 2; i++) this.spawn('eye', i * 30, -135, 30, 30, true);
    if (s.boss) {
      const boss = this.spawn(
        this.bossPart(),
        430,
        -105,
        190,
        180,
        false,
        true,
      );
      boss.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      const at = bossPose(s.world, 0, boss);
      boss.body.setTranslation({ x: at.x / SCALE, y: at.y / SCALE }, true);
    }
  }
  private has(id: string) {
    return this.s.equipment.includes(id);
  }
  private beat(id: string, at: number, action: () => void) {
    if (this.elapsed < at || this.beats.has(id)) return;
    this.beats.add(id);
    action();
  }
  private propPart() {
    return (
      {
        farm: ['cube', 'sheep', 'tnt', 'bone'],
        candy: ['donut', 'cube', 'jaws', 'lollipop'],
        carnival: ['piano', 'glove', 'helmet', 'grave'],
        office: ['grave', 'cube', 'goose', 'bone'],
        moon: ['cube', 'ufo', 'tnt', 'bone'],
        afterlife: ['skeleton', 'ghost', 'grave', 'jaws'],
      } as const
    )[this.s.world][this.s.disaster % 4];
  }
  private bossPart() {
    return (
      {
        farm: 'baler',
        candy: 'jaws',
        carnival: 'piano',
        office: 'officeGoose',
        moon: 'ufo',
        afterlife: 'reaper',
      } as const
    )[this.s.world];
  }
  private spawn(
    part: string,
    x: number,
    y: number,
    w: number,
    h: number,
    horse = false,
    boss = false,
  ): Piece {
    if (this.pieces.size >= 80) {
      const old = [...this.pieces.values()].find(
        (p) =>
          !p.horse &&
          !p.boss &&
          p.body !== this.controlled &&
          p !== this.afterProp &&
          !this.mechanismBodies.some(({ piece }) => piece === p),
      );
      if (old) {
        for (const [handle, p] of this.colliders)
          if (p === old) this.colliders.delete(handle);
        this.pieces.delete(old.body.handle);
        this.world.removeRigidBody(old.body);
      }
    }
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
  private connect(
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
  private emit(
    sound: string,
    x = this.controlled.translation().x * SCALE,
    y = this.controlled.translation().y * SCALE,
    value = 1,
    freeze = 0,
  ) {
    this.events.push({
      kind: 'crunch',
      sound,
      id: `${this.s.round}-wreck-${this.serial++}`,
      time: this.elapsed,
      x: this.origin + x,
      y,
      value,
      freeze,
    });
  }
  private burst(x: number, y: number, power = 10) {
    for (const p of this.pieces.values()) {
      if (p.boss) continue;
      const v = p.body.translation(),
        dx = v.x - x / SCALE,
        dy = v.y - y / SCALE,
        len = Math.max(0.6, Math.hypot(dx, dy));
      if (len < 11) {
        p.activated = true;
        this.ignite(p, 0.12 + len * 0.018);
        p.body.applyImpulse(
          {
            x: ((dx / len) * power) / (1 + len * 0.2),
            y: ((dy / len - 0.55) * power) / (1 + len * 0.2),
          },
          true,
        );
      }
    }
    this.flash = 1;
    this.emit('explosion', x, y, 0.8, 0.065);
  }
  private explosive(p: Piece) {
    return (
      p.part === 'tnt' ||
      p.part === 'barrel' ||
      (p.part === 'piano' && this.has('confetti'))
    );
  }
  private ignite(p: Piece, fuse = 0.16) {
    if (!this.explosive(p) || p.detonateAt !== undefined) return;
    p.detonateAt = this.elapsed + fuse;
    p.activated = true;
    p.tint = 0xff8050;
  }
  private detonate(p: Piece) {
    const position = p.body.translation();
    const x = position.x * SCALE,
      y = position.y * SCALE;
    if (!p.scored) this.havoc += Math.round(60 * this.s.mod.havoc);
    p.scored = true;
    // Possessing an explosive must not leave the camera or controls attached
    // to a removed Rapier body. The offended head inherits the escape route.
    if (this.controlled === p.body) {
      this.controlled = this.head;
      this.head.setTranslation(position, true);
    }
    for (const [handle, piece] of this.colliders)
      if (piece === p) this.colliders.delete(handle);
    this.mechanismBodies = this.mechanismBodies.filter(
      ({ piece }) => piece !== p,
    );
    if (this.afterProp === p) this.afterProp = null;
    this.pieces.delete(p.body.handle);
    this.world.removeRigidBody(p.body);
    this.burst(x, y, 15);
  }
  private reskin(piece: Piece, part: string, width: number, height: number) {
    const size = fitArt(part, width, height);
    piece.part = part;
    piece.w = size.w;
    piece.h = size.h;
    const shape = RAPIER.ColliderDesc.convexHull(
      collisionOutline(part, piece.w, piece.h, SCALE),
    )!.shape;
    piece.body.collider(0).setShape(shape);
  }
  private disassemble() {
    if (this.broken) return;
    this.broken = true;
    for (const j of this.joints) this.world.removeImpulseJoint(j, true);
    this.joints = [];
    const torso = this.pieces.get(this.torso.handle);
    if (torso) {
      this.reskin(
        torso,
        this.s.landing === 'haystack' ? 'cube' : 'skeletal-torso',
        108,
        75,
      );
      const head = this.pieces.get(this.head.handle);
      if (head) this.reskin(head, 'offended-head', 72, 76);
      let legIndex = 0;
      for (const piece of this.pieces.values())
        if (piece.horse && piece.part === 'straightLeg') {
          this.reskin(
            piece,
            [
              'skeletal-front-leg-bent',
              'skeletal-front-leg-straight',
              'skeletal-hind-leg',
              'skeletal-hind-leg-flailing',
            ][legIndex++ % 4],
            33,
            58,
          );
        }
      if (this.s.landing === 'accordion') {
        this.torso.setLinvel({ x: 12, y: -15 }, true);
        this.caption = 'YOUR SPINE HAS FILED FOR SEPARATION.';
      }
      if (this.s.landing === 'mud') {
        this.torso.setLinvel({ x: 25, y: 0 }, true);
        for (let i = 0; i < 5; i++) this.spawn('jam', i * 45, 18, 95, 15);
      }
      if (this.s.landing === 'ballet') {
        this.torso.setAngvel(9, true);
        this.torso.setLinvel({ x: 4, y: -8 }, true);
      }
      if (this.s.landing === 'sheep') {
        for (let i = 0; i < 3; i++) {
          const sheep = this.spawn(
            'sheep',
            this.head.translation().x * SCALE + i * 45,
            -150,
            80,
            72,
          );
          sheep.body.setLinvel({ x: -5, y: 8 }, true);
        }
      }
    }
    for (let i = 0; i < 7; i++) {
      const p = this.spawn(
        i < 2 ? (i ? 'eyeball-up' : 'eyeball-right') : 'jam',
        this.controlled.translation().x * SCALE,
        -70,
        20 + this.rng() * 15,
        22,
      );
      p.body.setLinvel(
        { x: (this.rng() - 0.5) * 12, y: -this.rng() * 9 },
        true,
      );
    }
    this.caption = 'SOME ASSEMBLY REQUIRED.';
    this.emit(
      'boneclatter',
      this.controlled.translation().x * SCALE,
      this.controlled.translation().y * SCALE,
      0.8,
      0.08,
    );
    if (this.has('confetti')) {
      const at = this.controlled.translation();
      this.burst(at.x * SCALE, at.y * SCALE, 12);
    }
  }
  action(action: Action) {
    if (this.elapsed > 9.4) return;
    if (
      action === 'primary' &&
      this.kicks > 0 &&
      this.elapsed - this.kickAt > 0.35
    ) {
      this.kicks--;
      this.kickAt = this.elapsed;
      this.controlled.applyImpulse(
        { x: 10 * this.s.mod.kick, y: -15 * this.s.mod.kick },
        true,
      );
      this.controlled.setAngvel(-5, true);
      this.emit('kick');
      this.caption = 'A STRONG ARGUMENT AGAINST GRAVITY.';
    }
    if (action !== 'secondary' || !this.abilityReady) return;
    this.abilityReady = false;
    this.abilityAt = this.elapsed;
    const pos = this.controlled.translation(),
      x = pos.x * SCALE,
      y = pos.y * SCALE;
    switch (this.s.ability) {
      case 'eject':
        this.disassemble();
        this.controlled = this.head;
        this.head.setLinvel({ x: 25, y: -17 }, true);
        this.caption = 'FORWARD ALL MAIL TO MY HEAD.';
        this.emit('eject');
        break;
      case 'honk':
        for (const p of this.pieces.values())
          if (!p.boss) {
            p.activated = true;
            p.body.applyImpulse({ x: 22, y: -4 }, true);
          }
        this.caption = 'HONK IF YOU REQUIRE MEDICAL ATTENTION.';
        this.emit('honk');
        this.flash = 0.5;
        break;
      case 'ghost': {
        const target = [...this.pieces.values()]
          .filter((p) => !p.horse && !p.boss)
          .sort(
            (a, b) =>
              Math.abs(a.body.translation().x - pos.x) -
              Math.abs(b.body.translation().x - pos.x),
          )[0];
        if (target) {
          this.controlled = target.body;
          target.activated = true;
          target.tint = 0x91fff0;
          target.body.setLinvel(
            { x: this.has('ghostly') ? 25 : 18, y: -16 },
            true,
          );
        }
        this.spawn('ghost', x, y - 100, 80, 100, true);
        this.caption = 'NEW BODY. SAME TERRIBLE DRIVER.';
        this.emit('ghost');
        break;
      }
      case 'blackhole':
        this.caption = 'PLEASE KEEP ALL LIMBS INSIDE THE SINGULARITY.';
        this.emit('blackhole');
        break;
      case 'spring':
        this.controlled.setLinvel({ x: 2, y: 0 }, true);
        this.caption = 'YOUR SPINE IS BUFFERING…';
        break;
      case 'dynamite':
        this.disassemble();
        this.burst(x, y, this.has('loose') ? 30 : 22);
        this.caption = 'THE DIAPER WAS LOAD-BEARING.';
        break;
    }
  }
  private announce(text: string) {
    this.caption = text;
    this.verdictUntil = this.elapsed + 1.4;
  }
  private appendage(
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
    const piece = this.spawn(
      part,
      at.x * SCALE + x * Math.cos(a) - y * Math.sin(a),
      at.y * SCALE + x * Math.sin(a) + y * Math.cos(a),
      w,
      h,
      true,
    );
    piece.body.setRotation(a, true);
    piece.body.setLinvel(parent.linvel(), true);
    this.connect(parent, piece.body, { x, y }, { x: 0, y: 0 }, fixed);
    return piece;
  }
  private fallingPunchline(
    part: string,
    w: number,
    h: number,
    role: Piece['afterRole'],
  ) {
    const at = this.controlled.translation(),
      v = this.controlled.linvel();
    const piece = this.spawn(
      part,
      at.x * SCALE + v.x * 8,
      at.y * SCALE - 220,
      w,
      h,
    );
    piece.body.setLinvel({ x: v.x * 0.45, y: 12 }, true);
    piece.afterRole = role;
    this.afterProp = piece;
    return piece;
  }
  private rescue() {
    const size = fitArt('rescue', 190, 100);
    const piece = this.spawn(
      'rescue',
      this.controlled.translation().x * SCALE - 420,
      GROUND_Y - artFoot('rescue', size.w, size.h),
      size.w,
      size.h,
    );
    piece.body.setLinvel({ x: 30, y: 0 }, true);
    piece.afterRole = 'vehicle';
    this.afterProp = piece;
    this.emit(
      'honk',
      piece.body.translation().x * SCALE,
      piece.body.translation().y * SCALE,
    );
  }
  private aftermath(dt: number) {
    const id = this.s.landing,
      script = AFTERMATHS[id];
    this.beat('after-warning', 3.8, () => {
      this.announce(script.warning);
      this.emit('warning', undefined, undefined, 0.3);
    });
    this.beat('after-arrival', 4.2, () => {
      this.afterAnchor = this.controlled.translation().x * SCALE;
      const hero = this.pieces.get(this.controlled.handle)!;
      this.announce(script.arrival);
      switch (id) {
        case 'haystack':
          this.reskin(hero, 'cube', 105, 75);
          this.appendage(hero.body, 'straightLeg', -24, 38, 15, 30);
          this.appendage(hero.body, 'straightLeg', 24, 38, 15, 30);
          hero.body.setLinvel({ x: 13, y: -2 }, true);
          break;
        case 'mud':
          this.rescue();
          break;
        case 'accordion': {
          const p = this.spawn(
            'ufo',
            this.afterAnchor,
            Math.min(-250, hero.body.translation().y * SCALE - 140),
            180,
            140,
          );
          p.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
          this.afterProp = p;
          this.emit('ufo');
          break;
        }
        case 'cartwheel':
          this.fallingPunchline('piano', 175, 175, 'first');
          break;
        case 'fence': {
          for (const side of [-1, 1]) {
            const pole = this.spawn(
              'bone',
              this.afterAnchor + side * 95,
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
          this.reskin(hero, 'torso', 105, 75);
          hero.body.setRotation(Math.PI / 2, true);
          hero.body.setTranslation(
            { x: this.afterAnchor / SCALE, y: -78 / SCALE },
            true,
          );
          hero.body.setLinvel({ x: 0, y: 0 }, true);
          const peg = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.fixed().setTranslation(
              this.afterAnchor / SCALE,
              -128 / SCALE,
            ),
          );
          this.laundryJoint = this.connect(
            peg,
            hero.body,
            { x: 0, y: 0 },
            { x: -50, y: 0 },
          );
          this.emit('woodbreak');
          break;
        }
        case 'sheep': {
          const size = fitArt('sheep', 170, 150);
          const sheep = this.spawn(
            'sheep',
            this.afterAnchor + 170,
            GROUND_Y - artFoot('sheep', size.w, size.h),
            size.w,
            size.h,
          );
          sheep.body.setLinvel({ x: -5, y: 0 }, true);
          this.afterProp = sheep;
          this.emit('sheep');
          break;
        }
        case 'ballet':
          this.controlled = this.head;
          this.head.setLinvel({ x: 3, y: -7 }, true);
          this.head.setAngvel(0.4, true);
          this.appendage(this.head, 'crown', 0, -47, 44, 32, true);
          this.emit('fanfare');
          break;
        case 'dignified':
          this.appendage(this.head, 'crown', 0, -47, 44, 32, true);
          this.emit('fanfare');
          break;
      }
    });
    if (
      id === 'accordion' &&
      this.afterProp &&
      this.elapsed >= 4.2 &&
      this.elapsed < 7.4
    ) {
      const center = this.afterProp.body.translation();
      for (const piece of this.pieces.values())
        if (piece.horse) {
          const p = piece.body.translation(),
            v = piece.body.linvel();
          if (Math.abs(p.x - center.x) > 13) continue;
          const force = (n: number) =>
            Math.max(-28, Math.min(28, n)) * piece.body.mass() * dt;
          piece.body.applyImpulse(
            {
              x: force((center.x - p.x) * 5 - v.x * 2),
              y: force(
                (center.y + 2 - p.y) * 6 - v.y * 3 - 11 * this.s.mod.gravity,
              ),
            },
            true,
          );
        }
    }
    this.beat('after-surprise', id === 'dignified' ? 6.4 : 7.4, () => {
      switch (id) {
        case 'haystack':
          this.fallingPunchline('baler', 180, 190, 'surprise');
          break;
        case 'mud':
          this.fallingPunchline('cabinet', 125, 150, 'surprise');
          break;
        case 'accordion':
          this.afterProp!.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
          this.afterProp!.body.setLinvel({ x: 0, y: 9 }, true);
          this.announce(script.verdict);
          this.emit('metalcrash');
          break;
        case 'cartwheel':
          this.fallingPunchline('piano', 95, 100, 'surprise');
          break;
        case 'fence':
          if (this.laundryJoint) {
            this.world.removeImpulseJoint(this.laundryJoint, true);
            this.laundryJoint = null;
          }
          this.controlled.setLinvel({ x: 11, y: -3 }, true);
          this.rescue();
          this.announce(script.verdict);
          break;
        case 'sheep':
          if (this.afterProp)
            this.appendage(
              this.afterProp.body,
              'helmet',
              this.afterProp.w * 0.21,
              -this.afterProp.h * 0.36,
              64,
              45,
              true,
            );
          this.announce(script.verdict);
          this.emit('crowd');
          break;
        case 'ballet':
          this.fallingPunchline('glove', 170, 170, 'surprise');
          break;
        case 'dignified': {
          const pos = this.controlled.translation();
          const ghost = this.spawn(
            'ghost-head',
            pos.x * SCALE,
            pos.y * SCALE - 70,
            90,
            115,
            true,
          );
          ghost.body.setLinvel({ x: 1, y: -9 }, true);
          ghost.body.setGravityScale(-0.1, true);
          this.controlled = ghost.body;
          this.afterProp = ghost;
          this.announce(script.arrival);
          this.emit('ghost');
          break;
        }
      }
    });
    if (id === 'dignified')
      this.beat('helmet-arrival', 7.7, () => {
        const pos = this.controlled.translation();
        const helmet = this.spawn(
          'helmet',
          pos.x * SCALE,
          pos.y * SCALE - 190,
          70,
          65,
        );
        helmet.body.setLinvel({ x: 0, y: 15 }, true);
        this.afterProp = helmet;
        this.announce('YOUR HELMET WOULD LIKE A WORD.');
      });
  }
  private aftermathContact(a: Piece, b: Piece) {
    const prop = a.afterRole ? a : b.afterRole ? b : null;
    const other = prop === a ? b : a;
    if (!prop || !other.activated) return;
    const key = `after-contact-${prop.afterRole}`;
    if (this.beats.has(key)) return;
    this.beats.add(key);
    const script = AFTERMATHS[this.s.landing];
    this.announce(prop.afterRole === 'first' ? script.arrival : script.verdict);
    if (prop.afterRole === 'vehicle' && other.horse)
      other.body.setLinvel({ x: 24, y: -8 }, true);
    if (this.s.landing === 'haystack' && other.horse)
      this.reskin(other, 'cube', Math.max(35, other.w), Math.max(35, other.h));
    this.emit(
      script.sound,
      prop.body.translation().x * SCALE,
      prop.body.translation().y * SCALE,
      0.8,
      0.065,
    );
  }
  step(dt: number) {
    this.elapsed += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.beat('disassembly', this.has('loose') ? 0.2 : 1.1, () => {
      this.disassemble();
    });
    const spec = CATASTROPHES[this.s.world][this.s.disaster % 4];
    this.beat('machine-warning', Math.max(0.1, spec.beat - 0.4), () => {
      this.caption = 'LOOK OUT. THE EQUIPMENT HAS OPINIONS.';
      this.emit('warning', this.controlled.translation().x * SCALE, -250, 0.35);
    });
    this.beat('machine-arrival', spec.beat, () => {
      const target = this.controlled.translation();
      const anchorX = target.x * SCALE + 110;
      const size = fitArt(spec.trap, 155, 160);
      const at = mechanismPose(spec.mechanism, 0, anchorX, {
        part: spec.trap,
        ...size,
      });
      const trap = this.spawn(spec.trap, at.x, at.y, size.w, size.h);
      this.mechanismBodies.push({
        piece: trap,
        anchorX,
        startedAt: this.elapsed,
      });
      this.caption = 'THIS IS PROBABLY FINE.';
      if (drivenMechanisms.includes(spec.mechanism)) {
        trap.body.setBodyType(
          RAPIER.RigidBodyType.KinematicPositionBased,
          true,
        );
      } else trap.body.setLinvel({ x: 0, y: 14 }, true);
      if (spec.mechanism === 'slide') {
        const slide = this.spawn('bone', 250, 0, 430, 35);
        slide.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
        slide.body.setRotation(0.23, true);
      }
    });
    for (const { piece: trap, anchorX, startedAt } of this.mechanismBodies) {
      const age = this.elapsed - startedAt,
        pos = trap.body.translation();
      if (drivenMechanisms.includes(spec.mechanism)) {
        const at = mechanismPose(spec.mechanism, age, anchorX, trap);
        trap.body.setNextKinematicTranslation({
          x: at.x / SCALE,
          y: at.y / SCALE,
        });
        trap.body.setNextKinematicRotation(at.angle);
      }
      switch (spec.mechanism) {
        case 'tractor':
          for (const p of this.pieces.values())
            if (p.horse) p.body.applyImpulse({ x: 0, y: -dt * 12 }, true);
          break;
        case 'portal':
          if (age > 0.6 && !this.beats.has('portal-warp')) {
            this.beats.add('portal-warp');
            this.controlled.setTranslation({ x: 7, y: -8 }, true);
            this.controlled.setLinvel({ x: 12, y: 5 }, true);
            this.emit('ufo');
          }
          break;
        case 'shredder':
          if (age > 0.5 && !this.beats.has('shredder-burst')) {
            this.beats.add('shredder-burst');
            this.burst(pos.x * SCALE, pos.y * SCALE, 18);
          }
          break;
      }
    }
    if (
      this.s.ability === 'spring' &&
      this.abilityAt >= 0 &&
      this.elapsed - this.abilityAt >= 0.22 &&
      !this.beats.has('spring-release')
    ) {
      this.beats.add('spring-release');
      this.controlled.setLinvel(
        { x: 24, y: -15 * Math.sqrt(this.s.mod.gravity) },
        true,
      );
      this.caption = 'SPINAL TAP. THE SEQUEL.';
      this.emit('rebound', undefined, undefined, 0.9, 0.04);
    }
    this.beat('equipment-followup', 2.4, () => {
      if (this.has('piano')) {
        const p = this.spawn(
          'piano',
          this.controlled.translation().x * SCALE,
          -450,
          165,
          155,
        );
        p.body.setLinvel({ x: 0, y: 20 }, true);
      }
    });
    this.beat('aftershock', 2, () => {
      if (!this.has('aftershock')) return;
      const at = this.controlled.translation();
      this.burst(at.x * SCALE, at.y * SCALE, 15);
    });
    this.aftermath(dt);
    if (
      this.has('magnet') ||
      (this.s.ability === 'blackhole' && this.elapsed - this.abilityAt < 1)
    ) {
      const center = this.controlled.translation();
      for (const p of this.pieces.values()) {
        if (p.horse || p.boss) continue;
        const v = p.body.translation(),
          dx = center.x - v.x,
          dy = center.y - v.y,
          len = Math.max(1, Math.hypot(dx, dy));
        if (len < (this.has('magnet') ? 15 : 10))
          p.body.applyImpulse(
            { x: (dx / len) * dt * 25, y: (dy / len) * dt * 25 },
            true,
          );
      }
    }
    if (
      this.s.ability === 'blackhole' &&
      this.abilityAt >= 0 &&
      this.elapsed - this.abilityAt >= 1 &&
      !this.beats.has('blackhole-release')
    ) {
      this.beats.add('blackhole-release');
      const p = this.controlled.translation();
      this.burst(p.x * SCALE, p.y * SCALE, this.has('magnet') ? 30 : 22);
      this.caption = 'GRAVITY HAS BEEN REVOKED.';
    }
    for (const p of this.pieces.values())
      if (p.boss) {
        const t = this.elapsed;
        const at = bossPose(this.s.world, t, p);
        p.body.setNextKinematicTranslation({
          x: at.x / SCALE,
          y: at.y / SCALE,
        });
        if (this.s.world === 'moon' || this.s.world === 'farm')
          for (const part of this.pieces.values()) {
            if (!part.activated || part.boss) continue;
            const q = part.body.translation(),
              dx = at.x / SCALE - q.x;
            if (Math.abs(dx) < 6)
              part.body.applyImpulse(
                { x: dx * dt * 1.5, y: this.s.world === 'moon' ? -dt * 18 : 0 },
                true,
              );
          }
        if (this.s.world === 'carnival' || this.s.world === 'afterlife')
          for (const when of [2.2, 4.4, 6.6])
            this.beat(`boss-attack-${when}`, when, () => {
              const attack = this.spawn(
                this.s.world === 'carnival' ? 'piano' : 'ghost',
                at.x - 100,
                -400,
                80,
                95,
              );
              attack.body.setLinvel({ x: -5, y: 12 }, true);
              this.emit(
                this.s.world === 'carnival' ? 'piano' : 'ghost',
                at.x,
                -300,
                0.4,
              );
            });
      }
    // A chain of simultaneous blasts must remain readable and playable. This
    // limits character knockback, while loose scenery keeps its full impulse.
    for (const piece of this.pieces.values())
      if (piece.horse) {
        const v = piece.body.linvel();
        const ceiling = -16 * Math.sqrt(this.s.mod.gravity);
        if (v.y < ceiling || Math.abs(v.x) > 32)
          piece.body.setLinvel(
            { x: Math.max(-32, Math.min(32, v.x)), y: Math.max(ceiling, v.y) },
            true,
          );
      }
    for (const p of this.pieces.values()) {
      const velocity = p.body.linvel();
      p.impactSpeed = Math.hypot(velocity.x, velocity.y);
      if (p.detonateAt !== undefined)
        p.tint = Math.floor(this.elapsed * 24) % 2 ? 0xff7050 : 0xfff0a0;
    }
    this.world.step(this.queue);
    const speed = (p: Piece) =>
      Math.max(p.impactSpeed, Math.hypot(p.body.linvel().x, p.body.linvel().y));
    this.queue.drainCollisionEvents((a, b, started) => {
      if (!started) return;
      const pa = this.colliders.get(a),
        pb = this.colliders.get(b);
      if (!pa || !pb) {
        const piece = pa ?? pb;
        if (piece?.activated && speed(piece) > 1.5) this.ignite(piece);
        return;
      }
      this.aftermathContact(pa, pb);
      const ghost =
        pa.part === 'ghost-head' ? pa : pb.part === 'ghost-head' ? pb : null;
      const helmet =
        pa.part === 'helmet' ? pa : pb.part === 'helmet' ? pb : null;
      if (ghost && helmet && !this.helmetPunchline && this.elapsed > 7.7) {
        this.helmetPunchline = true;
        ghost.body.setGravityScale(1.4, true);
        ghost.body.setLinvel({ x: 4, y: 17 }, true);
        this.announce(AFTERMATHS.dignified.verdict);
        this.emit(
          'metalcrash',
          ghost.body.translation().x * SCALE,
          ghost.body.translation().y * SCALE,
          0.85,
          0.1,
        );
      }
      if (
        Math.max(speed(pa), speed(pb)) < 1.5 ||
        (!pa.activated && !pb.activated)
      )
        return;
      if (
        !this.broken &&
        this.elapsed > 0.1 &&
        pa.horse !== pb.horse &&
        Math.max(speed(pa), speed(pb)) > 4
      )
        this.contactBreak = true;
      if (
        this.elapsed >= this.verdictUntil &&
        this.mechanismBodies.some(({ piece }) => piece === pa || piece === pb)
      )
        this.caption = spec.punchline;
      if (pa.activated && !pb.boss) pb.activated = true;
      if (pb.activated && !pa.boss) pa.activated = true;
      this.ignite(pa);
      this.ignite(pb);
      for (const p of [pa, pb])
        if (!p.horse && !p.boss && !p.scored) {
          p.scored = true;
          this.havoc += Math.round(60 * this.s.mod.havoc);
          if (!this.explosive(p))
            this.emit(
              ['bone', 'skeleton', 'bonepile'].includes(p.part)
                ? 'boneclatter'
                : ((
                    {
                      cabinet: 'metalcrash',
                      drum: 'boing',
                      pastry: 'squish',
                      cheese: 'splat',
                      swimring: 'water',
                      piano: 'piano',
                      helmet: 'metalcrash',
                      officeGoose: 'stamp',
                      goose: 'goose',
                      sheep: 'sheep',
                      ufo: 'ufo',
                      ghost: 'ghost',
                      donut: 'teethchomp',
                      jaws: 'teethchomp',
                      baler: 'baler',
                      rescue: 'honk',
                      jam: 'splat',
                    } as Record<string, string>
                  )[p.part] ?? 'woodbreak'),
              p.body.translation().x * SCALE,
              p.body.translation().y * SCALE,
              0.5,
            );
        }
      const boss = pa.boss ? pa : pb.boss ? pb : null,
        other = pa.boss ? pb : pa;
      if (boss) {
        const key = String(other.body.handle);
        if (!this.bossPairs.has(key)) {
          this.bossPairs.add(key);
          this.bossHits++;
          this.havoc += 120;
          boss.tint = 0xffa2ac;
          this.flash = 0.5;
          this.emit(
            'metalcrash',
            boss.body.translation().x * SCALE,
            boss.body.translation().y * SCALE,
            0.7,
            0.04,
          );
          if (this.elapsed >= this.verdictUntil)
            this.caption = `BOSS LIABILITY: ${this.bossHits} CONFIRMED INCIDENTS.`;
        }
      }
    });
    this.queue.drainContactForceEvents((event) => {
      const a = this.colliders.get(event.collider1());
      const b = this.colliders.get(event.collider2());
      if (
        !(a?.activated || b?.activated) ||
        Math.max(a ? speed(a) : 0, b ? speed(b) : 0) < 1.5
      )
        return;
      if (a) this.ignite(a);
      if (b) this.ignite(b);
    });
    if (this.contactBreak && !this.broken) this.disassemble();
    // Remove consumed bodies only after both Rapier event queues are drained.
    for (const p of this.pieces.values())
      if (p.detonateAt !== undefined && this.elapsed >= p.detonateAt)
        this.detonate(p);
  }
  snapshot(): CrashFrame {
    const c = this.controlled.translation();
    return {
      bodies: [...this.pieces.values()].map((p) => ({
        id: p.body.handle,
        part: p.part,
        x: this.origin + p.body.translation().x * SCALE,
        y: p.body.translation().y * SCALE,
        angle: p.body.rotation(),
        w: p.w,
        h: p.h,
        tint: p.tint,
        alpha: p.alpha,
        boss: p.boss,
      })),
      time: this.elapsed,
      kicks: this.kicks,
      abilityReady: this.abilityReady,
      abilityAge: this.elapsed - this.abilityAt,
      focusX: this.origin + c.x * SCALE,
      focusY: c.y * SCALE,
      focusId: this.controlled.handle,
      havoc: this.havoc,
      bossHits: this.bossHits,
      caption: this.caption,
      flash: this.flash,
      synergy: '',
      aftermath:
        this.elapsed >= 3.8
          ? {
              id: this.s.landing,
              anchorX: this.origin + this.afterAnchor,
              propId: this.afterProp?.body.handle,
              active: this.elapsed >= 4.2 && this.elapsed < 7.4,
            }
          : undefined,
    };
  }
  drain() {
    const out = this.events;
    this.events = [];
    return out;
  }
  dispose() {
    this.queue.free();
    this.world.free();
  }
}
