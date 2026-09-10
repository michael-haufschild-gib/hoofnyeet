import type { Graphics, Sprite } from 'pixi.js';
import type { BodyPose } from '../../crash';
import type { CarnageCue } from '../../catalogue/escalation';
import { GROUND_Y } from '../../art/geometry';
import {
  bossBirth,
  bossEmission,
  bossShow,
  bossSocket,
  bossEase as ease,
} from '../motion/boss-motion';

const INK = 0x502638,
  CREAM = 0xffedbf,
  MINT = 0xa7efda;

/** Paints one throbbing organ centred on `x`/`y` in world units, `size` pixels
 * across, animated from show time `t` in seconds and tilted by `angle`. */
export type Organ = (
  x: number,
  y: number,
  size: number,
  t: number,
  angle?: number,
) => void;

/** Slings a sagging tube from `x`/`y` to `xx`/`yy` in world units. `t` seconds
 * drives its wobble, `width` is the stroke in pixels, `color` is 0xRRGGBB and
 * `sag` shifts the midpoint down in pixels (negative lifts it). */
export type Ribbon = (
  x: number,
  y: number,
  xx: number,
  yy: number,
  t: number,
  width?: number,
  color?: number,
  sag?: number,
) => void;

/** The sampled boss pose for one frame: show age in seconds, the world-space
 * socket the act emits from, and the eased 0-to-1 beats the scenes read. */
export type Pose = NonNullable<ReturnType<typeof bossShow>>;

/**
 * Everything a boss act paints with. `red`, `reduced` and `gentle` are refreshed
 * by BossShow before every dispatch, so an act must read them off the kit
 * instead of capturing them. The primitives all draw straight into the owning
 * layer and share its bounded sprite pool, so call order is paint order.
 */
export interface BossKit {
  red: number;
  reduced: boolean;
  gentle: boolean;
  organ: Organ;
  ribbon: Ribbon;
  art(
    key: string,
    x: number,
    y: number,
    w: number,
    h?: number,
    angle?: number,
    alpha?: number,
  ): Sprite | undefined;
  stand(
    key: string,
    x: number,
    w: number,
    h?: number,
    angle?: number,
    lift?: number,
  ): Sprite | undefined;
  foregroundArt(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    angle?: number,
  ): void;
  local(x: number, y: number, angle?: number): Graphics;
  flash(x: number, y: number, age: number): void;
  bits(x: number, y: number, age: number, seed: number, count?: number): void;
}

/** The five approved organs land on the desk a quarter second apart, each with
 * its own paperwork. The tick only appears once a card has been signed off. */
function officeStamps(k: BossKit, c: CarnageCue, t: number, tableY: number) {
  for (let i = 0; i < 5; i++) {
    const xx = c.x - 110 + i * 45;
    const arrival = bossBirth(t, i, 0.24);
    if (arrival === null) continue;
    const entry = ease(arrival / 0.2);
    k.organ(xx, tableY + (1 - entry) * 12, 26, t + i);
    const card = k.local(xx, tableY - 25, (1 - entry) * -0.25);
    card
      .roundRect(-15, -9, 30, 18, 2)
      .fill(CREAM)
      .stroke({ color: k.red, width: 2 });
    if (arrival > 0.17) {
      card.circle(4, 0, 5).stroke({ color: 0x41877d, width: 1.5 });
      card
        .moveTo(1, 0)
        .lineTo(3, 3)
        .lineTo(8, -3)
        .stroke({ color: 0x41877d, width: 2 });
    }
    card.restore();
    k.foregroundArt(i % 2 ? 'heart' : 'brain', xx, tableY + 4, 26, 27);
  }
}

/** The stamp itself, hopping down the row on the same 0.24s cadence as the
 * arrivals and still tethered to the machine that swings it. */
function officeStamper(
  k: BossKit,
  c: CarnageCue,
  p: Pose,
  t: number,
  tableY: number,
) {
  const index = Math.min(4, Math.floor(t / 0.24));
  const phase = t / 0.24 - index;
  const stampX = c.x - 110 + index * 45;
  const stampY =
    tableY - 25 - (1 - Math.sin(Math.min(1, phase) * Math.PI)) * 32;
  k.ribbon(
    p.socket.x,
    p.socket.y,
    stampX,
    stampY - 12,
    t,
    8,
    k.gentle ? MINT : 0xf2ae8b,
    0,
  );
  const g = k.local(stampX, stampY);
  g.roundRect(-8, -23, 16, 18, 4)
    .fill(0x9b6141)
    .stroke({ color: INK, width: 2 });
  g.roundRect(-20, -7, 40, 10, 3).fill(k.red).stroke({ color: INK, width: 3 });
  g.restore();
}

/** Wings flap out of the machine toward the copier on a staggered arc, and
 * vanish the moment each one lands. */
