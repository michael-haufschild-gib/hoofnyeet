import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { RINGS, type GameEvent, type GameState } from '../simulation';
import { propulsionPuff, PUFF_LIFE } from './perk-motion';
import { ponyPose } from '../pose';
import { LEG_HIPS } from '../geometry';
import { RocketExhaust } from './rocket-exhaust';

const ink = 0x31534b;
const mint = 0xcef49a;
const gold = 0xffda6b;

/** Equipment feedback has no ticker, timers or physics. All motion is sampled
 * from the same recorded simulation clock as the articulated pony. */
export class PerkEffects {
  readonly behind = new Container({ label: 'perk-trails' });
  readonly attached = new Container({ label: 'perk-equipment' });
  readonly front = new Container({ label: 'perk-feedback' });
  private wind = new Graphics({ label: 'tailwind-gusts' });
  private trails = new Graphics({ label: 'flight-perk-trails' });
  private wear = new Graphics({ label: 'passive-equipment' });
  private exhaust = new RocketExhaust();
  private weather = new Container({ label: 'pocket-weather' });
  private puffs: Sprite[] = [];
  private bursts: GameEvent[] = [];
  private seen = new Set<string>();
  private reactions: GameEvent[] = [];
  private label = new Text({
    text: '',
    style: {
      fontFamily: 'Lilita One',
      fontSize: 25,
      fill: '#f3ffc9',
      stroke: { color: '#365735', width: 5 },
    },
    anchor: 0.5,
  });

  constructor(cloud: Texture) {
    this.behind.addChild(this.wind, this.trails, this.exhaust.view);
    // Fixed pool: repeated taps, replays and long flights cannot grow the scene.
    for (let i = 0; i < 32; i++) {
      const puff = new Sprite({
        texture: cloud,
        anchor: 0.5,
        label: 'propulsion-puff',
        visible: false,
      });
      this.behind.addChild(puff);
      this.puffs.push(puff);
    }
    const face = new Graphics();
    face
      .moveTo(-38, 10)
      .bezierCurveTo(-55, -6, -35, -26, -20, -20)
      .bezierCurveTo(-20, -45, 13, -45, 20, -22)
      .bezierCurveTo(49, -31, 60, 0, 43, 12)
      .bezierCurveTo(23, 25, -16, 23, -38, 10)
      .closePath()
      .fill(0xf5fff0)
      .stroke({ color: ink, width: 3.5 });
    // An overworked little cloud: puffed cheeks, narrowed eyes, pursed lips.
    face
      .ellipse(23, -1, 10, 9)
      .fill(0xc8e7d8)
      .moveTo(0, -14)
      .lineTo(10, -11)
      .moveTo(22, -14)
      .lineTo(30, -11)
      .stroke({ color: ink, width: 3 })
      .ellipse(34, 1, 4, 6)
      .fill(ink)
      .moveTo(-18, -27)
      .quadraticCurveTo(-10, -38, 0, -28)
      .stroke({ color: 0xffffff, width: 4 });
    this.weather.addChild(face);
    this.behind.addChild(this.weather);
    this.attached.addChild(this.wear);
    this.front.addChild(this.label);
    this.label.visible = false;
  }

