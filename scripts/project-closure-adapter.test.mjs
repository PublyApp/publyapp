import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
	chmod,
	lstat,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { test } from 'node:test';

const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const configPath = join(repo, '.ai', 'project-closure-v1.json');
const adapterPath = join(repo, '.ai', 'trello-publyapp-projection');
const gatePath = '/home/radan/ai-orchestration-playbook/tools/pr-closure';
const schemaPath =
	'/home/radan/ai-orchestration-playbook/tools/schemas/project-closure-v1.json';
const durableTestRoot = '/home/radan/.hermes/orchestration/runs';

function run(command, args, options = {}) {
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
}

async function withTempDirectory(callback) {
	const directory = await mkdtemp(join(durableTestRoot, 'publyapp-closure-'));
	try {
		return await callback(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

function fixtureCardMap(directory) {
	return join(directory, 'card-map.json');
}

async function writeCardMap(directory, description, extra = {}) {
	const path = fixtureCardMap(directory);
	await writeFile(
		path,
		JSON.stringify(
			{
				schema_version: 1,
				project: 'publyapp',
				board_id: '6a766eaa8fc59bfbeb18ce9b',
				cards: {
					1105: {
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
}

function adapterArgs(cardMap, state = 'REVIEW_READY', mode = 'dry-run') {
	return [
		adapterPath,
		'--project',
		'publyapp',
		'--pr',
		'1105',
		'--mapping',
		'trello:publyapp',
		'--state',
		state,
		'--mode',
		mode,
		'--card-map',
		cardMap,
	];
}

const completeDescription = `## Objective
Adopt the permanent PR closure gate.

## Current state
The adapter is being adopted.

## Scope
Configuration, projection, and tests.

## Links
https://github.com/radandevist/publyapp/issues/1105

## How to test
Run the focused adapter test and the shared closure CLI.`;

test('project closure config validates and malformed config fails closed', async () => {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	assert.equal(config.schema_version, 1);
	assert.equal(config.tracking_projection, 'trello:publyapp');
	const adapterStat = await lstat(adapterPath);
	assert.equal(adapterStat.isSymbolicLink(), false);
	assert.notEqual(adapterStat.mode & 0o111, 0);
	const schema = await run('jsonschema', ['-i', configPath, schemaPath]);
	assert.equal(schema.code, 0, schema.stderr);

	await withTempDirectory(async (directory) => {
		const invalidPath = join(directory, 'invalid.json');
		await writeFile(
			invalidPath,
			JSON.stringify({ ...config, schema_version: 2 }),
		);
		const result = await run('python3', [
			gatePath,
			'status',
			'--config',
			invalidPath,
			'--pr',
			'1105',
			'--json',
		]);
		assert.equal(result.code, 2);
		assert.match(result.stderr, /schema_version|config/i);
	});
});

test('closure verification is wired into both shared phases and the just ci gate', async () => {
	const config = JSON.parse(await readFile(configPath, 'utf8'));
	const justfile = await readFile(join(repo, 'justfile'), 'utf8');
	const adapterCommand = 'pnpm test:project-closure-adapter';
	assert.ok(config.local_review_ready_commands.includes(adapterCommand));
	assert.ok(config.closure_acceptance_commands.includes(adapterCommand));
	assert.match(
		justfile,
		/^ci-project-closure-adapter:\n(?:.*\n)*?\s+pnpm test:project-closure-adapter$/m,
	);
	assert.match(justfile, /^ci:.*ci-project-closure-adapter/m);
});

test('status against a fixture PR fails closed before writing approval evidence', async () => {
	await withTempDirectory(async (directory) => {
		const fakeBin = join(directory, 'bin');
		await import('node:fs/promises').then(({ mkdir }) => mkdir(fakeBin));
		const fakeGh = join(fakeBin, 'gh');
		const oid = 'a'.repeat(40);
		const fixture = JSON.stringify({
			number: 1105,
			headRefName: 'fixture/closure-gate',
			headRefOid: oid,
			isDraft: false,
			state: 'OPEN',
			mergeStateStatus: 'CLEAN',
			mergeable: 'MERGEABLE',
			statusCheckRollup: [],
			url: 'https://github.com/radandevist/publyapp/pull/1105',
			baseRefName: 'develop',
		});
		await writeFile(fakeGh, `#!/bin/sh\nprintf '%s\\n' '${fixture}'\n`);
		await chmod(fakeGh, 0o755);
		const config = JSON.parse(await readFile(configPath, 'utf8'));
		const stateDirectory = join(directory, 'state');
		const configFixture = join(directory, 'config.json');
		await writeFile(
			configFixture,
			JSON.stringify({ ...config, closure_state_dir: stateDirectory }),
		);
		const result = await run(
			'python3',
			[gatePath, 'status', '--config', configFixture, '--pr', '1105', '--json'],
			{
				env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}` },
			},
		);
		assert.notEqual(result.code, 0);
		assert.match(
			`${result.stdout}\n${result.stderr}`,
			/worktree|source|unavailable|fixture/i,
		);
		await assert.rejects(
			readFile(join(stateDirectory, 'publyapp', '1105', 'events.jsonl')),
		);
	});
});

test('projection rejects a delivery card without every required section', async () => {
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(
			directory,
			'## Objective\nOnly one section.',
		);
		const result = await run('python3', adapterArgs(cardMap));
		assert.equal(result.code, 2);
		assert.match(
			result.stderr,
			/Objective|Current state|Scope|Links|How to test/i,
		);
		assert.equal(result.stdout, '');
	});
});

test('projection rejects required headings whose bodies are blank', async () => {
	await withTempDirectory(async (directory) => {
		const emptyDescription = `## Objective

## Current state

## Scope

## Links

## How to test
`;
		const cardMap = await writeCardMap(directory, emptyDescription);
		const result = await run('python3', adapterArgs(cardMap));
		assert.equal(result.code, 2);
		assert.match(result.stderr, /empty|body/i);
		assert.equal(result.stdout, '');
	});
});

test('projection supports every shared ClosureState value', async () => {
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(directory, completeDescription);
		const statesResult = await run(
			'python3',
			[
				'-c',
				'import json; from pr_closure.model import ClosureState; print(json.dumps([state.value for state in ClosureState]))',
			],
			{
				env: {
					...process.env,
					PYTHONPATH: '/home/radan/ai-orchestration-playbook/tools',
				},
			},
		);
		assert.equal(statesResult.code, 0, statesResult.stderr);
		const states = JSON.parse(statesResult.stdout);
		assert.ok(states.includes('NEEDS_RESOLUTION'));
		for (const state of states) {
			const result = await run('python3', adapterArgs(cardMap, state));
			assert.equal(result.code, 0, `${state}: ${result.stderr}`);
			assert.equal(JSON.parse(result.stdout).applied, false);
		}
	});
});

test('projection dry-run is credential-free and cannot create approval evidence', async () => {
	await withTempDirectory(async (directory) => {
		const cardMap = await writeCardMap(directory, completeDescription);
		const result = await run('python3', adapterArgs(cardMap, 'APPROVED'));
		assert.equal(result.code, 0, result.stderr);
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
			protocol.changes.some(({ type }) => type === 'card_update'),
			false,
		);
		assert.equal(result.stderr, '');
	});
});

test('projection apply fails closed without credentials and emits no protocol success', async () => {
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
		assert.notEqual(result.code, 0);
		assert.equal(result.stdout, '');
		assert.equal(
			result.stderr.trim(),
			'Trello credentials missing: TRELLO_API_KEY, TRELLO_TOKEN',
		);
	});
});

test('projection rejects a non-loopback API base before attaching credentials', async () => {
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
		assert.equal(result.code, 2);
		assert.equal(result.stdout, '');
		assert.match(result.stderr, /loopback|API base|test mode/i);
	});
});

test('projection apply verifies the live delivery card before moving it', async () => {
	const requests = [];
	const server = createServer((request, response) => {
		requests.push({ method: request.method, url: request.url });
		response.setHeader('content-type', 'application/json');
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
			request.url.includes('/cards/card-fixture-1105')
		) {
			response.end(JSON.stringify({ ok: true }));
			return;
		}
		response.statusCode = 404;
		response.end(JSON.stringify({ error: 'not found' }));
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
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
			assert.equal(result.code, 0, result.stderr);
			assert.equal(JSON.parse(result.stdout).applied, true);
			assert.equal(requests.filter(({ method }) => method === 'PUT').length, 1);
			const cardGet = requests.find(
				({ method, url }) => method === 'GET' && url.includes('/cards/'),
			);
			assert.ok(cardGet);
			assert.match(
				decodeURIComponent(cardGet.url),
				/fields=name,idList,desc,idBoard/,
			);
			assert.match(
				requests.find(({ method }) => method === 'PUT').url,
				/idList=list-approved/,
			);
		});
	} finally {
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});

test('projection rejects a live card from a foreign board without moving it', async () => {
	const requests = [];
	const server = createServer((request, response) => {
		requests.push({ method: request.method, url: request.url });
		response.setHeader('content-type', 'application/json');
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
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	try {
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
			assert.equal(result.code, 3);
			assert.equal(result.stdout, '');
			assert.match(result.stderr, /board/i);
			assert.equal(requests.filter(({ method }) => method === 'PUT').length, 0);
		});
	} finally {
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
});
