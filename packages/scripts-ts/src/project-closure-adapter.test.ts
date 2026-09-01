import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
	chmod,
	lstat,
	mkdtemp,
	mkdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { test } from 'vitest';

const repo = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
const configPath = join(repo, '.ai', 'project-closure-v1.json');
const adapterPath = join(repo, '.ai', 'trello-publyapp-projection');
const sharedToolRoot = process.env.PR_CLOSURE_GATE_ROOT?.trim();
const hasSharedIntegration = Boolean(sharedToolRoot);
const sharedGatePath = hasSharedIntegration
	? // @ts-expect-error rung-0: TS2345
		join(sharedToolRoot, 'tools', 'pr-closure')
	: undefined;
const sharedSchemaPath = hasSharedIntegration
	? // @ts-expect-error rung-0: TS2345
		join(sharedToolRoot, 'tools', 'schemas', 'project-closure-v1.json')
	: undefined;
const sharedPythonPath = hasSharedIntegration
	? // @ts-expect-error rung-0: TS2345
		join(sharedToolRoot, 'tools')
	: undefined;

const PR_NUMBER = 1105;

const completeDescription = `## Objective
Adopt the permanent PR closure gate.

## Current state
The adapter is being adopted.

## Scope
Configuration, projection, and tests.

## Links
https://github.com/PublyApp/publyapp/issues/1105

## How to test
Run the focused adapter test and the shared closure CLI.`;

const closureStates = [
	'CI_RED',
	'CI_INFRA_RETRY',
	'FIXING',
	'LOCAL_VERIFY',
	'REVIEW_READY',
	'REVIEWING',
	'CHANGES_REQUIRED',
	'DESIGN_RESET',
	'FOLLOW_UP_FILING',
	'UNVERIFIED',
	'STALLED',
	'NEEDS_RESOLUTION',
	'NEEDS_OWNER',
	'APPROVED',
	'APPROVED_WITH_FOLLOW_UPS',
];
const expectedStateTargets = {
	CI_RED: 'EN COURS',
	CI_INFRA_RETRY: 'EN COURS',
	FIXING: 'EN COURS',
	LOCAL_VERIFY: 'EN COURS',
	REVIEW_READY: 'EN COURS',
	REVIEWING: 'EN COURS',
	CHANGES_REQUIRED: 'EN COURS',
	DESIGN_RESET: 'EN COURS',
	FOLLOW_UP_FILING: 'EN COURS',
	UNVERIFIED: 'EN COURS',
	STALLED: 'EN COURS',
	NEEDS_RESOLUTION: 'EN COURS',
	NEEDS_OWNER: 'EN PAUSE (bloqué ailleurs)',
	APPROVED: 'APPROUVÉ, PRÊT À MERGER',
	APPROVED_WITH_FOLLOW_UPS: 'APPROUVÉ, PRÊT À MERGER',
};
const requiredClosureFields = [
	'closure_config',
	'closure_gate',
	'review_schema',
	'ci_status_cmd',
	'ci_rerun_cmd',
	'local_review_ready_commands',
	'closure_acceptance_commands',
	'closure_state_dir',
	'ci_required_checks',
	'review_publication_cmd',
	'follow_up_issue_cmd',
	'tracking_projection',
	'projection_adapter',
	'infra_retry_budget',
	'stagnation_budget_minutes',
	'lane_liveness_cmd',
	'lane_output_floor',
	'heavy_job_limit',
	'central_claim_rules',
];

// @ts-expect-error rung-0: add proper type in later rung
const run = (command, args, options = {}) => {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd: repo,
			...options,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (code, signal) =>
			resolve({ code, signal, stdout, stderr }),
		);
	});
};

const sharedEnv = (extra = {}) => {
	const env = { ...process.env };
	if (sharedPythonPath) {
		env.PYTHONPATH = sharedPythonPath;
	}
	for (const [key, value] of Object.entries(extra)) {
		// @ts-expect-error rung-0: TS2322
		env[key] = value;
	}
	return env;
};

