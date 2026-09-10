import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import type { GameState } from '../../simulation';
import { TRICKS, routineJudges, type Routine } from '../../routine';
import { GROUND_Y } from '../../art/geometry';
import { juryReaction } from '../motion/jury-motion';
import { entranceTravel } from '../entrance-travel';

/** One goose on the panel: its container, the bird sprite, the score paddle and
 * the separately animated mouth parts the eating gag drives. `birdScale` keeps
 * the sprite's authored scale so per-frame squashing can restart from it. */
interface Judge {
  view: Container;
  bird: Sprite;
  paddle: Container;
  grade: Text;
  birdScale: number;
  mouth: Graphics;
  eyes: Graphics;
  tongue: Graphics;
  morsels: Graphics[];
}

/** The sampled jury response for one verdict age, as juryReaction reports it. */
type Reaction = ReturnType<typeof juryReaction>;

/**
 * Where the panel sits this frame. `scale` is a unitless rig scale capped at 1,
 * `juryLeft` is the world x of the leftmost goose, `travel` is the off-screen
 * distance an entrance or exit covers in world units, and `arrival` and `exit`
 * both run 0 to 1 as fractions of their own move.
 */
interface JuryLayout {
  scale: number;
  juryLeft: number;
  travel: number;
  arrival: number;
  exit: number;
}

/** The toothed grin, drawn once and shown only while a goose is chewing. */
function judgeMouth(): Graphics {
  const mouth = new Graphics()
    .ellipse(0, 8, 26, 19)
    .fill(0x462138)
    .stroke({ color: 0x395843, width: 2 });
  for (let tooth = 0; tooth < 6; tooth++) {
    const x = -21 + tooth * 8;
    mouth.poly([x, -6, x + 3, 4, x + 6, -6]).fill(0xfff2cf);
    mouth.poly([x, 21, x + 3, 12, x + 6, 21]).fill(0xfff2cf);
  }
  return mouth;
}

/** The raised brows and pupils that appear with the grin. */
function judgeEyes(): Graphics {
  const eyes = new Graphics()
    .moveTo(-19, -25)
    .quadraticCurveTo(-29, -39, -19, -44)
    .moveTo(19, -25)
    .quadraticCurveTo(29, -39, 19, -44)
    .stroke({ color: 0x395843, width: 3 });
  for (const x of [-19, 19])
    eyes
      .circle(x, -43, 8)
      .fill(0xfff7dd)
      .stroke({ color: 0x395843, width: 2 })
      .circle(x + 1, -40, 3)
      .fill(0x395843);
  return eyes;
}

/**
 * Assembles one panel rig. `index` (0 to 2) picks the card colour and mirrors
 * the third goose. Children are added in painting order: morsels first so a
 * belched crumb passes behind the bird, then skates, bird, tongue and paddle.
 */
function buildJudge(art: Record<string, Texture>, index: number): Judge {
  const view = new Container({ label: `goose-judge-${index}` });
  const bird = new Sprite({ texture: art.goose, anchor: { x: 0.5, y: 1 } });
  bird.width = 42;
  bird.scale.y = bird.scale.x;
  const paddle = new Container();
  const skates = new Graphics()
    .roundRect(-20, -4, 40, 5, 2)
    .fill(0x705146)
    .circle(-13, 1, 5)
    .circle(13, 1, 5)
    .fill(0x3c564a);
  const stick = new Graphics().roundRect(-2, 0, 4, 24, 2).fill(0x705146);
  const card = new Graphics()
    .roundRect(-27, -29, 54, 34, 6)
    .fill([0xffefba, 0xf9d4be, 0xdcecbc][index])
    .stroke({ color: 0x395843, width: 2 });
  const grade = new Text({
    text: '0.0',
    style: { fontFamily: 'Lilita One', fontSize: 24, fill: 0x294c3b },
  });
  grade.anchor.set(0.5);
  grade.y = -12;
  const mouth = judgeMouth();
  const eyes = judgeEyes();
  const tongue = new Graphics();
  const morsels = Array.from({ length: 5 }, (_, k) => {
    const part = new Graphics()
      .roundRect(-7, -2, 14, 4, 2)
      .circle(-7, -2, 3)
      .circle(-7, 2, 3)
      .circle(7, -2, 3)
      .circle(7, 2, 3)
      .fill(k % 2 ? 0xfff2cf : 0xe97078)
      .stroke({ color: 0x68434b, width: 1 });
    view.addChild(part);
    return part;
  });
  paddle.addChild(stick, card, mouth, eyes, grade);
  view.addChild(skates, bird, tongue, paddle);
  return {
    view,
    bird,
    birdScale: bird.scale.y,
    paddle,
    grade,
    mouth,
    eyes,
    tongue,
    morsels,
  };
}

