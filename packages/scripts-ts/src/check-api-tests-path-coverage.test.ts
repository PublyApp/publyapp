import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

// Guard for the API-test barrier's path-filter coverage (PR #1975 round 2).
//
// WHY THIS EXISTS
// ---------------
// Round 2 of #1975 removed apps/apphost from PublyApp.slnx so the quality
// gate's `dotnet build PublyApp.slnx` no longer resolves Aspire.Hosting.* on
// every PR. That left `apps/apphost/Program.cs`, which is only COMPILED by
// AppHostOrchestrationGuardSpec inside the API test suite, covered by no
// workflow path filter: a PR touching ONLY apps/apphost/ triggered api-tests
// (its classifier had no apps/apphost/ group) and the slnx build no longer
// compiled the AppHost, so a broken AppHost passed the whole barrier. Round-2
// proof (measured on real CI): an apphost-only PR with an uncompilable
// Program.cs kept api-tests-gate green while the suite was skipped.
//
// This guard closes the CLASS: every project the barrier actually compiles
// (the slnx projects built by quality-gate, and any project built or run by
// an API-test spec) must be reached by at least one path filter of the
// workflow that runs that compilation. It reads the REAL workflow files, the
// REAL PublyApp.slnx and the REAL spec sources — no hand-maintained model of
// any of them.
//
// WHAT THIS PROVES
// ----------------
//  1. Every project dir that an API-test spec builds or runs (`--project
//     apps/<d>` or `"build", "apps/<d>"` argv forms) is covered by BOTH
//     api-tests.yml path-filter surfaces: the `push.paths` list AND the
//     changed-paths classifier regex. Losing either surface for a compiled
//     project goes RED naming the project.
//  2. The two api-tests.yml surfaces carry the SAME `apps/<seg>` groups
//     (the file's own comment promises they are deliberately identical).
//  3. Every project in the real PublyApp.slnx is covered by at least one
//     path filter of the .NET barrier workflows (quality-gate.yml or
//     api-tests.yml), so a project the quality gate compiles cannot be
//     silently dropped from every trigger, either.
//
// WHAT THIS DOES NOT PROVE
// ------------------------
// That the api-tests workflow's gate logic itself is sound (that is
// check-ci-gate-structure.ts's job), or that AppHostOrchestrationGuardSpec
// still compiles what it claims (its own mutation matrix witnesses that).
// A spec that deletes its own compile invocation while leaving a project
// unreachable by tests is a DIFFERENT degradation: this guard only
// guarantees that the filter surfaces keep the existing references covered.
// The guard's inputs fail LOUD when missing or unanalyzable: an absent
// classifier invocation, an empty slnx, or zero project references in the
// spec tree are all RED, never a vacuous green.

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
	'..',
);

const read = (relativePath) =>
	readFileSync(path.join(repoRoot, relativePath), 'utf8');

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

/**
 * GitHub-style glob match over a path (the semantics GitHub Actions uses for
 * `push.paths`: `*` matches any chars except `/`, `**` matches any chars
 * including `/`). Implemented as a small converter to a real RegExp so the
 * matcher itself is a faithful, testable translation of the documented rules.
 */
const globToRegExp = (pattern) => {
	const segments = pattern.split('/');
	const converted = segments
		.map((segment) => {
			if (segment === '**') {
				return '.*';
			}
			if (segment === '*') {
				return '[^/]*';
			}
			return segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
		})
		.join('/');
	return new RegExp(`^${converted}$`);
};

/** True when a `push.paths` entry matches at least one file under the dir. */
const entryCoversDir = (entry, dir) =>
	globToRegExp(entry).test(`${dir}/Program.cs`);

const coveredByAnyEntry = (dir, entries) =>
	entries.some((entry) => entryCoversDir(entry, dir));

