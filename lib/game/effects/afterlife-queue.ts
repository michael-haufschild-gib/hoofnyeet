import { Graphics } from 'pixi.js';
import { artFoot } from '../geometry';
import type { Illustration } from './spectator-show';
import { queuedSoul, turnstileMotion, TURNSTILE_ART } from './afterlife-motion';

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
    const g = this.ink;
    const gateX = x + 72;
    const h = TURNSTILE_ART.height;
    const motion = turnstileMotion(time, reduced);
    const post = this.art('turnstile', gateX, ground - h / 2, 80, h);
    const pivot = { x: gateX, y: ground - h * (1 - TURNSTILE_ART.axle.y) };
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
        pivot.x + dx / 2,
        pivot.y + dy / 2,
        Math.hypot(dx, dy),
        40,
        Math.atan2(dy, dx),
      );
      if (arm) arm.label = `afterlife-arm-${i}`;
    }
    g.circle(pivot.x + 1, pivot.y + 2, 8)
      .fill(0x502638)
      .circle(pivot.x, pivot.y, 6)
      .fill(0xefcb77)
      .circle(pivot.x - 1.5, pivot.y - 1.5, 2)
      .fill(0xfff2c9);
    const reaper = this.art(
      'reaper',
      gateX + 68,
      ground - 70,
      101,
      145,
      reduced ? 0 : -motion.recoil * 0.06,
    );
    if (reaper) {
      reaper.y =
        ground -
        artFoot('reaper', reaper.width, reaper.height, reaper.rotation);
      reaper.label = 'afterlife-reaper';
    }
    for (let i = 0; i < 5; i++) {
      const p = queuedSoul(i, time, reduced);
      if (!p) continue;
      const soul = this.art(
        i % 2 ? 'skeleton' : 'ghost-head',
        pivot.x + p.x,
        pivot.y + p.y,
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
        // A rejected anatomical ticket follows each soul back out of the slot.
        const a = p.ticket;
        const xx = pivot.x - 11 - a * (54 + i * 9);
        const yy = ground - 109 + a * 86;
        const angle = (reduced ? -0.12 : -a * 1.1) + i * 0.08;
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
    }
    if (motion.reject > 0 && !reduced) {
      g.moveTo(pivot.x - 32, pivot.y - 29)
        .quadraticCurveTo(pivot.x - 58, pivot.y - 8, pivot.x - 32, pivot.y + 15)
        .stroke({ color: 0xe9fff1, width: 3, alpha: motion.reject * 0.7 });
    }
    if (time > 4) {
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
      g.moveTo(vent.x - 11, vent.y)
        .quadraticCurveTo(vent.x - 22, vent.y - 35, vent.x - 5, vent.y - 47)
        .stroke({ color: 0xbdfae8, width: 2, alpha: 0.2 + escape * 0.5 });
    }
  }
}
