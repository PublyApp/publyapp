import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';
import { parse } from 'yaml';

import {
	entryCoversDir,
	extractPushPaths,
	findPathCoverageProblems,
	findSpecReferencedProjectDirs,
	readApiTestsGateSurfaces,
} from './check-api-tests-path-coverage.ts';

// Guard for the API-test barrier's path-filter coverage (PR #1975 round 2) and
// its REACHABILITY (issue #2005).
//
// WHY THE REACHABILITY TEST EXISTS
// --------------------------------
// The original #1975 guard shipped only as this vitest file, executed by
// front-ci.yml::gate-selftest, which is gated on front-ci's OWN relevance
// classifier. A PR that added a project to PublyApp.slnx -- the exact change
// that breaks the guard's invariant -- classified as IRRELEVANT to front-ci, so
// gate-selftest was SKIPPED and the guard never ran (the #2005 hole).
//
// The fix is two layers, both proved here:
//   1. The coverage logic now lives in a PURE-NODE runnable script
//      (check-api-tests-path-coverage.ts) run by an UNCONDITIONED job
//      api-tests.yml::path-coverage on every PR. That job is the reachability
//      guarantee: slnx / apps/api spec / apps/apphost / csproj changes wake it
//      regardless of any classifier. `findPathCoverageProblems()` below is the
//      SAME function that script runs, so the vitest coverage assertion and the
//      unconditioned job share one implementation and cannot drift.
//   2. `the guard's job is unconditionally reachable` (the last test) parses
//      the REAL api-tests.yml and pins the unconditioned job's shape, so the
//      design cannot silently regress back to a relevance-gated job. Playing
//      only the guard's logic (the #1975 behavior) would leave the #2005 hole
//      open a second time; this test closes reachability itself.

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

const compareStrings = (a: string, b: string): number => {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
};

