/**
 * Tests for the two standalone lint scripts.
 *
 * Both are guardrails that only ever run in the failure case, so the thing
 * worth pinning is that each failure actually fires — a folder over budget, a
 * downgraded rule, a raised limit, an unwired root, a suppression comment — and
 * that each message names what to change.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const folderScript = join(
  repoRoot,
  'scripts',
  'lint',
  'lint-folder-structure.mjs',
);
const integrityScript = join(
  repoRoot,
  'scripts',
  'lint',
  'lint-config-integrity.mjs',
);

const REQUIRED_LINT_ROOTS = ['app', 'lib', 'tests', 'scripts', 'lint-rules'];

/** Runs a script and returns its exit code together with everything it printed. */
function runScript(script, args) {
  try {
    const stdout = execFileSync('node', [script, ...args], {
      encoding: 'utf8',
    });
    return { code: 0, output: stdout };
  } catch (error) {
    return {
      code: error.status,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

/** Creates a throwaway directory and removes it once the callback returns. */
function withTempDirectory(run) {
  const directory = mkdtempSync(join(tmpdir(), 'hoof-lint-scripts-'));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Writes `count` source files into a folder, creating it if needed. */
function writeSourceFiles(folder, count, extension = '.ts') {
  mkdirSync(folder, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    writeFileSync(
      join(folder, `module-${index}${extension}`),
      'export const value = 1;\n',
    );
  }
}

void test('a folder holding exactly the maximum number of source files is accepted', () => {
  withTempDirectory((directory) => {
    writeSourceFiles(join(directory, 'src'), 20);
    const result = runScript(folderScript, [join(directory, 'src')]);
    assert.equal(result.code, 0);
    assert.match(result.output, /Folder structure lint passed/);
  });
});

void test('a folder one file over the maximum fails and the message names the count and the fix', () => {
  withTempDirectory((directory) => {
    writeSourceFiles(join(directory, 'src'), 21);
    const result = runScript(folderScript, [join(directory, 'src')]);
    assert.equal(result.code, 1);
    assert.match(result.output, /src holds 21 source files \(max 20\)/);
    assert.match(result.output, /named subfolder/);
    assert.match(result.output, /Do not raise the limit/);
  });
});

void test('files that are not source, such as JSON and Markdown, do not count toward the budget', () => {
  withTempDirectory((directory) => {
    const folder = join(directory, 'src');
    writeSourceFiles(folder, 20);
    writeSourceFiles(folder, 15, '.json');
    writeSourceFiles(folder, 15, '.md');
    assert.equal(runScript(folderScript, [folder]).code, 0);
  });
});

void test('each nested folder carries its own budget rather than being pooled with its parent', () => {
  withTempDirectory((directory) => {
    writeSourceFiles(join(directory, 'src'), 15);
    writeSourceFiles(join(directory, 'src', 'effects'), 25);
    const result = runScript(folderScript, [join(directory, 'src')]);
    assert.equal(result.code, 1);
    assert.match(result.output, /effects holds 25 source files/);
    assert.equal(/1 folder exceed/.test(result.output), true);
  });
});

void test('build output and dependency folders are skipped so vendored code cannot fail the build', () => {
  withTempDirectory((directory) => {
    writeSourceFiles(join(directory, 'src'), 5);
    writeSourceFiles(join(directory, 'src', 'node_modules'), 40);
    writeSourceFiles(join(directory, 'src', 'dist'), 40);
    assert.equal(runScript(folderScript, [join(directory, 'src')]).code, 0);
  });
});

/** Builds a fixture repository whose configuration satisfies every gate. */
function writeIntegrityFixture(
  directory,
  { rules = {}, lintScript, jsPlugins } = {},
) {
  const baseRules = {
    'max-lines': ['error', { max: 500 }],
    'max-lines-per-function': ['error', { max: 85 }],
    'max-depth': ['error', { max: 4 }],
    'max-nested-callbacks': ['error', { max: 4 }],
    'hoof/cognitive-complexity': ['error', { max: 10 }],
    'no-console': 'error',
    'typescript/no-explicit-any': 'error',
  };
  for (const name of [
    'no-commented-out-code',
    'no-deferred-work-comments',
    'no-disabled-tests',
    'no-lint-suppression',
    'no-redundant-comment',
    'no-shallow-assertions',
    'no-snapshot-assertions',
    'require-test-assertion',
    'require-test-description',
    'require-tsdoc',
  ]) {
    baseRules[`hoof/${name}`] = 'error';
  }
  writeFileSync(
    join(directory, '.oxlintrc.json'),
    JSON.stringify({
      jsPlugins: jsPlugins ?? ['./lint-rules/index.js'],
      rules: { ...baseRules, ...rules },
    }),
  );
  writeFileSync(
    join(directory, 'package.json'),
    JSON.stringify({
      scripts: {
        lint:
          lintScript ??
          `oxlint ${REQUIRED_LINT_ROOTS.join(' ')} && node scripts/lint/lint-folder-structure.mjs` +
            ' && node scripts/lint/lint-config-integrity.mjs',
      },
    }),
  );
  for (const root of REQUIRED_LINT_ROOTS)
    mkdirSync(join(directory, root), { recursive: true });
}

/** Runs the integrity check against a fixture repository. */
function checkIntegrity(directory) {
  return runScript(integrityScript, ['--root', directory]);
}

void test('a configuration that meets every expectation passes with a summary of what was checked', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory);
    const result = checkIntegrity(directory);
    assert.equal(result.code, 0);
    assert.match(result.output, /integrity check passed/);
  });
});

