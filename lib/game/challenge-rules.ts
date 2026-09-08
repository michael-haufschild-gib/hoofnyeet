import type { Modifiers } from './content';

export const CHALLENGE_RULES = [
  {
    id: 'standard',
    name: 'Standard chaos',
    detail: 'Three insurance stamps. All the panic flaps you can find.',
    wins: 0,
    requirement: 'Always available',
  },
  {
    id: 'one-flap',
    name: 'One-winged wonder',
    detail: 'One panic flap per event, even with extra-flap equipment.',
    wins: 1,
    requirement: 'Complete one tour',
  },
  {
    id: 'uninsured',
    name: 'Read the small print',
    detail: 'One insurance stamp for the entire tour. No replacements.',
    wins: 2,
    requirement: 'Complete two tours',
  },
] as const;
export type ChallengeRule = (typeof CHALLENGE_RULES)[number]['id'];
export function isChallengeRule(id: unknown): id is ChallengeRule {
  return CHALLENGE_RULES.some((rule) => rule.id === id);
}
export function challengeUnlocked(id: ChallengeRule, wins: number) {
  return wins >= CHALLENGE_RULES.find((rule) => rule.id === id)!.wins;
}
export function applyChallenge(mod: Modifiers, rule: ChallengeRule): Modifiers {
  return { ...mod, maxFlaps: rule === 'one-flap' ? 1 : mod.maxFlaps };
}
export function insuranceCapacity(rule: ChallengeRule) {
  return rule === 'uninsured' ? 1 : 3;
}
