/**
 * Test quality rules — the "no trivial tests" set.
 *
 * A test that runs code without asserting anything about it, or that asserts
 * only that a value exists, reports green for a build that is already broken.
 * These rules are what stop the suite from growing coverage without growing
 * confidence, which is the failure mode an automated agent falls into first.
 *
 * The suite runs `node:test` with `node:assert/strict` under `tests/`, and
 * Playwright's `expect` under `tests/browser/`, so both dialects are checked.
 */

import { isTestFile, propertyNameOf, rootCalleeName } from './helpers.js';

const TEST_KINDS = new Set(['it', 'test', 'describe']);

/** Modifiers that only ever mark a test as not-run. */
const ALWAYS_DISABLED_MODIFIERS = new Set(['todo', 'failing', 'fails']);

/**
 * Modifiers with two spellings. `test.skip('name', fn)` removes a test;
 * Playwright's `test.skip(condition, reason)` narrows one to the projects
 * where it is meaningful. Only the first spelling passes a function.
 */
const CONDITIONAL_MODIFIERS = new Set(['skip', 'only', 'fixme']);

const RUNNER_MODIFIERS = new Set([
  ...ALWAYS_DISABLED_MODIFIERS,
  ...CONDITIONAL_MODIFIERS,
  'concurrent',
  'sequential',
  'serial',
  'parallel',
  'each',
  'for',
  'describe',
]);

const SHALLOW_MATCHERS = new Set([
  'toBeTruthy',
  'toBeFalsy',
  'toBeDefined',
  'toBeUndefined',
  'toBeNull',
]);

const SNAPSHOT_MATCHERS = new Set([
  'toMatchSnapshot',
  'toMatchInlineSnapshot',
  'toThrowErrorMatchingSnapshot',
  'toThrowErrorMatchingInlineSnapshot',
]);

const BROAD_CONSTRUCTORS = new Set(['Object', 'Array', 'Function']);
const NULLISH_ASSERTIONS = new Set([
  'notEqual',
  'notStrictEqual',
  'notDeepEqual',
]);
const SHALLOW_TYPEOF_RESULTS = new Set(['object', 'function', 'undefined']);
const COMPARISON_OPERATORS = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '>',
  '<=',
  '>=',
  'instanceof',
  'in',
]);

const MIN_DESCRIPTION_WORDS = 8;
const MIN_DESCRIPTION_CHARS = 64;

/** True for `assert`, `assert.equal`, `expect(x).toBe`, `expect.soft(x).toBe`. */
function isAssertionCall(node) {
  const root = rootCalleeName(node.callee);
  return root === 'assert' || root === 'expect';
}

/** Resolves `test`, `it.skip`, `test.describe.serial` to their base kind. */
function testKindOf(node) {
  let callee = node.callee;
  // `test.each([...])(name, fn)` puts the table call in callee position.
  if (callee?.type === 'CallExpression') callee = callee.callee;
  const modifiers = [];
  while (callee?.type === 'MemberExpression') {
    const name = propertyNameOf(callee);
    if (!name || !RUNNER_MODIFIERS.has(name)) return null;
    modifiers.unshift(name);
    callee = callee.object;
  }
  if (callee?.type !== 'Identifier' || !TEST_KINDS.has(callee.name))
    return null;
  return { base: callee.name, modifiers };
}

/** Finds the callback a runner was handed, ignoring options objects. */
function testCallbackOf(node) {
  return node.arguments.find(
    (argument) =>
      argument.type === 'ArrowFunctionExpression' ||
      argument.type === 'FunctionExpression',
  );
}

/** Reads a statically known string from a literal or a template with no holes. */
function staticStringOf(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral') {
    return node.quasis.map((quasi) => quasi.value.cooked ?? '').join(' X ');
  }
  return null;
}

/** True for `null` and `undefined` in either spelling. */
function isNullish(node) {
  if (node?.type === 'Literal' && node.value === null) return true;
  return node?.type === 'Identifier' && node.name === 'undefined';
}

/** True for `typeof x === 'object'` and its siblings, which prove no behaviour. */
function isTypeOnlyComparison(node) {
  if (node?.type !== 'BinaryExpression') return false;
  const typeofSide = [node.left, node.right].find(
    (side) => side?.type === 'UnaryExpression' && side.operator === 'typeof',
  );
  if (!typeofSide) return false;
  const literalSide = node.left === typeofSide ? node.right : node.left;
  return (
    literalSide?.type === 'Literal' &&
    SHALLOW_TYPEOF_RESULTS.has(literalSide.value)
  );
}

/**
 * Classifies the argument of `assert.ok`.
 *
 * A predicate call such as `Number.isFinite(z)` is left alone: it names the
 * property being proved. A bare identifier or property read is not — it only
 * proves the value is not falsy.
 */
function shallowTruthinessKind(node) {
  if (!node) return null;
  if (node.type === 'Literal' && node.value === true) return 'constant';
  if (node.type === 'Identifier' || node.type === 'MemberExpression')
    return 'existence';
  if (isTypeOnlyComparison(node)) return 'type';
  if (node.type === 'BinaryExpression') return comparisonTruthinessKind(node);
  if (node.type === 'LogicalExpression') return logicalTruthinessKind(node);
  return null;
}

