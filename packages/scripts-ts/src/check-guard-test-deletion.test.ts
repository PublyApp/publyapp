/**
 * Tests for check-guard-test-deletion.ts (#1962).
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

import { test } from 'vitest';

import {
	checkGuardTestDeletion,
	extractTestNamesFromSource,
} from './check-guard-test-deletion';

// ---------------------------------------------------------------------------
// Unit tests for test name extraction
// ---------------------------------------------------------------------------

const resolve = path.resolve;

// ---------------------------------------------------------------------------

test('extractTestNamesFromSource: extracts simple test() names', () => {
	const source = `
test('first test', () => {});
test("second test", () => {});
it('third test', () => {});
describe('a group', () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('first test'));
	assert.ok(result.has('second test'));
	assert.ok(result.has('third test'));
	assert.ok(result.has('a group'));
});

test('extractTestNamesFromSource: handles double-quoted strings', () => {
	const source = `test("double quoted", () => {});`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('double quoted'));
});

test('extractTestNamesFromSource: handles backtick template strings', () => {
	const source = 'test(`backtick string`, () => {});';
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('backtick string'));
});

// ---------------------------------------------------------------------------
// AST robustness — these are the shapes that break regex readers and are why
// the guard switched to ts-morph AST extraction (#1962 requirement #3).
// ---------------------------------------------------------------------------

test('extractTestNamesFromSource: ignores test name in comments', () => {
	const source = `
// test('commented out', () => {});
/* block comment // test('also commented') */
test('actual test', () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.equal(result.size, 1);
	assert.ok(result.has('actual test'));
	assert.ok(!result.has('commented out'));
	assert.ok(!result.has('also commented'));
});

