import { test, expect } from './fixtures';
import type { GameController } from '../../lib/game/controller';
import { SYNERGIES, type WorldDefinition } from '../../lib/game/content';
declare global {
  interface Window {
    __hoof: GameController;
  }
}
const groups = [
  'farm',
  'candy',
  'carnival',
  'office',
  'moon',
  'afterlife',
  'synergy',
  ...[
    'haystack',
    'mud',
    'accordion',
    'cartwheel',
    'fence',
    'sheep',
    'ballet',
    'dignified',
  ].map((id) => `ending-${id}`),
];

for (const group of groups)
  test(`${group}: illustrated encounters and punchlines stay clean and bounded`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chromium');
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__hoof?.ready);
    await page.evaluate(() => window.__hoof.setExporting(true));
    await page.addStyleTag({
      content: '.arena > :not(canvas) {display:none!important}',
    });
    const captures = await page.evaluate(async (group) => {
      const simPath = '/lib/game/simulation.ts',
        crashPath = '/lib/game/crash.ts',
        contentPath = '/lib/game/content.ts';
      const sim = await import(simPath),
        physics = await import(crashPath),
        content = await import(contentPath);
      const c = window.__hoof,
        renderer = c.renderer;
      const captures: { id: string; url: string }[] = [];
      for (const world of content.WORLDS.filter(
        (world: WorldDefinition) => world.id === group,
      )) {
        await renderer.loadWorld(world.id);
        for (let d = 0; d < 4; d++) {
          const s = sim.createGame();
          Object.assign(s, {
            phase: 'landing',
            world: world.id,
            mod: content.modifiers([], world.id),
            impactX: 2800,
            x: 2800,
            vx: 720,
            vy: 630,
            impactSpeed: 980,
            impactRotation: d % 2 ? 1.3 : 0.1,
            landing: ['haystack', 'cartwheel', 'ballet', 'fence'][d],
            disaster: d,
            seed: 31,
            boss: d === 3,
            reactive: true,
          });
          const crash = new physics.CrashWorld(s);
          renderer.reset();
          for (let i = 0; i < 1680; i++) {
            if ([90, 260, 520].includes(i)) crash.action('primary');
            if (i === 310) crash.action('secondary');
            crash.step(1 / 120);
            s.time = i / 120;
            s.wreck = crash.snapshot();
            for (const event of crash.drain()) renderer.event(event);
            if (i % 12 === 0) renderer.draw(s, 1 / 10, s.time);
            if ([198, 530, 950, 1572].includes(i))
              captures.push({
                id: `${world.id}-${d}-${i}`,
                url: c.renderer.canvas.toDataURL('image/webp', 0.85),
              });
          }
          crash.dispose();
        }
      }
      for (const combo of group === 'synergy' ? content.SYNERGIES : []) {
        const s = sim.createGame();
        Object.assign(s, {
          phase: 'flight',
          world: 'farm',
          x: 2200,
          y: -160,
          equipment: combo.items,
          mod: content.modifiers(combo.items),
          rotation: -0.1,
        });
        renderer.reset();
        renderer.draw(s, 1, 3);
        captures.push({
          id: `synergy-${combo.id}`,
          url: renderer.canvas.toDataURL('image/webp', 0.85),
        });
      }
      await renderer.loadWorld('farm');
      for (const landing of Object.keys(sim.LANDINGS).filter(
        (id) => `ending-${id}` === group,
      )) {
        const s = sim.createGame();
        Object.assign(s, {
          phase: 'landing',
          world: 'farm',
          x: 2800,
          impactX: 2800,
          vx: 720,
          vy: 600,
          impactRotation: 0.35,
          landing,
          disaster: 1,
          seed: 31,
          reactive: true,
        });
        const crash = new physics.CrashWorld(s);
        renderer.reset();
        for (let tick = 0; tick < 1680; tick++) {
          crash.step(1 / 120);
          s.time = tick / 120;
          s.wreck = crash.snapshot();
          for (const event of crash.drain()) renderer.event(event);
          if (tick % 6 === 0) renderer.draw(s, 1 / 20, s.time);
          if ([550, 925, 1150, 1572].includes(tick))
            captures.push({
              id: `ending-${landing}-${tick}`,
              url: renderer.canvas.toDataURL('image/webp', 0.9),
            });
        }
        crash.dispose();
      }
      return captures;
    }, group);
    await page.evaluate(() => window.__hoof.dispose());
    {
      const cells = captures.filter((c) => c.id.startsWith(group));
      await page.setContent(
        `<html><body style="margin:0;background:#fff5da;font:16px sans-serif"><h1>${group}</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">${cells.map((c) => `<figure style="margin:0"><img style="width:100%;display:block" src="${c.url}"><figcaption>${c.id}</figcaption></figure>`).join('')}</div></body></html>`,
      );
      await page.screenshot({
        path: `output/playwright/review-${group}.png`,
        fullPage: true,
      });
    }
    if (group === 'synergy')
      expect(captures.map((capture) => capture.id)).toEqual(
        SYNERGIES.map((combo) => `synergy-${combo.id}`),
      );
    else expect(captures).toHaveLength(group.startsWith('ending-') ? 4 : 16);
    expect(errors).toEqual([]);
  });