/** Spins the trick ribbons. `p` is flip progress in 0 to 1; only the first
 * `12 * density` arcs are shown, and none of them while motion is reduced. */
function paintArcs(
  arcs: Graphics[],
  tint: number,
  p: number,
  active: boolean,
  reduced: boolean,
  density: number,
) {
  for (let i = 0; i < arcs.length; i++) {
    const arc = arcs[i];
    arc.visible = active && !reduced && i < Math.ceil(12 * density);
    arc.tint = tint;
    arc.rotation = (i / 12) * Math.PI * 2 + p * Math.PI * 2;
    arc.scale.set(
      1 + Math.sin(p * Math.PI) * 0.28,
      0.5 + Math.sin(p * Math.PI) * 0.4,
    );
    arc.alpha = Math.sin(Math.min(1, p) * Math.PI) * 0.65;
  }
}

/** Throws the clean-landing sparks outward. `age` is seconds since the landing
 * and the burst is spent by 0.7s, which is also when the sparks fade out. */
function paintSparks(
  sparks: Graphics[],
  tint: number,
  age: number,
  celebrate: boolean,
  reduced: boolean,
  density: number,
) {
  for (let i = 0; i < sparks.length; i++) {
    const spark = sparks[i];
    spark.visible = celebrate && i < Math.ceil((reduced ? 4 : 12) * density);
    const a = i * 2.39996;
    const radius = 45 + age * (reduced ? 20 : 110);
    spark.position.set(
      Math.cos(a) * radius,
      Math.sin(a) * radius * 0.6 - age * 25,
    );
    spark.rotation = reduced ? a : a + age * 3;
    spark.scale.set(Math.max(0, 1 - age / 0.7));
    spark.alpha = Math.max(0, 1 - age / 0.7);
    spark.tint = tint;
  }
}

/** Solves the panel's placement for one verdict age in seconds. `focusX` is the
 * wreck the panel gathers around; the rig is nudged so it stays inside the
 * camera window `worldWidth` wide and centred on `cameraX`. */
function juryLayout(
  focusX: number,
  worldWidth: number,
  cameraX: number,
  verdictAge: number,
): JuryLayout {
  const arrival = Math.max(0, 1 - (verdictAge - 0.45) / 1.1);
  const exit = Math.max(0, (verdictAge - 3.9) / 0.8);
  const scale = Math.min(1, worldWidth / 380);
  const margin = 42 * scale + 8;
  const juryLeft = Math.max(
    cameraX - worldWidth / 2 + margin,
    Math.min(
      focusX - 140 * scale,
      cameraX + worldWidth / 2 - margin - 152 * scale,
    ),
  );
  const travel = entranceTravel(
    juryLeft,
    1,
    {
      left: cameraX - worldWidth / 2,
      right: cameraX + worldWidth / 2,
    },
    1900,
    margin,
  );
  return { scale, juryLeft, travel, arrival, exit };
}

/** Skates one goose into place and raises its paddle. The grade stays a `?`
 * until the paddle is 65% of the way up, so the number never reads sideways. */
function seatJudge(
  judge: Judge,
  index: number,
  score: number,
  verdictAge: number,
  time: number,
  reduced: boolean,
  layout: JuryLayout,
) {
  const { scale, juryLeft, travel, arrival, exit } = layout;
  judge.view.scale.set(scale);
  judge.view.position.set(
    juryLeft + index * 76 * scale + (arrival * arrival + exit * exit) * travel,
    GROUND_Y - 5 * scale,
  );
  judge.view.rotation = reduced
    ? 0
    : Math.sin(time * 19 + index) * arrival * 0.08;
  judge.bird.rotation = reduced ? 0 : Math.sin(time * 3 + index) * 0.04;
  judge.bird.position.set(0, 0);
  judge.bird.alpha = 1;
  judge.bird.scale.set(
    judge.birdScale * (index === 2 ? -1 : 1),
    judge.birdScale,
  );
  const raise = Math.min(
    1,
    Math.max(0, (verdictAge - 1.25 - index * 0.14) / 0.3),
  );
  judge.paddle.position.set(10, -28 - raise * 47);
  judge.paddle.rotation = reduced
    ? 0
    : (1 - raise) * 0.85 + Math.sin(index * 2) * 0.08;
  judge.grade.text = raise > 0.65 ? score.toFixed(1) : '?';
}

