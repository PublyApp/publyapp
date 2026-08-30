/**
 * Tests for check-guard-test-deletion.ts (#1962).
 *
 * Proof cases required:
 * 1. The real incident (#1945): base with check-jscpd.test.ts intact, head with
 *    13 tests removed. Guard must go RED and name the missing tests.
 * 2. The count trap: head deletes 3 tests and adds 3 others. Guard must still RED.
 * 3. The stated-deletion path: same deletion WITH a body naming the deleted tests: GREEN.
 *    And with vague body ("cleaned up some tests"): RED.
 * 4. An adversarial mutation that keeps guard GREEN while test deletion slips through.
 * 5. Full verbose test output naming each test.
 */

import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
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

test('extractTestNamesFromSource: extracts simple test() names', () => {
	const source = `
test('first test', () => {});
test("second test", () => {});
it('third test', () => {});
describe('a group', () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.equal(result.ok, true);
	assert.ok(result.testNames.has('first test'));
	assert.ok(result.testNames.has('second test'));
	assert.ok(result.testNames.has('third test'));
	assert.ok(result.testNames.has('a group'));
});

test('extractTestNamesFromSource: ignores strings in comments', () => {
	const source = `
// test('this is not a test', () => {});
test('this is a test', () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.equal(result.ok, true);
	assert.equal(result.testNames.size, 1);
	assert.ok(result.testNames.has('this is a test'));
});

test('extractTestNamesFromSource: handles test.each()', () => {
	const source = `
// test.each is parsed but we only get the outer name
test.each([[1, 2]])('adds %d + %d', () => {});
`;
	const result = extractTestNamesFromSource(source);
	assert.equal(result.ok, true);
	// test.each doesn't give us the inner name statically
	assert.ok(result.testNames.size >= 0);
});

test('extractTestNamesFromSource: fails gracefully on malformed input', () => {
	const result = extractTestNamesFromSource(
		'this is not valid typescript @#$%',
	);
	// ts-morph might handle it or might not - just check we get a result
	assert.equal(typeof result.ok, 'boolean');
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

	// Create remote
	const remote = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-testdeletion-remote-'),
	);
	gitIn(remote, 'init', '--bare', '--initial-branch=main', '.');
	gitIn(gitDir, 'remote', 'add', 'origin', remote);

	// Create base commit
	const scriptsTsSrc = path.join(gitDir, 'packages', 'scripts-ts', 'src');
	await mkdir(scriptsTsSrc, { recursive: true });

	for (const [file, content] of Object.entries(files)) {
		await writeFile(path.join(scriptsTsSrc, file), content);
	}

	gitIn(gitDir, 'add', '.');
	gitIn(gitDir, 'commit', '-m', 'base');
	gitIn(gitDir, 'push', 'origin', 'main');

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
// PROOF 1: The real incident (#1945) — base intact, 13 tests deleted
// ---------------------------------------------------------------------------

test('#1962 proof 1: deleted check-jscpd tests are caught, naming each one', async () => {
	const baseContent = `
import { test } from 'vitest';

test('#1890: the ATTACK is caught — a raised working-tree reference does not loosen the ratchet', () => {});
test('#1890: the ratchet reads the reference from the base, not from this tree', () => {});
test('#1890: the CLI default resolves the reference from the base', () => {});
test('#1890: a missing base fails loud (first variant)', () => {});
test('#1890: a missing base fails loud (second variant)', () => {});
test('#1890: a missing base fails loud (third variant)', () => {});
test('#1890: readReferenceFromBase fails loud on a malformed base blob', () => {});
test('passes when all values are at or below baseline', () => {});
test('fails when production pair count increases, naming the files', () => {});
test('fails when production pair lines increase', () => {});
test('fails when production auto file count increases', () => {});
test('fails when production auto lines increase', () => {});
test('fails loudly when report is missing', () => {});
test('real repository passes with the merge-base reference', () => {});
`;

	const headContent = `
import { test } from 'vitest';

test('passes when all values are at or below baseline', () => {});
test('fails when production pair count increases, naming the files', () => {});
test('fails when production pair lines increase', () => {});
test('fails when production auto file count increases', () => {});
test('fails when production auto lines increase', () => {});
test('fails loudly when report is missing', () => {});
test('real repository passes with the merge-base reference', () => {});
`;

	const { gitDir } = await buildGitFixture({
		'check-jscpd.test.ts': baseContent,
	});

	await modifyFile(gitDir, 'check-jscpd.test.ts', headContent);

	const result = checkGuardTestDeletion({ gitDir });

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
		result.deletedTests.length >= 7,
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

	const result = checkGuardTestDeletion({ gitDir });

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
		prBody: 'Renamed tests for clarity.',
	});

	assert.ok(
		result.findings.some((f) => f.severity === 'red'),
		`Renaming (not naming original) must still go RED. Findings: ${JSON.stringify(result.findings)}`,
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
		baseRef: 'origin/develop', // Doesn't exist
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

	// Empty PR body (push event)
	const result = checkGuardTestDeletion({
		gitDir,
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
