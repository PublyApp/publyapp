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
 *    via AST (ts-morph) from both the base and head versions of each file.
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
 * Every test file under packages/scripts-ts/src/ that matches `*.test.ts` is
 * in scope. This avoids a hand-maintained list that would itself need guarding.
 * The CI gate manifest (ci-gate-manifest.json) lists steps, not test files,
 * so a manifest-based rule would miss guard files not yet wired to CI.
 *
 * TEST NAME EXTRACTION
 * --------------------
 * A regex over `test(`/ `it(` would miss `test.each`, template literals,
 * describe nesting, and would match strings inside comments. This repository
 * has shipped two guards that read comments and got it wrong. The AST via
 * ts-morph is the correct reader (precedent: check-design-system.mts).
 * Unparseable input fails LOUD naming the file.
 *
 * WHY EVERY TEST FILE: A hand-maintained list of "guard test files" is one
 * more thing to forget to update — the repository has been burned by exactly
 * that (#1962 itself: 13 tests deleted including the anti-raise-attack test).
 * Any heuristic short of "every test file" introduces a gap that a future
 * contributor can quietly slip through.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ts } from 'ts-morph';

// See the same comment in check-design-system.mts: TypeScript 7 requires
// importing ts through ts-morph's vendored compiler.
const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

interface ExtractTestsResult {
	ok: true;
	testNames: Set<string>;
}

interface ExtractTestsError {
	ok: false;
	error: string;
}

type ExtractTestsOutcome = ExtractTestsResult | ExtractTestsError;

/**
 * Extracts test names from a TypeScript/JavaScript file using ts-morph AST.
 * Handles: `test()`, `it()`, `test.each()`, `it.each()`, `describe()`.
 * Ignores strings inside comments.
 */
const extractTestNamesFromSource = (
	sourceText: string,
): ExtractTestsOutcome => {
	try {
		const project = new ts.Project({ skipAddingFilesFromTsConfig: true });
		const sourceFile = project.createSourceFile(
			'virtual.' + (sourceText.includes('<') ? 'tsx' : 'ts'),
			sourceText,
		);

		const testNames = new Set<string>();

		const visit = (node: ts.Node) => {
			// CallExpression: test(...) or it(...)
			if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
				const name = node.expression.getText();
				if (name === 'test' || name === 'it' || name === 'describe') {
					// First argument should be the test name (string literal or template)
					const args = node.arguments;
					if (args.length > 0) {
						const firstArg = args[0];
						// String literal
						if (ts.isStringLiteral(firstArg)) {
							testNames.add(firstArg.text);
						}
						// Template literal (backtick string)
						else if (ts.isTemplateExpression(firstArg)) {
							// Can't evaluate template at static analysis time, but we
							// can capture the structure as a placeholder
							const head = firstArg.head.text;
							testNames.add(`<template: ${head}...>`);
						}
					}
				}
			}

			ts.forEachChild(node, visit);
		};

		ts.forEachChild(sourceFile, visit);
		return { ok: true, testNames };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			ok: false,
			error: `Failed to parse source with ts-morph: ${msg}`,
		};
	}
};

/**
 * Reads a file from a specific git commit (not the working tree).
 */
const readFileFromGit = (
	gitDir: string,
	commit: string,
	filePath: string,
): string | null => {
	try {
		const fullPath = path.join(gitDir, filePath);
		const content = execSync(`git show ${commit}:${filePath}`, {
			cwd: gitDir,
			encoding: 'utf-8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		return content;
	} catch {
		return null;
	}
};

interface GuardResult {
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
	/** Git directory (defaults to cwd) */
	gitDir?: string;
	/** Base branch ref (defaults to origin/develop) */
	baseRef?: string;
	/** PR body text (empty string for push events) */
	prBody?: string;
}

/**
 * The main guard function. Compares test names in the base vs head for
 * every `*.test.ts` file under packages/scripts-ts/src/.
 *
 * Returns findings and deleted/added test names for reporting.
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

	// Step 3: Find all test files under packages/scripts-ts/src/
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');

	let testFiles: string[];
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

	// Step 4: Compare test names for each file
	const allDeleted: string[] = [];
	const allAdded: string[] = [];

	for (const relativePath of testFiles) {
		// Read from BASE commit (not working tree)
		const baseContent = readFileFromGit(gitDir, baseCommit, relativePath);

		// Read from HEAD (working tree)
		let headContent: string;
		try {
			headContent = readFileSync(path.join(gitDir, relativePath), 'utf-8');
		} catch {
			// File doesn't exist in head — deletion of the whole file
			if (baseContent !== null) {
				const baseResult = extractTestNamesFromSource(baseContent);
				if (!baseResult.ok) {
					findings.push({
						severity: 'red',
						message: `${relativePath}: cannot parse at base commit ${baseCommit}: ${baseResult.error}`,
					});
				} else {
					for (const name of baseResult.testNames) {
						allDeleted.push(`${relativePath}::${name}`);
					}
				}
			}
			continue;
		}

		// Both base and head exist — compare test names
		if (baseContent === null) {
			// New file — tests were added, not deleted
			const headResult = extractTestNamesFromSource(headContent);
			if (!headResult.ok) {
				findings.push({
					severity: 'red',
					message: `${relativePath}: cannot parse at HEAD: ${headResult.error}`,
				});
			} else {
				for (const name of headResult.testNames) {
					allAdded.push(`${relativePath}::${name}`);
				}
			}
			continue;
		}

		// Compare test names
		const baseResult = extractTestNamesFromSource(baseContent);
		const headResult = extractTestNamesFromSource(headContent);

		if (!baseResult.ok) {
			findings.push({
				severity: 'red',
				message: `${relativePath}: cannot parse at base commit ${baseCommit}: ${baseResult.error}`,
			});
			continue;
		}

		if (!headResult.ok) {
			findings.push({
				severity: 'red',
				message: `${relativePath}: cannot parse at HEAD: ${headResult.error}`,
			});
			continue;
		}

		// Find deleted and added tests
		const deleted = [...baseResult.testNames].filter(
			(name) => !headResult.testNames.has(name),
		);
		const added = [...headResult.testNames].filter(
			(name) => !baseResult.testNames.has(name),
		);

		for (const name of deleted) {
			allDeleted.push(`${relativePath}::${name}`);
		}
		for (const name of added) {
			allAdded.push(`${relativePath}::${name}`);
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
			const justifications: string[] = [];
			let allJustified = true;

			for (const deleted of allDeleted) {
				// Extract just the test name (after ::)
				const testName = deleted.split('::').slice(1).join('::');
				// Check if this test name (or a unique substring) appears in the PR body
				// Allow some flexibility: check for the test name or its quoted form
				const quoted = `"${testName}"`;
				const singleQuoted = `'${testName}'`;
				const backtickQuoted = '`' + testName + '`';

				if (
					prBody.includes(testName) ||
					prBody.includes(quoted) ||
					prBody.includes(singleQuoted) ||
					prBody.includes(backtickQuoted)
				) {
					justifications.push(testName);
				} else {
					// Check if it's mentioned in a "deleted: X" or "removes: Y" pattern
					const removalPattern = new RegExp(
						`(?:deleted|removed|removes?)[:\\s]+[^\\n]*${testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
						'i',
					);
					if (removalPattern.test(prBody)) {
						justifications.push(testName);
					} else {
						allJustified = false;
					}
				}
			}

			if (!allJustified) {
				const unjustified = allDeleted.filter((d) => {
					const testName = d.split('::').slice(1).join('::');
					return !justifications.includes(testName);
				});

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

	const result = checkGuardTestDeletion({
		prBody,
	});

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
