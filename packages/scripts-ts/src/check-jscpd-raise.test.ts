import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'os';

import { test } from 'vitest';

import { verifyJscpdRaise } from './check-jscpd-raise.ts';

const GIT = 'git';

const gitIn = (gitDir: string, ...args: string[]): void => {
	// Wrap in `node -e` to bypass any worker-thread PATH issues in vitest.
	const inner = `require('child_process').execFileSync('${GIT}',${JSON.stringify(args)},${JSON.stringify({ cwd: gitDir, encoding: 'utf-8', timeout: 30000 })})`;
	execFileSync(process.execPath, ['-e', inner], {
		encoding: 'utf-8',
		timeout: 30_000,
	});
};

/**
 * Build a hermetic git fixture: two independent repos sharing a bare "remote".
 * Each repo is a fresh `git init`, with a shared bare repo as the push target.
 */
const buildFixture = async (opts: {
	baseRef?: Record<string, unknown>;
	prRef?: Record<string, unknown>;
	recordContent?: string;
}): Promise<{ prDir: string }> => {
	const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'publyapp-raise-'));

	// Bare repo acts as the shared remote.
	const remoteDir = path.join(tmpRoot, 'remote.git');
	await mkdir(remoteDir, { recursive: true });
	gitIn(remoteDir, 'init', '--bare', '--initial-branch=main', '.');
	gitIn(remoteDir, 'config', 'user.email', 'test@example.com');
	gitIn(remoteDir, 'config', 'user.name', 'Test');

	// Base repo.
	const baseDir = path.join(tmpRoot, 'base');
	await mkdir(baseDir, { recursive: true });
	gitIn(baseDir, 'init', '--initial-branch=main', '.');
	gitIn(baseDir, 'config', 'user.email', 'test@example.com');
	gitIn(baseDir, 'config', 'user.name', 'Test');

	await mkdir(path.join(baseDir, 'packages', 'scripts-ts', 'src'), {
		recursive: true,
	});
	await mkdir(path.join(baseDir, 'docs', 'records'), { recursive: true });

	const baseRefContent = opts.baseRef ?? {
		productionPairs: { count: 10, lines: 200 },
		productionAuto: { count: 5, lines: 100 },
	};
	await writeFile(
		path.join(baseDir, 'packages', 'scripts-ts', 'src', 'jscpd-reference.json'),
		JSON.stringify(baseRefContent, null, '\t') + '\n',
	);
	gitIn(baseDir, 'add', '.');
	gitIn(baseDir, 'commit', '-m', 'base reference');
	gitIn(baseDir, 'remote', 'add', 'origin', remoteDir);
	gitIn(baseDir, 'push', 'origin', 'main');

	// PR repo.
	const prDir = path.join(tmpRoot, 'pr');
	await mkdir(prDir, { recursive: true });
	gitIn(prDir, 'init', '--initial-branch=main', '.');
	gitIn(prDir, 'config', 'user.email', 'test@example.com');
	gitIn(prDir, 'config', 'user.name', 'Test');
	gitIn(prDir, 'remote', 'add', 'origin', remoteDir);
	gitIn(prDir, 'fetch', 'origin', 'main');

	await mkdir(path.join(prDir, 'packages', 'scripts-ts', 'src'), {
		recursive: true,
	});
	await mkdir(path.join(prDir, 'docs', 'records'), { recursive: true });

	const prRefContent = opts.prRef ?? {
		productionPairs: { count: 10, lines: 200 },
		productionAuto: { count: 5, lines: 100 },
	};
	await writeFile(
		path.join(prDir, 'packages', 'scripts-ts', 'src', 'jscpd-reference.json'),
		JSON.stringify(prRefContent, null, '\t') + '\n',
	);

	if (opts.recordContent !== undefined) {
		await writeFile(
			path.join(prDir, 'docs', 'records', '2026-08-30-plan-test-raise.md'),
			opts.recordContent,
		);
	}

	gitIn(prDir, 'add', '.');
	gitIn(prDir, 'commit', '-m', 'pr changes');

	return { prDir };
};

// ---------------------------------------------------------------------------
// Core behaviour
// ---------------------------------------------------------------------------

test('no raise: verdict is none (caller exits 0)', async () => {
	// Hermetic fixture, NOT the checkout this test happens to run in. The first
	// version of this test passed the author's own worktree path as an absolute
	// literal: on CI that directory does not exist, git resolved nothing, and
	// the assertion read 'fail' instead of 'none'. A test whose subject is the
	// machine it runs on measures the machine, not the guard.
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.hasRaise, false);
	assert.equal(verdict.verdict, 'none');
});