// @ts-expect-error rung-0: add proper type in later rung
const withTempDirectory = async (callback) => {
	const directory = await mkdtemp(join(tmpdir(), 'publyapp-closure-'));
	try {
		return await callback(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
};

// @ts-expect-error rung-0: add proper type in later rung
const runSharedGate = async (args, options = {}) => {
	if (!sharedGatePath) {
		throw new Error(
			'Shared gate path is unavailable; set PR_CLOSURE_GATE_ROOT',
		);
	}
	return run(sharedGatePath, args, {
		...options,
		// @ts-expect-error rung-0: TS2339
		env: sharedEnv(options.env),
	});
};

// @ts-expect-error rung-0: add proper type in later rung
const fixtureCardMap = (directory) => {
	return join(directory, 'card-map.json');
};

// @ts-expect-error rung-0: add proper type in later rung
const writeCardMap = async (directory, description, extra = {}) => {
	const path = fixtureCardMap(directory);
	await writeFile(
		path,
		JSON.stringify(
			{
				schema_version: 1,
				project: 'publyapp',
				board_id: '6a766eaa8fc59bfbeb18ce9b',
				cards: {
					[PR_NUMBER]: {
						id: 'card-fixture-1105',
						name: 'PR #1105 — closure gate',
						list: 'EN COURS',
						description,
						...extra,
					},
				},
			},
			null,
			2,
		),
	);
	return path;
};

// @ts-expect-error rung-0: add proper type in later rung
const mutateCardMap = async (path, mutate) => {
	const cardMap = JSON.parse(await readFile(path, 'utf8'));
	mutate(cardMap);
	await writeFile(path, JSON.stringify(cardMap, null, 2));
};

// @ts-expect-error rung-0: add proper type in later rung
const adapterArgs = (cardMap, state = 'REVIEW_READY', mode = 'dry-run') => {
	return [
		adapterPath,
		'--project',
		'publyapp',
		'--pr',
		PR_NUMBER,
		'--mapping',
		'trello:publyapp',
		'--state',
		state,
		'--mode',
		mode,
		'--card-map',
		cardMap,
	];
};

// @ts-expect-error rung-0: add proper type in later rung
const assertLocalConfigContents = (config) => {
	const expectedConfigKeys = [
		'ci_required_checks',
		'closure_acceptance_commands',
		'closure_state_dir',
		'default_branch',
		'heavy_job_limit',
		'infra_retry_budget',
		'local_review_ready_commands',
		'project',
		'repo_path',
		'repository',
		'schema_version',
		'stagnation_budget_minutes',
		'tracking_projection',
		'verification_command_timeout_seconds',
	];
	const expectedCiRequiredChecks = [
		'require-linked-issue',
		'openapi-spec-drift-gate',
		'docs-archive-gate',
		'front-ci-gate',
		'front-e2e-gate',
	];
	assert.equal(config.schema_version, 1);
	assert.equal(config.project, 'publyapp');
	assert.equal(config.tracking_projection, 'trello:publyapp');
	assert.equal(config.default_branch, 'develop');
	assert.equal(config.repository, 'PublyApp/publyapp');
	assert.deepEqual(Object.keys(config).sort(), expectedConfigKeys);
	for (const pathKey of ['repo_path', 'closure_state_dir']) {
		assert.equal(typeof config[pathKey], 'string');
		assert.match(config[pathKey], /^\/(?!tmp(?:\/|$))/);
	}
	for (const commandKey of [
		'local_review_ready_commands',
		'closure_acceptance_commands',
	]) {
		assert.ok(Array.isArray(config[commandKey]));
		assert.ok(config[commandKey].length > 0);
		assert.ok(
			config[commandKey].every(
				(command) => typeof command === 'string' && command.trim(),
			),
		);
	}
	for (const integerKey of [
		'infra_retry_budget',
		'stagnation_budget_minutes',
		'heavy_job_limit',
		'verification_command_timeout_seconds',
	]) {
		assert.equal(Number.isInteger(config[integerKey]), true);
		assert.ok(config[integerKey] > 0);
	}
	assert.equal(config.heavy_job_limit, 1);
	assert.ok(Array.isArray(config.ci_required_checks));
	assert.equal(
		JSON.stringify(
			[...config.ci_required_checks].sort((left, right) =>
				left.localeCompare(right),
			),
		),
		JSON.stringify(
			expectedCiRequiredChecks
				.slice()
				.sort((left, right) => left.localeCompare(right)),
		),
	);
};

// @ts-expect-error rung-0: add proper type in later rung
const assertAdapterClosureFields = (adapter) => {
	for (const field of requiredClosureFields) {
		assert.match(adapter, new RegExp('\\| `' + field + '` \\|'));
	}
	assert.match(adapter, /\| `review_schema` \| `1`;/);
};

const localBranchAndHead = async () => {
	const branchResult = await run('git', ['branch', '--show-current']);
	const commitResult = await run('git', ['rev-parse', 'HEAD']);
	// @ts-expect-error rung-0: TS18046
	const branch = branchResult.stdout.trim();
	// @ts-expect-error rung-0: TS18046
	if (branchResult.code !== 0 || !branch) {
		return null;
	}
	const remoteResult = await run('git', ['rev-parse', `origin/${branch}`]);
	// @ts-expect-error rung-0: TS18046
	if (remoteResult.code !== 0) {
		return null;
	}
	return {
		branch,
		// @ts-expect-error rung-0: TS18046
		headOid: commitResult.stdout.trim(),
	};
};

test('project closure config validates and malformed config fails closed', async () => {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	assertLocalConfigContents(config);
	const adapterStat = await lstat(adapterPath);
	assert.equal(adapterStat.isSymbolicLink(), false);
	assert.notEqual(adapterStat.mode & 0o111, 0);
	const adapterSource = await readFile(adapterPath, 'utf8');
	assert.doesNotMatch(adapterSource, /TRELLO_PROJECTION_ENV_FILE/);
	assert.match(
		adapterSource,
		/DEFAULT_API_BASE = "https:\/\/api\.trello\.com\/1"/,
	);
	assert.match(
		adapterSource,
		/TRUSTED_API_BASE = "https:\/\/api\.trello\.com\/1"/,
	);
	assertAdapterClosureFields(
		await readFile(join(repo, '.ai/orchestration-adapter.md'), 'utf8'),
	);
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const invalidPath = join(directory, 'invalid.json');
		await writeFile(
			invalidPath,
			JSON.stringify({ ...config, schema_version: 2 }),
		);
		if (sharedSchemaPath) {
			const sharedSchemaText = await readFile(sharedSchemaPath, 'utf8');
			const sharedSchema = JSON.parse(sharedSchemaText);
			assert.equal(typeof sharedSchema.title, 'string');
			assert.notEqual(sharedSchema.title.trim(), '');
			assert.ok(sharedSchema.properties?.project);
		}
		if (hasSharedIntegration) {
			const malformedResult = await runSharedGate([
				'status',
				'--config',
				invalidPath,
				'--pr',
				String(PR_NUMBER),
				'--json',
			]);
			// @ts-expect-error rung-0: TS18046
			assert.equal(malformedResult.code, 2);
			// @ts-expect-error rung-0: TS18046
			assert.match(malformedResult.stderr, /schema_version|config/i);
		} else {
			const malformed = JSON.parse(await readFile(invalidPath, 'utf8'));
			assert.notEqual(malformed.schema_version, 1);
		}
	});
});

