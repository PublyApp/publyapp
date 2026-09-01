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
// ignores must NOT be reported when the root `.dockerignore` ALSO mirrors
// that directory — exactly as the walk used to do before the fix, and as
// the round-5 fix now requires (the parallelism contract: git-ignored AND
// mirrored by .dockerignore is dropped). ROUGE on the current code would
// mean the parallelism detector is over-reporting on a canonical parallel
// case. VERT after: the guard drops it. This is the defect the captain's
// probe surfaced — and the parallel-mirror pre-condition is what the
// round-5 fix pins.
test('GREEN: shadow file in a git-ignored directory that IS mirrored by the root .dockerignore is filtered out (issue #1909 class)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-git-ignored-shadow-'),
	);

	await initGitRepo(repoDir);
	await writeFixtureFile(repoDir, '.gitignore', 'ignored-dir/\n');
	// root .dockerignore mirrors `ignored-dir/` so the parallelism
	// contract drops the shadow (this is the canonical parallel case
	// `.worktrees/`, `.dump/`, `.claude/` belong to).
	await writeFixtureFile(repoDir, '.dockerignore', 'ignored-dir/\n');
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
			'expected the guard to drop a git-ignored-and-mirrored shadow',
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
// NAME contains a tab must NOT be reported when the root `.dockerignore`
// ALSO mirrors that directory — `git check-ignore` returns the path
// unquoted under `-z`, the shared helper matches it against the
// candidate, AND the `.dockerignore` mirror lines up with the parent
// directory. ROUGE before the delegated helper (the path came out quoted
// and never matched). VERT after both fixes (round 4 for the git side,
// round 5 for the .dockerignore mirror side).
test('GREEN: shadow file in a git-ignored directory whose name contains a tab AND mirrored is filtered out (#1873 round 4 + 5)', async () => {
	const repoDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-tab-shadow-'));

	const tabDirectoryName = 'ignored\tdir';

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', 'ignored*dir/\n');
		// Mirror the tab-named directory in .dockerignore so the
		// parallelism contract drops the shadow.
		await writeFixtureFile(repoDir, '.dockerignore', 'ignored\tdir/\n');
		await mkdir(path.join(repoDir, tabDirectoryName), { recursive: true });
		await writeFile(
			path.join(repoDir, tabDirectoryName, 'Dockerfile.SONDE.dockerignore'),
			'',
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			[],
			`expected the guard to drop a tab-named git-ignored-and-mirrored shadow, got: ${JSON.stringify(findings)}`,
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

// -----------------------------------------------------------------------
// Round 5 of #1873: the guard header promises a three-branch parallelism
// between `.gitignore` and the root `.dockerignore` — a path git-ignored AND
// mirrored by `.dockerignore` is dropped, a path git-ignored but NOT mirrored
// by `.dockerignore` is REPORTED (Docker still sees it), a path not git-ignored
// is always reported. The implementation never reads the root `.dockerignore`,
// so a git-ignored path that Docker can still see produces a SILENT false
// negative: the guard says "no shadows" while the build context contains the
// file. Anchored on the real repo (tmpclaude* is in .gitignore but absent from
// `.dockerignore`) so the assertion names the actual evidence, not a
// synthetic fixture.
// -----------------------------------------------------------------------

// RED (paired proof): a shadow file inside a git-ignored directory that the
// root `.dockerignore` does NOT also exclude must be reported, because Docker
// will see it (the root file is the only authority for build-context
// exclusions). ROUGE on the current code: the guard silently drops the
// finding because git says "ignore". VERT after the fix: the guard reports
// it, naming the path. This is the silent false negative #1849 exists to
// close.
test('RED: shadow in a git-ignored directory that is NOT mirrored by the root .dockerignore is reported (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-not-mirrored-'),
	);

	try {
		await initGitRepo(repoDir);
		// root .dockerignore mirrors ONLY node_modules and the dotfile dotpath
		// patterns; the leaked directory is intentionally NOT mirrored — this
		// is the exact shape of the real `.gitignore`/`tmpclaude*` defect.
		await writeFixtureFile(
			repoDir,
			'.dockerignore',
			'node_modules\n.dockerignore\n',
		);
		await writeFixtureFile(repoDir, '.gitignore', 'leaked/\n');
		await writeFixtureFile(repoDir, 'leaked/Dockerfile.SONDE.dockerignore', '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('leaked/Dockerfile.SONDE.dockerignore'),
			`expected the guard to flag a git-ignored shadow that .dockerignore does not mirror, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// GREEN (paired proof): a shadow file inside a git-ignored directory that
// the root `.dockerignore` ALSO mirrors must be dropped — the file is dead
// to BOTH engines and reporting it would be a false positive on a parallel
// worktree (issue #1909 class: `.worktrees/`, `.dump/`, `.claude/` are in
// both files for this exact reason). Without this pin, a fix that simply
// "always report git-ignored paths" would over-report.
test('GREEN: shadow in a git-ignored directory that IS mirrored by the root .dockerignore is dropped (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-mirrored-'),
	);

	try {
		await initGitRepo(repoDir);
		// Both engines cover `leaked/` — this is the canonical parallel case
		// the round-4 fix already handled.
		await writeFixtureFile(
			repoDir,
			'.dockerignore',
			'node_modules\n.dockerignore\nleaked/\n',
		);
		await writeFixtureFile(repoDir, '.gitignore', 'leaked/\n');
		await writeFixtureFile(repoDir, 'leaked/Dockerfile.SONDE.dockerignore', '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.deepEqual(
			findings,
			[],
			`expected the guard to drop a mirrored git-ignored shadow, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// CLI RED proof, anchored on the real repo's evidence: `.gitignore` carries
// `tmpclaude*` and `.dockerignore` does NOT mirror it, so dropping a
// `tmpclaude_*/Dockerfile.dockerignore` shadow is a silent false negative.
// The current guard exits 0 on that shape. With the fix the CLI exits 1
// and names the offending path. This pins the shipped artifact, not just the
// library, so a future regression that loses the fix in a refactor still
// fails CI.
test('RED: CLI exits non-zero on a git-ignored shadow that .dockerignore does not mirror (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-cli-not-mirrored-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(
			repoDir,
			'.dockerignore',
			'node_modules\n.dockerignore\n',
		);
		await writeFixtureFile(repoDir, '.gitignore', 'tmpclaude_test/\n');
		await writeFixtureFile(
			repoDir,
			'tmpclaude_test/Dockerfile.dockerignore',
			'',
		);

		const result = spawnSync('node', [cliPath], {
			cwd: repoDir,
			encoding: 'utf8',
		});

		assert.notEqual(
			result.status,
			0,
			`expected non-zero exit on a git-ignored-not-mirrored shadow, got: ${result.status}`,
		);
		assert.ok(
			(result.stderr ?? '').includes('tmpclaude_test/Dockerfile.dockerignore'),
			`expected stderr to name the offending path, got: ${result.stderr}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// FAIL-LOUD CONTRACT: a `.dockerignore` line whose semantics the guard
// cannot evaluate (negation `!`, anchored globs whose meaning is not
// exact-match, lines whose Docker pattern language the guard has not
// implemented) must NOT be silently treated as "this path is excluded".
// The guard's contract is "unequivocal mirror"; an entry it cannot parse
// is the one case where it cannot make that claim, so it must report the
// shadow as visible (fail loud) instead of dropping it (silent false
// negative). Anchored on a real negation line: the well-known meaning
// "re-include what the parent ignores" is the textbook case the guard
// must NOT silently swallow.
test('RED: shadow under a git-ignored directory with an unanalysable .dockerignore negation line is reported loud (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-unanalysable-'),
	);

	try {
		await initGitRepo(repoDir);
		// `leaked` is git-ignored. The root .dockerignore carries a negation
		// line that the guard cannot evaluate semantically (negation syntax
		// re-includes a path the parent ignored, which is the OPPOSITE of
		// "exclude"). A mirror-detector that simply greps for the substring
		// `leaked` would treat the file as mirrored and silently drop the
		// shadow — exactly the false negative the captain flagged.
		await writeFixtureFile(
			repoDir,
			'.dockerignore',
			'node_modules\n.dockerignore\n!leaked/\n',
		);
		await writeFixtureFile(repoDir, '.gitignore', 'leaked/\n');
		await writeFixtureFile(repoDir, 'leaked/Dockerfile.SONDE.dockerignore', '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('leaked/Dockerfile.SONDE.dockerignore'),
			`expected the guard to report a shadow whose .dockerignore entry is unanalysable, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// -----------------------------------------------------------------------
// Round 5 of #1873: when a symlink escapes the repository root, the walk
// inspects the LEXICAL root of the external target (via opendir, which
// follows symlinks) but skips any entry that is itself a directory or a
// symlink — only top-level files of the external target are checked.
// A shadow nested deeper (e.g. external/subdir/Dockerfile.dockerignore)
// is invisible. The fix must descend recursively into the external target
// under its lexical path, with cycle protection (realpath set) and a
// bounded depth whose overflow fails loud.
// -----------------------------------------------------------------------

// RED (paired proof): a shadow sitting under a SUBDIRECTORY of an external
// symlink target must be reported, exactly as a shadow at the external root
// is. ROUGE on the current code: the escape branch does `continue` past any
// directory entry, so `external_link/subdir/Dockerfile.dockerignore` is
// never seen. VERT after the fix: the walk descends recursively under the
// lexical path.
test('RED: shadow under a subdirectory of an external symlink target is reported (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-nested-'),
	);

	const outsideDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-nested-outside-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		await symlink(outsideDir, path.join(repoDir, 'external_link'), 'dir');
		await mkdir(path.join(outsideDir, 'subdir'), { recursive: true });
		await writeFile(
			path.join(outsideDir, 'subdir', 'Dockerfile.SONDE.dockerignore'),
			'',
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('external_link/subdir/Dockerfile.SONDE.dockerignore'),
			`expected the guard to flag a nested shadow under an external symlink, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
		await rm(outsideDir, { recursive: true, force: true });
	}
});

// CYCLE PROTECTION (paired proof): the recursive descent must not loop on a
// cycle introduced through an external symlink. The simplest cycle is an
// external target that links back into itself via a relative symlink
// (e.g. `external/subdir/loop -> ../../external`). A walk without a realpath
// cycle guard would loop forever; the test pins that the recursion
// terminates on a clean external tree (no shadow, no findings).
test('GREEN: a cyclic external symlink does not loop the guard (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-cycle-'),
	);

	const outsideDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-cycle-outside-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		await symlink(outsideDir, path.join(repoDir, 'external_link'), 'dir');
		// `outside/subdir/loop -> ../../outside` forms a cycle through the
		// external target. Without cycle protection the recursion would loop.
		await mkdir(path.join(outsideDir, 'subdir'), { recursive: true });
		await symlink(outsideDir, path.join(outsideDir, 'subdir', 'loop'), 'dir');
		// The cycle guard must NOT silently drop legitimate findings: place a
		// shadow inside the external target and confirm the guard still
		// reports it after the cycle is detected.
		await writeFile(
			path.join(outsideDir, 'subdir', 'Dockerfile.SONDE.dockerignore'),
			'',
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('external_link/subdir/Dockerfile.SONDE.dockerignore'),
			`expected the guard to still report the nested shadow after detecting the cycle, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
		await rm(outsideDir, { recursive: true, force: true });
	}
});

// Commit helper for fixtures that need tracked files (`git ls-files` only sees
// what is staged or committed). Used by the #1891 paired proofs: the guard must
// ask git's tracked-file inventory, not the filesystem walk, so a regular
// tracked `.dockerignore` and a tracked symlink with the same name both have
// to be tested through `git add` + `git commit`.
const commitTracked = (repoDir: string, relativePaths: string[]): void => {
	for (const relativePath of relativePaths) {
		execFileSync('git', ['add', '--', relativePath], {
			cwd: repoDir,
			encoding: 'utf8',
			stdio: 'ignore',
		});
	}
	execFileSync(
		'git',
		[
			'-c',
			'user.email=test@example.com',
			'-c',
			'user.name=test',
			'commit',
			'-q',
			'-m',
			'fixture',
		],
		{ cwd: repoDir, encoding: 'utf8', stdio: 'ignore' },
	);
};

// -----------------------------------------------------------------------
// Round 6 / issue #1891: a TRACKED lexical path named `.dockerignore` other
// than the repository-root one creates exactly the same context divergence
// as the `<Dockerfile>.dockerignore` shadow it replaces. A future
// `docker build apps/api` would open `apps/api/.dockerignore` instead of the
// root file and re-include node_modules, dist, .worktrees, .dump and
// .claude. The guard must reject every such tracked file by its lexical path
// and ask git (`git ls-files`), not the filesystem walk, because `.worktrees/`
// is git-ignored and contains its own legitimate root `.dockerignore` per
// worktree.
//
// PAIRED PROOF
// ------------
// RED leg: a tracked regular `apps/api/.dockerignore` is rejected and named.
// RED leg: a tracked symlink with the same lexical path is also rejected
// (BuildKit dereferences symlinks, so a symlink `apps/api/.dockerignore`
// would open the target and still shadow the root file).
// GREEN leg: an untracked `apps/api/.dockerignore` and a
// `.worktrees/example/.dockerignore` are not findings — they are not in
// `git ls-files`. (Without this pin, a fix that simply walked the filesystem
// would false-positive on every worktree.)
// -----------------------------------------------------------------------

// RED (paired proof, leg 1): a tracked regular `.dockerignore` in a
// subdirectory is rejected and named.
test('RED #1891: tracked regular apps/api/.dockerignore is rejected and named', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r6-tracked-regular-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(
			repoDir,
			'.gitignore',
			'node_modules\n.worktrees/\n',
		);
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await writeFixtureFile(repoDir, 'apps/api/.dockerignore', '');
		commitTracked(repoDir, [
			'.gitignore',
			'.dockerignore',
			'apps/api/.dockerignore',
		]);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('apps/api/.dockerignore'),
			`expected the guard to name apps/api/.dockerignore, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// RED (paired proof, leg 2): a tracked symlink `apps/api/.dockerignore` is
// rejected by its lexical path. BuildKit dereferences the symlink, so the
// build context opens the target and re-includes everything the root
// `.dockerignore` would have excluded.
test('RED #1891: tracked symlink apps/api/.dockerignore is rejected by its lexical path', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r6-tracked-symlink-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(
			repoDir,
			'.gitignore',
			'node_modules\n.worktrees/\n',
		);
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await writeFixtureFile(repoDir, 'real.dockerignore', '');
		await mkdir(path.join(repoDir, 'apps', 'api'), { recursive: true });
		await symlink(
			path.join('..', '..', 'real.dockerignore'),
			path.join(repoDir, 'apps', 'api', '.dockerignore'),
		);
		commitTracked(repoDir, [
			'.gitignore',
			'.dockerignore',
			'real.dockerignore',
			'apps/api/.dockerignore',
		]);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('apps/api/.dockerignore'),
			`expected the guard to name apps/api/.dockerignore even when it is a tracked symlink, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// GREEN (paired proof, leg 3): a `.worktrees/example/.dockerignore` is
// git-ignored, so `git ls-files` does not return it, and the guard must not
// report it. Without this pin, a filesystem-walk mutation would false-positive
// on every worktree (the issue the round-6 fix exists to close).
test('GREEN #1891: ignored/untracked .worktrees/example/.dockerignore is not a finding', async () => {
	const repoDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-r6-ignored-'));

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(
			repoDir,
			'.gitignore',
			'node_modules\n.worktrees/\n',
		);
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		// Place a `.dockerignore` inside .worktrees/ as if it were a
		// parallel worktree's root file. It is NOT tracked, and the guard
		// must not flag it.
		await mkdir(path.join(repoDir, '.worktrees', 'example'), {
			recursive: true,
		});
		await writeFixtureFile(
			repoDir,
			'.worktrees/example/.dockerignore',
			'node_modules\n',
		);
		commitTracked(repoDir, ['.gitignore', '.dockerignore']);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			!findings.some((finding) => finding.startsWith('.worktrees/example/')),
			`expected the guard not to flag an ignored .worktrees/ .dockerignore, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// -----------------------------------------------------------------------
// Round 6 / issue #1977: a `.dockerignore` line that the guard cannot
// evaluate semantically (a negation `!foo`, an undecidable glob, ...) must
// NOT silently downgrade a parallel `.gitignore` mirror into "not mirrored".
// The mirror check needs three answers, not two: `mirrored`, `not mirrored`,
// and `cannot decide`. The third is the one a future reviewer cannot afford
// to swallow — a later undecidable line (here, a negation that re-includes
// what the parent ignored) can flip the verdict from "excluded" back to
// "included", so the guard must report the candidate as undecidable rather
// than either dropping or asserting it.
//
// PAIRED PROOF
// ------------
// RED leg: a `.dockerignore` carrying `leaked/` followed by
// `!leaked/Dockerfile.dockerignore` cannot green-light a
// `leaked/Dockerfile.dockerignore` candidate the way the round-5 code did
// (it met the negation first, returned `false`, and dropped the path
// silently even though the parent exact rule excluded it).
// -----------------------------------------------------------------------

// RED (paired proof): a `.dockerignore` with `leaked/` (exact, excludes the
// directory) followed by `!leaked/Dockerfile.dockerignore` (negation, may
// re-include a specific file) cannot green-light the candidate — the mirror
// check returns `cannot decide`, so the guard reports the candidate loud
// with the rule context. Anchored on a git-ignored shadow so the round-5
// parallel filter is exercised end-to-end.
test('RED #1977: a later undecidable negation cannot green-light a parallel candidate', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r6-negation-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', 'leaked/\n');
		await writeFixtureFile(
			repoDir,
			'.dockerignore',
			'node_modules\nleaked/\n!leaked/Dockerfile.dockerignore\n',
		);
		await writeFixtureFile(repoDir, 'leaked/Dockerfile.dockerignore', '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('leaked/Dockerfile.dockerignore'),
			`expected the guard to flag a candidate whose .dockerignore mixes an exact ignore with a later undecidable negation, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// FAIL-LOUD (paired proof): a deeply nested external symlink chain that exceeds the
// recursion depth bound must fail loud (reject), NOT silently drop the
// walk's findings — silence on overflow is exactly the false negative the
// captain flagged. The walk must either report the path that triggers the
// overflow OR reject with a clear cause; the pinned behaviour here is
// "report the shadow that triggered the overflow so the maintainer sees it".
test('RED: a deeply nested external symlink chain is still scanned or fails loud (#1873 round 5)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-deep-external-'),
	);

	const outsideRoot = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-deep-external-outside-'),
	);

	try {
		await initGitRepo(repoDir);
		await writeFixtureFile(repoDir, '.gitignore', '');
		// Build an external symlink chain of length 64 — deeper than any
		// reasonable bound the guard will set. At every step except the
		// last, the symlink points to a directory holding a NEXT symlink;
		// the final step holds the shadow.
		let previousDir = outsideRoot;
		const chainLength = 64;
		for (let index = 0; index < chainLength - 1; index += 1) {
			const nextDir = path.join(previousDir, `step${index}`);
			await mkdir(nextDir, { recursive: true });
			await symlink(nextDir, path.join(previousDir, 'next'), 'dir');
			previousDir = nextDir;
		}
		await writeFile(
			path.join(previousDir, 'Dockerfile.SONDE.dockerignore'),
			'',
		);
		await symlink(outsideRoot, path.join(repoDir, 'external_link'), 'dir');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		// The guard either reports the shadow OR rejects the walk. Reporting
		// nothing on a depth-exceeding external chain is exactly the false
		// negative the captain pinned — silence is the failure mode.
		const reported = findings.some((finding) =>
			finding.startsWith('external_link/'),
		);
		assert.ok(
			reported,
			`expected the guard to either report the shadow at depth > 64 or reject the walk loudly, got silent ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
		await rm(outsideRoot, { recursive: true, force: true });
	}
});