/** `x !== undefined` proves presence and nothing else; `x > 3` proves a value. */
function comparisonTruthinessKind(node) {
  if (!COMPARISON_OPERATORS.has(node.operator)) return null;
  return isNullish(node.left) || isNullish(node.right) ? 'existence' : null;
}

/** A chain is shallow only when every operand is, so one real check redeems it. */
function logicalTruthinessKind(node) {
  const left = shallowTruthinessKind(node.left);
  const right = shallowTruthinessKind(node.right);
  return left && right ? left : null;
}

/** Reports on a test whose description is computed, empty, or label-shaped. */
function checkDescription(context, node) {
  const kind = testKindOf(node);
  if (!kind || kind.base === 'describe') return;
  if (!testCallbackOf(node)) return;
  const description = staticStringOf(node.arguments[0]);
  const target = node.arguments[0] ?? node;
  if (description === null) {
    context.report({
      node: target,
      messageId: 'notStatic',
      data: { kind: kind.base },
    });
    return;
  }
  const trimmed = description.trim();
  if (!trimmed) {
    context.report({
      node: target,
      messageId: 'empty',
      data: { kind: kind.base },
    });
    return;
  }
  const words = trimmed.split(/\s+/).length;
  if (words >= MIN_DESCRIPTION_WORDS || trimmed.length >= MIN_DESCRIPTION_CHARS)
    return;
  context.report({
    node: target,
    messageId: 'tooShort',
    data: {
      kind: kind.base,
      value: trimmed,
      words: String(words),
      chars: String(trimmed.length),
      minWords: String(MIN_DESCRIPTION_WORDS),
      minChars: String(MIN_DESCRIPTION_CHARS),
    },
  });
}

export const requireTestDescription = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a sentence-shaped test description that states subject, input, and expected result.',
    },
    schema: [],
    messages: {
      notStatic:
        '`{{kind}}(...)` needs a literal string description. A computed name cannot be read in a failure report or grepped for.',
      empty:
        '`{{kind}}(...)` has an empty description. State what behaviour this test proves.',
      tooShort:
        '`{{kind}}(...)` description "{{value}}" is too short ({{words}} words, {{chars}} chars); ' +
        'need at least {{minWords}} words or {{minChars}} characters. ' +
        'Name the subject, the input or condition, and the expected result — "renders" is a label, ' +
        '"the camera keeps the landing plane visible while the pony descends" is a specification.',
    },
  },
  create(context) {
    if (!isTestFile(context)) return {};
    return { CallExpression: (node) => checkDescription(context, node) };
  },
};

/** Records an assertion against the innermost test, and opens a test frame. */
function enterTest(stack, node) {
  if (isAssertionCall(node) && stack.length > 0) {
    stack[stack.length - 1].hasAssertion = true;
  }
  const kind = testKindOf(node);
  if (!kind || kind.base === 'describe') return;
  if (!testCallbackOf(node)) return;
  stack.push({ node, kind: kind.base, hasAssertion: false });
}

/** Closes a test frame and reports it when nothing inside asserted anything. */
function exitTest(context, stack, node) {
  const active = stack[stack.length - 1];
  if (!active || active.node !== node) return;
  stack.pop();
  if (active.hasAssertion) return;
  context.report({
    node: node.arguments[0] ?? node,
    messageId: 'missing',
    data: {
      kind: active.kind,
      name: staticStringOf(node.arguments[0]) ?? '<computed>',
    },
  });
}

export const requireTestAssertion = {
  meta: {
    type: 'problem',
    docs: { description: 'Require at least one assertion in every test body.' },
    schema: [],
    messages: {
      missing:
        '`{{kind}}("{{name}}")` runs code but asserts nothing, so it can only fail on a thrown error. ' +
        'Add an `assert.*` or `expect(...)` call that checks the value this test exists to prove. ' +
        'If nothing is worth asserting, delete the test rather than keeping a smoke check.',
    },
  },
  create(context) {
    if (!isTestFile(context)) return {};
    const stack = [];
    return {
      CallExpression: (node) => enterTest(stack, node),
      'CallExpression:exit': (node) => exitTest(context, stack, node),
    };
  },
};

const TRUTHINESS_REASONS = {
  constant: 'a constant that is always true',
  existence: 'a bare value rather than a comparison',
  type: 'a typeof check against a broad type',
};

/** Reports `expect(...)` matchers that prove presence or a broad type only. */
function checkExpectMatcher(context, node) {
  if (rootCalleeName(node.callee) !== 'expect') return;
  const matcher = propertyNameOf(node.callee);
  if (!matcher) return;
  if (SHALLOW_MATCHERS.has(matcher)) {
    context.report({
      node: node.callee.property,
      messageId: 'matcher',
      data: { matcher },
    });
    return;
  }
  if (matcher !== 'toBeInstanceOf') return;
  const target = node.arguments[0];
  if (target?.type !== 'Identifier' || !BROAD_CONSTRUCTORS.has(target.name))
    return;
  context.report({
    node: node.callee.property,
    messageId: 'broadType',
    data: { matcher, constructor: target.name },
  });
}

