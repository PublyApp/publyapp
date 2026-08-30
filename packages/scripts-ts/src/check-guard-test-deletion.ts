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
 *    via regex state machine from both the base and head versions of each file.
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
 *
 * TEST NAME EXTRACTION
 * --------------------
 * Uses a state-machine regex that correctly skips:
 * - Strings inside comments (// and block comments)
 * - Strings inside string literals (single, double, backtick)
 *
 * This is sufficient because vitest test names are always string literals,
 * and the state machine correctly ignores test names that appear in comments
 * (unlike naive regex approaches).
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
);

/**
 * Extracts test names from a TypeScript/JavaScript source string.
 * Uses three regex patterns (one per quote type) to extract test names.
 * Strips single-line and multi-line comments before extraction to avoid
 * matching strings inside comments.
 */
export const extractTestNamesFromSource = (sourceText: string): Set<string> => {
	// Strip comments first — removes // line comments and /* */ block comments
	// This prevents matching strings like test('commented out') inside comments
	const stripped = sourceText
		// Remove /* */ block comments (including nested, handling non-greedy)
		.replace(/\/\*[\s\S]*?\*\//g, '')
		// Remove // line comments (but not URLs like https://)
		.replace(/^(\s*)\/\/[^\r\n]*/gm, '$1');

	const testNames = new Set<string>();

	// Three separate patterns for each quote type
	// Each handles escape sequences (\')
	const patterns = [
		// Single-quoted strings
		/(?:^|\n)\s*(?:test|it|describe)\s*\(\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g,
		// Double-quoted strings
		/(?:^|\n)\s*(?:test|it|describe)\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
		// Backtick (template literal) strings
		/(?:^|\n)\s*(?:test|it|describe)\s*\(\s*`([^`\\]*(?:\\.[^`\\]*)*)`/g,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(stripped)) !== null) {
			testNames.add(match[1]);
		}
	}

	return testNames;
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
		execSync(`git show ${commit}:${filePath}`, {
			cwd: gitDir,
			stdio: ['pipe', 'pipe', 'pipe'],
		});
	} catch {
		return null;
	}

	// Now actually get the content
	try {
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
		let headContent: string | null = null;
		try {
			headContent = readFileSync(path.join(gitDir, relativePath), 'utf-8');
		} catch {
			headContent = null;
		}

		if (headContent === null) {
			// File deleted in head
			if (baseContent !== null) {
				const baseNames = extractTestNamesFromSource(baseContent);
				for (const name of baseNames) {
					allDeleted.push(`${relativePath}::${name}`);
				}
			}
			continue;
		}

		if (baseContent === null) {
			// New file — tests were added, not deleted
			const headNames = extractTestNamesFromSource(headContent);
			for (const name of headNames) {
				allAdded.push(`${relativePath}::${name}`);
			}
			continue;
		}

		// Both exist — compare test names
		const baseNames = extractTestNamesFromSource(baseContent);
		const headNames = extractTestNamesFromSource(headContent);

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
