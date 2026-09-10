# Lint rules

`pnpm lint` runs three checks in sequence. All three must pass.

| Check | What it enforces |
| --- | --- |
| `oxlint app lib tests scripts lint-rules playwright.config.ts vite.config.ts` | Correctness, size, complexity, comment and test-quality rules |
| `node scripts/lint/lint-folder-structure.mjs` | At most 20 source files per folder |
| `node scripts/lint/lint-config-integrity.mjs` | The gates above have not been weakened or unwired |

`pnpm lint:rules` runs tests covering the custom rules and standalone lint scripts.

## Where the rules come from

Oxlint ships the size gates (`max-lines`, `max-lines-per-function`, `max-depth`,
`max-nested-callbacks`) but has no SonarJS plugin and no way to express the
comment, test-quality or suppression rules. Those live in `lint-rules/`, loaded
through the `jsPlugins` entry in `.oxlintrc.json` and namespaced `hoof/*`.

Every message names the measured value, the limit, and the edit that fixes it.
The primary reader is an automated agent, which will otherwise reach for the
nearest suppression comment.

## Limits

| Rule | Limit | Relaxed for |
| --- | --- | --- |
| `max-lines` | 500 | 1000 under `tests/` |
| `max-lines-per-function` | 85 | off under `tests/` |
| `max-depth` | 4 | off under `tests/` |
| `max-nested-callbacks` | 4 | off under `tests/` |
| `hoof/cognitive-complexity` | 10 | off under `tests/` |
| files per folder | 20 | flat spec files under `tests/` |

Cognitive complexity is the SonarSource metric, not cyclomatic complexity: a
branch costs more the deeper it sits, and a nested callback is charged to the
function that contains it. The failure message breaks the score down by cause
(`if x4, loop x2, nesting +6`) so the expensive part is visible without
recounting by hand.

## Custom rules

**Comments**

- `hoof/require-tsdoc` — every exported declaration needs a non-empty `/** */`.
  Scoped to the public contract; unexported helpers are exempt.
- `hoof/no-commented-out-code` — code kept in a comment. Git already stores it.
- `hoof/no-deferred-work-comments` — `TODO`, `FIXME`, `XXX`, `HACK`, `WIP`, `TBD`.
  Nothing tracks a marker in a comment.
- `hoof/no-redundant-comment` — a comment whose words are exactly the name below it.

**Tests** (the "no trivial tests" set; `tests/` only)

- `hoof/require-test-assertion` — a body that runs code without asserting can
  only fail on a thrown error.
- `hoof/no-shallow-assertions` — `toBeTruthy`, `toBeDefined`, `assert.ok(value)`
  on a bare identifier, `assert.notStrictEqual(x, null)`, `assert.doesNotThrow`,
  `toBeInstanceOf(Object)`. A predicate call such as `assert.ok(Number.isFinite(z))`
  is accepted: it names the property being proved.
- `hoof/require-test-description` — at least 8 words or 64 characters.
- `hoof/no-disabled-tests` — `.skip`, `.only`, `.todo`, `.fixme`, `.failing`.
  Playwright's guard form `test.skip(condition, reason)`, which passes no
  callback, is still allowed.
- `hoof/no-snapshot-assertions` — a snapshot accepts a regression as readily as a fix.

**Suppression**

- `hoof/no-lint-suppression` — `oxlint-disable`, `eslint-disable`, `biome-ignore`,
  `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, coverage ignores.

## Why there are two suppression checks

Oxlint has no `noInlineConfig` switch, so `// oxlint-disable-next-line
hoof/no-lint-suppression` silences the rule that bans suppression comments.
`scripts/lint/lint-config-integrity.mjs` therefore repeats the scan outside the
linter, where no directive reaches it. `lint-rules/comment-rules.test.js` pins
the oxlint behaviour and `lint-rules/lint-scripts.test.js` pins the standalone
scan, so neither can regress silently.

## The integrity check

`scripts/lint/lint-config-integrity.mjs` fails when someone:

- lowers a rule below `error`, raises a numeric limit, or deletes a rule from
  `.oxlintrc.json`;
- removes `./lint-rules/index.js` from `jsPlugins`, which would make every
  `hoof/*` rule inert while leaving the configuration looking intact;
- adds an `overrides` block targeting anything outside `tests/**`,
  `lint-rules/**`, `scripts/**` or `*.config.*`;
- drops a source tree from the `oxlint` arguments in `package.json`;
- removes one of the three checks from `pnpm lint`;
- leaves a suppression comment anywhere under the linted trees.

Tightening a limit is accepted. Loosening one requires editing `EXPECTED_RULES`
in that script and `.oxlintrc.json` in the same commit, whose message has to say
why the old value was wrong.

## Where the folder budget put things

Twenty source files per folder forced the trees below. Each folder is named for
what it owns, so a new module has one obvious home.

| Folder | Owns |
| --- | --- |
| `lib/game/` | the run itself: state, stepping, camera, audio, storage, sharing |
| `lib/game/catalogue/` | static definitions: relics, worlds, hats, rules, machinery, escalation |
| `lib/game/art/` | drawing primitives and poses: geometry, rig, terrain, trampoline |
| `lib/game/crash/` | the post-landing physics collaborators behind `CrashWorld` |
| `lib/game/renderer/` | the Pixi layers and asset caches behind `GameRenderer` |
| `lib/game/session/` | the frame loop, input, preferences and progression behind `GameController` |
| `lib/game/effects/` | per-frame effect systems |
| `lib/game/effects/motion/` | pure pose functions, one per effect |
| `lib/game/effects/shows/` | scripted set pieces |
| `lib/game/effects/slapstick/` | the landing slapstick |
| `lib/game/effects/shaders/` | shader sources and pipeline warm-up |
| `app/screens/` | one component per screen, plus the hooks the page composes |
| `app/panels/` | one component per modal panel |

Browser tests import some modules by their dev-server path (`/lib/game/...`),
so moving a file means updating those strings as well as the import graph.

## Exemptions

Each exemption records the condition that ends it.

- `components/ui/` and `hooks/` are written by the shadcn CLI and rewritten by
  `pnpm dlx shadcn add`, so a hand-made fix there is erased on the next
  component pull. They are outside the lint roots. Add them once the project
  stops regenerating them.
- Flat spec files under `tests/` are exempt from the folder budget: a spec per
  feature, laid out flat, is the runner's convention rather than the unnamed
  growth the rule exists to catch. Helper folders under `tests/` are budgeted.
- `lint-rules/suppression-rules.js`, `lint-rules/comment-rules.test.js` and
  `scripts/lint/lint-config-integrity.mjs` are skipped by the standalone
  suppression scan: each has to spell the patterns out to match or test them.
  A real directive in any of them is still a comment, so oxlint catches it.

## Adding a rule

1. Write it in the matching module under `lint-rules/`, exporting the rule object.
2. Register it in `lint-rules/index.js`.
3. Enable it in `.oxlintrc.json` and add it to `EXPECTED_RULES` in
   `scripts/lint/lint-config-integrity.mjs`.
4. Cover it in the matching `lint-rules/*.test.js`, including a negative case.
   A heuristic over prose needs its false-positive case pinned: a suppression
   comment cannot be used to work around one.
