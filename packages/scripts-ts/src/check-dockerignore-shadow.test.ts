import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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

// -----------------------------------------------------------------------
// Round 4 of #1873: `git check-ignore -v` C-quotes paths containing tabs,
// newlines, double-quotes or backslashes — wrapping them in `"` and
// escaping inner chars. The previous local parser split on the first tab
// and took whatever came after, so a tab in a directory name caused the
// extracted path to be the QUOTED form, which never matches the original
// candidate. Result: a real shadow inside a git-ignored directory whose
// name contained a tab was reported as a false positive and blocked CI.
// The delegated helper (`createGitIgnoreChecker`, #1927) uses
// `git check-ignore --stdin -z` precisely to avoid this class of bug.
//
// PAIRED PROOF
// ------------
// Without the fix, this test is RED on the leg below: the guard reports
// the shadow even though git ignores it (false positive). With the fix,
// the guard drops it (GREEN).
// -----------------------------------------------------------------------

// GREEN (paired proof): a shadow file inside a git-ignored directory whose
// NAME contains a tab must NOT be reported — `git check-ignore` returns the
// path unquoted under `-z`, and the shared helper matches it against the
// candidate. ROUGE before the delegated helper (the path came out quoted
// and never matched), VERT after.
test('GREEN: shadow file in a git-ignored directory whose name contains a tab is filtered out (#1873 round 4)', async () => {
	const repoDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-tab-shadow-'));

	const tabDirectoryName = 'ignored\tdir';

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', 'ignored*dir/\n');
		await mkdir(path.join(repoDir, tabDirectoryName), { recursive: true });
		await writeFile(
			path.join(repoDir, tabDirectoryName, 'Dockerfile.SONDE.dockerignore'),
			'',
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			[],
			`expected the guard to drop a tab-named git-ignored shadow, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// RED (paired proof): a shadow file in a directory git DOES track whose
// name contains a tab must STILL be reported. Without this pin, a fix
// that simply stops walking (or that over-filters) would pass the GREEN
// leg by making the guard blind — the round-2 case-insensitive
// acquisition and the round-3 walk must not be lost.
test('RED: shadow file in a tracked directory whose name contains a tab is still caught (#1873 round 4)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-tab-tracked-shadow-'),
	);

	const tabDirectoryName = 'tab\tdir';

	try {
		await initGitRepo(repoDir);
		await mkdir(path.join(repoDir, tabDirectoryName), { recursive: true });
		await writeFile(
			path.join(repoDir, tabDirectoryName, 'Dockerfile.dockerignore'),
			'',
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			[`${tabDirectoryName}/Dockerfile.dockerignore`],
			`expected the guard to still name the tracked tab-named shadow, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// -----------------------------------------------------------------------
// Round 4 of #1873: BuildKit follows symlinks within the build context, so a
// `Dockerfile.dockerignore` reachable only through a symlinked directory
// (e.g. `vendor/ -> external-repo/`) must still be flagged. The previous
// walk skipped any directory whose entry reported `isSymbolicLink()` and
// silently missed the shadow. The walk now follows symlinks with a realpath
// cycle guard and reports (but does not follow) symlinks that escape the
// repository root.
//
// PAIRED PROOF
// ------------
// Without the fix, the GREEN leg below is RED: a shadow sitting behind a
// symlinked directory is invisible, and the guard reports nothing. With the
// fix, the guard reports it under both the lexical and the real path. The
// RED leg pins that the round-2 case-insensitive acquisition survives.
// -----------------------------------------------------------------------

// GREEN (paired proof): a shadow file sitting in a directory the walk only
// reaches through a symlink must be flagged. ROUGE before the fix when the
// symlink points outside the repository root: the walk skipped symlinks, so
// the lexical target was invisible AND the walk never descended, so the
// shadow was unreachable. VERT after: the walk now follows symlinks and
// the shadow under one is reported under its lexical path. Anchored on a
// symlink pointing OUTSIDE the repo root so the lexical tree under it is
// the only place the shadow exists.
test('GREEN: shadow file under a symlinked directory pointing outside the repo root is reported (#1873 round 4)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-shadow-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		// Empty target outside the repo so the walk only sees the shadow
		// via the lexical path through the symlink.
		const outsideDir = await mkdtemp(
			path.join(os.tmpdir(), 'publyapp-symlink-shadow-target-'),
		);
		try {
			await symlink(outsideDir, path.join(repoDir, 'linked'), 'dir');
			// `opendir` follows the symlink, so the lexical walk descends
			// into the external directory and finds the shadow under its
			// lexical name. This pins the fix: under the old code the walk
			// refused to follow any symlink, so `linked/` was never
			// entered and the shadow was invisible.
			await writeFile(
				path.join(repoDir, 'linked', 'Dockerfile.SONDE.dockerignore'),
				'',
			);

			const findings = await findDockerignoreShadows({ rootDir: repoDir });

			assert.deepEqual(
				findings,
				['linked/Dockerfile.SONDE.dockerignore'],
				`expected the guard to flag the shadow under the symlinked path, got: ${JSON.stringify(findings)}`,
			);
		} finally {
			await rm(outsideDir, { recursive: true, force: true });
		}
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// RED (paired proof): a shadow under a symlinked directory that is also
// mixed-case must still be reported — the round-2 case-insensitive
// acquisition must not be lost when the walk learns to follow symlinks.
test('RED: mixed-case shadow behind a symlinked directory is reported (#1873 round 4)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-mixed-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		await mkdir(path.join(repoDir, 'real'), { recursive: true });
		await writeFile(path.join(repoDir, 'real', 'Dockerfile.DockerIgnore'), '');
		await symlink('real', path.join(repoDir, 'linked'), 'dir');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.some(
				(p) =>
					p === 'linked/Dockerfile.DockerIgnore' ||
					p === 'real/Dockerfile.DockerIgnore',
			),
			`expected the guard to flag the mixed-case shadow behind a symlink, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// CYCLE PROTECTION: a symlink whose real target is an ancestor of itself
// must not loop. Build the simplest cycle (a/loop -> .) and confirm the
// walk terminates and reports nothing on a clean tree.
test('GREEN: a self-referential symlinked directory does not loop (#1873 round 4)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-cycle-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		await mkdir(path.join(repoDir, 'a'), { recursive: true });
		await symlink('.', path.join(repoDir, 'a', 'loop'), 'dir');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			[],
			`expected no findings on a self-referential symlink without any shadow, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// ESCAPE REPORTING: a symlink whose target sits outside the repository root
// is NOT recursed into (that would scan an unbounded filesystem), but its
// root is inspected once via the lexical entry: shadows sitting at the root
// of the external target are reported under their lexical path through the
// symlink.
test('RED: shadow at the root of a symlinked directory escaping the repository root is reported under its lexical path (#1873 round 4)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-escape-'),
	);

	const outsideDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-escape-outside-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		await symlink(outsideDir, path.join(repoDir, 'escape'), 'dir');
		await writeFile(path.join(outsideDir, 'Dockerfile.SONDE.dockerignore'), '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('escape/Dockerfile.SONDE.dockerignore'),
			`expected the guard to flag the shadow at the root of the escaping symlink, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
		await rm(outsideDir, { recursive: true, force: true });
	}
});