/** Recoils the two bystanders away from whichever goose is being eaten. */
function shockJudge(
  judge: Judge,
  index: number,
  reaction: Reaction,
  reduced: boolean,
) {
  const away = index < reaction.judge ? -1 : 1;
  judge.bird.rotation += reduced ? 0 : away * reaction.shock * 0.22;
  judge.paddle.rotation += reduced ? 0 : away * reaction.shock * 0.16;
}

/** Stretches the tongue from the paddle to the bird as `lick` runs 0 to 1. */
function paintTongue(
  judge: Judge,
  swallow: number,
  lick: number,
  gentle: boolean,
) {
  const px = judge.paddle.x,
    py = judge.paddle.y + 10;
  const tx = judge.bird.x + 6,
    ty = judge.bird.y - 24 * (1 - swallow);
  const endX = px + (tx - px) * lick;
  const endY = py + (ty - py) * lick;
  judge.tongue
    .moveTo(px, py)
    .bezierCurveTo(px + 18, py + 15, endX - 18, endY + 10, endX, endY)
    .stroke({
      color: gentle ? 0xd990db : 0xe97078,
      width: 7,
      cap: 'round',
    });
}

/** Throws one crumb on a ballistic arc. `elapsed` is seconds since the belch
 * began and `k` is the crumb index, which staggers speed, spin and tint. */
function placeMorsel(
  part: Graphics,
  k: number,
  elapsed: number,
  belch: number,
  reduced: boolean,
  gentle: boolean,
) {
  const direction = k % 2 ? -1 : 1;
  part.position.set(
    10 + direction * elapsed * (reduced ? 22 : 36 + k * 11),
    -61 - elapsed * (reduced ? 10 : 90 + k * 12) + elapsed * elapsed * 160,
  );
  part.rotation = reduced ? k : direction * elapsed * 6 + k;
  part.scale.set(belch * (k === 4 ? 0.75 : 0.55));
  part.tint = gentle ? [0xfbe286, 0xabedca, 0xfbc7f0][k % 3] : 0xffffff;
}

/** Ejects the crumb spray. The visible count is settled once per frame because
 * it never varies with the crumb index, only with reduced motion and density. */
function paintBelch(
  judge: Judge,
  reaction: Reaction,
  verdictAge: number,
  reduced: boolean,
  density: number,
  gentle: boolean,
) {
  const elapsed = Math.max(0, verdictAge - 3.64);
  const shown = Math.ceil((reduced ? 2 : 5) * density);
  for (let k = 0; k < judge.morsels.length; k++) {
    const part = judge.morsels[k];
    part.visible = k < shown;
    placeMorsel(part, k, elapsed, reaction.belch, reduced, gentle);
  }
}

/** Runs the eating gag on the one goose the verdict picked. */
function feedJudge(
  judge: Judge,
  reaction: Reaction,
  verdictAge: number,
  reduced: boolean,
  density: number,
  gentle: boolean,
) {
  const { wake, lick, swallow, belch, chew, appetite } = reaction;
  judge.eyes.scale.set(wake);
  judge.eyes.alpha = wake;
  judge.mouth.scale.set(
    appetite * wake,
    wake * (1 - swallow * 0.8 + chew * 0.3),
  );
  judge.mouth.tint = gentle ? 0xffd7f0 : 0xffffff;
  // The paddle reaches down, pulls its owner up and keeps the grade readable.
  judge.paddle.y += reduced ? 0 : Math.sin(swallow * Math.PI) * 20;
  judge.bird.x = swallow * 10;
  judge.bird.y = swallow * (judge.paddle.y + 22);
  judge.bird.alpha = reduced ? 1 - swallow : 1;
  judge.bird.scale.x *= Math.max(0, 1 - swallow);
  judge.bird.scale.y *=
    Math.max(0, 1 - swallow) *
    (1 + (reduced ? 0 : Math.sin(swallow * Math.PI) * 0.8));
  if (lick > 0 && swallow < 1) paintTongue(judge, swallow, lick, gentle);
  if (belch > 0)
    paintBelch(judge, reaction, verdictAge, reduced, density, gentle);
}

