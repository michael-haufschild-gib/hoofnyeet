/**
 * Tests for `hoof/cognitive-complexity`.
 *
 * The scores below are the SonarSource whitepaper's worked arithmetic, not
 * whatever the implementation happens to produce, so a regression in the
 * nesting surcharge changes a number here rather than passing quietly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { diagnosticsFor, lintFixture } from './test-support.js';

/** Scores every function in a source, with the limit lowered so all of them report. */
function scoresFor(source) {
  const diagnostics = diagnosticsFor(
    lintFixture(
      { 'source.ts': source },
      { 'hoof/cognitive-complexity': ['error', { max: 0 }] },
    ),
    'cognitive-complexity',
  );
  return diagnostics.map((diagnostic) => {
    const match = /cognitive complexity of (\d+)/.exec(diagnostic.message);
    return { line: diagnostic.line, score: Number(match?.[1]) };
  });
}

void test('a branch nested inside another branch costs more than the same branch at the top level', () => {
  const flat = scoresFor('function flat(a, b) { if (a) {} if (b) {} }');
  const nested = scoresFor('function nested(a, b) { if (a) { if (b) {} } }');
  assert.deepEqual(
    flat.map((entry) => entry.score),
    [2],
  );
  assert.deepEqual(
    nested.map((entry) => entry.score),
    [3],
  );
});

void test('an else and an else-if each cost one increment without a nesting surcharge', () => {
  const scores = scoresFor(
    'function ladder(a, b) { if (a) {} else if (b) {} else {} }',
  );
  assert.deepEqual(
    scores.map((entry) => entry.score),
    [3],
  );
});

void test('a run of like logical operators costs one, and a change of operator starts a new run', () => {
  const single = scoresFor('function single(a, b, c) { return a && b && c; }');
  const mixed = scoresFor('function mixed(a, b, c) { return a && b || c; }');
  assert.deepEqual(
    single.map((entry) => entry.score),
    [1],
  );
  assert.deepEqual(
    mixed.map((entry) => entry.score),
    [2],
  );
});

void test('a callback body is charged to the enclosing function at one level deeper', () => {
  const scores = scoresFor(
    'function outer(items) { items.forEach((item) => { if (item) {} }); }',
  );
  assert.deepEqual(scores, [{ line: 1, score: 2 }]);
});

void test('a switch costs one plus the nesting of the branches inside each case', () => {
  const scores = scoresFor(
    'function route(a, b) { switch (a) { case 1: if (b) {} break; default: break; } }',
  );
  assert.deepEqual(
    scores.map((entry) => entry.score),
    [3],
  );
});

void test('a labelled break costs one increment and carries no nesting surcharge', () => {
  const scores = scoresFor(
    'function scan(rows, cells) { outer: for (const r of rows) { for (const c of cells) { break outer; } } }',
  );
  assert.deepEqual(
    scores.map((entry) => entry.score),
    [4],
  );
});

void test('a catch clause costs one and nests the statements it guards', () => {
  const scores = scoresFor(
    'function guard(a) { try { run(); } catch (error) { if (a) {} } }',
  );
  assert.deepEqual(
    scores.map((entry) => entry.score),
    [3],
  );
});

void test('a ternary inside a ternary is charged the nesting surcharge like an if', () => {
  const scores = scoresFor(
    'function pick(a, b) { return a ? (b ? 1 : 2) : 3; }',
  );
  assert.deepEqual(
    scores.map((entry) => entry.score),
    [3],
  );
});

void test('a function below the configured limit produces no diagnostic at all', () => {
  const diagnostics = diagnosticsFor(
    lintFixture({
      'source.ts': 'function small(a) { if (a) { return 1; } return 2; }',
    }),
    'cognitive-complexity',
  );
  assert.deepEqual(diagnostics, []);
});

void test('only the outermost function reports, so nested code is never charged twice', () => {
  const scores = scoresFor(
    'function outer(a) { function inner(b) { if (b) {} } if (a) {} return inner; }',
  );
  assert.equal(scores.length, 1);
  assert.equal(scores[0].score, 3);
});

void test('the failure message names the score, the limit and the contributing structures', () => {
  const [diagnostic] = diagnosticsFor(
    lintFixture(
      { 'source.ts': 'function deep(a, b) { if (a) { if (b) {} } }' },
      { 'hoof/cognitive-complexity': ['error', { max: 2 }] },
    ),
    'cognitive-complexity',
  );
  assert.match(diagnostic.message, /cognitive complexity of 3; the limit is 2/);
  assert.match(diagnostic.message, /Contributors: .*if x2/);
  assert.match(
    diagnostic.message,
    /Do not raise the limit and do not suppress this rule/,
  );
});