/** Extracts the `apps/<seg>` groups from a classifier regex's alternation text. */
const appsGroupsFromRegex = (regexText) => {
	const groups = new Set();
	for (const match of regexText.matchAll(/apps\/[A-Za-z0-9._-]+\//g)) {
		groups.add(match[0].slice(0, -1));
	}
	return groups;
};

/** Extracts the `apps/<seg>` groups from a `push.paths` entry list. */
const appsGroupsFromPathEntries = (entries) => {
	const groups = new Set();
	for (const entry of entries) {
		const match = entry.match(/^apps\/([A-Za-z0-9._-]+)(?:\/|\*\*|$)/);
		if (match !== null) {
			groups.add(`apps/${match[1]}`);
		}
	}
	return groups;
};

/**
 * Parses the real api-tests.yml into the two path-filter surfaces: the
 * `push.paths` list and the classifier regex from the `changes` job's filter
 * step. Both must exist and be analyzable; any absence throws and fails the
 * test loudly (never a silent pass).
 */
const readApiTestsGateSurfaces = () => {
	const workflow = parse(read('.github/workflows/api-tests.yml'));

	const pushPaths = workflow?.on?.push?.paths;
	assert.ok(
		Array.isArray(pushPaths) && pushPaths.length > 0,
		'api-tests.yml has no on.push.paths list (or it is empty). The path-filter coverage guard cannot evaluate the push trigger — this must never pass silently.',
	);

	const changesJob = workflow?.jobs?.changes;
	assert.ok(changesJob !== undefined, 'api-tests.yml has no changes job.');
	const filterStep = (changesJob.steps ?? []).find(
		(step) => step?.id === 'filter',
	);
	assert.ok(
		filterStep !== undefined && typeof filterStep.run === 'string',
		'api-tests.yml changes job has no step with id "filter" carrying a run script.',
	);

	const classifierMatch = filterStep.run.match(/node "\$CLASSIFIER" '([^']+)'/);
	assert.ok(
		classifierMatch !== null,
		'api-tests.yml changes job filter step no longer invokes `node "$CLASSIFIER" \'<regex>\'`. The guard cannot read the PR-trigger path filter — investigate before silencing.',
	);

	const classifierPattern = classifierMatch[1];
	let compiled;
	try {
		compiled = new RegExp(classifierPattern);
	} catch (error) {
		assert.fail(
			`api-tests.yml classifier regex does not compile: ${String(error)}`,
		);
	}

	return { pushPaths, classifierPattern, compiled };
};

/** Project dirs referenced by real API-test specs via build/run argv forms. */
const findSpecReferencedProjectDirs = () => {
	const specFiles = walkFiles('apps/api', '.Spec.cs');
	assert.ok(
		specFiles.length > 0,
		"No *.Spec.cs files found under apps/api. The spec tree is the barrier's evidence — an empty tree must fail loud, not pass vacuously.",
	);

	// The argv forms as they appear in the REAL specs: a C# string[] like
	// ["run", "--project", "apps/apphost", ...] spells the project path as
	// `--project", "apps/<d>` (comma + quote + space), while the guard's
	// printed advice and prose use `--project apps/<d>`. A row that appears in
	// NEITHER argv form is a mention, not a compile reference, and stays out.
	const argvProjectRef =
		/--project[",\s]+apps\/([A-Za-z0-9._-]+)|"build",\s*"apps\/([A-Za-z0-9._-]+)"/g;
	const dirs = new Set();
	for (const file of specFiles) {
		const contents = read(file);
		for (const match of contents.matchAll(argvProjectRef)) {
			dirs.add(`apps/${match[1] ?? match[2]}`);
		}
	}

	assert.ok(
		dirs.size > 0,
		`No project dir built or run by any API-test spec was found across ${specFiles.length} spec files (no \`--project apps/<d>\` or ["build", "apps/<d>"] argv forms). The coverage guard is blind to an empty reference set — investigate, do not silence.`,
	);

	return [...dirs].sort();
};

/** csproj-owning dirs from the real PublyApp.slnx. */
const readSlnxProjectDirs = () => {
	const slnx = read('PublyApp.slnx');
	const projectPaths = [
		...slnx.matchAll(/<Project\s+Path="([^"]+\.csproj)"/g),
	].map((match) => match[1]);

	assert.ok(
		projectPaths.length > 0,
		'PublyApp.slnx declares no <Project Path="..."> entries. The solution file is unreadable or empty of projects — fail loud, never pass vacuously.',
	);

	return projectPaths
		.map((projectPath) => path.posix.dirname(projectPath))
		.filter((dir) => dir !== '.' && dir !== '')
		.sort();
};

