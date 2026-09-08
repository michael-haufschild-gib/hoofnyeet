import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { localUrl } from './local-url.mjs';

// Capture real input-driven play, including the moments between menu screenshots.
// Speaker output is always disabled. No simulation state is changed by this review.
const viewport = {
  width: Number(process.env.HOOF_WIDTH ?? 1280),
  height: Number(process.env.HOOF_HEIGHT ?? 720),
};
const touch = process.env.HOOF_MOBILE === '1';
const output = `output/playwright/review-${viewport.width}x${viewport.height}`;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio'] });
try {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport,
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
    recordVideo: { dir: output, size: viewport },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(localUrl());
  await page.waitForFunction(() => window.__hoof?.ready);
  await page.getByRole('button', { name: 'Quick play', exact: true }).click();
  await page.locator('canvas').focus();
  const captured = new Set();
  const frames = [];
  const tap = async (primary) => {
    if (touch) {
      const pad = page.locator(
        `.action-pad.${primary ? 'primary' : 'secondary'}`,
      );
      const box = await pad.boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    } else await page.keyboard.press(primary ? 'Space' : 'ArrowUp');
  };
  for (let tick = 0; tick < 650; tick++) {
    const s = await page.evaluate(() => {
      const c = window.__hoof;
      return {
        ...c.snapshot(),
        time: c.state.phaseTime,
        crashTime: c.state.wreck?.time,
        camera: c.renderer.framing,
        caption: c.state.wreck?.caption,
        speed: c.state.vx,
      };
    });
    if (s.phase === 'runup') await tap(!s.jump.ready);
    else if (s.phase === 'flight') {
      if (s.flaps > 0 && s.y > -630) await tap(true);
      if (tick % 4 === 0) await tap(false);
    } else if (s.phase === 'landing') {
      if (tick % 10 === 0) await tap(true);
      if (tick % 23 === 0) await tap(false);
    }
    const frame =
      s.phase === 'flight'
        ? `flight-${Math.floor(s.time / 1.5)}`
        : s.phase === 'landing'
          ? `landing-${Math.floor(s.crashTime / 2)}`
          : s.phase;
    if (!captured.has(frame)) {
      captured.add(frame);
      frames.push({ frame, ...s });
      await page.screenshot({ path: `${output}/${frame}.png` });
    }
    if (s.phase === 'results') break;
    await page.waitForTimeout(70);
  }
  await fs.writeFile(
    `${output}/frames.json`,
    JSON.stringify({ frames, errors }, null, 2),
  );
  console.log(JSON.stringify({ output, frames: [...captured], errors }));
  await context.close();
} finally {
  await browser.close();
}
