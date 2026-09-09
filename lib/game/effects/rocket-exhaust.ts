import { Container, Graphics, type Sprite } from 'pixi.js';
import { ROCKET_ART } from '../rocket-rig';
import { flameGeometry, flameMesh } from './flame-mesh';

/** One fixed pair of plumes, owned by PerkEffects. The parent transforms mirror
 * the actual pony and pack; nozzle positions are in the same trimmed texels. */
export class RocketExhaust {
  readonly view = new Container({ label: 'jetpack-exhaust', visible: false });
  readonly mount = new Container({ label: 'exhaust-art-space' });
  private cones = new Graphics({ label: 'rocket-flame-cones' });
  private geometry = flameGeometry();
  readonly flames = [
    flameMesh(this.geometry, 1.7),
    flameMesh(this.geometry, 6.3),
  ];
  private disposed = false;

  constructor() {
    this.view.addChild(this.mount);
    this.mount.addChild(this.cones, ...this.flames);
  }

  update(
    pony: Container,
    pack: Sprite,
    time: number,
    active: boolean,
    reduced: boolean,
    density: number,
  ) {
    this.view.visible = active && pony.visible && pack.visible;
    if (!this.view.visible) return;
    this.view.position.copyFrom(pony.position);
    this.view.rotation = pony.rotation;
    this.view.scale.copyFrom(pony.scale);
    this.mount.position.copyFrom(pack.position);
    this.mount.rotation = pack.rotation;
    this.mount.scale.copyFrom(pack.scale);
    const g = this.cones.clear();
    for (let i = 0; i < this.flames.length; i++) {
      const nozzle = ROCKET_ART.nozzles[i];
      const x = (nozzle.x - pack.anchor.x) * pack.texture.width;
      const y = (nozzle.y - pack.anchor.y) * pack.texture.height;
      const flicker = reduced ? 1 : 1 + Math.sin(time * 29 + i * 2.8) * 0.12;
      const length = (i ? 400 : 440) * flicker;
      const diameter = i ? 136 : 148;
      const c = Math.cos(ROCKET_ART.axis),
        s = Math.sin(ROCKET_ART.axis);
      // Preserve the old warm cone/core feedback, now once per nozzle.
      g.save()
        .setTransform(c, s, -s, c, x, y)
        .moveTo(0, -23)
        .quadraticCurveTo(length * 0.38, -45, length * 0.83, 0)
        .quadraticCurveTo(length * 0.4, 47, 0, 23)
        .closePath()
        .fill(0xf17c43)
        .stroke({ color: 0x793a37, width: 6 })
        .moveTo(0, -15)
        .quadraticCurveTo(length * 0.28, -26, length * 0.61, 0)
        .quadraticCurveTo(length * 0.26, 29, 0, 15)
        .closePath()
        .fill(0xffe987)
        .ellipse(15, 0, 29, 15)
        .fill(0xffffd9)
        .restore();
      const flame = this.flames[i];
      flame.visible = !reduced && density >= 0.55;
      flame.position.set(x, y);
      flame.rotation = ROCKET_ART.axis;
      flame.scale.set(length, diameter);
      flame.shader!.resources.flame.uniforms.uTime = time;
    }
  }

  reset() {
    this.view.visible = false;
    this.cones.clear();
    for (const flame of this.flames) {
      flame.visible = false;
      flame.shader!.resources.flame.uniforms.uTime = 0;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const flame of this.flames) {
      flame.shader!.destroy();
      flame.destroy();
    }
    this.geometry.destroy();
  }
}
