import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { findDockerignoreShadows } from './check-dockerignore-shadow.ts';

// Fixture helpers: plain temp trees (the guard walks the filesystem, so no
// git repo is needed).

const cliPath = fileURLToPath(
	new URL('./check-dockerignore-shadow.ts', import.meta.url),
);

const writeFixtureFile = async (
	rootDir: string,
	relativePath: string,
	contents = '',
): Promise<void> => {
	const absolute = path.join(rootDir, relativePath);
	await mkdir(path.dirname(absolute), { recursive: true });
	await writeFile(absolute, contents);
};

const buildFixtureTree = async (): Promise<string> => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-dockerignore-shadow-'),
	);

	// A root .dockerignore is the one legitimately allowed file.
	await writeFixtureFile(rootDir, '.dockerignore', 'node_modules\n');

	return rootDir;
};

// GREEN case: a tree with only the root .dockerignore passes.
test('GREEN: root .dockerignore alone yields no findings', async () => {
	const rootDir = await buildFixtureTree();

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected no findings when only the root .dockerignore exists',
	);
});

// RED case, the exact #1832 shape: an empty apps/api/Dockerfile.dockerignore
// must be detected and named with its path.
test('RED: apps/api/Dockerfile.dockerignore (empty) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore', '');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/Dockerfile.dockerignore'),
		`expected the guard to name apps/api/Dockerfile.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: a root-level shadow file is also a replacement risk.
test('RED: root-level Dockerfile.dockerignore is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.dockerignore'),
		`expected the guard to name Dockerfile.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: the shadow can derive from a named Dockerfile (Dockerfile.prod),
// not only the default-named Dockerfile.
test('RED: Dockerfile.prod.dockerignore (named Dockerfile variant) is detected', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/front/Dockerfile.prod.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/front/Dockerfile.prod.dockerignore'),
		`expected the guard to name the named-Dockerfile shadow, got: ${JSON.stringify(findings)}`,
	);
});

// RED case: every shadow file is named, not just the first.
test('RED: multiple shadow files are all named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore');
	await writeFixtureFile(rootDir, 'apps/front/Dockerfile.dockerignore');
	await writeFixtureFile(rootDir, 'packages/x.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[
			'apps/api/Dockerfile.dockerignore',
			'apps/front/Dockerfile.dockerignore',
			'packages/x.dockerignore',
		],
		'expected every shadow file to be named',
	);
});

// GREEN case: a subdirectory file named exactly `.dockerignore` is NOT a
// shadow file — Docker only replaces the root file with a `<name>.dockerignore`
// shadow, and a plain `.dockerignore` is the separate additive BuildKit
// per-directory feature.
test('GREEN: subdirectory `.dockerignore` is not a shadow file', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected a subdirectory .dockerignore (exact basename) to be allowed',
	);
});

// MUTATION AGAINST THE GUARD: a shadow file inside node_modules cannot reach
// a build context (the root .dockerignore excludes node_modules from every
// context), so flagging it would be a false positive on third-party packages.
// This test pins the deliberate scope boundary.
test('GREEN: shadow file inside node_modules is out of scope', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(
		rootDir,
		'node_modules/left-pad/Dockerfile.dockerignore',
	);

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected node_modules to be skipped (excluded from every build context)',
	);
});

// MUTATION AGAINST THE GUARD: a shadow file inside .git never enters a build
// context either; the walk must not descend into tool metadata.
test('GREEN: shadow file inside .git is out of scope', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.git/Dockerfile.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected .git to be skipped (tool metadata, never in a context)',
	);
});

// FAIL-LOUD contract: an unreadable/missing root must reject, never report a
// silent "nothing to flag".
test('RED: missing root directory fails loud (rejects)', async () => {
	const missingDir = path.join(os.tmpdir(), 'publyapp-does-not-exist-1849');

	await assert.rejects(
		findDockerignoreShadows({ rootDir: missingDir }),
		/nonexistent|ENOENT/,
	);
});

// CLI RED proof: the real CLI exits 1, names the offending path and states
// the replacement semantics in plain words.
test('RED: CLI exits non-zero, names the file and explains REPLACES', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore', '');

	const result = spawnSync('node', [cliPath], {
		cwd: rootDir,
		encoding: 'utf8',
	});

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when a shadow file exists',
	);
	assert.ok(
		(result.stderr ?? '').includes('apps/api/Dockerfile.dockerignore'),
		`expected stderr to name the file, got: ${result.stderr}`,
	);
	assert.ok(
		(result.stderr ?? '').toUpperCase().includes('REPLACES'),
		`expected stderr to explain that Docker replaces instead of adds, got: ${result.stderr}`,
	);
});

// CLI GREEN proof: the real CLI exits 0 on a clean tree with only the root
// .dockerignore.
test('GREEN: CLI exits 0 on a clean tree', async () => {
	const rootDir = await buildFixtureTree();

	const result = spawnSync('node', [cliPath], {
		cwd: rootDir,
		encoding: 'utf8',
	});

	assert.equal(result.status, 0, `expected exit 0, got ${result.status}`);
	assert.ok(
		(result.stdout ?? '').includes('[OK]'),
		`expected an explicit OK line, got: ${result.stdout}`,
	);
});

