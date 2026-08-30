import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { checkFeatureAncestry } from './feature-ancestry.ts';

const git = (rootDir: string, args: string[]): string =>
	execFileSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

// Builds a real repository with two branches: a "develop" commit that is
// NOT an ancestor of "predating" (the branch predates the feature merge).
const buildPredatingRepo = async (): Promise<{
	developTip: string;
	rootDir: string;
}> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-1726-'));

	git(rootDir, ['init', '-b', 'predating']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	// Initial commit shared by both branches.
	execFileSync('git', ['commit', '--allow-empty', '-m', 'initial'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	// develop advances WITH the feature commit; predating stays behind —
	// so developTip is NOT an ancestor of predating.
	git(rootDir, ['checkout', '-b', 'develop']);
	execFileSync('git', ['commit', '--allow-empty', '-m', 'feature (#1457)'], {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	const developTip = git(rootDir, ['rev-parse', 'HEAD']).trim();
	git(rootDir, ['checkout', 'predating']);

	return { developTip, rootDir };
};

test('GREEN: feature commit is an ancestor of the current branch', () => {
	const tip = execFileSync('git', ['rev-parse', 'HEAD'], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	}).trim();

	assert.doesNotThrow(
		() => checkFeatureAncestry(tip, 'test-feature'),
		'a commit is always an ancestor of itself',
	);
});

test('RED: predating branch fails loud naming the feature and remedy', async () => {
	const { developTip, rootDir } = await buildPredatingRepo();

	try {
		assert.throws(
			() =>
				checkFeatureAncestry(developTip, 'publish-now (#1457)', {
					cwd: rootDir,
				}),
			(err) => {
				const message = err instanceof Error ? err.message : String(err);
				return (
					/older than the .* merge/.test(message) &&
					/Rebase/.test(message) &&
					/publish-now/.test(message)
				);
			},
			'a predating branch must fail loud naming the situation',
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});
