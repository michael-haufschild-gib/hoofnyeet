import type { Graphics } from 'pixi.js';
import { TRACK, trampolineDip, type GameState } from './simulation';

const HALF_BED = 88;
const BED_DEPTH = 13;
const SPRING_FOOT = -4;

export function trampolineBed(s: Pick<GameState, 'phase' | 'phaseTime' | 'x'>) {
  const load =
    s.phase === 'compression'
      ? Math.max(-78, Math.min(78, s.x - TRACK.trampoline))
      : 0;
  const dip = trampolineDip(s);
  return {
    load,
    dip,
    top(x: number) {
      const t =
        x < load
          ? (x + HALF_BED) / (load + HALF_BED)
          : (HALF_BED - x) / (HALF_BED - load);
      const u = Math.max(0, Math.min(1, t));
      return TRACK.surface + dip * u * u * (3 - 2 * u);
    },
    springFoot: SPRING_FOOT,
    depth: BED_DEPTH,
  };
}

/** Padded rim, fixed feet and actual coiled springs share the simulation's bed. */
export function drawTrampoline(g: Graphics, s: GameState) {
  const bed = trampolineBed(s);
  const center = TRACK.trampoline;
  g.ellipse(center, 2, 113, 7).fill({ color: 0x213e35, alpha: 0.2 });
  for (const side of [-1, 1]) {
    g.moveTo(center + side * 84, TRACK.surface + 8)
      .lineTo(center + side * 98, -5)
      .stroke({ color: 0x31483c, width: 13, cap: 'round' });
    g.moveTo(center + side * 84, TRACK.surface + 8)
      .lineTo(center + side * 98, -5)
      .stroke({ color: 0xe4a840, width: 8, cap: 'round' });
    g.roundRect(center + side * 98 - 14, -8, 28, 8, 4).fill(0x354e40);
    g.roundRect(center + side * 84 - 13, TRACK.surface - 3, 26, 16, 6)
      .fill(0x34493d)
      .roundRect(center + side * 84 - 11, TRACK.surface - 1, 22, 12, 5)
      .fill(0xf8cf54);
  }
  g.moveTo(center - 98, SPRING_FOOT)
    .lineTo(center + 98, SPRING_FOOT)
    .stroke({ color: 0x665a3c, width: 4 });
  for (let i = 0; i < 9; i++) {
    const x = -72 + i * 18;
    const top = bed.top(x) + BED_DEPTH;
    const length = Math.max(0, SPRING_FOOT - top);
    g.moveTo(center + x, top);
    for (let coil = 1; coil <= 6; coil++)
      g.lineTo(
        center + x + (coil === 6 ? 0 : coil % 2 ? 3 : -3),
        top + (length * coil) / 6,
      );
    g.stroke({ color: 0x645a42, width: 3, cap: 'round', join: 'round' });
  }
  const path = (offset: number) => {
    const y = TRACK.surface + BED_DEPTH / 2 + offset;
    g.moveTo(center - HALF_BED, y)
      .bezierCurveTo(
        center - HALF_BED + (bed.load + HALF_BED) / 3,
        y,
        center - HALF_BED + ((bed.load + HALF_BED) * 2) / 3,
        y + bed.dip,
        center + bed.load,
        y + bed.dip,
      )
      .bezierCurveTo(
        center + bed.load + (HALF_BED - bed.load) / 3,
        y + bed.dip,
        center + bed.load + ((HALF_BED - bed.load) * 2) / 3,
        y,
        center + HALF_BED,
        y,
      );
  };
  path(0);
  g.stroke({ color: 0x244337, width: BED_DEPTH, cap: 'round' });
  path(0);
  g.stroke({ color: 0x408573, width: 8, cap: 'round' });
  path(-3);
  g.stroke({ color: 0x9ed4ab, width: 2, alpha: 0.8, cap: 'round' });
}
