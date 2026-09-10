/**
 * Tests for the "no trivial tests" rules.
 *
 * This suite runs `node:test` with `node:assert/strict` and Playwright's
 * `expect`, so both dialects are covered. The negative cases carry the weight:
 * a rule that also fires on a real assertion, or on Playwright's conditional
 * skip, would make the whole set unusable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnosticsFor, lintFixture } from './test-support.js';

/** Lints a fixture named as a test file and returns the diagnostics for one rule. */
function rulesFor(rule, source) {
  return diagnosticsFor(lintFixture({ 'fixture.test.ts': source }), rule);
}

/** Wraps a body in a test whose description already satisfies the description rule. */
function inTest(body) {
  return `test('the camera keeps the landing plane visible while the pony descends', () => {\n${body}\n});`;
}

void test('a test body with no assertion is reported, and one with an assertion is not', () => {
  const silent = rulesFor(
    'require-test-assertion',
    inTest('  const frame = frameGame();'),
  );
  const asserting = rulesFor(
    'require-test-assertion',
    inTest('  assert.equal(frameGame().zoom, 2);'),
  );
  assert.equal(silent.length, 1);
  assert.match(silent[0].message, /runs code but asserts nothing/);
  assert.deepEqual(asserting, []);
});

void test('an assertion nested inside a callback still satisfies the enclosing test', () => {
  const source = inTest(
    '  rows.forEach((row) => { assert.equal(row.width, 12); });',
  );
  assert.deepEqual(rulesFor('require-test-assertion', source), []);
});

void test('a Playwright expectation counts as an assertion just as node assert does', () => {
  const source =
    "test('the score readout shows the run total once the pony lands', async () => {\n" +
    '  await expect(page.getByTestId("score")).toHaveText("120");\n});';
  assert.deepEqual(rulesFor('require-test-assertion', source), []);
});

void test('a description shorter than eight words and sixty-four characters is reported', () => {
  const short = rulesFor(
    'require-test-description',
    "test('renders', () => { assert.equal(1, 1); });",
  );
  assert.equal(short.length, 1);
  assert.match(short[0].message, /too short \(1 words, 7 chars\)/);
});

void test('a description passes on the word count alone or on the character count alone', () => {
  const byWords = rulesFor(
    'require-test-description',
    "test('the pony lands on the plane after a long flight', () => { assert.equal(1, 1); });",
  );
  const byChars = rulesFor(
    'require-test-description',
    "test('carnage/spectator-reaction-and-scoring-pipeline-integration-check', () => { assert.equal(1, 1); });",
  );
  assert.deepEqual(byWords, []);
  assert.deepEqual(byChars, []);
});

void test('a computed description is reported because it cannot be read in a failure report', () => {
  const diagnostics = rulesFor(
    'require-test-description',
    'test(buildName(case_), () => { assert.equal(1, 1); });',
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /needs a literal string description/);
});

void test('a describe block is exempt from the description length gate that tests must pass', () => {
  const diagnostics = rulesFor(
    'require-test-description',
    "describe('camera', () => {});",
  );
  assert.deepEqual(diagnostics, []);
});

void test('the modifier form of skip is reported while the Playwright guard form is allowed', () => {
  const modifier = rulesFor(
    'no-disabled-tests',
    "test.skip('the pony lands on the plane after a long flight', () => { assert.equal(1, 1); });",
  );
  const guard = rulesFor(
    'no-disabled-tests',
    inTest("  test.skip(info.project.name !== 'chromium');"),
  );
  assert.equal(modifier.length, 1);
  assert.match(modifier[0].message, /removes this test from the suite/);
  assert.deepEqual(guard, []);
});

void test('a focused test is reported with a message about the rest of the suite being dropped', () => {
  const diagnostics = rulesFor(
    'no-disabled-tests',
    "test.only('the pony lands on the plane after a long flight', () => { assert.equal(1, 1); });",
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /silently drops every other test/);
});

void test('a todo test is reported even though it carries no callback to disable', () => {
  const diagnostics = rulesFor(
    'no-disabled-tests',
    "test.todo('wire the encore audio path');",
  );
  assert.equal(diagnostics.length, 1);
  assert.match(diagnostics[0].message, /`test\.todo\(\.\.\.\)`/);
});

void test('each shallow expect matcher is reported and a concrete matcher is left alone', () => {
  const shallow = rulesFor(
    'no-shallow-assertions',
    inTest(
      '  expect(a).toBeDefined();\n  expect(b).toBeTruthy();\n  expect(c).toBeNull();',
    ),
  );
  const concrete = rulesFor(
    'no-shallow-assertions',
    inTest('  expect(a).toEqual({ zoom: 2 });\n  expect(b).toHaveLength(3);'),
  );
  assert.equal(shallow.length, 3);
  assert.deepEqual(concrete, []);
});

void test('assert.ok on a bare value is reported while assert.ok on a comparison is not', () => {
  const bare = rulesFor(
    'no-shallow-assertions',
    inTest('  assert.ok(frame);\n  assert.ok(frame.zoom);'),
  );
  const compared = rulesFor(
    'no-shallow-assertions',
    inTest(
      '  assert.ok(frame.zoom > 1.2);\n  assert.ok(Number.isFinite(frame.y) && frame.y < 0);',
    ),
  );
  assert.equal(bare.length, 2);
  assert.match(bare[0].message, /a bare value rather than a comparison/);
  assert.deepEqual(compared, []);
});

void test('a predicate call inside assert.ok is accepted because it names the property proved', () => {
  const source = inTest('  assert.ok(Number.isFinite(frame.zoom));');
  assert.deepEqual(rulesFor('no-shallow-assertions', source), []);
});

void test('an existence-only or type-only check is reported whichever dialect writes it', () => {
  const source = inTest(
    [
      '  assert.notStrictEqual(frame, null);',
      "  assert.ok(typeof frame === 'object');",
      '  assert.doesNotThrow(() => frameGame());',
      '  expect(frame).toBeInstanceOf(Object);',
    ].join('\n'),
  );
  const diagnostics = rulesFor('no-shallow-assertions', source);
  assert.equal(diagnostics.length, 4);
  assert.match(
    diagnostics[0].message,
    /only proves the value is not null or undefined/,
  );
  assert.match(diagnostics[2].message, /proves only that nothing threw/);
});

void test('a snapshot assertion is reported with the reason it cannot distinguish fix from regression', () => {
  const diagnostics = rulesFor(
    'no-snapshot-assertions',
    inTest('  expect(frame).toMatchSnapshot();'),
  );
  assert.equal(diagnostics.length, 1);
  assert.match(
    diagnostics[0].message,
    /accepts a regression as readily as a fix/,
  );
});

void test('the test-quality rules never fire on product source, only on test files', () => {
  const diagnostics = lintFixture({
    'source.ts':
      '/** Runs a check. */\nexport function check(a) { assert.ok(a); }',
  });
  assert.deepEqual(
    diagnostics.filter(
      (entry) =>
        entry.rule.includes('assertion') || entry.rule.includes('test'),
    ),
    [],
  );
});
