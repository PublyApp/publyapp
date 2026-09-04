import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test } from 'vitest';

import { defaultAuditTimeoutMs } from './npm-audit-runner.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(scriptDir, 'npm-audit-runner.ts');

test('production and development graphs keep distinct finite default bounds', () => {
	assert.equal(defaultAuditTimeoutMs('prod'), 40_000);
	assert.equal(defaultAuditTimeoutMs('dev'), 120_000);
});

const run = async (
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
): Promise<{ status: number | null; stdout: string; stderr: string }> =>
	new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (status) => resolve({ status, stdout, stderr }));
	});

const fakePnpm = (source: string) => {
	const bin = mkdtempSync(path.join(os.tmpdir(), 'publy-1699-pnpm-bin-'));
	const executable = path.join(bin, 'pnpm');
	writeFileSync(executable, `#!/usr/bin/env node\n${source}`);
	chmodSync(executable, 0o755);
	return { bin, remove: () => rmSync(bin, { recursive: true, force: true }) };
};

const withFakePnpm = async (
	source: string,
	action: (env: NodeJS.ProcessEnv) => Promise<void>,
): Promise<void> => {
	if (process.platform === 'win32') {
		return;
	}
	const fake = fakePnpm(source);
	try {
		await action({
			...process.env,
			PATH: `${fake.bin}${path.delimiter}${process.env.PATH}`,
		});
	} finally {
		fake.remove();
	}
};

test('the CLI preserves pnpm’s usable nonzero exit status', async () => {
	await withFakePnpm('process.exit(7);', async (env) => {
		const result = await run(
			process.execPath,
			[runnerPath, 'prod', 'moderate'],
			env,
		);
		assert.equal(result.status, 7, result.stderr);
	});
});

test('a nonzero advisory stdout containing ENOTFOUND remains a generic failure', async () => {
	await withFakePnpm(
		"process.stdout.write('GHSA-demo: ENOTFOUND in an advisory title\\n'); process.exit(9);",
		async (env) => {
			const result = await run(
				process.execPath,
				[runnerPath, 'prod', 'moderate'],
				env,
			);
			assert.equal(result.status, 9, result.stderr);
			assert.doesNotMatch(result.stderr, /service unavailable/);
		},
	);
});

test('a clean stdout containing ENOTFOUND remains clean', async () => {
	await withFakePnpm(
		"process.stdout.write('ENOTFOUND in an advisory title\\n');",
		async (env) => {
			const result = await run(
				process.execPath,
				[runnerPath, 'prod', 'moderate'],
				env,
			);
			assert.equal(result.status, 0, result.stderr);
			assert.doesNotMatch(result.stderr, /service unavailable/);
		},
	);
});

test('a known pnpm fetch error on stderr is unavailable', async () => {
	await withFakePnpm(
		"process.stderr.write('ERR_PNPM_META_FETCH_FAIL GET http://localhost: refused\\n'); process.exit(1);",
		async (env) => {
			const result = await run(
				process.execPath,
				[runnerPath, 'prod', 'moderate'],
				env,
			);
			assert.equal(result.status, 1, result.stderr);
			assert.match(result.stderr, /npm audit service unavailable/);
		},
	);
});

test('the runner disables retries without imposing a per-request timeout', async () => {
	await withFakePnpm(
		'process.stdout.write(JSON.stringify({ retries: process.env.npm_config_fetch_retries, timeout: process.env.npm_config_fetch_timeout ?? null }));',
		async (env) => {
			env.npm_config_fetch_timeout = '3000';
			const result = await run(
				process.execPath,
				[runnerPath, 'prod', 'moderate'],
				env,
			);
			assert.equal(result.status, 0, result.stderr);
			assert.deepEqual(JSON.parse(result.stdout), {
				retries: '0',
				timeout: null,
			});
		},
	);
});

const waitFor = async (
	condition: () => boolean,
	timeoutMs = 2_000,
): Promise<void> => {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error('timed out waiting for audit fixture');
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
};

const ignoresSigtermGrandchild =
	"const { spawn } = require('node:child_process'); const { writeFileSync } = require('node:fs'); const child = spawn(process.execPath, ['-e', \"process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)\"], { stdio: 'ignore' }); writeFileSync(process.env.PUBLY_AUDIT_PIDS, JSON.stringify({ parent: process.pid, child: child.pid })); setInterval(() => {}, 1000);";

const assertEscalationKillsGrandchild = async (
	timeoutMs: number,
	signal?: NodeJS.Signals,
): Promise<void> => {
	if (process.platform === 'win32') {
		return;
	}
	const directory = mkdtempSync(path.join(os.tmpdir(), 'publy-1699-signal-'));
	const pidFile = path.join(directory, 'pids.json');
	const driver = path.join(directory, 'driver.ts');
	const fake = fakePnpm(ignoresSigtermGrandchild);
	writeFileSync(
		driver,
		`import { runAudit } from ${JSON.stringify(runnerPath)};\nawait runAudit({ graph: 'prod', auditLevel: 'moderate', cwd: process.cwd(), timeoutMs: ${String(timeoutMs)} });\n`,
	);
	const env = {
		...process.env,
		PATH: `${fake.bin}${path.delimiter}${process.env.PATH}`,
		PUBLY_AUDIT_PIDS: pidFile,
	};
	try {
		const audit = spawn(process.execPath, [driver], { env, stdio: 'ignore' });
		await waitFor(() => {
			try {
				return readFileSync(pidFile, 'utf8').length > 0;
			} catch {
				return false;
			}
		});
		const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as {
			parent: number;
			child: number;
		};
		if (signal !== undefined) {
			audit.kill(signal);
		}
		await waitFor(() => {
			try {
				process.kill(pids.child, 0);
				return false;
			} catch {
				return true;
			}
		}, 4_000);
	} finally {
		try {
			const pids = JSON.parse(readFileSync(pidFile, 'utf8')) as {
				parent: number;
			};
			process.kill(-pids.parent, 'SIGKILL');
		} catch {
			// The forwarding proof already reaped the fixture group.
		}
		fake.remove();
		rmSync(directory, { recursive: true, force: true });
	}
};

test('a timeout escalates after its pnpm child exits but its grandchild ignores SIGTERM', async () => {
	await assertEscalationKillsGrandchild(100);
}, 5_000);

test('forwarded SIGTERM escalates after its pnpm child exits but its grandchild ignores SIGTERM', async () => {
	await assertEscalationKillsGrandchild(5_000, 'SIGTERM');
}, 5_000);
