import type { Graphics } from 'pixi.js';
import { CONTENT_VERSION } from './content';
import { PHYSICS, inJetstream, type GameState } from './simulation';

/** The flight lane is a real world-space band, shared with the arcade simulation. */
export function drawJetstream(
  g: Graphics,
  s: GameState,
  left: number,
  right: number,
  time: number,
  reduced: boolean,
) {
  if (s.phase !== 'flight' || s.contentVersion !== CONTENT_VERSION) return;
  const proximity = Math.max(0, Math.min(1, (-s.y - 110) / 150));
  if (!proximity) return;
  const y = PHYSICS.jetstreamAltitude - 54;
  const active = inJetstream(s);
  const t = reduced ? 0 : time;
  const spacing = 300;
  const drift = (t * (active ? 170 : 90)) % spacing;
  const first = Math.floor((left - spacing) / spacing);
  const last = Math.ceil((right + spacing) / spacing);
  for (let i = first; i <= last; i++) {
    const x = i * spacing + drift;
    for (let row = 0; row < 3; row++) {
      const py = y - 38 + row * 38 + Math.sin(i * 1.7 + row) * 8;
      g.moveTo(x, py)
        .bezierCurveTo(x + 34, py - 13, x + 68, py + 13, x + 105, py)
        .stroke({
          color: 0xfaffee,
          width: row === 1 ? 4 : 2,
          alpha: proximity * (active ? 0.5 : 0.25),
          cap: 'round',
        });
      g.moveTo(x + 94, py - 7)
        .lineTo(x + 105, py)
        .lineTo(x + 94, py + 7)
        .stroke({
          color: 0xffe094,
          width: 3,
          alpha: proximity * 0.6,
          cap: 'round',
          join: 'round',
        });
    }
  }
}