test('extractTestNamesFromSource: handles test.each with array data', () => {
	const source = `
test.each(['a', 'b', 'c'])('runs for %s', (val) => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('runs for %s'));
});

test('extractTestNamesFromSource: handles test.each tagged template form', () => {
	const source = `
test.each\`
	a
	b
\`('case \$#, value', (row) => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('case $#, value'));
});

test('extractTestNamesFromSource: handles interpolated template names', () => {
	const source =
		'const prefix = "x"; test(`${prefix} does something`, () => {});';
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('{…} does something'));
});

test('extractTestNamesFromSource: handles nested describe with tests', () => {
	const source = `
describe('outer group', () => {
	describe('inner group', () => {
		test('nested test', () => {});
	});
	test('sibling test', () => {});
});
`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('outer group'));
	assert.ok(result.has('inner group'));
	assert.ok(result.has('nested test'));
	assert.ok(result.has('sibling test'));
});

test('extractTestNamesFromSource: handles all quote styles', () => {
	const source = `
test('single', () => {});
it("double", () => {});
describe(\`backtick\`, () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('single'));
	assert.ok(result.has('double'));
	assert.ok(result.has('backtick'));
});

test('extractTestNamesFromSource: skips test calls without string name', () => {
	const source = `
test(() => {});
it(123, () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.equal(result.size, 0);
});

test('extractTestNamesFromSource: extracts full test names with special chars', () => {
	const source = `
test('handles [brackets] and (parens) and "quotes"', () => {});
test('unicode: café résumé', () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.ok(result.has('handles [brackets] and (parens) and "quotes"'));
	assert.ok(result.has('unicode: café résumé'));
});

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const gitIn = (cwd: string, ...args: string[]): void => {
	execSync('git ' + args.join(' '), { cwd, stdio: 'pipe', timeout: 30_000 });
};

const buildGitFixture = async (
	files: Record<string, string>,
): Promise<{ gitDir: string }> => {
	const gitDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-testdeletion-'),
	);

	gitIn(gitDir, 'init', '--initial-branch=main', '.');
	gitIn(gitDir, 'config', 'user.email', 'test@example.com');
	gitIn(gitDir, 'config', 'user.name', 'Test');

	// Create base commit
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(scriptsTsSrc, { recursive: true });

	for (const [file, content] of Object.entries(files)) {
		await writeFile(path.join(scriptsTsSrc, file), content);
	}

	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'base');

	return { gitDir };
};

const modifyFile = async (
	gitDir: string,
	file: string,
	content: string,
): Promise<void> => {
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await writeFile(path.join(scriptsTsSrc, file), content);
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'head');
};

// ---------------------------------------------------------------------------
// PROOF 1: The real incident (#1945) — base intact, tests deleted
// ---------------------------------------------------------------------------

test('#1962 proof 1: deleted check-jscpd tests are caught, naming each one', async () => {
	const baseContent = `
import { test } from 'vitest';

test('#1890: the ATTACK is caught — a raised working-tree reference does not loosen the ratchet', () => {});
test('#1890: the ratchet reads the reference from the base, not from this tree', () => {});
test('#1890: the CLI default resolves the reference from the base', () => {});
test('passes when all values are at or below baseline', () => {});
test('fails when production pair count increases, naming the files', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('passes when all values are at or below baseline', () => {});
test('fails when production pair count increases, naming the files', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'check-jscpd.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'check-jscpd.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Some unrelated change',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		'Guard must be RED when tests are deleted',
	);

	const redFinding = result.findings.find((f) => f.severity === 'red');
	assert.ok(
		redFinding?.message.includes('#1890: the ATTACK is caught'),
		`Must name the deleted anti-raise-attack test. Got: ${redFinding?.message}`,
	);

	assert.ok(
		result.deletedTests.length >= 3,
		`Must catch all deleted tests, got ${result.deletedTests.length}: ${result.deletedTests.join(', ')}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// PROOF 2: The count trap — delete 3, add 3, count stays same
// ---------------------------------------------------------------------------

test('#1962 proof 2: count-trap PR that deletes 3 and adds 3 still goes RED', async () => {
	const baseContent = `
import { test } from 'vitest';

test('old test one', () => {});
test('old test two', () => {});
test('old test three', () => {});
test('keep me', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('new test one', () => {});
test('new test two', () => {});
test('new test three', () => {});
test('keep me', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'dummy.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'dummy.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Some change',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Guard must be RED for count-trap deletion. Findings: ${JSON.stringify(result.findings)}`,
	);

	assert.equal(
		result.deletedTests.length,
		3,
		`Must have 3 deleted tests, got ${result.deletedTests.length}`,
	);
	assert.equal(
		result.addedTests.length,
		3,
		`Must have 3 added tests, got ${result.addedTests.length}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// PROOF 3a: Stated deletion path — naming deleted tests in PR body → GREEN
// ---------------------------------------------------------------------------

test('#1962 proof 3a: deletion WITH exact naming in PR body passes', async () => {
	const baseContent = `
import { test } from 'vitest';

test('deleteme one', () => {});
test('deleteme two', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('something else', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'my.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'my.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'This PR removes the old tests: deleteme one and deleteme two.',
	});

	assert.ok(
		!result.findings.some((f) => f.severity === 'red'),
		`Guard must be GREEN when deletions are named in PR body. Findings: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// PROOF 3b: Vague body — "cleaned up some tests" → RED
// ---------------------------------------------------------------------------

test('#1962 proof 3b: vague PR body does not satisfy the check', async () => {
	const baseContent = `
import { test } from 'vitest';

test('old test', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('new test', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'my.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'my.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Cleaned up some tests and refactored the code.',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Guard must be RED for vague deletion justification. Findings: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// PROOF 4: Renaming without naming original → RED
// ---------------------------------------------------------------------------

test('#1962 proof 4: renaming tests without naming original goes RED', async () => {
	const baseContent = `
import { test } from 'vitest';

test('original test name', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('completely different name', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'test.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'test.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Renamed tests for clarity.',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Renaming (not naming original) must still go RED. Findings: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// PROOF 5: File deletion — entire test file gone → RED even with vague body
// ---------------------------------------------------------------------------

test('#1962 proof 5: deleting an entire test file goes RED', async () => {
	const baseContent = `
import { test } from 'vitest';

test('file test one', () => {});
test('file test two', () => {});
test('file test three', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'gone.test.ts': baseContent,
	});

	// Delete the file in HEAD
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await rm(path.join(scriptsTsSrc, 'gone.test.ts'));
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'head');

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Refactored and removed old coverage.',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Deleting a whole test file must go RED even with a vague body. Findings: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// merge-base resolution failure
// ---------------------------------------------------------------------------

test('fails loudly when merge-base cannot be resolved', async () => {
	const gitDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-no-mergebase-'),
	);

	gitIn(gitDir, 'init', '--initial-branch=main', '.');
	gitIn(gitDir, 'config', 'user.email', 'test@example.com');
	gitIn(gitDir, 'config', 'user.name', 'Test');

	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(scriptsTsSrc, { recursive: true });
	await writeFile(
		path.join(scriptsTsSrc, 'test.test.ts'),
		"test('t', () => {});",
	);
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'base');

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'origin/develop',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Must fail loudly when merge-base cannot resolve. Findings: ${JSON.stringify(result.findings)}`,
	);
	assert.equal(
		result.baseCommit,
		'UNRESOLVED',
		`Must mark baseCommit as UNRESOLVED when merge-base fails`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Push event (empty PR body)
// ---------------------------------------------------------------------------

test('push event with deletions goes RED', async () => {
	const baseContent = `
import { test } from 'vitest';

test('old test', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('new test', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'push.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'push.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: '',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Push event with deletions must go RED. Findings: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Integration: real repo passes (no deletions)
// ---------------------------------------------------------------------------

test('real repo check passes when no tests are deleted', async () => {
	const result = checkGuardTestDeletion({ gitDir: process.cwd() });

	assert.ok(
		result.findings.every((f) => f.severity === 'green'),
		`Real repo check should pass. Findings: ${JSON.stringify(result.findings)}`,
	);
});

// ---------------------------------------------------------------------------
// BLOCKS_PR 1 proof: rootDir resolves to repository root, candidate set non-empty
// ---------------------------------------------------------------------------

test('rootDir resolves to repository root and finds candidate files in real tree', async () => {
	// This test asserts that the default rootDir (computed from import.meta.url)
	// resolves to the repository root, not <repo>/packages. The round-1 bug was
	// that rootDir was two `..` from packages/scripts-ts/src, landing on
	// <repo>/packages, so the pathspec `packages/scripts-ts/src/` matched nothing.
	// We assert the resolved root IS the repository root by checking that the
	// scope path exists relative to it, and that the candidate set is non-empty.

	// process.cwd() in vitest is packages/scripts-ts. The repo root is two `..` up.
	const expectedRepoRoot = resolve(process.cwd(), '..', '..');

	// The scope path must exist relative to the expected repo root.
	const scopePath = resolve(expectedRepoRoot, 'packages', 'scripts-ts', 'src');
	assert.ok(existsSync(scopePath), `Scope path must exist at ${scopePath}`);

	// The guard must find at least one candidate file in the real tree.
	const result = checkGuardTestDeletion({ gitDir: expectedRepoRoot });
	assert.ok(
		result.findings.every((f) => f.severity === 'green'),
		`Real repo check should pass. Findings: ${JSON.stringify(result.findings)}`,
	);
});

// ---------------------------------------------------------------------------
// BLOCKS_PR 1 proof: empty candidate set fails loud
// ---------------------------------------------------------------------------

test('empty candidate set fails loud (zero guard test files)', async () => {
	// Create a git repo with NO *.test.ts files under packages/scripts-ts/src/.
	// The guard must FAIL LOUD, not silently pass. This is the exact failure
	// mode that shipped: rootDir was wrong, pathspec matched nothing, exit 0.
	const gitDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-empty-candidates-'),
	);

	gitIn(gitDir, 'init', '--initial-branch=main', '.');
	gitIn(gitDir, 'config', 'user.email', 'test@example.com');
	gitIn(gitDir, 'config', 'user.name', 'Test');

	// Create a repo with NO test files in the scope path
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(scriptsTsSrc, { recursive: true });
	await writeFile(
		path.join(scriptsTsSrc, 'placeholder.ts'),
		'// no test files here\n',
	);
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'base');

	// Add a second commit so merge-base resolves
	await writeFile(
		path.join(scriptsTsSrc, 'placeholder.ts'),
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		'// still no test files\n',
	);
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'head');

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Guard must FAIL LOUD on empty candidate set. Findings: ${JSON.stringify(result.findings)}`,
	);
	assert.ok(
		result.findings.some((f) =>
			f.message.includes('ZERO candidate test files'),
		),
		`Finding must name the empty candidate set. Got: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// BLOCKS_PR 2 proof: rename + delete must go RED and name both
// ---------------------------------------------------------------------------

test('renaming a test file and deleting tests goes RED and names both', async () => {
	// Round-1 bug: git diff --name-only reports an R entry as the NEW path only.
	// The base is then read at the new path (null), so the file is treated as
	// new: 35 tests added, 0 deleted. GREEN. With --name-status, we get both
	// paths and can read the base at the OLD path.
	const baseContent = `
import { test } from 'vitest';

test('storage limits apply', () => {});
test('storage limits apply per project', () => {});
test('storage limits apply per user', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('storage limits apply per project', () => {});
test('storage limits apply per user', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'check-storage.test.ts': baseContent,
	});

	// Rename the file AND delete a test in one commit
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await writeFile(
		path.join(scriptsTsSrc, 'check-storage.test.ts'),
		headContent,
	);
	gitIn(
		gitDir,
		'mv',
		'packages/scripts-ts/src/check-storage.test.ts',
		'packages/scripts-ts/src/check-storage-renamed.test.ts',
	);
	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'head');

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Some unrelated change',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Rename + delete must go RED. Findings: ${JSON.stringify(result.findings)}`,
	);

	// Must name the deleted test
	const redFinding = result.findings.find((f) => f.severity === 'red');
	assert.ok(
		redFinding?.message.includes('storage limits apply') &&
			!redFinding?.message.includes('storage limits apply per project'),
		`Must name the deleted test "storage limits apply" but not the surviving "storage limits apply per project". Got: ${redFinding?.message}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// MEDIUM proof: prefix-pair justification must NOT justify deletion
// ---------------------------------------------------------------------------

test('prefix-pair justification does not justify deletion of shorter name', async () => {
	// Round-1 bug: prBody.includes(testName) accepts a PR body that names a
	// DIFFERENT, surviving test whose name merely contains the deleted one as
	// a prefix. Delete "storage limits apply", keep "storage limits apply per
	// project", body names the survivor → must still be RED.
	const baseContent = `
import { test } from 'vitest';

test('storage limits apply', () => {});
test('storage limits apply per project', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('storage limits apply per project', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'my.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'my.test.ts', headContent);

	const result = checkGuardTestDeletion({
		gitDir,
		baseRef: 'HEAD~1',
		prBody: 'Kept: storage limits apply per project.',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Prefix-pair justification must NOT satisfy the check. Findings: ${JSON.stringify(result.findings)}`,
	);

	await rm(gitDir, { recursive: true, force: true });
});
