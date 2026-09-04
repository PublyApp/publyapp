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

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runnerPath = path.join(scriptDir, 'npm-audit-runner.ts');

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

test('an advisory message containing fetch failed remains a generic failure', async () => {
	await withFakePnpm(
		"process.stdout.write('GHSA-demo: fetch failed in an advisory title\\n'); process.exit(9);",
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

const waitFor = async (condition: () => boolean): Promise<void> => {
	const deadline = Date.now() + 2_000;
	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error('timed out waiting for audit fixture');
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
};

test('SIGINT forwards to the detached audit process group', async () => {
	if (process.platform === 'win32') {
		return;
	}
	const directory = mkdtempSync(path.join(os.tmpdir(), 'publy-1699-signal-'));
	const pidFile = path.join(directory, 'pids.json');
	const driver = path.join(directory, 'driver.ts');
	const fake = fakePnpm(
		"const { spawn } = require('node:child_process'); const { writeFileSync } = require('node:fs'); const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); writeFileSync(process.env.PUBLY_AUDIT_PIDS, JSON.stringify({ parent: process.pid, child: child.pid })); setInterval(() => {}, 1000);",
	);
	writeFileSync(
		driver,
		`import { runAudit } from ${JSON.stringify(runnerPath)};\nawait runAudit({ graph: 'prod', auditLevel: 'moderate', cwd: process.cwd(), timeoutMs: 5_000 });\n`,
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
		audit.kill('SIGINT');
		await waitFor(() => {
			try {
				process.kill(pids.child, 0);
				return false;
			} catch {
				return true;
			}
		});
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
}, 5_000);
