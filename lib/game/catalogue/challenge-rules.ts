import type { Modifiers } from '../content';

/**
 * The tour rule sets, in unlock order. `wins` is the number of completed tours
 * a save needs before the rule may be chosen; `detail` and `requirement` are
 * display copy.
 */
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
/** Identifier of one CHALLENGE_RULES entry, as stored in a save or link. */
export type ChallengeRule = (typeof CHALLENGE_RULES)[number]['id'];
/**
 * Narrows an untrusted value, such as a stored save field or a shared link
 * segment, to a rule this build still offers.
 */
export function isChallengeRule(id: unknown): id is ChallengeRule {
  return CHALLENGE_RULES.some((rule) => rule.id === id);
}
/**
 * True when a save's completed-tour count reaches the rule's threshold. The id
 * must already be a known rule or the lookup throws, so guard untrusted values
 * with isChallengeRule first.
 */
export function challengeUnlocked(id: ChallengeRule, wins: number) {
  return wins >= CHALLENGE_RULES.find((rule) => rule.id === id)!.wins;
}
/**
 * The run modifiers with the rule's restriction folded in: the one-flap rule
 * caps the flap allowance at one, whatever the equipment grants. Returns a
 * copy and leaves the input untouched.
 */
export function applyChallenge(mod: Modifiers, rule: ChallengeRule): Modifiers {
  return { ...mod, maxFlaps: rule === 'one-flap' ? 1 : mod.maxFlaps };
}
/**
 * The most insurance stamps a run may hold at once: one for the whole tour
 * under the uninsured rule, three otherwise.
 */
export function insuranceCapacity(rule: ChallengeRule) {
  return rule === 'uninsured' ? 1 : 3;
}
