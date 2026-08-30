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
 * Build a hermetic git fixture: a base repo pushed to a bare remote, then the
 * PR repo CLONED from that bare remote so the base commit is in history. This
 * ensures `git merge-base origin/main HEAD` succeeds (the guard requires a
 * common ancestor). A depth-1 CI-shape fixture is built separately by
 * `buildDepth1Fixture`.
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

	// PR repo: clone from the bare repo so the base commit is in history.
	// This ensures `git merge-base origin/main HEAD` succeeds.
	const prDir = path.join(tmpRoot, 'pr');
	gitIn(tmpRoot, 'clone', remoteDir, 'pr');
	gitIn(prDir, 'config', 'user.email', 'test@example.com');
	gitIn(prDir, 'config', 'user.name', 'Test');

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
	gitIn(prDir, 'commit', '-m', 'pr changes', '--allow-empty');

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
	// Clone-based fixture with full history so merge-base succeeds.
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

// ---------------------------------------------------------------------------
// Depth-1 CI-shape fixture: reproduces the exact shape of the ratchet-raise
// job's checkout BEFORE the fetch-depth: 0 fix.
//
// Two depth-1 tips (base and HEAD) fetched independently share NO common
// ancestor, so `git merge-base` fails. The guard must exit non-zero naming
// the merge base as the cause — NOT silently substitute a two-dot diff.
// ---------------------------------------------------------------------------

/**
 * Build a CI-shape fixture: reproduces the EXACT shape of the ratchet-raise
 * job's checkout BEFORE the fetch-depth: 0 fix.
 *
 * In real CI, `actions/checkout@v7` with the default fetch-depth: 1 fetches
 * only the PR's HEAD (refs/pull/N/merge) — a synthetic merge commit with no
 * common ancestor with the base branch. The guard then runs
 * `git fetch --depth 1 origin develop`, fetching only develop's tip. The two
 * depth-1 tips share NO common ancestor, so `git merge-base` cannot succeed.
 *
 * To reproduce this: we create TWO INDEPENDENT histories in the bare remote
 * (branches `main` and `pr`) that share no commits. The PR repo is cloned at
 * depth 1 from the `pr` branch, and `main` is fetched at depth 1 — both tips
 * are shallow and unrelated, exactly like the CI shape.
 */
const buildDepth1Fixture = async (opts: {
	baseRef?: Record<string, unknown>;
	prRef?: Record<string, unknown>;
}): Promise<{ prDir: string }> => {
	const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'publyapp-raise-d1-'));

	// Bare remote with TWO INDEPENDENT branches.
	const remoteDir = path.join(tmpRoot, 'remote.git');
	await mkdir(remoteDir, { recursive: true });
	gitIn(remoteDir, 'init', '--bare', '.');
	gitIn(remoteDir, 'config', 'user.email', 'test@example.com');
	gitIn(remoteDir, 'config', 'user.name', 'Test');

	// Base repo: creates the `main` branch with an independent history.
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

	// PR repo: a SEPARATE independent repo (no shared history with base),
	// pushed to the `pr` branch on the bare remote. This is the shape of
	// actions/checkout fetching refs/pull/N/merge — a synthetic merge commit
	// that is NOT an ancestor of the base branch.
	const prIndependentDir = path.join(tmpRoot, 'pr-independent');
	await mkdir(prIndependentDir, { recursive: true });
	gitIn(prIndependentDir, 'init', '--initial-branch=pr', '.');
	gitIn(prIndependentDir, 'config', 'user.email', 'test@example.com');
	gitIn(prIndependentDir, 'config', 'user.name', 'Test');

	await mkdir(path.join(prIndependentDir, 'packages', 'scripts-ts', 'src'), {
		recursive: true,
	});
	await mkdir(path.join(prIndependentDir, 'docs', 'records'), {
		recursive: true,
	});

	const prRefContent = opts.prRef ?? {
		productionPairs: { count: 10, lines: 200 },
		productionAuto: { count: 5, lines: 100 },
	};
	await writeFile(
		path.join(
			prIndependentDir,
			'packages',
			'scripts-ts',
			'src',
			'jscpd-reference.json',
		),
		JSON.stringify(prRefContent, null, '\t') + '\n',
	);
	gitIn(prIndependentDir, 'add', '.');
	gitIn(prIndependentDir, 'commit', '-m', 'pr reference (independent history)');
	gitIn(prIndependentDir, 'remote', 'add', 'origin', remoteDir);
	gitIn(prIndependentDir, 'push', 'origin', 'pr');

	// PR repo (the one under test): clone at depth 1 from the `pr` branch.
	// This mirrors `actions/checkout@v7` with fetch-depth: 1 — only the PR's
	// tip is present, with NO common ancestor with `main`.
	const prDir = path.join(tmpRoot, 'pr');
	gitIn(tmpRoot, 'clone', '--depth', '1', '--branch', 'pr', remoteDir, 'pr');
	gitIn(prDir, 'config', 'user.email', 'test@example.com');
	gitIn(prDir, 'config', 'user.name', 'Test');

	// The guard fetches the base at depth 1 too (mirroring gitFetchBaseBranch).
	// Force-create the remote tracking ref so the objects are available.
	// This fetches only `main`'s tip — still no common ancestor with `pr`.
	gitIn(
		prDir,
		'fetch',
		'--depth',
		'1',
		'origin',
		'+main:refs/remotes/origin/main',
	);

	return { prDir };
};

