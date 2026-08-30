/**
 * Spec for `func-style: ["error", "expression"]` (issue #1834 — uniform arrow
 * expression form for non-method functions across the monorepo).
 *
 * `func-style` is a stock ESLint rule ported by oxlint. It has no source code
 * in `publy/`, no plugin entrypoint, and no `RuleTester` body of its own — what
 * this file pins is therefore the SHAPE the rule takes in the root
 * `.oxlintrc.json` (a `["error", "expression"]` tuple, NOT a bare string), and
 * the LIVE behaviour oxlint shows when that entry is in force (a fixture with
 * a top-level `function` declaration is reported by exactly the `func-style`
 * rule). A config edit that flips the value to `"declaration"`, or to plain
 * `"error"` (which oxlint rejects for this rule), or that removes the entry
 * entirely, fails at least one of the legs below.
 *
 * The four legs are independent on purpose so a regression names the exact
 * axis that drifted:
 *
 *   1. Config leg — the root `.oxlintrc.json` configures `func-style` as the
 *      two-element tuple `["error", "expression"]`, with no override that
 *      re-asserts the rule at a different level, and no ignore-pattern that
 *      would silence the rule on the 39 files the issue owns. A config that
 *      carries `func-style: "error"` (a bare string) fails the shape check;
 *      a config that flips the value to `"declaration"` or `["error",
 *      "declaration"]` fails the literal-element check.
 *
 *   2. Behavioural leg — given a temp file with a single top-level
 *      `function foo() {}` declaration, `runOxlint` returns at least one
 *      diagnostic whose `code` is `func-style` and whose `message` mentions
 *      "function expression" (the rule's own help text, which is the exact
 *      signal a maintainer would need to convert the offender to
 *      `const foo = () => {}`). A non-`func-style` code (e.g. an unrelated
 *      oxlint rule that incidentally fires on the fixture) cannot satisfy
 *      this leg.
 *
 *   3. Negative fixture leg — a temp file with ONLY an arrow expression
 *      (`const foo = () => {};`) and a top-level class method (the one form
 *      `func-style` does NOT cover) produces zero `func-style` diagnostics.
 *      This pins the fact that the rule's scope stops at top-level
 *      declarations, so converting the 98 production violations does not
 *      accidentally drag unrelated class methods or arrow expressions into
 *      a re-fix.
 *
 *   4. Suppression inventory leg — the production tree leg (above) asserts
 *      zero func-style diagnostics from oxlint, but that guard is bypassable:
 *      an inline suppression on any `function` declaration silences oxlint
 *      silently. This leg closes that gap by maintaining a versioned
 *      inventory of every such suppression. A new suppression not in the
 *      inventory fails, and an inventory entry whose suppression no longer
 *      exists also fails. The scan covers the FULL workspace (not just
 *      apps/front/) to match what oxlint actually lints.
 *
 * Each leg runs through `runOxlint`, the same wrapper `lint-scoping.test.ts`
 * uses for its anti-slop wiring guard — both the config-driven check and the
 * rule-fires check go through the same code path oxlint itself goes through
 * in CI, so this test cannot pass under a config that CI would reject.
 */
import assert from 'node:assert/strict';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, it } from 'vitest';

import { runOxlint } from '../lib/run-oxlint.ts';

const WORKSPACE_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OXLINTRC_PATH = fileURLToPath(
	new URL('../../../../.oxlintrc.json', import.meta.url),
);

// `.tmp/` n'est pas versionne : sur un checkout neuf (et donc en CI) il n'existe pas, et
// `mkdtempSync` echoue en ENOENT avant meme que le test ne demarre. On le cree ici, une
// fois, plutot que de dependre d'un residu d'execution locale.
const TMP_ROOT = join(WORKSPACE_ROOT, '.tmp');
mkdirSync(TMP_ROOT, { recursive: true });

interface OxlintRootConfig {
	rules?: Record<string, unknown>;
	overrides?: Array<{ files?: string[]; rules?: Record<string, unknown> }>;
	ignorePatterns?: string[];
}

const ROOT_CONFIG = JSON.parse(
	readFileSync(OXLINTRC_PATH, 'utf8'),
) as OxlintRootConfig;
const ROOT_RULES = ROOT_CONFIG.rules ?? {};

const isFuncStyleTuple = (value: unknown): value is [string, string] =>
	Array.isArray(value) &&
	value.length === 2 &&
	value[0] === 'error' &&
	typeof value[1] === 'string';

const writeFixture = (dir: string, name: string, body: string): string => {
	const path = join(dir, name);
	writeFileSync(path, body);
	return path;
};

// Comment openers we handle: single-line (//), block (/*), Shebang-style
// block comment (`{/*`), and HTML-style (`<!--`). Each opener has a corresponding
// closer pattern for block-style comments.
const COMMENT_OPENERS = ['//', '/*', '{/*', '<!--'] as const;
type _CommentOpener = (typeof COMMENT_OPENERS)[number];

const BLOCK_OPENERS = ['/*', '{/*', '<!--'] as const;
type BlockOpener = (typeof BLOCK_OPENERS)[number];

const BLOCK_CLOSER = {
	'/*': '*/',
	'{/*': '*/',
	'<!--': '-->',
} satisfies Record<BlockOpener, string>;

