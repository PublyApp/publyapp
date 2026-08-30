/**
 * Guard test deletion detection (#1962).
 *
 * WHAT THIS PROVES
 * -----------------
 * A pull request that deletes test cases from a guard's test file must be
 * caught and can only pass if the PR body explicitly names the deleted test(s).
 *
 * Three requirements from the issue:
 *
 * 1. Compare NAMES, not counts. A PR that deletes three tests and adds three
 *    others keeps the count and must still be caught. Test names are extracted
 *    via ts-morph AST (the same compiler this repo already ships in
 *    apps/front/scripts/guards/check-design-system.mts) from both the base and
 *    head versions of each file — not from a regex that mistakes a test name
 *    inside a comment or a `test.each` template literal for a real call.
 *
 * 2. Read the REAL base. The base tree is resolved through
 *    `git merge-base origin/<base> HEAD` and each file is read from THAT commit.
 *    A guard that reads its own tree is defeated by the same raise attack the
 *    deleted #1890 tests were designed to prevent.
 *
 *    Two consequences handled:
 *    - `actions/checkout` fetches ONE commit by default, and two depth-1 tips
 *      have no common ancestor. The CI job MUST use `fetch-depth: 0`. This
 *      guard fails loudly when `git merge-base` cannot resolve.
 *    - If the merge base cannot be resolved, the guard FAILS LOUD naming the
 *      cause and the repair.
 *
 * 3. The escape hatch must be EXPLICIT and MATCHED. Deleting a test is
 *    sometimes right. The guard's job is to force the deletion to be STATED.
 *    A deletion passes only when the PR body names the deleted test — a
 *    blanket sentence like "removed some tests" does NOT satisfy the check.
 *    On a `push` event (no PR body), deletions are not allowed.
 *
 * SCOPE DECISION
 * --------------
 * Every test file under packages/scripts-ts/src/ that matches the glob
 * `*.test.ts` is in scope. This directory is the single home of the CI gate guard suites —
 * the same files that front-ci.yml::gate-selftest::Run CI gate guard tests
 * executes, and the same files whose deletion caused incident #1945. The scope
 * is NOT arbitrary: a test deleted from any of these files weakens a guard
 * that itself runs in CI, and a guard that does not run cannot catch its own
 * deletion. Front-end guard tests under apps/front/scripts/guards/ and
 * apps/front/src/test-files are out of scope for THIS guard because they are
 * enforced by separate front-ci supply-chain and test jobs that carry their
 * own deletion-detection surfaces; widening the scope would duplicate coverage
 * and conflate two independently-gated surfaces. The scope is declared here as
 * a constant so a future widening is a one-line, reviewed edit rather than an
 * implicit drift.
 *
 * WHY ts-MORPH AST (NOT REGEX)
 * ----------------------------
 * The round-1 regex reader failed on shapes that are routine in this
 * repository's test files:
 *   - `test.each([...])('name %s', ...)` and tagged-template forms: a regex
 *     that hunts for `test(` followed by a string literal cannot see the
 *     description that follows the `.each()` call.
 *   - Computed/interpolated names: `test(`${prefix} does X`)` — the
 *     description is a template expression, not a string literal, so a literal-
 *     matching regex returns empty.
 *   - Comments and strings: `test('real')` next to a comment containing
 *     `test('commented')` — stripping via regex is itself fragile against a
 *     string containing a double-slash or a regex literal containing block-
 *     comment markers.
 *   - `describe` nesting: `describe('A', () => { test('name') })` requires
 *     tree traversal to associate the name with the right parent.
 *
 * ts-morph parses the source into a real syntax tree (vendored, version-pinned
 * compiler — already a dependency, see apps/front/scripts/guards/check-design-system.mts),
 * so test names are extracted by walking `CallExpression` nodes whose
 * identifier is `test`, `it`, or `describe`, and reading the first argument
 * as a string literal, template literal, or tagged-template description. No
 * regex stripping of comments/strings is needed — the compiler already
 * classified what is a string, what is a comment, and what is code.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

// Scope is deliberately a single directory — see SCOPE DECISION above.
const TEST_GLOB_ROOT = 'packages/scripts-ts/src';

// ts-morph's SourceFile type omits parseDiagnostics, but its vendored compiler
// always populates it (verified behaviour this guard relies on). Extending the
// public type keeps the single widening assertion comparable instead of an
// `as unknown as` chain that discards type evidence.
interface SourceFileWithParseDiagnostics extends ts.SourceFile {
	parseDiagnostics: readonly ts.Diagnostic[];
}

/**
 * Extracts test/description names from a TypeScript/JavaScript source string
 * using the ts-morph compiler. This walks the real syntax tree rather than
 * regex-matching text, so it correctly handles:
 * - `test.each([...])('name %s', ...)` and tagged-template forms
 * - Computed/interpolated names (`test(`${prefix} does X`)`)
 * - Comments and strings (the compiler classifies these; no stripping needed)
 * - `describe` nesting (tree traversal, not text patterns)
 *
 * For a template literal that contains interpolation (e.g.
 * `` test(`${prefix} does X`) ``), the literal text portions are joined with
 * the interpolation replaced by a placeholder, yielding a best-effort name.
 */
