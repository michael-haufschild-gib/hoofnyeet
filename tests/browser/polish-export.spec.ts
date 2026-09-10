import { test, expect } from './fixtures';
import { writeFile } from 'node:fs/promises';
import type { GameState, GameEvent } from '../../lib/game/simulation';
import type { Recording } from '../../lib/game/controller';
import type { CrashWorld as CrashSimulation } from '../../lib/game/crash';
import type { GameRenderer as Renderer } from '../../lib/game/renderer';
import type { HorseAudio as Audio } from '../../lib/game/audio';
import type { Sprite, Container } from 'pixi.js';

test('full incident exports the actual routine, paired ability and final encore without resimulation', async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith('phone'));
  test.setTimeout(100000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const report = await page.evaluate(async () => {
    const c = window.__hoof;
    c.setExporting(true);
    const simPath = '/lib/game/simulation.ts',
      crashPath = '/lib/game/crash.ts',
      contentPath = '/lib/game/content.ts',
      sharingPath = '/lib/game/sharing.ts',
      motionPath = '/lib/game/effects/motion/perk-motion.ts';
    const sim = await import(simPath),
      { CrashWorld, initPhysics } = await import(crashPath),
      { modifiers, CONTENT_VERSION } = await import(contentPath),
      { exportClip } = await import(sharingPath),
      { recordPerkEvent } = await import(motionPath);
    await initPhysics();
    const state: GameState = sim.createGame(3);
    const equipment = ['beans', 'acrobat', 'confetti', 'tailwind'];
    Object.assign(state, {
      phase: 'flight',
      reactive: true,
      launched: true,
      world: 'afterlife',
      equipment,
      mod: modifiers(equipment),
      ability: 'spring',
      x: 3500,
      y: -500,
      vx: 580,
      vy: -100,
      seed: 91,
      outfit: { hat: 'brain', ponyId: 'bubblegum' },
    });
    const frames: GameState[] = [],
      events: GameEvent[] = [];
    let crash: CrashSimulation | undefined,
      clock = 0,
      impactAt = 0,
      boosted = false;
    try {
      for (let tick = 0; tick < 4000; tick++) {
        if (state.phase === 'flight') {
          if (!state.flipActive && (state.routine?.completed ?? 0) < 4)
            sim.act(state, 'secondary');
          if (
            !boosted &&
            state.routine?.completed === 1 &&
            state.flipActive &&
            state.flipProgress > 0.25
          ) {
            sim.act(state, 'primary');
            boosted = true;
          }
        }
        const previous = state.time;
        sim.stepGame(state, sim.STEP);
        clock += sim.STEP;
        if (state.phase === 'landing') {
          if (!crash) {
            crash = new CrashWorld(state) as CrashSimulation;
            impactAt = clock;
          }
          if (crash.snapshot().time >= 0.5) crash.action('secondary');
          if (state.time > previous) crash.step(sim.STEP);
          sim.applyCrashFrame(state, crash.snapshot());
        }
        const beats: GameEvent[] = [...state.events, ...(crash?.drain() ?? [])];
        state.events = [];
        for (const e of beats) {
          events.push({ ...recordPerkEvent(e, state), time: clock });
          if (e.freeze && state.phase === 'landing')
            state.hitStop = Math.max(state.hitStop, e.freeze);
        }
        if (tick % 4 === 0 || beats.length || state.phase === 'results')
          frames.push(
            structuredClone({
              ...state,
              phase: state.wreck ? 'landing' : state.phase,
              time: clock,
              sceneTime: state.time,
            }),
          );
        if (state.phase === 'results' || (state.wreck?.time ?? 0) >= 14.15)
          break;
      }
    } finally {
      crash?.dispose();
    }
    const recording: Recording = {
      contentVersion: CONTENT_VERSION,
      appearance: {
        hat: 'brain',
        ponyId: 'bubblegum',
        gentle: false,
        reduced: false,
      },
      frames,
      events,
      duration: frames.at(-1)!.time - frames[0].time,
    };
    const before = JSON.stringify({ recording, save: c.save, run: c.run });
    const samples: { phase: string; at: number; data: string }[] = [],
      renderedEvents: GameEvent[] = [],
      soundedEvents: GameEvent[] = [];
    let lastRecorded = 0,
      lastScene = 0,
      foundRoutine = false,
      foundPair = false,
      foundJury = false,
      foundEncore = false,
      nativeDraws = 0;
    // Use the application's constructors. A bare dev import can instantiate a
    // second module after Vite adds a cache timestamp to the original import.
    const rendererPrototype = Object.getPrototypeOf(c.renderer) as Renderer,
      audioPrototype = Object.getPrototypeOf(c.audio) as Audio;
    // Original methods are restored below and invoked with their exact receiver.
    // Reflect.get keeps each capture from reading as an unbound method.
    const draw = Reflect.get(rendererPrototype, 'draw') as Renderer['draw'];
    const renderEvent = Reflect.get(
      rendererPrototype,
      'event',
    ) as Renderer['event'];
    const audioEvent = Reflect.get(audioPrototype, 'event') as Audio['event'];
    const crashStep = CrashWorld.prototype.step;
    rendererPrototype.draw = function (
      this: Renderer,
      s: GameState,
      dt: number,
      time: number,
    ) {
      Reflect.apply(draw, this, [s, dt, time]);
      nativeDraws++;
      lastRecorded = s.time;
      lastScene = s.wreck?.time ?? 0;
      const effects = (
        this as unknown as {
          carnageEffects: { pool: Sprite[] };
        }
      ).carnageEffects;
      const encore = effects.pool.some(
        (p) => p.visible && p.label === 'encore-soul-toaster',
      );
      const jury = (
        this as unknown as {
          routineShow: {
            front: Container;
            judges: { mouth: Container; bird: Container }[];
          };
        }
      ).routineShow;
      const verdictAge =
        (s.sceneTime ?? s.time) - (s.routine?.verdictAt ?? -100);
      const phase =
        !foundRoutine && s.routine?.active
          ? 'routine'
          : !foundPair &&
              s.wreck?.combinations?.some(
                (cue) =>
                  cue.kind === 'gas-spring' && s.wreck!.time - cue.at < 0.6,
              )
            ? 'pair'
            : !foundJury &&
                jury.front.visible &&
                verdictAge > 3.28 &&
                verdictAge < 3.45 &&
                jury.judges.some((judge) => judge.mouth.visible)
              ? 'jury'
              : !foundEncore && encore && lastScene > 13.05 && lastScene < 13.3
                ? 'payoff'
                : '';
      if (!phase) return;
      if (phase === 'routine') foundRoutine = true;
      if (phase === 'pair') foundPair = true;
      if (phase === 'jury') foundJury = true;
      if (phase === 'payoff') foundEncore = true;
      samples.push({ phase, at: s.time, data: this.canvas.toDataURL() });
    };
    rendererPrototype.event = function (this: Renderer, e: GameEvent) {
      renderedEvents.push(structuredClone(e));
      Reflect.apply(renderEvent, this, [e]);
    };
    audioPrototype.event = function (this: Audio, e: GameEvent) {
      soundedEvents.push(structuredClone(e));
      Reflect.apply(audioEvent, this, [e]);
    };
    CrashWorld.prototype.step = () => {
      throw new Error('The exporter resimulated the live crash');
    };
    let blob: Blob;
    try {
      // Omission exercises the player's default Full incident selection.
      blob = await exportClip(recording, {
        portrait: true,
        captions: true,
        signal: new AbortController().signal,
        progress: () => {},
      });
    } finally {
      rendererPrototype.draw = draw;
      rendererPrototype.event = renderEvent;
      audioPrototype.event = audioEvent;
      CrashWorld.prototype.step = crashStep;
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('Full incident did not decode'));
        video.src = url;
      });
      const first = Math.max(
        frames[0].time,
        frames.at(-1)!.time - Math.min(20, recording.duration),
      );
      const payoff = samples.find((s) => s.phase === 'payoff');
      if (!payoff)
        throw new Error(
          JSON.stringify({
            problem: 'missing recorded payoff',
            samples: samples.map(({ phase, at }) => ({ phase, at })),
            lastScene,
            lastRecorded,
            duration: recording.duration,
            finale: frames
              .at(-1)
              ?.wreck?.carnage?.cues.filter((c) => c.kind === 'landing'),
          }),
        );
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = payoff.at - first + 0.1;
      });
      const decoded = document.createElement('canvas');
      decoded.width = video.videoWidth;
      decoded.height = video.videoHeight;
      decoded.getContext('2d')!.drawImage(video, 0, 0);
      const encoded = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      return {
        duration: recording.duration,
        impactAt,
        lastRecorded,
        lastScene,
        lastFrame: frames.at(-1)!.time,
        nativeDraws,
        completed: state.routine?.completed,
        samples,
        decoded: decoded.toDataURL(),
        dimensions: [video.videoWidth, video.videoHeight],
        encoded,
        mime: blob.type,
        bytes: blob.size,
        foundRoutine,
        foundPair,
        foundJury,
        foundEncore,
        events: events.filter((e) => e.sound === 'gas-spring'),
        rendered: renderedEvents.filter((e) => e.sound === 'gas-spring'),
        sounded: soundedEvents.filter((e) => e.sound === 'gas-spring'),
        unchanged:
          before === JSON.stringify({ recording, save: c.save, run: c.run }),
      };
    } finally {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      c.setExporting(false);
    }
  });
  expect(report.foundRoutine).toBe(true);
  expect(report.foundPair).toBe(true);
  expect(report.foundJury).toBe(true);
  expect(report.foundEncore).toBe(true);
  expect(report.completed).toBeGreaterThanOrEqual(3);
  expect(report.lastScene).toBeGreaterThanOrEqual(14);
  expect(report.lastRecorded).toBe(report.lastFrame);
  expect(report.nativeDraws).toBeGreaterThan(250);
  expect(report.dimensions).toEqual([720, 1280]);
  expect(report.bytes).toBeGreaterThan(100000);
  expect(report.events).toHaveLength(1);
  expect(report.rendered).toEqual(report.events);
  expect(report.sounded).toEqual(report.events);
  expect(report.unchanged).toBe(true);
  expect(errors).toEqual([]);
  const path = `output/playwright/polish-20260910/full-incident-${info.project.name}`;
  for (const sample of report.samples)
    await writeFile(
      `${path}-${sample.phase}.png`,
      Buffer.from(sample.data.split(',')[1], 'base64'),
    );
  await writeFile(
    `${path}-decoded-payoff.png`,
    Buffer.from(report.decoded.split(',')[1], 'base64'),
  );
  await writeFile(
    `${path}.${report.mime.includes('mp4') ? 'mp4' : 'webm'}`,
    Buffer.from(report.encoded.split(',')[1], 'base64'),
  );
  await info.attach('full-incident', {
    contentType: 'application/json',
    body: JSON.stringify({
      ...report,
      samples: report.samples.map(({ phase, at }) => ({ phase, at })),
      encoded: undefined,
      decoded: undefined,
    }),
  });
});
