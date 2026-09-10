#!/usr/bin/env node
/**
 * Guards the lint configuration against being weakened.
 *
 * Every other check in this repository can be turned off by editing one file.
 * The cheapest way to make a failing build pass is to lower a limit, downgrade
 * a rule to "warn", drop a lint root, or leave a disable comment — each of
 * which deletes the signal instead of the defect. This script fails when any
 * of that has happened, so weakening a gate is a deliberate, reviewed edit to
 * the expectations below rather than a quiet change to `.oxlintrc.json`.
 *
 * It also re-checks for suppression comments outside oxlint, because a
 * suppression comment can otherwise silence `hoof/no-lint-suppression` itself.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

/**
 * `--root <dir>` points the checks at a fixture tree. It exists so
 * `lint-rules/lint-scripts.test.js` can prove each failure fires, and
 * `checkLintScript` below rejects a `lint` script that passes it, so it cannot
 * become a way to run this check against a directory that has nothing to find.
 */
const repoRoot = rootFromArgv(process.argv.slice(2));

function rootFromArgv(args) {
  const index = args.indexOf('--root');
  if (index === -1) return defaultRoot;
  const value = args[index + 1];
  if (!value) throw new Error('--root requires a directory argument');
  return resolve(value);
}

/** The floor for every gate. A limit may be tightened here, never loosened. */
const EXPECTED_RULES = {
  'max-lines': { severity: 'error', max: 500 },
  'max-lines-per-function': { severity: 'error', max: 85 },
  'max-depth': { severity: 'error', max: 4 },
  'max-nested-callbacks': { severity: 'error', max: 4 },
  'hoof/cognitive-complexity': { severity: 'error', max: 10 },
  'hoof/no-commented-out-code': { severity: 'error' },
  'hoof/no-deferred-work-comments': { severity: 'error' },
  'hoof/no-disabled-tests': { severity: 'error' },
  'hoof/no-lint-suppression': { severity: 'error' },
  'hoof/no-redundant-comment': { severity: 'error' },
  'hoof/no-shallow-assertions': { severity: 'error' },
  'hoof/no-snapshot-assertions': { severity: 'error' },
  'hoof/require-test-assertion': { severity: 'error' },
  'hoof/require-test-description': { severity: 'error' },
  'hoof/require-tsdoc': { severity: 'error' },
  'no-console': { severity: 'error' },
  'typescript/no-explicit-any': { severity: 'error' },
};

/**
 * File patterns an `overrides` block may target.
 *
 * An override is how a rule gets relaxed for a whole file class, which is
 * legitimate for tests and tooling and is not legitimate as a way to exempt
 * product code. Without this list, `{ "files": ["**"], "rules": { ... "off" } }`
 * would turn every gate above off while leaving the `rules` block intact.
 */
const ALLOWED_OVERRIDE_PATTERNS = new Set([
  'tests/**',
  'lint-rules/**',
  'scripts/**',
  '*.config.ts',
  '*.config.mjs',
]);

/** Trees the `lint` script must keep passing to oxlint. */
const REQUIRED_LINT_ROOTS = ['app', 'lib', 'tests', 'scripts', 'lint-rules'];

/** Commands the `lint` script must keep running. */
const REQUIRED_LINT_STEPS = [
  'oxlint',
  'scripts/lint/lint-folder-structure.mjs',
  'scripts/lint/lint-config-integrity.mjs',
];

const SUPPRESSION_PATTERNS = [
  /\boxlint-(?:disable|enable)(?:-next-line|-line)?\b/,
  /\beslint-(?:disable|enable)(?:-next-line|-line)?\b/,
  /\bbiome-ignore\b/,
  /@ts-ignore\b/,
  /@ts-nocheck\b/,
  /@ts-expect-error\b/,
  /\b(?:istanbul|c8|v8)\s+ignore\b/,
];

/**
 * The one file allowed to contain the patterns: the rule that bans them has to
 * spell them out to match them.
 */