export const extractTestNamesFromSource = (
	sourceText: string,
	fileName = 'temp.ts',
): Set<string> => {
	const sourceFile = ts.createSourceFile(
		fileName,
		sourceText,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);

	// A file we cannot parse for test names must FAIL LOUD — otherwise a
	// malformed TS file would silently produce an empty name set and the guard
	// would report "no deletions" when it simply could not see the tests.
	const { parseDiagnostics } = sourceFile as SourceFileWithParseDiagnostics;
	if (parseDiagnostics.length > 0) {
		throw new Error(
			`cannot parse source for test names: ${ts.flattenDiagnosticMessageText(parseDiagnostics[0].messageText, ' ')}`,
		);
	}

	const testNames = new Set<string>();

	const walk = (node: ts.Node): void => {
		if (ts.isCallExpression(node)) {
			const callee = node.expression;

			// Match `test(...)`, `it(...)`, `describe(...)`, and also
			// `test.each(...)` / `it.each(...)` / `describe.each(...)` which
			// produce either:
			//   CallExpression → CallExpression('name', fn)  [array form]
			//   CallExpression → TaggedTemplateExpression('name', fn)  [tagged template]
			// The outer call's `expression` is either a CallExpression (whose
			// own `expression` is the `.each` PropertyAccessExpression) or a
			// TaggedTemplateExpression (whose `tag` is the `.each`
			// PropertyAccessExpression).
			let testIdentifier: string | null = null;

			const getIdentifierFromEach = (expr: ts.Expression): string | null => {
				if (ts.isPropertyAccessExpression(expr)) {
					// ts-morph's TypeScript uses `expression` (not `object`) for
					// the left-hand side of a PropertyAccessExpression.
					const objectExpr = expr.expression;
					if (
						expr.name.text === 'each' &&
						ts.isIdentifier(objectExpr) &&
						(objectExpr.text === 'test' ||
							objectExpr.text === 'it' ||
							objectExpr.text === 'describe')
					) {
						return objectExpr.text;
					}
				}
				return null;
			};

			if (ts.isIdentifier(callee)) {
				const name = callee.text;
				if (name === 'test' || name === 'it' || name === 'describe') {
					testIdentifier = name;
				}
			} else if (ts.isCallExpression(callee)) {
				// `test.each([...])('name', fn)` — the outer callee is the
				// CallExpression `test.each([...])`, whose expression is
				// `test.each` (PropertyAccessExpression).
				testIdentifier = getIdentifierFromEach(callee.expression);
			} else if (ts.isTaggedTemplateExpression(callee)) {
				// `test.each\`...\`('name', fn)` — the outer callee is the
				// TaggedTemplateExpression whose tag is `test.each`.
				testIdentifier = getIdentifierFromEach(callee.tag);
			}

			if (testIdentifier !== null) {
				const firstNameArg = node.arguments[0];
				if (firstNameArg !== undefined) {
					const name = extractCallName(firstNameArg, sourceFile);
					if (name !== null && name.length > 0) {
						testNames.add(name);
					}
				}
			}
		}

		node.forEachChild(walk);
	};

	walk(sourceFile);

	return testNames;
};

/**
 * Extracts the human-readable name from a test/it/describe call's first
 * argument. Handles string literals, template literals (including
 * interpolation), and returns null for non-string arguments (e.g. a function
 * expression when the name is derived from an attached `.name`).
 */
const extractCallName = (
	arg: ts.Node,
	sourceFile: ts.SourceFile,
): string | null => {
	if (ts.isStringLiteral(arg)) {
		return arg.text;
	}

	if (ts.isTemplateExpression(arg)) {
		// Multi-part template literal with interpolation:
		// `test(`${prefix} does X`)` — join the literal parts, replacing
		// interpolated expressions with a placeholder marker.
		const parts: string[] = [];
		// In ts-morph's TypeScript, TemplateHead has `text` directly (no
		// `.literal` wrapper like the reference compiler's API).
		parts.push(arg.head.text);
		for (const templateSpan of arg.templateSpans) {
			// Represent the interpolated expression as a placeholder so the
			// resulting name is still distinctive and comparable across base/head.
			parts.push('{…}');
			// TemplateMiddle / LastTemplateToken both have `text` directly.
			parts.push(templateSpan.literal.text);
		}
		return parts.join('');
	}

	if (ts.isNoSubstitutionTemplateLiteral(arg)) {
		// Plain template literal with no interpolation.
		return arg.text;
	}

	// Non-string first argument (e.g. a function reference, a numeric
	// constant) — skip it. A test without a string name is outside this
	// guard's concern.
	return null;
};

