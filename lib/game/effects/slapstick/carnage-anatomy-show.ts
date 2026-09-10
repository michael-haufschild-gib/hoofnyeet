import { GROUND_Y } from '../../art/geometry';
import type { BodyPose, CrashFrame } from '../../crash';
import type { GameState } from '../../simulation';
import {
  anatomyAntic,
  anatomyIncident,
  anatomyPoint,
  tissueSocket,
  type AnatomyAntic,
} from '../motion/anatomy-motion';
import { CREAM, INK, ease, type CarnageBrush } from './carnage-brush';

/** One resolved gag pose, as the motion module hands it over. */
type Antic = NonNullable<ReturnType<typeof anatomyAntic>>;

/** Bodies of the current frame, indexed so an attachment can find both ends. */
type Bodies = Map<number, BodyPose>;

/** One elastic strand recorded between two bodies of the same wreck. */
type Attachment = NonNullable<CrashFrame['carnage']>['attachments'][number];

/** Paints one gag around the organ already drawn at `x`,`y`. */
type AnticPainter = (
  brush: CarnageBrush,
  p: Antic,
  x: number,
  y: number,
  size: number,
) => void;

/**
 * Paddles on their leads, then a discharge arc across the organ. Runs from
 * 0.55 s to 2.5 s after the contact; the arc needs `shock` above 0.08.
 */
function defibrillator(
  brush: CarnageBrush,
  p: Antic,
  x: number,
  y: number,
  size: number,
) {
  const t = p.age;
  if (t <= 0.55 || t >= 2.5) return;
  const g = brush.drawings;
  const ready = ease((t - 0.55) / 0.5),
    retreat = ease((t - 1.8) / 0.7);
  const reach = size * (0.68 - ready * 0.32 + retreat * 0.42);
  for (const side of [-1, 1]) {
    const px = x + side * reach,
      py = y + size * 0.13;
    brush.ribbon(
      p.root.x + side * 8,
      p.root.y,
      px,
      py,
      brush.time,
      3,
      brush.pink,
      15,
    );
    brush.art('bone', px, py - 8, 30, 11, side * (-0.9 + ready * 0.8));
    g.roundRect(px - 5, py - 12, 10, 19, 3)
      .fill(0xa6dcd0)
      .stroke({ color: INK, width: 2 });
  }
  if (p.shock <= 0.08) return;
  g.moveTo(x - reach, y);
  for (let i = 1; i <= 9; i++)
    g.lineTo(
      x - reach + (i / 9) * reach * 2,
      y + (i % 2 ? -1 : 1) * (8 + p.shock * 8),
    );
  g.stroke({ color: 0xc2fff1, width: 4 });
  g.star(x, y, 9, size * (0.58 + p.shock * 0.12), size * 0.45, t).stroke({
    color: 0xffeb9a,
    width: 2,
    alpha: p.shock,
  });
}

/**
 * Inflation ribs from 0.8 s to 2.1 s, then a burst that throws hearts and eyes
 * outward between 2.0 s and 2.8 s. The two overlap by design.
 */
function balloon(
  brush: CarnageBrush,
  p: Antic,
  x: number,
  y: number,
  size: number,
) {
  const t = p.age;
  const g = brush.drawings;
  if (t > 0.8 && t < 2.1)
    for (let i = 0; i < 3; i++) {
      const yy = y + size * (0.05 + i * 0.15);
      g.moveTo(x + size * 0.48, yy)
        .quadraticCurveTo(x + size * 0.75, yy - 8, x + size * 0.8, yy + 2)
        .stroke({ color: CREAM, width: 2.2, alpha: p.balloon });
    }
  if (t <= 2 || t >= 2.8) return;
  const a = (t - 2) / 0.8;
  for (let i = 0; i < 7; i++) {
    const angle = (i * Math.PI * 2) / 7;
    brush.art(
      i % 2 ? 'eye' : 'heart',
      x + Math.cos(angle) * (16 + a * 62),
      y + Math.sin(angle) * (16 + a * 47) + a * a * 22,
      16,
      19,
      angle + a * 4,
      1 - a,
    );
  }
}

/** Both rotor blades thrown clear once the hub gives way at 2 s. */
function rotorDebris(
  brush: CarnageBrush,
  x: number,
  hubY: number,
  snap: number,
) {
  for (const side of [-1, 1])
    brush.art(
      'bone',
      x + side * snap * 78,
      hubY - snap * 50 + snap * snap * 85,
      47,
      15,
      side * snap * 10,
      Math.max(0, 1 - snap),
    );
}

