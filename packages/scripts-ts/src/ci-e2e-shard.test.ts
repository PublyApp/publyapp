import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	copyFileSync,
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
import { parse as parseYaml } from 'yaml';

import {
	buildPlan,
	downloadPlan,
	flattenTests,
	partition,
} from './ci-e2e-shard.ts';

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
const repoRoot = path.resolve(path.dirname(shardScript), '../../..');

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
	const allowed = ['-D', '--dir', '-n', '--name', '-p', '--pattern', '-R', '--repo'];
	const unknown = args.filter((arg) => arg.startsWith('-')).find((flag) => !allowed.includes(flag));
	if (unknown !== undefined) {
		process.stderr.write('unknown flag: ' + unknown + '\\n');
		process.exit(1);
	}
	const name = args.includes('-n') ? args[args.indexOf('-n') + 1] : '';
	const pattern = args.includes('-p') ? args[args.indexOf('-p') + 1] : '';
	const dir = args[args.indexOf('-D') + 1] ?? process.env.E2E_ARTIFACTS;
	const store = process.env.FAKE_GH_ARTIFACT_STORE;
	fs.mkdirSync(dir, { recursive: true });
	if (store !== undefined) {
		if (pattern.length > 0) {
			const prefix = pattern.replace('*', '');
			for (const artifact of fs.readdirSync(store)) {
				if (artifact.startsWith(prefix)) {
					fs.cpSync(path.join(store, artifact), path.join(dir, artifact), { recursive: true });
				}
			}
		} else {
			const source = path.join(store, name);
			if (!fs.existsSync(source)) {
				process.stderr.write('gh: no valid artifacts found to download\\n');
				process.exit(1);
			}
			fs.cpSync(source, dir, { recursive: true });
		}
		process.exit(0);
	}
	if (pattern.length > 0) {
		for (const artifact of ['e2e-shard-report-1-1', 'e2e-shard-report-1-3', 'e2e-shard-report-2-1']) {
			const target = path.join(dir, artifact);
			fs.mkdirSync(target, { recursive: true });
			fs.writeFileSync(
				path.join(target, 'playwright-' + artifact.split('-')[3] + '-of-6.json'),
				JSON.stringify({ attempt: Number(artifact.split('-')[4]) }),
			);
		}
	} else if (name.startsWith('e2e-shard-plan')) {
		if (process.env.FAKE_GH_PLAN_ATTEMPT !== undefined && name !== 'e2e-shard-plan-' + process.env.FAKE_GH_PLAN_ATTEMPT) {
			process.stderr.write('gh: no valid artifacts found to download\\n');
			process.exit(1);
		}
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
	path.join(
		sandbox.root,
		'apps',
		'front',
		'e2e-artifacts',
		'e2e-shard-plan.json',
	);

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
		assert.equal(
			ghArgs[1]?.[ghArgs[1].indexOf('-n') + 1],
			'e2e-file-durations-3',
		);
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

test('the merge_queue step sequence uploads the plan under the name the shards download', () => {
	const sandbox = makeSandbox();
	const store = path.join(sandbox.root, 'artifact-store');
	try {
		const workflow = parseYaml(
			readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8'),
		) as {
			jobs: Record<
				string,
				{
					steps?: {
						id?: string;
						run?: string;
						with?: Record<string, unknown>;
					}[];
				}
			>;
		};
		const steps = workflow.jobs['e2e-build']?.steps ?? [];
		const planStep = steps.find((step) => step.id === 'plan');
		const upload = steps.find((step) => step.id === 'plan-upload');
		assert.equal(
			planStep?.run?.trim(),
			'node packages/scripts-ts/src/ci-e2e-shard.ts plan',
		);
		assert.equal(
			String(upload?.with?.['if-no-files-found']),
			"${{ github.event_name == 'merge_group' && 'error' || 'ignore' }}",
			'a merge_queue upload must fail when the plan file is missing',
		);
		const uploadName = String(upload?.with?.name).replace(
			'${{ github.run_attempt }}',
			'1',
		);
		const uploadPath = String(upload?.with?.path);
		assert.equal(uploadName, 'e2e-shard-plan-1');
		assert.equal(uploadPath, 'apps/front/e2e-artifacts/e2e-shard-plan.json');

		const planned = runShardCli(sandbox, 'plan');
		assert.equal(planned.status, 0, `${planned.stdout}\n${planned.stderr}`);

		// actions/upload-artifact stores the file relative to the uploaded path's directory.
		const stored = path.join(store, uploadName, path.basename(uploadPath));
		mkdirSync(path.dirname(stored), { recursive: true });
		copyFileSync(planFilePath(sandbox), stored);
		const shardReport = path.join(
			store,
			'e2e-shard-report-1-1',
			'playwright-1-of-6.json',
		);
		mkdirSync(path.dirname(shardReport), { recursive: true });
		writeFileSync(shardReport, '{}');

		const shard = runShardCli(sandbox, 'download', {
			GITHUB_RUN_ID: '45108911907',
			FAKE_GH_DOWNLOAD: 'true',
			FAKE_GH_ARTIFACT_STORE: store,
		});
		assert.equal(shard.status, 0, `${shard.stdout}\n${shard.stderr}`);
		assert.doesNotMatch(`${shard.stdout}${shard.stderr}`, /unavailable/);
		const plan = JSON.parse(readFileSync(planFilePath(sandbox), 'utf8')) as {
			shards: unknown[];
		};
		assert.equal(plan.shards.length, 6);
		const downloads = readFileSync(sandbox.ghLog, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as string[])
			.filter((args) => args[0] === 'run');
		assert.deepEqual(
			downloads.map((args) =>
				args.includes('-n')
					? args[args.indexOf('-n') + 1]
					: args[args.indexOf('-p') + 1],
			),
			['e2e-shard-report-*', 'e2e-shard-plan-1'],
		);
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

const writePlanFile = (
	sandbox: CliSandbox,
	expected: (typeof expectedTest)[],
) => {
	mkdirSync(path.dirname(planFilePath(sandbox)), { recursive: true });
	writeFileSync(planFilePath(sandbox), JSON.stringify(verifyPlan(expected)));
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
		assert.match(
			`${run.stdout}${run.stderr}`,
			/e2e-shard-plan\.json is missing/,
		);
	} finally {
		rmSync(sandbox.root, { recursive: true, force: true });
	}
});

test('download keeps the latest report per shard and falls back to the attempt that has the plan', () => {
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
			// A re-run attempt: only attempt 1 holds the plan artifact.
			GITHUB_RUN_ATTEMPT: '2',
			E2E_ARTIFACTS: artifacts,
			FAKE_GH_DOWNLOAD: 'true',
			FAKE_GH_PLAN_ATTEMPT: '1',
		});
		assert.equal(
			mergeQueue.status,
			0,
			`${mergeQueue.stdout}\n${mergeQueue.stderr}`,
		);
		assert.deepEqual(readdirSync(artifacts).sort(), [
			'playwright-1-of-6.json',
			'playwright-2-of-6.json',
		]);
		const attempts = readdirSync(artifacts)
			.sort()
			.map(
				(file) =>
					JSON.parse(readFileSync(path.join(artifacts, file), 'utf8')) as {
						attempt: number;
					},
			);
		assert.deepEqual(
			attempts.map((entry) => entry.attempt),
			[3, 1],
			'shard 1 keeps attempt 3, shard 2 keeps attempt 1',
		);
		const ghArgs = readFileSync(sandbox.ghLog, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as string[]);
		const pattern = ghArgs[0]?.[ghArgs[0].indexOf('-p') + 1];
		assert.equal(
			pattern,
			'e2e-shard-report-*',
			'non-re-run shards only exist in earlier attempts',
		);
		assert.deepEqual(
			ghArgs.slice(1).map((args) => args[args.indexOf('-n') + 1]),
			['e2e-shard-plan-2', 'e2e-shard-plan-1'],
			'the re-run attempt falls back to the attempt that uploaded the plan',
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

test('downloadPlan reports a missing gh binary without throwing TypeError', () => {
	const root = mkdtempSync(path.join(os.tmpdir(), 'publyapp-e2e-no-gh-'));
	const cwd = process.cwd();
	const prevPath = process.env.PATH;
	const prevRunId = process.env.GITHUB_RUN_ID;
	const prevEvent = process.env.GITHUB_EVENT_NAME;
	const prevAttempt = process.env.GITHUB_RUN_ATTEMPT;
	try {
		process.chdir(root);
		process.env.PATH = root;
		process.env.GITHUB_RUN_ID = '123';
		process.env.GITHUB_EVENT_NAME = 'merge_group';
		delete process.env.GITHUB_RUN_ATTEMPT;
		assert.throws(
			() => downloadPlan(),
			/no plan artifact found for run 123/,
			'a missing gh binary must surface as the plan error, not a TypeError',
		);
	} finally {
		process.env.PATH = prevPath;
		if (prevRunId === undefined) {
			delete process.env.GITHUB_RUN_ID;
		} else {
			process.env.GITHUB_RUN_ID = prevRunId;
		}
		if (prevEvent === undefined) {
			delete process.env.GITHUB_EVENT_NAME;
		} else {
			process.env.GITHUB_EVENT_NAME = prevEvent;
		}
		if (prevAttempt === undefined) {
			delete process.env.GITHUB_RUN_ATTEMPT;
		} else {
			process.env.GITHUB_RUN_ATTEMPT = prevAttempt;
		}
		process.chdir(cwd);
		rmSync(root, { recursive: true, force: true });
	}
});
