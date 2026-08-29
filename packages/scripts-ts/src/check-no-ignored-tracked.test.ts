import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { findIgnoredTrackedFiles } from './check-no-ignored-tracked.ts';

// Helpers to build throwaway git repos for the paired proof.

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
	const result = execFileSync('git', args, {
		cwd: rootDir,
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});
	return result;
};

const buildFixtureRepo = async (): Promise<string> => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-no-ignored-tracked-'),
	);

	git(rootDir, ['init']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	// .gitignore that ignores .dump/ — mirrors the real repo.
	await writeFixtureFile(rootDir, '.gitignore', '.dump/\n');
	// A tracked, non-ignored file so the repo is not empty.
	await writeFixtureFile(rootDir, 'README.md', '# fixture\n');

	git(rootDir, ['add', '.gitignore', 'README.md']);
	git(rootDir, ['commit', '-m', 'initial']);

	return rootDir;
};

// GREEN case: on a clean tree, the guard finds nothing.
test('GREEN: clean tree has no tracked files matching .gitignore', async () => {
	const rootDir = await buildFixtureRepo();

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected no tracked files matching .gitignore on a clean tree',
	);
});

// RED case: a force-added gitignored file is tracked, and the guard names it.
test('RED: force-added .dump/ file is detected and named', async () => {
	const rootDir = await buildFixtureRepo();

	// Plant a gitignored file and force-add it — the exact failure mode from #1513.
	await writeFixtureFile(rootDir, '.dump/preuve-jetable.md', 'jetable\n');
	git(rootDir, ['add', '-f', '.dump/preuve-jetable.md']);
	git(rootDir, ['commit', '-m', 'force-add gitignored file']);

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	assert.ok(
		findings.length > 0,
		'expected at least one tracked file matching .gitignore',
	);
	assert.ok(
		findings.some((file) => file.includes('.dump/preuve-jetable.md')),
		`expected the guard to name .dump/preuve-jetable.md, got: ${JSON.stringify(findings)}`,
	);
});