test('portable closure contract rejects unsafe config and renamed adapter fields', async () => {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	assert.throws(() =>
		assertLocalConfigContents({ ...config, repo_path: '/tmp/publyapp' }),
	);
	const missingBudget = { ...config };
	delete missingBudget.infra_retry_budget;
	assert.throws(() => assertLocalConfigContents(missingBudget));
	const adapter = await readFile(
		join(repo, '.ai/orchestration-adapter.md'),
		'utf8',
	);
	assert.throws(() =>
		assertAdapterClosureFields(
			adapter.replace('`review_schema`', '`review_record_schema`'),
		),
	);
});

test('closure verification is wired into both shared phases and the just ci gate', async () => {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const justfile = await readFile(join(repo, 'justfile'), 'utf8');
	const workflow = await readFile(
		join(repo, '.github/workflows/front-ci.yml'),
		'utf8',
	);
	const adapterCommand = 'pnpm test:project-closure-adapter';
	assert.ok(config.local_review_ready_commands.includes(adapterCommand));
	assert.ok(config.closure_acceptance_commands.includes(adapterCommand));
	assert.match(
		justfile,
		/^ci-project-closure-adapter:\n(?:.*\n)*?\s+pnpm test:project-closure-adapter$/m,
	);
	assert.match(justfile, /^ci:.*ci-project-closure-adapter/m);
	assert.match(
		workflow,
		/- name: Run project closure adapter tests\n\s+run: pnpm test:project-closure-adapter/,
	);
	assert.equal(workflow.match(/pnpm test:project-closure-adapter/g)?.length, 1);
});

