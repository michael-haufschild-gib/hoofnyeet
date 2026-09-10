/**
 * Comment quality rules.
 *
 * Three failure modes are worth a build break. A public export with no
 * docblock forces every later reader to re-derive its contract from the body.
 * Commented-out code is dead weight that git already stores. A deferred-work
 * marker is a promise nothing tracks, and an automated agent will leave one
 * rather than finish the work.
 */

import {
  isAuthoredSource,
  isLintRuleFile,
  isVendoredComponent,
} from './helpers.js';

const DOCUMENTED_DECLARATIONS = new Map([
  ['FunctionDeclaration', 'Exported function'],
  ['ClassDeclaration', 'Exported class'],
  ['VariableDeclaration', 'Exported value'],
  ['TSInterfaceDeclaration', 'Exported interface'],
  ['TSTypeAliasDeclaration', 'Exported type'],
  ['TSEnumDeclaration', 'Exported enum'],
]);

const DEFERRED_WORK_MARKER =
  /(?:^|[^A-Za-z])(TODO|FIXME|XXX|HACK|WIP|TBD)(?:\b|:)/;

/**
 * Line shapes that are code rather than prose.
 *
 * Every pattern demands punctuation a sentence would not carry — a trailing
 * semicolon, a call's parentheses, a declaration's binding operator. Matching a
 * bare keyword is not enough: "return the frame once the pony lands" opens with
 * `return` and is a sentence.
 */
const CODE_LINE_PATTERNS = [
  /^(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*[:=]/,
  /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*[(<]/,
  /^(?:export\s+)?(?:default\s+)?class\s+[A-Za-z_$][\w$]*\s*[{<]/,
  /^import\s+(?:[\w{*].*\s+from\s+)?['"]/,
  /^export\s*(?:\{|\*|default\s|const\s|function\s|class\s|type\s|interface\s)/,
  /^(?:if|for|while|switch)\s*\(.*\)\s*\{?\s*$/,
  /^\}\s*(?:else(?:\s+if\s*\(.*\))?\s*\{)?\s*;?\s*$/,
  /^[A-Za-z_$][\w$.[\]]*\s*(?:\+|-|\*|\/|\|\||\?\?|&&)?=\s*[^=].*[;,]$/,
  /^(?:await\s+)?[A-Za-z_$][\w$.]*\([^;]*\)\s*[;,]$/,
  /^return(?:\s+.+)?;$/,
  /^(?:await|throw)\s+.+;$/,
  /^<\/?[A-Za-z][\w.]*(?:\s|\/?>)/,
];

/** Strips comment decoration so each line can be judged on its own. */
function commentLines(comment) {
  const body =
    comment.type === 'Block'
      ? comment.value.replace(/^\s*\*\s?/gm, '')
      : comment.value;
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** True when the block comment is a TSDoc docblock rather than a plain block. */
function isDocblock(comment) {
  return comment.type === 'Block' && comment.value.startsWith('*');
}

/**
 * True when the docblock carries a description beyond its decoration.
 *
 * The leading-asterisk strip has to tolerate the indentation a formatter adds,
 * or `/**\n *\n *\/` reads as the single character `*` and passes as text.
 */
function hasDocblockText(comment) {
  return comment.value.replace(/^\s*\*\s?/gm, '').replace(/\s/g, '').length > 0;
}

/** Reads the declared name for a documentation or redundancy message. */
function declaredNameOf(node) {
  const declaration = node.declaration ?? node;
  if (declaration.id?.name) return declaration.id.name;
  if (declaration.declarations?.[0]?.id?.name) {
    return declaration.declarations[0].id.name;
  }
  return '<anonymous>';
}

/** Splits an identifier into lowercase words: `renderFrame` becomes `render frame`. */
function identifierWords(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

/** Returns the docblock immediately preceding a node, or null when there is none. */
function docblockBefore(sourceCode, node) {
  const comments = sourceCode.getCommentsBefore(node);
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    if (isDocblock(comments[index])) return comments[index];
  }
  return null;
}

/** Reports a missing or placeholder docblock on an exported declaration. */
function reportMissingDoc(context, node, kind) {
  const comment = docblockBefore(context.sourceCode, node);
  if (comment && hasDocblockText(comment)) return;
  context.report({
    node,
    messageId: comment ? 'empty' : 'missing',
    data: { kind, name: declaredNameOf(node) },
  });
}

export const requireTsdoc = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a non-empty TSDoc docblock on every exported declaration.',
    },
    schema: [],
    messages: {
      missing:
        '{{kind}} "{{name}}" has no TSDoc docblock. Add /** ... */ above the export stating what it returns or represents, ' +
        'the units and ranges of its inputs, and any side effect a caller cannot see from the signature. ' +
        'Do not restate the name — describe the contract.',
      empty:
        '{{kind}} "{{name}}" has an empty TSDoc docblock. Replace the placeholder with the actual contract, ' +
        'or delete the docblock and write a real one.',
    },
  },
  create(context) {
    if (!isAuthoredSource(context)) return {};
    const check = (node, kind) => reportMissingDoc(context, node, kind);
    return {
      ExportNamedDeclaration(node) {
        if (!node.declaration) return;
        const kind = DOCUMENTED_DECLARATIONS.get(node.declaration.type);
        if (!kind) return;
        check(node, kind);
      },
      ExportDefaultDeclaration(node) {
        check(node, 'Default export');
      },
    };
  },
};

export const noCommentedOutCode = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban commented-out code.' },
    schema: [],
    messages: {
      banned:
        'This comment contains commented-out code: "{{line}}". Delete it — git history already holds every version of this file. ' +
        'If the code is needed, restore it and make it work; if it documents an alternative, describe the alternative in prose instead.',
    },
  },
  create(context) {
    if (isVendoredComponent(context)) return {};
    const sourceCode = context.sourceCode;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          // A TSDoc block legitimately carries `@example` snippets.
          if (isDocblock(comment)) continue;
          const offending = commentLines(comment).find((line) =>
            CODE_LINE_PATTERNS.some((pattern) => pattern.test(line)),
          );
          if (!offending) continue;
          context.report({
            loc: comment.loc,
            messageId: 'banned',
            data: { line: offending.slice(0, 80) },
          });
        }
      },
    };
  },
};

