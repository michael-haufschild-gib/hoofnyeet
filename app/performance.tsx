import type { GameState } from '@/lib/game/simulation';
import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  routineChain,
  routineJudges,
  routineRingScore,
  TRICKS,
  type Routine,
  type RoutineElement,
  type Trick,
} from '@/lib/game/routine';

/**
 * The line under the live score: the settled verdict once the routine is in,
 * the name of the trick being held, or the prompt to keep linking.
 */
function styleCaption(r: Routine, trick?: Trick): string {
  if (r.settled) return r.cleanFinish ? 'Clean finish' : 'Points saved';
  if (trick) return TRICKS[trick].name;
  return 'Roll · link · mix it up';
}

/**
 * Live scoring panel for a flight: running style points, the current link
 * count and whichever trick is being held. Renders nothing before the launch
 * or when the attempt carries no routine.
 */
export function StyleReadout({ game }: { game: GameState }) {
  const r = game.routine;
  if (!r || !game.launched) return null;
  const chain = routineChain(r, game.sceneTime ?? game.time);
  const last = r.elements.at(-1);
  const trick = r.active?.trick ?? last?.trick;
  return (
    <div
      className={`style-readout ${chain > 1 ? 'is-linked' : ''}`}
      aria-label="Style score"
    >
      <span>
        Style {chain > 1 && <b className="style-chain">{chain} LINK</b>}
      </span>
      <strong>{game.style.toLocaleString()}</strong>
      <small>{styleCaption(r, trick)}</small>
      {r.active && (
        <progress
          aria-label="Complete rotation"
          max={1}
          value={game.flipProgress}
        />
      )}
    </div>
  );
}

/** Small articulated goose faces keep the verdict readable without extra art
 * requests or a competing animation clock. The cards themselves hold real grades. */
function Goose({ judge }: { judge: number }) {
  return (
    <svg
      className={`judge-goose goose-${judge}`}
      viewBox="0 0 70 50"
      aria-hidden="true"
    >
      <path
        d="M22 49C19 38 21 32 25 25C20 8 31 1 42 4C55 7 56 20 49 28L53 49Z"
        fill="#fff7d8"
        stroke="#334d41"
        strokeWidth="3"
      />
      <path
        d="M45 18L66 24L46 30Z"
        fill="#e88c42"
        stroke="#334d41"
        strokeWidth="2.5"
      />
      <ellipse
        cx="40"
        cy="16"
        rx="3"
        ry={judge === 2 ? '1.5' : '4'}
        fill="#334d41"
      />
      {judge === 0 && (
        <path
          d="M30 12L47 12M32 11L31 21L45 21L45 11M34 44L47 44"
          fill="none"
          stroke="#334d41"
          strokeWidth="2"
        />
      )}
      {judge === 1 && (
        <path
          d="M24 7Q39-6 53 10L51 13L22 11Z"
          fill="#bc584b"
          stroke="#334d41"
          strokeWidth="2"
        />
      )}
      {judge === 2 && (
        <path
          d="M29 4L34 1L38 7L46 1L49 6"
          fill="#efd869"
          stroke="#334d41"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}

/**
 * Scrolls the freshly opened breakdown into view inside the result panel's own
 * scroll owner. Does nothing when the panel has no owner, or when that owner is
 * `display: contents` and therefore not the element that scrolls.
 */
function revealPanel(panel: HTMLDivElement | null) {
  const viewport = panel?.closest<HTMLElement>('.result-content');
  if (!panel || !viewport || getComputedStyle(viewport).display === 'contents')
    return;
  // Reveal the first row inside this result's scroll owner only. Calling
  // scrollIntoView would also scroll the clipped arena on short screens.
  const firstRowBottom =
    panel.getBoundingClientRect().top + Math.min(48, panel.clientHeight);
  const hidden = firstRowBottom - viewport.getBoundingClientRect().bottom + 6;
  if (hidden <= 0) return;
  const reduced =
    !!viewport.closest('.reduced-motion') ||
    matchMedia('(prefers-reduced-motion: reduce)').matches;
  viewport.scrollBy({ top: hidden, behavior: reduced ? 'instant' : 'smooth' });
}

/** Runs the reveal on the frame after the panel opens, and cancels it if the
 * panel closes again first. */
function useRevealOnExpand(
  expanded: boolean,
  details: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => revealPanel(details.current));
    return () => cancelAnimationFrame(frame);
  }, [expanded, details]);
}

