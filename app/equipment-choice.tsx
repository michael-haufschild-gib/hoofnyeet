import { relicArt, relicById, synergyChanges } from '@/lib/game/content';

/**
 * A pending swap: the perk `incoming` from the reward, the ids of the passive
 * perks already carried, and the ability id that is never a candidate for
 * replacement. Ids index the relic catalogue in `content`.
 */
export interface ReplacementChoice {
  incoming: string;
  passives: string[];
  ability: string;
}

/**
 * Asks which carried passive perk gives up its slot, listing the synergy pairs
 * each swap would gain or lose. `onChoose` receives the incoming and outgoing
 * relic ids; it is called once per click and never on render.
 */
export function EquipmentChoice({
  choice,
  onChoose,
}: {
  choice: ReplacementChoice;
  onChoose: (incoming: string, outgoing: string) => void;
}) {
  const incoming = relicById(choice.incoming);
  const build = [...choice.passives, choice.ability];
  return (
    <div className="replacement">
      <div className="incoming-perk">
        <img src={relicArt(incoming.id)} alt="" width={72} height={64} />
        <div>
          <span>Make room for</span>
          <h3>{incoming.name}</h3>
        </div>
      </div>
      <div
        className="replacement-options"
        aria-label="Choose a perk to replace"
      >
        {choice.passives.map((id) => {
          const outgoing = relicById(id);
          const changes = synergyChanges(build, incoming.id, id);
          return (
            <button
              key={id}
              aria-label={`Replace ${outgoing.name}`}
              title={outgoing.description}
              onClick={() => onChoose(incoming.id, id)}
            >
              <span className="outgoing-perk">
                <img src={relicArt(id)} alt="" width={48} height={42} />
                <span>
                  <small>Replace</small>
                  <b>{outgoing.name}</b>
                </span>
              </span>
              {changes.gained.map((pair) => (
                <span key={pair.id} className="pair-change gained">
                  <b>Gain</b> {pair.effect}
                </span>
              ))}
              {changes.lost.map((pair) => (
                <span key={pair.id} className="pair-change lost">
                  <b>Lose</b> {pair.effect}
                </span>
              ))}
              {!changes.gained.length && !changes.lost.length && (
                <span className="pair-change kept">
                  Existing pairs stay active
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
