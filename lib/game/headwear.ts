import { Container, Sprite, type Texture } from 'pixi.js';
import type { Hat } from './simulation';

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

/** One head socket for the live rig, detached head and dressing-room portrait. */
export class Headwear {
  readonly view = new Container({ label: 'headwear' });
  private readonly hats: { hat: Hat; sprite: Sprite }[];

  constructor(textures: Record<string, Texture>) {
    this.hats = [
      {
        hat: 'party' as const,
        art: 'party-cone',
        anchor: [0.43, 0.81],
      },
      {
        hat: 'crown' as const,
        art: 'crown',
        anchor: [0.46, 0.845],
      },
      {
        hat: 'space' as const,
        art: 'astronaut-helmet',
        anchor: [0.5, 0.5],
      },
    ].map(({ hat, art, anchor }) => {
      const sprite = new Sprite({
        texture: textures[art],
        label: hat,
      });
      sprite.anchor.set(anchor[0], anchor[1]);
      sprite.visible = false;
      this.view.addChild(sprite);
      return { hat, sprite };
    });
  }

  fit(hat: Hat, head: Sprite, part: HeadArt = 'head', celebration = false) {
    // Sprite leaves cannot own children. The socket is a sibling with the same
    // head transform, including the independent nod and squash during launch.
    this.view.position.copyFrom(head.position);
    this.view.rotation = head.rotation;
    this.view.scale.set(1);
    this.view.alpha = head.alpha;
    this.view.visible = head.visible;
    const fit = FIT[part];
    for (const item of this.hats) {
      const p = item.sprite;
      p.visible = item.hat === hat || (item.hat === 'party' && celebration);
      if (!p.visible) continue;
      const dome = item.hat === 'space';
      const seat = dome ? fit.visor : fit.seat;
      p.position.set(
        (seat[0] - head.anchor.x) * head.width,
        (seat[1] - head.anchor.y) * head.height,
      );
      p.width =
        head.width *
        (dome ? fit.dome : item.hat === 'party' ? 44 / 71 : 47 / 71);
      p.rotation = dome ? 0 : fit.angle - (item.hat === 'party' ? 0.32 : 0.25);
      // The party synergy keeps its cap when another hat is equipped. Perch a
      // smaller cap on that hat, rather than burying it inside the crown/visor.
      if (
        item.hat === 'party' &&
        celebration &&
        !['helmet', 'party'].includes(hat)
      ) {
        p.width = head.width * 0.3;
        p.y -= head.height * (hat === 'crown' ? 0.35 : 0.22);
      }
      p.height = (p.width * p.texture.height) / p.texture.width;
    }
    // Celebration caps belong on top of the equipped hat's rim.
    const cap = this.hats[0].sprite;
    if (cap.visible)
      this.view.setChildIndex(cap, this.view.children.length - 1);
  }
}
