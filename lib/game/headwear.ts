import { Container, Sprite, type Texture } from 'pixi.js';
import type { Hat } from './simulation';

/** One head socket for the live rig, detached head and dressing-room portrait. */
export class Headwear {
  readonly view = new Container({ label: 'headwear' });
  private readonly hats: { hat: Hat; sprite: Sprite }[];

  constructor(textures: Record<string, Texture>) {
    this.hats = [
      {
        hat: 'party' as const,
        art: 'party-cone',
        x: 2,
        y: -51,
        w: 44,
        h: 58,
        angle: 0.17,
      },
      {
        hat: 'crown' as const,
        art: 'crown',
        x: 3,
        y: -47,
        w: 54,
        h: 43,
        angle: 0.1,
      },
      {
        hat: 'space' as const,
        art: 'astronaut-helmet',
        x: 0,
        y: -1,
        w: 91,
        h: 103,
        angle: 0,
      },
    ].map(({ hat, art, x, y, w, h, angle }) => {
      const sprite = new Sprite({
        texture: textures[art],
        anchor: 0.5,
        label: hat,
      });
      sprite.position.set(x, y);
      sprite.width = w;
      sprite.height = h;
      sprite.rotation = angle;
      sprite.visible = false;
      this.view.addChild(sprite);
      return { hat, sprite };
    });
  }

  fit(hat: Hat, head: Sprite, celebration = false) {
    // Sprite leaves cannot own children. The socket is a sibling with the same
    // head transform, including the independent nod and squash during launch.
    this.view.position.copyFrom(head.position);
    this.view.rotation = head.rotation;
    this.view.scale.set(head.width / 71, head.height / 87);
    this.view.alpha = head.alpha;
    this.view.visible = head.visible;
    for (const item of this.hats)
      item.sprite.visible =
        item.hat === hat || (item.hat === 'party' && celebration);
  }
}
