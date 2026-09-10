import { ArrowUp, Zap } from 'lucide-react';
import { relicById } from '@/lib/game/content';
import { routineChain } from '@/lib/game/routine';
import type { Action, GameState } from '@/lib/game/simulation';
import type { GameController } from '@/lib/game/controller';
import type { SaveData } from '@/lib/game/storage';

/** Which phase the pads are labelled for. */
interface PadPhase {
  crashing: boolean;
  air: boolean;
}

/** Headline verb on the primary pad, which changes with the phase and build. */
function primaryLabel(game: GameState, { crashing, air }: PadPhase) {
  if (crashing) return 'KICK';
  if (!air) return 'RUN';
  return game.equipment.includes('beans') ? 'FART BOOST' : 'FLAP';
}

/** Counter under the primary pad: kicks, flaps, or the mashing hint. */
function primaryDetail(game: GameState, { crashing, air }: PadPhase) {
  if (crashing) return `${game.wreck?.kicks ?? 0} left`;
  return air ? `${game.flaps} left` : 'Tap repeatedly';
}

/** True while the primary control has nothing to spend. */
function primaryDisabled(game: GameState, { crashing, air }: PadPhase) {
  return !(
    game.phase === 'runup' ||
    (air && game.flaps > 0) ||
    (crashing && (game.wreck?.kicks ?? 0) > 0)
  );
}

/** Headline verb on the secondary pad: the ability once the pony has landed. */
function secondaryLabel(game: GameState, { crashing, air }: PadPhase) {
  if (crashing) return relicById(game.ability).name.toUpperCase();
  return air ? 'ROLL' : 'JUMP';
}

/** Coaching under the secondary pad while airborne. */
function airborneSecondaryDetail(game: GameState) {
  if (game.flipActive && game.flaps > 0) return 'Flap mid-roll: splits';
  const chained =
    game.routine && routineChain(game.routine, game.sceneTime ?? game.time) > 0;
  return chained ? 'Link another roll' : 'Roll for style';
}

/** Coaching under the secondary pad for the current phase. */
function secondaryDetail(game: GameState, { crashing, air }: PadPhase) {
  if (crashing) return game.wreck?.abilityReady ? 'Ready' : 'Used';
  return air ? airborneSecondaryDetail(game) : 'Time the bounce';
}

/** True while the secondary control has nothing to spend. */
function secondaryDisabled(game: GameState, { crashing, air }: PadPhase) {
  return !(
    game.phase === 'runup' ||
    air ||
    (crashing && game.wreck?.abilityReady)
  );
}

/**
 * One touch pad. Pointer capture is claimed on press so a finger that slides
 * off the pad still releases the control, which a plain click cannot do.
 */
function Pad({
  action,
  label,
  detail,
  disabled,
  keyCap,
  controller,
}: {
  action: Action;
  label: string;
  detail: string;
  disabled: boolean;
  keyCap: string;
  controller: { current: GameController | null };
}) {
  const primary = action === 'primary';
  return (
    <button
      className={`action-pad ${action}`}
      disabled={disabled}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        controller.current?.pointerDown(`pad-${e.pointerId}-${action}`, action);
      }}
      onPointerUp={(e) =>
        controller.current?.pointerUp(`pad-${e.pointerId}-${action}`)
      }
      onPointerCancel={() => controller.current?.cancelPointer()}
      onLostPointerCapture={(e) =>
        controller.current?.pointerUp(`pad-${e.pointerId}-${action}`)
      }
      onClick={(e) => {
        if (e.detail === 0) controller.current?.action(action);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="pad-icon">{primary ? <Zap /> : <ArrowUp />}</span>
      <span>
        <b>{label}</b>
        <small>{detail}</small>
      </span>
      <span className="pad-inputs">
        <kbd>{keyCap}</kbd>
        <small>or {primary ? 'left click' : 'right click'}</small>
      </span>
    </button>
  );
}

/** The two on-screen controls, labelled for whatever the pony is doing now. */
export function ActionPads({
  game,
  save,
  crashing,
  air,
  controller,
}: {
  game: GameState;
  save: SaveData;
  crashing: boolean;
  air: boolean;
  controller: { current: GameController | null };
}) {
  const phase = { crashing, air };
  return (
    <section className="play-controls" aria-label="Game controls">
      <Pad
        action="primary"
        label={primaryLabel(game, phase)}
        detail={primaryDetail(game, phase)}
        disabled={primaryDisabled(game, phase) || game.paused}
        keyCap={save.primaryKey.replace('Key', '')}
        controller={controller}
      />
      <Pad
        action="secondary"
        label={secondaryLabel(game, phase)}
        detail={secondaryDetail(game, phase)}
        disabled={secondaryDisabled(game, phase) || game.paused}
        keyCap={save.secondaryKey.replace('Arrow', '')}
        controller={controller}
      />
    </section>
  );
}