const barrierPushPathSurfaces = () => {
	const collect = (workflowFile) => {
		const parsed = parse(read(workflowFile));
		const paths = parsed?.on?.push?.paths;
		assert.ok(
			Array.isArray(paths) && paths.length > 0,
			`${workflowFile} has no on.push.paths list for the .NET barrier coverage check.`,
		);
		return paths;
	};

	return {
		qualityGatePushPaths: collect('.github/workflows/quality-gate.yml'),
		apiTestsPushPaths: readApiTestsGateSurfaces().pushPaths,
	};
};

test('every project built or run by an API-test spec is covered by api-tests path filters', () => {
	const { pushPaths, classifierPattern, compiled } = readApiTestsGateSurfaces();
	const referencedDirs = findSpecReferencedProjectDirs();

	const missingFromPushPaths = referencedDirs.filter(
		(dir) => !coveredByAnyEntry(dir, pushPaths),
	);
	const missingFromClassifier = referencedDirs.filter(
		(dir) => !compiled.test(`${dir}/Program.cs`),
	);

	const pushPathAppsGroups = appsGroupsFromPathEntries(pushPaths);
	assert.deepEqual(
		missingFromPushPaths,
		[],
		'The API suite compiles these projects, but api-tests.yml `push.paths` covers none of them: ' +
			`${missingFromPushPaths.join(', ')}. An apphost-style gap: changes to ONLY that project ` +
			'would never wake the workflow that compiles it. Add an `apps/<dir>/**` entry covering ' +
			'each, in BOTH api-tests.yml surfaces.',
	);
	assert.deepEqual(
		missingFromClassifier,
		[],
		'The API suite compiles these projects, but the api-tests.yml changed-paths classifier ' +
			`regex matches none of them: ${missingFromClassifier.join(', ')}. A PR touching ONLY ` +
			'their files would skip the suite. Add an `apps/<dir>/` group to the classifier regex.',
	);

	// The classifier surfaces may not silently gain or lose an `apps/<seg>`
	// group relative to the push.paths list — the workflow's own comment
	// promises the two groups are deliberately identical.
	const classifierAppsGroups = appsGroupsFromRegex(classifierPattern);
	assert.deepEqual(
		[...pushPathAppsGroups].sort(),
		[...classifierAppsGroups].sort(),
		'The api-tests.yml `push.paths` list and its classifier regex carry different `apps/<seg>` groups. The file states they are deliberately identical — a mutation touching only one surface recreates a half-closed gate. Keep them in lock-step.',
	);
});

test('every project in the real PublyApp.slnx is covered by a .NET barrier path filter', () => {
	const { qualityGatePushPaths, apiTestsPushPaths } = barrierPushPathSurfaces();
	const slnxDirs = readSlnxProjectDirs();

	const uncovered = slnxDirs.filter(
		(dir) =>
			!coveredByAnyEntry(dir, qualityGatePushPaths) &&
			!coveredByAnyEntry(dir, apiTestsPushPaths),
	);

	assert.deepEqual(
		uncovered,
		[],
		'These projects are compiled by the quality gate (they are in PublyApp.slnx) but no .NET ' +
			`barrier workflow's push.paths covers them: ${uncovered.join(', ')}. A change touching ` +
			'only such a project would never trigger the workflow that compiles it.',
	);
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
				`${token} is mentioned in spec prose but must not be treated as a barrier-compiled project.`,
			);
		}
	}
});