void test('downgrading a rule from error to warn fails and the message names both severities', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, {
      rules: { 'hoof/no-shallow-assertions': 'warn' },
    });
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(
      result.output,
      /`hoof\/no-shallow-assertions` is set to "warn".*must be "error"/s,
    );
    assert.match(result.output, /stops being a gate/);
  });
});

void test('raising a numeric limit fails and the message names the found value and the agreed one', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, {
      rules: { 'max-lines': ['error', { max: 5000 }] },
    });
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(
      result.output,
      /`max-lines` allows 5000.*the agreed limit is 500/s,
    );
    assert.match(
      result.output,
      /Split the code that failed instead of raising the ceiling/,
    );
  });
});

void test('tightening a numeric limit below the agreed value is accepted rather than reported', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, {
      rules: { 'max-lines': ['error', { max: 300 }] },
    });
    assert.equal(checkIntegrity(directory).code, 0);
  });
});

void test('deleting a rule outright is caught, not only weakening one that is still present', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, {
      rules: { 'hoof/require-tsdoc': undefined },
    });
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(result.output, /no longer configures `hoof\/require-tsdoc`/);
  });
});

void test('unloading the custom plugin is caught, because it would make every hoof rule inert', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, { jsPlugins: [] });
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(result.output, /no longer loads `\.\/lint-rules\/index\.js`/);
  });
});

void test('dropping a source tree from the lint script is reported as that tree being unlinted', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, {
      lintScript:
        'oxlint app lib tests && node scripts/lint/lint-folder-structure.mjs' +
        ' && node scripts/lint/lint-config-integrity.mjs',
    });
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(result.output, /no longer passes `scripts` to oxlint/);
    assert.match(result.output, /no longer passes `lint-rules` to oxlint/);
  });
});

void test('pointing the integrity check at a fixture tree from the lint script is itself reported', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory, {
      lintScript:
        `oxlint ${REQUIRED_LINT_ROOTS.join(' ')} && node scripts/lint/lint-folder-structure.mjs` +
        ' && node scripts/lint/lint-config-integrity.mjs --root /tmp/empty',
    });
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(result.output, /passes `--root` to a lint script/);
  });
});

void test('a suppression comment is found by the standalone scan even though oxlint would honour it', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory);
    // Assembled at runtime: a literal directive here would be found by this
    // very scan when it runs over the repository's own `lint-rules` tree.
    const directive = `// @ts${'-ignore'}`;
    const disable = `// oxlint-${'disable'}-next-line hoof/no-lint-suppression`;
    writeFileSync(
      join(directory, 'lib', 'thing.ts'),
      `${disable}\n${directive}\nexport const a = 1;\n`,
    );
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(
      result.output,
      /lib\/thing\.ts:1 contains a lint or type-check suppression/,
    );
    assert.match(
      result.output,
      /lib\/thing\.ts:2 contains a lint or type-check suppression/,
    );
  });
});

void test('an overrides block reaching outside the allowed file classes is reported as a bypass', () => {
  withTempDirectory((directory) => {
    writeIntegrityFixture(directory);
    const config = JSON.parse(
      execFileSync(
        'node',
        [
          '-p',
          `JSON.stringify(require(${JSON.stringify(join(directory, '.oxlintrc.json'))}))`,
        ],
        {
          encoding: 'utf8',
        },
      ),
    );
    config.overrides = [
      { files: ['**'], rules: { 'hoof/require-tsdoc': 'off' } },
    ];
    writeFileSync(join(directory, '.oxlintrc.json'), JSON.stringify(config));
    const result = checkIntegrity(directory);
    assert.equal(result.code, 1);
    assert.match(result.output, /`overrides` block targeting `\*\*`/);
    assert.match(result.output, /turns the gates off for it/);
  });
});

void test('the overrides this repository actually ships are all inside the allowed file classes', () => {
  const result = runScript(integrityScript, []);
  assert.equal(/overrides` block targeting/.test(result.output), false);
});

void test('the lint script this repository ships wires every check over every required root', () => {
  const result = runScript(integrityScript, []);
  assert.equal(/`lint` script in `package\.json`/.test(result.output), false);
  const shipped = JSON.parse(
    readFileSync(join(repoRoot, 'package.json'), 'utf8'),
  ).scripts.lint;
  for (const root of REQUIRED_LINT_ROOTS) {
    assert.equal(
      shipped.includes(root),
      true,
      `${root} is missing from the lint script`,
    );
  }
  // Chained with `;` rather than `&&` so a failing linter cannot stop the two
  // guardrail scripts from running, which is where the config gates are checked.
  assert.equal(shipped.includes('&&'), false);
});
