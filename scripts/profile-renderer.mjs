import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { localUrl } from './local-url.mjs';

// Isolate the renderer from test locators and input automation. All variants
// play the same recorded crash transforms and semantic events at native RAF.
const headed = process.env.HOOF_HEADED === '1';
const cpuRate = Number(process.env.HOOF_CPU_RATE ?? 1);
const world = process.env.HOOF_PROFILE_WORLD ?? 'farm';
const browser = await chromium.launch({
  headless: !headed,
  args: ['--mute-audio'],
});
try {
  const page = await browser.newPage({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  if (cpuRate > 1) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
  await fs.mkdir('output/playwright', { recursive: true });
  await page.goto(localUrl());
  await page.waitForFunction(() => window.__hoof?.ready);
  const adaptiveOnly = process.env.HOOF_ADAPTIVE === '1';
  const fiery = process.env.HOOF_PROFILE_FIRE === '1';
  const reports = await page.evaluate(
    async (options) => {
      const c = window.__hoof;
      c.setExporting(true);
      cancelAnimationFrame(c.raf);
      // Indirect path: a runtime import the dev server resolves and transforms.
      const harnessPath = '/scripts/profile-harness.js';
      const harness = await import(harnessPath);
      return harness.profile(options);
    },
    { adaptiveOnly, fiery, cpuRate, world },
  );
  await fs.writeFile(
    `output/playwright/renderer-profile${adaptiveOnly ? '-auto' : ''}${headed ? '-headed' : ''}${fiery ? '-fire' : ''}${cpuRate > 1 ? `-cpu${cpuRate}` : ''}${world !== 'farm' ? `-${world}` : ''}.json`,
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
