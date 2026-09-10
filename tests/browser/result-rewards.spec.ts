import { test, expect } from './fixtures';

test('earned outfits, failed objectives and expanded skating verdicts keep separate visible hit areas', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const sizes =
    info.project.name === 'phone'
      ? [
          { width: 390, height: 844 },
          { width: 320, height: 568 },
        ]
      : info.project.name === 'phone-landscape'
        ? [
            { width: 915, height: 412 },
            { width: 667, height: 375 },
          ]
        : [
            { width: 1440, height: 1000 },
            { width: 1280, height: 720 },
          ];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const retry of [false, true]) {
      await page.evaluate(async (retry) => {
        const c = window.__hoof;
        c.setExporting(true);
        const routinePath = '/lib/game/routine.ts',
          runPath = '/lib/game/run.ts';
        const {
          newRoutine,
          completeTrick,
          finishRoutine,
          routineRing,
          routineScore,
        } = await import(routinePath);
        const { newRun } = await import(runPath);
        let r = newRoutine();
        for (let i = 0; i < 9; i++) {
          r = completeTrick(
            {
              ...r,
              active: {
                trick: i % 2 ? 'star' : 'layback',
                at: i,
                height: 300,
                linked: true,
              },
            },
            { time: i + 0.8, x: 3400, y: -100, base: 100 },
          );
        }
        r = routineRing(r, 150);
        r = finishRoutine(r, {
          time: 10,
          x: 3400,
          y: 0,
          failed: false,
          interrupted: false,
        });
        c.run = {
          ...newRun(retry ? 'tour' : 'quick'),
          status: retry ? 'briefing' : 'won',
          stage: retry ? 2 : 0,
          insurance: 2,
          score: 18400,
        };
        Object.assign(c.state, {
          phase: 'results',
          launched: true,
          failed: false,
          distance: 745.5,
          flightDistance: 600,
          style: routineScore(r),
          havoc: 2100,
          bossHits: 1,
          landing: 'accordion',
          routine: r,
        });
        c.newHats = ['party', 'crown', 'space', 'brain', 'disco'];
        c.save.hats = ['helmet', ...c.newHats];
        c.screen = 'results';
        c.publish();
      }, retry);
      const result = page.getByRole('region', { name: 'Attempt results' });
      const summary = result.getByRole('button', {
        name: 'Judges and routine breakdown',
      });
      const unlock = result.getByRole('button', {
        name: 'Disco mortis unlocked +4',
      });
      const next = result.getByRole('button', {
        name: retry ? 'TRY AGAIN' : 'AGAIN',
        exact: true,
      });
      await expect(summary).toBeVisible();
      await expect(unlock).toBeVisible();
      await result.locator('.result-content').evaluate((el) => {
        el.scrollTop = 0;
      });
      for (const expanded of [false, true]) {
        if (expanded) await summary.click();
        await expect
          .poll(() =>
            result.evaluate((el) => Number(getComputedStyle(el).opacity)),
          )
          .toBe(1);
        const layout = await result.evaluate((el) => {
          const read = (selector: string) => {
            const node = el.querySelector(selector)!;
            const b = node.getBoundingClientRect();
            return {
              x: b.x,
              y: b.y,
              width: b.width,
              height: b.height,
              right: b.right,
              bottom: b.bottom,
              hit: node.contains(
                document.elementFromPoint(
                  b.x + b.width / 2,
                  b.y + b.height / 2,
                ),
              ),
            };
          };
          return {
            summary: read('.routine-summary'),
            unlock: read('.unlock-note'),
            next: read('.result-main-actions button'),
            links: read('.result-links'),
            height: innerHeight,
          };
        });
        for (const [name, box] of Object.entries(layout)) {
          if (typeof box === 'number') continue;
          expect(
            box.hit,
            `${name} hit target at ${size.width}x${size.height}, retry=${retry}, expanded=${expanded}`,
          ).toBe(true);
          expect(box.y).toBeGreaterThan(0);
          expect(box.bottom).toBeLessThan(layout.height);
        }
        const a = layout.summary,
          b = layout.unlock;
        const overlap =
          Math.min(a.right, b.right) > Math.max(a.x, b.x) &&
          Math.min(a.bottom, b.bottom) > Math.max(a.y, b.y);
        expect(
          overlap,
          'the earned hat never covers the routine disclosure',
        ).toBe(false);
        if (expanded) {
          await expect
            .poll(
              async () =>
                (await result.locator('.routine-scroll').boundingBox())!.height,
            )
            .toBeGreaterThanOrEqual(42);
          await expect
            .poll(() =>
              result.locator('.routine-scroll').evaluate((el) => {
                const box = el.getBoundingClientRect();
                const owner = el.closest('.result-content')!;
                const viewport =
                  getComputedStyle(owner).display === 'contents'
                    ? el.closest('.result-screen')!.getBoundingClientRect()
                    : owner.getBoundingClientRect();
                return (
                  Math.min(box.bottom, viewport.bottom) -
                  Math.max(box.top, viewport.top)
                );
              }),
            )
            .toBeGreaterThanOrEqual(42);
          await page.screenshot({
            path: `output/playwright/polish-20260910/reward-ledger-${info.project.name}-${size.width}-${retry ? 'retry' : 'quick'}.png`,
          });
          await summary.click();
        }
      }
      await page.screenshot({
        path: `output/playwright/polish-20260910/reward-result-${info.project.name}-${size.width}-${retry ? 'retry' : 'quick'}.png`,
      });
      await unlock.click();
      const wardrobe = page.getByRole('dialog');
      await expect(
        wardrobe.getByRole('button', { name: 'Disco mortis' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(wardrobe).not.toBeVisible();
      await expect(next).toBeVisible();
    }
  }
});
