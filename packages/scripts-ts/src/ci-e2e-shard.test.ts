import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { buildPlan, flattenTests, partition } from './ci-e2e-shard.ts';

const report = {
	suites: [
		{
			title: 'auth.spec.ts',
			file: 'e2e/auth.spec.ts',
			specs: [
				{
					file: 'e2e/auth.spec.ts',
					title: 'logs in',
					tests: [
						{ projectName: 'chromium' },
						{ projectName: 'chromium-faults' },
					],
				},
			],
		},
		{
			title: 'auth.setup.ts',
			file: 'e2e/auth.setup.ts',
			specs: [
				{
					file: 'e2e/auth.setup.ts',
					title: 'setup',
					tests: [{ projectName: 'setup' }],
				},
			],
		},
	],
};

test('flattenTests counts every project as its own test and drops setup', () => {
	const tests = flattenTests(report);
	assert.deepEqual(
		tests.map((entry) => entry.key),
		[
			'e2e/auth.spec.ts::chromium::auth.spec.ts > logs in',
			'e2e/auth.spec.ts::chromium-faults::auth.spec.ts > logs in',
		],
	);
});

test('partition is deterministic and balances the heaviest files first', () => {
	const weights = [
		{ file: 'e2e/a.spec.ts', weight: 50 },
		{ file: 'e2e/b.spec.ts', weight: 40 },
		{ file: 'e2e/c.spec.ts', weight: 30 },
		{ file: 'e2e/d.spec.ts', weight: 20 },
		{ file: 'e2e/e.spec.ts', weight: 10 },
		{ file: 'e2e/f.spec.ts', weight: 10 },
	];
	const first = partition(weights, 3);
	const second = partition([...weights].reverse(), 3);
	assert.deepEqual(first, second);
	assert.deepEqual(
		first.map((files) => files.length),
		[2, 2, 2],
	);
	assert.ok(first.flat().length === 6);
});

test('buildPlan weights files by recorded seconds, else by test count', () => {
	const tests = [
		{
			key: 'a::chromium::x',
			file: 'e2e/a.spec.ts',
			project: 'chromium',
			title: 'x',
		},
		{
			key: 'b::chromium::y',
			file: 'e2e/b.spec.ts',
			project: 'chromium',
			title: 'y',
		},
	];
	const plan = buildPlan(tests, 2, { 'e2e/a.spec.ts': 50 });
	assert.equal(plan.shards.length, 2);
	assert.equal(plan.shards[0]?.files[0], 'e2e/a.spec.ts');
	assert.equal(plan.shards[1]?.files[0], 'e2e/b.spec.ts');
	assert.equal(plan.expected.length, 2);
});

test('buildPlan places a heavier file alone when it dominates', () => {
	const tests = [
		{
			key: 'a::chromium::x',
			file: 'e2e/a.spec.ts',
			project: 'chromium',
			title: 'x',
		},
		{
			key: 'b::chromium::y',
			file: 'e2e/b.spec.ts',
			project: 'chromium',
			title: 'y',
		},
		{
			key: 'c::chromium::z',
			file: 'e2e/c.spec.ts',
			project: 'chromium',
			title: 'z',
		},
	];
	const plan = buildPlan(tests, 2, {
		'e2e/a.spec.ts': 100,
		'e2e/b.spec.ts': 10,
		'e2e/c.spec.ts': 10,
	});
	assert.deepEqual(plan.shards[0]?.files, ['e2e/a.spec.ts']);
	assert.deepEqual(plan.shards[1]?.files, ['e2e/b.spec.ts', 'e2e/c.spec.ts']);
});

test('flattenTests rejects a truncated report instead of silently dropping its specs', () => {
	assert.throws(
		() =>
			flattenTests({
				suites: [
					{
						specs: [
							{ file: '', title: 'x', tests: [{ projectName: 'chromium' }] },
						],
					},
				],
			}),
		/has no file/,
	);
	assert.throws(
		() =>
			flattenTests({
				suites: [
					{ specs: [{ file: 'e2e/a.spec.ts', title: 'x', tests: [{}] }] },
				],
			}),
		/has no projectName/,
	);
});

