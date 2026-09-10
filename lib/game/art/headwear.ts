import { Container, Sprite, Texture } from 'pixi.js';
import type { Hat } from '../simulation';
import { HATS, type HatDefinition } from '../catalogue/cosmetics';
import { CostumeSheen } from '../effects/shaders/costume-sheen';

/** Names the trimmed head art a socket is dressing, and so which anchors apply. */
export type HeadArt = 'head' | 'surprisedHead' | 'offended-head';

// Authored in each trimmed head's UV space. The seat follows the helmet crown,
// not the ear tips; the visor center follows the face instead of the mane.
const FIT = {
  head: {
    seat: [0.64, 0.19],
    angle: -0.32,
    visor: [0.711, 0.592],
    dome: 1.465,
  },
  surprisedHead: {
    seat: [0.65, 0.17],
    angle: -0.4,
    visor: [0.711, 0.592],
    dome: 1.465,
  },
  'offended-head': {
    seat: [0.55, 0.2],
    angle: -0.48,
    visor: [0.669, 0.543],
    dome: 1.324,
  },
} as const;

/**
 * Anchors in one head art's UV space: `seat` is where a perched hat rests,
 * `visor` where a full-face helmet centres, `angle` the crown tilt in radians,
 * and `dome` the helmet width as a multiple of the head width.
 */
interface HeadFit {
  seat: readonly [number, number];
  angle: number;
  visor: readonly [number, number];
  dome: number;
}

/** One preloaded sprite paired with the definition that positions it. */
interface HatSlot {
  hat: Hat;
  sprite: Sprite;
  definition: HatDefinition;
}

/** What the rig wears this frame, plus the clock its animated extras run on. */
interface Dress {
  hat: Hat;
  celebration: boolean;
  time: number;
  reduced: boolean;
}

/** Anchors one hat on the head, in the head sprite's own local space. */
function seatHat(
  p: Sprite,
  head: Sprite,
  fit: HeadFit,
  mount: NonNullable<HatDefinition['mount']>,
) {
  const dome = !!mount.dome;
  const seat = dome ? fit.visor : fit.seat;
  p.position.set(
    (seat[0] - head.anchor.x) * head.width,
    (seat[1] - head.anchor.y) * head.height,
  );
  p.width = head.width * (dome ? fit.dome : mount.width);
  p.rotation = dome ? 0 : fit.angle + mount.angle;
}

// The party synergy keeps its cap when another hat is equipped. Perch a
// smaller cap on that hat, rather than burying it inside the crown/visor.
/** Shrinks the celebration cap and lifts it clear of the equipped hat. */
function perchPartyCap(p: Sprite, head: Sprite, hat: Hat) {
  p.width = head.width * 0.3;
  p.y -= head.height * (hat === 'crown' ? 0.35 : 0.22);
}

/** Slow breathing wobble for the animated extras. Presentation only. */
function breatheExtra(p: Sprite, hat: Hat, time: number) {
  const stretch = Math.sin(time * (hat === 'sausage' ? 7 : 3)) * 0.014;
  p.scale.x *= 1 + stretch;
  p.scale.y *= 1 - stretch;
}

/** Lays out one hat sprite for this frame, hiding it when it is not worn. */
function placeHat(
  item: HatSlot,
  texture: Texture | undefined,
  head: Sprite,
  fit: HeadFit,
  dress: Dress,
) {
  const p = item.sprite;
  if (!texture) {
    p.visible = false;
    return;
  }
  p.visible =
    item.hat === dress.hat || (item.hat === 'party' && dress.celebration);
  if (!p.visible) return;
  p.texture = texture;
  seatHat(p, head, fit, item.definition.mount!);
  if (
    item.hat === 'party' &&
    dress.celebration &&
    !['helmet', 'party'].includes(dress.hat)
  ) {
    perchPartyCap(p, head, dress.hat);
  }
  p.height = (p.width * p.texture.height) / p.texture.width;
  if (item.definition.extra && !dress.reduced) {
    breatheExtra(p, dress.hat, dress.time);
  }
}

/** Rests the celebration cap on the rim of the hat worn beneath it. */
function restCapOn(cap: Sprite, p: Sprite) {
  const x = (0.5 - p.anchor.x) * p.width;
  const y = (0.08 - p.anchor.y) * p.height;
  cap.position.set(
    p.x + Math.cos(p.rotation) * x - Math.sin(p.rotation) * y,
    p.y + Math.sin(p.rotation) * x + Math.cos(p.rotation) * y,
  );
  cap.rotation = p.rotation - 0.12;
}

/** One head socket for the live rig, detached head and dressing-room portrait. */
export class Headwear {
  readonly view = new Container({ label: 'headwear' });
  private readonly hats: HatSlot[];
  private readonly sheen = new CostumeSheen();

  constructor(private textures: Record<string, Texture>) {
    this.hats = HATS.filter((hat) => hat.mount).map((definition) => {
      const { id: hat, art, mount } = definition;
      const sprite = new Sprite({
        texture: textures[art] ?? Texture.EMPTY,
        label: hat,
      });
      sprite.anchor.set(mount!.anchor[0], mount!.anchor[1]);
      sprite.visible = false;
      if (definition.extra) sprite.filters = [this.sheen.filter];
      this.view.addChild(sprite);
      return { hat, sprite, definition };
    });
  }

  fit(
    hat: Hat,
    head: Sprite,
    part: HeadArt = 'head',
    celebration = false,
    time = 0,
    reduced = false,
    gentle = false,
  ) {
    // Sprite leaves cannot own children. The socket is a sibling with the same
    // head transform, including the independent nod and squash during launch.
    this.view.position.copyFrom(head.position);
    this.view.rotation = head.rotation;
    this.view.scale.set(1);
    this.view.alpha = head.alpha;
    this.view.visible = head.visible;
    const fit = FIT[part];
    const dress: Dress = { hat, celebration, time, reduced };
    this.sheen.update(hat, time, reduced, gentle);
    for (const item of this.hats) {
      placeHat(item, this.textures[item.definition.art], head, fit, dress);
    }
    // Celebration caps belong on top of the equipped hat's rim.
    const cap = this.hats[0].sprite;
    const under = this.hats.find(
      (item) => item.hat === hat && item.definition.extra,
    );
    if (cap.visible && celebration && under?.sprite.visible) {
      restCapOn(cap, under.sprite);
    }
    if (cap.visible)
      this.view.setChildIndex(cap, this.view.children.length - 1);
  }
  dispose() {
    this.sheen.dispose();
  }
}
