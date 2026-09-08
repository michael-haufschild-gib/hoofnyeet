// Runtime textures are derivatives. Keep immutable masters outside public so
// repeated optimization never recompresses the previous lossy output.
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicArt = path.join(root, 'public/art');
export const masterDirectory = path.join(root, 'assets/source-art/masters');

// These parts appear enlarged on the title or in the dressing room. Their
// existing resolution is already useful on Retina displays.
const hero = new Set([
  'torso',
  'head',
  'tail',
  'straightLeg',
  'bentLeg',
  'surprisedHead',
  'crown',
  'party-cone',
  'astronaut-helmet',
]);
const largeProps = new Set([
  'baler',
  'piano',
  'jaws',
  'officeGoose',
  'reaper',
  'ufo',
  'rescue',
  'ghost-portal-ring',
  'sheep',
]);
const sizes = {
  'carnage/sausage.webp': 192,
  'carnage/bouquet.webp': 320,
  'carnage/skin.webp': 320,
  bone: 96,
  eye: 96,
  'eyeball-up': 128,
  'eyeball-right': 128,
  jam: 192,
  'magnetic-horseshoe': 192,
  goose: 224,
  helmet: 224,
  grave: 256,
  teeth: 256,
  donut: 256,
  hay: 256,
  pastry: 224,
  cheese: 256,
  crate: 256,
  drum: 256,
  barrel: 256,
  swimring: 256,
  skeleton: 384,
  cube: 384,
};

export async function optimizeImages() {
  const files = (await fs.readdir(publicArt, { recursive: true }))
    .filter((file) => file.endsWith('.webp'))
    .sort();
  const report = [];
  for (const file of files) {
    const target = path.join(publicArt, file);
    const master = path.join(masterDirectory, file);
    await fs.mkdir(path.dirname(master), { recursive: true });
    try {
      await fs.access(master);
    } catch {
      await fs.copyFile(target, master);
    }
    const original = await fs.readFile(master);
    const metadata = await sharp(original).metadata();
    const id = path.basename(file, '.webp');
    const sprite = file.startsWith('sprites/');
    const preserve = sprite && hero.has(id);
    const cap =
      sizes[file] ??
      (sprite
        ? (sizes[id] ?? (largeProps.has(id) || hero.has(id) ? Infinity : 320))
        : Infinity);
    const resize = Math.max(metadata.width, metadata.height) > cap;
    let output = original;
    if (!preserve) {
      let pipeline = sharp(original);
      if (resize)
        pipeline = pipeline.resize({
          width: cap,
          height: cap,
          fit: 'inside',
          withoutEnlargement: true,
        });
      const candidate = await pipeline
        .webp({
          quality: sprite || file.startsWith('carnage/') ? 86 : 82,
          alphaQuality: 100,
          effort: 6,
          smartSubsample: true,
        })
        .toBuffer();
      if (resize || candidate.length < original.length * 0.9)
        output = candidate;
    }
    const current = await fs.readFile(target);
    if (!current.equals(output)) await fs.writeFile(target, output);
    const optimized = await sharp(output).metadata();
    report.push({
      file,
      beforeBytes: original.length,
      bytes: output.length,
      beforeWidth: metadata.width,
      beforeHeight: metadata.height,
      width: optimized.width,
      height: optimized.height,
      alpha: optimized.hasAlpha,
      preserved: preserve,
    });
  }
  const manifestPath = path.join(publicArt, 'carnage/manifest.json');
  const previousManifest = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(previousManifest);
  for (const asset of manifest.assets) {
    const row = report.find((r) => `/art/${r.file}` === asset.path);
    Object.assign(asset, {
      width: row.width,
      height: row.height,
      bytes: row.bytes,
    });
  }
  const nextManifest = JSON.stringify(manifest, null, 2) + '\n';
  if (nextManifest !== previousManifest)
    await fs.writeFile(manifestPath, nextManifest);
  await fs.mkdir(path.join(root, 'output/image-optimization'), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, 'output/image-optimization/after.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  const sum = (key) => report.reduce((n, row) => n + row[key], 0);
  console.log(
    JSON.stringify(
      {
        textures: report.length,
        beforeBytes: sum('beforeBytes'),
        bytes: sum('bytes'),
        beforeDecodedBytes: report.reduce(
          (n, r) => n + r.beforeWidth * r.beforeHeight * 4,
          0,
        ),
        decodedBytes: report.reduce((n, r) => n + r.width * r.height * 4, 0),
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await optimizeImages();