test('buildPlan treats a recorded zero duration as missing data, not as a weight', () => {
	const plan = buildPlan(
		[
			{
				key: 'a::chromium::x',
				file: 'e2e/a.spec.ts',
				project: 'chromium',
				title: 'x',
			},
		],
		1,
		{ 'e2e/a.spec.ts': 0 },
	);
	assert.equal(plan.shards[0]?.weight, 3);
});

const shardScript = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'ci-e2e-shard.ts',
);

const fakePnpm = `const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_PNPM_LOG, JSON.stringify(args) + '\\n');
if (args.includes('--list')) {
	const out = process.env.PLAYWRIGHT_JSON_OUTPUT;
	const target = path.isAbsolute(out) ? out : path.resolve(process.cwd(), 'apps/front', out);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	const report = process.env.FAKE_LIST_EMPTY === 'true'
		? { suites: [] }
		: { suites: [{ title: 'aggregator-key.spec.ts', file: 'e2e/aggregator-key.spec.ts', specs: [{ file: 'e2e/aggregator-key.spec.ts', title: 'key', tests: [{ projectName: 'chromium' }, { projectName: 'chromium-faults' }] }] }] };
	fs.writeFileSync(target, JSON.stringify(report));
}
`;

type CliSandbox = {
	root: string;
	env: NodeJS.ProcessEnv;
	log: string;
	ghLog: string;
	output: string;
};

const makeSandbox = (): CliSandbox => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'publyapp-e2e-cli-'));
	const bin = path.join(root, 'bin');
	mkdirSync(bin);
	writeFileSync(path.join(bin, 'pnpm'), `#!/usr/bin/env node\n${fakePnpm}`, {
		mode: 0o755,
	});
	writeFileSync(
		path.join(bin, 'gh'),
		`#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'api') {
	if (process.env.FAKE_GH_API_FAIL === 'true') {
		process.stderr.write('gh: HTTP 403 rate limit exceeded\\n');
		process.exit(1);
	}
	process.stdout.write(process.env.FAKE_GH_RUNS ?? '{"workflow_runs":[]}');
	process.exit(0);
}
if (process.env.FAKE_GH_DOWNLOAD === 'true') {
	const name = args[args.indexOf('-n') + 1] ?? '';
	const dir = args[args.indexOf('-D') + 1] ?? process.env.E2E_ARTIFACTS;
	fs.mkdirSync(dir, { recursive: true });
	if (name.startsWith('e2e-shard-plan')) {
		fs.writeFileSync(path.join(dir, 'e2e-shard-plan.json'), process.env.FAKE_GH_PLAN ?? '{}');
	} else if (name.startsWith('e2e-file-durations')) {
		fs.writeFileSync(path.join(dir, 'durations.json'), process.env.FAKE_GH_DURATIONS ?? '{}');
	} else {
		const target = path.join(dir, name);
		fs.mkdirSync(target, { recursive: true });
		fs.writeFileSync(path.join(target, 'playwright-1-of-6.json'), '{}');
	}
	process.exit(0);
}
process.stderr.write('gh: HTTP 403 rate limit exceeded\\n');
process.exit(1);
`,
		{ mode: 0o755 },
	);
	const log = path.join(root, 'pnpm.log');
	const ghLog = path.join(root, 'gh.log');
	const output = path.join(root, 'github-output');
	writeFileSync(log, '');
	writeFileSync(ghLog, '');
	writeFileSync(output, '');
	return {
		root,
		log,
		ghLog,
		output,
		env: {
			...process.env,
			PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
			GITHUB_EVENT_NAME: 'merge_group',
			GITHUB_OUTPUT: output,
			FAKE_PNPM_LOG: log,
			FAKE_GH_LOG: ghLog,
		},
	};
};

const runShardCli = (
	sandbox: CliSandbox,
	command: string,
	extraEnv: NodeJS.ProcessEnv = {},
) =>
	spawnSync(process.execPath, [shardScript, command], {
		cwd: sandbox.root,
		encoding: 'utf8',
		env: { ...sandbox.env, ...extraEnv },
	});

const planFilePath = (sandbox: CliSandbox) =>
	path.join(sandbox.root, 'apps', 'front', 'e2e-artifacts', 'e2e-shard-plan.json');

