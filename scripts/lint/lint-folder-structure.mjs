#!/usr/bin/env node
/**
 * Caps the number of source files in any one folder.
 *
 * A folder that keeps growing is a folder nobody has had to name. Past roughly
 * twenty files, "where does this go?" stops having an answer and every new
 * module lands in the same bucket, which is how `lib/game/effects` becomes the
 * place all behaviour lives. The limit forces the split while the boundary is
 * still obvious.
 *
 * Run directly, or via `pnpm lint`. Optional arguments override the scan roots.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FILES_PER_FOLDER = 20;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Authored source trees, each scanned recursively.
 *
 * `components/ui` and `hooks` are absent on purpose: they are written by the
 * shadcn CLI and re-written by `pnpm dlx shadcn add`, so a hand-made split
 * there is erased on the next component pull. Add them here if the project ever
 * stops regenerating them.
 */
const SCAN_ROOTS = ['app', 'lib', 'lint-rules', 'scripts'];

/**
 * Folders exempted from the budget, each with the condition that ends the
 * exemption. An exemption is a scope decision, never a way to keep growing.
 */
const EXEMPTIONS = new Map([
  [
    'tests',
    'Playwright and node:test specs sit flat by runner convention and each is independently named, ' +
      'so they are not the unnamed growth this rule exists to catch. Shared helpers under tests/ ' +
      'are still budgeted.',
  ],
]);

const SOURCE_EXTENSIONS = new Set([
  '.css',
  '.cjs',
  '.js',
  '.jsx',
  '.mjs',
  '.ts',
  '.tsx',
]);

const IGNORED_DIRECTORIES = new Set([
  '.git',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'logs',
]);

const roots = resolveRoots(process.argv.slice(2));
const violations = roots.flatMap(scanDirectory);

if (violations.length > 0) {
  process.stderr.write(formatViolations(violations));
  process.exit(1);
}

process.stdout.write(
  `Folder structure lint passed: ${roots.length} source root${roots.length === 1 ? '' : 's'} ` +
    `checked, max ${MAX_FILES_PER_FOLDER} source files per folder.\n`,
);

/** Resolves the trees to scan, defaulting to the repository's source roots. */
function resolveRoots(args) {
  const candidates = args.length > 0 ? args : SCAN_ROOTS;
  return candidates
    .map((candidate) =>
      isAbsolute(candidate) ? candidate : resolve(repoRoot, candidate),
    )
    .filter(existsSync);
}

/** Walks one tree, returning a violation per folder over the budget. */
function scanDirectory(directory) {
  if (!statSync(directory).isDirectory()) return [];
  const entries = readdirSync(directory, { withFileTypes: true });
  const sourceFiles = entries
    .filter(
      (entry) => entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)),
    )
    .map((entry) => entry.name)
    .sort();
  const childViolations = entries
    .filter(
      (entry) => entry.isDirectory() && !IGNORED_DIRECTORIES.has(entry.name),
    )
    .flatMap((entry) => scanDirectory(resolve(directory, entry.name)));

  const path = relative(repoRoot, directory) || '.';
  if (EXEMPTIONS.has(path)) return childViolations;
  if (sourceFiles.length <= MAX_FILES_PER_FOLDER) return childViolations;

  return [
    { path, count: sourceFiles.length, files: sourceFiles },
    ...childViolations,
  ];
}

/** Renders the failure so an agent can act on it without opening the script. */
function formatViolations(items) {
  const lines = [
    `Folder structure lint failed: ${items.length} folder${items.length === 1 ? '' : 's'} ` +
      `exceed ${MAX_FILES_PER_FOLDER} source files.`,
    '',
  ];

  for (const item of items.sort((left, right) =>
    left.path.localeCompare(right.path),
  )) {
    const preview = item.files.slice(0, 10).join(', ');
    const suffix =
      item.files.length > 10 ? `, +${item.files.length - 10} more` : '';
    lines.push(
      `- ${item.path} holds ${item.count} source files (max ${MAX_FILES_PER_FOLDER}).`,
    );
    lines.push(`  Files: ${preview}${suffix}`);
    lines.push(
      '  Action: group the files by the feature or domain they serve and move each group into a ' +
        'named subfolder, keeping a module and its helpers together. Update the imports. ' +
        'Do not raise the limit, do not add an exemption, and do not rename files to dodge the count.',
    );
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}
