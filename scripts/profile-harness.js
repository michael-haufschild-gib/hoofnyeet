// Browser-side half of the renderer profile. `scripts/profile-renderer.mjs`
// drives Playwright; this module is imported by the page from the Vite dev
// server so that each measurement step is a module-level function rather than
// one long serialized callback.

const TICKS = 1680;
const PRIMARY_ACTION_TICKS = [90, 260, 520];
const SECONDARY_ACTION_TICK = 310;
// The first frames pay for shader and texture upload, so they are not timed.
const WARMUP_FRAMES = 30;
const WINDOW_FRAMES = 120;
const SETTLED_FRAMES = 180;
// The cues worth timing individually: each one lights a new effect pipeline.
const ONSET_CUES = ['ignite', 'nuclear', 'boss'];

/** Builds the landing state the profile replays. */
function profileState(sim, content, world, fiery) {
  const equipment = fiery
    ? ['beans', 'confetti', 'dynamite']
    : ['magnet', 'blackhole'];
  const state = sim.createGame();
  Object.assign(state, {
    phase: 'landing',
    launched: true,
    world,
    x: 4120,
    impactX: 4120,
    vx: 720,
    vy: 600,
    impactSpeed: 900,
    impactRotation: 0.3,
    landing: 'cartwheel',
    seed: 31,
    disaster: 0,
    boss: true,
    reactive: true,
    equipment,
    ability: fiery ? 'dynamite' : 'blackhole',
    mod: content.modifiers(equipment, world),
  });
  return state;
}

/** Replays the crash physics once, capturing a snapshot every other tick. */
function recordSnapshots(physics, state) {
  const crash = new physics.CrashWorld(state);
  const snapshots = [];
  let events = [];
  for (let tick = 0; tick < TICKS; tick++) {
    if (PRIMARY_ACTION_TICKS.includes(tick)) crash.action('primary');
    if (tick === SECONDARY_ACTION_TICK) crash.action('secondary');
    crash.step(1 / 120);
    events.push(...crash.drain());
    if (tick % 2 !== 0) continue;
    snapshots.push({
      state: { ...state, time: tick / 120, wreck: crash.snapshot() },
      events,
    });
    events = [];
  }
  crash.dispose();
  return snapshots;
}

/** Reads the unmasked GPU string when the debug extension is available. */
function gpuName(gl) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  return info
    ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
}

/** Fresh accumulators for one resolution pass. */
function newRun(renderer) {
  return {
    intervals: [],
    costs: [],
    windows: [],
    transitions: [],
    effectOnsets: [],
    seenCues: new Set(),
    maxDraw: { ms: 0, frame: 0, sceneTime: 0 },
    last: 0,
    currentScale: renderer.app.renderer.resolution,
  };
}

/** Records a resolution change the adaptive budget made mid-replay. */
function noteResolution(run, scale, frame, sceneTime) {
  if (scale === run.currentScale) return;
  run.transitions.push({ frame, sceneTime, resolution: scale });
  run.currentScale = scale;
}

/** Records the first appearance of each cue that lights a new effect pipeline. */
function noteCues(run, snapshot, frame, cost) {
  for (const cue of snapshot.state.wreck.carnage?.cues ?? []) {
    if (run.seenCues.has(cue.kind)) continue;
    run.seenCues.add(cue.kind);
    if (!ONSET_CUES.includes(cue.kind)) continue;
    run.effectOnsets.push({
      kind: cue.kind,
      frame,
      sceneTime: snapshot.state.time,
      drawMs: cost,
    });
  }
}

/** Summarises the last window of frames so a mid-replay slowdown stays visible. */
function noteWindow(run, renderer, snapshot, scale) {
  const samples = run.intervals.slice(-WINDOW_FRAMES);
  run.windows.push({
    sceneTime: snapshot.state.time,
    fps: (samples.length * 1000) / samples.reduce((a, b) => a + b, 0),
    resolution: scale,
    density: renderer.budget.density,
    cues: snapshot.state.wreck.carnage?.cues.length,
    sprites: renderer.carnageEffects.stats().visibleSprites,
  });
}

