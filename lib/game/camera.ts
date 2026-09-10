import { TRACK, jumpTarget, type GameState } from './simulation';
import { GROUND_Y } from './art/geometry';
import { nuclearPose } from './effects/motion/nuclear-motion';
import { ENCORE_LIFE } from './effects/motion/encore-motion';
import type { BodyPose, CrashFrame } from './crash';
import type { CarnageCue } from './catalogue/escalation';

/**
 * One resolved camera shot in screen space: `x`/`y` are the world point under
 * the lens, `zoom` scales world units to pixels, and `ground`, `subjectTop` and
 * `safeTop` are pixel rows the HUD lays itself out against.
 */
export interface CameraFrame {
  x: number;
  y: number;
  zoom: number;
  ground: number;
  subjectTop: number;
  safeTop: number;
}

/** Painted rig bounds relative to the controlled pony's simulation position. */
export interface RigBounds {
  left: number;
  right: number;
  top: number;
}

/** World x of the pony on the title screen, where nothing tracks it. */
export const TITLE_PONY_X = 180;

/** Everything the shot must contain besides the tracked subject. */
interface SceneSubjects {
  focusX: number;
  focusY: number;
  focusBody?: BodyPose;
  afterProp?: BodyPose;
  scene?: CarnageCue;
  showScene: boolean;
  showEncore: boolean;
  blast: ReturnType<typeof nuclearPose>;
  showBlast: boolean;
}

/** Keeps the whole painted rig on screen while the menu shares the width. */
function titlePonyX(
  width: number,
  zoom: number,
  stacked: boolean,
  rig?: RigBounds,
): number {
  const x = TITLE_PONY_X - (stacked ? 0 : (width * 0.25) / zoom);
  if (!rig) return x;
  const reach = (width / 2 - 20) / zoom;
  return Math.max(
    TITLE_PONY_X + rig.right - reach,
    Math.min(TITLE_PONY_X + rig.left + reach, x),
  );
}

/** Frames the title, where the pony stands beside the menu rather than moving. */
function titleFrame(
  width: number,
  height: number,
  headroom: number,
  rig?: RigBounds,
): CameraFrame {
  // Match the title's container query, including portrait tablets.
  const stacked = width <= 600 || (width <= 900 && height >= width);
  const zoom = Math.min(
    (width * (stacked ? 0.68 : 0.42)) /
      Math.max(180, rig ? rig.right - rig.left : 180),
    (height * (stacked ? (width > 600 ? 0.33 : 0.29) : 0.62)) /
      Math.max(135, headroom),
    stacked ? 3.4 : 4.6,
  );
  // Centre the pony beside the menu, with its hooves on the track. Anchoring
  // the track to 80% of the screen separated them in tall desktop windows.
  // The compact title reserves room below the hooves for the control guide
  // and navigation, instead of letting the extra buttons cover the pony.
  const ground = stacked
    ? Math.min(height * 0.48, height - 355)
    : height * 0.5 + (135 * zoom) / 2;
  return {
    x: titlePonyX(width, zoom, stacked, rig),
    y: GROUND_Y - (ground - height * 0.58) / zoom,
    zoom,
    ground,
    subjectTop: ground - Math.max(135, headroom) * zoom,
    safeTop: 0,
  };
}

/** The landing set, and whether it is close enough to belong in the shot. */
function sceneInShot(wreck: CrashFrame, focusX: number) {
  const scene = wreck.carnage?.cues.find(
    (c) => c.kind === 'landing' && c.stage === 0,
  );
  const showScene = !!scene && Math.abs(scene.x - focusX) < 600;
  // Reserve the supporting cast's final positions as they enter from outside
  // the shot. Incoming travel itself never forces a distant object into view.
  const showEncore =
    showScene && !!scene.encore && wreck.time - scene.at < ENCORE_LIFE + 0.4;
  return { scene, showScene, showEncore };
}

/** The nuclear cloud pose, and whether it is bright and close enough to frame. */
function blastInShot(wreck: CrashFrame, focusX: number, reduced: boolean) {
  const cue = wreck.carnage?.cues.find((c) => c.kind === 'nuclear');
  const blast = cue ? nuclearPose(cue, wreck.time, reduced) : null;
  const showBlast =
    !!blast && Math.abs(blast.x - focusX) < 950 && blast.alpha > 0.08;
  return { blast, showBlast };
}

/** Collects the subject and every extra the lens has to reserve room for. */
function gatherSubjects(
  s: GameState,
  crash: boolean,
  reduced: boolean,
): SceneSubjects {
  if (!crash) {
    return {
      focusX: s.x,
      focusY: s.y,
      showScene: false,
      showEncore: false,
      blast: null,
      showBlast: false,
    };
  }
  const wreck = s.wreck!;
  const { focusX, focusY } = wreck;
  return {
    focusX,
    focusY,
    focusBody: wreck.bodies.find(
      (body) =>
        body.id === wreck.focusId || (body.x === focusX && body.y === focusY),
    ),
    afterProp: wreck.bodies.find((body) => body.id === wreck.aftermath?.propId),
    ...sceneInShot(wreck, focusX),
    ...blastInShot(wreck, focusX, reduced),
  };
}