test(
	'status against a fixture PR fails closed before writing approval evidence',
	{
		skip: !hasSharedIntegration,
	},
	async () => {
		// @ts-expect-error rung-0: add proper type in later rung
		await withTempDirectory(async (directory) => {
			const fakeBin = join(directory, 'bin');
			await mkdir(fakeBin);
			const fakeGh = join(fakeBin, 'gh');
			const config = JSON.parse(await readFile(configPath, 'utf8'));
			const stateDirectory = join(directory, 'state');
			const configFixture = join(directory, 'config.json');
			await writeFile(
				configFixture,
				JSON.stringify({ ...config, closure_state_dir: stateDirectory }),
			);
			const fixture = JSON.stringify({
				number: PR_NUMBER,
				headRefName: 'fixture/closure-gate',
				headRefOid: 'a'.repeat(40),
				isDraft: false,
				state: 'OPEN',
				mergeStateStatus: 'CLEAN',
				mergeable: 'MERGEABLE',
				statusCheckRollup: [],
				url: `https://github.com/PublyApp/publyapp/pull/${PR_NUMBER}`,
				baseRefName: config.default_branch,
			});
			await writeFile(fakeGh, `#!/bin/sh\nprintf '%s\\n' '${fixture}'\n`);
			await chmod(fakeGh, 0o755);
			const result = await runSharedGate(
				[
					'status',
					'--config',
					configFixture,
					'--pr',
					String(PR_NUMBER),
					'--json',
				],
				{
					env: { PATH: `${fakeBin}:${process.env.PATH}` },
				},
			);
			// @ts-expect-error rung-0: TS18046
			assert.notEqual(result.code, 0);
			assert.match(
				// @ts-expect-error rung-0: TS18046
				`${result.stdout}\n${result.stderr}`,
				/worktree|source|unavailable|fixture|temporary/i,
			);
			await assert.rejects(
				readFile(
					join(stateDirectory, 'publyapp', String(PR_NUMBER), 'events.jsonl'),
				),
			);
		});
	},
);

test('projection rejects a delivery card without every required section', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(
			directory,
			'## Objective\nOnly one section.',
		);
		const result = await run('python3', adapterArgs(cardMap));
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.code, 2);
		assert.match(
			// @ts-expect-error rung-0: TS18046
			result.stderr,
			/Object|Current state|Scope|Links|How to test/i,
		);
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.stdout, '');
	});
});

test('projection rejects required headings whose bodies are blank', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const emptyDescription = `## Objective

## Current state

## Scope

## Links

## How to test
`;
		const cardMap = await writeCardMap(directory, emptyDescription);
		const result = await run('python3', adapterArgs(cardMap));
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.code, 2);
		// @ts-expect-error rung-0: TS18046
		assert.match(result.stderr, /empty|body/i);
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.stdout, '');
	});
});

test('projection supports every closure state in this adapter', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(directory, completeDescription);
		for (const state of closureStates) {
			const result = await run('python3', adapterArgs(cardMap, state));
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.code, 0, `${state}: ${result.stderr}`);
			// @ts-expect-error rung-0: TS18046
			const protocol = JSON.parse(result.stdout);
			assert.equal(protocol.applied, false);
			assert.ok(
				// @ts-expect-error rung-0: TS7053
				protocol.changes[0].summary.includes(expectedStateTargets[state]),
			);
		}
	});
});

