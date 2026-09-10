import { test, expect } from './fixtures';
import type { Filter, GlProgram, WebGLRenderer } from 'pixi.js';
import type { CombustionEffects } from '../../lib/game/effects/combustion';
import type { RocketExhaust } from '../../lib/game/effects/rocket-exhaust';

test('course preparation compiles every effect pipeline and preserves live state on warmup or failure', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof,
      r = c.renderer;
    c.setExporting(true);
    const effects = r as unknown as {
      impactEffects: {
        bursts: { filter: Filter }[];
        portalFilter: Filter;
        lens: { filter: Filter };
      };
      carnageEffects: { combustion: CombustionEffects };
      perkEffects: { exhaust: RocketExhaust };
    };
    const native = r.app.renderer as WebGLRenderer;
    const filters = [
      effects.impactEffects.bursts[0].filter,
      effects.impactEffects.portalFilter,
      effects.impactEffects.lens.filter,
    ];
    const meshes = [
      effects.carnageEffects.combustion.flames[0],
      effects.perkEffects.exhaust.flames[0],
    ];
    const programs = [
      ...filters.map((f) => f.glProgram!),
      ...meshes.map((m) => m.shader!.glProgram!),
    ] as GlProgram[];
    const shader = native.shader as unknown as {
      _programDataHash: Record<string, unknown>;
    };
    await r.prepareLevel('farm', 'buttercup', undefined, 'dynamite');
    const resident = programs.map((p) => !!shader._programDataHash[p._key]);
    const beforePrograms = Object.keys(shader._programDataHash);
    const path = '/lib/game/effects/shaders/prepare-pipelines.ts',
      simPath = '/lib/game/simulation.ts',
      contentPath = '/lib/game/content.ts';
    const { prepareFilters, prepareMesh } = await import(path),
      sim = await import(simPath),
      content = await import(contentPath);
    const state = sim.createGame();
    Object.assign(state, {
      phase: 'flight',
      launched: true,
      x: 2500,
      y: -190,
      vx: 400,
      vy: -80,
      equipment: ['rocket'],
      mod: content.modifiers(['rocket']),
      time: 1,
      sceneTime: 1,
    });
    r.event({
      kind: 'crunch',
      sound: 'explosion',
      id: 'warm-live',
      x: 2500,
      y: -190,
      time: 0.85,
      sceneTime: 0.85,
    });
    r.draw(state, 0, 1);
    const picture = r.canvas.toDataURL();
    const status = () =>
      JSON.stringify({
        filters: filters.map((f) => ({
          enabled: f.enabled,
          uniforms: Object.values(f.resources).map((resource) =>
            'uniforms' in resource ? resource.uniforms : null,
          ),
        })),
        meshes: meshes.map((m) => ({
          x: m.x,
          y: m.y,
          scale: [m.scale.x, m.scale.y],
          rotation: m.rotation,
          visible: m.visible,
          uniforms: Object.values(m.shader!.resources).map((resource) =>
            'uniforms' in resource ? resource.uniforms : null,
          ),
        })),
      });
    const before = status(),
      children = r.app.stage.children.length;
    prepareFilters(native, filters);
    for (const mesh of meshes) prepareMesh(native, mesh);
    const untouched = status() === before;
    r.draw(state, 1, 100);
    const exact = r.canvas.toDataURL() === picture;
    const generate = native.generateTexture.bind(native);
    native.generateTexture = () => {
      throw new Error('GPU allocation interrupted');
    };
    let failures = 0;
    try {
      try {
        prepareFilters(native, filters);
      } catch {
        failures++;
      }
      try {
        prepareMesh(native, meshes[0]);
      } catch {
        failures++;
      }
    } finally {
      native.generateTexture = generate;
    }
    const failureUntouched = status() === before;
    r.draw(state, 0, 1);
    const recovered = r.canvas.toDataURL() === picture;
    return {
      resident,
      untouched,
      exact,
      failures,
      failureUntouched,
      recovered,
      childrenUnchanged: children === r.app.stage.children.length,
      newPrograms: Object.keys(shader._programDataHash).filter(
        (key) => !beforePrograms.includes(key),
      ),
      programKeys: programs.map((p) => p._key),
    };
  });
  expect(report.resident).toEqual([true, true, true, true, true]);
  expect(report.untouched).toBe(true);
  expect(report.exact).toBe(true);
  expect(report.failures).toBe(2);
  expect(report.failureUntouched).toBe(true);
  expect(report.recovered).toBe(true);
  expect(report.childrenUnchanged).toBe(true);
  expect(report.newPrograms).toEqual([]);
  const restored = await page.evaluate(async (keys) => {
    const c = window.__hoof;
    const native = c.renderer.app.renderer as WebGLRenderer;
    const loss = native.gl.getExtension('WEBGL_lose_context');
    if (!loss) return null;
    await new Promise<void>((resolve) => {
      c.renderer.canvas.addEventListener(
        'webglcontextrestored',
        () => {
          // Controller's earlier listener schedules its restoration first.
          setTimeout(resolve, 0);
        },
        { once: true },
      );
      loss.loseContext();
      setTimeout(() => loss.restoreContext(), 100);
    });
    const shader = native.shader as unknown as {
      _programDataHash: Record<string, unknown>;
    };
    return keys.map((key) => !!shader._programDataHash[key]);
  }, report.programKeys);
  if (restored) expect(restored).toEqual([true, true, true, true, true]);
  expect(errors).toEqual([]);
});
