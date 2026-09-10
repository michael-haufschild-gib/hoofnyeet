import { Graphics } from 'pixi.js';
import { artFoot } from '../../art/geometry';
import type { Illustration } from './spectator-show';
import {
  queuedSoul,
  turnstileMotion,
  TURNSTILE_ART,
} from '../motion/afterlife-motion';

type Soul = NonNullable<ReturnType<typeof queuedSoul>>;
type Turnstile = ReturnType<typeof turnstileMotion>;
interface Axle {
  x: number;
  y: number;
}

/** Alternates the waiting line between bare bones and drifting heads. */
function soulKey(index: number) {
  return index % 2 ? 'skeleton' : 'ghost-head';
}

/**
 * Paints the anatomical paperwork a rejected soul carries back out of the
 * slot. `p.ticket` runs 0..1 from the moment of contact and slides the paper
 * left and down away from the axle, so nothing is drawn while it reads 0.
 * `gentle` swaps the flesh tone for candy green; `reduced` freezes its tumble.
 */
function drawTicket(
  g: Graphics,
  axle: Axle,
  ground: number,
  index: number,
  p: Soul,
  reduced: boolean,
  gentle: boolean,
) {
  const a = p.ticket;
  const xx = axle.x - 11 - a * (54 + index * 9);
  const yy = ground - 109 + a * 86;
  const angle = (reduced ? -0.12 : -a * 1.1) + index * 0.08;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  g.save()
    .setTransform(c, s, -s, c, xx, yy)
    .roundRect(-8, -13, 16, 26, 2)
    .fill(gentle ? 0xe9f7d7 : 0xf79b95)
    .stroke({ color: 0x502638, width: 1.4 })
    .circle(0, -3, 4)
    .fill(0xffefcb)
    .circle(-1.7, -3, 1.1)
    .circle(1.7, -3, 1.1)
    .fill(0x502638)
    .moveTo(-4, 5)
    .lineTo(4, 10)
    .moveTo(4, 5)
    .lineTo(-4, 10)
    .stroke({ color: 0x502638, width: 2 })
    .restore();
}

/** A decorative tableau, sampled only from the existing dignified cue. The
 * player's body never belongs to this machine or its queue. */
export class AfterlifeQueue {
  constructor(
    private ink: Graphics,
    private art: Illustration,
  ) {}

  draw(
    x: number,
    ground: number,
    time: number,
    reduced: boolean,
    gentle: boolean,
  ) {
    const gateX = x + 72;
    const h = TURNSTILE_ART.height;
    const motion = turnstileMotion(time, reduced);
    const axle = { x: gateX, y: ground - h * (1 - TURNSTILE_ART.axle.y) };
    this.drawMachine(gateX, ground, h, motion, axle);
    this.drawReaper(gateX, ground, motion, reduced);
    this.drawQueue(axle, ground, time, reduced, gentle);
    if (motion.reject > 0 && !reduced) {
      this.ink
        .moveTo(axle.x - 32, axle.y - 29)
        .quadraticCurveTo(axle.x - 58, axle.y - 8, axle.x - 32, axle.y + 15)
        .stroke({ color: 0xe9fff1, width: 3, alpha: motion.reject * 0.7 });
    }
    if (time > 4) this.drawEscape(x, ground, time, reduced);
  }

  /** Painted socket, its three bone arms and the hub cap that hides the joint. */
  private drawMachine(
    gateX: number,
    ground: number,
    h: number,
    motion: Turnstile,
    axle: Axle,
  ) {
    const g = this.ink;
    const post = this.art('turnstile', gateX, ground - h / 2, 80, h);
    if (post) {
      post.x -= (TURNSTILE_ART.axle.x - 0.5) * post.width;
      post.label = 'afterlife-turnstile';
    } else {
      g.roundRect(gateX - 8, ground - 122, 16, 113, 4)
        .fill(0x7799a8)
        .stroke({ color: 0x502638, width: 3 });
    }
    // The rotating bone arms are separate articulated parts of the illustrated
    // socket. No whole-machine wobble can detach them from its painted axle.
    for (let i = 0; i < 3; i++) {
      const a = motion.angle + (i * Math.PI * 2) / 3;
      const dx = Math.cos(a) * TURNSTILE_ART.arm;
      const dy = Math.sin(a) * TURNSTILE_ART.arm * 0.72;
      const arm = this.art(
        'bone',
        axle.x + dx / 2,
        axle.y + dy / 2,
        Math.hypot(dx, dy),
        40,
        Math.atan2(dy, dx),
      );
      if (arm) arm.label = `afterlife-arm-${i}`;
    }
    g.circle(axle.x + 1, axle.y + 2, 8)
      .fill(0x502638)
      .circle(axle.x, axle.y, 6)
      .fill(0xefcb77)
      .circle(axle.x - 1.5, axle.y - 1.5, 2)
      .fill(0xfff2c9);
  }

  /** Seats the gatekeeper's feet on the track, rocking him back on each reject. */
  private drawReaper(
    gateX: number,
    ground: number,
    motion: Turnstile,
    reduced: boolean,
  ) {
    const reaper = this.art(
      'reaper',
      gateX + 68,
      ground - 70,
      101,
      145,
      reduced ? 0 : -motion.recoil * 0.06,
    );
    if (!reaper) return;
    reaper.y =
      ground - artFoot('reaper', reaper.width, reaper.height, reaper.rotation);
    reaper.label = 'afterlife-reaper';
  }

  /** The five queued souls and the paperwork each one is turned away with. */
  private drawQueue(
    axle: Axle,
    ground: number,
    time: number,
    reduced: boolean,
    gentle: boolean,
  ) {
    for (let i = 0; i < 5; i++) {
      const p = queuedSoul(i, time, reduced);
      if (!p) continue;
      const soul = this.art(
        soulKey(i),
        axle.x + p.x,
        axle.y + p.y,
        p.size,
        p.size * 1.15,
        p.angle,
        p.alpha,
        0xa9ffe9,
      );
      if (soul) {
        soul.label = `afterlife-soul-${i}`;
        soul.scale.x *= p.scaleX;
        soul.scale.y *= p.scaleY;
      }
      if (p.rejection > 0) {
        drawTicket(this.ink, axle, ground, i, p, reduced, gentle);
      }
    }
  }

  /** Two beats after the wreck, the last soul leaves the helmet on a wisp. */
  private drawEscape(
    x: number,
    ground: number,
    time: number,
    reduced: boolean,
  ) {
    const helmet = this.art('helmet', x, ground - 31, 78, 62);
    const p = Math.max(0, Math.min(1, (time - 4.4) / 0.8));
    const escape = 1 - p * p * (3 - 2 * p);
    const vent = {
      x: x + (helmet?.width ?? 78) * 0.09,
      y: (helmet?.y ?? ground - 31) - (helmet?.height ?? 62) * 0.38,
    };
    const soul = this.art(
      'ghost-head',
      vent.x - escape * 7,
      vent.y - escape * (reduced ? 22 : 51),
      4 + escape * 23,
      8 + escape * 30,
      0,
      0.12 + escape * 0.68,
    );
    if (soul) soul.label = 'afterlife-final-soul';
    this.ink
      .moveTo(vent.x - 11, vent.y)
      .quadraticCurveTo(vent.x - 22, vent.y - 35, vent.x - 5, vent.y - 47)
      .stroke({ color: 0xbdfae8, width: 2, alpha: 0.2 + escape * 0.5 });
  }
}