test('projection rejects invalid durable card-map controls before any Trello call', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		for (const mutate of [
			// @ts-expect-error rung-0: add proper type in later rung
			(cardMap) => {
				cardMap.board_id = 'foreign-board';
			},
			// @ts-expect-error rung-0: add proper type in later rung
			(cardMap) => {
				cardMap.cards[PR_NUMBER].list = 'BACKLOG';
			},
		]) {
			const cardMap = await writeCardMap(directory, completeDescription);
			await mutateCardMap(cardMap, mutate);
			const result = await run('python3', adapterArgs(cardMap));
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.code, 2);
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.stdout, '');
		}
		const unknownState = await writeCardMap(directory, completeDescription);
		const stateResult = await run(
			'python3',
			adapterArgs(unknownState, 'NOT_A_STATE'),
		);
		// @ts-expect-error rung-0: TS18046
		assert.equal(stateResult.code, 2);
		// @ts-expect-error rung-0: TS18046
		assert.equal(stateResult.stdout, '');
	});
});

test('projection dry-run is credential-free and cannot create approval evidence', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(directory, completeDescription);
		const result = await run('python3', adapterArgs(cardMap, 'APPROVED'));
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.code, 0, result.stderr);
		// @ts-expect-error rung-0: TS18046
		const protocol = JSON.parse(result.stdout);
		assert.deepEqual(Object.keys(protocol).sort(), [
			'applied',
			'changes',
			'schema_version',
		]);
		assert.equal(protocol.schema_version, 1);
		assert.equal(protocol.applied, false);
		assert.equal(protocol.changes[0].type, 'card_move');
		assert.equal(
			// @ts-expect-error rung-0: add proper type in later rung
			protocol.changes.some(({ type }) => type === 'card_update'),
			false,
		);
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.stderr, '');
	});
});

test('projection apply fails closed without credentials and emits no protocol success', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(directory, completeDescription);
		const result = await run(
			'python3',
			adapterArgs(cardMap, 'REVIEW_READY', 'apply'),
			{
				env: {
					...process.env,
					TRELLO_API_KEY: '',
					TRELLO_TOKEN: '',
					TRELLO_PROJECTION_ENV_FILE: '',
					TRELLO_PROJECTION_API_BASE: '',
					TRELLO_PROJECTION_TEST_MODE: '',
					PUBLYAPP_TRELLO_CARD_MAP: cardMap,
				},
			},
		);
		// @ts-expect-error rung-0: TS18046
		assert.notEqual(result.code, 0);
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.stdout, '');
		assert.equal(
			// @ts-expect-error rung-0: TS18046
			result.stderr.trim(),
			'Trello credentials missing: TRELLO_API_KEY, TRELLO_TOKEN',
		);
	});
});

test('projection rejects a non-loopback API base before attaching credentials', async () => {
	// @ts-expect-error rung-0: add proper type in later rung
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(directory, completeDescription);
		const result = await run(
			'python3',
			adapterArgs(cardMap, 'APPROVED', 'apply'),
			{
				env: {
					...process.env,
					TRELLO_API_KEY: 'fixture-key',
					TRELLO_TOKEN: 'fixture-token',
					TRELLO_PROJECTION_API_BASE: 'https://evil.example/1',
					TRELLO_PROJECTION_TEST_MODE: '1',
				},
			},
		);
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.code, 2);
		// @ts-expect-error rung-0: TS18046
		assert.equal(result.stdout, '');
		// @ts-expect-error rung-0: TS18046
		assert.match(result.stderr, /loopback|API base|test mode/i);
	});
});

test('projection rejects a mutated built-in API base before credentials can be used', async () => {
	const result = await run('python3', [
		'-c',
		[
			'import os, sys',
			'module = {"__name__": "projection_test"}',
			'exec(compile(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1], "exec"), module)',
			'module["DEFAULT_API_BASE"] = "https://evil.example/1"',
			'os.environ.pop("TRELLO_PROJECTION_API_BASE", None)',
			'try:',
			'    module["api_base"]()',
			'except module["InputError"]:',
			'    raise SystemExit(0)',
			'raise SystemExit(1)',
		].join('\n'),
		adapterPath,
	]);
	// @ts-expect-error rung-0: TS18046
	assert.equal(result.code, 0, result.stderr);
});

