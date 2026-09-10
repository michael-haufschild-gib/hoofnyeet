/**
 * Harness for the custom lint rule tests.
 *
 * The rules are exercised through oxlint itself rather than by calling
 * `create()` with a hand-built context. A rule that passes a mocked context but
 * never fires under the real linter is worse than no rule at all, and the
 * plugin API is alpha, so the integration is exactly the part worth pinning.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginPath = join(repoRoot, 'lint-rules', 'index.js');
const oxlintPath = join(repoRoot, 'node_modules', '.bin', 'oxlint');

const ALL_RULES = {
  'hoof/cognitive-complexity': ['error', { max: 10 }],
  'hoof/no-commented-out-code': 'error',
  'hoof/no-deferred-work-comments': 'error',
  'hoof/no-disabled-tests': 'error',
  'hoof/no-lint-suppression': 'error',
  'hoof/no-redundant-comment': 'error',
  'hoof/no-shallow-assertions': 'error',
  'hoof/no-snapshot-assertions': 'error',
  'hoof/require-test-assertion': 'error',
  'hoof/require-test-description': 'error',
  'hoof/require-tsdoc': 'error',
};

/**
 * Lints a set of in-memory files and returns the diagnostics the custom rules
 * produced, as `{ rule, line, message }` sorted by line.
 *
 * `files` maps a file name to its source. Names ending in `.test.ts` are seen
 * by the rules as test files; every other name is seen as product source.
 * `ruleOverrides` replaces entries in the default rule set, so a test can pin a
 * threshold without depending on the repository's configured value.
 */
export function lintFixture(files, ruleOverrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'hoof-lint-rules-'));
  try {
    writeFileSync(
      join(directory, '.oxlintrc.json'),
      JSON.stringify({
        plugins: ['eslint'],
        categories: {},
        jsPlugins: [pluginPath],
        rules: { ...ALL_RULES, ...ruleOverrides },
      }),
    );
    const names = Object.keys(files);
    for (const name of names) {
      const full = join(directory, name);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, files[name]);
    }
    return runOxlint(directory, names);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Runs oxlint over the fixture directory and normalises its JSON report. */
function runOxlint(directory, names) {
  // oxlint exits non-zero whenever it reports anything, which is the normal
  // case here, so the report is read off the thrown error as well.
  let output;
  try {
    output = execFileSync(
      oxlintPath,
      ['-c', join(directory, '.oxlintrc.json'), '-f', 'json', ...names],
      { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    if (typeof error.stdout !== 'string') throw error;
    output = error.stdout;
  }
  const report = JSON.parse(output);
  const parseErrors = report.diagnostics.filter(
    (diagnostic) => !diagnostic.code,
  );
  if (parseErrors.length > 0) {
    throw new Error(
      `Fixture did not parse: ${parseErrors.map((entry) => entry.message).join('; ')}`,
    );
  }
  return report.diagnostics
    .filter((diagnostic) => diagnostic.code.startsWith('hoof('))
    .map((diagnostic) => ({
      rule: diagnostic.code.slice('hoof('.length, -1),
      line: diagnostic.labels[0]?.span.line ?? 0,
      message: diagnostic.message,
    }))
    .sort((left, right) => left.line - right.line);
}

/** Returns every diagnostic one rule produced, for assertions on line numbers. */
export function diagnosticsFor(diagnostics, rule) {
  return diagnostics.filter((diagnostic) => diagnostic.rule === rule);
}