test('depth-1 CI-shape fixture (no common ancestor): guard fails loud naming merge base', async () => {
	// Reproduces the EXACT shape of the ratchet-raise job's checkout before
	// the fetch-depth: 0 fix: two depth-1 tips sharing no common ancestor.
	const { prDir } = await buildDepth1Fixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
		// No record — but the guard must fail BEFORE checking for the record
		// because it cannot compute its own diff scope.
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	// Must fail loud, NOT silently pass or silently fall back to two-dot diff.
	assert.equal(verdict.verdict, 'fail');
	assert.equal(verdict.hasRaise, true);
	assert.ok(
		verdict.errors.some(
			(e) =>
				e.includes('merge base') ||
				e.includes('common ancestor') ||
				e.includes('fetch-depth: 0'),
		),
		`Error must name the merge base / fetch-depth: 0 as the cause. Got: ${verdict.errors.join('\n')}`,
	);
}, 30_000);

test('depth-1 CI-shape fixture with record present: still fails loud (merge base first)', async () => {
	// Even if a record is present, the guard MUST fail loud when the merge
	// base is unfindable — it cannot determine its own diff scope, so any
	// record check would be operating on an undefined comparison. The error
	// must name the merge base as the cause.
	const { prDir } = await buildDepth1Fixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
	});

	// Add a record file (but the guard must still fail on merge base).
	const recordsDir = path.join(prDir, 'docs', 'records');
	await mkdir(recordsDir, { recursive: true });
	await writeFile(
		path.join(recordsDir, '2026-08-30-plan-test-raise.md'),
		'## jscpd Raise\n\nRaising productionPairs.count from 10 to 12 and productionPairs.lines from 200 to 250.\n',
	);
	gitIn(prDir, 'add', '.');
	gitIn(prDir, 'commit', '-m', 'add record', '--allow-empty');

	const verdict = verifyJscpdRaise(prDir, 'main');

	// Must fail loud on the merge base, not pass on the phantom record.
	assert.equal(verdict.verdict, 'fail');
	assert.ok(
		verdict.errors.some(
			(e) =>
				e.includes('merge base') ||
				e.includes('common ancestor') ||
				e.includes('fetch-depth: 0'),
		),
		`Error must name the merge base / fetch-depth: 0 as the cause. Got: ${verdict.errors.join('\n')}`,
	);
}, 30_000);

test('depth-1 fixture without fail-loud branch: would silently pass (paired red proof)', async () => {
	// PAIRED RED PROOF: this test exercises the bug. With the fail-loud
	// branch REMOVED (restoring the old two-dot fallback), the guard would
	// silently substitute `base..HEAD` and either pass or produce a wrong
	// verdict. The test name documents the mutation that turns it red.
	//
	// We prove the fail-loud behavior is present by asserting the guard
	// fails with a merge-base message. If someone restores the old fallback,
	// this test goes RED.
	const { prDir } = await buildDepth1Fixture({
		baseRef: {
			productionPairs: { count: 10, lines: 200 },
			productionAuto: { count: 5, lines: 100 },
		},
		prRef: {
			productionPairs: { count: 12, lines: 250 },
			productionAuto: { count: 5, lines: 100 },
		},
	});

	const verdict = verifyJscpdRaise(prDir, 'main');

	// The bug (silent two-dot fallback) would make this verdict 'fail' for
	// the WRONG reason (no record) or silently substitute. The fix makes it
	// fail for the RIGHT reason: merge base unfindable.
	assert.equal(verdict.verdict, 'fail');
	assert.ok(
		verdict.errors.some((e) => e.includes('merge base')),
		`MUTATION TARGET: if the fail-loud branch were removed, this test would go RED. Got: ${verdict.errors.join('\n')}`,
	);
}, 30_000);
