import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('root .dockerignore alone yields no findings', async () => {
	const rootDir = await buildFixtureTree();

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected no findings when only the root .dockerignore exists',
	);
});

// The exact #1832 shape: an empty apps/api/Dockerfile.dockerignore must be
// detected and named with its path.
test('apps/api/Dockerfile.dockerignore (empty) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.dockerignore', '');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/Dockerfile.dockerignore'),
		`expected the guard to name apps/api/Dockerfile.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// A root-level shadow file is also a replacement risk.
test('root-level Dockerfile.dockerignore is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.dockerignore'),
		`expected the guard to name Dockerfile.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// The shadow can derive from a named Dockerfile (Dockerfile.prod), not only
// the default-named Dockerfile.
test('Dockerfile.prod.dockerignore (named Dockerfile variant) is detected', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/front/Dockerfile.prod.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/front/Dockerfile.prod.dockerignore'),
		`expected the guard to name the named-Dockerfile shadow, got: ${JSON.stringify(findings)}`,
	);
});

// Every shadow file is named, not just the first.
test('multiple shadow files are all named', async () => {
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

// A subdirectory file named exactly `.dockerignore` IS a finding under the
// strict invariant. `docker build <subdir>` opens `<subdir>/.dockerignore`
// as that build context's authoritative exclusion file, so the root
// `.dockerignore` does not apply. The repository contract is: only the root
// `.dockerignore` exists.
test('subdirectory `.dockerignore` (exact basename) is a finding', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/.dockerignore'),
		`expected the guard to name apps/api/.dockerignore, got: ${JSON.stringify(findings)}`,
	);
});

