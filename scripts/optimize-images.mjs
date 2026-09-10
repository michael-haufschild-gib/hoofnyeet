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
  'carnage/heart.webp': 256,
  'carnage/brain.webp': 256,
  'carnage/camera.webp': 256,
  'carnage/popcorn.webp': 256,
  'carnage/copier.webp': 256,
  'carnage/turnstile.webp': 256,
  'carnage/droplet.webp': 96,
  'carnage/splat.webp': 192,
  'carnage/tooth.webp': 128,
  'carnage/nuclear-cloud.webp': 640,
  'carnage/organ-cart.webp': 384,
  'carnage/lunar-blender.webp': 384,
  'carnage/soul-toaster.webp': 384,
  'costumes/disco-skull.webp': 384,
  'costumes/brain-bonnet.webp': 384,
  'costumes/sausage-crown.webp': 384,
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

/** Copies the runtime texture into the immutable master tree the first time it is seen. */
async function ensureMaster(file) {
  const master = path.join(masterDirectory, file);
  await fs.mkdir(path.dirname(master), { recursive: true });
  try {
    await fs.access(master);
  } catch {
    await fs.copyFile(path.join(publicArt, file), master);
  }
  return master;
}

/** Longest-edge budget for one texture in pixels; Infinity keeps it at source size. */
function sizeCapFor(file, id, sprite) {
  if (sizes[file] !== undefined) return sizes[file];
  if (!sprite) return Infinity;
  if (sizes[id] !== undefined) return sizes[id];
  return largeProps.has(id) || hero.has(id) ? Infinity : 320;
}

/** Sprites and character art carry a higher quality floor than background scenery. */
function qualityFor(file, sprite) {
  const detailed =
    sprite || file.startsWith('carnage/') || file.startsWith('costumes/');
  return detailed ? 86 : 82;
}

/** Re-encodes a texture, keeping the original when the saving would be marginal. */
async function compress(original, { cap, resize, quality }) {
  let pipeline = sharp(original);
  if (resize) {
    pipeline = pipeline.resize({
      width: cap,
      height: cap,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const candidate = await pipeline
    .webp({ quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  if (resize || candidate.length < original.length * 0.9) return candidate;
  return original;
}

/** Optimizes one texture in place and returns its before/after row for the report. */
async function optimizeOne(file) {
  const target = path.join(publicArt, file);
  const original = await fs.readFile(await ensureMaster(file));
  const metadata = await sharp(original).metadata();
  const id = path.basename(file, '.webp');
  const sprite = file.startsWith('sprites/');
  const preserve = sprite && hero.has(id);
  const cap = sizeCapFor(file, id, sprite);
  const resize = Math.max(metadata.width, metadata.height) > cap;
  const output = preserve
    ? original
    : await compress(original, {
        cap,
        resize,
        quality: qualityFor(file, sprite),
      });
  const current = await fs.readFile(target);
  if (!current.equals(output)) await fs.writeFile(target, output);
  const optimized = await sharp(output).metadata();
  return {
    file,
    beforeBytes: original.length,
    bytes: output.length,
    beforeWidth: metadata.width,
    beforeHeight: metadata.height,
    width: optimized.width,
    height: optimized.height,
    alpha: optimized.hasAlpha,
    preserved: preserve,
  };
}

/** Rewrites the carnage manifest with the dimensions the textures actually have. */
async function updateManifest(report) {
  const manifestPath = path.join(publicArt, 'carnage/manifest.json');
  const previous = await fs.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(previous);
  for (const asset of manifest.assets) {
    const row = report.find((r) => `/art/${r.file}` === asset.path);
    Object.assign(asset, {
      width: row.width,
      height: row.height,
      bytes: row.bytes,
    });
  }
  const next = JSON.stringify(manifest, null, 2) + '\n';
  if (next !== previous) await fs.writeFile(manifestPath, next);
}

/** Records the full before/after table so a later run can be compared against it. */
async function writeReport(report) {
  const directory = path.join(root, 'output/image-optimization');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'after.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
}

/** Prints the byte and decoded-size totals that the asset budget is judged on. */
function logSummary(report) {
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

export async function optimizeImages() {
  const files = (await fs.readdir(publicArt, { recursive: true }))
    .filter((file) => file.endsWith('.webp'))
    .sort();
  const report = [];
  for (const file of files) report.push(await optimizeOne(file));
  await updateManifest(report);
  await writeReport(report);
  logSummary(report);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await optimizeImages();
