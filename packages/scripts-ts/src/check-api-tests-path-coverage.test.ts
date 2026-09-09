import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
	entryCoversDir,
	findPathCoverageProblems,
	findSpecReferencedProjectDirs,
	readApiTestsGateSurfaces,
} from './check-api-tests-path-coverage.ts';

// Guard for the central CI API lane's path coverage (PR #1975 round 2),
// including its reachability proof (issue #2005).
//
// WHY THE REACHABILITY TEST EXISTS
// --------------------------------
// The original #1975 guard shipped only as a vitest file executed by a
// predecessor self-test job, which was gated on that workflow's classifier.
// A PR that added a project to PublyApp.slnx -- the exact change that breaks
// the guard's invariant -- could therefore skip the guard (the #2005 hole).
//
// The coverage logic is an ordinary pure-node behavior exercised against the
// real tree and representative workflow/path fixtures. Hosted reachability is
// owned by the existing workflow and required-context mechanism, not by a
// test that polices another guard's wiring.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

const read = (relativePath) =>
	readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('path coverage behavior rejects a representative uncovered API project in a supplied workflow root', () => {
	const rootDir = mkdtempSync(
		path.join(os.tmpdir(), 'publyapp-api-path-fixture-'),
	);
	try {
		mkdirSync(path.join(rootDir, '.github/workflows'), { recursive: true });
		mkdirSync(path.join(rootDir, 'apps/api/Tests'), { recursive: true });
		writeFileSync(
			path.join(rootDir, 'PublyApp.slnx'),
			'<Solution><Project Path="apps/api/PublyApp.Api.csproj" /></Solution>',
		);
		writeFileSync(
			path.join(rootDir, 'apps/api/Tests/Fixture.Spec.cs'),
			'var args = new[] { "--project", "apps/api" };',
		);
		writeFileSync(
			path.join(rootDir, '.github/workflows/ci.yml'),
			`on:\n  push:\n    paths:\n      - 'other/**'\njobs:\n  changes:\n    steps:\n      - name: Filter\n        id: filter\n        run: |\n          node "$CLASSIFIER" '^(other/)'\n`,
		);
		assert.notDeepEqual(findPathCoverageProblems(rootDir), []);
	} finally {
		rmSync(rootDir, { recursive: true, force: true });
	}
});

/** Recursively lists files under a repo-relative dir that match a suffix. */
const walkFiles = (dir, suffix, acc = []) => {
	const entries = readdirSync(path.join(repoRoot, dir), {
		withFileTypes: true,
	});
	for (const entry of entries) {
		const full = path.posix.join(dir, entry.name);
		if (entry.isDirectory()) {
			walkFiles(full, suffix, acc);
		} else if (entry.name.endsWith(suffix)) {
			acc.push(full);
		}
	}
	return acc;
};

test('every project built or run by an API-test spec is covered by the central API lane', () => {
	// Runs the same pure-node function the central workflow's API lane
	// path-coverage job executes. It reads the REAL workflow files, the REAL
	// PublyApp.slnx and the REAL spec sources, and throws/returns findings on
	// any gap or unanalyzable input.
	assert.deepEqual(findPathCoverageProblems(), []);
});

// The GitHub glob semantics the coverage check relies on, pinned against the
// entries the real workflows actually use plus the adversarial forms a
// mutation could try.
test('entryCoversDir implements GitHub push.paths glob semantics', () => {
	const cases = [
		// The real entries in this repo.
		['apps/**', 'apps/api', true],
		['apps/**', 'apps/apphost', true],
		['apps/api/**', 'apps/api', true],
		['apps/apphost/**', 'apps/apphost', true],
		['packages/**', 'packages/scripts-cs', true],
		// The `*` cannot cross `/`: an entry that cannot match any FILE under
		// the dir (only the bare dir name) must NOT count as coverage — this
		// is the exact shape that recreates the #1975 round-2 hole.
		['apps/apphost*', 'apps/apphost', false],
		['apps/apphost*', 'apps/api', false],
		['apps/*/extra', 'apps/api', false],
		// Unrelated dirs must not be covered by a sibling entry.
		['apps/api/**', 'apps/apphost', false],
	];

	for (const [entry, dir, expected] of cases) {
		assert.equal(
			entryCoversDir(entry, dir),
			expected,
			`entryCoversDir('${entry}', '${dir}') must be ${expected}`,
		);
	}
});