/**
 * Reads a file from a specific git commit (not the working tree).
 * Returns null if the file does not exist at that commit.
 */
const readFileFromGit = (
	gitDir: string,
	commit: string,
	filePath: string,
): string | null => {
	try {
		return execSync(`git show ${commit}:${filePath}`, {
			cwd: gitDir,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch {
		return null;
	}
};

export interface GuardResult {
	findings: Finding[];
	deletedTests: string[];
	addedTests: string[];
	baseCommit: string;
	headCommit: string;
}

interface Finding {
	severity: 'red' | 'green';
	message: string;
}

interface GuardTestDeletionOptions {
	/** Git directory (defaults to rootDir) */
	gitDir?: string;
	/** Base branch ref (defaults to origin/develop) */
	baseRef?: string;
	/** PR body text (empty string for push events) */
	prBody?: string;
}

/**
 * The main guard function. Compares test names in the base vs head for
 * every `*.test.ts` file under packages/scripts-ts/src/.
 */
export const checkGuardTestDeletion = (
	options: GuardTestDeletionOptions = {},
): GuardResult => {
	const { gitDir = rootDir, baseRef = 'origin/develop', prBody = '' } = options;

	const findings: Finding[] = [];
	let baseCommit: string;
	let headCommit: string;

	// Step 1: Resolve merge base (the real base, not HEAD)
	try {
		baseCommit = execSync(`git merge-base ${baseRef} HEAD`, {
			cwd: gitDir,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
	} catch {
		findings.push({
			severity: 'red',
			message:
				`Cannot resolve merge base between ${baseRef} and HEAD. ` +
				`Ensure the base branch is fetched (fetch-depth: 0 checkout). ` +
				`Try: git fetch origin develop && git merge-base origin/develop HEAD`,
		});
		return {
			findings,
			deletedTests: [],
			addedTests: [],
			baseCommit: 'UNRESOLVED',
			headCommit: 'UNRESOLVED',
		};
	}

	// Step 2: Get HEAD commit
	try {
		headCommit = execSync('git rev-parse HEAD', {
			cwd: gitDir,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		}).trim();
	} catch {
		headCommit = 'UNRESOLVED';
	}

	// Step 3: Find all *.test.ts files under packages/scripts-ts/src/ that
	// exist in EITHER base or head. We must check the git tree (not just the
	// working tree via `find`) because a file deleted in HEAD won't appear in
	// `find` output but still needs its base-side test names compared.
	let testFiles: string[];
	try {
		testFiles = execSync(
			`git diff --name-only --diff-filter=ADMR ${baseCommit} HEAD -- "packages/scripts-ts/src/" | sort`,
			{ cwd: gitDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
		)
			.trim()
			.split('\n')
			.filter((f) => f.endsWith('.test.ts') && f.length > 0);
	} catch {
		// Fallback: if the diff fails (e.g. base == head), fall back to
		// enumerating files present in the working tree.
		try {
			testFiles = execSync(
				`find packages/scripts-ts/src -name "*.test.ts" -type f | sort`,
				{ cwd: gitDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			)
				.trim()
				.split('\n')
				.filter((f) => f.length > 0);
		} catch {
			findings.push({
				severity: 'red',
				message: 'Cannot enumerate test files under packages/scripts-ts/src/',
			});
			return {
				findings,
				deletedTests: [],
				addedTests: [],
				baseCommit,
				headCommit,
			};
		}
	}

	// Also include ALL test files (even unchanged ones) so we catch cases
	// where base and head resolve to the same commit but a file was modified
	// in the working tree without a commit. Fall back to working tree discovery.
	if (testFiles.length === 0) {
		try {
			testFiles = execSync(
				`find packages/scripts-ts/src -name "*.test.ts" -type f | sort`,
				{ cwd: gitDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
			)
				.trim()
				.split('\n')
				.filter((f) => f.length > 0);
		} catch {
			testFiles = [];
		}
	}

	// Step 4: Compare test names for each file
	const allDeleted: string[] = [];
	const allAdded: string[] = [];

	for (const relativePath of testFiles) {
		// Read from BASE commit (not working tree)
		const baseContent = readFileFromGit(gitDir, baseCommit, relativePath);

		// Read from HEAD commit (not working tree — working tree may have
		// uncommitted changes that mask what the PR actually contains)
		const headContent = readFileFromGit(gitDir, headCommit, relativePath);

		if (headContent === null) {
			// File deleted in head
			if (baseContent !== null) {
				const baseNames = extractTestNamesFromSource(baseContent, relativePath);
				for (const name of baseNames) {
					allDeleted.push(`${relativePath}::${name}`);
				}
			}
			continue;
		}

		if (baseContent === null) {
			// New file — tests were added, not deleted
			const headNames = extractTestNamesFromSource(headContent, relativePath);
			for (const name of headNames) {
				allAdded.push(`${relativePath}::${name}`);
			}
			continue;
		}

		// Both exist — compare test names
		const baseNames = extractTestNamesFromSource(baseContent, relativePath);
		const headNames = extractTestNamesFromSource(headContent, relativePath);

		// Find deleted tests (in base but not in head)
		for (const name of baseNames) {
			if (!headNames.has(name)) {
				allDeleted.push(`${relativePath}::${name}`);
			}
		}

		// Find added tests (in head but not in base)
		for (const name of headNames) {
			if (!baseNames.has(name)) {
				allAdded.push(`${relativePath}::${name}`);
			}
		}
	}

	// Step 5: Check if deletions are justified by PR body
	if (allDeleted.length > 0) {
		if (prBody.trim().length === 0) {
			// Push event — no PR body
			findings.push({
				severity: 'red',
				message:
					`Deleted ${allDeleted.length} test(s) without a PR body justification. ` +
					`Named deleted tests:\n${allDeleted.map((t) => `  - ${t}`).join('\n')}`,
			});
		} else {
			// Check if each deleted test is named in the PR body
			const unjustified: string[] = [];

			for (const deleted of allDeleted) {
				const testName = deleted.split('::').slice(1).join('::');

				// Check various quoting styles
				const isJustified =
					prBody.includes(testName) ||
					prBody.includes(`"${testName}"`) ||
					prBody.includes(`'${testName}'`) ||
					prBody.includes(`\`${testName}\``);

				if (!isJustified) {
					unjustified.push(deleted);
				}
			}

			if (unjustified.length > 0) {
				findings.push({
					severity: 'red',
					message:
						`${unjustified.length} deleted test(s) not named in PR body. ` +
						`All deletions must be explicitly stated. ` +
						`Unnamed deleted tests:\n${unjustified.map((t) => `  - ${t}`).join('\n')}`,
				});
			}
		}
	}

	return {
		findings,
		deletedTests: allDeleted,
		addedTests: allAdded,
		baseCommit,
		headCommit,
	};
};

/**
 * CLI entrypoint.
 */
const isDirectRun =
	process.argv[1] &&
	path.basename(process.argv[1]) === 'check-guard-test-deletion.ts';

if (isDirectRun) {
	// Read PR body from environment (set by the CI job)
	const prBody =
		process.env.PR_BODY ||
		process.env.GITHUB_PR_BODY ||
		process.env.INPUT_PR_BODY ||
		'';

	const result = checkGuardTestDeletion({ prBody });

	if (result.findings.some((f) => f.severity === 'red')) {
		console.error('Guard test deletion guard: FAILED');
		for (const finding of result.findings) {
			console.error(`  [${finding.severity.toUpperCase()}] ${finding.message}`);
		}
		console.error(`\nBase commit: ${result.baseCommit}`);
		console.error(`Head commit: ${result.headCommit}`);
		console.error(`\nDeleted tests (${result.deletedTests.length}):`);
		for (const t of result.deletedTests) {
			console.error(`  - ${t}`);
		}
		if (result.addedTests.length > 0) {
			console.error(`\nAdded tests (${result.addedTests.length}):`);
			for (const t of result.addedTests) {
				console.error(`  + ${t}`);
			}
		}
		process.exit(1);
	}

	console.log('Guard test deletion guard: PASSED');
	console.log(`Base commit: ${result.baseCommit}`);
	console.log(`Head commit: ${result.headCommit}`);
	if (result.deletedTests.length > 0) {
		console.log(
			`\nDeleted tests (${result.deletedTests.length}) — justified by PR body:`,
		);
		for (const t of result.deletedTests) {
			console.log(`  - ${t}`);
		}
	}
	if (result.addedTests.length > 0) {
		console.log(`\nAdded tests (${result.addedTests.length}):`);
		for (const t of result.addedTests) {
			console.log(`  + ${t}`);
		}
	}
}
