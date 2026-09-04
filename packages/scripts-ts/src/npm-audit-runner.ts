import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const defaultTimeoutMs = 40_000,
	killGraceMs = 2_000;
const taskkillOptions = { stdio: 'ignore' as const, windowsHide: true };
const unavailablePattern =
	/\b(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN)\b|ERR_PNPM_META_FETCH_FAIL|ERR_PNPM_AUDIT_BAD_RESPONSE[\s\S]*(?:\b408\b|\b429\b|\b5\d{2}\b)|TimeoutError: The operation was aborted due to timeout/i;
const stdoutNetworkRecord =
	/(?:^|\n)\s*(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|ERR_SOCKET_TIMEOUT)\s+request to https?:\/\/[^\s]+\/-\/npm\/v1\/security\/audits failed\b/i;
const lockfilePattern = /ERR_PNPM_AUDIT_NO_LOCKFILE|No pnpm-lock\.yaml found/i;

export type AuditGraph = 'prod' | 'dev';
export type AuditLevel = 'info' | 'low' | 'moderate' | 'high' | 'critical';
export type AuditResult = {
	status: 'clean' | 'unavailable' | 'lockfile-missing' | 'failure';
	exitCode: number;
	stdout: string;
	stderr: string;
};
const classify = (
	exitCode: number,
	stdout: string,
	stderr: string,
	timedOut: boolean,
): AuditResult => {
	if (timedOut) {
		return { status: 'unavailable', exitCode, stdout, stderr };
	}
	if (exitCode === 0) {
		return { status: 'clean', exitCode, stdout, stderr };
	}
	if (lockfilePattern.test(`${stdout}\n${stderr}`)) {
		return { status: 'lockfile-missing', exitCode, stdout, stderr };
	}
	if (unavailablePattern.test(stderr) || stdoutNetworkRecord.test(stdout)) {
		return { status: 'unavailable', exitCode, stdout, stderr };
	}
	return { status: 'failure', exitCode, stdout, stderr };
};

export const runAudit = async (options: {
	graph: AuditGraph;
	auditLevel: AuditLevel;
	cwd: string;
	registry?: string;
	timeoutMs?: number;
}): Promise<AuditResult> =>
	new Promise((resolve) => {
		const env: NodeJS.ProcessEnv = {
			...process.env,
			npm_config_fetch_retries: '0',
		};
		delete env.npm_config_fetch_timeout;
		if (options.registry !== undefined) {
			env.npm_config_registry = options.registry;
		}
		const args = ['audit', `--audit-level=${options.auditLevel}`];
		if (options.registry !== undefined) {
			args.push(`--registry=${options.registry}`);
		}
		args.push(options.graph === 'prod' ? '--prod' : '--dev');
		const child = spawn(
			process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
			args,
			{
				cwd: options.cwd,
				env,
				detached: process.platform !== 'win32',
				shell: process.platform === 'win32',
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);
		let stdout = '',
			stderr = '';
		let timedOut = false;
		let killTimer: NodeJS.Timeout | undefined;
		const stop = (signal: NodeJS.Signals): void => {
			if (child.pid === undefined) {
				return;
			}
			try {
				if (process.platform === 'win32') {
					const taskkill = ['/PID', String(child.pid), '/T'];
					const graceful =
						signal === 'SIGKILL'
							? null
							: spawnSync('taskkill', taskkill, taskkillOptions);
					if (signal === 'SIGKILL' || graceful?.status !== 0) {
						spawnSync('taskkill', [...taskkill, '/F'], taskkillOptions);
					}
					return;
				}
				process.kill(-child.pid, signal);
			} catch {}
		};
		const scheduleStop = (signal: NodeJS.Signals): void => {
			stop(signal);
			killTimer ??= setTimeout(() => stop('SIGKILL'), killGraceMs);
		};
		const forwardSigint = (): void => scheduleStop('SIGINT');
		const forwardSigterm = (): void => scheduleStop('SIGTERM');
		process.once('SIGINT', forwardSigint);
		process.once('SIGTERM', forwardSigterm);
		const timeout = setTimeout(() => {
			timedOut = true;
			scheduleStop('SIGTERM');
		}, options.timeoutMs ?? defaultTimeoutMs);
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		let spawnFailed = false;
		child.on('error', (error) => {
			spawnFailed = true;
			stderr += `\nspawn error: ${error.message}`;
		});
		child.on('close', (code) => {
			clearTimeout(timeout);
			process.removeListener('SIGINT', forwardSigint);
			process.removeListener('SIGTERM', forwardSigterm);
			const exitCode = spawnFailed || code === null || code < 0 ? 1 : code;
			resolve(classify(exitCode, stdout, stderr, timedOut));
		});
	});

const main = async (): Promise<void> => {
	const [, , graph, auditLevel = 'moderate'] = process.argv;
	if (
		(graph !== 'prod' && graph !== 'dev') ||
		!['info', 'low', 'moderate', 'high', 'critical'].includes(auditLevel)
	) {
		process.stderr.write(
			'usage: npm-audit-runner <prod|dev> <info|low|moderate|high|critical>\n',
		);
		process.exitCode = 2;
		return;
	}
	const result = await runAudit({
		graph,
		auditLevel: auditLevel as AuditLevel,
		cwd: process.cwd(),
	});
	process.stdout.write(result.stdout);
	process.stderr.write(result.stderr);
	if (result.status === 'unavailable') {
		process.stderr.write('\nnpm audit service unavailable\n');
	}
	const auditExitCode = result.exitCode > 0 ? result.exitCode : 1;
	process.exitCode = result.status === 'clean' ? 0 : auditExitCode;
};

if (
	process.argv[1] !== undefined &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
	void main();
}
