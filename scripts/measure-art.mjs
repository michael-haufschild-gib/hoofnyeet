// Measure the opaque silhouette, including its contact points, once at build time.
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { masterDirectory } from './optimize-images.mjs';
import { join } from 'node:path';
const manifest = JSON.parse(
  await fs.readFile('public/art/sprites.json', 'utf8'),
);
const metrics = {};
const cross = (o, a, b) =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
for (const [id, path] of Object.entries(manifest)) {
  // Physics uses the authored silhouette, independent of texture compression.
  const master = join(masterDirectory, path.replace('/art/', ''));
  const source = await fs.access(master).then(
    () => master,
    () => 'public' + path,
  );
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const points = [];
  for (let y = 0; y < info.height; y++) {
    const row = [];
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 120) row.push(x);
    if (row.length) points.push([row[0], y], [row.at(-1), y]);
  }
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (pts) => {
    const out = [];
    for (const p of pts) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0)
        out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  metrics[id] = {
    width: info.width,
    height: info.height,
    hull: [...half(points), ...half([...points].reverse())].map(([x, y]) => [
      +(x / info.width).toFixed(5),
      +(y / info.height).toFixed(5),
    ]),
  };
}
await fs.writeFile('lib/game/art-metrics.json', JSON.stringify(metrics) + '\n');
console.log(`Measured ${Object.keys(metrics).length} sprite silhouettes.`);