test('raise WITHOUT docs/records/ accompaniment: verdict is fail', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		// No record.
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRaise, true);
	assert.equal(verdict.hasRecord, false);
	// The error names what raised and what is missing.
	assert.ok(verdict.errors.length > 0, verdict.errors.join('\n'));
	assert.ok(
		verdict.errors.some((e) => e.includes('productionPairs')),
		verdict.errors.join('\n'),
	);
	assert.ok(
		verdict.errors.some((e) => e.includes('docs/records/')),
		verdict.errors.join('\n'),
	);
});

test('raise WITH docs/records/ file containing "jscpd": verdict is pass', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		recordContent: `## jscpd Reference Raise

Raising productionPairs.count from 10 to 12 and productionPairs.lines from 200 to 250
due to jscpd detecting additional C# using-block duplications after the dot format changes.

Surface: C# using directive blocks across handler files.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'pass');
	assert.equal(verdict.hasRaise, true);
	assert.equal(verdict.hasRecord, true);
	assert.deepEqual(verdict.errors, []);
	assert.ok(
		verdict.passMessage?.includes('accompanied by a docs/records/'),
		verdict.passMessage,
	);
});

test('raise WITH docs/records/ file NOT containing "jscpd": verdict is fail', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		// Record about something else — no "jscpd" keyword.
		recordContent: `## Other Changes

Updated the CI pipeline configuration.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRaise, true);
	assert.equal(verdict.hasRecord, false);
});

test('raise of only productionAuto.count: passes with record', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 7, lines: 100 },
		},
		recordContent: `## jscpd Raise

Raising productionAuto.count from 5 to 7 due to new C# self-duplications.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'pass');
	assert.equal(verdict.hasRaise, true);
	assert.ok(
		verdict.raiseDetails.some((d) => d.includes('productionAuto.count')),
		verdict.raiseDetails.join('\n'),
	);
});

test('raise of only productionAuto.lines: passes with record', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 120 },
		},
		recordContent: `## jscpd Raise

Raising productionAuto.lines from 100 to 120 due to additional C# using directives.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'pass');
	assert.equal(verdict.hasRaise, true);
	assert.ok(
		verdict.raiseDetails.some((d) => d.includes('productionAuto.lines')),
		verdict.raiseDetails.join('\n'),
	);
});

// ---------------------------------------------------------------------------
// Error paths
// ---------------------------------------------------------------------------

test('base reference unreadable: verdict is fail with error', async () => {
	const prDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-raise-nobase-'));
	gitIn(prDir, 'init', '--initial-branch=pr', '.');
	gitIn(prDir, 'config', 'user.email', 'test@example.com');
	gitIn(prDir, 'config', 'user.name', 'Test');

	await mkdir(path.join(prDir, 'packages', 'scripts-ts', 'src'), {
		recursive: true,
	});
	await writeFile(
		path.join(prDir, 'packages', 'scripts-ts', 'src', 'jscpd-reference.json'),
		JSON.stringify({ productionPairs: { count: 12, lines: 250 } }, null, '\t') +
			'\n',
	);
	gitIn(prDir, 'add', '.');
	gitIn(prDir, 'commit', '-m', 'raise without base');

	const verdict = verifyJscpdRaise(prDir, 'nonexistent-branch');

	assert.equal(verdict.verdict, 'fail');
	assert.ok(
		verdict.errors.some((e) => e.includes('Cannot read base reference')),
		verdict.errors.join('\n'),
	);
});

test('PR reference unreadable: verdict is fail', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
		},
	});
	// Overwrite with invalid JSON.
	await writeFile(
		path.join(prDir, 'packages', 'scripts-ts', 'src', 'jscpd-reference.json'),
		'{ broken json',
	);
	gitIn(prDir, 'add', '.');
	gitIn(prDir, 'commit', '-m', 'corrupt reference');

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.ok(
		verdict.errors.some((e) => e.includes('Cannot read PR reference')),
		verdict.errors.join('\n'),
	);
});

// ---------------------------------------------------------------------------
// Mutations that stay red
// ---------------------------------------------------------------------------

