import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import {
	resolveApiModules,
	parseNameStatus,
	selectApiTests,
} from './api-test-selection.ts';
import {
	LANE_OUTPUTS,
	LANE_PATTERNS,
	classifyLanes,
	classifyRelevance,
	parseChangedFilesTotal,
} from './ci-changed-paths.ts';

// These tests are the standing proof that the changed-path classifier fails
// closed at GitHub's 3,000-file "List pull request files" ceiling, rather
// than silently certifying an incomplete list as "not relevant". See #1017.

const pattern = '^(apps/front/|packages/shared-ts/)';
const classifierPath = path.join(
	path.resolve(new URL('../../..', import.meta.url).pathname),
	'packages/scripts-ts/src/ci-changed-paths.ts',
);

test('central classifier emits the exact six literal lane outputs', () => {
	const files = [
		'apps/front/src/routes.ts',
		'apps/api/Program.cs',
		'apps/front/e2e/home.spec.ts',
		'docs/guides/ci.md',
		'packages/scripts-ts/src/ci-changed-paths.ts',
	];
	const result = classifyLanes({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
	});

	assert.deepEqual(Object.keys(result.outputs), LANE_OUTPUTS);
	for (const lane of LANE_OUTPUTS) {
		assert.equal(result.outputs[lane], 'true');
	}
});

test('classifier --lanes CLI writes exactly the six lane outputs', () => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), 'publyapp-classifier-cli-'));
	const githubOutput = path.join(cwd, 'github-output.txt');
	writeFileSync(githubOutput, '');
	try {
		const result = spawnSync(process.execPath, [classifierPath, '--lanes'], {
			cwd,
			encoding: 'utf8',
			env: {
				...process.env,
				GITHUB_EVENT_NAME: 'push',
				GITHUB_OUTPUT: githubOutput,
			},
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(
			readFileSync(githubOutput, 'utf8'),
			'quality=true\nfront=true\napi=true\ne2e=true\ndocs=true\nreact=true\n',
		);
	} finally {
		rmSync(cwd, { recursive: true, force: true });
	}
});

test('central classifier fails closed for malformed or count-mismatched evidence', () => {
	for (const input of [
		{ files: null, changedFilesTotal: 0 },
		{ files: ['README.md'], changedFilesTotal: 2 },
		{ files: ['README.md'], changedFilesTotal: undefined },
	]) {
		const result = classifyLanes({ eventName: 'pull_request', ...input });
		for (const lane of LANE_OUTPUTS) {
			assert.equal(result.outputs[lane], 'true');
		}
		assert.match(result.reason, /incomplete|malformed|missing|valid/i);
	}
});

test('merge-group and push classify every lane as relevant', () => {
	for (const eventName of ['merge_group', 'push']) {
		const result = classifyLanes({
			eventName,
			files: [],
			changedFilesTotal: 0,
		});
		assert.deepEqual(
			Object.values(result.outputs),
			LANE_OUTPUTS.map(() => 'true'),
		);
	}
});

test('lane patterns expose the single classifier source of truth', () => {
	assert.deepEqual(Object.keys(LANE_PATTERNS), LANE_OUTPUTS);
});

test('lane patterns cover the complete central trigger classes', () => {
	const cases = [
		['apps/front/src/routes/example.tsx', 'e2e'],
		['apps/api/Modules/Users/Example.cs', 'e2e'],
		['apps/front/vite.config.ts', 'e2e'],
		['apps/front/docker-compose.fork-overlay.yml', 'e2e'],
		['packages/scripts-ts/src/ci-e2e-cleanup.ts', 'e2e'],
		['packages/scripts-ts/src/ci-e2e-cleanup.test.ts', 'e2e'],
		['packages/scripts-ts/src/ci-e2e-rerun-guard.test.ts', 'e2e'],
		['.github/CODEOWNERS', 'quality'],
		['.oxlintrc.json', 'quality'],
		['.oxfmtrc.json', 'quality'],
		['.gitignore', 'quality'],
		['knip.ts', 'quality'],
		['docs/guides/dependency-health.md', 'quality'],
		['docs/deployment/first-deploy-runbook.md', 'quality'],
		['.gitattributes', 'api'],
		['packages/scripts-ts/src/shard-api-tests.ts', 'api'],
		['packages/scripts-ts/src/shard-api-tests.test.ts', 'api'],
		['packages/scripts-ts/src/test-api-shard.ts', 'api'],
		['packages/scripts-ts/src/api-test-selection.ts', 'api'],
		['.github/workflows/ci.yml', 'react'],
	] as const;

	for (const [file, lane] of cases) {
		const result = classifyLanes({
			eventName: 'pull_request',
			files: [file],
			changedFilesTotal: 1,
		});

		assert.equal(
			result.outputs[lane],
			'true',
			`${file} must select the ${lane} lane`,
		);
	}
});

