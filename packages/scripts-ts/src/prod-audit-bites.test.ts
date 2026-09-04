import assert from 'node:assert/strict';
import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { test } from 'vitest';

import { runAudit } from './npm-audit-runner.ts';

const advisoryId = 'GHSA-ghr5-ch3p-vcr6';
const advisoryTitle = 'ejs lacks certain pollution protection';

const packageJson = JSON.stringify({
	name: 'publy-1699-audit-probe',
	version: '0.0.0',
	private: true,
	packageManager: 'pnpm@10.13.1',
	dependencies: { ejs: '3.1.7' },
});

const lockfile = `lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:
  .:
    dependencies:
      ejs:
        specifier: 3.1.7
        version: 3.1.7

packages:
  ejs@3.1.7:
    resolution: {integrity: sha512-CbLej5Dgp7DfaUU+Pn6nGT9FwBzXHnYpZBhmItnVUEwUGUJwl6VPiwNEOitNuwHBMLP5ZfL43Zu0A5TYVQWGDQ==}

snapshots:
  ejs@3.1.7: {}
`;

const payload = {
	actions: [],
	advisories: {
		ejs: {
			id: 1304,
			url: `https://github.com/advisories/${advisoryId}`,
			title: advisoryTitle,
			module_name: 'ejs',
			severity: 'moderate',
			vulnerable_versions: '<3.1.10',
			patched_versions: '>=3.1.10',
			findings: [{ version: '3.1.7', paths: ['ejs'] }],
		},
	},
	metadata: {
		vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0 },
	},
};

const cleanPayload = {
	actions: [],
	advisories: {},
	metadata: {
		vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 },
	},
};

type ServerMode = 'advisory' | 'slow';

const startAuditServer = async (mode: ServerMode) => {
	const server = createServer(async (request, response) => {
		let body = '';
		for await (const chunk of request) {
			body += chunk;
			// Consume the complete audit request before responding or hanging.
		}
		if (mode === 'slow') {
			return;
		}
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify(body.includes('ejs') ? payload : cleanPayload));
	});
	const port = await new Promise<number>((resolve) => {
		server.listen(0, '127.0.0.1', () => {
			const address = server.address();
			if (address === null || typeof address === 'string') {
				throw new Error('localhost audit server has no TCP port');
			}
			resolve(address.port);
		});
	});
	return {
		registry: `http://127.0.0.1:${port}`,
		close: async (): Promise<void> => {
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
};

const buildFixture = (): string => {
	const cwd = mkdtempSync(path.join(os.tmpdir(), 'publy-1699-audit-'));
	writeFileSync(path.join(cwd, 'package.json'), packageJson);
	writeFileSync(path.join(cwd, 'pnpm-lock.yaml'), lockfile);
	return cwd;
};

const withFixture = async (
	mode: ServerMode,
	assertion: (input: { cwd: string; registry: string }) => Promise<void>,
): Promise<void> => {
	const server = await startAuditServer(mode);
	const cwd = buildFixture();
	try {
		await assertion({ cwd, registry: server.registry });
	} finally {
		rmSync(cwd, { recursive: true, force: true });
		await server.close();
	}
};

test('a moderate production advisory fails and names its GHSA and title', async () => {
	await withFixture('advisory', async ({ cwd, registry }) => {
		const result = await runAudit({
			graph: 'prod',
			auditLevel: 'moderate',
			cwd,
			registry,
			timeoutMs: 5_000,
		});
		assert.notEqual(result.exitCode, 0);
		assert.match(result.stdout, new RegExp(advisoryId));
		assert.match(result.stdout, new RegExp(advisoryTitle));
	});
});

test('a high production audit is clean for a moderate advisory', async () => {
	await withFixture('advisory', async ({ cwd, registry }) => {
		const result = await runAudit({
			graph: 'prod',
			auditLevel: 'high',
			cwd,
			registry,
			timeoutMs: 5_000,
		});
		assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
	});
});

test('a development audit is clean for a production-only advisory', async () => {
	await withFixture('advisory', async ({ cwd, registry }) => {
		const result = await runAudit({
			graph: 'dev',
			auditLevel: 'moderate',
			cwd,
			registry,
			timeoutMs: 5_000,
		});
		assert.equal(result.exitCode, 0, `${result.stdout}\n${result.stderr}`);
	});
});

test('a missing lockfile is named and fails', async () => {
	await withFixture('advisory', async ({ cwd, registry }) => {
		renameSync(
			path.join(cwd, 'pnpm-lock.yaml'),
			path.join(cwd, 'pnpm-lock.yaml.missing'),
		);
		const result = await runAudit({
			graph: 'prod',
			auditLevel: 'moderate',
			cwd,
			registry,
			timeoutMs: 5_000,
		});
		assert.notEqual(result.exitCode, 0);
		assert.match(
			`${result.stdout}\n${result.stderr}`,
			/ERR_PNPM_AUDIT_NO_LOCKFILE|No pnpm-lock\.yaml found/i,
		);
	});
});

test('a slow local audit endpoint is unavailable in under eight seconds', async () => {
	await withFixture('slow', async ({ cwd, registry }) => {
		const started = Date.now();
		const result = await runAudit({
			graph: 'prod',
			auditLevel: 'moderate',
			cwd,
			registry,
			timeoutMs: 5_000,
		});
		assert.notEqual(result.exitCode, 0);
		assert.equal(
			result.status,
			'unavailable',
			`${result.stdout}\n${result.stderr}`,
		);
		assert.ok(Date.now() - started < 8_000);
	});
}, 10_000);
