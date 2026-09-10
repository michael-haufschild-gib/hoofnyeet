import { Sprite, Text } from 'pixi.js';
import { TRACK, type GameState } from '../simulation';
import { worldById } from '../content';
import { GROUND_Y } from '../art/geometry';
import { terrainTexture } from './textures';
import type { CrashFrame } from '../crash';
import type { GameRenderer } from '../renderer';

/** The prop-and-rope state a landing leaves behind once the pony stops. */
type Aftermath = NonNullable<CrashFrame['aftermath']>;

/** Adds one course sign in world coordinates, retained for the whole session. */
function courseSign(
  r: GameRenderer,
  text: string,
  x: number,
  y: number,
  size = 20,
  color = '#315343',
) {
  const t = new Text({
    text,
    style: {
      fontFamily: 'Lilita One',
      fontSize: size,
      fill: color,
      stroke: { color: '#fff6d8', width: 3 },
      align: 'center',
    },
  });
  t.anchor.set(0.5);
  t.position.set(x, y);
  r.decor.addChild(t);
  r.labels.push(t);
}

/**
 * Creates the course signage once and reuses it for every later course.
 *
 * The wording never varies by world, and re-rasterising resident text costs a
 * visible stall, so a second call does nothing.
 */
export function prepareCourseLabels(r: GameRenderer) {
  // These signs have the same wording in every world.
  if (r.labels.length) return;
  courseSign(r, 'NO REFUNDS BEYOND THIS POINT', 580, 65, 14);
  courseSign(r, 'TRAMPOLINE', TRACK.trampoline, -164, 20);
  for (let i = 1; i < 16; i++)
    courseSign(r, `${i * 100} m`, TRACK.trampoline + i * 1000, 45, 17);
}

/**
 * Tiles the ground strip across the visible span, growing the pool only when a
 * wider viewport or a lower zoom needs another tile.
 *
 * `left` is the world x of the left screen edge, already padded.
 */
export function paintTerrain(r: GameRenderer, s: GameState, left: number) {
  const texture = terrainTexture(r, s.world);
  const tileCount = Math.ceil((r.w + 64) / r.zoom / 1024) + 1;
  while (r.terrainTiles.length < tileCount) {
    const tile = new Sprite();
    r.terrainTiles.push(tile);
    r.terrain.addChild(tile);
  }
  r.groundBase
    .clear()
    .rect(left, GROUND_Y, (r.w + 64) / r.zoom, r.h / r.zoom)
    .fill(worldById(s.world).ground);
  for (let i = 0; i < r.terrainTiles.length; i++) {
    const p = r.terrainTiles[i];
    p.visible = i < tileCount;
    if (!p.visible) continue;
    p.texture = texture;
    p.position.set(Math.floor(left / 1024) * 1024 + i * 1024, GROUND_Y);
    p.width = 1024;
    p.height = 360;
  }
}

/**
 * Counter-scales the course signs so they stay readable at any zoom, and lifts
 * the distance markers clear of the caption bar.
 *
 * Only distance markers survive the launch; the instructional signs belong to
 * the run-up and are hidden once the pony is airborne.
 */
export function layoutLabels(
  r: GameRenderer,
  s: GameState,
  title: boolean,
  groundY: number,
) {
  for (const label of r.labels) {
    const distanceMarker = /^\d/.test(String(label.text));
    label.visible = !title && (distanceMarker || !s.launched);
    label.scale.set(
      distanceMarker ? Math.min(1.25 / r.zoom, Math.max(1, 0.55 / r.zoom)) : 1,
    );
    if (distanceMarker)
      label.y = Math.min(
        45,
        (r.h - r.captionInset - groundY - 10) / r.zoom - label.height / 2,
      );
  }
}

/** Marks where the flight ended, which a failed run never earns. */
export function paintLanding(r: GameRenderer, s: GameState, crash: boolean) {
  r.landingLabel.visible = crash && !s.failed;
  if (!r.landingLabel.visible) return;
  // Show where the jump ended while kicks and rebounds extend the total.
  const x = s.impactX;
  r.track
    .moveTo(x, GROUND_Y + 8 / r.zoom)
    .lineTo(x, GROUND_Y - 46 / r.zoom)
    .stroke({ color: 0xfff8e8, width: 5 / r.zoom })
    .moveTo(x, GROUND_Y + 8 / r.zoom)
    .lineTo(x, GROUND_Y - 46 / r.zoom)
    .stroke({ color: 0xc96040, width: 2 / r.zoom });
  r.landingLabel.text = `JUMP · ${(s.flightDistance ?? s.distance).toFixed(1)} m`;
  r.landingLabel.scale.set(1 / r.zoom);
  r.landingLabel.position.set(x + 8 / r.zoom, GROUND_Y - 46 / r.zoom);
}

/** Draws the finish-line tape either still strung or snapped in two. */
function paintFence(r: GameRenderer, after: Aftermath) {
  const x = after.anchorX;
  if (after.active)
    r.track
      .moveTo(x - 95, -138)
      .quadraticCurveTo(x, -118, x + 95, -138)
      .stroke({ color: 0x514840, width: 3 });
  else {
    r.track
      .moveTo(x - 95, -138)
      .lineTo(x - 13, -105)
      .stroke({ color: 0x514840, width: 3 });
    r.track
      .moveTo(x + 95, -138)
      .lineTo(x + 13, -105)
      .stroke({ color: 0x514840, width: 3 });
  }
  r.track.roundRect(x - 5, -139, 10, 20, 3).fill(0xe8b84f);
}

/** Draws the attraction beam below a live magnet, with rungs rising through it. */
function paintMagnetField(
  r: GameRenderer,
  s: GameState,
  time: number,
  after: Aftermath,
) {
  const magnet = s.wreck!.bodies.find((body) => body.id === after.propId);
  if (!magnet) return;
  const bottom = Math.max(magnet.y + 170, s.wreck!.focusY + 65);
  r.track
    .poly([
      magnet.x - 32,
      magnet.y + 24,
      magnet.x + 32,
      magnet.y + 24,
      magnet.x + 135,
      bottom,
      magnet.x - 135,
      bottom,
    ])
    .fill({ color: 0x9cffe8, alpha: 0.18 + Math.sin(time * 8) * 0.04 });
  for (let i = 0; i < 4; i++) {
    const y =
      magnet.y +
      60 +
      ((time * 85 + i * 47) % Math.max(80, bottom - magnet.y - 60));
    r.track
      .ellipse(magnet.x, y, 48 + (y - magnet.y) * 0.2, 7)
      .stroke({ color: 0xc9fff4, width: 2, alpha: 0.4 });
  }
}

/** Draws whichever landing prop is still on stage once the pony settles. */
export function paintAftermath(
  r: GameRenderer,
  s: GameState,
  time: number,
  crash: boolean,
) {
  const after = s.wreck?.aftermath;
  if (!crash || !after) return;
  if (after.id === 'fence' && s.wreck!.time >= 4.2) paintFence(r, after);
  if (after.id === 'accordion' && after.active)
    paintMagnetField(r, s, time, after);
}

/** Plants the personal-best flag, which an unplayed save has not earned. */
export function paintBestMarker(r: GameRenderer) {
  if (r.best <= 0) return;
  const x = TRACK.trampoline + r.best * 10;
  r.track
    .moveTo(x, GROUND_Y)
    .lineTo(x, -140)
    .stroke({ color: 0xffce58, width: 4 })
    .poly([x, -140, x + 45, -125, x, -110])
    .fill(0xffce58);
}