test('plan writes the plan to a file, never to an output/env string', () => {
	const sandbox = makeSandbox();
	try {
		const run = runShardCli(sandbox, 'plan', { FAKE_GH_API_FAIL: 'true' });
		assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
		assert.match(run.stdout, /cold-start weights/);
		assert.equal(readFileSync(sandbox.output, 'utf8'), '');
		const plan = JSON.parse(readFileSync(planFilePath(sandbox), 'utf8')) as {
			shards: { files: string[] }[];
			expected: { key: string }[];
			durations: Record<string, number>;
		};
		assert.equal(plan.expected.length, 2);
		assert.equal(plan.shards.length, 6);
		assert.deepEqual(
			[...new Set(plan.shards.flatMap((shard) => shard.files))].sort(),
			['e2e/aggregator-key.spec.ts'],
		);
		assert.deepEqual(plan.durations, {});
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('plan weights files by the durations of the runs the REST endpoint lists', () => {
	const sandbox = makeSandbox();
	try {
		const run = runShardCli(sandbox, 'plan', {
			FAKE_GH_RUNS: '{"workflow_runs":[{"id":42,"run_attempt":3}]}',
			FAKE_GH_DOWNLOAD: 'true',
			FAKE_GH_DURATIONS: '{"e2e/aggregator-key.spec.ts":120}',
		});
		assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
		const plan = JSON.parse(readFileSync(planFilePath(sandbox), 'utf8')) as {
			shards: { weight: number }[];
			durations: Record<string, number>;
		};
		assert.deepEqual(plan.durations, { 'e2e/aggregator-key.spec.ts': 120 });
		assert.equal(plan.shards[0]?.weight, 120);
		const ghArgs = readFileSync(sandbox.ghLog, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as string[]);
		assert.deepEqual(ghArgs[0]?.slice(0, 2), [
			'api',
			'repos/{owner}/{repo}/actions/workflows/ci.yml/runs?event=merge_group&status=success&per_page=10',
		]);
		assert.equal(ghArgs[1]?.[ghArgs[1].indexOf('-n') + 1], 'e2e-file-durations-3');
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('plan refuses to publish an empty test list instead of creating six empty shards', () => {
	const sandbox = makeSandbox();
	try {
		const run = runShardCli(sandbox, 'plan', { FAKE_LIST_EMPTY: 'true' });
		assert.notEqual(run.status, 0);
		assert.match(
			`${run.stdout}${run.stderr}`,
			/refusing to publish an empty plan/,
		);
		assert.equal(existsSync(planFilePath(sandbox)), false);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

const expectedTest = {
	key: 'e2e/a.spec.ts::chromium::a.spec.ts > x',
	file: 'e2e/a.spec.ts',
	project: 'chromium',
	title: 'a.spec.ts > x',
};

const verifyPlan = (expected: (typeof expectedTest)[]) => ({
	shards: [
		{ shard: 1, files: ['e2e/a.spec.ts'], tests: expected.length, weight: 3 },
	],
	expected,
	durations: {},
});

const writeObservedReport = (dir: string, status: string | null) => {
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, 'playwright-1-of-6.json'),
		JSON.stringify({
			suites: [
				{
					title: 'a.spec.ts',
					file: 'e2e/a.spec.ts',
					specs: [
						{
							file: 'e2e/a.spec.ts',
							title: 'x',
							tests:
								status === null
									? [{ projectName: 'chromium' }]
									: [
											{
												projectName: 'chromium',
												results: [{ status, duration: 10 }],
											},
										],
						},
					],
				},
			],
		}),
	);
};

const writePlanFile = (sandbox: CliSandbox, expected: (typeof expectedTest)[]) => {
	mkdirSync(path.dirname(planFilePath(sandbox)), { recursive: true });
	writeFileSync(
		planFilePath(sandbox),
		JSON.stringify(verifyPlan(expected)),
	);
};

test('verify accepts a plan whose every expected test ran exactly once', () => {
	const sandbox = makeSandbox();
	const artifacts = path.join(sandbox.root, 'e2e-artifacts');
	try {
		writeObservedReport(artifacts, 'passed');
		writePlanFile(sandbox, [expectedTest]);
		const run = runShardCli(sandbox, 'verify', { E2E_ARTIFACTS: artifacts });
		assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
		assert.match(run.stdout, /every expected test ran exactly once/);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('verify refuses a skipped test instead of counting it as executed', () => {
	const sandbox = makeSandbox();
	const artifacts = path.join(sandbox.root, 'e2e-artifacts');
	try {
		writeObservedReport(artifacts, 'skipped');
		writePlanFile(sandbox, [expectedTest]);
		const run = runShardCli(sandbox, 'verify', { E2E_ARTIFACTS: artifacts });
		assert.notEqual(run.status, 0, 'a skipped test did not run');
		assert.match(
			`${run.stdout}${run.stderr}`,
			/missing test e2e\/a\.spec\.ts::chromium::a\.spec\.ts > x \(ran 0 times\)/,
		);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('verify refuses an empty plan instead of certifying 0 of 0', () => {
	const sandbox = makeSandbox();
	try {
		writePlanFile(sandbox, []);
		const run = runShardCli(sandbox, 'verify', {
			E2E_ARTIFACTS: sandbox.root,
		});
		assert.notEqual(run.status, 0);
		assert.match(`${run.stdout}${run.stderr}`, /no expected tests/);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('verify refuses to run without the plan artifact instead of certifying nothing', () => {
	const sandbox = makeSandbox();
	try {
		const run = runShardCli(sandbox, 'verify', {
			E2E_ARTIFACTS: sandbox.root,
		});
		assert.notEqual(run.status, 0);
		assert.match(`${run.stdout}${run.stderr}`, /e2e-shard-plan\.json is missing/);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('download is a no-op outside the merge queue and flattens this attempt reports inside it', () => {
	const sandbox = makeSandbox();
	const artifacts = path.join(sandbox.root, 'e2e-artifacts');
	try {
		const pullRequest = runShardCli(sandbox, 'download', {
			GITHUB_EVENT_NAME: 'pull_request',
			E2E_ARTIFACTS: artifacts,
		});
		assert.equal(
			pullRequest.status,
			0,
			`${pullRequest.stdout}\n${pullRequest.stderr}`,
		);
		assert.match(pullRequest.stdout, /no shard reports/);
		assert.equal(readFileSync(sandbox.log, 'utf8'), '');

		const mergeQueue = runShardCli(sandbox, 'download', {
			GITHUB_EVENT_NAME: 'merge_group',
			GITHUB_RUN_ID: '77',
			GITHUB_RUN_ATTEMPT: '3',
			E2E_ARTIFACTS: artifacts,
			FAKE_GH_DOWNLOAD: 'true',
		});
		assert.equal(
			mergeQueue.status,
			0,
			`${mergeQueue.stdout}\n${mergeQueue.stderr}`,
		);
		assert.deepEqual(readdirSync(artifacts), ['playwright-1-of-6.json']);
		const ghArgs = readFileSync(sandbox.ghLog, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as string[]);
		const pattern = ghArgs[0]?.[ghArgs[0].indexOf('-p') + 1];
		assert.equal(
			pattern,
			'e2e-shard-report-*-3',
			'the download must only read this attempt reports',
		);
		assert.equal(
			ghArgs[1]?.[ghArgs[1].indexOf('-n') + 1],
			'e2e-shard-plan-3',
			'the verify input plan is this attempt artifact',
		);
		assert.ok(existsSync(planFilePath(sandbox)));

		const failed = runShardCli(sandbox, 'download', {
			GITHUB_EVENT_NAME: 'merge_group',
			GITHUB_RUN_ID: '77',
			E2E_ARTIFACTS: path.join(sandbox.root, 'missing-artifacts'),
		});
		assert.notEqual(failed.status, 0, 'a failed download must fail the step');
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('record is a no-op outside the merge queue instead of reading a missing directory', () => {
	const sandbox = makeSandbox();
	try {
		const run = runShardCli(sandbox, 'record', {
			GITHUB_EVENT_NAME: 'pull_request',
			E2E_TEST_RESULT: 'success',
			E2E_ARTIFACTS: path.join(sandbox.root, 'missing-artifacts'),
		});
		assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
		assert.match(run.stdout, /no durations to record/);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});
