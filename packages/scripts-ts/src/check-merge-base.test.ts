import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, stat, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findMergeBase, repairShallowGraft } from './check-merge-base.ts';

const writeFixtureFile = async (
	rootDir: string,
	relativePath: string,
	contents: string,
): Promise<void> => {
	const absolute = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
};

const git = (rootDir: string, args: string[]): string => {
	return execFileSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
};

const isShallow = (rootDir: string): boolean =>
	git(rootDir, ['rev-parse', '--is-shallow-repository']).trim() === 'true';

// Builds a normal repo with two branches sharing a common ancestor.
const buildNormalRepo = async (): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-merge-base-'));

	git(rootDir, ['init']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(rootDir, 'README.md', '# fixture\n');
	git(rootDir, ['add', 'README.md']);
	git(rootDir, ['commit', '-m', 'initial']);

	// Create two branches from the same commit — they share an ancestor.
	git(rootDir, ['branch', 'branch-a']);
	git(rootDir, ['branch', 'branch-b']);

	return rootDir;
};

// Builds a REAL grafted repository: `git clone --depth 1 --no-single-branch`
// of a source whose branches are one ahead of the other. Both tips land in
// `.git/shallow`, so the two refs share no visible ancestor and
// `git merge-base` returns EMPTY — the exact #1771 lie, reproduced with the
// real git artifact (a synthetic `.git/shallow` proves nothing here).
const buildRealGraftedClone = async (): Promise<{
	source: string;
	clone: string;
}> => {
	const source = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-graft-source-'),
	);

	git(source, ['init', '-b', 'main']);
	git(source, ['config', 'user.name', 'Proof Runner']);
	git(source, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(source, 'f.md', 'main 1\n');
	git(source, ['add', '.']);
	git(source, ['commit', '-m', 'main-1']);
	await writeFixtureFile(source, 'f.md', 'main 2\n');
	git(source, ['add', '.']);
	git(source, ['commit', '-m', 'main-2']);

	// A develop branch ahead of main by two commits.
	git(source, ['checkout', '-b', 'develop']);
	await writeFixtureFile(source, 'f.md', 'develop 3\n');
	git(source, ['add', '.']);
	git(source, ['commit', '-m', 'develop-3']);
	await writeFixtureFile(source, 'f.md', 'develop 4\n');
	git(source, ['add', '.']);
	git(source, ['commit', '-m', 'develop-4']);

	const clone = await mkdtemp(path.join(os.tmpdir(), 'publyapp-graft-clone-'));

	// Real shallow clone of BOTH branch tips — a genuine `.git/shallow` with
	// the two tips, and a merge-base that lies empty.
	execFileSync(
		'git',
		['clone', '--depth', '1', '--no-single-branch', `file://${source}`, clone],
		{ encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
	);

	assert.equal(isShallow(clone), true, 'the clone must be genuinely shallow');
	assert.ok(
		await cloneHasShallowFile(clone),
		'the clone must carry the real .git/shallow artifact',
	);

	return { source, clone };
};

const cloneHasShallowFile = async (rootDir: string): Promise<boolean> => {
	try {
		return (await stat(path.join(rootDir, '.git', 'shallow'))).isFile();
	} catch {
		return false;
	}
};

// Builds a real shallow clone where two refs have NO common ancestor because
// they come from two genuinely unrelated repositories.
const buildUnrelatedShallowClone = async (): Promise<{
	clone: string;
	cleanup: () => Promise<void>;
}> => {
	const source1 = await mkdtemp(path.join(os.tmpdir(), 'publyapp-shallow-1-'));
	git(source1, ['init', '-b', 'main']);
	git(source1, ['config', 'user.name', 'Proof Runner']);
	git(source1, ['config', 'user.email', 'proof@test.local']);
	await writeFixtureFile(source1, 'file1.md', 'source 1\n');
	git(source1, ['add', '.']);
	git(source1, ['commit', '-m', 'initial']);

	const source2 = await mkdtemp(path.join(os.tmpdir(), 'publyapp-shallow-2-'));
	git(source2, ['init', '-b', 'main']);
	git(source2, ['config', 'user.name', 'Proof Runner']);
	git(source2, ['config', 'user.email', 'proof@test.local']);
	await writeFixtureFile(source2, 'file2.md', 'source 2\n');
	git(source2, ['add', '.']);
	git(source2, ['commit', '-m', 'initial']);

	const clone = await mkdtemp(path.join(os.tmpdir(), 'publyapp-merge-clone-'));
	execFileSync('git', ['clone', '--depth', '1', `file://${source1}`, clone], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	git(clone, ['remote', 'add', 'other', `file://${source2}`]);
	git(clone, ['fetch', 'other']);

	const cleanup = async () => {
		await rm(source1, { recursive: true, force: true });
		await rm(source2, { recursive: true, force: true });
		await rm(clone, { recursive: true, force: true });
	};

	return { clone, cleanup };
};

const SCRIPT_PATH = path.resolve(__dirname, 'check-merge-base.ts');

// GREEN: two branches sharing a common ancestor → merge-base resolves.
test('GREEN: merge-base resolves for branches with common ancestor', async () => {
	const rootDir = await buildNormalRepo();

	const result = findMergeBase({
		cwd: rootDir,
		ref1: 'branch-a',
		ref2: 'branch-b',
	});

	assert.equal(result.ok, true, 'expected merge-base to resolve');
	if (result.ok) {
		assert.match(result.sha, /^[0-9a-f]{40}$/);
	}

	await rm(rootDir, { recursive: true, force: true });
});

// RED: the #1771 lie — a REAL grafted shallow clone (same repository, shared
// history) makes merge-base return empty.
test('RED: merge-base returns empty on a real grafted shallow clone', async () => {
	const { source, clone } = await buildRealGraftedClone();

	const result = findMergeBase({
		cwd: clone,
		ref1: 'origin/main',
		ref2: 'origin/develop',
	});

	assert.equal(
		result.ok,
		false,
		'a grafted shallow clone must return empty merge-base (the #1771 lie)',
	);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// RED: two genuinely unrelated shallow tips also return empty.
test('RED: merge-base returns empty for genuinely unrelated shallow refs', async () => {
	const { clone, cleanup } = await buildUnrelatedShallowClone();

	const result = findMergeBase({
		cwd: clone,
		ref1: 'origin/main',
		ref2: 'other/main',
	});

	assert.equal(
		result.ok,
		false,
		'unrelated shallow refs must return empty merge-base',
	);

	await cleanup();
});

// IDEMPOTENCY of the READ-ONLY guard: running it twice produces the same result.
test('GREEN: merge-base guard is idempotent (same result on second run)', async () => {
	const rootDir = await buildNormalRepo();

	const first = findMergeBase({
		cwd: rootDir,
		ref1: 'branch-a',
		ref2: 'branch-b',
	});
	const second = findMergeBase({
		cwd: rootDir,
		ref1: 'branch-a',
		ref2: 'branch-b',
	});

	assert.deepEqual(
		first,
		second,
		'expected identical results on first and second invocation',
	);

	await rm(rootDir, { recursive: true, force: true });
});

// RED: an ABSENT reference must fail loudly, never fall back to a compliant
// default that reports green (rules of this house: unanalyzable input = red).
test('RED: an absent reference fails loud instead of defaulting green', async () => {
	const rootDir = await buildNormalRepo();

	const result = findMergeBase({
		cwd: rootDir,
		ref1: 'refs/remotes/origin/develop',
		ref2: 'HEAD',
	});

	assert.equal(result.ok, false, 'an absent reference must not resolve');
	if (!result.ok) {
		assert.match(
			result.reason,
			/merge-base .* failed/,
			'the failure must name the git error, not a silent default',
		);
	}

	await rm(rootDir, { recursive: true, force: true });
});

// REPAIR: removes the graft and VERIFIES the end state — merge-base resolves,
// the repository no longer reports shallow, and .git/shallow is gone.
test('REPAIR: unshallow removes the graft and merge-base resolves again', async () => {
	const { source, clone } = await buildRealGraftedClone();

	const before = findMergeBase({
		cwd: clone,
		ref1: 'origin/main',
		ref2: 'origin/develop',
	});
	assert.equal(before.ok, false, 'fixture must start grafted');

	const repair = repairShallowGraft({ cwd: clone });
	assert.equal(repair.ok, true, repair.ok ? '' : repair.reason);

	assert.equal(isShallow(clone), false, 'repo must no longer report shallow');
	assert.equal(
		await cloneHasShallowFile(clone),
		false,
		'.git/shallow must be gone after the repair',
	);

	const after = findMergeBase({
		cwd: clone,
		ref1: 'origin/main',
		ref2: 'origin/develop',
	});
	assert.equal(after.ok, true, 'merge-base must resolve after the repair');
	if (after.ok) {
		assert.match(after.sha, /^[0-9a-f]{40}$/);
	}

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// IDEMPOTENT REPAIR (#1773): run the repair TWICE and require the SAME final
// state. The #1773 defect was exactly that a second invocation restored the
// graft (--deepen re-seeded what the first invocation believed it removed).
// A mutation that re-implements the repair with --deepen leaves the repo
// shallow and fails the post-verification in the previous test on its very
// first run — red before the second invocation ever happens.
test('REPAIR: running the repair twice yields the identical final state', async () => {
	const { source, clone } = await buildRealGraftedClone();

	const first = repairShallowGraft({ cwd: clone });
	assert.equal(first.ok, true, first.ok ? '' : first.reason);
	const stateAfterFirst = {
		shallow: isShallow(clone),
		shallowFile: await cloneHasShallowFile(clone),
		mergeBase: findMergeBase({
			cwd: clone,
			ref1: 'origin/main',
			ref2: 'origin/develop',
		}),
	};

	const second = repairShallowGraft({ cwd: clone });
	assert.equal(second.ok, true, second.ok ? '' : second.reason);
	const stateAfterSecond = {
		shallow: isShallow(clone),
		shallowFile: await cloneHasShallowFile(clone),
		mergeBase: findMergeBase({
			cwd: clone,
			ref1: 'origin/main',
			ref2: 'origin/develop',
		}),
	};

	assert.deepEqual(
		stateAfterSecond,
		stateAfterFirst,
		'a second repair must not change the state — the #1773 re-seeding defect must not come back',
	);
	assert.equal(stateAfterSecond.shallow, false);
	assert.equal(stateAfterSecond.shallowFile, false);
	assert.equal(stateAfterSecond.mergeBase.ok, true);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// The CLI exits 1 when merge-base returns empty, naming the cause.
test('RED: CLI exits 1 on empty merge-base', async () => {
	const { source, clone } = await buildRealGraftedClone();

	const result = spawnSync(
		'node',
		[SCRIPT_PATH, 'origin/main', 'origin/develop'],
		{
			cwd: clone,
			encoding: 'utf8',
			env: process.env,
		},
	);

	assert.equal(
		result.status,
		1,
		`expected CLI exit 1 on empty merge-base, got ${result.status}`,
	);
	assert.match(
		result.stdout + result.stderr,
		/merge-base/,
		'the failure message must name the merge-base cause',
	);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// The CLI exits 0 when merge-base resolves.
test('GREEN: CLI exits 0 on resolved merge-base', async () => {
	const rootDir = await buildNormalRepo();

	const result = spawnSync('node', [SCRIPT_PATH, 'branch-a', 'branch-b'], {
		cwd: rootDir,
		encoding: 'utf8',
		env: process.env,
	});

	assert.equal(
		result.status,
		0,
		`expected CLI exit 0 on resolved merge-base, got ${result.status}. stderr: ${result.stderr ?? ''}`,
	);

	await rm(rootDir, { recursive: true, force: true });
});

// Mutation analysis: a mutation that returns { ok: true } on an empty
// merge-base (the original silent-green) is caught by the RED test above;
// a mutation that re-implements the repair with --deepen is caught by the
// repair post-verification. This test pins the read path explicitly.
test('RED: mutation check — guard does not fake ok: true on empty merge-base', async () => {
	const { source, clone } = await buildRealGraftedClone();

	const result = findMergeBase({
		cwd: clone,
		ref1: 'origin/main',
		ref2: 'origin/develop',
	});

	assert.equal(
		result.ok,
		false,
		'a mutation that fakes ok: true on empty merge-base would be caught by this test',
	);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});