test('projection rejects even a loopback override without explicit test mode before requests', async () => {
	const requests = [];
	const server = createServer((request, response) => {
		requests.push(request.url);
		response.end('{}');
	});
	// @ts-expect-error rung-0: TS2769
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		// @ts-expect-error rung-0: add proper type in later rung
		await withTempDirectory(async (directory) => {
			const cardMap = await writeCardMap(directory, completeDescription);
			const address = server.address();
			assert.ok(address && typeof address === 'object');
			const result = await run(
				'python3',
				adapterArgs(cardMap, 'APPROVED', 'apply'),
				{
					env: {
						...process.env,
						TRELLO_API_KEY: 'fixture-key',
						TRELLO_TOKEN: 'fixture-token',
						TRELLO_PROJECTION_API_BASE: `http://127.0.0.1:${address.port}/1`,
						TRELLO_PROJECTION_TEST_MODE: '',
					},
				},
			);
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.code, 2);
			assert.equal(requests.length, 0);
		});
	} finally {
		await new Promise((resolve, reject) =>
			// @ts-expect-error rung-0: TS2794
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test('projection apply verifies the live delivery card before moving it', async () => {
	// @ts-expect-error rung-0: TS7034
	const requests = [];
	const server = createServer((request, response) => {
		requests.push({ method: request.method, url: request.url });
		response.setHeader('content-type', 'application/json');
		// @ts-expect-error rung-0: TS18048
		if (request.method === 'GET' && request.url.includes('/lists')) {
			response.end(
				JSON.stringify([
					{ id: 'list-in-progress', name: 'EN COURS' },
					{ id: 'list-approved', name: 'APPROUVÉ, PRÊT À MERGER' },
					{ id: 'list-paused', name: 'EN PAUSE (bloqué ailleurs)' },
				]),
			);
			return;
		}
		if (
			request.method === 'GET' &&
			// @ts-expect-error rung-0: TS18048
			request.url.includes('/cards/card-fixture-1105')
		) {
			response.end(
				JSON.stringify({
					id: 'card-fixture-1105',
					name: 'PR #1105 — closure gate',
					idBoard: '6a766eaa8fc59bfbeb18ce9b',
					idList: 'list-in-progress',
					desc: completeDescription,
				}),
			);
			return;
		}
		if (
			request.method === 'PUT' &&
			// @ts-expect-error rung-0: TS18048
			request.url.includes('/cards/card-fixture-1105')
		) {
			response.end(JSON.stringify({ ok: true }));
			return;
		}
		response.statusCode = 404;
		response.end(JSON.stringify({ error: 'not found' }));
	});
	// @ts-expect-error rung-0: TS2769
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		// @ts-expect-error rung-0: add proper type in later rung
		await withTempDirectory(async (directory) => {
			const cardMap = await writeCardMap(directory, completeDescription);
			const address = server.address();
			assert.ok(address && typeof address === 'object');
			const result = await run(
				'python3',
				adapterArgs(cardMap, 'APPROVED', 'apply'),
				{
					env: {
						...process.env,
						TRELLO_API_KEY: 'fixture-key',
						TRELLO_TOKEN: 'fixture-token',
						TRELLO_PROJECTION_API_BASE: `http://127.0.0.1:${address.port}/1`,
						TRELLO_PROJECTION_TEST_MODE: '1',
					},
				},
			);
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.code, 0, result.stderr);
			// @ts-expect-error rung-0: TS18046
			assert.equal(JSON.parse(result.stdout).applied, true);
			// @ts-expect-error rung-0: TS7005
			assert.equal(requests.filter(({ method }) => method === 'PUT').length, 1);
			// @ts-expect-error rung-0: TS7005
			const cardGet = requests.find(
				({ method, url }) => method === 'GET' && url.includes('/cards/'),
			);
			assert.ok(cardGet);
			assert.match(
				decodeURIComponent(cardGet.url),
				/fields=name,idList,desc,idBoard/,
			);
			assert.match(
				// @ts-expect-error rung-0: TS7005
				requests.find(({ method }) => method === 'PUT').url,
				/idList=list-approved/,
			);
		});
	} finally {
		await new Promise((resolve, reject) =>
			// @ts-expect-error rung-0: TS2794
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test('projection rejects a live card from a foreign board without moving it', async () => {
	// @ts-expect-error rung-0: TS7034
	const requests = [];
	const server = createServer((request, response) => {
		requests.push({ method: request.method, url: request.url });
		response.setHeader('content-type', 'application/json');
		// @ts-expect-error rung-0: TS18048
		if (request.method === 'GET' && request.url.includes('/lists')) {
			response.end(
				JSON.stringify([
					{ id: 'list-approved', name: 'APPROUVÉ, PRÊT À MERGER' },
				]),
			);
			return;
		}
		if (
			request.method === 'GET' &&
			// @ts-expect-error rung-0: TS18048
			request.url.includes('/cards/card-fixture-1105')
		) {
			response.end(
				JSON.stringify({
					id: 'card-fixture-1105',
					idBoard: 'a-different-board',
					name: 'PR #1105 — closure gate',
					idList: 'list-in-progress',
					desc: completeDescription,
				}),
			);
			return;
		}
		if (request.method === 'PUT') {
			response.statusCode = 500;
			response.end(JSON.stringify({ error: 'PUT must not happen' }));
			return;
		}
		response.statusCode = 404;
		response.end(JSON.stringify({ error: 'not found' }));
	});
	// @ts-expect-error rung-0: TS2769
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
		// @ts-expect-error rung-0: add proper type in later rung
		await withTempDirectory(async (directory) => {
			const cardMap = await writeCardMap(directory, completeDescription);
			const address = server.address();
			assert.ok(address && typeof address === 'object');
			const result = await run(
				'python3',
				adapterArgs(cardMap, 'APPROVED', 'apply'),
				{
					env: {
						...process.env,
						TRELLO_API_KEY: 'fixture-key',
						TRELLO_TOKEN: 'fixture-token',
						TRELLO_PROJECTION_API_BASE: `http://127.0.0.1:${address.port}/1`,
						TRELLO_PROJECTION_TEST_MODE: '1',
					},
				},
			);
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.code, 3);
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.stdout, '');
			// @ts-expect-error rung-0: TS18046
			assert.match(result.stderr, /board/i);
			// @ts-expect-error rung-0: TS7005
			assert.equal(requests.filter(({ method }) => method === 'PUT').length, 0);
		});
	} finally {
		await new Promise((resolve, reject) =>
			// @ts-expect-error rung-0: TS2794
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test('projection fails closed without a PUT for invalid live Trello controls', async () => {
	const cases = [
		{
			name: 'duplicate target list',
			lists: [
				{ id: 'list-approved-a', name: 'APPROUVÉ, PRÊT À MERGER' },
				{ id: 'list-approved-b', name: 'APPROUVÉ, PRÊT À MERGER' },
			],
			card: {},
		},
		{
			name: 'live name mismatch',
			lists: [{ id: 'list-approved', name: 'APPROUVÉ, PRÊT À MERGER' }],
			card: { name: 'different card title' },
		},
		{
			name: 'malformed live description',
			lists: [{ id: 'list-approved', name: 'APPROUVÉ, PRÊT À MERGER' }],
			card: { desc: '## Objective\nOnly one heading.' },
		},
	];
	for (const fixture of cases) {
		// @ts-expect-error rung-0: TS7034
		const requests = [];
		const server = createServer((request, response) => {
			requests.push({ method: request.method, url: request.url });
			response.setHeader('content-type', 'application/json');
			// @ts-expect-error rung-0: TS18048
			if (request.method === 'GET' && request.url.includes('/lists')) {
				response.end(JSON.stringify(fixture.lists));
				return;
			}
			// @ts-expect-error rung-0: TS18048
			if (request.method === 'GET' && request.url.includes('/cards/')) {
				response.end(
					JSON.stringify({
						id: 'card-fixture-1105',
						idBoard: '6a766eaa8fc59bfbeb18ce9b',
						idList: 'list-in-progress',
						name: 'PR #1105 — closure gate',
						desc: completeDescription,
						...fixture.card,
					}),
				);
				return;
			}
			response.statusCode = 500;
			response.end('{}');
		});
		// @ts-expect-error rung-0: TS2769
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		try {
			// @ts-expect-error rung-0: add proper type in later rung
			await withTempDirectory(async (directory) => {
				const cardMap = await writeCardMap(directory, completeDescription);
				const address = server.address();
				assert.ok(address && typeof address === 'object');
				const result = await run(
					'python3',
					adapterArgs(cardMap, 'APPROVED', 'apply'),
					{
						env: {
							...process.env,
							TRELLO_API_KEY: 'fixture-key',
							TRELLO_TOKEN: 'fixture-token',
							TRELLO_PROJECTION_API_BASE: `http://127.0.0.1:${address.port}/1`,
							TRELLO_PROJECTION_TEST_MODE: '1',
						},
					},
				);
				// @ts-expect-error rung-0: TS18046
				assert.equal(result.code, 3, fixture.name);
				// @ts-expect-error rung-0: TS18046
				assert.equal(result.stdout, '');
				assert.equal(
					// @ts-expect-error rung-0: TS7005
					requests.filter(({ method }) => method === 'PUT').length,
					0,
				);
			});
		} finally {
			await new Promise((resolve, reject) =>
				// @ts-expect-error rung-0: TS2794
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}
	}
});

test(
	'shared sync command runs the projection adapter through an explicit seam',
	{ skip: !hasSharedIntegration },
	async () => {
		const config = JSON.parse(await readFile(configPath, 'utf8'));
		const sharedPr = process.env.PR_CLOSURE_TEST_PR ?? '1106';
		const branchInfo = await localBranchAndHead();
		if (branchInfo === null) {
			test.skip(
				'detached HEAD or missing remote branch prevents sync protocol test',
			);
		}
		// @ts-expect-error rung-0: add proper type in later rung
		await withTempDirectory(async (directory) => {
			const fakeBin = join(directory, 'bin');
			await mkdir(fakeBin);
			const fakeGh = join(fakeBin, 'gh');
			await writeFile(
				fakeGh,
				`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify({
					number: Number(sharedPr),
					// @ts-expect-error rung-0: TS18047
					headRefName: branchInfo.branch,
					// @ts-expect-error rung-0: TS18047
					headRefOid: branchInfo.headOid,
					isDraft: false,
					state: 'OPEN',
					mergeStateStatus: 'CLEAN',
					mergeable: 'MERGEABLE',
					statusCheckRollup: [],
					url: `https://github.com/PublyApp/publyapp/pull/${sharedPr}`,
					baseRefName: config.default_branch,
				})}'\n`,
			);
			await chmod(fakeGh, 0o755);
			const result = await runSharedGate(
				[
					'sync',
					'--config',
					configPath,
					'--pr',
					sharedPr,
					'--projection-adapter',
					adapterPath,
				],
				{
					env: {
						PATH: `${fakeBin}:${process.env.PATH}`,
					},
				},
			);
			// @ts-expect-error rung-0: TS18046
			assert.equal(result.code, 0, result.stderr);
			// @ts-expect-error rung-0: TS18046
			assert.match(result.stdout, /state=/);
			// @ts-expect-error rung-0: TS18046
			assert.match(result.stdout, /projection dry-run: changes=/);
		});
	},
);

test('local review ready commands run front build before front test', async () => {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const commands = config.local_review_ready_commands;
	assert.ok(Array.isArray(commands) && commands.length >= 1);

	// There must be a command that builds front before running front tests.
	const hasFrontBuild = commands.some((cmd) =>
		cmd.includes('--filter front build'),
	);
	assert.ok(
		hasFrontBuild,
		'local_review_ready_commands must build front before tests',
	);

	// Build and test must be in the same command for single Node 24 init + fail-fast.
	const combined = commands.find(
		(cmd) =>
			cmd.includes('--filter front build') &&
			cmd.includes('--filter front test'),
	);
	assert.ok(
		combined,
		'local_review_ready_commands must combine build and test in one command',
	);
	assert.ok(
		combined.includes('fnm use 24'),
		'combined build+test command must initialise Node 24',
	);
	// Build must come before test within the command string (fail-fast).
	const buildPos = combined.indexOf('--filter front build');
	const testPos = combined.indexOf('--filter front test');
	assert.ok(
		buildPos < testPos,
		'front build must precede front test within the combined command',
	);
});
