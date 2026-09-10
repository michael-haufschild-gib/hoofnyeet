/**
 * Custom oxlint rules for this repository.
 *
 * Oxlint loads this file through the `jsPlugins` entry in `.oxlintrc.json` and
 * exposes each rule below as `hoof/<rule-name>`. The rules exist because the
 * checks oxlint ships cannot express them: cognitive complexity has no oxlint
 * plugin, and the comment, test-quality and suppression rules encode decisions
 * specific to this codebase.
 *
 * Every message names the measured value, the limit, and the edit that fixes
 * it, because the primary reader is an automated agent that will otherwise
 * reach for the nearest suppression comment.
 */

import { cognitiveComplexity } from './cognitive-complexity.js';
import {
  noCommentedOutCode,
  noDeferredWorkComments,
  noRedundantComment,
  requireTsdoc,
} from './comment-rules.js';
import { noLintSuppression } from './suppression-rules.js';
import {
  noDisabledTests,
  noShallowAssertions,
  noSnapshotAssertions,
  requireTestAssertion,
  requireTestDescription,
} from './test-quality-rules.js';

const plugin = {
  meta: { name: 'hoof' },
  rules: {
    'cognitive-complexity': cognitiveComplexity,
    'no-commented-out-code': noCommentedOutCode,
    'no-deferred-work-comments': noDeferredWorkComments,
    'no-disabled-tests': noDisabledTests,
    'no-lint-suppression': noLintSuppression,
    'no-redundant-comment': noRedundantComment,
    'no-shallow-assertions': noShallowAssertions,
    'no-snapshot-assertions': noSnapshotAssertions,
    'require-test-assertion': requireTestAssertion,
    'require-test-description': requireTestDescription,
    'require-tsdoc': requireTsdoc,
  },
};

export default plugin;
