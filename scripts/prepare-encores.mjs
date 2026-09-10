// Preserve individually authored alpha originals and reproducible derivatives.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetRoot = path.resolve(root, '../hoof-and-yeet-assets/art/encores');
const stageOnly = process.argv.includes('--stage-only');
const catalog = JSON.parse(
  await fs.readFile(path.join(root, 'assets/source-art/encores.json'), 'utf8'),
);
const assets = [];
for (const asset of catalog.assets) {
  const originalPath = path.join(assetRoot, 'originals', `${asset.id}.png`);
  const masterPath = `assets/source-art/masters/carnage/${asset.id}.webp`;
  const productionPath = path.join(assetRoot, 'production', `${asset.id}.webp`);
  for (const file of [
    originalPath,
    path.join(root, masterPath),
    productionPath,
  ])
    await fs.mkdir(path.dirname(file), { recursive: true });
  await fs
    .access(originalPath)
    .catch(() => fs.copyFile(asset.source, originalPath));
  if (!(await sharp(originalPath).metadata()).hasAlpha)
    throw new Error(`${asset.id}: missing authored transparency`);
  const master = await sharp(originalPath)
    .trim({ threshold: 10 })
    .resize({
      width: 496,
      height: 496,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' })
    .webp({ lossless: true })
    .toBuffer();
  await fs.writeFile(path.join(root, masterPath), master);
  const runtime = await sharp(master)
    .resize({ width: 384, height: 384, fit: 'inside' })
    .webp({ quality: 86, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  await fs.writeFile(productionPath, runtime);
  const { data, info } = await sharp(runtime)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let transparent = 0,
    opaque = 0,
    foot = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha === 0) transparent++;
      if (alpha > 120) {
        opaque++;
        foot = Math.max(foot, (y + 1) / info.height);
      }
    }
  if (
    transparent < info.width * info.height * 0.08 ||
    opaque < info.width * info.height * 0.18
  )
    throw new Error(`${asset.id}: invalid alpha silhouette`);
  const url = `/art/carnage/${asset.id}.webp`;
  if (!stageOnly) {
    await fs.mkdir(path.join(root, 'public/art/carnage'), { recursive: true });
    await fs.writeFile(path.join(root, 'public', url), runtime);
  }
  assets.push({
    ...asset,
    originalPath,
    masterPath,
    productionPath,
    path: url,
    width: info.width,
    height: info.height,
    bytes: runtime.length,
    foot: +foot.toFixed(6),
    alpha: true,
    verified: true,
  });
}
const manifest = JSON.stringify({ ...catalog, assets }, null, 2) + '\n';
await fs.writeFile(path.join(assetRoot, 'manifest.json'), manifest);
if (!stageOnly) {
  const target = path.join(root, 'public/art/carnage/manifest.json');
  const existing = JSON.parse(await fs.readFile(target, 'utf8'));
  existing.assets = existing.assets.filter(
    (old) => !assets.some((fresh) => fresh.id === old.id),
  );
  existing.assets.push(...assets);
  await fs.writeFile(target, JSON.stringify(existing, null, 2) + '\n');
}
console.log(
  JSON.stringify(
    assets.map(({ id, width, height, bytes, foot }) => ({
      id,
      width,
      height,
      bytes,
      foot,
    })),
    null,
    2,
  ),
);
