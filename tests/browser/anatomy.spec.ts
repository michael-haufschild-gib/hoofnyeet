import { test, expect } from './fixtures';
import type { Sprite, Graphics } from 'pixi.js';
import type { BodyPose } from '../../lib/game/crash';
import type { GameState } from '../../lib/game/simulation';

test('contact-bound organ characters retain their sockets, freeze and replay across inverted body poses', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__hoof?.ready);
  const proof = await page.evaluate(async () => {
    const simPath = '/lib/game/simulation.ts',
      motionPath = '/lib/game/effects/anatomy-motion.ts',
      escalationPath = '/lib/game/escalation.ts';
    const { createGame } = await import(simPath),
      { anatomyAntic } = await import(motionPath),
      { noise } = await import(escalationPath);
    const c = window.__hoof;
    c.setExporting(true);
    await c.renderer.loadWorld('farm');
    const r = c.renderer;
    const effects = (
      r as unknown as {
        carnageEffects: {
          pool: Sprite[];
          drawings: Graphics;
          stats(): { allocatedSprites: number; visibleSprites: number };
        };
      }
    ).carnageEffects;
    const captures: { id: string; url: string }[] = [];
    const kinds = new Set<string>();
    let frozen = true,
      retained = true,
      peak = 0;
    let lastState: GameState | undefined;
    const seeds = [0, 1].map((side) => {
      let seed = 0;
      while ((noise(seed, 27) < 0.5 ? 0 : 1) !== side) seed++;
      return seed;
    });
    for (const part of ['skeletal-torso', 'offended-head'])
      for (const angle of [0, Math.PI / 2, Math.PI])
        for (const seed of seeds) {
          const body: BodyPose = {
            id: 1,
            part,
            x: 2800,
            y: -120,
            w: part.includes('torso') ? 110 : 76,
            h: 82,
            angle,
            tint: 0xffffff,
            alpha: 1,
            injury: 2,
            boss: false,
          };
          const cue = {
            id: `test-${part}-${angle}-${seed}`,
            kind: 'impact' as const,
            bodyId: 1,
            x: body.x,
            y: body.y,
            seed,
            at: 2,
            power: 1.4,
            world: 'farm' as const,
          };
          for (const age of [0.65, 1.4, 2.5]) {
            r.reset();
            const state = createGame();
            Object.assign(state, {
              phase: 'landing',
              reactive: true,
              world: 'farm',
              x: 2800,
              impactX: 2800,
              time: 2 + age,
              sceneTime: 2 + age,
            });
            state.wreck = {
              bodies: [body],
              headId: part.includes('head') ? 1 : undefined,
              focusId: 1,
              focusX: body.x,
              focusY: body.y,
              time: 2 + age,
              kicks: 0,
              abilityReady: true,
              abilityAge: 10,
              havoc: 10,
              bossHits: 0,
              caption: '',
              flash: 0,
              synergy: '',
              carnage: { cues: [cue], attachments: [] },
            };
            const pose = anatomyAntic(body, cue, state.time, false)!;
            kinds.add(pose.kind);
            r.draw(state, 0, state.time);
            const image = r.canvas.toDataURL('image/webp', 0.83);
            const key = part.includes('torso') ? 'heart' : 'brain';
            const actor = effects.pool.find(
              (p) => p.visible && p.label === `carnage-${key}`,
            );
            if (!actor) throw new Error(`Missing ${key} character`);
            if (
              Math.abs(actor.x - pose.x) > 0.01 ||
              Math.abs(actor.rotation - pose.angle) > 0.01
            )
              throw new Error('Art lost its recorded wound pose');
            const bounds = actor.getBounds();
            const ink = effects.drawings.getLocalBounds();
            // Includes this cue's ballistic spray (up to ~860 world units).
            // A rotated wound orbiting the world origin is far outside that area.
            if (
              ink.minX < body.x - 900 ||
              ink.maxX > body.x + 900 ||
              ink.minY < -500 ||
              ink.maxY > 70
            )
              throw new Error(
                `Vector anatomy drifted away from its sprite: ${JSON.stringify(ink)}`,
              );
            if (
              bounds.minX < -1 ||
              bounds.maxX > r.w + 1 ||
              bounds.minY < 0 ||
              bounds.maxY > r.h
            )
              throw new Error(
                `Anatomy clipped the action: ${JSON.stringify(bounds)}`,
              );
            for (let i = 0; i < 3; i++) r.draw(state, 1 / 15, 900 + i);
            frozen &&= image === r.canvas.toDataURL('image/webp', 0.83);
            r.reset();
            r.draw(structuredClone(state), 1 / 120, state.time);
            retained &&= image === r.canvas.toDataURL('image/webp', 0.83);
            peak = Math.max(peak, effects.stats().visibleSprites);
            if (angle === 0 || age === 1.4)
              captures.push({
                id: `${pose.kind}-${angle === 0 ? 'upright' : angle === Math.PI ? 'inverted' : 'side'}-${age}`,
                url: image,
              });
            lastState = state;
          }
        }
    r.gentle = true;
    r.reduced = true;
    r.draw(lastState!, 0, lastState!.time);
    const gentle = !effects.pool.some(
      (p) => p.visible && ['carnage-heart', 'carnage-brain'].includes(p.label),
    );
    r.reset();
    const clean = effects.stats().visibleSprites === 0;
    return {
      captures,
      kinds: [...kinds].sort(),
      frozen,
      retained,
      peak,
      pool: effects.stats().allocatedSprites,
      gentle,
      clean,
    };
  });
  expect(proof.kinds).toEqual([
    'balloon',
    'defibrillator',
    'helicopter',
    'parachute',
  ]);
  expect(proof.frozen).toBe(true);
  expect(proof.retained).toBe(true);
  expect(proof.peak).toBeGreaterThan(3);
  expect(proof.pool).toBe(192);
  expect(proof.gentle).toBe(true);
  expect(proof.clean).toBe(true);
  expect(errors).toEqual([]);
  if (info.project.name === 'chromium')
    for (const capture of proof.captures)
      await info.attach(capture.id, {
        body: Buffer.from(capture.url.split(',')[1], 'base64'),
        contentType: 'image/webp',
      });
});