// A shadow file inside node_modules cannot reach a build context (the root
// .dockerignore excludes node_modules from every context), so flagging it
// would be a false positive on third-party packages. This pins the
// deliberate scope boundary.
test('shadow file inside node_modules is out of scope', async () => {
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

// A shadow file inside .git never enters a build context either; the walk
// must not descend into tool metadata.
test('shadow file inside .git is out of scope', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.git/Dockerfile.dockerignore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.deepEqual(
		findings,
		[],
		'expected .git to be skipped (tool metadata, never in a context)',
	);
});

// An unreadable/missing root must reject, never report a silent "nothing to
// flag".
test('missing root directory fails loud (rejects)', async () => {
	const missingDir = path.join(os.tmpdir(), 'publyapp-does-not-exist-1849');

	await assert.rejects(
		findDockerignoreShadows({ rootDir: missingDir }),
		/nonexistent|ENOENT/,
	);
});

// Finding no shadows is green only when the canonical root file exists.
test('missing canonical root .dockerignore rejects with a clear cause', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r7-missing-root-'),
	);

	try {
		await assert.rejects(
			findDockerignoreShadows({ rootDir }),
			/canonical root .dockerignore/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('CLI exits non-zero and names the missing canonical root when the root .dockerignore is absent', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r7-missing-root-cli-'),
	);

	try {
		const result = spawnSync('node', [cliPath], {
			cwd: rootDir,
			encoding: 'utf8',
		});

		assert.notEqual(
			result.status,
			0,
			`expected non-zero exit on a missing canonical root, got ${result.status}`,
		);
		assert.ok(
			(result.stderr ?? '').includes('canonical root .dockerignore'),
			`expected stderr to name the missing canonical root, got: ${result.stderr}`,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('a root .dockerignore that is a directory is rejected, not treated as canonical', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r7-root-is-dir-'),
	);

	try {
		await mkdir(path.join(rootDir, '.dockerignore'));

		await assert.rejects(
			findDockerignoreShadows({ rootDir }),
			/canonical root .dockerignore/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

test('a root .dockerignore that is a symlink is rejected, not treated as canonical', async () => {
	const rootDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r7-root-is-symlink-'),
	);

	try {
		await writeFile(path.join(rootDir, 'real.dockerignore'), 'node_modules\n');
		await symlink('real.dockerignore', path.join(rootDir, '.dockerignore'));

		await assert.rejects(
			findDockerignoreShadows({ rootDir }),
			/canonical root .dockerignore/,
		);
	} finally {
		await rm(rootDir, { recursive: true, force: true });
	}
});

// The real CLI exits 1, names the offending path and states the replacement
// semantics in plain words.
test('CLI exits non-zero, names the file and explains REPLACES', async () => {
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

// The real CLI exits 0 on a clean tree with only the root .dockerignore.
test('CLI exits 0 on a clean tree', async () => {
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

// Docker matches the `.dockerignore` basename case-INSENSITIVELY, so every
// case variant of a shadow name replaces the root file too (#1849, #1873).

test('Dockerfile.DOCKERIGNORE (all-caps variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DOCKERIGNORE');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.DOCKERIGNORE'),
		`expected the guard to name Dockerfile.DOCKERIGNORE, got: ${JSON.stringify(findings)}`,
	);
});

// Mixed case is a replacement risk too.
test('Dockerfile.DockerIgnore (mixed-case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'Dockerfile.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('Dockerfile.DockerIgnore'),
		`expected the guard to name Dockerfile.DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// The bare dotfile name with a different case is still a
// `<...>.dockerignore` shadow (its basename is not exactly `.dockerignore`).
test('.DockerIgnore (dotfile case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, '.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('.DockerIgnore'),
		`expected the guard to name .DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// A case variant sitting next to a real Dockerfile is the exact #1832 shape
// in another spelling.
test('apps/api/Dockerfile.DockerIgnore (subdirectory case variant) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/Dockerfile.DockerIgnore');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/Dockerfile.DockerIgnore'),
		`expected the guard to name apps/api/Dockerfile.DockerIgnore, got: ${JSON.stringify(findings)}`,
	);
});

// The real binary must exit 1 on a case variant and name it — this pins the
// case-insensitivity behavior against the shipped CLI artifact, not just
// the library.
test('CLI exits non-zero on a case-variant shadow file (Dockerfile.DOCKERIGNORE)', async () => {
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

// The exemption is EXACT. A case variant of the dotfile name in a
// subdirectory is not the additive BuildKit file (that one is spelled
// exactly `.dockerignore`), so the guard flags it. Without this pin,
// "case-insensitive" would over-reach: the guard would either allow
// `.DOCKERIGNORE` shadows or silently stop recognising the legitimate
// dotfile.
test('apps/api/.DOCKERIGNORE (dotfile case variant in a subdirectory) is detected and named', async () => {
	const rootDir = await buildFixtureTree();

	await writeFixtureFile(rootDir, 'apps/api/.DOCKERIGNORE');

	const findings = await findDockerignoreShadows({ rootDir });

	assert.ok(
		findings.includes('apps/api/.DOCKERIGNORE'),
		`expected the guard to name apps/api/.DOCKERIGNORE, got: ${JSON.stringify(findings)}`,
	);
});

// -----------------------------------------------------------------------
// Symlink handling: the walk follows symlinked directories and reports the
// shadow under its lexical (BuildKit-visible) path. Cycle protection keeps
// the walk bounded; the external-depth bound fails loud.
// -----------------------------------------------------------------------

// A shadow file sitting in a directory the walk only reaches through a
// symlink must be flagged. Anchored on a symlink pointing OUTSIDE the repo
// root so the lexical tree under it is the only place the shadow exists.
test('shadow file under a symlinked directory pointing outside the repo root is reported', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-shadow-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
		// Empty target outside the repo so the walk only sees the shadow
		// via the lexical path through the symlink.
		const outsideDir = await mkdtemp(
			path.join(os.tmpdir(), 'publyapp-symlink-shadow-target-'),
		);
		try {
			await symlink(outsideDir, path.join(repoDir, 'linked'), 'dir');
			// `opendir` follows the symlink, so the lexical walk descends
			// into the external directory and finds the shadow under its
			// lexical name.
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

// A shadow under a symlinked directory that is also mixed-case must still
// be reported — the case-insensitive matching must not be lost when the
// walk follows symlinks.
test('mixed-case shadow behind a symlinked directory is reported', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-mixed-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
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

// A symlink whose real target is an ancestor of itself must not loop.
// Build the simplest cycle (a/loop -> .) and confirm the walk terminates
// and reports nothing on a clean tree.
test('a self-referential symlinked directory does not loop', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-cycle-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
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

// A symlink whose target sits outside the repository root is inspected via
// its lexical entry: shadows sitting at the root of the external target are
// reported under their lexical path through the symlink.
test('shadow at the root of a symlinked directory escaping the repository root is reported under its lexical path', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-escape-'),
	);

	const outsideDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-symlink-escape-outside-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
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
// External symlink recursion: the walk descends into the external target
// under its lexical path. Cycle protection (realpath set) keeps the
// recursion bounded; the external-depth bound fails loud.
// -----------------------------------------------------------------------

// A shadow sitting under a SUBDIRECTORY of an external symlink target must
// be reported, exactly as a shadow at the external root is.
test('shadow under a subdirectory of an external symlink target is reported', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-nested-'),
	);

	const outsideDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-nested-outside-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
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

// The recursive descent must not loop on a cycle introduced through an
// external symlink. The simplest cycle is an external target that links
// back into itself via a relative symlink (e.g.
// `external/subdir/loop -> ../../external`). A walk without a realpath
// cycle guard would loop forever; the test pins that the recursion
// terminates on a clean external tree (no shadow, no findings).
test('a cyclic external symlink does not loop the guard', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-cycle-'),
	);

	const outsideDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-external-cycle-outside-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
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

// -----------------------------------------------------------------------
// Issue #1891: a lexical path named `.dockerignore` other than the
// repository-root one creates exactly the same context divergence as the
// `<Dockerfile>.dockerignore` shadow it replaces. A future
// `docker build apps/api` would open `apps/api/.dockerignore` instead of the
// root file and re-include node_modules, dist, .worktrees, .dump and
// .claude. The guard rejects every such file by its lexical path regardless
// of git status — it walks the real filesystem, not git's tracked-file
// inventory — and skips `.worktrees/` entirely as a tooling directory (see
// the TOOLING-DIRECTORY BOUNDARY note in check-dockerignore-shadow.ts).
// -----------------------------------------------------------------------

// A regular `.dockerignore` in a subdirectory is rejected and named.
test('apps/api/.dockerignore is rejected and named', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r6-tracked-regular-'),
	);

	try {
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await writeFixtureFile(repoDir, 'apps/api/.dockerignore', '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('apps/api/.dockerignore'),
			`expected the guard to name apps/api/.dockerignore, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// A symlink named `apps/api/.dockerignore` is rejected by its lexical path.
// BuildKit dereferences the symlink, so the build context opens the target
// and re-includes everything the root `.dockerignore` would have excluded.
test('apps/api/.dockerignore is rejected by its lexical path even when it is a symlink', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r6-tracked-symlink-'),
	);

	try {
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await writeFixtureFile(repoDir, 'real.dockerignore', '');
		await mkdir(path.join(repoDir, 'apps', 'api'), { recursive: true });
		await symlink(
			path.join('..', '..', 'real.dockerignore'),
			path.join(repoDir, 'apps', 'api', '.dockerignore'),
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('apps/api/.dockerignore'),
			`expected the guard to name apps/api/.dockerignore even when it is a symlink, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// A `.dockerignore` inside `.worktrees/` is not a finding: the walk skips
// that directory by name as tooling metadata (a parallel worktree's own
// root `.dockerignore` is legitimate for that worktree).
test('a .dockerignore inside .worktrees/ is not a finding', async () => {
	const repoDir = await mkdtemp(path.join(os.tmpdir(), 'publyapp-r6-ignored-'));

	try {
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await mkdir(path.join(repoDir, '.worktrees', 'example'), {
			recursive: true,
		});
		await writeFixtureFile(
			repoDir,
			'.worktrees/example/.dockerignore',
			'node_modules\n',
		);

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			!findings.some((finding) => finding.startsWith('.worktrees/example/')),
			`expected the guard not to flag a .dockerignore inside .worktrees/, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// Issue #1977: the guard's invariant is purely name/location-based — it
// does not parse `.dockerignore` file contents at all. A shadow file is a
// finding regardless of what rules it contains, including gitignore-style
// negation lines that would be ambiguous to a content-aware checker.
test('a shadow file containing gitignore-style negation lines is still flagged by name alone', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r6-negation-'),
	);

	try {
		await writeFixtureFile(
			repoDir,
			'.dockerignore',
			'node_modules\nleaked/\n!leaked/Dockerfile.dockerignore\n',
		);
		await writeFixtureFile(repoDir, 'leaked/Dockerfile.dockerignore', '');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('leaked/Dockerfile.dockerignore'),
			`expected the guard to flag the shadow regardless of its negation-style contents, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// #2061: two distinct BuildKit-visible lexical routes reach the same real
// subtree (`a_real/` vs. `b_linked -> a_real`). Plain directories inside an
// alias walk must consult/update the route-local set, or the canonical
// real visit silently collapses the symlinked lexical route. Nesting the
// shadow at `a_real/sub/Dockerfile.DockerIgnore` pins the per-route invariant:
// canonical `a_real/sub/...` and symlink alias `b_linked/sub/...` are two
// distinct BuildKit-visible lexical routes, and the strict invariant reports
// both.
test('a_real/sub/ and b_linked/sub/ are both reported as distinct lexical routes', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-pr2061-nested-'),
	);

	try {
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await mkdir(path.join(repoDir, 'a_real', 'sub'), { recursive: true });
		await writeFile(
			path.join(repoDir, 'a_real', 'sub', 'Dockerfile.DockerIgnore'),
			'',
		);
		await symlink('a_real', path.join(repoDir, 'b_linked'), 'dir');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		assert.ok(
			findings.includes('b_linked/sub/Dockerfile.DockerIgnore'),
			`expected the guard to flag the nested lexical symlink route, got: ${JSON.stringify(findings)}`,
		);
		assert.ok(
			findings.includes('a_real/sub/Dockerfile.DockerIgnore'),
			`expected the guard to also flag the canonical real route under the strict invariant, got: ${JSON.stringify(findings)}`,
		);
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// Sibling lexical routes inside an alias walk stay independent:
//   alias -> base
//   base/target/Dockerfile.dockerignore
//   base/x -> target
//   base/y -> target
test('sibling symlinks x and y inside an alias walk do not collapse each other (#2061)', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-pr2061-sibling-alias-'),
	);

	try {
		await writeFixtureFile(repoDir, '.dockerignore', 'node_modules\n');
		await mkdir(path.join(repoDir, 'base', 'target'), { recursive: true });
		await writeFile(
			path.join(repoDir, 'base', 'target', 'Dockerfile.dockerignore'),
			'',
		);
		await symlink('target', path.join(repoDir, 'base', 'x'), 'dir');
		await symlink('target', path.join(repoDir, 'base', 'y'), 'dir');
		await symlink('base', path.join(repoDir, 'alias'), 'dir');

		const findings = await findDockerignoreShadows({ rootDir: repoDir });

		const expectedRoutes = [
			'base/target/Dockerfile.dockerignore',
			'base/x/Dockerfile.dockerignore',
			'base/y/Dockerfile.dockerignore',
			'alias/target/Dockerfile.dockerignore',
			'alias/x/Dockerfile.dockerignore',
			'alias/y/Dockerfile.dockerignore',
		];

		for (const route of expectedRoutes) {
			assert.ok(
				findings.includes(route),
				`expected every BuildKit-visible lexical route to be reported, missing ${route}, got: ${JSON.stringify(findings)}`,
			);
		}
	} finally {
		await rm(repoDir, { recursive: true, force: true });
	}
});

// A deeply nested external symlink chain that exceeds the recursion depth
// bound must fail loud (reject), NOT silently drop the walk's findings. The
// walk must either report the path that triggers the overflow OR reject
// with a clear cause; the pinned behaviour here is "report the shadow that
// triggered the overflow so the maintainer sees it".
test('a deeply nested external symlink chain is still scanned or fails loud', async () => {
	const repoDir = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-deep-external-'),
	);

	const outsideRoot = await mkdtemp(
		path.join(os.tmpdir(), 'publyapp-r5-deep-external-outside-'),
	);

	try {
		await writeFile(path.join(repoDir, '.dockerignore'), 'node_modules\n');
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
		// nothing on a depth-exceeding external chain would be a silent
		// false negative — the exact failure mode this guard exists to
		// prevent.
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
