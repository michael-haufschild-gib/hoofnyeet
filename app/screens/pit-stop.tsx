import type { RefObject } from 'react';
import {
  ChevronRight,
  Coins,
  Heart,
  MoveRight,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { CampaignRoute } from '../campaign-route';
import { insuranceCapacity } from '@/lib/game/catalogue/challenge-rules';
import { relicArt, relicById, synergyChanges } from '@/lib/game/content';
import { price, type RunState } from '@/lib/game/run';
import { campaignStep } from '@/lib/game/campaign';

type Route = ReturnType<typeof campaignStep> | null;
type Changes = ReturnType<typeof synergyChanges>;

/** Whether an offer is affordable, already owned, or free on this stop. */
function offerLocked(run: RunState, id: string, build: string[]) {
  return (
    build.includes(id) ||
    (run.rewardTaken && run.salvage < price(run, 'equipment'))
  );
}

/** The call to action on an offer, which changes once the free pick is spent. */
function offerPrice(run: RunState, id: string, build: string[]) {
  if (build.includes(id)) return '✓ EQUIPPED';
  if (run.rewardTaken) return `${price(run, 'equipment')} salvage`;
  if (relicById(id).category === 'active') {
    return `Replaces ${relicById(run.ability).name}`;
  }
  return 'Choose →';
}

/** The synergies an offer would open or close against the current build. */
function OfferPairs({ changes }: { changes: Changes }) {
  if (changes.gained.length === 0 && changes.lost.length === 0) return null;
  return (
    <div className="offer-pairs">
      {changes.gained.map((c) => (
        <span className="synergy-opportunity" key={c.id} title={c.name}>
          <Sparkles size={14} aria-hidden="true" /> {c.effect}
        </span>
      ))}
      {changes.lost.map((c) => (
        <span
          className="synergy-opportunity loses-pair"
          key={c.id}
          title={c.name}
        >
          <span>Lose</span> {c.effect}
        </span>
      ))}
    </div>
  );
}

/** One perk or ability on offer at this stop. */
function RelicOffer({
  run,
  id,
  build,
  onChoose,
}: {
  run: RunState;
  id: string;
  build: string[];
  onChoose: (id: string, trigger: HTMLButtonElement) => void;
}) {
  const relic = relicById(id);
  const active = relic.category === 'active';
  const changes = synergyChanges(build, id, active ? run.ability : undefined);
  return (
    <button
      className={`relic-card ${build.includes(id) ? 'chosen' : ''}`}
      disabled={offerLocked(run, id, build)}
      onClick={(event) => onChoose(id, event.currentTarget)}
    >
      <div className="relic-art">
        <img src={relicArt(id)} width={130} height={115} alt="" />
      </div>
      <h3>{relic.name}</h3>
      <p>{relic.description}</p>
      <OfferPairs changes={changes} />
      <b>
        {offerPrice(run, id, build)}
        {active && run.rewardTaken && !build.includes(id) && (
          <small className="offer-replacement">
            Replaces {relicById(run.ability).name}
          </small>
        )}
      </b>
    </button>
  );
}

/** Salvage purchases: an extra try, or a fresh set of offers. */
function PitStopShop({
  run,
  shopRef,
  onInsurance,
  onReroll,
}: {
  run: RunState;
  shopRef: RefObject<HTMLDivElement | null>;
  onInsurance: () => void;
  onReroll: () => void;
}) {
  return (
    <div className="pitstop-shop" ref={shopRef}>
      <button
        disabled={
          run.insurance >= insuranceCapacity(run.rules) ||
          run.salvage < price(run, 'insurance')
        }
        onClick={onInsurance}
      >
        <Heart size={15} /> Extra try · {price(run, 'insurance')}
      </button>
      <button
        disabled={run.rewardTaken || run.salvage < price(run, 'reroll')}
        onClick={onReroll}
      >
        <RotateCcw size={15} /> Reroll · {price(run, 'reroll')}
      </button>
      <small>
        {run.rewardTaken
          ? 'Extra perks cost salvage. Continue when ready.'
          : 'Your first pick is free. Stay to shop, or close this for a quick getaway.'}
      </small>
    </div>
  );
}

/** The always-visible footer: salvage on hand, the shop toggle, and Continue. */
function PitStopTools({
  run,
  ready,
  shopping,
  onToggleShopping,
  onContinue,
}: {
  run: RunState;
  ready: boolean;
  shopping: boolean;
  onToggleShopping: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="pitstop-tools">
      <span className="pocket-money">
        <Coins size={17} /> {run.salvage}
      </span>
      <button
        className="text-button"
        aria-label="Shop & reroll"
        aria-expanded={shopping}
        onClick={onToggleShopping}
      >
        <span>
          Shop<span className="shop-detail"> & reroll</span>
        </span>{' '}
        <ChevronRight size={15} />
      </button>
      {run.rewardTaken && (
        <button className="start-button" disabled={!ready} onClick={onContinue}>
          CONTINUE <MoveRight size={20} />
        </button>
      )}
    </div>
  );
}

/** The between-events stop: take a perk, optionally shop, then continue. */
export function PitStop({
  run,
  route,
  build,
  ready,
  shopping,
  shopRef,
  onChooseOffer,
  onToggleShopping,
  onInsurance,
  onReroll,
  onContinue,
}: {
  run: RunState;
  route: Route;
  build: string[];
  ready: boolean;
  shopping: boolean;
  shopRef: RefObject<HTMLDivElement | null>;
  onChooseOffer: (id: string, trigger: HTMLButtonElement) => void;
  onToggleShopping: () => void;
  onInsurance: () => void;
  onReroll: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="planning-screen pitstop">
      <div className="pitstop-content">
        <div className="event-heading">
          <span className="eyebrow">
            {run.stage + 1} / {route?.events} COMPLETE
          </span>
          <h2>{run.rewardTaken ? 'Ready to roll?' : 'Pick a perk'}</h2>
          <CampaignRoute run={run} />
        </div>
        <div className="relic-offers">
          {run.offers.map((id) => (
            <RelicOffer
              key={id}
              run={run}
              id={id}
              build={build}
              onChoose={onChooseOffer}
            />
          ))}
        </div>
        <div className="equipped-perks" aria-label="Equipped upgrades">
          <span>Equipped</span>
          {build.map((id) => (
            <span key={id} title={relicById(id).description}>
              <img src={relicArt(id)} alt="" width={26} height={26} />
              <span className="equipped-name">{relicById(id).name}</span>
            </span>
          ))}
        </div>
        {shopping && (
          <PitStopShop
            run={run}
            shopRef={shopRef}
            onInsurance={onInsurance}
            onReroll={onReroll}
          />
        )}
      </div>
      <PitStopTools
        run={run}
        ready={ready}
        shopping={shopping}
        onToggleShopping={onToggleShopping}
        onContinue={onContinue}
      />
    </div>
  );
}
