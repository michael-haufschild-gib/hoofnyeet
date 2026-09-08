import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { localUrl } from './local-url.mjs';

const browser = await chromium.launch({ args: ['--mute-audio'] });
const viewport = {
  width: Number(process.env.HOOF_WIDTH ?? 1280),
  height: Number(process.env.HOOF_HEIGHT ?? 720),
};
const mobile = process.env.HOOF_MOBILE === '1';
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport,
  isMobile: mobile,
  hasTouch: mobile,
  deviceScaleFactor: mobile ? 2 : 1,
});
const failures = [];
const requests = [];
page.on('pageerror', (error) => failures.push(error.message));
page.context().on('response', (response) => {
  if (response.status() >= 400)
    failures.push(`${response.status()} ${response.url()}`);
  requests.push(
    (async () => {
      const body = await response.body();
      const headers = await response.allHeaders();
      return {
        path: new URL(response.url()).pathname,
        bytes: Number(headers['content-length']) || body.length,
        type: response.request().resourceType(),
      };
    })().catch(() => null),
  );
});
try {
  await fs.mkdir('output/playwright', { recursive: true });
  await page.goto(localUrl('preview'));
  await page.getByRole('button', { name: /^PLAY$/ }).waitFor();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'PLAY',
      )?.disabled === false,
  );
  await page.waitForLoadState('networkidle');
  const assets = (await Promise.all(requests)).filter(Boolean);
  const download = {
    bytes: assets.reduce((n, a) => n + a.bytes, 0),
    requests: assets.length,
    assets,
    developmentHooks: await page.evaluate(() => '__hoof' in window),
  };
  if (!assets.some((asset) => asset.path.endsWith('/sprites/torso.webp')))
    throw new Error(
      'The download measurement omitted the worker-loaded artwork',
    );
  await page.screenshot({ path: 'output/playwright/production-home.png' });
  await page.getByRole('button', { name: /^PLAY$/ }).click();
  await page.evaluate(() => {
    const frames = { durations: [], last: 0, active: true };
    window.__frameMeasurement = frames;
    const sample = (now) => {
      if (!frames.active) return;
      if (frames.last) frames.durations.push(now - frames.last);
      frames.last = now;
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('canvas').focus();
  for (let tick = 0; tick < 500; tick++) {
    if (await page.getByRole('region', { name: 'Attempt results' }).isVisible())
      break;
    if (await page.locator('.timing-cue.jump-now').isVisible())
      await page.keyboard.press('ArrowUp');
    else if (
      await page
        .getByRole('button', { name: 'RUN', exact: true })
        .isEnabled()
        .catch(() => false)
    )
      await page.keyboard.press('Space');
    else if (
      await page.getByRole('button', { name: 'FLAP', exact: true }).isVisible()
    ) {
      if (tick % 7 === 0) await page.keyboard.press('Space');
      if (tick % 10 === 0) await page.keyboard.press('ArrowUp');
    } else if (
      await page.getByRole('button', { name: 'KICK', exact: true }).isVisible()
    ) {
      if (tick % 15 === 0) await page.keyboard.press('Space');
      if (tick % 20 === 0) await page.keyboard.press('ArrowUp');
    }
    await page.waitForTimeout(60);
  }
  const result = page.getByRole('region', { name: 'Attempt results' });
  await result.waitFor();
  const rendering = await page.evaluate(() => {
    const measurement = window.__frameMeasurement;
    measurement.active = false;
    const samples = measurement.durations.sort((a, b) => a - b);
    return {
      frames: samples.length,
      fps:
        (1000 * samples.length) / samples.reduce((total, ms) => total + ms, 0),
      p95FrameMs: samples[Math.floor(samples.length * 0.95)],
      framesOver50ms: samples.filter((ms) => ms > 50).length,
      jsHeapMB: performance.memory?.usedJSHeapSize / 1e6,
      renderScale: (() => {
        const canvas = document.querySelector('canvas');
        return canvas.width / canvas.clientWidth;
      })(),
    };
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'output/playwright/production-results.png' });
  const attemptAssets = (await Promise.all(requests)).filter(Boolean);
  const firstAttemptBytes = attemptAssets.reduce(
    (total, asset) => total + asset.bytes,
    0,
  );
  const report = {
    ...download,
    viewport,
    mobileEmulation: mobile,
    firstAttemptBytes,
    rendering,
    result: await result.innerText(),
    failures,
  };
  await fs.writeFile(
    'output/playwright/production-check.json',
    JSON.stringify(report, null, 2),
  );
  await fs.writeFile(
    `output/playwright/production-check-${viewport.width}x${viewport.height}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        megabytes: download.bytes / 1e6,
        firstAttemptMegabytes: firstAttemptBytes / 1e6,
        requests: download.requests,
        developmentHooks: download.developmentHooks,
        rendering,
        result: report.result,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length || download.bytes > 8e6 || download.developmentHooks)
    process.exitCode = 1;
} finally {
  await browser.close();
}