// The specs' argv forms are the guard's evidence; pin the extractor against
// the shapes found in the real AppHostOrchestrationGuardSpec so a future
// rename cannot silently change what "referenced by a test" means.
test('findSpecReferencedProjectDirs extracts argv forms, not prose mentions', () => {
	const specFiles = walkFiles('apps/api', '.Spec.cs');
	const apphostSpec = specFiles.find((file) =>
		file.endsWith('AppHostOrchestrationGuard.Spec.cs'),
	);

	assert.ok(
		apphostSpec !== undefined,
		"AppHostOrchestrationGuardSpec no longer exists under apps/api — the barrier's AppHost compile reference is gone; investigate.",
	);

	const contents = read(apphostSpec);
	const argvRefs = [
		...contents.matchAll(
			/--project[",\s]+apps\/([A-Za-z0-9._-]+)|"build",\s*"apps\/([A-Za-z0-9._-]+)"/g,
		),
	].map((match) => (match[1] ?? match[2]).length);

	assert.ok(
		argvRefs.length >= 3,
		'AppHostOrchestrationGuardSpec lost its documented build/run argv references to apps/apphost — the guard is blind to what the spec no longer compiles.',
	);

	// Prose mentions (docker-compose paths etc.) are NOT project references:
	// the non-apphost tokens the broad scan finds must stay out of the build
	// set. Confirmed: apps/front appears in specs only as prose.
	const referencedDirs = findSpecReferencedProjectDirs();
	const allTokens = new Set();
	for (const file of specFiles) {
		for (const match of read(file).matchAll(/\bapps\/[A-Za-z0-9._-]+/g)) {
			allTokens.add(match[0]);
		}
	}
	for (const token of allTokens) {
		if (token !== 'apps/api' && token !== 'apps/apphost') {
			assert.ok(
				!referencedDirs.includes(token),
				`${String(token)} is mentioned in spec prose but must not be treated as a barrier-compiled project.`,
			);
		}
	}
});

test('the central classifier command and API lane remain executable and cover API projects', () => {
	const surfaces = readApiTestsGateSurfaces(read('.github/workflows/ci.yml'));
	assert.equal(surfaces.classifierCommand, 'node "$classifier" --lanes');
	assert.match(surfaces.classifierPattern, /apps\/api\//);
	assert.match(surfaces.classifierPattern, /apps\/apphost\//);
	assert.ok(surfaces.compiled.test('apps/api/Program.cs'));
	assert.ok(surfaces.compiled.test('apps/apphost/Program.cs'));
});

test('the central classifier command fails closed when its command is replaced', () => {
	const central = read('.github/workflows/ci.yml');
	const broken = central.replace(
		'node "$classifier" --lanes',
		'echo node "$classifier" --lanes',
	);
	assert.throws(
		() => readApiTestsGateSurfaces(broken),
		/classifier command|effective command/i,
	);
});

test('the standalone path-coverage CLI executes successfully against the real tree', () => {
	const result = spawnSync(
		process.execPath,
		[
			path.join(
				repoRoot,
				'packages/scripts-ts/src/check-api-tests-path-coverage.ts',
			),
		],
		{
			cwd: repoRoot,
			encoding: 'utf8',
		},
	);

	assert.equal(result.error, undefined, result.error?.message);
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /\[api-tests-path-coverage\].*\[OK\]/);
	assert.equal(result.stderr, '');
});
