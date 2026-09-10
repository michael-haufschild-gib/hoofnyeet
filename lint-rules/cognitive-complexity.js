/**
 * Cognitive complexity, as defined by the SonarSource whitepaper.
 *
 * Oxlint ships `complexity` (cyclomatic), which counts every branch equally and
 * so punishes a flat switch as hard as a triple-nested loop. Cognitive
 * complexity instead charges for nesting, which is what actually makes a
 * function unreadable. Oxlint has no SonarJS plugin, so the metric is
 * implemented here.
 *
 * Scoring, per the whitepaper:
 *   - +1 for each `if`, ternary, `switch`, loop, `catch`, and labelled jump.
 *   - +1 for each `else` and `else if`, with no nesting surcharge.
 *   - +1 for each run of like binary logical operators (`a && b && c` is one).
 *   - +N extra for a structure nested N levels deep inside other structures.
 *   - Nested functions raise the nesting level without scoring themselves.
 */

import { eachChild, functionNameOf, isFunctionNode } from './helpers.js';

const LOOPS = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

const DEFAULT_MAX = 10;

/** Adds to a cause tally used to explain the score in the failure message. */
function bump(causes, kind, amount) {
  causes.set(kind, (causes.get(kind) ?? 0) + amount);
}

/** Applies one structural increment plus its nesting surcharge. */
function charge(state, kind, nesting) {
  state.total += 1 + nesting;
  bump(state.causes, kind, 1);
  if (nesting > 0) bump(state.causes, 'nesting', nesting);
}

/** Flattens a logical chain in source order so operator runs can be counted. */
function collectOperators(state, node, operators) {
  if (node.type !== 'LogicalExpression') return;
  state.countedLogicalRoots.add(node);
  collectOperators(state, node.left, operators);
  operators.push(node.operator);
  collectOperators(state, node.right, operators);
}

/** `a && b && c` is one run; `a && b || c` is two. */
function countOperatorRuns(state, node) {
  const operators = [];
  collectOperators(state, node, operators);
  let runs = 0;
  for (let index = 0; index < operators.length; index += 1) {
    if (index === 0 || operators[index] !== operators[index - 1]) runs += 1;
  }
  return runs;
}

function visitLogical(state, node, nesting) {
  if (!state.countedLogicalRoots.has(node)) {
    const runs = countOperatorRuns(state, node);
    state.total += runs;
    bump(state.causes, 'logical', runs);
  }
  visit(state, node.left, nesting);
  visit(state, node.right, nesting);
}

/**
 * `else if` is one increment with no nesting surcharge: the reader is following
 * a single decision chain, not descending into a new block.
 */
function visitIf(state, node, nesting, isElseIf) {
  charge(state, isElseIf ? 'else-if' : 'if', isElseIf ? 0 : nesting);
  visit(state, node.test, nesting);
  visit(state, node.consequent, nesting + 1);
  if (!node.alternate) return;
  if (node.alternate.type === 'IfStatement') {
    visitIf(state, node.alternate, nesting, true);
    return;
  }
  charge(state, 'else', 0);
  visit(state, node.alternate, nesting + 1);
}

function visitTernary(state, node, nesting) {
  charge(state, 'ternary', nesting);
  visit(state, node.test, nesting);
  visit(state, node.consequent, nesting + 1);
  visit(state, node.alternate, nesting + 1);
}

function visitSwitch(state, node, nesting) {
  charge(state, 'switch', nesting);
  visit(state, node.discriminant, nesting);
  for (const switchCase of node.cases) visit(state, switchCase, nesting + 1);
}

function visitCatch(state, node, nesting) {
  charge(state, 'catch', nesting);
  visitChildren(state, node, nesting + 1);
}

function visitJump(state, node) {
  if (node.label) charge(state, 'labelled-jump', 0);
}

function visitLoop(state, node, nesting) {
  charge(state, 'loop', nesting);
  eachChild(node, (child) => {
    visit(state, child, child === node.body ? nesting + 1 : nesting);
  });
}

const HANDLERS = new Map([
  [
    'IfStatement',
    (state, node, nesting) => visitIf(state, node, nesting, false),
  ],
  ['ConditionalExpression', visitTernary],
  ['SwitchStatement', visitSwitch],
  ['CatchClause', visitCatch],
  ['LogicalExpression', visitLogical],
  ['BreakStatement', visitJump],
  ['ContinueStatement', visitJump],
]);

function visitChildren(state, node, nesting) {
  eachChild(node, (child) => visit(state, child, nesting));
}

function visit(state, node, nesting) {
  if (!node) return;
  // A nested function is its own reading unit, so it costs nothing itself, but
  // its body sits one level further from the top of the enclosing function.
  if (isFunctionNode(node)) {
    visitChildren(state, node, nesting + 1);
    return;
  }
  const handler = HANDLERS.get(node.type);
  if (handler) {
    handler(state, node, nesting);
    return;
  }
  if (LOOPS.has(node.type)) {
    visitLoop(state, node, nesting);
    return;
  }
  visitChildren(state, node, nesting);
}

/** Scores one function subtree, returning the total and a per-cause breakdown. */
function scoreFunction(functionNode) {
  const state = { total: 0, causes: new Map(), countedLogicalRoots: new Set() };
  visitChildren(state, functionNode, 0);
  return state;
}

/** Renders the breakdown as `if x3, loop x1, nesting +4` for the failure message. */
function describeCauses(causes) {
  const parts = [...causes.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([kind, count]) =>
      kind === 'nesting' ? `nesting +${count}` : `${kind} x${count}`,
    );
  return parts.join(', ');
}

/** True when the function is declared inside another function. */
function isNestedFunction(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (isFunctionNode(parent)) return true;
  }
  return false;
}

export const cognitiveComplexity = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cap SonarSource cognitive complexity so no function becomes unreadable.',
    },
    schema: [{ type: 'object', properties: { max: { type: 'number' } } }],
    messages: {
      tooComplex:
        'Function "{{name}}" has a cognitive complexity of {{score}}; the limit is {{max}}. ' +
        'Contributors: {{causes}}. ' +
        'Extract the nested branches into named helper functions, replace an if/else ladder with a lookup table, ' +
        'or return early to flatten nesting. Nested callbacks count toward the enclosing function. ' +
        'Do not raise the limit and do not suppress this rule.',
    },
  },
  create(context) {
    const max = context.options?.[0]?.max ?? DEFAULT_MAX;

    function check(node) {
      // Only outermost functions are scored. A nested callback is already folded
      // into its parent's score, so reporting it again charges the same code twice.
      if (isNestedFunction(node)) return;
      const { total, causes } = scoreFunction(node);
      if (total <= max) return;
      context.report({
        node: node.id ?? node,
        messageId: 'tooComplex',
        data: {
          name: functionNameOf(node),
          score: String(total),
          max: String(max),
          causes: describeCauses(causes) || 'none',
        },
      });
    }

    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