const SUPPRESSION_SCAN_EXCEPTIONS = new Set([
  // The rule that bans these patterns has to spell them out to match them.
  'lint-rules/suppression-rules.js',
  // This file, for the same reason.
  'scripts/lint/lint-config-integrity.mjs',
  // Its fixtures are suppression directives inside string literals, which is
  // what proves the rule fires on them. A real directive here would still be a
  // comment, so oxlint's `hoof/no-lint-suppression` catches it in this file.
  'lint-rules/comment-rules.test.js',
]);

const SCANNED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const IGNORED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'logs',
]);

const failures = [
  ...checkOxlintConfig(),
  ...checkOverrides(),
  ...checkLintScript(),
  ...checkForSuppressions(),
];

if (failures.length > 0) {
  process.stderr.write(
    `Lint configuration integrity check failed (${failures.length} problem${
      failures.length === 1 ? '' : 's'
    }):\n\n${failures.map((line) => `- ${line}`).join('\n\n')}\n\n` +
      'These gates exist to catch defects. Weakening one hides the defect instead of fixing it. ' +
      'If a limit is genuinely wrong for this codebase, change it here and in `.oxlintrc.json` ' +
      'in a single commit whose message explains why the old value was wrong.\n',
  );
  process.exit(1);
}

process.stdout.write(
  `Lint configuration integrity check passed: ${Object.keys(EXPECTED_RULES).length} rules at ` +
    'their required severity and limits, lint roots intact, no suppression comments.\n',
);

/** Reads a JSON file from the repository root, failing with the path when absent. */
function readJson(relativePath) {
  const full = resolve(repoRoot, relativePath);
  try {
    return JSON.parse(readFileSync(full, 'utf8'));
  } catch (error) {
    process.stderr.write(
      `Lint configuration integrity check could not read ${full}: ${error.message}\n`,
    );
    process.exit(1);
  }
}

