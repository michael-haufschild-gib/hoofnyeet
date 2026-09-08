import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Ask Portless for its configured URL instead of assuming a proxy port or TLS mode. */
export function localUrl(mode = 'dev') {
  const override =
    mode === 'preview'
      ? process.env.HOOF_PREVIEW_URL
      : process.env.HOOF_BASE_URL;
  if (override) return override;
  const cli = fileURLToPath(
    new URL('./cli.js', import.meta.resolve('portless')),
  );
  const name = mode === 'preview' ? 'preview.hoofnyeet' : 'hoofnyeet';
  return execFileSync(process.execPath, [cli, 'get', name], {
    encoding: 'utf8',
  }).trim();
}