/** Half-extents of the tracked subject, rotated into screen axes. */
function focusRadii(
  focusBody: BodyPose | undefined,
  headroom: number,
  headId?: number,
  rig?: RigBounds,
) {
  const hatClearance = headroom > 120 ? 60 : 0;
  if (!focusBody) {
    return {
      radiusX: rig ? Math.max(Math.abs(rig.left), Math.abs(rig.right)) : 50,
      radiusY: 70,
      hatClearance,
    };
  }
  const cos = Math.abs(Math.cos(focusBody.angle));
  const sin = Math.abs(Math.sin(focusBody.angle));
  const radiusY = (sin * focusBody.w + cos * focusBody.h) / 2;
  return {
    radiusX: (cos * focusBody.w + sin * focusBody.h) / 2,
    radiusY: focusBody.id === headId ? radiusY + hatClearance : radiusY,
    hatClearance,
  };
}

/** Horizontal span the shot must cover, in world units. */
function sceneSpan(subjects: SceneSubjects, radiusX: number) {
  const { focusX, scene, showScene, showEncore, blast, showBlast } = subjects;
  let left = showScene
    ? Math.min(focusX - radiusX, scene!.x - (showEncore ? 335 : 230))
    : focusX - radiusX;
  let right = showScene
    ? Math.max(focusX + radiusX, scene!.x + (showEncore ? 335 : 240))
    : focusX + radiusX;
  if (showBlast) {
    left = Math.min(left, blast!.x - blast!.width / 2);
    right = Math.max(right, blast!.x + blast!.width / 2);
  }
  return { left, right };
}

/** Top of the desired shot: the subject, the set, the blast and any incoming prop. */
function sceneTopOf(subjects: SceneSubjects, subjectTop: number): number {
  const { blast, showBlast, showScene, afterProp, focusX, focusY } = subjects;
  // Incoming machinery may begin above the frame. It influences the desired
  // shot, never the immediate visibility clamp: forcing a newly spawned piano
  // into view used to shrink the entire scene by almost half in one frame.
  const propTop =
    afterProp &&
    Math.abs(afterProp.x - focusX) < 900 &&
    afterProp.y > focusY - 420
      ? afterProp.y - Math.hypot(afterProp.w, afterProp.h) * 0.5 - 20
      : 0;
  return Math.min(
    subjectTop,
    showScene ? -250 : -110,
    showBlast ? blast!.cloudY - Math.max(blast!.height, 650) - 20 : 0,
    propTop,
  );
}

/**
 * Room reserved for the physical handoff and headwear while a displacement
 * ability is ready. Without it the visibility clamp snaps on the ejection tick.
 */
function handoffRoom(
  s: GameState,
  crash: boolean,
  hatClearance: number,
): number {
  if (!crash || !s.wreck!.abilityReady) return 0;
  if (!['eject', 'ghost'].includes(s.ability)) return 0;
  return 64 + (s.ability === 'eject' ? hatClearance : 0);
}

/** Top of the shot once upward motion and a pending handoff are allowed for. */
function anticipatedTopOf(
  s: GameState,
  crash: boolean,
  subjects: SceneSubjects,
  subjectTop: number,
  hatClearance: number,
): number {
  // Anticipate upward motion so a flap does not push the pony into the HUD.
  const velocityY = crash ? (s.wreck!.velocityY ?? 0) : s.vy;
  return Math.min(
    sceneTopOf(subjects, subjectTop),
    subjectTop -
      Math.max(0, -velocityY) * 0.2 -
      handoffRoom(s, crash, hatClearance),
  );
}

/** Base zoom for the phase, before any visibility clamp. */
function nominalZoom(
  s: GameState,
  crash: boolean,
  portrait: boolean,
  width: number,
): number {
  if (crash) {
    return portrait ? Math.min(2.8, width / 260) : Math.min(1.65, width / 460);
  }
  if (s.phase === 'flight') return Math.min(1.15, width / 620);
  return Math.min(1.45, width / 520);
}

/** Horizontal lead ahead of the subject, which differs per phase. */
function subjectLead(s: GameState, crash: boolean, portrait: boolean): number {
  if (s.phase === 'runup') return portrait ? 85 : 160;
  if (crash) return 60;
  // Portrait needs room behind the pony for the weather companion and fart
  // plume. Reserve it for the whole flight to avoid panning on every tap.
  const rearPerks =
    portrait &&
    s.phase === 'flight' &&
    (s.equipment.includes('beans') || s.equipment.includes('tailwind'));
  return rearPerks ? -45 : 110;
}

/** The shot the lens is heading toward this frame, before smoothing. */
function desiredShot(
  s: GameState,
  crash: boolean,
  portrait: boolean,
  width: number,
  available: number,
  top: number,
  subjects: SceneSubjects,
  span: { left: number; right: number },
) {
  const framed = subjects.showScene || subjects.showBlast;
  return {
    zoom: Math.min(
      nominalZoom(s, crash, portrait, width),
      available / (GROUND_Y - top),
      framed ? (width - 36) / (span.right - span.left) : Infinity,
    ),
    x: framed
      ? (span.left + span.right) / 2
      : subjects.focusX + subjectLead(s, crash, portrait),
  };
}

