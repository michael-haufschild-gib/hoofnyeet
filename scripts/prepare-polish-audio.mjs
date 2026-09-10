import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

// Originals are immutable. Build the small, independently generated reward cues
// with measured headroom and retain the complete generation receipt.
const root = resolve(import.meta.dirname, '..');
const jobs = JSON.parse(
  await readFile(resolve(root, 'assets/audio/polish-20260910.json'), 'utf8'),
);
const manifestPath = resolve(root, 'public/audio/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const production = resolve(root, '../hoof-and-yeet-assets/audio/production');
await mkdir(production, { recursive: true });
function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
// ffmpeg analysis is written to stderr, including on successful exit.
function analysis(path, filter) {
  const result = spawnSync(
    '/opt/homebrew/bin/ffmpeg',
    ['-hide_banner', '-i', path, '-af', filter, '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stderr;
}
for (const job of jobs) {
  const originalPath = job.receipt.replace(/^Success\. File saved as: /, '');
  const loud = analysis(
    originalPath,
    'loudnorm=I=-17:TP=-5.5:LRA=11:print_format=json',
  );
  const loudness = JSON.parse(
    loud.slice(loud.lastIndexOf('{'), loud.lastIndexOf('}') + 1),
  );
  let gain = Math.min(
    -17 - Number(loudness.input_i),
    -5.5 - Number(loudness.input_tp),
  );
  if (!Number.isFinite(gain))
    throw new Error(`Silent or invalid sound: ${job.id}`);
  const filename = `${job.id}.mp3`,
    path = resolve(production, filename);
  let peakDBFS = 0,
    meanDBFS = 0;
  for (let pass = 0; pass < 3; pass++) {
    run('/opt/homebrew/bin/ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      originalPath,
      '-af',
      `volume=${gain}dB,afade=t=in:d=0.004,afade=t=out:st=${job.duration - 0.035}:d=0.035`,
      '-t',
      String(job.duration),
      '-ar',
      '44100',
      '-ac',
      '1',
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '96k',
      path,
    ]);
    const volume = analysis(path, 'volumedetect');
    peakDBFS = Number(volume.match(/max_volume: ([-\d.]+) dB/)[1]);
    meanDBFS = Number(volume.match(/mean_volume: ([-\d.]+) dB/)[1]);
    if (peakDBFS <= -3.5) break;
    gain -= peakDBFS + 4.5;
  }
  const probe = JSON.parse(
    run('/opt/homebrew/bin/ffprobe', [
      '-v',
      'error',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      path,
    ]),
  );
  if (peakDBFS > -3.5 || meanDBFS < -55)
    throw new Error(`Invalid mix: ${job.id}`);
  await copyFile(path, resolve(root, 'public/audio', filename));
  const artifact = {
    id: job.id,
    kind: 'sfx',
    prompt: job.prompt,
    model: job.model,
    generator: job.generator,
    durationRequested: job.duration,
    originalPath,
    path,
    filename,
    generationSuccess: true,
    receipt: job.receipt,
    duration: Number(probe.format.duration),
    decodedContentDuration: job.duration,
    bytes: (await stat(path)).size,
    codec: probe.streams[0].codec_name,
    sampleRate: Number(probe.streams[0].sample_rate),
    channels: probe.streams[0].channels,
    normalizationTargetLUFS: -17,
    normalizationGainDB: gain,
    peakDBFS,
    meanDBFS,
    verified: true,
    generatedAt: '2026-09-10',
    normalization:
      'Measured static EBU R128 gain, constrained by -5.5 dBTP source headroom; 4ms onset and 35ms tail fades, mono 96kbps MP3. Decoded MP3 peak verified below -3.5dBFS.',
  };
  const index = manifest.artifacts.findIndex((item) => item.id === job.id);
  if (index < 0) manifest.artifacts.push(artifact);
  else manifest.artifacts[index] = artifact;
  console.log(
    JSON.stringify({
      id: job.id,
      bytes: artifact.bytes,
      duration: artifact.duration,
      peakDBFS,
      meanDBFS,
    }),
  );
}
manifest.totalBytes = manifest.artifacts.reduce(
  (sum, row) => sum + row.bytes,
  0,
);
manifest.verification.count = manifest.artifacts.length;
manifest.verification.totalBytes = manifest.totalBytes;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