test('mutations stay red: record without raised key names', async () => {
	// The record exists but does not name the raised key (productionPairs.count/lines),
	// so recordMentionsRaise returns false.
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		recordContent: `## CI Pipeline Update

Updated GitHub Actions workflow configuration.
The duplication scanner was also touched but this record is about the pipeline.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	// The record exists but lacks "jscpd" in the body, so hasRecord is false.
	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRecord, false);
	assert.equal(verdict.hasRaise, true);
});

test('mutations stay red: docs/records/ file without .md extension', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
	});

	// Add a non-markdown record file.
	await mkdir(path.join(prDir, 'docs', 'records'), { recursive: true });
	await writeFile(
		path.join(prDir, 'docs', 'records', '2026-08-30-plan-test-raise.txt'),
		'## jscpd raise\n\nRaising the reference.\n',
	);
	gitIn(prDir, 'add', '.');
	gitIn(prDir, 'commit', '-m', 'add txt record');

	const verdict = verifyJscpdRaise(prDir, 'main');

	// .txt files are not matched by the guard's endsWith('.md') check.
	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRecord, false);
});

test('mutations stay red: no docs/records/ change in the diff', async () => {
	// The PR has a raise but no docs/records/ change at all.
	// The base branch has an empty docs/records/ directory.
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		// No recordContent.
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRecord, false);
});

// ---------------------------------------------------------------------------
// Lowering only — no raise, silent exit 0
// ---------------------------------------------------------------------------

test('lowering only: verdict is none (silent exit 0)', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 8, lines: 180 },
			productionAuto: { count: 3, lines: 80 },
		},
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'none');
	assert.equal(verdict.hasRaise, false);
});

// ---------------------------------------------------------------------------
// Mixed: pairs-up + auto-down — raise detected, record required
// ---------------------------------------------------------------------------

test('mixed raise pairs-up + auto-down: verdict is fail without record', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 3, lines: 60 },
		},
		// No record.
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRaise, true);
	assert.ok(
		verdict.raiseDetails.some((d) => d.includes('productionPairs')),
		verdict.raiseDetails.join('\n'),
	);
});

test('mixed raise pairs-up + auto-down: verdict is pass with correct record', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 3, lines: 60 },
		},
		recordContent: `## jscpd Raise

Raising productionPairs.count from 10 to 12 and productionPairs.lines from 200 to 250.
productionAuto went down (cleanup of duplicate C# helpers).
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'pass');
	assert.equal(verdict.hasRecord, true);
});

// ---------------------------------------------------------------------------
// Date format enforcement
// ---------------------------------------------------------------------------

test('record without date prefix: verdict is fail', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
	});

	// Add a record that is not a dated record.
	await mkdir(path.join(prDir, 'docs', 'records'), { recursive: true });
	await writeFile(
		path.join(prDir, 'docs', 'records', 'not-a-dated-record.md'),
		'## jscpd Raise\n\nRaising productionPairs.count from 10 to 12.\n',
	);
	gitIn(prDir, 'add', '.');
	gitIn(prDir, 'commit', '-m', 'add non-dated record');

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRecord, false);
});

// ---------------------------------------------------------------------------
// Missing base key — loud failure
// ---------------------------------------------------------------------------

test('base missing productionAuto key: verdict is fail', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			// No productionAuto.
		},
		prRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 7, lines: 100 },
		},
		// No record.
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'fail');
	assert.ok(
		verdict.errors.some((e) => e.includes('productionAuto')),
		verdict.errors.join('\n'),
	);
});

// ---------------------------------------------------------------------------
// Key-name verification
// ---------------------------------------------------------------------------

test('record names wrong key: verdict is fail', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		recordContent: `## jscpd Raise

Raising productionAuto.count from 5 to 7.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	// The record names productionAuto.count but productionPairs.count/lines raised.
	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRecord, false);
});

test('record names correct key with wrong numbers: verdict is pass', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		recordContent: `## jscpd Raise

Raising productionPairs.count from 10 to 99 (wrong numbers).
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	// The record names the correct key but with wrong numbers.
	// recordMentionsRaise only checks for key presence, not value accuracy.
	// A reviewer would catch the wrong numbers; the guard checks for key coverage.
	assert.equal(verdict.verdict, 'pass');
	assert.equal(verdict.hasRecord, true);
});

test('record names correct keys: verdict is pass', async () => {
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		recordContent: `## jscpd Raise

Raising productionPairs.count from 10 to 12 and productionPairs.lines from 200 to 250.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'pass');
	assert.equal(verdict.hasRecord, true);
});

// ---------------------------------------------------------------------------
// Test timeout calibration (30s per git call, total ~120s for multi-repo fixture)
// ---------------------------------------------------------------------------

test('full fixture: raise + correct record (calibrated 60s timeout)', async () => {
	// This test uses the full multi-repo fixture and needs adequate time.
	// Each fixture build involves 6 git init + 3 push + multiple fetch calls.
	// Calibrated to 60s to handle cold runs on slower machines.
	const { prDir } = await buildFixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		recordContent: `## jscpd Raise

Raising productionPairs.count from 10 to 12 and productionPairs.lines from 200 to 250.
`,
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	assert.equal(verdict.verdict, 'pass');
}, 60_000);
