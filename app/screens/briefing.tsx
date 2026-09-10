import { Heart, MoveRight, Skull, Trophy } from 'lucide-react';
import type { CSSProperties } from 'react';
import { CampaignPicker, CampaignRoute } from '../campaign-route';
import { CHALLENGE_RULES } from '@/lib/game/catalogue/challenge-rules';
import type { Campaign } from '@/lib/game/campaign';
import { objective, type RunState } from '@/lib/game/run';
import { campaignStep } from '@/lib/game/campaign';
import type { WorldDefinition, WorldId } from '@/lib/game/content';

/** The route step the run is on, or `null` before a run exists. */
type Route = ReturnType<typeof campaignStep> | null;
/** This event's clearing requirements, or `null` before a run exists. */
type Goal = ReturnType<typeof objective> | null;

/** Headline above the level cards, which differs when the route is forced. */
function stopHeading(worldCount: number, campaign: Campaign | undefined) {
  if (worldCount === 1) return 'Next stop';
  if (campaign === 'grand') return 'Choose your first stop';
  return 'Choose your level';
}

/** Explains a modified daily or a non-standard rule set, when either applies. */
function RuleNote({ run }: { run: RunState }) {
  if (!run.updatedDaily && run.rules === 'standard') return null;
  return (
    <p className="rule-description">
      {run.updatedDaily
        ? 'Your saved daily continues as a tour, with your progress intact.'
        : CHALLENGE_RULES.find((rule) => rule.id === run.rules)?.detail}
    </p>
  );
}

/** One selectable level, tinted with the world's own colour. */
function RouteCard({
  world,
  ready,
  onPlay,
}: {
  world: WorldDefinition;
  ready: boolean;
  onPlay: () => void;
}) {
  return (
    <button
      className="route-card"
      aria-label={`Play ${world.name}`}
      disabled={!ready}
      style={
        {
          '--route-color': world.color,
          '--route-focus': world.id === 'farm' ? '100%' : '35%',
        } as CSSProperties
      }
      onClick={onPlay}
    >
      <img src={`/art/${world.art}.webp`} alt="" width={600} height={300} />
      <div>
        <h3>{world.name}</h3>
        <p>{world.description}</p>
        <span className="route-boss">
          <Skull size={14} />
          {world.boss}
        </span>
        <span className="route-go">
          Play here <MoveRight size={17} />
        </span>
      </div>
    </button>
  );
}

/** The reward line under the cards: a boss bonus on the grand tour, else the target. */
function RouteFootnoteReward({
  run,
  route,
  goal,
}: {
  run: RunState;
  route: Route;
  goal: Goal;
}) {
  if (route?.campaign === 'grand' && run.rules !== 'uninsured') {
    return (
      <>
        <Skull size={14} /> Boss clear: +1 try
      </>
    );
  }
  return <>{`${goal?.distance} m → choose an upgrade`}</>;
}

/** The between-events screen where the player picks the next level. */
export function Briefing({
  run,
  route,
  goal,
  worlds,
  ready,
  tourBest,
  onSelectCampaign,
  onPlayWorld,
}: {
  run: RunState;
  route: Route;
  goal: Goal;
  worlds: WorldDefinition[];
  ready: boolean;
  tourBest: number;
  onSelectCampaign: (campaign: Campaign) => void;
  onPlayWorld: (world: WorldId) => void;
}) {
  return (
    <div className="planning-screen">
      <div className="event-heading route-heading">
        <CampaignPicker run={run} onChange={onSelectCampaign} />
        <span className="eyebrow">
          {run.mode === 'daily' ? 'DAILY · ' : ''}ACT {(route?.act ?? 0) + 1} /
          3 · EVENT {run.stage + 1} / {route?.events}
        </span>
        <h2>{stopHeading(worlds.length, route?.campaign)}</h2>
        <RuleNote run={run} />
        <CampaignRoute run={run} />
      </div>
      <div className={`route-grid ${worlds.length === 1 ? 'is-single' : ''}`}>
        {worlds.map((world) => (
          <RouteCard
            key={world.id}
            world={world}
            ready={ready}
            onPlay={() => onPlayWorld(world.id)}
          />
        ))}
      </div>
      <div className="route-footnote">
        <span>
          <RouteFootnoteReward run={run} route={route} goal={goal} />
        </span>
        {!!tourBest && (
          <span className="tour-record" aria-label="Tour personal best">
            <Trophy size={14} /> Best {tourBest.toLocaleString()}
          </span>
        )}
        <span>
          <Heart size={14} /> {run.insurance} tries
        </span>
      </div>
    </div>
  );
}
