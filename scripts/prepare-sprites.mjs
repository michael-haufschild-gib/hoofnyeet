// Technical texture extraction: isolate connected alpha components, preserve AA,
// remove neighbouring atlas cells, and extrude transparent gutters for GPU sampling.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
const originals = resolve(
  process.env.HOOF_ASSET_DIR ?? '../hoof-and-yeet-assets',
  'art',
);
const pony = {
  torso: [0, 125, 407, 360],
  head: [410, 0, 415, 505],
  tail: [825, 0, 380, 505],
  bentLeg: [1240, 50, 275, 455],
  straightLeg: [80, 525, 225, 475],
  surprisedHead: [350, 507, 450, 496],
  sheep: [800, 520, 395, 460],
  goose: [1195, 500, 339, 489],
};
const dark = {
  skeleton: [0, 0, 393, 510],
  ghost: [395, 0, 348, 510],
  piano: [744, 0, 410, 510],
  baler: [1154, 0, 382, 510],
  cube: [0, 520, 385, 490],
  grave: [392, 520, 368, 490],
  teeth: [772, 520, 385, 490],
  eye: [1224, 532, 124, 118],
  bone: [1184, 622, 149, 82],
  helmet: [1310, 665, 224, 222],
  jam: [1150, 790, 240, 170],
};
const world = JSON.parse(
  await fs.readFile('public/art/world-props.json', 'utf8'),
);
const equipment = JSON.parse(
  await fs.readFile('public/art/equipment.json', 'utf8'),
);
const rig = JSON.parse(
  await fs.readFile(
    join(originals, 'crash-pony-rig-crop-manifest.json'),
    'utf8',
  ),
);
const rigCrops = Object.fromEntries(
  rig.sprites.map((s) => [s.id, Object.values(s.cropRect)]),
);
const materialCrops = JSON.parse(
  await fs.readFile(join(originals, 'materials-crops.json'), 'utf8'),
);
const manifest = {};
for (const [path, crops] of [
  ['public/art/pony-atlas.png', pony],
  ['public/art/dark-slapstick-atlas.png', dark],
  ['public/art/world-props-atlas.webp', world],
  ['public/art/equipment-atlas.webp', equipment],
  [join(originals, 'crash-pony-rig-atlas.png'), rigCrops],
  [join(originals, 'materials-atlas.png'), materialCrops],
]) {
  for (const [id, [left, top, width, height]] of Object.entries(crops)) {
    const { data } = await sharp(path)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const labels = new Int32Array(width * height),
      groups = [];
    let label = 0;
    for (let start = 0; start < labels.length; start++) {
      if (labels[start] || data[start * 4 + 3] < 40) continue;
      label++;
      let queue = [start],
        count = 0,
        x0 = width,
        y0 = height,
        x1 = 0,
        y1 = 0;
      labels[start] = label;
      for (let at = 0; at < queue.length; at++) {
        const p = queue[at],
          x = p % width,
          y = Math.floor(p / width);
        count++;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        for (const q of [
          x > 0 ? p - 1 : -1,
          x < width - 1 ? p + 1 : -1,
          y > 0 ? p - width : -1,
          y < height - 1 ? p + width : -1,
        ])
          if (q >= 0 && !labels[q] && data[q * 4 + 3] >= 40) {
            labels[q] = label;
            queue.push(q);
          }
      }
      groups.push({ label, count, x0, x1, y0, y1 });
    }
    groups.sort((a, b) => b.count - a.count);
    const largest = groups[0];
    const keep = new Set(
      groups
        .filter(
          (g, i) =>
            i === 0 ||
            (g.count > 80 &&
              g.x0 > 2 &&
              g.y0 > 2 &&
              g.x1 < width - 3 &&
              g.y1 < height - 3),
        )
        .map((g) => g.label),
    );
    const mask = new Uint8Array(width * height);
    for (let p = 0; p < mask.length; p++)
      if (keep.has(labels[p])) {
        const x = p % width,
          y = Math.floor(p / width);
        for (let dy = -2; dy <= 2; dy++)
          for (let dx = -2; dx <= 2; dx++) {
            const xx = x + dx,
              yy = y + dy;
            if (xx >= 0 && xx < width && yy >= 0 && yy < height)
              mask[yy * width + xx] = 1;
          }
      }
    for (let p = 0; p < mask.length; p++)
      if (!mask[p]) data.fill(0, p * 4, p * 4 + 4);
    const file = `/art/sprites/${id}.webp`;
    await sharp(data, { raw: { width, height, channels: 4 } })
      .trim({ background: '#00000000', threshold: 1 })
      .extend({ top: 3, bottom: 3, left: 3, right: 3, background: '#00000000' })
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile('public' + file);
    manifest[id] = file;
    console.log(id, groups.length, 'components; largest', largest?.count);
  }
}
await fs.writeFile(
  'public/art/sprites.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
// Keep contact geometry in lockstep with the production texture silhouettes.
await import('./measure-art.mjs');