export const noDeferredWorkComments = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban TODO-style markers that defer work nothing tracks.',
    },
    schema: [],
    messages: {
      banned:
        '"{{marker}}" marker found: "{{line}}". Nothing tracks a marker in a comment. ' +
        'Do the work now, or delete the marker and record the follow-up where the team actually reads it. ' +
        'Leaving the marker in place is not an option.',
    },
  },
  create(context) {
    if (isVendoredComponent(context)) return {};
    const sourceCode = context.sourceCode;
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          for (const line of commentLines(comment)) {
            const match = DEFERRED_WORK_MARKER.exec(line);
            if (!match) continue;
            context.report({
              loc: comment.loc,
              messageId: 'banned',
              data: { marker: match[1], line: line.slice(0, 80) },
            });
            break;
          }
        }
      },
    };
  },
};

/** Reads the declared name off a declaration node, or null when it has none. */
function declarationNameOf(node) {
  return node.id?.name ?? node.declarations?.[0]?.id?.name ?? null;
}

/** A comment attaches above the `export` keyword, so a named export reports there. */
function commentAnchorOf(node) {
  return node.parent?.type === 'ExportNamedDeclaration' ? node.parent : node;
}

/** Reduces comment text to lowercase words so it can be compared to an identifier. */
function normaliseCommentText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Reports a comment whose words are exactly the words of the name below it. */
function reportRedundantComment(context, node, name) {
  if (!name) return;
  const anchor = commentAnchorOf(node);
  const comments = context.sourceCode.getCommentsBefore(anchor);
  const comment = comments[comments.length - 1];
  if (!comment) return;
  const text = commentLines(comment).join(' ');
  if (normaliseCommentText(text) !== identifierWords(name)) return;
  context.report({
    loc: comment.loc,
    messageId: 'banned',
    data: { comment: text.slice(0, 60), name },
  });
}

export const noRedundantComment = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban a comment that only re-spells the name of the declaration below it.',
    },
    schema: [],
    messages: {
      banned:
        'Comment "{{comment}}" only re-spells "{{name}}" and tells a reader nothing the next line does not. ' +
        'Delete it, or replace it with why the code exists, what it assumes, or what breaks without it.',
    },
  },
  create(context) {
    if (isVendoredComponent(context) || isLintRuleFile(context)) return {};
    const check = (node) =>
      reportRedundantComment(context, node, declarationNameOf(node));
    return {
      FunctionDeclaration: check,
      VariableDeclaration: check,
      TSInterfaceDeclaration: check,
    };
  },
};