function officeWings(k: BossKit, b: BodyPose, t: number, copierX: number) {
  for (let i = 0; i < 5; i++) {
    const start = bossSocket(b, 0.5, 0.19);
    const progress = ease((t - 2.4 - i * 0.14) / 0.85);
    const xx = start.x + (copierX - start.x) * progress;
    const yy =
      start.y + (-44 - start.y) * progress - Math.sin(progress * Math.PI) * 32;
    if (progress < 1) k.art('wing-left', xx, yy, 25, 40, k.reduced ? 0 : t + i);
  }
}

/** Seven rejected printouts spit out of the copier on ballistic arcs. */
function officePaper(k: BossKit, t: number, copierX: number) {
  for (let i = 0; i < 7; i++) {
    const age = t - 3.1 - i * 0.11;
    if (age < 0) continue;
    const x = copierX + 15 + age * 24,
      y = Math.min(-9, -49 - 37 * age + 31 * age * age);
    const paper = k.local(x, y, k.reduced ? 0.2 : age * 0.7);
    paper.rect(-8, -10, 16, 20).fill(CREAM).stroke({ color: INK, width: 1 });
    paper
      .moveTo(-4, -5)
      .lineTo(3, 5)
      .moveTo(3, -5)
      .lineTo(-4, 5)
      .stroke({ color: k.red, width: 2 });
    paper.restore();
  }
}

/** The goose that climbs out of the copier once the paperwork is finished. */
function officeSurvivor(k: BossKit, t: number, copierX: number) {
  const rise = ease((t - 4.15) / 0.4);
  k.art(
    'officeGoose',
    copierX,
    -55 - rise * 37,
    43,
    58,
    k.reduced ? 0 : Math.sin(t * 5) * 0.08,
  );
  k.art('bone', copierX + 21, -70 - rise * 33, 31, 12, -0.5);
  k.flash(copierX, -64, t - 4.15);
}

/** The office act: organs are approved, stamped, flown to the copier and
 * reprinted badly, and one goose walks away from the whole procedure. */
export function office(k: BossKit, c: CarnageCue, b: BodyPose, p: Pose) {
  const t = p.age,
    tableY = GROUND_Y - 27;
  officeStamps(k, c, t, tableY);
  if (t < 1.5) officeStamper(k, c, p, t, tableY);
  const copierX = c.x + 135 + (1 - ease(t / 0.8)) * 900;
  const copier = k.stand('copier', copierX, 79, 84);
  if (copier) copier.y = GROUND_Y - copier.height / 2;
  officeWings(k, b, t, copierX);
  if (t > 3.1) officePaper(k, t, copierX);
  if (t > 4.15) officeSurvivor(k, t, copierX);
}

/** Eight leftovers orbit the blender, drawn inward until the 2.4s reversal
 * throws them back out, each still tethered to the nozzle. */
function moonDebris(
  k: BossKit,
  b: BodyPose,
  t: number,
  nozzle: Pose['socket'],
) {
  for (let i = 0; i < 8; i++) {
    const outward = t > 2.4 ? 1 + (t - 2.4) * 0.8 : 1 - t * 0.25;
    const a = (k.reduced ? 0 : t * 3) + (i * Math.PI) / 4;
    const xx = b.x + Math.cos(a) * 110 * outward;
    const yy = b.y + Math.sin(a) * 70 * outward;
    k.art(i % 2 ? 'bone' : 'eye', xx, yy, 32, 32, k.reduced ? 0 : a);
    k.ribbon(nozzle.x, nozzle.y, xx, yy, t + i, 3, 0xaff3c5, 0);
  }
}

/** The heart wedged in the intake, pulsing as it seals the nozzle shut. */
function moonClog(k: BossKit, b: BodyPose, t: number, nozzle: Pose['socket']) {
  const clog = ease((t - 0.55) / 0.8);
  const pulse = k.reduced ? 0 : Math.sin(t * 18) * clog * 3;
  k.art(
    'heart',
    nozzle.x,
    nozzle.y + 27 * (1 - clog),
    44 + pulse,
    57 + pulse,
    b.angle,
  );
  for (const side of [-1, 1])
    k.art('droplet', nozzle.x + side * 27, nozzle.y + 12, 7, 18, side * -0.3);
}

/** The ejected pilot: tethered on the way up, then under a brain parachute
 * once 1.2s of flight have passed. */
