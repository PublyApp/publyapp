import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { isShallowRepo } from './check-shallow-repo.ts';

// Helpers to build REAL shallow repositories for the paired proof.
//
// A real shallow repo is produced via `git clone --depth 1 file://<source>`,
// which creates a genuine `.git/shallow` file and makes
// `git rev-parse --is-shallow-repository` return "true". Synthetic fixtures
// (hand-writing a `.git/shallow` file) would prove nothing — the guard must
// interrogate the real git state, not a shape we invented.

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

// Builds a source repo with TWO commits (so --depth 1 actually truncates
// history), then clones it with --depth 1. Returns the shallow clone path.
const buildRealShallowClone = async (): Promise<{
	source: string;
	clone: string;
}> => {
	const source = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-shallow-source-'),
	);

	git(source, ['init']);
	git(source, ['config', 'user.name', 'Proof Runner']);
	git(source, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(source, 'README.md', '# fixture\n');
	git(source, ['add', 'README.md']);
	git(source, ['commit', '-m', 'initial']);

	await writeFixtureFile(source, 'second.md', 'second commit\n');
	git(source, ['add', 'second.md']);
	git(source, ['commit', '-m', 'second']);

	const clone = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-shallow-clone-'),
	);

	// Real shallow clone — produces a genuine .git/shallow file.
	execFileSync('git', ['clone', '--depth', '1', `file://${source}`, clone], {
		encoding: 'utf8',
		stdio: ['pipe', 'pipe', 'pipe'],
	});

	return { source, clone };
};

const buildNormalRepo = async (): Promise<string> => {
	const rootDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-normal-'));

	git(rootDir, ['init']);
	git(rootDir, ['config', 'user.name', 'Proof Runner']);
	git(rootDir, ['config', 'user.email', 'proof@test.local']);

	await writeFixtureFile(rootDir, 'README.md', '# fixture\n');
	git(rootDir, ['add', 'README.md']);
	git(rootDir, ['commit', '-m', 'initial']);

	return rootDir;
};

const SCRIPT_PATH = path.resolve(__dirname, 'check-shallow-repo.ts');
const MODULE_PATH = path.resolve(__dirname, 'check-shallow-repo.ts');

// GREEN case: a normal repository is not shallow.
test('GREEN: normal repository is not detected as shallow', async () => {
	const rootDir = await buildNormalRepo();

	const isShallow = isShallowRepo({ cwd: rootDir });

	assert.equal(
		isShallow,
		false,
		'expected normal repository to not be detected as shallow',
	);

	await rm(rootDir, { recursive: true, force: true });
});

// RED case: a REAL shallow clone (git clone --depth 1) is detected.
test('RED: real shallow clone (git clone --depth 1) is detected', async () => {
	const { source, clone } = await buildRealShallowClone();

	const isShallow = isShallowRepo({ cwd: clone });

	assert.equal(
		isShallow,
		true,
		'real shallow clone must be detected as shallow',
	);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// RED case: a real shallow clone has a `.git/shallow` file.
test('RED: real shallow clone has .git/shallow file (sanity)', async () => {
	const { source, clone } = await buildRealShallowClone();

	const shallowFile = path.join(clone, '.git', 'shallow');
	let hasShallowFile = false;
	try {
		const stat = await import('node:fs/promises').then((m) =>
			m.stat(shallowFile),
		);
		hasShallowFile = stat.isFile();
	} catch {
		hasShallowFile = false;
	}

	assert.equal(
		hasShallowFile,
		true,
		'real shallow clone must have a .git/shallow file',
	);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// FAIL-LOUD CONTRACT: git absent from PATH → exit 1, never silent green.
//
// The node binary itself is launched by absolute path (`process.execPath`)
// with an EMPTY PATH, so node runs but `execFileSync('git', ...)` throws
// ENOENT inside the guard. Without the absolute path, bash would fail to
// resolve `node` and exit 127 before the guard even executes — a vacuous
// pass. This shape forces the guard's own fail-loud path to be the witness.
test('RED: git absent from PATH fails loud (exit 1)', async () => {
	const rootDir = await buildNormalRepo();

	const result = spawnSync(
		process.execPath,
		[
			'--input-type=module',
			'-e',
			`
const { isShallowRepo } = await import('${MODULE_PATH}');
	try {
		isShallowRepo({ cwd: '${rootDir}' });
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
		},
	);

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when git is absent from PATH — a git failure must fail loud, not return green',
	);

	await rm(rootDir, { recursive: true, force: true });
});

// FAIL-LOUD CONTRACT: non-git directory → exit 1.
test('RED: non-git directory fails loud (exit 1)', async () => {
	const nonGitDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-no-git-'));

	const result = spawnSync(
		'node',
		[
			'--input-type=module',
			'-e',
			`
const { isShallowRepo } = await import('${MODULE_PATH}');
	try {
		isShallowRepo({ cwd: '${nonGitDir}' });
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

	await rm(nonGitDir, { recursive: true, force: true });
});

// The guard script CLI exits 1 on a real shallow clone.
test('RED: CLI exits 1 on real shallow clone', async () => {
	const { source, clone } = await buildRealShallowClone();

	const result = spawnSync('node', [SCRIPT_PATH], {
		cwd: clone,
		encoding: 'utf8',
		env: process.env,
		shell: '/bin/bash',
	});

	assert.equal(
		result.status,
		1,
		`expected CLI exit 1 on shallow repo, got ${result.status}. stderr: ${result.stderr ?? ''}`,
	);
	assert.match(
		result.stdout + result.stderr,
		/shallow/,
		'expected the failure message to name the shallow problem',
	);

	await rm(source, { recursive: true, force: true });
	await rm(clone, { recursive: true, force: true });
});

// The guard script CLI exits 0 on a normal repo.
test('GREEN: CLI exits 0 on normal repo', async () => {
	const rootDir = await buildNormalRepo();

	const result = spawnSync('node', [SCRIPT_PATH], {
		cwd: rootDir,
		encoding: 'utf8',
		env: process.env,
		shell: '/bin/bash',
	});

	assert.equal(
		result.status,
		0,
		`expected CLI exit 0 on normal repo, got ${result.status}. stderr: ${result.stderr ?? ''}`,
	);

	await rm(rootDir, { recursive: true, force: true });
});