/** Reads the severity out of `"error"` or `["error", options]`. */
function severityOf(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

/** Reads the `max` option out of `["error", { max }]`, or null when absent. */
function maxOf(entry) {
  if (!Array.isArray(entry)) return null;
  const options = entry[1];
  return typeof options?.max === 'number' ? options.max : null;
}

/** Reports a gate that is absent from the configuration entirely. */
function missingRuleProblem(name, expected) {
  const withMax =
    expected.max === undefined ? '' : ` with { "max": ${expected.max} }`;
  return (
    `\`.oxlintrc.json\` no longer configures \`${name}\`. ` +
    `Restore it at severity "${expected.severity}"${withMax}.`
  );
}

/** Reports a gate whose severity no longer fails the build. */
function severityProblem(name, expected, severity) {
  return (
    `\`${name}\` is set to "${severity}" in \`.oxlintrc.json\`; it must be "${expected.severity}". ` +
    'A downgraded rule still prints but no longer fails the build, so it stops being a gate.'
  );
}

/** Reports a numeric limit that is missing or has been raised. */
function limitProblems(name, expected, entry) {
  if (expected.max === undefined) return [];
  const max = maxOf(entry);
  if (max === null) {
    return [
      `\`${name}\` lost its { "max": ${expected.max} } option in \`.oxlintrc.json\`.`,
    ];
  }
  if (max <= expected.max) return [];
  return [
    `\`${name}\` allows ${max} in \`.oxlintrc.json\`; the agreed limit is ${expected.max}. ` +
      'Split the code that failed instead of raising the ceiling.',
  ];
}

/** Checks one gate against its expectation. */
function ruleProblems(name, expected, entry) {
  if (entry === undefined) return [missingRuleProblem(name, expected)];
  const severity = severityOf(entry);
  const problems =
    severity === expected.severity
      ? []
      : [severityProblem(name, expected, severity)];
  return [...problems, ...limitProblems(name, expected, entry)];
}

/** Verifies every gate is present, at error severity, and no looser than required. */
function checkOxlintConfig() {
  const config = readJson('.oxlintrc.json');
  const rules = config.rules ?? {};
  const problems = Object.entries(EXPECTED_RULES).flatMap(([name, expected]) =>
    ruleProblems(name, expected, rules[name]),
  );

  if (!config.jsPlugins?.includes('./lint-rules/index.js')) {
    problems.push(
      '`.oxlintrc.json` no longer loads `./lint-rules/index.js` through `jsPlugins`, so every ' +
        '`hoof/*` rule is silently inert. Restore the entry.',
    );
  }

  return problems;
}

/** Verifies the `lint` script still runs every check over every source root. */
function checkLintScript() {
  const script = readJson('package.json').scripts?.lint ?? '';
  const problems = [];

  for (const step of REQUIRED_LINT_STEPS) {
    if (script.includes(step)) continue;
    problems.push(
      `The \`lint\` script in \`package.json\` no longer runs \`${step}\`. ` +
        'A check that is not wired into `pnpm lint` does not run in CI.',
    );
  }

  if (script.includes('--root')) {
    problems.push(
      'The `lint` script in `package.json` passes `--root` to a lint script. That flag exists only ' +
        'for the tests in `lint-rules/lint-scripts.test.js`; in `pnpm lint` it would point a check ' +
        'at a directory chosen to have nothing to find.',
    );
  }

  const oxlintArguments = oxlintArgumentsOf(script);
  for (const root of REQUIRED_LINT_ROOTS) {
    if (oxlintArguments.includes(root)) continue;
    problems.push(
      `The \`lint\` script in \`package.json\` no longer passes \`${root}\` to oxlint, ` +
        'so that tree is unlinted.',
    );
  }

  return problems;
}

/** Verifies no `overrides` block relaxes the gates for a tree it should not reach. */
function checkOverrides() {
  const overrides = readJson('.oxlintrc.json').overrides ?? [];
  const problems = [];
  for (const override of overrides) {
    for (const pattern of override.files ?? []) {
      if (ALLOWED_OVERRIDE_PATTERNS.has(pattern)) continue;
      problems.push(
        `\`.oxlintrc.json\` has an \`overrides\` block targeting \`${pattern}\`, which is not in the ` +
          `allowed set (${[...ALLOWED_OVERRIDE_PATTERNS].join(', ')}). An override reaching product code ` +
          'turns the gates off for it. Fix the code the override was added for, or add the pattern here ' +
          'in a commit that explains which rule is wrong for that file class and why.',
      );
    }
  }
  return problems;
}

/**
 * Extracts the arguments of the `oxlint` command inside the `lint` script.
 *
 * Searching the whole script for a root name is not enough: every root name
 * also appears in the paths of the scripts the same line runs, so removing
 * `scripts` from the oxlint arguments went undetected while
 * `scripts/lint/lint-folder-structure.mjs` was still on the line.
 */
function oxlintArgumentsOf(script) {
  const match =
    /(?:^|&&|\|\||;)\s*(?:pnpm\s+(?:exec\s+)?|npx\s+)?oxlint\s+([^&|;]*)/.exec(
      script,
    );
  if (!match) return [];
  return match[1].trim().split(/\s+/).filter(Boolean);
}

/** Scans the source trees for suppression comments, independently of oxlint. */
function checkForSuppressions() {
  const problems = [];
  for (const root of REQUIRED_LINT_ROOTS) {
    for (const file of walkSourceFiles(resolve(repoRoot, root))) {
      const relativePath = relative(repoRoot, file);
      if (SUPPRESSION_SCAN_EXCEPTIONS.has(relativePath)) continue;
      problems.push(...scanFileForSuppressions(file, relativePath));
    }
  }
  return problems;
}

/** Reports every suppression directive in one file, with its line number. */
function scanFileForSuppressions(file, relativePath) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const problems = [];
  lines.forEach((line, index) => {
    if (!SUPPRESSION_PATTERNS.some((pattern) => pattern.test(line))) return;
    problems.push(
      `${relativePath}:${index + 1} contains a lint or type-check suppression: ${line.trim().slice(0, 100)}\n` +
        '  Fix the underlying code. Suppressing a check leaves the defect in place and removes the warning about it.',
    );
  });
  return problems;
}

/** Yields every source file under a directory. */
function* walkSourceFiles(directory) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      yield* walkSourceFiles(full);
    } else if (entry.isFile() && SCANNED_EXTENSIONS.has(extname(entry.name))) {
      yield full;
    }
  }
}
