import { ChevronRight, Film, Skull, Trophy } from 'lucide-react';
import { CATASTROPHES } from '@/lib/game/catalogue/catastrophes';
import { CONTENT_VERSION, RELICS, WORLDS } from '@/lib/game/content';
import { LANDINGS } from '@/lib/game/simulation';
import type { Incident } from '@/lib/game/sharing';
import type { SaveData } from '@/lib/game/storage';

/** Strips the `v<n>:` content-version prefix a daily key carries. */
function dayOf(key: string) {
  return key.replace(/^v\d+:/, '');
}

/** Formats a daily key's date in the UK short form, fixed to UTC noon. */
function dailyDate(key: string) {
  const iso = `${dayOf(key).slice(0, 10)}T12:00:00Z`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The five most recent completed dailies, newest first. */
function DailyRecords({ save }: { save: SaveData }) {
  const entries = Object.entries(save.daily)
    .sort(([a], [b]) => dayOf(b).localeCompare(dayOf(a)))
    .slice(0, 5);
  return (
    <section className="daily-records" aria-label="Daily Disaster records">
      <div>
        <h3>DAILY DISASTER RECORDS</h3>
        <span>Completed tours · this device</span>
      </div>
      {entries.length ? (
        <ol>
          {entries.map(([day, score]) => (
            <li key={day}>
              <span>
                <b>{dailyDate(day)}</b>
                <small>
                  {!day.startsWith(`v${CONTENT_VERSION}:`) &&
                    'Previous course · '}
                  {day.endsWith(':assisted')
                    ? 'Assisted tapping'
                    : 'Classic tapping'}
                </small>
              </span>
              <strong>
                {score.toLocaleString()} <small>pts</small>
              </strong>
            </li>
          ))}
        </ol>
      ) : (
        <p>Finish today’s nine-event tour to pin your first score here.</p>
      )}
    </section>
  );
}

/** One world disaster, hidden until the player has caused it at least once. */
function LandingCard({
  world,
  index,
  name,
  found,
}: {
  world: (typeof WORLDS)[number];
  index: number;
  name: string;
  found: boolean;
}) {
  return (
    <div className={`landing-card ${found ? 'discovered' : ''}`}>
      <span className="landing-number">{world.name}</span>
      {found ? (
        <img
          src={`/art/sprites/${CATASTROPHES[world.id][index].trap}.webp`}
          alt=""
          width={90}
          height={78}
        />
      ) : (
        <Skull size={22} />
      )}
      <b>{found ? name : 'Undocumented incident'}</b>
      <small>
        {found ? 'EVIDENCE FILED' : 'Keep yeeting. Science needs you.'}
      </small>
    </div>
  );
}

/** The award for each landing style, revealed once it has been performed. */
function LandingAwards({ save }: { save: SaveData }) {
  return (
    <div className="awards-grid">
      {Object.entries(LANDINGS).map(([id, landing]) => {
        const found = save.landings.includes(id as keyof typeof LANDINGS);
        return (
          <div className={found ? 'discovered' : ''} key={id}>
            <Trophy size={24} />
            <span>
              <b>{landing.award}</b>
              <small>
                {found
                  ? landing.description
                  : 'Finish a new kind of very bad landing.'}
              </small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** The collection screen: personal bests, saved clips, and everything unfound. */
export function ScrapbookPanel({
  save,
  incidents,
  onSelectIncident,
}: {
  save: SaveData;
  incidents: Incident[];
  onSelectIncident: (incident: Incident) => void;
}) {
  return (
    <>
      <div className="scrapbook-stats">
        <span>
          <b>{save.best.toFixed(1)}m</b> FURTHEST YEET
        </span>
        <span>
          <b>{save.bestHavoc}</b> MAXIMUM HAVOC
        </span>
        <span>
          <b>{save.unlocked.length}/30</b> BAD IDEAS
        </span>
      </div>
      <DailyRecords save={save} />
      <div className="saved-incidents">
        {incidents.map((incident) => (
          <button key={incident.id} onClick={() => onSelectIncident(incident)}>
            <Film size={18} />
            <span>
              <b>{incident.name}</b>
              <small>
                {incident.distance.toFixed(1)}m · {incident.havoc} havoc
              </small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </div>
      <div className="landing-grid">
        {WORLDS.flatMap((world) =>
          world.disasters.map((name, index) => (
            <LandingCard
              key={`${world.id}:${index}`}
              world={world}
              index={index}
              name={name}
              found={save.discoveries.includes(`${world.id}:${index}`)}
            />
          )),
        )}
      </div>
      <h3>LANDING AWARDS · {save.landings.length}/8</h3>
      <LandingAwards save={save} />
      <h3>YOUR TERRIBLE IDEAS</h3>
      <div className="relic-index">
        {RELICS.map((relic) => (
          <span
            key={relic.id}
            className={save.unlocked.includes(relic.id) ? 'unlocked' : ''}
            title={relic.description}
          >
            {relic.icon} {save.unlocked.includes(relic.id) ? relic.name : '???'}
          </span>
        ))}
      </div>
    </>
  );
}