/** A mast and spinning rotor from 0.22 s, shedding its blades after 2 s. */
function helicopter(
  brush: CarnageBrush,
  p: Antic,
  x: number,
  y: number,
  size: number,
) {
  const t = p.age;
  if (t <= 0.22 || t >= 3.0) return;
  const g = brush.drawings;
  const snap = Math.max(0, t - 2),
    hubY = y - size * 0.51;
  g.moveTo(x, y - size * 0.31)
    .lineTo(x, hubY)
    .stroke({ color: brush.pink, width: 4 });
  if (snap) {
    rotorDebris(brush, x, hubY, snap);
    return;
  }
  for (let i = 0; i < 2; i++)
    brush.art('bone', x, hubY, 76, 18, t * 28 + (i * Math.PI) / 2);
  g.ellipse(x, hubY, 41, 7).stroke({ color: CREAM, width: 2, alpha: 0.6 });
}

/** A canopy on two shroud lines from 0.2 s, collapsing from 2.15 s. */
function parachute(
  brush: CarnageBrush,
  p: Antic,
  x: number,
  y: number,
  size: number,
) {
  const t = p.age;
  if (t <= 0.2 || t >= 3.4) return;
  const close = ease((t - 2.15) / 0.3);
  const canopyY = y - size * (0.8 - close * 0.48);
  const canopy = brush.art(
    'helmet',
    x,
    canopyY,
    size * (1.5 - close * 0.25),
    size * 0.92,
    -0.1 + Math.sin(t * 7) * 0.12,
  );
  if (canopy) canopy.scale.y *= 1 - close * 0.5;
  for (const side of [-1, 1])
    brush.ribbon(
      x + side * size * 0.49,
      canopyY + size * 0.09,
      x + side * size * 0.2,
      y - size * 0.1,
      brush.time,
      2,
      CREAM,
      0,
    );
}

const ANTICS: Record<AnatomyAntic, AnticPainter> = {
  defibrillator,
  balloon,
  helicopter,
  parachute,
};

/**
 * Every wound in one recorded frame: the elastic strands between attached
 * bodies, the organs and char marks on each injured part, the gag a fresh
 * contact sprouts, and the lasso holding a grabbed prop. Draws only; the
 * caller supplies the frame and has already confirmed its carnage exists.
 */
export class CarnageAnatomyShow {
  constructor(private brush: CarnageBrush) {}

  draw(s: GameState) {
    const w = s.wreck!;
    const byId: Bodies = new Map(w.bodies.map((b) => [b.id, b]));
    for (const a of w.carnage!.attachments) this.strand(a, byId);
    for (const b of w.bodies) this.wound(b, s);
    this.lasso(w, byId);
  }

  /** One strand between two attached bodies, dropped once they drift apart. */
  private strand(a: Attachment, byId: Bodies) {
    const from = byId.get(a.from),
      to = byId.get(a.to);
    if (
      !from ||
      !to ||
      Math.hypot(from.x - to.x, from.y - to.y) > (a.elastic ? 650 : 310)
    )
      return;
    const start = tissueSocket(from, true),
      end = tissueSocket(to, false);
    this.brush.ribbon(
      start.x,
      start.y,
      end.x,
      end.y,
      this.brush.time,
      a.elastic ? 11 : 6,
      this.brush.red,
      a.elastic ? 95 : 30,
    );
  }

  /** Everything one injured body carries, skipped when it is off camera. */
  private wound(b: BodyPose, s: GameState) {
    if (!b.injury || b.part === 'eye' || b.part === 'tail') return;
    if (b.x < this.brush.left - 100 || b.x > this.brush.right + 100) return;
    if (b.charred && !this.brush.gentle) this.charring(b);
    if (!this.softTissue(b)) return;
    this.character(b, s);
  }

  /** Draws the wound a torso or a head carries, and reports which it was. */
  private softTissue(b: BodyPose): boolean {
    if (b.part.includes('torso') || b.part === 'cube') {
      this.torsoWound(b);
      return true;
    }
    if (b.part.includes('head') || b.part === 'surprisedHead') {
      this.headWound(b);
      return true;
    }
    return false;
  }

  /** A scorched repaint of the sprite, with two embers where the eyes were. */
  private charring(b: BodyPose) {
    this.brush.art(b.part, b.x, b.y, b.w, b.h, b.angle, 0.62, 0x321f36);
    const a = anatomyPoint(b, -0.12, -0.12),
      z = anatomyPoint(b, 0.12, -0.12);
    this.brush.drawings.circle(a.x, a.y, 4).circle(z.x, z.y, 4).fill(0xfff0c4);
  }