/** Clears last frame's mouth parts, then either eats this goose or recoils it.
 * The reset runs for every judge so a finished gag leaves nothing behind. */
function reactJudge(
  judge: Judge,
  index: number,
  reaction: Reaction,
  verdictAge: number,
  reduced: boolean,
  density: number,
  gentle: boolean,
) {
  const hungry = index === reaction.judge;
  judge.mouth.visible = judge.eyes.visible = hungry && reaction.wake > 0;
  judge.tongue.clear();
  for (const part of judge.morsels) part.visible = false;
  if (!hungry) {
    shockJudge(judge, index, reaction, reduced);
    return;
  }
  feedJudge(judge, reaction, verdictAge, reduced, density, gentle);
}

/** A fixed ribbon/spark/jury rig sampled entirely from recorded routine state. */
export class RoutineShow {
  readonly behind = new Container({ label: 'skating-ribbons' });
  readonly front = new Container({ label: 'skating-jury' });
  private arcs: Graphics[] = [];
  private sparks: Graphics[] = [];
  private judges: Judge[] = [];
  constructor(art: Record<string, Texture>) {
    for (let i = 0; i < 12; i++) {
      const g = new Graphics()
        .arc(0, 0, 82, -0.14, 0.14)
        .stroke({ color: 0xffffff, width: 5, cap: 'round' });
      this.arcs.push(g);
      this.behind.addChild(g);
    }
    for (let i = 0; i < 12; i++) {
      const g = new Graphics().star(0, 0, 4, 7, 2).fill(0xffffff);
      this.sparks.push(g);
      this.behind.addChild(g);
    }
    for (let i = 0; i < 3; i++) {
      const judge = buildJudge(art, i);
      this.judges.push(judge);
      this.front.addChild(judge.view);
    }
    this.reset();
  }
  private trail(
    r: Routine,
    s: GameState,
    time: number,
    reduced: boolean,
    density: number,
  ) {
    const active = r.active;
    const latest = r.elements.at(-1);
    const age = latest ? time - latest.at : 10;
    const celebrate = latest?.clean && age >= 0 && age < 0.7;
    if (!active && !celebrate) return;
    this.behind.visible = true;
    const kind = active?.trick ?? latest!.trick;
    const tint = TRICKS[kind].color;
    this.behind.position.set(
      active ? s.x : latest!.x,
      (active ? s.y : latest!.y) - 48,
    );
    const p = active ? s.flipProgress : Math.min(1, age / 0.7);
    paintArcs(this.arcs, tint, p, !!active, reduced, density);
    paintSparks(this.sparks, tint, age, !!celebrate, reduced, density);
  }
  update(
    s: GameState,
    time: number,
    reduced: boolean,
    density: number,
    worldWidth: number,
    gentle = false,
    cameraX = s.wreck?.focusX ?? s.x,
  ) {
    this.reset();
    const r = s.routine;
    if (!r || s.phase === 'title') return;
    this.trail(r, s, time, reduced, density);
    if (!r.settled || !r.completed || r.verdictAt === null || !s.wreck) return;
    const verdictAge = time - r.verdictAt;
    if (verdictAge < 0.45 || verdictAge >= 4.7) return;
    this.front.visible = true;
    const scores = routineJudges(r);
    const reaction = juryReaction(r, verdictAge);
    const layout = juryLayout(s.wreck.focusX, worldWidth, cameraX, verdictAge);
    for (let i = 0; i < 3; i++) {
      const judge = this.judges[i];
      seatJudge(judge, i, scores[i], verdictAge, time, reduced, layout);
      reactJudge(judge, i, reaction, verdictAge, reduced, density, gentle);
    }
  }
  restoreGraphics() {
    for (const judge of this.judges) judge.grade.unload();
  }
  reset() {
    this.behind.visible = this.front.visible = false;
    for (const arc of this.arcs) arc.visible = false;
    for (const spark of this.sparks) spark.visible = false;
  }
}