test('every project built or run by an API-test spec is covered by api-tests path filters, and every slnx project by a .NET barrier filter', () => {
	// Runs the same pure-node function the unconditioned api-tests.yml
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

// The pure-node YAML-subset reader (extractPushPaths) is the one piece of the
// unconditioned job that parses workflow YAML without the `yaml` package.
// Pin it against the two real gate workflows' trigger shapes AND the
// adversarial shapes (a nested machine, a flow-list sibling) a mutation could
// try, so a silent mis-parse cannot vacate the coverage the job certifies.
test('extractPushPaths reads on.push.paths from the real gate workflows and fails loud otherwise', () => {
	// The two workflows this guard certifies coverage FOR carry a push trigger.
	const apiTestsPaths = extractPushPaths(
		read('.github/workflows/api-tests.yml'),
	);
	const qualityGatePaths = extractPushPaths(
		read('.github/workflows/quality-gate.yml'),
	);

	// The quality gate's push filter must cover PublyApp.slnx too — the slnx
	// coverage half of this guard relies on it.
	assert.ok(
		qualityGatePaths.includes('PublyApp.slnx'),
		'quality-gate.yml push.paths must cover PublyApp.slnx — the slnx-coverage half of the guard reads this exact list.',
	);

	// The api-tests barrier must wake for the suite's own inputs.
	assert.ok(
		apiTestsPaths.includes('apps/api/**'),
		'api-tests.yml push.paths must cover apps/api — the guard reads this exact list.',
	);
	assert.ok(
		apiTestsPaths.includes('apps/apphost/**'),
		'api-tests.yml push.paths must cover apps/apphost — the guard reads this exact list.',
	);
	assert.ok(
		apiTestsPaths.includes('PublyApp.slnx'),
		'api-tests.yml push.paths must cover PublyApp.slnx — the guard reads this exact list.',
	);

	// A machine-shaped positive control: the extractor must resolve the same
	// list the `yaml` package resolves for the real file (single source of
	// truth drift check).
	const parsed = parse(read('.github/workflows/api-tests.yml'));
	assert.deepEqual(
		[...apiTestsPaths].sort(compareStrings),
		[...parsed.on.push.paths].sort(compareStrings),
		'extractPushPaths diverged from the yaml-parsed on.push.paths — the pure-node reader is no longer faithful to the real YAML.',
	);

	// Fail-loud on adversarial / unanalyzable input — never a vacuous pass.
	assert.throws(
		() => extractPushPaths('name: x\njobs: {}\n'),
		/no top-level `on:`/,
	);

	// Positive control for the indentation walker over a compress-`on` shape:
	// siblings (pull_request, merge_group) and a nested push.paths resolve.
	const compressOn =
		'on:\n  pull_request:\n  merge_group:\n  push:\n    paths:\n      - "a"\n';
	assert.deepEqual(extractPushPaths(compressOn), ['a']);

	// A workflow with `on` but no `push` child (only pull_request +
	// workflow_dispatch) must fail loud, not return nothing.
	assert.throws(
		() =>
			extractPushPaths(
				'name: x\non:\n  pull_request:\n  workflow_dispatch:\njobs:\n  a:\n    steps:\n      - run: echo\n',
			),
		/no `push:` child/,
	);
});

const readSurfacesFromText = (fileText: string) =>
	readApiTestsGateSurfaces(fileText);

const classifierFixture = (filterStep: string) => `
name: fixture
on:
  push:
    paths:
      - 'apps/api/**'
jobs:
  unrelated:
    steps:
      - run: |
          node "$CLASSIFIER" 'wrong'
  changes:
    steps:
      - name: Filter decoy
        run: |
          node "$CLASSIFIER" 'wrong'
      - name: Check paths
        id: filter
${filterStep}
`;

test('reads the exact executable changes filter command and ignores decoys', () => {
	const expectedPattern = '^(apps/api/|PublyApp\\.slnx$)';
	const surfaces = readSurfacesFromText(
		classifierFixture(
			`        run: |\n          node "$CLASSIFIER" '${expectedPattern}'`,
		),
	);

	assert.equal(
		surfaces.classifierCommand,
		`node "$CLASSIFIER" '${expectedPattern}'`,
	);
	assert.equal(surfaces.classifierPattern, expectedPattern);
});

test('rejects classifier commands that are commented, echoed, conditionally disabled, tolerated, or replaced by a no-op', () => {
	const expectedPattern = '^(apps/api/)';
	const mutations = [
		[
			'commented',
			`        run: |\n          # node "$CLASSIFIER" '${expectedPattern}'`,
		],
		[
			'echoed',
			`        run: |\n          echo node "$CLASSIFIER" '${expectedPattern}'`,
		],
		[
			'if-false',
			`        if: false\n        run: |\n          node "$CLASSIFIER" '${expectedPattern}'`,
		],
		[
			'continue-on-error',
			`        continue-on-error: true\n        run: |\n          node "$CLASSIFIER" '${expectedPattern}'`,
		],
		['no-op', '        run: |\n          :'],
	];

	for (const [name, filterStep] of mutations) {
		assert.throws(
			() => readSurfacesFromText(classifierFixture(filterStep)),
			/changes.*filter|classifier command|effective command/i,
			`${name} filter must not certify the guard as executable`,
		);
	}
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

// #2005: the reachability half. The coverage guard is only worth anything if
// the job that runs it is REACHED by the change that breaks it. This test
// parses the real api-tests.yml and pins the unconditioned path-coverage job.
//
// If any of these stop holding — the job gains a `if: needs.changes...` gate,
// it is dropped from gate.needs, the PR trigger gains a `paths:` filter, or the
// step stops invoking the pure-node script — this test FAILS naming the drift,
// refusing to leave the #2005 hole open a second time.
test('the api-tests path-coverage guard job is unconditionally reachable from every input (#2005)', () => {
	const workflow = parse(read('.github/workflows/api-tests.yml'));

	// The workflow must subscribe to pull_request without a paths filter, so it
	// always starts for ANY PR and the unconditioned job always reports on it.
	const on = workflow.on ?? {};
	assert.ok(
		on.pull_request !== undefined,
		'api-tests.yml must subscribe to `on.pull_request` so the guard is reachable on pull requests.',
	);
	assert.ok(
		on.pull_request === null ||
			on.pull_request === undefined ||
			on.pull_request.paths === undefined,
		'api-tests.yml `on.pull_request` must have NO `paths:` filter. A filter would skip the whole workflow (and therefore the path-coverage job) for PRs touching only slnx/spec/csproj — the exact #2005 hole.',
	);

	// The guard's own inputs are the things that break its invariant. Because
	// `on.pull_request` is unfiltered (asserted above), a PR touching ONLY any
	// one of them still starts this workflow and reaches the unconditioned job.
	// Naming them here makes the intent explicit and reviewable — the reachability
	// contract is that none of these inputs may ever become a worthless green.
	const guardInputs = [
		'PublyApp.slnx',
		'apps/api/PublyApp.Api.csproj',
		'apps/apphost/Program.cs',
		'.github/workflows/api-tests.yml',
	];
	for (const input of guardInputs) {
		assert.ok(
			on.pull_request === null ||
				on.pull_request === undefined ||
				on.pull_request.paths === undefined,
			`A PR touching ONLY ${input} must reach the path-coverage guard. The pull_request trigger must stay unfiltered so every real input reaches it — the exact #2005 hole.`,
		);
	}

	// The unconditioned job must exist, NOT be relevance-gated, and be wired
	// into the required gate.
	const jobs = workflow.jobs ?? {};
	const job = jobs['path-coverage'];
	assert.ok(
		job !== undefined,
		'api-tests.yml must define a `path-coverage` job running the pure-node coverage script. Without it the #2005 guard has no unconditioned executor.',
	);
	assert.ok(
		job.if === undefined,
		`api-tests.yml::path-coverage must have NO job-level \`if:\` (found ${JSON.stringify(job.if ?? null)}). Gating it on the changes classifier would skip it for slnx/spec-only changes — the exact #2005 hole.`,
	);
	assert.ok(
		job.needs === undefined,
		'api-tests.yml::path-coverage must declare no `needs` (it is standalone and unconditional; a `needs` could let an upstream skip cascade to it).',
	);

	const invokeScript = (job.steps ?? []).some(
		(step) =>
			typeof step?.run === 'string' &&
			step.run.trim() ===
				'node packages/scripts-ts/src/check-api-tests-path-coverage.ts',
	);
	assert.ok(
		invokeScript,
		'api-tests.yml::path-coverage must run `node packages/scripts-ts/src/check-api-tests-path-coverage.ts` directly. If it stops invoking the pure-node script, the unconditioned job no longer enforces the coverage invariant.',
	);

	// The job must be part of the required gate so a failure fails the PR, and
	// the gate must always report so a skipped guard is never silently accepted.
	const gateNeeds = Array.isArray(jobs.gate?.needs) ? jobs.gate.needs : [];
	assert.ok(
		gateNeeds.includes('path-coverage'),
		`api-tests.yml::gate.needs must include path-coverage so a guard failure fails the required check (found: [${gateNeeds.join(', ')}]).`,
	);
	assert.ok(
		jobs.gate?.if === 'always()',
		`api-tests.yml::gate must set \`if: always()\` (found ${JSON.stringify(jobs.gate?.if ?? null)}) so it always reports rather than treating a skipped guard as "not applicable".`,
	);

	const setupNode = (job.steps ?? []).find(
		(step) => step?.name === 'Set up Node',
	);
	assert.deepEqual(
		setupNode,
		{
			name: 'Set up Node',
			uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
			with: { 'node-version': '24' },
		},
		'api-tests.yml::path-coverage must pin Node 24 before running the standalone TypeScript CLI.',
	);
});
