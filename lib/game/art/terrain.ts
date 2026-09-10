import { Graphics } from 'pixi.js';
import { random, worldById, type WorldId } from '../content';

/** Stable world cells. Recycling a sprite never changes the animal at that location. */
export function spectatorCells(left: number, right: number) {
  const stride = Math.max(1, Math.ceil((right - left) / (145 * 94)));
  const first = Math.floor(left / (145 * stride));
  const last = Math.ceil(right / (145 * stride));
  return Array.from(
    { length: Math.max(0, Math.min(96, last - first + 1)) },
    (_, i) => (first + i) * stride,
  );
}

/** Running-surface colour per world, painted over the world's ground fill. */
const TRACK_COLORS: Record<WorldId, number> = {
  farm: 0xd4b66b,
  candy: 0xe7a4b6,
  carnival: 0x81728c,
  office: 0x718c87,
  moon: 0xd5b755,
  afterlife: 0x659ba5,
};

/** Ground, track and the speckle every world shares, drawn before its scenery. */
function paintGround(g: Graphics, id: WorldId, rng: () => number) {
  g.rect(0, 0, 1024, 360).fill(worldById(id).ground);
  g.rect(0, 0, 1024, 48).fill(TRACK_COLORS[id]);
  g.rect(0, 0, 1024, 2).fill({ color: 0x233c39, alpha: 0.2 });
  g.rect(0, 48, 1024, 5).fill({ color: 0x233c39, alpha: 0.26 });
  for (let i = 0; i < 165; i++) {
    const x = 8 + rng() * 1008,
      y = 18 + rng() * 335;
    g.ellipse(x, y, 1 + rng() * 6, 1 + rng() * 2).fill({
      color: i % 3 ? 0x263d36 : 0xffedb0,
      alpha: 0.14,
    });
  }
}

/** Tufts of grass, every fourth one carrying a flower head. */
function paintFarm(g: Graphics, rng: () => number) {
  for (let i = 0; i < 80; i++) {
    const x = 8 + rng() * 1008,
      y = 69 + rng() * 270;
    g.moveTo(x - 3, y)
      .quadraticCurveTo(x - 6, y - 10, x - 2, y - 14)
      .moveTo(x, y)
      .quadraticCurveTo(x + 3, y - 9, x + 6, y - 12)
      .stroke({ color: 0x355b2d, width: 2, alpha: 0.45 });
    if (i % 4 === 0) {
      for (let k = 0; k < 5; k++)
        g.circle(
          x + Math.cos(k * 1.256) * 3,
          y - 13 + Math.sin(k * 1.256) * 3,
          2.6,
        ).fill([0xffe371, 0xffada0, 0xfff7dd][i % 3]);
      g.circle(x, y - 13, 1.8).fill(0xdb8d41);
    }
  }
}

/** A scalloped icing rim above the track and scattered sprinkles below it. */
function paintCandy(g: Graphics, rng: () => number) {
  for (let x = 0; x < 1024; x += 32) g.circle(x + 16, 5, 17).fill(0xfce8d0);
  for (let i = 0; i < 150; i++) {
    const x = 8 + rng() * 1008,
      y = 70 + rng() * 260;
    g.moveTo(x, y)
      .lineTo(x + 5 + rng() * 6, y - 4)
      .stroke({
        color: [0xffc265, 0xffe6ee, 0xadecc5, 0xf277a4][i % 4],
        width: 3,
      });
  }
}

/** Boardwalk planking with bulb lights, over litter dropped on the fairground. */
function paintCarnival(g: Graphics, rng: () => number) {
  for (let x = 0; x < 1024; x += 64) {
    g.rect(x, 17, 32, 10).fill(0xd8ab72);
    g.circle(x + 16, 5, 4).fill(0xffe999);
    g.moveTo(x, 65)
      .lineTo(x, 360)
      .stroke({ color: 0x302c42, width: 2, alpha: 0.25 });
  }
  g.moveTo(1024, 65)
    .lineTo(1024, 360)
    .stroke({ color: 0x302c42, width: 2, alpha: 0.25 });
  for (let i = 0; i < 45; i++) {
    const x = 10 + rng() * 1004,
      y = 70 + rng() * 260;
    g.poly([x, y, x + 8, y - 2, x + 10, y + 7, x + 2, y + 9]).fill({
      color: [0xed9484, 0xe4c377, 0x909dcc][i % 3],
      alpha: 0.55,
    });
  }
}

