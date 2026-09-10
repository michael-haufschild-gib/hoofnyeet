/**
 * Tests for the comment rules and the suppression ban.
 *
 * `no-commented-out-code` and `no-redundant-comment` are heuristics over prose,
 * so the cases that matter most are the negative ones: this repository bans
 * suppression comments, which makes any false positive an unfixable build
 * break rather than an annoyance.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnosticsFor, lintFixture } from './test-support.js';

/** Lints one source file and returns the diagnostics for a single rule. */
function rulesFor(rule, source, name = 'source.ts') {
  return diagnosticsFor(lintFixture({ [name]: source }), rule);
}

void test('an exported declaration without a docblock is reported, and one with a docblock is not', () => {
  const undocumented = rulesFor('require-tsdoc', 'export const speed = 12;');
  const documented = rulesFor(
    'require-tsdoc',
    '/** Pixels per frame. */\nexport const speed = 12;',
  );
  assert.equal(undocumented.length, 1);
  assert.match(
    undocumented[0].message,
    /Exported value "speed" has no TSDoc docblock/,
  );
  assert.deepEqual(documented, []);
});

void test('a docblock holding only whitespace and asterisks counts as absent, not as documentation', () => {
  const diagnostics = rulesFor(
    'require-tsdoc',
    '/**\n *\n */\nexport function run() {}',
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /has an empty TSDoc docblock/);
});

void test('every exported declaration kind is covered, including types, classes and default exports', () => {
  const source = [
    'export interface Frame { x: number }',
    'export type Speed = number;',
    'export class Rig {}',
    'export enum Phase { Runup }',
    'export default function Page() {}',
  ].join('\n');
  const diagnostics = rulesFor('require-tsdoc', source);
  assert.deepEqual(
    diagnostics.map((entry) => entry.line),
    [1, 2, 3, 4, 5],
  );
});

void test('an unexported declaration is left alone, because the rule governs the public contract', () => {
  const diagnostics = rulesFor(
    'require-tsdoc',
    'const internal = 1;\nfunction helper() {}',
  );
  assert.deepEqual(diagnostics, []);
});

void test('a commented-out statement is reported while prose starting with the same keyword is not', () => {
  const code = rulesFor(
    'no-commented-out-code',
    '// const dead = compute(1);\nconst live = 1;',
  );
  const prose = rulesFor(
    'no-commented-out-code',
    '// return early once the pony lands, because the camera stops tracking\nconst live = 1;',
  );
  assert.equal(code.length, 1);
  assert.match(code[0].message, /const dead = compute\(1\);/);
  assert.deepEqual(prose, []);
});

void test('prose that merely mentions imports, exports or functions is not treated as code', () => {
  const source = [
    '// export the frame so the renderer can reuse it next tick',
    '// import order matters here because the audio graph is built eagerly',
    '// this function returns the ground plane in screen space',
    'const live = 1;',
  ].join('\n');
  assert.deepEqual(rulesFor('no-commented-out-code', source), []);
});

void test('a TSDoc block may carry an example snippet without tripping the commented-code rule', () => {
  const source =
    '/**\n * Frames the camera.\n * @example const frame = frameGame(state);\n */\nexport function frameGame() {}';
  assert.deepEqual(rulesFor('no-commented-out-code', source), []);
});

void test('each deferred-work marker is reported with the marker name and the offending line', () => {
  const source = [
    '// TODO: wire the encore audio',
    '// FIXME broken on phones',
    '// HACK: forces a reflow',
    'const live = 1;',
  ].join('\n');
  const diagnostics = rulesFor('no-deferred-work-comments', source);
  assert.deepEqual(
    diagnostics.map((entry) => entry.line),
    [1, 2, 3],
  );
  assert.match(diagnostics[0].message, /"TODO" marker found/);
});

void test('a word that merely contains a marker as a substring does not trip the deferred-work rule', () => {
  assert.deepEqual(
    rulesFor(
      'no-deferred-work-comments',
      '// the mastodon herd waits for the cue\nconst live = 1;',
    ),
    [],
  );
});

void test('a comment that only re-spells the name below it is reported, unlike one that adds context', () => {
  const redundant = rulesFor(
    'no-redundant-comment',
    '// render frame\nfunction renderFrame() {}',
  );
  const useful = rulesFor(
    'no-redundant-comment',
    '// Runs before the physics step so the camera never lags a frame behind.\nfunction renderFrame() {}',
  );
  assert.equal(redundant.length, 1);
  assert.match(redundant[0].message, /only re-spells "renderFrame"/);
  assert.deepEqual(useful, []);
});

void test('a redundant comment above an exported declaration is found through the export keyword', () => {
  const diagnostics = rulesFor(
    'no-redundant-comment',
    '// camera frame\nexport interface CameraFrame { x: number }',
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].line, 1);
});

void test('every suppression directive form is banned and the message names which one was found', () => {
  const source = [
    '// oxlint-disable-next-line no-console',
    '/* eslint-disable no-var */',
    '// @ts-ignore',
    '// @ts-expect-error',
    '// biome-ignore lint: nope',
    'const live = 1;',
  ].join('\n');
  const diagnostics = rulesFor('no-lint-suppression', source);
  assert.deepEqual(
    diagnostics.map((entry) => entry.line),
    [1, 2, 3, 4, 5],
  );
  assert.match(
    diagnostics[0].message,
    /Suppression comment "oxlint-disable" is banned/,
  );
  assert.match(
    diagnostics[2].message,
    /Suppression comment "@ts-ignore" is banned/,
  );
});

void test('oxlint honours a disable directive over a plugin rule, which is why a second check exists', () => {
  // oxlint has no `noInlineConfig` switch, so `hoof/no-lint-suppression` can be
  // silenced the same way any other rule can. `scripts/lint/lint-config-integrity.mjs`
  // repeats the scan outside the linter, and `lint-scripts.test.js` pins that.
  const suppressed = rulesFor(
    'no-lint-suppression',
    '// oxlint-disable-next-line hoof/no-lint-suppression\n// @ts-nocheck\nconst live = 1;',
  );
  const unsuppressed = rulesFor(
    'no-lint-suppression',
    '// @ts-nocheck\nconst live = 1;',
  );
  assert.equal(unsuppressed.length, 1);
  assert.equal(
    suppressed.length,
    1,
    'the directive line itself is still reported',
  );
  assert.equal(suppressed[0].line, 1);
});

void test('the documentation rules stay out of test files, which document themselves by name', () => {
  const diagnostics = diagnosticsFor(
    lintFixture({ 'thing.test.ts': 'export const helper = 1;' }),
    'require-tsdoc',
  );
  assert.deepEqual(diagnostics, []);
});