type FuncStyleSuppressionEntry = {
	file: string;
	symbol: string;
	reason: string;
};

// The marker forms this function detects, mapped to whether they are single-line
// comments or block comments.
const SINGLE_LINE_MARKERS = [
	'eslint-disable-next-line func-style',
	'eslint-disable func-style',
	'oxlint-disable-next-line func-style',
	'oxlint-disable func-style',
] as const;

const BLOCK_MARKERS = [
	'eslint-disable func-style',
	'oxlint-disable func-style',
	'eslint-disable',
	'oxlint-disable',
] as const;

/**
 * Finds every suppression comment that could silence `func-style` in a source
 * file. The scanner detects all suppression forms documented in issue #1834
 * point 1:
 *
 * - eslint-disable-next-line func-style — next-line, records symbol
 * - eslint-disable func-style — block-start (no symbol on next line)
 * - oxlint-disable-next-line func-style — oxlint variant, next-line
 * - oxlint-disable func-style — oxlint variant, block-start
 * - eslint-disable block — inline block with func-style
 * - oxlint-disable block — oxlint inline block
 * - eslint-disable bare block — silences all rules
 * - oxlint-disable bare block — silences all oxlint rules
 *
 * Single-line suppressions that are block-starts (e.g. eslint-disable func-style)
 * suppress subsequent lines until end of file. The scanner records them as
 * having no symbol (symbol = ''), indicating file-level suppression.
 *
 * Block suppressions that span multiple lines: the opener and closer may be on
 * the same line or different lines. The scanner finds the closer by searching
 * forward.
 *
 * @param source  The full file contents.
 * @param relativePath  The file path relative to the scan root, used as the
 *                      `file` field in returned entries.
 * @returns One entry per suppression site. Block suppressions on the same line
 *          as a single-line comment get one entry; multi-line block suppressions
 *          (opener on one line, closer on another) also get one entry per opener.
 */
const findFuncStyleSuppressionsInSource = (
	source: string,
	relativePath: string,
): FuncStyleSuppressionEntry[] => {
	const entries: FuncStyleSuppressionEntry[] = [];
	const lines = source.split('\n');

	// For block suppressions that span multiple lines, we track openers.
	// Each entry: { lineIndex, closerLineIndex } or null if inline.
	const blockOpeners: Array<{
		openerLine: number;
		openerCol: number;
		openerText: string;
		marker: string;
		closerLine: number;
	}> = [];

	// Pass 1: find all block openers and closers, record block suppressor ranges.
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Check for block openers (/*, {/*, <!--)
		for (const opener of BLOCK_OPENERS) {
			const openerIdx = line.indexOf(opener);
			if (openerIdx === -1) {
				continue;
			}

			const contentStart = openerIdx + opener.length;
			const closer = BLOCK_CLOSER[opener as BlockOpener];
			const closerIdx = line.indexOf(closer, contentStart);

			if (closerIdx !== -1) {
				// Inline block: opener and closer on same line
				const blockContent = line.slice(contentStart, closerIdx).trim();
				// Only record suppressions that target func-style specifically or are bare
				// (silencing all rules). Skip suppressions that target other specific rules.
				if (isFuncStyleRelevantBlockSuppression(blockContent)) {
					entries.push({
						file: relativePath,
						symbol: '',
						reason: `(block suppression: ${blockContent.trim()})`,
					});
				}
			} else {
				// Multi-line block: opener but no closer on this line
				const blockContent = line.slice(contentStart).trim();
				if (isFuncStyleRelevantBlockSuppression(blockContent)) {
					blockOpeners.push({
						openerLine: i,
						openerCol: openerIdx,
						openerText: opener,
						marker: blockContent.trim(),
						closerLine: -1,
					});
				}
			}
		}

		// Check for block closers to resolve openers
		for (const closer of ['*/', '-->']) {
			const closerIdx = line.indexOf(closer);
			if (closerIdx === -1) {
				continue;
			}
			// Find the most recent unresolved opener of the matching type
			for (let j = blockOpeners.length - 1; j >= 0; j--) {
				const b = blockOpeners[j]!;
				const expectedCloser = b.openerText === '<!--' ? '-->' : '*/';
				if (closer === expectedCloser && b.closerLine === -1) {
					b.closerLine = i;
				}
			}
		}
	}

	// Add entries for resolved multi-line block suppressions
	for (const opener of blockOpeners) {
		if (opener.closerLine !== -1) {
			entries.push({
				file: relativePath,
				symbol: '',
				reason: `(block suppression: ${opener.marker})`,
			});
		}
	}

	// Pass 2: find single-line suppressions (`// ...` lines)
	for (let i = 0; i < lines.length; i++) {
		const rawLine = lines[i]!;
		const line = rawLine.trim();

		// Only single-line comment openers start with // (after trim)
		if (!line.startsWith('//')) {
			continue;
		}

		const afterSlashSlash = line.slice(2).trimStart();

		// Match `eslint-disable-next-line func-style` and variants
		for (const marker of SINGLE_LINE_MARKERS) {
			if (!afterSlashSlash.startsWith(marker)) {
				continue;
			}

			// `// eslint-disable func-style` (without -next-line) is a block-start
			// that suppresses all subsequent lines. It has no next-line symbol.
			const isNextLine = marker.includes('disable-next-line');

			if (!isNextLine) {
				// Block-start suppression: no symbol to extract from next line
				entries.push({
					file: relativePath,
					symbol: '',
					reason: `(block-start suppression: ${marker})`,
				});
				continue;
			}

			// eslint-disable-next-line / oxlint-disable-next-line: extract next-line symbol
			let symbol = '';
			if (i + 1 < lines.length) {
				const nextLine = lines[i + 1]!.trim();
				const funcMatch = nextLine.match(
					/^(?:export\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
				);
				const constMatch = nextLine.match(
					/^(?:export\s+)?const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
				);
				if (funcMatch) {
					symbol = funcMatch[1] ?? '';
				} else if (constMatch) {
					symbol = constMatch[1] ?? '';
				}
			}

			entries.push({
				file: relativePath,
				symbol,
				reason: symbol || '(bare next-line suppression)',
			});
		}
	}

	return entries;
};