/** Carpet tile grid with discarded memos ruled like printed paper. */
function paintOffice(g: Graphics, rng: () => number) {
  for (let x = 0; x <= 1024; x += 128) {
    g.moveTo(x, 63)
      .lineTo(x, 360)
      .stroke({ color: 0x233d3d, width: 2, alpha: 0.3 });
  }
  for (let y = 94; y < 360; y += 64)
    g.moveTo(0, y)
      .lineTo(1024, y)
      .stroke({ color: 0x233d3d, width: 1, alpha: 0.2 });
  for (let i = 0; i < 20; i++) {
    const x = 8 + rng() * 950,
      y = 74 + rng() * 270;
    g.rect(x, y, 20, 26).fill(0xdad9b7);
    for (let k = 0; k < 3; k++)
      g.moveTo(x + 4, y + 7 + k * 4)
        .lineTo(x + 15, y + 7 + k * 4)
        .stroke({ color: 0x6c857d, width: 1 });
  }
}

/** Lit crater rims. Each is drawn at both tile seams so the wrap has no join. */
function paintMoon(g: Graphics, rng: () => number) {
  for (let i = 0; i < 32; i++) {
    const x = 22 + rng() * 980,
      y = 75 + rng() * 260,
      r = 8 + rng() * 20;
    for (const offset of [-1024, 0, 1024]) {
      if (x + offset + r + 2 < 0 || x + offset - r - 2 > 1024) continue;
      g.ellipse(x + offset, y, r, r * 0.46)
        .fill(0x978344)
        .ellipse(x + offset, y - 2, r, r * 0.42)
        .stroke({ color: 0xead786, width: 3 });
    }
  }
}

/** A cold grid with mist pools, likewise repeated across the tile seams. */
function paintAfterlife(g: Graphics, rng: () => number) {
  for (let x = 0; x <= 1024; x += 64)
    g.moveTo(x, 64)
      .lineTo(x, 360)
      .stroke({ color: 0xa7c6b4, width: 1, alpha: 0.22 });
  for (let y = 64; y < 360; y += 48)
    g.moveTo(0, y)
      .lineTo(1024, y)
      .stroke({ color: 0xa7c6b4, width: 1, alpha: 0.22 });
  for (let i = 0; i < 28; i++) {
    const x = 12 + rng() * 1000,
      y = 70 + rng() * 250,
      rx = 18 + rng() * 22,
      ry = 4 + rng() * 6;
    for (const offset of [-1024, 0, 1024]) {
      if (x + offset + rx < 0 || x + offset - rx > 1024) continue;
      g.ellipse(x + offset, y, rx, ry).fill({
        color: 0xa6e0d9,
        alpha: 0.23,
      });
    }
  }
}

/** The scenery pass that follows the shared ground pass, one entry per world. */
const WORLD_SCENERY: Record<WorldId, (g: Graphics, rng: () => number) => void> =
  {
    farm: paintFarm,
    candy: paintCandy,
    carnival: paintCarnival,
    office: paintOffice,
    moon: paintMoon,
    afterlife: paintAfterlife,
  };

/**
 * A 1024x360 tile of the world's ground, drawn once and repeated across the
 * track. The seed is fixed, so the same world always yields the same tile and
 * the scenery never shimmers between runs.
 */
export function terrainGraphic(id: WorldId) {
  const g = new Graphics(),
    rng = random(7847);
  paintGround(g, id, rng);
  WORLD_SCENERY[id](g, rng);
  return g;
}
