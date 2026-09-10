import { frameGame, type RigBounds } from '../camera';
import { synergies } from '../content';
import { GROUND_Y } from '../art/geometry';
import { poseHorse } from './pony-rig';
import type { GameState } from '../simulation';
import type { GameRenderer } from '../renderer';

/**
 * Poses the pony and measures the painted rig in world units around `ponyX`.
 *
 * Returns nothing during a wreck, where loose body parts rather than the rig
 * decide the shot. The title pose is taken at a fixed spot so the menu can
 * share the width.
 */
export function poseSubject(
  r: GameRenderer,
  s: GameState,
  time: number,
  crash: boolean,
  title: boolean,
  ponyX: number,
): RigBounds | undefined {
  poseHorse(r, title ? { ...s, x: ponyX, y: 0 } : s, time);
  if (crash) return undefined;
  // Read the posed artwork, including wing tips and hat rims. Converting
  // back through the world cancels the previous frame's camera transform.
  const bounds = r.pony.getBounds();
  const topLeft = r.world.toLocal({ x: bounds.minX, y: bounds.minY });
  const bottomRight = r.world.toLocal({
    x: bounds.maxX,
    y: bounds.maxY,
  });
  // Inverting the preceding camera introduces sub-pixel floating-point
  // noise. Canonicalize the world-space bounds before fitting the next
  // camera so paused/replayed hats cannot toggle a rasterization edge.
  const stable = (value: number) => Math.round(value * 10000) / 10000;
  return {
    left: stable(topLeft.x - ponyX),
    right: stable(bottomRight.x - ponyX),
    top: stable(topLeft.y - (title ? 0 : s.y)),
  };
}

/**
 * Fits the next shot and applies it to the world container, in pixels.
 *
 * `dt` is scene-clock seconds since the previous frame and drives the camera's
 * easing, so a paused or replayed frame must pass its own elapsed time. Shake
 * is skipped entirely under reduced motion.
 */
export function frameShot(
  r: GameRenderer,
  s: GameState,
  dt: number,
  time: number,
  rig: RigBounds | undefined,
) {
  r.framing = frameGame(
    s,
    r.w,
    r.h,
    r.initialized ? r.framing : null,
    dt,
    r.reduced,
    r.captionInset,
    r.hudInset || undefined,
    r.outfit.hat !== 'helmet' ||
      synergies(s.equipment).some((c) => c.id === 'party')
      ? 175
      : 120,
    rig,
  );
  r.cameraX = r.framing.x;
  r.cameraY = r.framing.y;
  r.zoom = r.framing.zoom;
  r.initialized = true;
  const shake = r.reduced ? 0 : r.impactEffects.shakeAt(time);
  r.world.position.set(
    r.w * 0.5 - r.cameraX * r.zoom + Math.sin(time * 91) * shake,
    r.h * 0.58 - r.cameraY * r.zoom + Math.cos(time * 73) * shake * 0.5,
  );
  r.world.scale.set(r.zoom);
}

/**
 * Places the world illustration and the weather layer behind everything, then
 * returns the screen row, in pixels, where the ground meets the backdrop.
 *
 * A world whose backdrop has not finished loading falls back to the farm, so
 * the frame is never blank.
 */
export function paintBackdrop(
  r: GameRenderer,
  s: GameState,
  time: number,
  title: boolean,
) {
  const bg = r.backgrounds.get(s.world) ?? r.backgrounds.get('farm')!;
  const horizon = s.world === 'farm' ? 0.84 : 0.73;
  const bw = Math.max(r.w * 1.22, (r.h / horizon) * 1.5),
    bh = bw / 1.5;
  const groundY = r.h * 0.58 - r.cameraY * r.zoom + GROUND_Y * r.zoom;
  const p = r.bgSprites[0];
  p.texture = bg;
  p.width = bw;
  p.height = bh;
  // A single overscanned illustration: bounded parallax, no repeated edge.
  p.position.set(
    -(bw - r.w) / 2 -
      Math.sin(r.cameraX / 4200 + (title && !r.reduced ? time * 0.025 : 0)) *
        (bw - r.w) *
        0.28,
    Math.min(0, groundY - bh * horizon),
  );
  // Keep animated light behind every course object and the entire HUD.
  if (r.atmosphere.view.parent !== r.background)
    r.background.addChild(r.atmosphere.view);
  r.atmosphere.update(
    s.world,
    time,
    r.w,
    groundY,
    r.cameraX,
    r.reduced,
    r.budget.density,
  );
  return groundY;
}
