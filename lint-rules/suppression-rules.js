/**
 * Bans every in-file escape hatch from the lint and type checks.
 *
 * A suppression comment turns a red build green without changing the defect it
 * hides, and it is the single cheapest thing for an automated agent to reach
 * for when a rule fires. Removing the escape hatch is what makes the rest of
 * these rules load-bearing rather than advisory.
 *
 * `scripts/lint/lint-config-integrity.mjs` repeats this check outside the
 * linter, because a suppression comment can otherwise disable the rule that
 * bans suppression comments.
 */

const SUPPRESSION_PATTERNS = [
  {
    pattern: /\boxlint-(?:disable|enable)(?:-next-line|-line)?\b/,
    label: 'oxlint-disable',
    fix: 'Fix the reported code. If the rule is genuinely wrong for a whole file class, change `.oxlintrc.json` `overrides` in a reviewed commit that states why.',
  },
  {
    pattern: /\beslint-(?:disable|enable)(?:-next-line|-line)?\b/,
    label: 'eslint-disable',
    fix: 'This repository lints with oxlint. Remove the directive and fix the code.',
  },
  {
    pattern: /\bbiome-ignore\b/,
    label: 'biome-ignore',
    fix: 'This repository lints with oxlint. Remove the directive and fix the code.',
  },
  {
    pattern: /@ts-ignore\b/,
    label: '@ts-ignore',
    fix: 'Narrow the type, add the missing declaration, or model the value properly. A silenced type error is a runtime crash with the warning deleted.',
  },
  {
    pattern: /@ts-nocheck\b/,
    label: '@ts-nocheck',
    fix: 'Type the file. Disabling the checker for a whole file removes every guarantee the rest of the codebase relies on.',
  },
  {
    pattern: /@ts-expect-error\b/,
    label: '@ts-expect-error',
    fix: 'Model the value so the error disappears on its own. If a third-party type is wrong, add a typed wrapper instead of suppressing at the call site.',
  },
  {
    pattern: /\b(?:istanbul|c8|v8)\s+ignore\b/,
    label: 'coverage ignore',
    fix: 'Cover the branch with a test, or delete the unreachable code.',
  },
];

export const noLintSuppression = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban lint and type-check suppression comments so the checks cannot be silenced per line.',
    },
    schema: [],
    messages: {
      banned:
        'Suppression comment "{{label}}" is banned. {{fix}} ' +
        'Never silence a rule to make a build pass — that hides the defect the rule found.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          for (const { pattern, label, fix } of SUPPRESSION_PATTERNS) {
            if (!pattern.test(comment.value)) continue;
            context.report({
              loc: comment.loc,
              messageId: 'banned',
              data: { label, fix },
            });
            break;
          }
        }
      },
    };
  },
};
