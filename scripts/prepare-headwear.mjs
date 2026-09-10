// Individual alpha artwork, never sprite-sheet cells. Originals remain immutable.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const assetRoot =
  process.env.HOOF_ASSET_DIR || path.resolve(root, '../hoof-and-yeet-assets');
const input = JSON.parse(
  await fs.readFile(path.join(root, 'assets/source-art/costumes.json'), 'utf8'),
);
const assets = [];
for (const asset of input.assets) {
  const originalPath = path.join(
    assetRoot,
    'art/costumes/originals',
    `${asset.id}.png`,
  );
  const masterPath = `assets/source-art/masters/costumes/${asset.id}.webp`;
  const output = `/art/costumes/${asset.id}.webp`;
  for (const file of [
    originalPath,
    path.join(root, masterPath),
    path.join(root, 'public', output),
  ])
    await fs.mkdir(path.dirname(file), { recursive: true });
  await fs
    .access(originalPath)
    .catch(() => fs.copyFile(asset.source, originalPath));
  const metadata = await sharp(originalPath).metadata();
  if (!metadata.hasAlpha) throw new Error(`${asset.id} has no transparency`);
  const master = await sharp(originalPath)
    .trim({ threshold: 10 })
    .resize({
      width: 496,
      height: 496,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .extend({
      top: 8,
      bottom: 8,
      left: 8,
      right: 8,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ lossless: true })
    .toBuffer();
  await fs.writeFile(path.join(root, masterPath), master);
  const runtime = await sharp(master)
    .resize({ width: 384, height: 384, fit: 'inside' })
    .webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  await fs.writeFile(path.join(root, 'public', output), runtime);
  const { data, info } = await sharp(runtime)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0,
    opaque = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] === 0) transparent++;
    if (data[i] > 120) opaque++;
  }
  if (
    transparent < info.width * info.height * 0.06 ||
    opaque < info.width * info.height * 0.2
  )
    throw new Error(`${asset.id} invalid silhouette`);
  assets.push({
    ...asset,
    originalPath,
    masterPath,
    path: output,
    width: info.width,
    height: info.height,
    bytes: runtime.length,
    alpha: true,
    opaqueRatio: opaque / (info.width * info.height),
    verified: true,
  });
}
await fs.writeFile(
  path.join(root, 'public/art/costumes/manifest.json'),
  JSON.stringify({ ...input, assets }, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    assets.map(({ id, width, height, bytes, alpha }) => ({
      id,
      width,
      height,
      bytes,
      alpha,
    })),
    null,
    2,
  ),
);