/** Three judge paddles, each grade already rounded to one decimal place. */
function JudgeCards({ grades }: { grades: readonly number[] }) {
  return (
    <div className="judge-cards">
      {['Technique', 'Drama', 'Nerve'].map((name, i) => (
        <div className="judge-card" key={name}>
          <Goose judge={i} />
          <div className="judge-paddle">
            <b>{grades[i].toFixed(1)}</b>
            <span>{name}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/** The three point pools as they add up on the collapsed summary row. */
function RoutineEquation({ r }: { r: Routine }) {
  return (
    <span className="routine-equation">
      <span>
        <b>{r.technical}</b> technique
      </span>
      <i>+</i>
      <span>
        <b>{r.artistry}</b> flair
      </span>
      <i>+</i>
      <span>
        <b>{r.finish}</b> finish
      </span>
    </span>
  );
}

/** Trick, ring and best-link counts, plus the affordance that opens the list. */
function RoutineTally({ r }: { r: Routine }) {
  return (
    <span className="routine-expand">
      {r.completed} {r.completed === 1 ? 'trick' : 'tricks'}
      {r.ringCount > 0 &&
        ` · ${r.ringCount} ${r.ringCount === 1 ? 'ring' : 'rings'}`}{' '}
      · best {r.bestChain}
      -link <span aria-hidden="true">⌄</span>
    </span>
  );
}

/** Why one scored trick earned what it did, in the order the rules apply. */
function elementNote(e: RoutineElement): string {
  if (!e.clean) return 'Unfinished · no points';
  if (e.low) return 'Low finish · extra flair';
  if (e.repeat > 0) return 'Repeat · smaller bonus';
  return TRICKS[e.trick].instruction;
}

/** One scored trick in the ledger, with its note and the points awarded. */
function LedgerRow({ e }: { e: RoutineElement }) {
  return (
    <li>
      <span>
        {TRICKS[e.trick].name}
        <small>{elementNote(e)}</small>
      </span>
      <b>{e.clean ? `+${e.base + e.bonus}` : '—'}</b>
    </li>
  );
}

/**
 * The expanded breakdown: points carried over from tricks the frame no longer
 * lists, every scored trick, the ring award and the closing variety points.
 */
function RoutineLedger({
  r,
  rings,
  earlier,
}: {
  r: Routine;
  rings: number;
  earlier: number;
}) {
  return (
    <ol className="routine-ledger" aria-label="Scored tricks">
      {earlier > 0 && (
        <li>
          <span>Earlier tricks</span>
          <b>+{earlier}</b>
        </li>
      )}
      {r.elements.map((e) => (
        <LedgerRow key={e.id} e={e} />
      ))}
      {r.ringCount > 0 && (
        <li>
          <span>
            {r.ringCount} {r.ringCount === 1 ? 'ring' : 'rings'}
            <small>Included in technique</small>
          </span>
          <b>+{rings}</b>
        </li>
      )}
      <li className="routine-finish">
        <span>
          Variety & finish
          <small>
            {r.cleanFinish
              ? 'Completed before touchdown'
              : 'Variety points kept'}
          </small>
        </span>
        <b>+{r.finish}</b>
      </li>
    </ol>
  );
}

/**
 * The judges' verdict card for a finished routine: three paddle grades, the
 * scoring equation, and a collapsible per-trick ledger that scrolls itself into
 * view when opened. Renders nothing until the routine has settled with at
 * least one completed trick.
 */
export function RoutineVerdict({ game }: { game: GameState }) {
  const [expanded, setExpanded] = useState(false);
  const details = useRef<HTMLDivElement>(null);
  useRevealOnExpand(expanded, details);
  const r = game.routine;
  if (!r?.settled || !r.completed) return null;
  const grades = routineJudges(r);
  const rings = routineRingScore(r);
  const earlier = Math.max(
    0,
    r.technical +
      r.artistry -
      rings -
      r.elements.reduce((sum, e) => sum + (e.clean ? e.base + e.bonus : 0), 0),
  );
  return (
    <Collapsible className="routine-verdict" onOpenChange={setExpanded}>
      <CollapsibleTrigger
        className="routine-summary"
        aria-label="Judges and routine breakdown"
      >
        <JudgeCards grades={grades} />
        <RoutineEquation r={r} />
        <RoutineTally r={r} />
      </CollapsibleTrigger>
      <CollapsibleContent className="routine-scroll" ref={details}>
        <RoutineLedger r={r} rings={rings} earlier={earlier} />
      </CollapsibleContent>
    </Collapsible>
  );
}