/** Reports `assert.*` calls that prove presence, a broad type, or nothing at all. */
function checkAssertCall(context, node) {
  if (rootCalleeName(node.callee) !== 'assert') return;
  const bare = node.callee.type === 'Identifier';
  const method = bare ? 'ok' : propertyNameOf(node.callee);
  const callee = bare ? 'assert(...)' : `assert.${method}(...)`;
  if (method === 'doesNotThrow' || method === 'doesNotReject') {
    context.report({ node, messageId: 'smoke', data: { callee } });
    return;
  }
  if (NULLISH_ASSERTIONS.has(method) && isNullish(node.arguments[1])) {
    context.report({ node, messageId: 'nullishOnly', data: { callee } });
    return;
  }
  if (method !== 'ok') return;
  const kind = shallowTruthinessKind(node.arguments[0]);
  if (!kind) return;
  context.report({
    node,
    messageId: 'truthiness',
    data: { callee, reason: TRUTHINESS_REASONS[kind] },
  });
}

export const noShallowAssertions = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban assertions that only prove a value exists, is truthy, or has a broad type.',
    },
    schema: [],
    messages: {
      matcher:
        '`{{matcher}}` proves only that a value is present or truthy, so it passes on almost any regression. ' +
        'Assert the value itself: `expect(frame.zoom).toBeCloseTo(1.4, 2)` instead of `expect(frame.zoom).toBeDefined()`.',
      truthiness:
        '`{{callee}}` is given {{reason}}, which passes for any non-falsy value. ' +
        'Compare against the value you expect — `assert.equal(frame.ground, 480)` — or assert a bounded range with an explicit comparison.',
      broadType:
        '`{{matcher}}({{constructor}})` only proves the value is some {{constructor}}. ' +
        'Assert its contents: the keys it must carry, the length it must have, or the entries it must contain.',
      nullishOnly:
        '`{{callee}}` only proves the value is not null or undefined. ' +
        'Assert what it actually is, so the test fails when the value is wrong rather than merely absent.',
      smoke:
        '`{{callee}}` proves only that nothing threw. Assert the result the call produces, ' +
        'or the state it changes, so a silently wrong outcome still fails.',
    },
  },
  create(context) {
    if (!isTestFile(context)) return {};
    return {
      CallExpression(node) {
        checkExpectMatcher(context, node);
        checkAssertCall(context, node);
      },
    };
  },
};

/**
 * Names the modifier that removes this call from the run, or null when the
 * call is a Playwright guard such as `test.skip(condition, reason)`.
 */
function disablingModifierOf(node, kind) {
  const hasCallback = Boolean(testCallbackOf(node));
  for (const modifier of kind.modifiers) {
    if (ALWAYS_DISABLED_MODIFIERS.has(modifier)) return modifier;
    if (CONDITIONAL_MODIFIERS.has(modifier) && hasCallback) return modifier;
  }
  return null;
}

/** Reports a test the runner will not execute. */
function checkDisabled(context, node) {
  const kind = testKindOf(node);
  if (!kind) return;
  const modifier = disablingModifierOf(node, kind);
  if (!modifier) return;
  context.report({
    node,
    messageId: modifier === 'only' ? 'focused' : 'disabled',
    data: { kind: kind.base, modifier },
  });
}

export const noDisabledTests = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban tests that are skipped, focused, or deferred.' },
    schema: [],
    messages: {
      disabled:
        '`{{kind}}.{{modifier}}(...)` removes this test from the suite, so its subject is unverified while still appearing to be covered. ' +
        'Fix the test and remove the modifier, or delete the test outright. ' +
        "Playwright's guard form `{{kind}}.skip(condition, reason)`, which takes no callback, is still allowed.",
      focused:
        '`{{kind}}.only(...)` silently drops every other test in the run, so CI reports green from a single test. ' +
        'Remove `.only` before committing — it is a local debugging aid, not a committed state.',
    },
  },
  create(context) {
    if (!isTestFile(context)) return {};
    return { CallExpression: (node) => checkDisabled(context, node) };
  },
};

export const noSnapshotAssertions = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban snapshot assertions in favour of explicit expectations.',
    },
    schema: [],
    messages: {
      banned:
        '`{{matcher}}` records whatever the code currently produces, so it accepts a regression as readily as a fix ' +
        'and is routinely updated rather than read. Assert the specific fields that matter to the behaviour under test.',
    },
  },
  create(context) {
    if (!isTestFile(context)) return {};
    return {
      CallExpression(node) {
        const matcher = propertyNameOf(node.callee);
        if (!matcher || !SNAPSHOT_MATCHERS.has(matcher)) return;
        if (rootCalleeName(node.callee) !== 'expect') return;
        context.report({
          node: node.callee.property,
          messageId: 'banned',
          data: { matcher },
        });
      },
    };
  },
};