// RED case, round 2 of #1873: Docker matches the `.dockerignore` basename
// case-INSENSITIVELY, so every case variant of a shadow name replaces the
// root file too. The exact-case guard was green on all four of these —
// four false negatives, i.e. the exact defect #1849 closes.

test('RED: Dockerfile.DOCKERIGNORE (all-caps variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DOCKERIGNORE');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.DOCKERIGNORE'),
		`expected the guard to name Dockerfile.DOCKERIGNORE, got: ${JSON.stringify(findings)}`,
	);
});

// RED case, round 2 of #1873: mixed case is a replacement risk too.
test('RED: Dockerfile.DockerIgnore (mixed-case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.DockerIgnore'),
		`expected the guard to name Dockerfile.DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case, round 2 of #1873: the bare dotfile name with a different case
// is still a `<...>.dockerignore` shadow (its basename is not exactly
// `.dockerignore`).
test('RED: .DockerIgnore (dotfile case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('.DockerIgnore'),
		`expected the guard to name .DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// RED case, round 2 of #1873: a case variant sitting next to a real
// Dockerfile is the exact #1832 shape in another spelling.
test('RED: apps/api/Dockerfile.DockerIgnore (subdirectory case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/Dockerfile.DockerIgnore'),
		`expected the guard to name apps/api/Dockerfile.DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// CLI RED proof, round 2 of #1873: the real binary must exit 1 on a case
// variant and name it — the reviewer's four files are the regression that
// this test pins against the shipped artifact, not just the library.
test('RED: CLI exits non-zero on a case-variant shadow file (Dockerfile.DOCKERIGNORE)', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DOCKERIGNORE');

	const result = spawnSync('node', [cliPath], {
		cwd: rootDir,
		encoding: 'utf8',
	});

	assert.notEqual(
		result.status,
		0,
		'expected non-zero exit when a case-variant shadow file exists',
	);
	assert.ok(
		(result.stderr ?? '').includes('Dockerfile.DOCKERIGNORE'),
		`expected stderr to name the case-variant file, got: ${result.stderr}`,
	);
});

// RED case, round 2 of #1873: the exemption is EXACT. A case variant of the
// dotfile name in a subdirectory is not the additive BuildKit file (that
// one is spelled exactly `.dockerignore`), and on a case-insensitive
// filesystem it would collide with it — it is the ambiguity #1849 closes,
// so the guard flags it. Without this pin, "case-insensitive" would
// over-reach: the guard would either allow `.DOCKERIGNORE` shadows or
// silently stop recognising the legitimate dotfile.
test('RED: apps/api/.DOCKERIGNORE (dotfile case variant in a subdirectory) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.DOCKERIGNORE');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		`expected the guard to name apps/api/.DOCKERIGNORE, got: ${JSON.stringify(findings)}`,
	);
});

// -----------------------------------------------------------------------
// Round 3 of #1873 / issue #1909 class: the walk descends into directories
// git itself ignores (e.g. a parallel .worktrees/ checkout), which would
// produce false positives against files that can never enter a build
// context. The guard now asks `git check-ignore` (batch, --stdin) to filter
// its candidates. These two tests pin the paired proof: a git-ignored
// shadow is dropped (green), a tracked shadow (even mixed-case) is kept
// (red). Without both halves, the fix is rejected: the first alone would
// let a "simply stop walking" mutation pass; the second alone would not
// detect the defect at all.
// -----------------------------------------------------------------------

const initGitRepo = async (repoDir: string): Promise<void> => {
	execFileSync('git', ['init', '-q'], {
		cwd: repoDir,
		encoding: 'utf8',
		stdio: 'ignore',
	});
	// `git check-ignore` reads .gitignore rules from the working tree; no
	// commit is needed, but a .gitignore must exist for the rules to apply.
	await writeFixtureFile(repoDir, '.gitignore', '');
};

// GREEN (paired proof, half 1): a shadow file inside a directory git
// ignores must NOT be reported, exactly as the walk used to do before the
// fix. ROUGE before the fix (the file was reported), VERT after. This is
// the defect the captain's probe surfaced.
test('GREEN: shadow file in a git-ignored directory is filtered out (issue #1909 class)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-git-ignored-shadow-'),
	);

	await initGitRepo(repoDir);
	await writeFixtureFile(repoDir, '.gitignore', 'ignored-dir/\n');
	await writeFixtureFile(
		repoDir,
		'ignored-dir/Dockerfile.SONDE.dockerignore',
		'',
	);

	try {
		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			[],
			'expected the guard to drop a shadow file sitting inside a git-ignored directory',
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// RED (paired proof, half 2): a shadow file in a directory git DOES track
// must STILL be reported, including mixed-case variants. Without this pin,
// a fix that simply stops walking (or that over-filters) would pass half 1
// by making the guard blind — the round-2 case-insensitive acquisition must
// not be lost.
test('RED: mixed-case shadow file in a git-tracked directory is still caught', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-git-tracked-shadow-'),
	);

	await initGitRepo(repoDir);
	await writeFixtureFile(repoDir, '.gitignore', 'ignored-dir/\n');
	await writeFixtureFile(repoDir, 'tracked-dir/Dockerfile.DockerIgnore', '');

	try {
		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			['tracked-dir/Dockerfile.DockerIgnore'],
			`expected the guard to still name the tracked mixed-case shadow, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});