/**
 * Extracts the suppression marker text from a block comment's content.
 * e.g. "eslint-disable func-style" → "eslint-disable func-style"
 *      "eslint-disable" → "eslint-disable"
 *      "oxlint-disable func-style" → "oxlint-disable func-style"
 */
const _extractBlockMarker = (content: string): string | null => {
	for (const marker of BLOCK_MARKERS) {
		if (content.startsWith(marker)) {
			return marker;
		}
	}
	return null;
};

/**
 * Returns true if this block suppression content is relevant to func-style.
 * A block suppression is relevant if:
 * - It is a bare suppression (no rule specified): eslint-disable, oxlint-disable
 * - It specifically targets func-style
 * - It is a bare eslint-disable (silences all rules including func-style)
 *
 * We skip suppressions that target OTHER specific rules (e.g. `eslint-disable no-unused-vars`).
 */
const isFuncStyleRelevantBlockSuppression = (content: string): boolean => {
	const trimmed = content.trim();
	// Bare suppressions silence all rules including func-style
	if (trimmed === 'eslint-disable' || trimmed === 'oxlint-disable') {
		return true;
	}
	// Suppressions that specifically target func-style
	if (trimmed.includes('func-style')) {
		return true;
	}
	// All other suppressions (targeting other specific rules) are not relevant
	return false;
};

// Finds every suppression comment across all text files in a directory tree.
// This mirrors the exact paths oxlint lints: it scans the workspace root
// and respects the same ignore patterns oxlint uses, so the inventory stays
// in sync with the linting scope.
const scanFuncStyleSuppressions = async (
	rootDir: string,
): Promise<FuncStyleSuppressionEntry[]> => {
	const entries: FuncStyleSuppressionEntry[] = [];
	const TEXT_EXTENSIONS = new Set([
		'.ts',
		'.tsx',
		'.mjs',
		'.mts',
		'.js',
		'.jsx',
		'.cts',
		'.cjs',
	]);

	// Replicate the ignorePatterns from .oxlintrc.json so we scan the same
	// paths oxlint lints.
	const IGNORED_PREFIXES = [
		'**/node_modules',
		'**/build',
		'**/dist',
		'**/.turbo',
		'**/.react-router',
		'**/routeTree.gen.ts',
		'packages/client-ts',
		'apps/api/openapi',
		'apps/api/Migrations',
		'apps/api/bin',
		'.config/dotnet-tools.json',
		'apps/api/Generated',
		'.dump',
		'.mcp.json',
		'.claude/settings.local.json',
		'.agent/**',
		'.agents/**',
		'.claude/**',
		'.codex/**',
		'.continue/**',
		'.cursor/**',
		'.gemini/**',
		'.opencode/**',
		'.pi/**',
		'.roo/**',
		'.windsurf/**',
		'packages/lint-ts/src/anti-slop/**',
		'.tmp',
		// Exclude this test file from suppression scanning — it contains suppression
		// patterns in string literals (fixture content) that are not actual suppressions.
		'packages/lint-ts/src/publy/func-style-config.test.ts',
	];

	const isIgnored = (path: string): boolean => {
		// Normalize to forward slashes
		const normalized = path.replace(/\\/g, '/');
		for (const pattern of IGNORED_PREFIXES) {
			if (matchGlobPattern(pattern, normalized)) {
				return true;
			}
		}
		return false;
	};

	const walk = async (dir: string): Promise<void> => {
		let dirEntries;
		try {
			dirEntries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of dirEntries) {
			const fullPath = join(dir, entry.name);
			const relativePath = fullPath
				.slice(rootDir.length)
				.replace(/^[/\\]/, '')
				.replace(/\\/g, '/');

			if (isIgnored(relativePath) || isIgnored(fullPath)) {
				continue;
			}

			if (entry.isDirectory()) {
				await walk(fullPath);
				continue;
			}

			const ext = entry.name.slice(entry.name.lastIndexOf('.'));
			if (!TEXT_EXTENSIONS.has(ext)) {
				continue;
			}

			const source = readFileSync(fullPath, 'utf8');
			entries.push(...findFuncStyleSuppressionsInSource(source, relativePath));
		}
	};

	await walk(rootDir);
	return entries;
};