/** Blends toward the launch framing as the pony closes on the trampoline. */
function applyLaunchFraming(
  s: GameState,
  width: number,
  available: number,
  target: { zoom: number; x: number },
  rig?: RigBounds,
) {
  const cue = jumpTarget(s);
  const lead = Math.max(0, Math.min(1, (s.x - (cue.start - 500)) / 400));
  const launchLeft = Math.min(s.x + (rig?.left ?? -85) - 25, cue.start - 25);
  const launchRight = TRACK.trampoline + 165;
  const launchZoom = Math.min(
    target.zoom,
    (width - 40) / Math.max(260, launchRight - launchLeft),
    available / 215,
  );
  return {
    zoom: target.zoom * Math.pow(launchZoom / target.zoom, lead),
    x: target.x + ((launchLeft + launchRight) / 2 - target.x) * lead,
  };
}

/**
 * Zooms perceptually — a percentage of the current scale — with a bounded lens
 * speed. A departing UFO must not cause a rapid push-in onto the ground.
 */
function easeZoom(
  previous: CameraFrame | null,
  targetZoom: number,
  blend: number,
  dt: number,
  reduced: boolean,
): number {
  if (!previous) return targetZoom;
  const delta = Math.log(targetZoom / previous.zoom) * blend;
  const step = Math.max(
    -dt * 1.8,
    Math.min(dt * (reduced ? 0.75 : 1.15), delta),
  );
  return previous.zoom * Math.exp(step);
}

/** Eases toward the desired shot, then clamps so the subject stays visible. */
function smoothShot(
  previous: CameraFrame | null,
  target: { zoom: number; x: number },
  dt: number,
  reduced: boolean,
  limits: {
    available: number;
    subjectTop: number;
    width: number;
    radiusX: number;
    focusX: number;
    portrait: boolean;
  },
) {
  const blend = previous ? 1 - Math.exp(-dt * (reduced ? 3 : 5)) : 1;
  // Smoothing must never override visibility, including after a resize or ejection.
  const zoom = Math.min(
    easeZoom(previous, target.zoom, blend, dt, reduced),
    limits.available / (GROUND_Y - limits.subjectTop),
    (limits.width - 36) / (limits.radiusX * 2),
  );
  const panned = previous
    ? previous.x + (target.x - previous.x) * blend
    : target.x;
  // Possession and ejection can change the subject in a single tick.
  const margin = Math.max(
    limits.portrait ? 55 : 80,
    limits.radiusX * zoom + 18,
  );
  const reach = Math.max(0, (limits.width / 2 - margin) / zoom);
  return {
    zoom,
    x: Math.max(limits.focusX - reach, Math.min(limits.focusX + reach, panned)),
  };
}

/** Top inset the HUD occupies when the caller does not supply one. */
function defaultSafeTop(short: boolean, portrait: boolean): number {
  if (short) return 96;
  return portrait ? 174 : 148;
}

/** Keep the landing plane in view. Flight height changes scale, not the horizon. */
export function frameGame(
  s: GameState,
  width: number,
  height: number,
  previous: CameraFrame | null,
  dt: number,
  reduced = false,
  bottomInset = 0,
  topInset?: number,
  headroom = 120,
  rig?: RigBounds,
): CameraFrame {
  const crash = !!s.wreck && ['landing', 'results', 'replay'].includes(s.phase);
  const short = height < 350;
  const portrait = width < 600 || height > width;
  if (rig && !crash) headroom = Math.max(120, -rig.top);
  if (s.phase === 'title') return titleFrame(width, height, headroom, rig);

  const safeTop = topInset ?? defaultSafeTop(short, portrait);
  const ground = height - Math.max(short ? 46 : 74, bottomInset + 32);
  const subjects = gatherSubjects(s, crash, reduced);
  const { radiusX, radiusY, hatClearance } = focusRadii(
    subjects.focusBody,
    headroom,
    s.wreck?.headId,
    rig,
  );
  const subjectTop = Math.min(
    -110,
    subjects.focusY - (crash ? Math.max(100, radiusY + 30) : headroom),
  );
  const available = Math.max(45, ground - safeTop);
  let target = desiredShot(
    s,
    crash,
    portrait,
    width,
    available,
    anticipatedTopOf(s, crash, subjects, subjectTop, hatClearance),
    subjects,
    sceneSpan(subjects, radiusX),
  );
  if (['runup', 'approach', 'compression'].includes(s.phase)) {
    target = applyLaunchFraming(s, width, available, target, rig);
  }
  const { x, zoom } = smoothShot(previous, target, dt, reduced, {
    available,
    subjectTop,
    width,
    radiusX,
    focusX: subjects.focusX,
    portrait,
  });
  return {
    x,
    y: GROUND_Y - (ground - height * 0.58) / zoom,
    zoom,
    ground,
    subjectTop: ground - (GROUND_Y - subjectTop) * zoom,
    safeTop,
  };
}
