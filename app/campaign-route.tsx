import { Check, Flag, Skull } from 'lucide-react';
import { WORLDS } from '@/lib/game/content';
import {
  CAMPAIGNS,
  campaignItinerary,
  campaignStep,
  type Campaign,
} from '@/lib/game/campaign';
import type { RunState } from '@/lib/game/run';

const names = {
  farm: 'Farm',
  candy: 'Candy',
  carnival: 'Carnival',
  office: 'Office',
  moon: 'Moon',
  afterlife: 'Afterlife',
};

/** One leg of the itinerary, as the campaign module reports it. */
type Stop = ReturnType<typeof campaignItinerary>[number];

/** Where the run currently stands: which leg, which event inside it, how many. */
type Step = ReturnType<typeof campaignStep>;

/**
 * Tour-length switch, offered only on a pristine tour: mode `tour`, stage 0,
 * attempt 0 and no chosen target. `onChange` receives the picked campaign id.
 */
export function CampaignPicker({
  run,
  onChange,
}: {
  run: RunState;
  onChange: (campaign: Campaign) => void;
}) {
  if (
    run.mode !== 'tour' ||
    run.stage !== 0 ||
    run.attempt !== 0 ||
    run.target !== undefined
  )
    return null;
  return (
    <fieldset className="campaign-picker" aria-label="Tour length">
      {(Object.keys(CAMPAIGNS) as Campaign[]).map((id) => (
        <button
          key={id}
          aria-pressed={run.campaign === id}
          onClick={() => onChange(id)}
        >
          <b>{id === 'classic' ? 'Classic' : 'Grand Tour'}</b>
          <span>{CAMPAIGNS[id].events} events</span>
          <Check className="campaign-selected" size={15} aria-hidden="true" />
        </button>
      ))}
    </fieldset>
  );
}

/** Whether one event pip on a stop is already behind the run's position. */
function eventDone(
  stop: Stop,
  current: Step,
  pitstop: boolean,
  event: number,
): boolean {
  if (stop.state === 'done') return true;
  if (stop.state !== 'current') return false;
  return (
    event < current.eventInLeg || (event === current.eventInLeg && pitstop)
  );
}

/** Three pips per stop: two ordinary events, then the boss. */
function StopEvents({
  stop,
  current,
  pitstop,
}: {
  stop: Stop;
  current: Step;
  pitstop: boolean;
}) {
  return (
    <span className="stop-events" aria-hidden="true">
      {[0, 1, 2].map((event) => (
        <i
          key={event}
          className={eventDone(stop, current, pitstop, event) ? 'complete' : ''}
        >
          {event === 2 && <Skull />}
        </i>
      ))}
    </span>
  );
}

/** Tick for a finished stop, chequered flag for the last one, else its number. */
function StopMarker({ stop, last }: { stop: Stop; last: boolean }) {
  if (stop.state === 'done') return <Check />;
  if (last) return <Flag />;
  return <span>{stop.leg + 1}</span>;
}

/** One leg of the route, labelled with its world or the act still to choose. */
function RouteStop({
  stop,
  current,
  run,
}: {
  stop: Stop;
  current: Step;
  run: RunState;
}) {
  const world = WORLDS.find((world) => world.id === stop.world);
  const title = world
    ? `${world.name} · ${world.boss}`
    : `Act ${stop.act + 1} · world to choose`;
  return (
    <li
      className={stop.state}
      aria-current={stop.state === 'current' ? 'step' : undefined}
      title={title}
      aria-label={`${stop.leg + 1}. ${title}${stop.state === 'done' ? ', complete' : ''}`}
      style={
        {
          '--stop-color': world?.color ?? '#c5cbb1',
        } as React.CSSProperties
      }
    >
      <span className="stop-marker">
        <StopMarker stop={stop} last={stop.leg === current.legs - 1} />
      </span>
      <span className="stop-label">
        {world ? names[world.id] : ['Act I', 'Act II', 'Act III'][stop.act]}
      </span>
      <StopEvents
        stop={stop}
        current={current}
        pitstop={run.status === 'pitstop'}
      />
    </li>
  );
}

/**
 * The tour itinerary as an ordered list of stops, marking finished legs, the
 * one in progress and its per-event pips. Renders nothing in quick play, which
 * has no route to show.
 */
export function CampaignRoute({ run }: { run: RunState }) {
  if (run.mode === 'quick') return null;
  const current = campaignStep(run);
  return (
    <ol
      className={`campaign-route stops-${current.legs}`}
      aria-label={`${CAMPAIGNS[current.campaign].name} route`}
    >
      {campaignItinerary(run).map((stop) => (
        <RouteStop key={stop.leg} stop={stop} current={current} run={run} />
      ))}
    </ol>
  );
}
