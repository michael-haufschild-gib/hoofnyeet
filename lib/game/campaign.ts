import { WORLDS, type WorldId } from './content';

/**
 * The two tour lengths a player can enter. `events` is the number of attempts
 * that must be cleared to win, `legs` the number of world choices along the
 * way (three events per leg), and `detail` the one-line summary the menu shows.
 */
export const CAMPAIGNS = {
  classic: {
    name: 'Classic Tour',
    events: 9,
    legs: 3,
    detail: '9 events · 3 bosses',
  },
  grand: {
    name: 'Grand Tour',
    events: 18,
    legs: 6,
    detail: '18 events · all 6 worlds',
  },
} as const;

/** Save-stable key of a tour length, persisted in runs and share links. */
export type Campaign = keyof typeof CAMPAIGNS;

/** Narrows untrusted stored or URL-supplied data to a known tour length. */
export function isCampaign(value: unknown): value is Campaign {
  return value === 'classic' || value === 'grand';
}

/**
 * The slice of a run this module reads. `stage` counts cleared events from 0,
 * and `route` records the world played at each stage index.
 */
export interface CampaignState {
  campaign?: Campaign;
  mode: string;
  stage: number;
  route: readonly WorldId[];
}

/** Resolves the tour length actually in force; only tour mode may run Grand. */
export function campaignOf(
  run: Pick<CampaignState, 'mode' | 'campaign'>,
): Campaign {
  return run.mode === 'tour' && run.campaign === 'grand' ? 'grand' : 'classic';
}

/**
 * Where the run currently stands: the zero-based `leg` and difficulty `act`,
 * the `eventInLeg` position 0-2, the total `events` needed to win, and whether
 * this event is a `boss`. Quick play is always a single non-boss event.
 */
export function campaignStep(
  run: Pick<CampaignState, 'mode' | 'campaign' | 'stage'>,
) {
  const campaign = campaignOf(run),
    leg = Math.floor(run.stage / 3);
  return {
    campaign,
    leg,
    act: campaign === 'grand' ? Math.floor(leg / 2) : leg,
    legs: CAMPAIGNS[campaign].legs,
    events: run.mode === 'quick' ? 1 : CAMPAIGNS[campaign].events,
    eventInLeg: run.stage % 3,
    boss: run.mode !== 'quick' && run.stage % 3 === 2,
  };
}
/** Grand Tour visits the chosen world first, then its partner. The route already
 * records every attempt's world, so no second route or shuffle state is needed. */
export function campaignWorlds(run: CampaignState) {
  const { campaign, leg, act } = campaignStep(run);
  const pair = WORLDS.filter((w) => w.act === act);
  if (campaign === 'classic') return pair;
  const chosen = run.route[leg * 3];
  if (chosen) return pair.filter((w) => w.id === chosen);
  if (leg % 2 === 1) {
    const first = run.route[(leg - 1) * 3];
    return pair.filter((w) => w.id !== first);
  }
  return pair;
}

/**
 * True when every recorded world belongs to the act its stage falls in, stays
 * constant across the three events of a leg, and — on Grand Tour — differs
 * from the world played in the paired leg before it. Rejects tampered saves.
 */
export function validCampaignRoute(run: CampaignState) {
  const { campaign } = campaignStep(run);
  return run.route.every((world, stage) => {
    const { act, leg } = campaignStep({ ...run, stage });
    if (!WORLDS.some((w) => w.id === world && w.act === act)) return false;
    if (campaign === 'classic') return true;
    if (world !== run.route[leg * 3]) return false;
    return leg % 2 === 0 || world !== run.route[(leg - 1) * 3];
  });
}

/** Difficulty tier a leg belongs to; Grand Tour spends two legs per act. */
function itineraryAct(campaign: Campaign, leg: number): number {
  return campaign === 'grand' ? Math.floor(leg / 2) : leg;
}

/**
 * World a leg will be played on, or undefined while it is still undecided.
 * A leg the player has already entered reports its recorded world. The second
 * half of a Grand Tour act is forced to the partner of the world played in the
 * first half, so it can be shown before the player arrives there.
 */
function itineraryWorld(
  run: CampaignState,
  campaign: Campaign,
  leg: number,
  act: number,
): WorldId {
  const chosen = run.route[leg * 3];
  if (chosen || campaign !== 'grand' || leg % 2 === 0) return chosen;
  const first = run.route[(leg - 1) * 3];
  return first
    ? WORLDS.find((w) => w.act === act && w.id !== first)!.id
    : chosen;
}

/** Where a leg sits relative to the leg being played, for the route display. */
function itineraryState(leg: number, current: number) {
  if (leg < current) return 'done';
  return leg === current ? 'current' : 'next';
}

/**
 * One entry per leg of the tour, in play order, for the route map: the leg
 * index, its act, the world it is or will be played on, and its progress
 * state. Read-only — it neither chooses worlds nor advances the run.
 */
export function campaignItinerary(run: CampaignState) {
  const current = campaignStep(run);
  return Array.from({ length: current.legs }, (_, leg) => {
    const act = itineraryAct(current.campaign, leg);
    return {
      leg,
      act,
      world: itineraryWorld(run, current.campaign, leg, act),
      state: itineraryState(leg, current.leg),
    };
  });
}