/** Draws one recorded frame and folds its cost into the run. */
function drawFrame(run, renderer, snapshots, frame, now, resolution) {
  const snapshot = snapshots[frame];
  const elapsed = frame ? (now - run.last) / 1000 : 1 / 60;
  if (frame > WARMUP_FRAMES) run.intervals.push(now - run.last);
  run.last = now;
  const before = performance.now();
  if (resolution === 'auto') renderer.observeFrame(elapsed, true);
  const scale = renderer.app.renderer.resolution;
  noteResolution(run, scale, frame, snapshot.state.time);
  for (const event of snapshot.events) renderer.event(event);
  renderer.draw(snapshot.state, 1 / 60, snapshot.state.time);
  const cost = performance.now() - before;
  if (frame > WARMUP_FRAMES) run.costs.push(cost);
  if (cost > run.maxDraw.ms) {
    run.maxDraw = { ms: cost, frame, sceneTime: snapshot.state.time };
  }
  noteCues(run, snapshot, frame, cost);
  if (frame > 0 && frame % WINDOW_FRAMES === 0) {
    noteWindow(run, renderer, snapshot, scale);
  }
}

/** Replays every snapshot at native RAF, resolving once the last frame is drawn. */
function replay(run, renderer, snapshots, resolution) {
  return new Promise((resolve) => {
    let frame = 0;
    const step = (now) => {
      drawFrame(run, renderer, snapshots, frame, now, resolution);
      if (++frame < snapshots.length) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Runs one resolution pass and returns its summary row. */
async function measureResolution(options) {
  const { renderer, snapshots, resolution, world, cpuRate, gpu } = options;
  renderer.reset();
  renderer.app.renderer.resize(
    renderer.w,
    renderer.h,
    resolution === 'auto' ? 2 : resolution,
  );
  const run = newRun(renderer);
  await replay(run, renderer, snapshots, resolution);
  const settled = run.intervals.slice(-SETTLED_FRAMES);
  run.costs.sort((a, b) => a - b);
  run.intervals.sort((a, b) => a - b);
  return {
    world,
    cpuRate,
    gpu,
    maxDraw: run.maxDraw,
    effectOnsets: run.effectOnsets,
    ignitionCues: snapshots
      .at(-1)
      .state.wreck.carnage.cues.filter((c) => c.kind === 'ignite').length,
    resolution,
    windows: run.windows,
    transitions: run.transitions,
    endingResolution: renderer.app.renderer.resolution,
    settledFps: (settled.length * 1000) / settled.reduce((a, b) => a + b, 0),
    frames: run.intervals.length,
    fps:
      (run.intervals.length * 1000) / run.intervals.reduce((a, b) => a + b, 0),
    p95IntervalMs: run.intervals[Math.floor(run.intervals.length * 0.95)],
    p95DrawMs: run.costs[Math.floor(run.costs.length * 0.95)],
    meanDrawMs: run.costs.reduce((a, b) => a + b, 0) / run.costs.length,
    buffer: [renderer.canvas.width, renderer.canvas.height],
  };
}

/** Records one incident and profiles the renderer at each requested resolution. */
export async function profile({ adaptiveOnly, fiery, cpuRate, world }) {
  const c = window.__hoof;
  // Indirect paths keep these as runtime imports the dev server resolves,
  // rather than specifiers a bundler would try to rewrite.
  const simPath = '/lib/game/simulation.ts';
  const physicsPath = '/lib/game/crash.ts';
  const contentPath = '/lib/game/content.ts';
  const sim = await import(simPath);
  const physics = await import(physicsPath);
  const content = await import(contentPath);
  if (!content.WORLDS.some((candidate) => candidate.id === world)) {
    throw new Error(`Unknown profile world: ${world}`);
  }
  await c.renderer.prepareLevel(
    world,
    'buttercup',
    undefined,
    fiery ? 'dynamite' : 'blackhole',
  );
  const snapshots = recordSnapshots(
    physics,
    profileState(sim, content, world, fiery),
  );
  const gpu = gpuName(c.renderer.app.renderer.gl);
  const summaries = [];
  for (const resolution of adaptiveOnly ? ['auto'] : [2, 1.5, 1, 'auto']) {
    summaries.push(
      await measureResolution({
        renderer: c.renderer,
        snapshots,
        resolution,
        world,
        cpuRate,
        gpu,
      }),
    );
  }
  return summaries;
}