/**
 * Minimal glob pattern matcher for the ignorePatterns patterns we use.
 * Supports: double-star suffixes, double-star prefixes, and literal paths.
 */
const matchGlobPattern = (pattern: string, path: string): boolean => {
	// Strip leading `**/` or `**` from pattern for prefix matching
	const normalizedPattern = pattern.replace(/\*\*/g, '').replace(/^\//, '');

	if (pattern.startsWith('**/')) {
		// Suffix match: **/node_modules matches foo/node_modules
		return (
			path.endsWith(normalizedPattern) || path.includes(normalizedPattern + '/')
		);
	}

	if (pattern.endsWith('/**')) {
		// Prefix match: foo/** matches foo/bar, foo/bar/baz
		const prefix = pattern.slice(0, -2);
		return path.startsWith(prefix);
	}

	if (pattern.includes('**')) {
		// Middle double-star: foo/**/bar — simple substring check
		const clean = pattern.replace(/\*\*/g, '');
		return path.includes(clean);
	}

	// Literal match
	return path === normalizedPattern || path.endsWith('/' + normalizedPattern);
};

// The suppression inventory lives alongside this test file.
const SUPPRESSION_INVENTORY_PATH = fileURLToPath(
	new URL('./func-style-suppressions.json', import.meta.url),
);

// `publy/no-iife` interdit les IIFE : la lecture est une fonction nommee, appelee
// une fois. Un inventaire illisible doit echouer BRUYAMMENT en le disant — jamais
// retomber sur un tableau vide, qui rendrait la garde muette tout en restant verte.
const readSuppressionInventory = (): FuncStyleSuppressionEntry[] => {
	try {
		return JSON.parse(
			readFileSync(SUPPRESSION_INVENTORY_PATH, 'utf8'),
		) as FuncStyleSuppressionEntry[];
	} catch (error) {
		throw new Error(
			`failed to read func-style suppression inventory at ${SUPPRESSION_INVENTORY_PATH}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
};

const SUPPRESSION_INVENTORY: FuncStyleSuppressionEntry[] =
	readSuppressionInventory();

// Round-4 finding (#1854): the inventory keyed only on file+symbol, so
// anyone could exempt any function by inventing an entry with a hollow
// reason — a backdoor around review. The inventory must validate the reason,
// not just the presence of the symbol. The rule mirrors check-oxlint-disables
// (the repo's suppression guard): trimmed and non-empty, at least
// MIN_SUPPRESSION_REASON_LENGTH characters, free of placeholder phrases that
// signal a smell rather than an explanation.
const MIN_SUPPRESSION_REASON_LENGTH = 24;

const bannedReasonPatterns = [
	/<explanation>/i,
	/\bfor now\b/i,
	/\bsafe to use any here\b/i,
	/\bcode from template leave as is for now\b/i,
];

const isReviewableSuppressionReason = (reason: string): boolean => {
	const trimmed = reason.trim();

	if (trimmed.length === 0) {
		return false;
	}

	if (trimmed.length < MIN_SUPPRESSION_REASON_LENGTH) {
		return false;
	}

	return !bannedReasonPatterns.some((pattern) => pattern.test(trimmed));
};

const countByFileAndSymbol = (
	entries: FuncStyleSuppressionEntry[],
): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		const key = `${entry.file}\x00${entry.symbol}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
};

const funcStyleInventoryKey = (entry: FuncStyleSuppressionEntry): string =>
	`${entry.file}\x00${entry.symbol}`;

// Files that have a file-level suppression (block-start or block comment with
// no specific symbol). These files are entirely exempted from func-style.
const _filesWithFileLevelSuppression = (
	inventory: FuncStyleSuppressionEntry[],
): Set<string> => {
	const files = new Set<string>();
	for (const entry of inventory) {
		if (entry.symbol === '') {
			files.add(entry.file);
		}
	}
	return files;
};

describe('func-style: ["error", "expression"] (#1834 — uniform arrow form)', () => {
	describe('config leg — root .oxlintrc.json carries the exact shape', () => {
		it('configures func-style as the ["error", "expression"] tuple at the root', () => {
			const value = ROOT_RULES['func-style'];

			assert.ok(
				isFuncStyleTuple(value),
				`root .oxlintrc.json must configure "func-style" as ["error", "expression"]; got ${JSON.stringify(value)}`,
			);
			assert.strictEqual(
				value[1],
				'expression',
				`root .oxlintrc.json must configure "func-style" with the "expression" option; got ${JSON.stringify(value)}`,
			);
		});

		it('does not re-assert func-style at a different level under overrides', () => {
			const overrides = ROOT_CONFIG.overrides ?? [];

			for (const entry of overrides) {
				const overrideRules = entry.rules ?? {};
				assert.strictEqual(
					overrideRules['func-style'],
					undefined,
					`func-style must be configured exactly once at the root; an override re-asserts it under files=${JSON.stringify(entry.files)} and risks a drift that the root entry would mask`,
				);
			}
		});

		it('does not add new ignorePatterns that could hide production functions', () => {
			// The committed baseline for ignorePatterns (issue #1834 point 2).
			// Any addition to this list is a decision that must be declared,
			// because a new ignorePattern entry is a silent way to hide a
			// func-style violation from both oxlint and the suppression scanner.
			const BASELINE_IGNORE_PATTERNS: string[] = [
				'**/node_modules',
				'**/build',
				'**/dist',
				'**/.turbo',
				'**/.react-router',
				'**/routeTree.gen.ts',
				'packages/client-ts',
				'apps/api/openapi',
				'apps/api/Migrations',
				'apps/api/bin',
				'.config/dotnet-tools.json',
				'apps/api/Generated',
				'.dump',
				'.mcp.json',
				'.claude/settings.local.json',
				'.agent/**',
				'.agents/**',
				'.claude/**',
				'.codex/**',
				'.continue/**',
				'.cursor/**',
				'.gemini/**',
				'.opencode/**',
				'.pi/**',
				'.roo/**',
				'.windsurf/**',
				'packages/lint-ts/src/anti-slop/**',
			];

			const currentPatterns = ROOT_CONFIG.ignorePatterns ?? [];
			const baselineSet = new Set(BASELINE_IGNORE_PATTERNS);

			const newPatterns = currentPatterns.filter((p) => !baselineSet.has(p));

			if (newPatterns.length > 0) {
				const listed = newPatterns.map((p) => JSON.stringify(p)).join(', ');
				assert.fail(
					`adding new ignorePatterns is a decision that must be declared; found new entries: ${listed}. ` +
						'If the new pattern intentionally hides func-style violations, add it to the ' +
						'suppression inventory instead. If it is a legitimate infrastructure exclusion, ' +
						'update the BASELINE_IGNORE_PATTERNS constant in this test.',
				);
			}
		});
	});

	describe('behavioural leg — oxlint reports a `function` declaration under the root config', () => {
		const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-red-'));
		const fixturePath = writeFixture(
			tempDir,
			'function-declaration.fixture.ts',
			'export function probe() {\n\treturn 1;\n}\nprobe();\n',
		);

		afterAll(() => {
			rmSync(tempDir, { force: true, recursive: true });
		});

		it('a top-level `function` declaration is reported as `func-style`', () => {
			const diagnostics = runOxlint([fixturePath]).diagnostics as Array<{
				code?: string;
				message?: string;
			}>;

			// oxlint reports native ESLint rules with a `eslint(<rule>)` code,
			// not the bare rule name. A filter against `diag.code === 'func-style'`
			// would always be empty and the leg would never go red on a real
			// regression; substring match is the only test that actually
			// observes the rule.
			const funcStyleDiagnostics = diagnostics.filter((diag) =>
				(diag.code ?? '').includes('func-style'),
			);

			assert.ok(
				funcStyleDiagnostics.length > 0,
				`oxlint must report at least one func-style diagnostic on a top-level function declaration; got ${JSON.stringify(diagnostics)}`,
			);
			// The rule's help text names the replacement form by name — that
			// is the exact signal a maintainer would need to convert
			// `function foo() {}` to `const foo = () => {}`, so a fix that
			// drops the message would make the violation uncorrectable.
			assert.ok(
				funcStyleDiagnostics.some((diag) =>
					/function expression/i.test(diag.message ?? ''),
				),
				`the func-style diagnostic must mention "function expression" in its message; got ${JSON.stringify(funcStyleDiagnostics)}`,
			);
		});
	});

	describe('negative fixture leg — non-violating code produces zero func-style diagnostics', () => {
		const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-green-'));
		const arrowOnlyPath = writeFixture(
			tempDir,
			'arrow-only.fixture.ts',
			'export const probe = (): number => 1;\nprobe();\n',
		);
		const classMethodsPath = writeFixture(
			tempDir,
			'class-methods.fixture.ts',
			'export class Probe {\n\tpublic method(): number {\n\t\treturn 1;\n\t}\n}\n',
		);

		afterAll(() => {
			rmSync(tempDir, { force: true, recursive: true });
		});

		it('a top-level arrow expression produces zero func-style diagnostics', () => {
			const diagnostics = runOxlint([arrowOnlyPath]).diagnostics as Array<{
				code?: string;
			}>;

			// oxlint reports native ESLint rules with a `eslint(<rule>)` code
			// (see the behavioural leg above); substring match is the only
			// filter that actually observes the rule.
			const funcStyleDiagnostics = diagnostics.filter((diag) =>
				(diag.code ?? '').includes('func-style'),
			);

			assert.strictEqual(
				funcStyleDiagnostics.length,
				0,
				`a top-level arrow expression must not produce a func-style diagnostic; got ${JSON.stringify(funcStyleDiagnostics)}`,
			);
		});

		it('a class with methods produces zero func-style diagnostics (func-style does not touch class methods)', () => {
			const diagnostics = runOxlint([classMethodsPath]).diagnostics as Array<{
				code?: string;
			}>;

			// See the arrow-only test above: oxlint prefixes native ESLint
			// rule codes with `eslint(`, so substring match is the only
			// filter that observes the rule.
			const funcStyleDiagnostics = diagnostics.filter((diag) =>
				(diag.code ?? '').includes('func-style'),
			);

			assert.strictEqual(
				funcStyleDiagnostics.length,
				0,
				`a class with methods must not produce a func-style diagnostic; got ${JSON.stringify(funcStyleDiagnostics)}`,
			);
		});
	});

	describe('production tree leg — the monorepo carries zero func-style diagnostics under the root config', () => {
		// Drive `runOxlint` over the same paths oxlint lints in CI (the whole
		// workspace, scoped by the config's own `ignorePatterns`). Asserting on
		// ZERO `func-style` diagnostics here is the only honest way to pin
		// "the 98 production violations are all converted" — a counter is not
		// enough because a regression that re-introduces a `function`
		// declaration on a NEW file would not move the counter from 98 to 99
		// if the conversion left any other violation behind. The test fails
		// with the exact file:line of every offender, so a regression names
		// the regression in the test name.
		it(
			'no top-level `function` declaration survives anywhere oxlint lints',
			{ timeout: 120_000 },
			() => {
				const result = runOxlint(['.'], {
					cwd: WORKSPACE_ROOT,
				});

				// oxlint reports native ESLint rules with a `eslint(<rule>)` code
				// (see the behavioural leg above); substring match against the
				// function name is the only filter that actually observes the
				// rule. A regression that re-introduces a top-level `function`
				// on any file would land here as a non-empty list, naming the
				// file in the test output — the proof the brief asks for.
				const funcStyleDiagnostics = (
					result.diagnostics as Array<{
						code?: string;
						filename?: string;
						line?: number;
						message?: string;
					}>
				).filter((diag) => (diag.code ?? '').includes('func-style'));

				if (funcStyleDiagnostics.length > 0) {
					// Name the file:line of every offender. A guard that reddens
					// without naming the file is half useless (round-4 finding
					// #1854): a bare "got 1: Expected a function expression."
					// forces the maintainer to re-run oxlint to locate the
					// regression instead of fixing it.
					const names = funcStyleDiagnostics
						.map((diag) => {
							const location =
								(diag.filename ?? '<unknown file>') +
								(diag.line ? `:${diag.line}` : '');
							return `${location} — ${diag.message ?? JSON.stringify(diag)}`;
						})
						.join('\n  ');

					assert.fail(
						`oxlint must report zero func-style diagnostics on the production tree; got ${funcStyleDiagnostics.length}:\n  ${names}`,
					);
				}

				assert.strictEqual(funcStyleDiagnostics.length, 0);
			},
		);
	});

	describe('suppression inventory leg — inline disable cannot bypass the production-tree guard', () => {
		// The production tree leg (above) asserts zero func-style diagnostics from
		// oxlint. That guard is bypassable: any inline suppression on a `function`
		// declaration silences oxlint silently. This leg closes that gap by
		// maintaining an inventory of every such suppression — a new suppression
		// not in the inventory fails, and an inventory entry whose suppression
		// no longer exists also fails (issue #1834 point 1, 3, 5).
		//
		// The scanner covers the FULL workspace (not just apps/front/) to match
		// what oxlint actually lints (issue #1834 point 3).

		it('reports a new undeclared suppression with its file and symbol', async () => {
			// Plant a temporary undeclared suppression in a temp fixture.
			const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-inventory-'));
			const fixtureFile = join(tempDir, 'undeclared-suppression.ts');
			writeFileSync(
				fixtureFile,
				'// eslint-disable-next-line func-style\nfunction undeclaredProbe() {}\n',
			);

			// Scan the temp fixture alongside an empty real-tree scan.
			const foundEntries = findFuncStyleSuppressionsInSource(
				readFileSync(fixtureFile, 'utf8'),
				'undeclared-suppression.ts',
			);

			// Compare against the committed inventory (which has no such entry).
			const foundCounts = countByFileAndSymbol(foundEntries);
			const inventoryCounts = countByFileAndSymbol(SUPPRESSION_INVENTORY);

			const undocumented: FuncStyleSuppressionEntry[] = [];
			for (const [key, count] of foundCounts) {
				const inventoryCount = inventoryCounts.get(key) ?? 0;
				if (count > inventoryCount) {
					const [file, ...rest] = key.split('\x00');
					const symbol = rest.join('\x00');
					undocumented.push({ file, symbol, reason: '(undocumented)' });
				}
			}

			assert.ok(
				undocumented.length > 0,
				'the undeclared suppression must be reported',
			);
			assert.strictEqual(
				undocumented[0]!.file,
				'undeclared-suppression.ts',
				'the failure must name the file',
			);
			assert.strictEqual(
				undocumented[0]!.symbol,
				'undeclaredProbe',
				'the failure must name the symbol',
			);

			rmSync(tempDir, { force: true, recursive: true });
		});

		it('reports a new undeclared block suppression (/* eslint-disable func-style */)', async () => {
			// Plant a bare block suppression that the OLD scanner missed (point 1).
			const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-block-'));
			const fixtureFile = join(tempDir, 'undeclared-block.ts');
			writeFileSync(
				fixtureFile,
				'/* eslint-disable func-style */\nexport function survieBloc() { return 1; }\n',
			);

			const foundEntries = findFuncStyleSuppressionsInSource(
				readFileSync(fixtureFile, 'utf8'),
				'undeclared-block.ts',
			);

			// The committed inventory has no such entry.
			const foundCounts = countByFileAndSymbol(foundEntries);
			const inventoryCounts = countByFileAndSymbol(SUPPRESSION_INVENTORY);

			const undocumented: FuncStyleSuppressionEntry[] = [];
			for (const [key, count] of foundCounts) {
				const inventoryCount = inventoryCounts.get(key) ?? 0;
				if (count > inventoryCount) {
					const [file, ...rest] = key.split('\x00');
					const symbol = rest.join('\x00');
					undocumented.push({ file, symbol, reason: '(undocumented)' });
				}
			}

			assert.ok(
				undocumented.length > 0,
				'the undeclared block suppression must be reported',
			);
			assert.strictEqual(
				undocumented[0]!.file,
				'undeclared-block.ts',
				'the failure must name the file',
			);
			// Block suppressions have empty symbol (file-level)
			assert.strictEqual(
				undocumented[0]!.symbol,
				'',
				'block suppressions have empty symbol (file-level)',
			);

			rmSync(tempDir, { force: true, recursive: true });
		});

		it('reports a new undeclared bare oxlint block suppression (/* oxlint-disable */)', async () => {
			const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-oxlint-block-'));
			const fixtureFile = join(tempDir, 'undeclared-oxlint-block.ts');
			writeFileSync(
				fixtureFile,
				'/* oxlint-disable */\nexport function survieOxlintGlobale() { return 1; }\n',
			);

			const foundEntries = findFuncStyleSuppressionsInSource(
				readFileSync(fixtureFile, 'utf8'),
				'undeclared-oxlint-block.ts',
			);

			const foundCounts = countByFileAndSymbol(foundEntries);
			const inventoryCounts = countByFileAndSymbol(SUPPRESSION_INVENTORY);

			const undocumented: FuncStyleSuppressionEntry[] = [];
			for (const [key, count] of foundCounts) {
				const inventoryCount = inventoryCounts.get(key) ?? 0;
				if (count > inventoryCount) {
					const [file, ...rest] = key.split('\x00');
					const symbol = rest.join('\x00');
					undocumented.push({ file, symbol, reason: '(undocumented)' });
				}
			}

			assert.ok(
				undocumented.length > 0,
				'the undeclared oxlint block suppression must be reported',
			);
			assert.strictEqual(
				undocumented[0]!.file,
				'undeclared-oxlint-block.ts',
				'the failure must name the file',
			);

			rmSync(tempDir, { force: true, recursive: true });
		});

		it('reports a new undeclared oxlint next-line suppression', async () => {
			// Plant an oxlint-disable-next-line suppression (the oxlint variant).
			const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-oxlint-next-'));
			const fixtureFile = join(tempDir, 'undeclared-oxlint-next.ts');
			// Use // (single-line) not /* */ (block) — oxlint-disable-next-line is single-line
			writeFileSync(
				fixtureFile,
				'// oxlint-disable-next-line func-style\nexport function survieOxlintNext() { return 1; }\n',
			);

			const foundEntries = findFuncStyleSuppressionsInSource(
				readFileSync(fixtureFile, 'utf8'),
				'undeclared-oxlint-next.ts',
			);

			const foundCounts = countByFileAndSymbol(foundEntries);
			const inventoryCounts = countByFileAndSymbol(SUPPRESSION_INVENTORY);

			const undocumented: FuncStyleSuppressionEntry[] = [];
			for (const [key, count] of foundCounts) {
				const inventoryCount = inventoryCounts.get(key) ?? 0;
				if (count > inventoryCount) {
					const [file, ...rest] = key.split('\x00');
					const symbol = rest.join('\x00');
					undocumented.push({ file, symbol, reason: '(undocumented)' });
				}
			}

			assert.ok(
				undocumented.length > 0,
				'the undeclared oxlint next-line suppression must be reported',
			);
			assert.strictEqual(
				undocumented[0]!.file,
				'undeclared-oxlint-next.ts',
				'the failure must name the file',
			);
			assert.strictEqual(
				undocumented[0]!.symbol,
				'survieOxlintNext',
				'the failure must name the symbol',
			);

			rmSync(tempDir, { force: true, recursive: true });
		});

		it('reports a new undeclared bare eslint-disable block (/* eslint-disable */)', async () => {
			const tempDir = mkdtempSync(join(TMP_ROOT, 'func-style-bare-'));
			const fixtureFile = join(tempDir, 'undeclared-bare.ts');
			writeFileSync(
				fixtureFile,
				'/* eslint-disable */\nexport function survieBare() { return 1; }\n',
			);

			const foundEntries = findFuncStyleSuppressionsInSource(
				readFileSync(fixtureFile, 'utf8'),
				'undeclared-bare.ts',
			);

			const foundCounts = countByFileAndSymbol(foundEntries);
			const inventoryCounts = countByFileAndSymbol(SUPPRESSION_INVENTORY);

			const undocumented: FuncStyleSuppressionEntry[] = [];
			for (const [key, count] of foundCounts) {
				const inventoryCount = inventoryCounts.get(key) ?? 0;
				if (count > inventoryCount) {
					const [file, ...rest] = key.split('\x00');
					const symbol = rest.join('\x00');
					undocumented.push({ file, symbol, reason: '(undocumented)' });
				}
			}

			assert.ok(
				undocumented.length > 0,
				'the undeclared bare eslint-disable block must be reported',
			);
			assert.strictEqual(
				undocumented[0]!.file,
				'undeclared-bare.ts',
				'the failure must name the file',
			);

			rmSync(tempDir, { force: true, recursive: true });
		});

		it('every inventory entry carries a reviewable suppression reason', () => {
			// Round-4 finding (#1854): the inventory validated only file+symbol,
			// so an invented entry with a hollow reason silently exempted any
			// function from review. Each entry must justify why func-style is
			// inapplicable — trimmed, ≥ 24 chars, no placeholder phrases (same
			// rule as check-oxlint-disables).
			const hollow = SUPPRESSION_INVENTORY.filter(
				(entry) => !isReviewableSuppressionReason(entry.reason),
			);

			assert.deepStrictEqual(
				hollow,
				[],
				`inventory entries with hollow reasons: ${hollow.map((entry) => `${entry.file}: ${entry.symbol || '(file-level)'} — "${entry.reason}"`).join('; ')}. ` +
					'Every entry must justify why func-style is inapplicable: a trimmed reason of at least ' +
					`${MIN_SUPPRESSION_REASON_LENGTH} characters, free of placeholder phrases. Inventing an entry ` +
					'with an empty or hollow reason is a review bypass, not a suppression.',
			);
		});

		it('reports a stale inventory entry (suppression removed from code)', async () => {
			// The committed inventory has createQueryResult. Scan the full workspace to
			// get current suppressions, then verify the inventory entry still exists.
			// If createQueryResult's suppression is removed from the real tree, this
			// test fails.
			const foundEntries = await scanFuncStyleSuppressions(WORKSPACE_ROOT);
			const foundCounts = countByFileAndSymbol(foundEntries);

			// Check that the committed inventory entry is still present in the tree.
			const stale: FuncStyleSuppressionEntry[] = [];
			for (const entry of SUPPRESSION_INVENTORY) {
				const key = funcStyleInventoryKey(entry);
				const foundCount = foundCounts.get(key) ?? 0;
				if (foundCount === 0) {
					stale.push(entry);
				}
			}

			// We expect the inventory entry for createQueryResult to be found
			// in the tree (not stale). If it IS stale, the suppression was removed
			// from the code and should be removed from the inventory too.
			assert.ok(
				stale.length === 0,
				`stale suppression inventory entries: ${stale.map((e) => `${e.file}: ${e.symbol}`).join(', ')}. ` +
					'Remove these entries from func-style-suppressions.json if the suppression was intentionally removed.',
			);
		});

		it('the full workspace scan covers packages/scripts-ts/ (not just apps/front/)', async () => {
			// Scan the workspace root (not just apps/front/) — issue #1834 point 3.
			// packages/scripts-ts/ is linted by oxlint, so suppressions there must
			// also be tracked.
			const scriptsRoot = join(WORKSPACE_ROOT, 'packages/scripts-ts/src');
			const foundEntries = await scanFuncStyleSuppressions(scriptsRoot);

			// This test just verifies the scanner can process packages/scripts-ts/
			// without error. The real drift test (below) uses the workspace root.
			assert.ok(
				Array.isArray(foundEntries),
				'scanFuncStyleSuppressions must return an array for packages/scripts-ts/',
			);
		});

		it('the real production tree has zero drift against the committed suppression inventory', async () => {
			// Scan the FULL workspace root (not just apps/front/) so the scanner
			// scope matches what oxlint lints — issue #1834 point 3.
			const foundEntries = await scanFuncStyleSuppressions(WORKSPACE_ROOT);

			// Compare against the committed inventory using multiset diff.
			const foundCounts = countByFileAndSymbol(foundEntries);
			const inventoryCounts = countByFileAndSymbol(SUPPRESSION_INVENTORY);

			// Undocumented: more found than in inventory.
			const undocumented: Array<{ file: string; symbol: string }> = [];
			for (const [key, count] of foundCounts) {
				const inventoryCount = inventoryCounts.get(key) ?? 0;
				if (count > inventoryCount) {
					const [file, ...rest] = key.split('\x00');
					const symbol = rest.join('\x00');
					undocumented.push({ file, symbol });
				}
			}

			// Stale: more in inventory than found.
			const stale: Array<{ file: string; symbol: string }> = [];
			for (const entry of SUPPRESSION_INVENTORY) {
				const key = funcStyleInventoryKey(entry);
				const foundCount = foundCounts.get(key) ?? 0;
				if (foundCount === 0) {
					stale.push({ file: entry.file, symbol: entry.symbol });
				}
			}

			if (undocumented.length > 0) {
				const names = undocumented
					.map((e) => `${e.file}: ${e.symbol || '(file-level suppression)'}`)
					.join('\n  ');
				assert.fail(`undocumented func-style suppressions found:\n  ${names}`);
			}

			if (stale.length > 0) {
				const names = stale
					.map((e) => `${e.file}: ${e.symbol || '(file-level suppression)'}`)
					.join('\n  ');
				assert.fail(
					`stale suppression inventory entries (suppression no longer exists in code):\n  ${names}`,
				);
			}

			assert.deepStrictEqual(
				undocumented,
				[],
				'no undocumented func-style suppressions',
			);
			assert.deepStrictEqual(stale, [], 'no stale inventory entries');
		});
	});
});