function moonPilot(
  k: BossKit,
  c: CarnageCue,
  b: BodyPose,
  p: Pose,
  nozzle: Pose['socket'],
) {
  const t = p.age;
  const release = bossEmission(c, b, 2.4),
    age = t - 2.4;
  const pilotX = release.x + p.variation * age * 75;
  const pilotY = Math.min(-27, release.y + 35 - 93 * age + 25 * age * age);
  k.art(
    'ghost-head',
    pilotX,
    pilotY,
    43,
    55,
    k.reduced ? 0 : p.variation * age * 0.7,
  );
  if (age < 1.2)
    k.ribbon(nozzle.x, nozzle.y, pilotX, pilotY, age, 5, MINT, -20);
  else {
    const chute = ease((age - 1.2) / 0.3);
    k.art('brain', pilotX, pilotY - 46 * chute, 63, 46, 0);
    k.ribbon(
      pilotX - 22 * chute,
      pilotY - 36 * chute,
      pilotX,
      pilotY - 8,
      age,
      2,
      CREAM,
      0,
    );
    k.ribbon(
      pilotX + 22 * chute,
      pilotY - 36 * chute,
      pilotX,
      pilotY - 8,
      age,
      2,
      CREAM,
      0,
    );
  }
  k.bits(release.x, release.y, age, c.seed, 12);
  k.flash(nozzle.x, nozzle.y, age);
  if (age > 1.6) k.art('heart', nozzle.x, nozzle.y, 34, 43, b.angle);
}

/** The moon act: the blender's own leftovers orbit it until it jams and spits
 * its pilot out. */
export function moon(k: BossKit, c: CarnageCue, b: BodyPose, p: Pose) {
  const t = p.age,
    nozzle = p.socket;
  moonDebris(k, b, t, nozzle);
  // A heart blocks the intake, then the existing reversal ejects the pilot.
  if (t < 2.4) moonClog(k, b, t, nozzle);
  if (t >= 2.4) moonPilot(k, c, b, p, nozzle);
}

/** Four souls leave the patient 0.35s apart, each smaller and fainter than the
 * last, and fade out over the four seconds after they appear. */
function afterlifeSouls(
  k: BossKit,
  t: number,
  patientX: number,
  patientY: number,
) {
  for (let i = 0; i < 4; i++) {
    const rise = bossBirth(t, i, 0.35);
    if (rise === null) continue;
    const x = patientX + (k.reduced ? 0 : Math.sin(rise * 3) * 25);
    k.art(
      'ghost-head',
      x,
      patientY - rise * 65,
      54 - i * 7,
      67 - i * 7,
      0,
      ease(rise / 0.08) * Math.max(0, 1 - rise / 4),
    );
  }
}

/** The rescue: a swim ring is winched down, and from 3.4s the reaper itself is
 * hauled up out of its own hood. */
function afterlifeRescue(
  k: BossKit,
  b: BodyPose,
  p: Pose,
  t: number,
  patientX: number,
  patientY: number,
) {
  const rescue = ease((t - 2.4) / 0.85);
  const ring = bossSocket(b, 0.5, 0.3);
  k.ribbon(
    ring.x + 50,
    ring.y - 90,
    patientX - 50,
    patientY + 20,
    t,
    6,
    CREAM,
    -30,
  );
  k.art('swimring', ring.x, ring.y - (1 - rescue) * 90, 82, 63, b.angle);
  if (t > 3.4) {
    const lift = ease((t - 3.4) / 0.65);
    const hood = bossSocket(b, 0.44, 0.18);
    k.art(
      'reaper',
      hood.x + p.variation * lift * 17,
      hood.y - lift * 62,
      42,
      66,
      b.angle + p.variation * 0.18,
      0.72,
    );
    k.art('ghost-head', hood.x, hood.y + 2, 34, 44, b.angle, 0.9);
    k.flash(hood.x, hood.y, t - 3.4);
    if (t > 4.3)
      k.art('helmet', hood.x + p.variation * 12, hood.y - 20, 42, 33, b.angle);
  }
}

/** The afterlife act: chest compressions on a skeleton for the first 1.4s,
 * souls leaving anyway, and a rescue that saves the wrong participant. */
export function afterlife(k: BossKit, c: CarnageCue, b: BodyPose, p: Pose) {
  const t = p.age,
    patientX = c.x,
    patientY = GROUND_Y - 39;
  const beat = Math.min(3, Math.floor(t / 0.35));
  const pulseAge = t - beat * 0.35;
  const compression =
    t < 1.4 ? Math.sin(Math.min(1, pulseAge / 0.35) * Math.PI) : 0;
  k.art(
    'skeletal-torso',
    patientX,
    patientY + compression * 8,
    112,
    70 - compression * 14,
    0,
  );
  const hand = bossSocket(b, 0.17, 0.48);
  if (t < 1.5) {
    k.ribbon(
      hand.x,
      hand.y,
      patientX,
      patientY - 15 + compression * 12,
      t,
      8,
      CREAM,
      0,
    );
    k.art('bone', patientX, patientY - 14 + compression * 12, 38, 12, 0);
  }
  afterlifeSouls(k, t, patientX, patientY);
  if (t > 2.4) afterlifeRescue(k, b, p, t, patientX, patientY);
}