  /** A liver and three trailing strands hanging out of a torso's flank. */
  private torsoWound(b: BodyPose) {
    const brush = this.brush;
    const liver = anatomyPoint(b, -0.1, 0.23);
    brush.organ(liver.x, liver.y, b.w * 0.23, brush.time, b.angle);
    for (let i = 0; i < 3; i++) {
      const root = anatomyPoint(b, -0.18 + i * 0.14, 0.24);
      brush.ribbon(
        root.x,
        root.y,
        root.x + Math.sin(brush.time * 3 + i) * 10,
        Math.min(GROUND_Y - 6, root.y + 35 + i * 8),
        brush.time + i,
        6,
      );
    }
  }

  /** A neck stump, with a strand only once the head is badly injured. */
  private headWound(b: BodyPose) {
    const brush = this.brush;
    const wound = anatomyPoint(b, -0.13, 0.28);
    const yy = Math.min(GROUND_Y - 6, wound.y);
    brush
      .localDrawing(wound.x, yy, b.angle)
      .ellipse(0, 0, 10, 4)
      .fill(brush.red)
      .restore();
    if (b.injury! >= 2)
      brush.ribbon(
        wound.x,
        yy,
        wound.x - 12,
        yy + 20 + Math.sin(brush.time * 5) * 6,
        brush.time,
        5,
      );
  }

  /** The grabbed prop's tether, its target ring and the queued input pips. */
  private lasso(w: CrashFrame, byId: Bodies) {
    const brush = this.brush;
    const grab = w.carnage!.grab;
    if (!grab) return;
    const body = byId.get(grab.bodyId),
      prop = byId.get(grab.propId);
    if (!body || !prop) return;
    brush.ribbon(prop.x, prop.y, body.x, body.y, brush.time, 15);
    brush.drawings
      .circle(body.x, body.y, 52)
      .stroke({ color: 0xffdc83, width: 3, alpha: 0.7 });
    for (let i = 0; i < grab.queued.length; i++)
      brush.art(
        'straightLeg',
        body.x - 24 + i * 16,
        body.y - 57,
        12,
        24,
        -0.3 + Math.sin(brush.time * 8) * 0.2,
      );
  }

  /**
   * The persistent liver and strands remain. A distinct expressive organ
   * sprouts from the same wound, with a stem connecting it throughout its
   * antics. A head only performs once it is badly injured.
   */
  private character(b: BodyPose, s: GameState) {
    const brush = this.brush;
    const head = b.part.toLowerCase().includes('head');
    const cue = anatomyIncident(s.wreck!.carnage!.cues, b.id, brush.time);
    const pose = cue && anatomyAntic(b, cue, brush.time, brush.reduced);
    if (head && (!pose || b.injury! < 2)) return;
    if (pose) this.antic(head, pose);
    else this.resting(b, head);
  }

  /** The organ sitting in its wound, with no contact cue running. */
  private resting(b: BodyPose, head: boolean) {
    const root = anatomyPoint(b, 0.13, 0.08);
    const size = Math.max(30, Math.min(54, b.w * 0.5));
    const y = Math.min(root.y, GROUND_Y - size * 0.5 - 2);
    this.sprout(head, root, root.x, y, size, b.angle, 1, 1);
  }

  /** The organ mid-gag, plus the prop the recorded antic calls for. */
  private antic(head: boolean, pose: Antic) {
    const y = Math.min(pose.y, GROUND_Y - pose.size * pose.scaleY * 0.5 - 2);
    this.sprout(
      head,
      pose.root,
      pose.x,
      y,
      pose.size,
      pose.angle,
      pose.scaleX,
      pose.scaleY,
    );
    if (this.brush.reduced) return;
    ANTICS[pose.kind](this.brush, pose, pose.x, y, pose.size);
  }

  /** Stem, organ sprite and its gentle-palette eyes, in that draw order. */
  private sprout(
    head: boolean,
    root: { x: number; y: number },
    x: number,
    y: number,
    size: number,
    angle: number,
    sx: number,
    sy: number,
  ) {
    const brush = this.brush;
    brush.ribbon(
      root.x,
      root.y,
      x,
      y + size * 0.22,
      brush.time,
      head ? 4 : 5,
      brush.red,
      12,
    );
    const actor = brush.art(
      head ? 'brain' : 'heart',
      x,
      y,
      head ? size : size * 0.68,
      size,
      angle,
    );
    if (actor) {
      actor.scale.x *= sx;
      actor.scale.y *= sy;
    }
    if (brush.gentle) brush.eyes(x + size * 0.06, y, size * 0.12, brush.time);
  }
}
