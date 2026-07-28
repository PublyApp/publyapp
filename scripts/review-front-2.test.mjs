import assert from 'node:assert/strict';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
	choosePort,
	generateEnv,
	getIssueBranchPattern,
	parseTrackedChangesFromStatus,
	parseWorktrees,
	FRONTEND_ENV_KEYS,
} from './review-front-2.mjs';

test('parses worktree porcelain output with spaces and detached HEAD', () => {
	const raw = [
		'worktree /tmp/pr1000',
		'HEAD deadbeef',
		'branch refs/heads/fix/989-ui',
		'',
		'worktree /tmp/space name/path with spaces',
		'HEAD faceb00c',
		'',
		'worktree /tmp/issue-pr',
		'HEAD caffeined',
		'branch refs/heads/fix/1245-a',
		'',
	].join('\n');

	const parsed = parseWorktrees(raw);

	assert.equal(parsed.length, 3);
	assert.deepEqual(parsed[0], {
		path: '/tmp/pr1000',
		head: 'deadbeef',
		branch: 'fix/989-ui',
	});
	assert.deepEqual(parsed[1], {
		path: '/tmp/space name/path with spaces',
		head: 'faceb00c',
		branch: null,
	});
	assert.deepEqual(parsed[2], {
		path: '/tmp/issue-pr',
		head: 'caffeined',
		branch: 'fix/1245-a',
	});
});

test('choosePort skips busy and reserved ports with fall-forward', async () => {
	const checks = [];
	const port = await choosePort(1, {
		host: '127.0.0.1',
		probePortAvailable: async (_host, port) => {
			checks.push(port);
			return port !== 5001;
		},
	});

	assert.equal(port, 5002);
	assert.deepEqual(checks, [5001, 5002]);
});

test('choosePort starts from preferred candidate after reserved adjustment', async () => {
	const checks = [];
	const port = await choosePort(0, {
		host: '127.0.0.1',
		probePortAvailable: async (_host, probePort) => {
			checks.push(probePort);
			return probePort !== 5001;
		},
	});

	assert.equal(port, 5002);
	assert.equal(checks[0], 5001);
	assert.equal(checks[1], 5002);
});

test('issue token pattern avoids near misses and suffix-only matches', () => {
	const isMatch = (number, branch) => {
		const regex = getIssueBranchPattern(number);
		return regex.test(branch);
	};

	assert.equal(isMatch(989, 'fix/989-ui'), true);
	assert.equal(isMatch(989, 'fix/9890-ui'), false);
	assert.equal(isMatch(989, 'fix/1989-ui'), false);
	assert.equal(isMatch(989, 'hotfix/1989-x'), false);
});

test('generated review overlay contains only allowed keys', async () => {
	const worktreePath = await mkdtemp(
		path.join(os.tmpdir(), 'review-front-2-overlay-'),
	);
	const envFile = path.join(worktreePath, '.env.development.local');
	const priorToken = process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;

	process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = 'token-from-test';
	await generateEnv(worktreePath, 'pr989', 5994);
	const raw = await readFile(envFile, 'utf8');
	try {
		for (const line of raw.split('\n')) {
			if (line.trim().length === 0 || line.startsWith('#')) {
				continue;
			}

			const key = line.slice(0, line.indexOf('='));
			assert.ok(FRONTEND_ENV_KEYS.includes(key));
		}
	} finally {
		if (priorToken === undefined) {
			delete process.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
		} else {
			process.env.PUBLIC_POSTHOG_PROJECT_TOKEN = priorToken;
		}

		await rm(worktreePath, { recursive: true, force: true });
	}
});

test('tracked changes parser preserves exact path with leading space and renames', () => {
	const output = [
		' M apps/front-2/src/routeTree.gen.ts',
		'R  apps/front-2/old.ts -> apps/front-2/new.ts',
	].join('\n');

	const changes = parseTrackedChangesFromStatus(output);
	assert.ok(changes.has('apps/front-2/src/routeTree.gen.ts'));
	assert.ok(changes.has('apps/front-2/old.ts -> apps/front-2/new.ts'));
});