  event(event: GameEvent) {
    if (!event.propulsion && !['ring', 'flip'].includes(event.kind)) return;
    const id =
      event.id ??
      `${event.kind}:${event.sceneTime ?? event.time}:${event.x}:${event.y}`;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > 64) this.seen.delete(this.seen.values().next().value!);
    if (event.propulsion) this.bursts = [...this.bursts.slice(-3), event];
    else this.reactions = [...this.reactions.slice(-3), event];
  }

  update(
    s: GameState,
    time: number,
    pony: Container,
    zoom: number,
    reduced: boolean,
    density: number,
    jetpack: Sprite,
  ) {
    const has = (id: string) => s.equipment.includes(id);
    const air = s.phase === 'flight';
    const visible = !['title', 'results'].includes(s.phase);
    const moving = air || s.phase === 'approach';
    // Keep an effect readable when the camera widens; never grow it over the HUD.
    const readable = Math.min(1.55, Math.max(1, 0.72 / zoom));
    const x = pony.x,
      y = pony.y;
    this.attached.visible = pony.visible && visible;
    this.attached.position.copyFrom(pony.position);
    this.attached.rotation = pony.rotation;
    this.attached.scale.copyFrom(pony.scale);
    this.wear.clear();
    this.wind.clear();
    this.trails.clear();
    this.weather.visible = air && has('tailwind');
    this.label.visible = false;
    this.drawWear(s, reduced ? 0 : time);

    if (this.weather.visible) {
      const storm = has('beans');
      this.weather.position.set(
        x - 137 * readable,
        y - 12 + (reduced ? 0 : Math.sin(time * 5) * 9),
      );
      this.weather.scale.set(readable * (storm ? 1.03 : 0.82));
      this.weather.rotation = reduced ? 0 : Math.sin(time * 3) * 0.055;
      const g = this.wind;
      const count = reduced ? 2 : Math.max(3, Math.ceil(6 * density));
      for (let i = 0; i < count; i++) {
        const p = reduced ? 0.42 : (time * 1.4 + i / count) % 1;
        const start = x + (-108 + p * 133) * readable;
        const row = y + (i % 2 ? 1 : -1) * (32 + i * 7) * readable;
        const alpha = reduced ? 0.55 : Math.sin(p * Math.PI) * 0.85;
        g.moveTo(start - 55 * readable, row)
          .bezierCurveTo(
            start - 15,
            row - 11,
            start + 25,
            row + 12,
            start + 50 * readable,
            row,
          )
          .stroke({ color: ink, width: 5 * readable, alpha: alpha * 0.25 })
          .moveTo(start - 55 * readable, row)
          .bezierCurveTo(
            start - 15,
            row - 11,
            start + 25,
            row + 12,
            start + 50 * readable,
            row,
          )
          .stroke({
            color: storm ? mint : 0xf3fff1,
            width: 2.5 * readable,
            alpha,
          });
        if (!reduced)
          g.ellipse(start + 30, row + 9, 5, 2).fill({ color: 0xb9dc6e, alpha });
      }
    }

    this.exhaust.update(
      pony,
      jetpack,
      time,
      air && has('rocket'),
      reduced,
      density,
    );
    this.flightAccents(s, time, x, y, readable, reduced);
    this.drawPuffs(time, readable, reduced, density);

    // A visible magnetic field connects the wreck to the metal it is pulling.
    if (s.phase === 'landing' && s.wreck && has('magnet')) {
      const w = s.wreck;
      const metal = w.bodies
        .filter(
          (b) =>
            ['cabinet', 'piano', 'helmet', 'drum', 'tnt'].includes(b.part) &&
            Math.hypot(b.x - w.focusX, b.y - w.focusY) < 630,
        )
        .slice(0, reduced ? 1 : 3);
      for (const b of metal)
        this.trails
          .moveTo(w.focusX, w.focusY)
          .quadraticCurveTo(
            (w.focusX + b.x) / 2,
            Math.min(w.focusY, b.y) - 70,
            b.x,
            b.y,
          )
          .stroke({
            color: 0xa4ffdc,
            width: 2.5,
            alpha: reduced ? 0.45 : 0.45 + Math.sin(time * 12) * 0.2,
          });
    }
    if (!moving && s.phase !== 'landing') this.trails.clear();
  }

  private drawPuffs(
    time: number,
    readable: number,
    reduced: boolean,
    density: number,
  ) {
    for (const p of this.puffs) p.visible = false;
    this.bursts = this.bursts.filter(
      (e) => time - (e.sceneTime ?? e.time ?? 0) < PUFF_LIFE + 0.4,
    );
    let cursor = 0;
    for (const event of this.bursts) {
      const count = reduced
        ? 1
        : Math.ceil((event.propulsion!.power > 1 ? 8 : 6) * density);
      for (let i = 0; i < count; i++) {
        const at = propulsionPuff(event, i, time);
        if (!at || cursor >= this.puffs.length) continue;
        const p = this.puffs[cursor++];
        p.visible = true;
        p.position.set(at.x, at.y);
        p.width = at.size * readable * (reduced ? 0.75 : 1);
        p.height = (p.width * p.texture.height) / p.texture.width;
        p.rotation = reduced ? 0 : at.angle;
        p.alpha = at.alpha;
      }
      const age = time - (event.sceneTime ?? event.time ?? 0);
      if (!reduced && age >= 0.08 && age < 0.85) {
        const at = propulsionPuff(event, 0, time)!;
        this.label.visible = true;
        this.label.text = event.propulsion!.power > 1 ? 'BRRRAAAP!' : 'PFFT!';
        this.label.position.set(at.x - 20, at.y - 42 * readable);
        this.label.rotation = -0.12;
        this.label.scale.set(readable * (0.85 + Math.min(age * 4, 0.25)));
        this.label.alpha = Math.min(1, (0.85 - age) * 5);
      }
    }
  }

  private flightAccents(
    s: GameState,
    time: number,
    x: number,
    y: number,
    scale: number,
    reduced: boolean,
  ) {
    if (s.phase !== 'flight') return;
    const g = this.trails;
    if (s.equipment.includes('feather')) {
      for (let i = 0; i < (reduced ? 1 : 4); i++) {
        const p = reduced ? 0.5 : (time * 0.48 + i / 4) % 1;
        const xx = x - (50 + p * 140) * scale;
        const yy = y + (Math.sin(p * 6 + i) * 36 + p * 45) * scale;
        g.moveTo(xx - 13, yy + 9)
          .quadraticCurveTo(xx - 22, yy - 17, xx + 15, yy - 18)
          .quadraticCurveTo(xx + 19, yy + 2, xx - 13, yy + 9)
          .fill({ color: 0xfffbea, alpha: 1 - p * 0.6 })
          .stroke({ color: ink, width: 1.5, alpha: 0.7 })
          .moveTo(xx - 18, yy + 14)
          .lineTo(xx + 10, yy - 14)
          .stroke({ color: 0xb39c68, width: 1.5 });
      }
    }
    if (s.equipment.includes('acrobat') && s.flipActive) {
      const turn = s.flipProgress * Math.PI * 2;
      for (let i = 0; i < (reduced ? 1 : 3); i++) {
        const r = (81 + i * 7) * scale;
        g.arc(x, y, r, turn - Math.PI * 0.95, turn).stroke({
          color: [0xffba7c, 0xffe980, 0xa9f2d7][i],
          width: 5 - i,
          alpha: 0.85,
        });
      }
      g.star(
        x + Math.cos(turn) * 84 * scale,
        y + Math.sin(turn) * 84 * scale,
        4,
        12,
        4,
      ).fill(gold);
    }
    if (s.equipment.includes('honey')) {
      for (const ring of RINGS.filter((_, i) => !s.rings.includes(i))) {
        if (Math.hypot(s.x - ring.x, s.y - ring.y) > 220) continue;
        g.moveTo(x + 20, y + 10)
          .quadraticCurveTo((x + ring.x) / 2, y - 70, ring.x, ring.y)
          .stroke({ color: gold, width: 4, alpha: 0.75 });
      }
    }
    this.reactions = this.reactions.filter(
      (e) => time - (e.sceneTime ?? e.time ?? 0) < 0.8,
    );
    for (const e of this.reactions) {
      const age = time - (e.sceneTime ?? e.time ?? 0);
      if (
        age < 0 ||
        reduced ||
        !(e.kind === 'ring'
          ? s.equipment.includes('honey')
          : s.equipment.includes('acrobat'))
      )
        continue;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.star(
          x + Math.cos(a) * (70 + age * 80),
          y + Math.sin(a) * (70 + age * 80),
          4,
          8,
          3,
        ).fill({ color: gold, alpha: 1 - age / 0.8 });
      }
    }
  }

  private drawWear(s: GameState, time: number) {
    const has = (id: string) => s.equipment.includes(id);
    const g = this.wear;
    if (has('beans')) {
      // A tin strapped to the rump; the gas is emitted separately into the world.
      g.roundRect(-49, -19, 23, 29, 4)
        .fill(0xd88654)
        .stroke({ color: ink, width: 2 })
        .rect(-47, -12, 19, 16)
        .fill(0xffe0a0)
        .ellipse(-37.5, -18, 11, 3)
        .fill(0xe7e0b8)
        .stroke({ color: ink, width: 1.5 })
        .ellipse(-37, -4, 4, 6)
        .fill(0x9d5635)
        .moveTo(-37, -8)
        .quadraticCurveTo(-32, -3, -38, 1)
        .stroke({ color: 0xf2aa66, width: 2 });
    }
    if (has('tailwind')) {
      const flutter = Math.sin(time * 10) * 3;
      g.moveTo(-13, -25)
        .lineTo(-13, -65)
        .stroke({ color: ink, width: 3 })
        .poly([-12, -66, -40, -61 + flutter, -40, -54 + flutter, -12, -49])
        .fill(0xff8463)
        .stroke({ color: ink, width: 2 })
        .poly([-23, -64, -30, -63, -30, -54, -23, -52])
        .fill(0xfff5cb);
    }
    if (has('heavy'))
      g.roundRect(-17, 14, 38, 20, 5)
        .fill(0x668290)
        .stroke({ color: ink, width: 2 })
        .circle(-10, 21, 2)
        .circle(14, 21, 2)
        .fill(0xe2ece0);
    if (has('rubber'))
      for (let i = 0; i < 3; i++)
        g.ellipse(-5, 17 + i * 5, 33, 8).stroke({
          color: 0x68cba9,
          width: 2.5,
        });
    if (has('spikes')) {
      const pose = ponyPose(s, time);
      for (const i of [1, 3]) {
        const x = LEG_HIPS[i].x - Math.sin(pose.legs[i]) * 50;
        const y = LEG_HIPS[i].y + Math.cos(pose.legs[i]) * 50;
        g.poly([x - 13, y, x - 5, y - 7, x, y + 2, x + 7, y - 7, x + 14, y])
          .fill(0xe0e9e4)
          .stroke({ color: ink, width: 2 });
      }
    }
    if (has('honey'))
      g.roundRect(-8, 6, 21, 23, 6)
        .fill(0xe5a541)
        .stroke({ color: ink, width: 2 })
        .ellipse(2, 8, 11, 4)
        .fill(gold)
        .moveTo(6, 9)
        .lineTo(6, 19)
        .stroke({ color: 0xffe895, width: 4, cap: 'round' });
    if (has('ghostly'))
      g.ellipse(8, -67, 24, 6).stroke({ color: 0xa4ffe5, width: 3 });
    if (has('pinball'))
      g.star(0, -4, 5, 18, 9).fill(gold).stroke({ color: ink, width: 2 });
    if (has('confetti'))
      for (let i = 0; i < 6; i++)
        g.rect(-25 + i * 8, -24 + (i % 2) * 9, 4, 6).fill(
          [0xff8395, gold, 0x85e9c7][i % 3],
        );
    if (has('aftershock'))
      g.circle(5, -10, 14)
        .fill(0xffedbf)
        .stroke({ color: ink, width: 2 })
        .moveTo(5, -10)
        .lineTo(5 + Math.cos(time * 5) * 9, -10 + Math.sin(time * 5) * 9)
        .stroke({ color: 0xc45a40, width: 2 });
    if (has('loose'))
      for (const x of [-35, 32])
        g.circle(x, 10, 5)
          .stroke({ color: 0x674530, width: 2 })
          .moveTo(x - 3, 7)
          .lineTo(x + 3, 13)
          .stroke({ color: 0xffdf88, width: 2 });
  }

  reset() {
    this.bursts = [];
    this.reactions = [];
    this.seen.clear();
    for (const p of this.puffs) p.visible = false;
    this.label.visible = this.weather.visible = false;
    this.wind.clear();
    this.trails.clear();
    this.exhaust.reset();
    this.wear.clear();
  }

  dispose() {
    this.exhaust.dispose();
  }
}
