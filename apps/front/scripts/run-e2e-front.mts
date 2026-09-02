#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	computeEnv as computeComposeEnv,
	releasePortBand as releaseComposePortBand,
	type E2eComposeEnv,
} from './e2e-compose-env.mts';

const COMPOSE_FILE = 'apps/front/docker-compose.test.yml';
const PNPM_COMMAND = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export type RunCommand = (
	command: string,
	args: string[],
	env: NodeJS.ProcessEnv,
) => Promise<void>;

type RunE2EFrontDependencies = {
	computeEnv?: () => E2eComposeEnv;
	runCommand?: RunCommand;
	releasePortBand?: (lockPath: string) => boolean;
	writeError?: (message: string) => void;
};

const runCommand: RunCommand = async (command, args, env) => {
	await new Promise<void>((resolveCommand, rejectCommand) => {
		// `pnpm` resolves to `pnpm.cmd` on Windows, and since Node 20 spawning a
		// `.cmd` without a shell fails with EINVAL. POSIX keeps shell:false so
		// arguments are never re-parsed by a shell.
		const child = spawn(command, args, {
			env,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		});

		child.once('error', rejectCommand);
		child.once('exit', (code, signal) => {
			if (code === 0) {
				resolveCommand();
				return;
			}

			const outcome =
				signal === null ? `exit ${String(code)}` : `signal ${signal}`;
			rejectCommand(
				new Error(`${command} ${args.join(' ')} failed with ${outcome}`),
			);
		});
	});
};

const dockerComposeArgs = (...args: string[]): string[] => [
	'compose',
	'-f',
	COMPOSE_FILE,
	...args,
];

export const runE2EFront = async (
	dependencies: RunE2EFrontDependencies = {},
): Promise<void> => {
	const computeEnv = dependencies.computeEnv ?? computeComposeEnv;
	const execute = dependencies.runCommand ?? runCommand;
	const releasePortBand =
		dependencies.releasePortBand ?? releaseComposePortBand;
	const writeError =
		dependencies.writeError ??
		((message: string) => process.stderr.write(message));
	const derivedEnv = computeEnv();
	const commandEnv = { ...process.env, ...derivedEnv };
	let lifecyclePassed = false;

	try {
		await execute(
			'docker',
			dockerComposeArgs('down', '-v', '--remove-orphans'),
			commandEnv,
		);
		await execute(
			'docker',
			dockerComposeArgs(
				'up',
				'-d',
				'--build',
				'--wait',
				'--wait-timeout',
				'180',
			),
			commandEnv,
		);
		await execute(
			PNPM_COMMAND,
			['--filter', 'front', 'exec', 'playwright', 'install', 'chromium'],
			commandEnv,
		);
		await execute(
			PNPM_COMMAND,
			['--filter', 'front', 'exec', 'playwright', 'test'],
			commandEnv,
		);
		await execute(
			PNPM_COMMAND,
			['--filter', 'front', 'test:drawer-contrast'],
			commandEnv,
		);
		lifecyclePassed = true;
	} finally {
		try {
			if (lifecyclePassed) {
				await execute('docker', dockerComposeArgs('down', '-v'), commandEnv);
			} else {
				writeError('E2E stack left running for inspection after failure.\n');
			}
		} finally {
			releasePortBand(derivedEnv.E2E_LOCK_PATH);
		}
	}
};

const isMainModule = (): boolean => {
	const entryPath = process.argv[1];
	return (
		entryPath !== undefined &&
		fileURLToPath(import.meta.url) === resolve(entryPath)
	);
};

if (isMainModule()) {
	process.stdout.write('=== [gate] front e2e (docker + playwright) ===\n');
	try {
		await runE2EFront();
	} catch (error) {
		// A failed sub-command must surface as a plain message plus a non-zero
		// exit code, not as an unhandled-rejection stack trace.
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	}
}
