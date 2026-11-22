import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import {
	PLAYWRIGHT_PROJECTS,
	flattenTests,
	shardTestArgs,
	specFilter,
} from './ci-e2e-shard.ts';

const repoRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	'../../..',
);
const runnerScript = path.join(
	repoRoot,
	'packages/scripts-ts/src/ci-e2e-playwright-shard.ts',
);

const writeExecutable = (file: string, body: string) => {
	writeFileSync(file, `#!/usr/bin/env node\n${body}`);
	chmodSync(file, 0o755);
};

const playwrightList = (cwd: string, outputFile: string, filters: string[]) => {
	const run = spawnSync(
		'pnpm',
		['--filter', 'front', 'exec', 'playwright', 'test', '--list', ...filters],
		{
			cwd,
			encoding: 'utf8',
			env: {
				...process.env,
				E2E_LANE: 'full',
				PLAYWRIGHT_JSON_OUTPUT: outputFile,
			},
		},
	);
	assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
	return flattenTests(
		JSON.parse(readFileSync(outputFile, 'utf8')) as Parameters<
			typeof flattenTests
		>[0],
	);
};

test('the shard filter selects exactly the plan file through the real Playwright resolver', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-e2e-list-'));
	try {
		const all = playwrightList(repoRoot, path.join(dir, 'all.json'), []);
		const target = all[0];
		assert.ok(target, 'the full lane must list at least one non-setup test');
		const inFile = all.filter((entry) => entry.file === target.file);
		const filtered = playwrightList(repoRoot, path.join(dir, 'one.json'), [
			specFilter(target.file),
		]);
		assert.deepEqual(
			filtered.map((entry) => entry.key).sort(),
			inFile.map((entry) => entry.key).sort(),
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 60_000);

test('the runner installs Chromium with its shared libraries and runs four projects on the plan files', () => {
	const dir = mkdtempSync(path.join(os.tmpdir(), 'publyapp-e2e-runner-'));
	try {
		const bin = path.join(dir, 'bin');
		mkdirSync(bin);
		const log = path.join(dir, 'pnpm.log');
		writeExecutable(
			path.join(bin, 'pnpm'),
			`const fs = require('node:fs');\nfs.appendFileSync(process.env.FAKE_PNPM_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');\n`,
		);
		const plan = {
			shards: [
				{
					shard: 1,
					files: ['e2e/aggregator-key.spec.ts'],
					tests: 2,
					weight: 6,
				},
			],
			expected: [],
			durations: {},
		};
		const planFile = path.join(
			dir,
			'apps',
			'front',
			'e2e-artifacts',
			'e2e-shard-plan.json',
		);
		mkdirSync(path.dirname(planFile), { recursive: true });
		writeFileSync(planFile, JSON.stringify(plan));
		const run = spawnSync(process.execPath, [runnerScript, '1', '6'], {
			cwd: dir,
			encoding: 'utf8',
			env: {
				...process.env,
				PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
				FAKE_PNPM_LOG: log,
			},
		});
		assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
		const calls = readFileSync(log, 'utf8')
			.trim()
			.split('\n')
			.map((line) => JSON.parse(line) as string[]);
		const install = calls.find((args) => args.includes('install'));
		assert.ok(install, 'the runner must install Chromium');
		assert.deepEqual(install.slice(-3), ['install', 'chromium', '--with-deps']);
		const suite = calls.find(
			(args) => args.includes('test') && !args.includes('--list'),
		);
		assert.ok(suite, 'the runner must run Playwright');
		assert.ok(
			suite.includes('(?:^|/)e2e/aggregator-key\\.spec\\.ts$'),
			`the filter must allow the absolute test path, got ${suite.join(' ')}`,
		);
		for (const project of PLAYWRIGHT_PROJECTS) {
			assert.ok(suite.includes(`--project=${project}`), project);
		}
		assert.ok(
			calls.some((args) => args.includes('test:drawer-contrast')),
			'shard 1 owns the drawer-contrast check',
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('shardTestArgs carries every project and one anchored filter per file', () => {
	const args = shardTestArgs({
		shard: 1,
		files: ['e2e/a.spec.ts'],
		tests: 1,
		weight: 3,
	});
	assert.deepEqual(args, [
		'test',
		...PLAYWRIGHT_PROJECTS.map((project) => `--project=${project}`),
		'(?:^|/)e2e/a\\.spec\\.ts$',
	]);
});
