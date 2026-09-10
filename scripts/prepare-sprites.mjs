// Technical texture extraction: isolate connected alpha components, preserve AA,
// remove neighbouring atlas cells, and extrude transparent gutters for GPU sampling.
import sharp from 'sharp';
import fs from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { masterDirectory, optimizeImages } from './optimize-images.mjs';
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
  await fs.readFile('assets/source-art/world-props.json', 'utf8'),
);
const equipment = JSON.parse(
  await fs.readFile('assets/source-art/equipment.json', 'utf8'),
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
// Individually authored expressions and split wings are not atlas cells.
const manifest = JSON.parse(
  await fs.readFile('public/art/sprites.json', 'utf8'),
);
// A pixel below this alpha is atlas background, not artwork.
const ALPHA_FLOOR = 40;
// Satellite blobs smaller than this are anti-aliasing crumbs from a neighbouring cell.
const MIN_SATELLITE_PIXELS = 80;
// A blob touching within this many pixels of the crop edge belongs to the cell next door.
const EDGE_MARGIN = 2;
// Transparent skirt extruded around kept pixels so GPU sampling never reaches a cleared texel.
const GUTTER = 2;

/** True when a pixel is opaque enough to belong to the sprite. */
function isOpaque(data, pixel) {
  return data[pixel * 4 + 3] >= ALPHA_FLOOR;
}

/** The four orthogonally adjacent pixel indices, or -1 where the crop edge stops one. */
function neighbours(pixel, width, height) {
  const x = pixel % width,
    y = Math.floor(pixel / width);
  return [
    x > 0 ? pixel - 1 : -1,
    x < width - 1 ? pixel + 1 : -1,
    y > 0 ? pixel - width : -1,
    y < height - 1 ? pixel + width : -1,
  ];
}

/** Flood-fills one connected component from `start`, returning its size and bounds. */
function fillComponent(data, labels, width, height, start, label) {
  const queue = [start];
  let count = 0,
    x0 = width,
    y0 = height,
    x1 = 0,
    y1 = 0;
  labels[start] = label;
  for (let at = 0; at < queue.length; at++) {
    const pixel = queue[at],
      x = pixel % width,
      y = Math.floor(pixel / width);
    count++;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
    for (const q of neighbours(pixel, width, height)) {
      if (q < 0 || labels[q] || !isOpaque(data, q)) continue;
      labels[q] = label;
      queue.push(q);
    }
  }
  return { label, count, x0, x1, y0, y1 };
}

/** Labels every connected run of opaque pixels, returning the components largest first. */
function findComponents(data, width, height) {
  const labels = new Int32Array(width * height),
    groups = [];
  for (let start = 0; start < labels.length; start++) {
    if (labels[start] || !isOpaque(data, start)) continue;
    groups.push(
      fillComponent(data, labels, width, height, start, groups.length + 1),
    );
  }
  groups.sort((a, b) => b.count - a.count);
  return { labels, groups };
}

/** Keeps the largest component plus any well-inside blob big enough to be real artwork. */
function keptLabels(groups, width, height) {
  return new Set(
    groups
      .filter(
        (g, index) =>
          index === 0 ||
          (g.count > MIN_SATELLITE_PIXELS &&
            g.x0 > EDGE_MARGIN &&
            g.y0 > EDGE_MARGIN &&
            g.x1 < width - EDGE_MARGIN - 1 &&
            g.y1 < height - EDGE_MARGIN - 1),
      )
      .map((g) => g.label),
  );
}

/** Marks a pixel and its gutter neighbourhood in the keep mask. */
function markNeighbourhood(mask, width, height, pixel) {
  const x = pixel % width,
    y = Math.floor(pixel / width);
  for (let dy = -GUTTER; dy <= GUTTER; dy++) {
    for (let dx = -GUTTER; dx <= GUTTER; dx++) {
      const xx = x + dx,
        yy = y + dy;
      if (xx >= 0 && xx < width && yy >= 0 && yy < height) {
        mask[yy * width + xx] = 1;
      }
    }
  }
}

/** Builds the mask of pixels the finished sprite retains. */
function buildKeepMask(labels, keep, width, height) {
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (!keep.has(labels[pixel])) continue;
    markNeighbourhood(mask, width, height, pixel);
  }
  return mask;
}

/** Isolates one atlas cell's artwork and writes both the master and the runtime sprite. */
async function extractSprite(atlasPath, id, [left, top, width, height]) {
  const { data } = await sharp(atlasPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { labels, groups } = findComponents(data, width, height);
  const mask = buildKeepMask(
    labels,
    keptLabels(groups, width, height),
    width,
    height,
  );
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (!mask[pixel]) data.fill(0, pixel * 4, pixel * 4 + 4);
  }
  const file = `/art/sprites/${id}.webp`;
  const image = await sharp(data, { raw: { width, height, channels: 4 } })
    .trim({ background: '#00000000', threshold: 1 })
    .extend({ top: 3, bottom: 3, left: 3, right: 3, background: '#00000000' })
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  await fs.mkdir(join(masterDirectory, 'sprites'), { recursive: true });
  await fs.writeFile(join(masterDirectory, `sprites/${id}.webp`), image);
  await fs.writeFile('public' + file, image);
  console.log(id, groups.length, 'components; largest', groups[0]?.count);
  return file;
}

for (const [path, crops] of [
  ['assets/source-art/pony-atlas.png', pony],
  ['assets/source-art/dark-slapstick-atlas.png', dark],
  ['assets/source-art/world-props-atlas.webp', world],
  ['assets/source-art/equipment-atlas.webp', equipment],
  [join(originals, 'crash-pony-rig-atlas.png'), rigCrops],
  [join(originals, 'materials-atlas.png'), materialCrops],
]) {
  for (const [id, rect] of Object.entries(crops)) {
    manifest[id] = await extractSprite(path, id, rect);
  }
}
await fs.writeFile(
  'public/art/sprites.json',
  JSON.stringify(manifest, null, 2) + '\n',
);
// Keep contact geometry in lockstep with the production texture silhouettes.
await import('./measure-art.mjs');
await optimizeImages();
