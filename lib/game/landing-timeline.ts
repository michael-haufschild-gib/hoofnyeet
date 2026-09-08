import type { LandingId } from './simulation';

const CONTACT: Record<LandingId, number> = {
  haystack: 0.8,
  mud: 0.9,
  accordion: 0.85,
  cartwheel: 0.4,
  fence: 0.65,
  sheep: 0.7,
  ballet: 1.25,
  dignified: 2.05,
};
export const REPLAY_RATE = 0.5;
export function landingTimeline(id: LandingId) {
  const impact = CONTACT[id];
  return {
    impact,
    secondary: impact + 1.45,
    ghost: impact + 1.85,
    secondImpact: impact + 2.8,
    end: impact + 4.1,
    freeze: 0.085,
    replayStart: Math.max(0, impact - 0.4),
    replayEnd: impact + 1.2,
  };
}
export function replayDuration(id: LandingId) {
  const t = landingTimeline(id);
  return (t.replayEnd - t.replayStart) / REPLAY_RATE;
}

/** Reactive endings share the crash clock but have distinct visual consequences. */
export const AFTERMATHS: Record<
  LandingId,
  { warning: string; arrival: string; verdict: string; sound: string }
> = {
  haystack: {
    warning: 'THE PARCEL HAS LEARNED TO WALK.',
    arrival: 'FREE-RANGE. BOXED. SLIGHTLY CONFUSED.',
    verdict: 'BACK IN THE BOX. NOW WITH EXTRA LEGS.',
    sound: 'baler',
  },
  mud: {
    warning: 'PREMIUM RESCUE IS ON ITS WAY.',
    arrival: 'SAME-DAY DELIVERY. DIFFERENT-DAY SPINE.',
    verdict: 'DELIVERY FEE: ONE SPINE. TIP NOT INCLUDED.',
    sound: 'honk',
  },
  accordion: {
    warning: 'YOUR SKELETON HAS ATTRACTED AN INVESTOR.',
    arrival: 'PLEASE SEPARATE YOUR BONES FOR RECYCLING.',
    verdict: 'RECYCLING HAS REJECTED YOU.',
    sound: 'ufo',
  },
  cartwheel: {
    warning: 'THE AUDIENCE HAS REQUESTED AN ENCORE.',
    arrival: 'YOU ARE NOW IN B FLAT.',
    verdict: 'THE ENCORE WAS ALSO A PIANO.',
    sound: 'piano',
  },
  fence: {
    warning: 'DIGNITY: DELICATE WASH.',
    arrival: 'PLEASE DO NOT TUMBLE-DRY THE HORSE.',
    verdict: 'THE CARE LABEL WAS A SUGGESTION.',
    sound: 'woodbreak',
  },
  sheep: {
    warning: 'MANAGEMENT HAS FOUND YOUR REPLACEMENT.',
    arrival: 'THE SHEEP WOULD LIKE YOUR LOCKER KEY.',
    verdict: 'TEMPORARY HORSE. PERMANENT SHEEP.',
    sound: 'sheep',
  },
  ballet: {
    warning: 'A PERFECT TEN FROM THE GOOSE JURY!',
    arrival: 'PRIMA BALLERINA. MINOR STRUCTURAL DAMAGE.',
    verdict: 'THE JUDGES HAVE REMOVED YOUR POINTES.',
    sound: 'metalcrash',
  },
  dignified: {
    warning: 'FINALLY. AN ATHLETE WITH SOME DIGNITY.',
    arrival: 'FINALLY, SOME PEACE AND—',
    verdict: 'RETURN TO SENDER. POSTAGE DUE.',
    sound: 'metalcrash',
  },
};
