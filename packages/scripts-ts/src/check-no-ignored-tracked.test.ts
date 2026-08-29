import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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

// FAIL-LOUD CONTRACT: when git is absent from PATH, the guard exits 1.
test('RED: git absent from PATH fails loud (exit 1)', async () => {
	const rootDir = await buildFixtureRepo();

	// Empty PATH ensures git is not found.
	const result = spawnSync(
		'node',
		[
			'-e',
			`
		import { findIgnoredTrackedFiles } from('./packages/scripts-ts/src/check-no-ignored-tracked.ts');
		try {
			findIgnoredTrackedFiles({ cwd: '${rootDir}' });
			process.exit(0);
		} catch {
			process.exit(1);
		}
	`,
		],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			env: { ...process.env, PATH: '' },
			shell: '/bin/bash',
		},
	);

	// The guard should fail (exit 1) when git is not found.
	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when git is absent from PATH',
	);
});

// FAIL-LOUD CONTRACT: when cwd is not a git repository, the guard exits 1.
test('RED: non-git directory fails loud (exit 1)', async () => {
	const nonGitDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-no-git-'));

	const result = spawnSync(
		'node',
		[
			'-e',
			`
		import { findIgnoredTrackedFiles } from('./packages/scripts-ts/src/check-no-ignored-tracked.ts');
		try {
			findIgnoredTrackedFiles({ cwd: '${nonGitDir}' });
			process.exit(0);
		} catch {
			process.exit(1);
		}
	`,
		],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			env: process.env,
			shell: '/bin/bash',
		},
	);

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when cwd is not a git repository',
	);
});

// FAIL-LOUD CONTRACT: repo with no commits — git ls-files returns empty, guard is green.
test('GREEN: repo with no commits returns empty (no findings)', async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-no-commits-'));

	// Init a repo but make no commits.
	git(rootDir, ['init']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected no findings in a repo with no commits',
	);
});

// FILENAMES WITH SPACES: a force-added file with spaces in its name is detected.
test('RED: force-added file with spaces in name is detected', async () => {
	const rootDir = await buildFixtureRepo();

	await writeFixtureFile(rootDir, '.dump/fichier avec espaces.md', 'contenu\n');
	git(rootDir, ['add', '-f', '.dump/fichier avec espaces.md']);
	git(rootDir, ['commit', '-m', 'force-add file with spaces']);

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	assert.ok(
		findings.length > 0,
		'expected at least one tracked file matching .gitignore',
	);
	assert.ok(
		findings.some((file) => file.includes('fichier avec espaces.md')),
		`expected the guard to name fichier avec espaces.md, got: ${JSON.stringify(findings)}`,
	);
});

// FILENAMES WITH NON-ASCII: a force-added file with non-ASCII name is detected.
test('RED: force-added file with non-ASCII name is detected', async () => {
	const rootDir = await buildFixtureRepo();

	await writeFixtureFile(rootDir, '.dump/fichier-éèê.md', 'contenu\n');
	git(rootDir, ['add', '-f', '.dump/fichier-éèê.md']);
	git(rootDir, ['commit', '-m', 'force-add file with non-ASCII']);

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	assert.ok(
		findings.length > 0,
		'expected at least one tracked file matching .gitignore',
	);
	assert.ok(
		findings.some((file) => file.includes('fichier-éèê.md')),
		`expected the guard to name fichier-éèê.md, got: ${JSON.stringify(findings)}`,
	);
});

// NULL-TERMINATED PARSING: verify that -z flag produces correct output.
test('GREEN: git ls-files -z produces NUL-terminated output', async () => {
	const rootDir = await buildFixtureRepo();

	// Directly invoke git ls-files -z and verify NUL termination.
	const output = execFileSync(
		'git',
		['ls-files', '-z', '--cached', '--ignored', '--exclude-standard'],
		{ cwd: rootDir, encoding: 'utf8' },
	);

	// Output should be NUL-terminated (or empty).
	if (output.length > 0) {
		assert.ok(
			output.endsWith('\0'),
			'expected NUL-terminated output from git ls-files -z',
		);
	}
});

// NON-ZERO EXIT: when git returns non-zero, the guard fails loud.
test('RED: git command failure fails loud (exit 1)', async () => {
	const rootDir = await buildFixtureRepo();

	// Corrupt the .git directory to make git fail.
	await writeFile(path.join(rootDir, '.git', 'HEAD'), 'corrupted', 'utf8');

	const result = spawnSync(
		'node',
		[
			'-e',
			`
		import { findIgnoredTrackedFiles } from('./packages/scripts-ts/src/check-no-ignored-tracked.ts');
		try {
			findIgnoredTrackedFiles({ cwd: '${rootDir}' });
			process.exit(0);
		} catch {
			process.exit(1);
		}
	`,
		],
		{
			cwd: process.cwd(),
			encoding: 'utf8',
			env: process.env,
			shell: '/bin/bash',
		},
	);

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when git command fails',
	);
});

// POST-IGNORE ADDITION: a rule added AFTER a file is tracked flags it.
test('RED: gitignore rule added after file is tracked flags it', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-post-ignore-'),
	);

	git(rootDir, ['init']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	// Track a file first.
	await writeFixtureFile(rootDir, '.dump/preuve.md', 'contenu\n');
	git(rootDir, ['add', '.dump/preuve.md']);
	git(rootDir, ['commit', '-m', 'track file']);

	// Add .gitignore rule AFTER the file is tracked.
	await writeFixtureFile(rootDir, '.gitignore', '.dump/\n');
	git(rootDir, ['add', '.gitignore']);
	git(rootDir, ['commit', '-m', 'add gitignore']);

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	assert.ok(
		findings.length > 0,
		'expected at least one tracked file matching .gitignore after post-hoc rule addition',
	);
	assert.ok(
		findings.some((file) => file.includes('.dump/preuve.md')),
		`expected the guard to name .dump/preuve.md, got: ${JSON.stringify(findings)}`,
	);
});

// NEGATION EXCEPTION: .env.example is NOT flagged despite .env.* rule.
test('GREEN: .env.example is not flagged (negation exception)', async () => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-negation-'));

	git(rootDir, ['init']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	// .gitignore with negation exception.
	await writeFixtureFile(rootDir, '.gitignore', '.env.*\n!.env.example\n');
	await writeFixtureFile(rootDir, '.env.example', 'TEMPLATE=value\n');
	await writeFixtureFile(rootDir, '.env.secrets', 'SECRET=value\n');

	git(rootDir, ['add', '.gitignore', '.env.example']);
	git(rootDir, ['commit', '-m', 'add with negation']);

	const findings = findIgnoredTrackedFiles({ cwd: rootDir });

	// .env.example should NOT be flagged.
	assert.ok(
		!findings.some((file) => file.includes('.env.example')),
		`.env.example should not be flagged, got: ${JSON.stringify(findings)}`,
	);
});