test('e2e pattern includes flat ci-e2e runtime files without nearby false positives', () => {
	for (const file of [
		'packages/scripts-ts/src/ci-e2e-cleanup.ts',
		'packages/scripts-ts/src/ci-e2e-rerun-guard.test.ts',
	]) {
		assert.equal(
			classifyLanes({
				eventName: 'pull_request',
				files: [file],
				changedFilesTotal: 1,
			}).outputs.e2e,
			'true',
			`${file} must select e2e`,
		);
	}

	for (const file of [
		'packages/scripts-ts/src/ci-e2e-cleanup.ts.bak',
		'packages/scripts-ts/src/ci-e2e/cleanup.ts',
	]) {
		assert.equal(
			classifyLanes({
				eventName: 'pull_request',
				files: [file],
				changedFilesTotal: 1,
			}).outputs.e2e,
			'false',
			`${file} must not select e2e`,
		);
	}
});

test('push runs are relevant by construction, without needing file evidence', () => {
	const result = classifyRelevance({
		eventName: 'push',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
});

// ROUND 4: #1017 adds `merge_group:` to all four workflows so their required
// checks can report for a merge-queue entry (GitHub documents that a
// required check missing this event waits forever in a queue). There is no
// pull-request file list to evaluate a merge-queue entry against, so
// merge_group must resolve relevant unconditionally — proven independently
// of the generic "any non-pull_request event" case below, so a future
// change that special-cases `push` without also covering `merge_group`
// cannot pass silently.
test('merge_group runs are relevant by construction, without needing file evidence', () => {
	const result = classifyRelevance({
		eventName: 'merge_group',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /merge_group/);
});

test('merge_group runs are relevant even when files/changedFilesTotal look like a genuinely empty diff', () => {
	// Guards against a future refactor that route merge_group through the
	// same file-list logic as pull_request: even a complete, verified-empty
	// file list must not flip this to false, because merge_group has no file
	// list to evaluate in the first place.
	const result = classifyRelevance({
		eventName: 'merge_group',
		files: [],
		changedFilesTotal: 0,
		pattern: '^(apps/front/)',
	});

	assert.equal(result.relevant, true);
});

test('an arbitrary non-pull_request, non-merge_group event is still relevant by construction (the generic fallback)', () => {
	const result = classifyRelevance({
		eventName: 'workflow_dispatch',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list containing a relevant path is relevant', () => {
	const files = ['apps/front/src/routes.ts', 'README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a complete file list with no relevant path is not relevant', () => {
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: files.length,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('an empty pull request (no files changed) is not relevant', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: [],
		changedFilesTotal: 0,
		pattern,
	});

	assert.equal(result.relevant, false);
});

test('BLOCKER: a truncated list that omits the relevant file fails closed to relevant', () => {
	// The exact false-green path from the review: the PR reports far more
	// changed files than the API actually returned (the 3,000-file ceiling),
	// and none of the returned files happen to match. A naive matcher would
	// report relevant=false here and let the heavy job skip.
	const files = ['README.md', 'docs/guides/foo.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /incomplete/);
});

test('BLOCKER: exactly the 3,000-file ceiling with the total one over it fails closed', () => {
	const files = Array.from({ length: 3000 }, (_, i) => `docs/file-${i}.md`);

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 3001,
		pattern,
	});

	assert.equal(result.relevant, true);
});

test('a missing changed_files total fails closed rather than assuming completeness', () => {
	const files = ['README.md'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: undefined,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /missing|not a valid/);
});

test('a non-array file list (malformed API response) fails closed', () => {
	const result = classifyRelevance({
		eventName: 'pull_request',
		files: null,
		changedFilesTotal: 5,
		pattern,
	});

	assert.equal(result.relevant, true);
	assert.match(result.reason, /not an array/);
});

test('a file count that exceeds the reported total also fails closed (anomalous, not just short)', () => {
	const files = ['a.txt', 'b.txt', 'c.txt'];

	const result = classifyRelevance({
		eventName: 'pull_request',
		files,
		changedFilesTotal: 2,
		pattern,
	});

	assert.equal(result.relevant, true);
});

// ---------------------------------------------------------------------------
// parseChangedFilesTotal(): the exact boundary round 2 found broken. `gh
// api --jq` on a missing property (or a literal `null`) exits 0 with EMPTY
// stdout, and naive `Number('')` is `0` — a fabricated, valid-looking total.
// classifyRelevance() itself was always correct about undefined/null; the
// CLI was handing it a lie instead. These pin the raw-string boundary.
// ---------------------------------------------------------------------------

test('parseChangedFilesTotal: empty stdout (missing changed_files) is invalid', () => {
	assert.equal(parseChangedFilesTotal(''), undefined);
});

test('parseChangedFilesTotal: whitespace-only stdout is invalid', () => {
	assert.equal(parseChangedFilesTotal('   \n'), undefined);
});

test('parseChangedFilesTotal: literal "null" (jq\'s rendering of a null field) is invalid', () => {
	assert.equal(parseChangedFilesTotal('null\n'), undefined);
});

test('parseChangedFilesTotal: a non-numeric value is invalid', () => {
	assert.equal(parseChangedFilesTotal('abc'), undefined);
});

test('parseChangedFilesTotal: a negative value is invalid', () => {
	assert.equal(parseChangedFilesTotal('-1'), undefined);
});

test('parseChangedFilesTotal: a decimal value is invalid', () => {
	assert.equal(parseChangedFilesTotal('3.5'), undefined);
});

// ---------------------------------------------------------------------------
// PR-time API test selection (api-test-selection.ts). The full suite stays the
// merge queue's job; a pull request may run only the modules it touches. These
// tests pin the three properties the selector must never lose: merge_group
// always runs everything, every unmapped path runs everything, and a
// module-only diff runs exactly that module.
// ---------------------------------------------------------------------------

const moduleChange = {
	status: 'M',
	paths: ['apps/api/Modules/Posts/Handlers/Tenant/CreatePost.cs'],
};

test('API selection: merge_group, push and every non-PR event run the full set', () => {
	for (const eventName of ['merge_group', 'push', 'workflow_dispatch', '']) {
		const selection = selectApiTests({
			eventName,
			changedPaths: [moduleChange],
		});

		assert.equal(selection.mode, 'full');
		assert.match(selection.reason, /whole API suite|non-pull_request/);
	}
});

test('API selection: no diff read happens off pull_request', () => {
	let read = false;
	const modules = resolveApiModules({
		eventName: 'merge_group',
		changedPaths: () => {
			read = true;
			return [];
		},
	});

	assert.equal(modules, undefined);
	assert.equal(read, false);
});

test('API selection: every fail-closed trigger selects the whole suite', () => {
	const fullSuitePaths = [
		'apps/api/Lib/AppEnvironment.cs',
		'apps/api/Data/DbContext/AppDbContext.cs',
		'apps/api/Infrastructure/Jobs/JobQueueProcessor.cs',
		'apps/api/Migrations/20260101_DropLegacyColumn.cs',
		'apps/api/Program.cs',
		'apps/api/PublyApp.Api.csproj',
		'apps/api/Tests/PublyApp.Api.Tests.csproj',
		'Directory.Build.props',
		'Directory.Packages.props',
		'global.json',
		'apps/apphost/Program.cs',
		'packages/shared-ts/src/lib/errors.ts',
		'packages/client-ts/src/apiClient.ts',
		'packages/lint-cs/PublyApp.Analyzers.csproj',
		'justfile',
		'pnpm-lock.yaml',
		'.github/workflows/ci.yml',
		'.gitattributes',
	];

	for (const changedPath of fullSuitePaths) {
		const selection = selectApiTests({
			eventName: 'pull_request',
			changedPaths: [{ status: 'M', paths: [changedPath] }],
		});
		assert.equal(selection.mode, 'full', `${changedPath} must run everything`);

		const modules = resolveApiModules({
			eventName: 'pull_request',
			changedPaths: () => [{ status: 'M', paths: [changedPath] }],
		});
		assert.equal(modules, undefined, `${changedPath} must not narrow the run`);
	}
});

test('API selection: a deleted or renamed path runs everything', () => {
	const histories = [
		{
			status: 'D',
			paths: ['apps/api/Modules/Posts/Handlers/Tenant/CreatePost.cs'],
		},
		{
			status: 'R100',
			paths: [
				'apps/api/Modules/Posts/Handlers/Tenant/CreatePost.cs',
				'apps/api/Modules/Users/Handlers/Tenant/CreateUser.cs',
			],
		},
		{
			status: 'R100',
			paths: [
				'apps/api/Modules/Posts/Handlers/Tenant/CreatePost.cs',
				'apps/api/Modules/Posts/Handlers/Tenant/CreatePostV2.cs',
			],
		},
	];

	for (const changedPath of histories) {
		const selection = selectApiTests({
			eventName: 'pull_request',
			changedPaths: [changedPath],
		});
		assert.equal(selection.mode, 'full');
		assert.match(selection.reason, /deleted\/renamed/);
	}
});

test('API selection: a module-only diff selects exactly that module', () => {
	const selection = selectApiTests({
		eventName: 'pull_request',
		changedPaths: [
			moduleChange,
			{
				status: 'A',
				paths: ['apps/api/Modules/Posts/Handlers/Tenant/CreatePost.Spec.cs'],
			},
		],
	});

	assert.equal(selection.mode, 'modules');
	assert.deepEqual(selection.mode === 'modules' && selection.modules, [
		'Posts',
	]);
});

test('API selection: multiple modules union, and non-API paths are ignored', () => {
	const selection = selectApiTests({
		eventName: 'pull_request',
		changedPaths: [
			moduleChange,
			{ status: 'M', paths: ['apps/api/Modules/Users/Entities/User.cs'] },
			{ status: 'M', paths: ['apps/front/src/routes/posts.tsx'] },
			{ status: 'M', paths: ['docs/guides/api.md'] },
		],
	});

	assert.equal(selection.mode, 'modules');
	assert.deepEqual(selection.mode === 'modules' && selection.modules, [
		'Posts',
		'Users',
	]);
});

test('API selection: an empty or non-API diff runs everything', () => {
	for (const changedPaths of [
		[],
		[{ status: 'M', paths: ['apps/front/src/routes/posts.tsx'] }],
	]) {
		const selection = selectApiTests({
			eventName: 'pull_request',
			changedPaths,
		});
		assert.equal(selection.mode, 'full');
	}
});

test('API selection: a failed diff read falls back to the full suite, never to a narrow run', () => {
	const modules = resolveApiModules({
		eventName: 'pull_request',
		changedPaths: () => {
			throw new Error('git fetch failed');
		},
	});

	assert.equal(modules, undefined);
});

test('API selection: the workflow keeps the unparameterized full-suite command', () => {
	// The event gate lives in the scripts, not in YAML: nothing may hand a
	// module list to the merge-queue command. If this assertion fails, the
	// queue path is no longer the byte-identical full-suite invocation.
	const workflow = readFileSync(
		path.join(
			path.resolve(new URL('../../..', import.meta.url).pathname),
			'.github/workflows/ci.yml',
		),
		'utf8',
	);
	assert.match(
		workflow,
		/run: just test-api-shard \$\{\{ matrix\.shard \}\} 4\s*$/m,
	);
});

test('API selection: parses git name-status -z records, including renames', () => {
	assert.deepEqual(
		parseNameStatus(
			'M\0apps/api/Modules/Posts/A.cs\0R100\0old/One.cs\0new/Two.cs\0',
		),
		[
			{ status: 'M', paths: ['apps/api/Modules/Posts/A.cs'] },
			{ status: 'R100', paths: ['old/One.cs', 'new/Two.cs'] },
		],
	);
	assert.deepEqual(parseNameStatus(''), []);
});

test('API selection: an unparseable diff record throws instead of guessing', () => {
	for (const output of ['M\0', 'R100\0only-one-path\0']) {
		assert.throws(() => parseNameStatus(output), /Unparseable/);
	}
});
