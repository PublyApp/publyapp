import { spawn } from 'node:child_process';
import process from 'node:process';

const defaultTimeoutMs = 40_000;
const killGraceMs = 2_000;

export type AuditGraph = 'prod' | 'dev';
export type AuditLevel = 'info' | 'low' | 'moderate' | 'high' | 'critical';
export type AuditResult = {
	status: 'clean' | 'unavailable' | 'lockfile-missing' | 'failure';
	exitCode: number;
	stdout: string;
	stderr: string;
};

const isLockfileMissing = (output: string): boolean =>
	/ERR_PNPM_AUDIT_NO_LOCKFILE|No pnpm-lock\.yaml found/i.test(output);

const isUnavailable = (output: string): boolean =>
	/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|operation was aborted due to timeout|ERR_PNPM_META_FETCH_FAIL/i.test(
		output,
	);

const classify = (
	exitCode: number,
	stdout: string,
	stderr: string,
	timedOut: boolean,
): AuditResult => {
	const output = `${stdout}\n${stderr}`;
	if (timedOut || isUnavailable(output)) {
		return { status: 'unavailable', exitCode, stdout, stderr };
	}
	if (isLockfileMissing(output)) {
		return { status: 'lockfile-missing', exitCode, stdout, stderr };
	}
	return {
		status: exitCode === 0 ? 'clean' : 'failure',
		exitCode,
		stdout,
		stderr,
	};
};

export const runAudit = async (options: {
	graph: AuditGraph;
	auditLevel: AuditLevel;
	cwd: string;
	registry?: string;
	timeoutMs?: number;
}): Promise<AuditResult> =>
	new Promise((resolve) => {
		const env = { ...process.env };
		if (options.registry !== undefined) {
			env.npm_config_registry = options.registry;
		}
		const args = [
			'audit',
			`--audit-level=${options.auditLevel}`,
			'--fetch-retries=0',
			'--fetch-timeout=3000',
		];
		if (options.registry !== undefined) {
			args.push(`--registry=${options.registry}`);
		}
		args.push(options.graph === 'prod' ? '--prod' : '--dev');
		const child = spawn('pnpm', args, {
			cwd: options.cwd,
			env,
			detached: process.platform !== 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let killTimer: NodeJS.Timeout | undefined;
		const stop = (signal: NodeJS.Signals): void => {
			if (child.pid === undefined) {
				return;
			}
			try {
				if (process.platform === 'win32') {
					child.kill(signal);
				} else {
					process.kill(-child.pid, signal);
				}
			} catch {
				// The process exited between the timeout and termination attempt.
			}
		};
		const timeout = setTimeout(() => {
			timedOut = true;
			stop('SIGTERM');
			killTimer = setTimeout(() => stop('SIGKILL'), killGraceMs);
		}, options.timeoutMs ?? defaultTimeoutMs);
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		child.on('error', (error) => {
			stderr += `\nspawn error: ${error.message}`;
		});
		child.on('close', (code) => {
			clearTimeout(timeout);
			clearTimeout(killTimer);
			resolve(classify(code ?? 1, stdout, stderr, timedOut));
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
	process.exitCode = result.status === 'clean' ? 0 : 1;
};

if (import.meta.url === `file://${process.argv[1]}`) {
	void main();
}
