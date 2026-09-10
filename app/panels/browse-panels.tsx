import { Play } from 'lucide-react';
import { RELICS, WORLDS, relicArt, type WorldId } from '@/lib/game/content';
import type { SaveData } from '@/lib/game/storage';

/** Quick play in any world, reachable without starting a tour. */
export function LevelsPanel({
  ready,
  onPlay,
}: {
  ready: boolean;
  onPlay: (world: WorldId) => void;
}) {
  return (
    <>
      <p className="browse-intro">Quick play · all six worlds</p>
      <div className="level-browser">
        {WORLDS.map((world) => (
          <button
            key={world.id}
            disabled={!ready}
            aria-label={`Play ${world.name}`}
            onClick={() => onPlay(world.id)}
          >
            <img
              src={`/art/${world.art}.webp`}
              alt=""
              width={300}
              height={140}
              loading="lazy"
            />
            <span>
              <b>{world.name}</b>
              <Play size={16} fill="currentColor" />
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

/** One catalogue entry, greyed out until enough attempts have unlocked it. */
function UpgradeEntry({
  relic,
  unlocked,
}: {
  relic: (typeof RELICS)[number];
  unlocked: boolean;
}) {
  return (
    <article className={unlocked ? '' : 'is-locked'}>
      <img
        src={relicArt(relic.id)}
        alt=""
        width={64}
        height={64}
        loading="lazy"
      />
      <div>
        <h4>{relic.name}</h4>
        <p>{relic.description}</p>
        <small>
          {unlocked ? 'Available in tours' : 'More attempts unlock this'}
        </small>
      </div>
    </article>
  );
}

/** The two catalogue sections, split by whether an item is spent or passive. */
function UpgradeSection({ active, save }: { active: boolean; save: SaveData }) {
  return (
    <section className="upgrade-library">
      <h3>
        {active ? 'Abilities' : 'Perks'}
        <small>
          {active
            ? 'Right control after landing · one use'
            : 'Work automatically when equipped'}
        </small>
      </h3>
      <div className="upgrade-catalogue">
        {RELICS.filter((r) => (r.category === 'active') === active).map((r) => (
          <UpgradeEntry
            key={r.id}
            relic={r}
            unlocked={save.unlocked.includes(r.id)}
          />
        ))}
      </div>
    </section>
  );
}

/** The full upgrade catalogue, showing what a tour could still offer. */
export function UpgradesPanel({ save }: { save: SaveData }) {
  return (
    <>
      <p className="browse-intro">
        Play a tour. Clear an event. Pick an upgrade.
      </p>
      <UpgradeSection active save={save} />
      <UpgradeSection active={false} save={save} />
    </>
  );
}
