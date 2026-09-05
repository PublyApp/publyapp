import { spawn, spawnSync } from 'node:child_process';
import {
	mkdtempSync,
	rmSync,
	readFileSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { expect, test } from 'vitest';

import {
	processGroupStillExists,
	signalChildTree,
} from '../../../scripts/run-e2e-front.mts';

/**
 * KEPT RED PROOF — issue #1611.
 *
 * The proof creates an isolated temporary worktree, mutates the production
 * picker source there, and runs exactly one bounded real Docker/Playwright
 * journey against that worktree. The checked-out worktree is never mutated, so
 * an outer watchdog SIGKILL cannot leave the branch source half-mutated. The
 * temporary worktree is removed after the child exits; the child itself is in
 * a detached process group with a finite timeout and receives TERM then KILL.
 *
 * The green replay is deliberately a separate invocation: the captain runs the
 * ordinary unmutated E2E journey after this kept-red replay. Two complete
 * Docker stacks are never launched synchronously inside one Vitest test.
 *
 * No response, component, i18n module, browser page, or proof route is
 * injected. The child is the real `run-e2e-front.mts` runner, selecting
 * `e2e/tenant-portal-picker.spec.ts --grep @1611 --project chromium`.
 *
 * Replay directly (Docker required; the final assertion intentionally stays
 * red when the corrected production source is used):
 *
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1611/red-1611-deleted-picker-message-collapsed.test.ts
 */

const FRONT_ROOT = process.cwd();
const REPO_ROOT = resolve(FRONT_ROOT, '..', '..');
const PICKER_STATES_RELATIVE_PATH =
	'apps/front/src/routes/authed/tenant/_tenant-picker-states.tsx';
const PICKER_STATES_PATH = resolve(REPO_ROOT, PICKER_STATES_RELATIVE_PATH);
const E2E_RUNNER_RELATIVE_PATH = 'apps/front/scripts/run-e2e-front.mts';
const MUTATION_FROM = 'if (hasDeletedTenants) {';
const MUTATION_TO = 'if (false) {';
const PLAYWRIGHT_SPEC = 'e2e/tenant-portal-picker.spec.ts';
const PLAYWRIGHT_GREP = '@1611';
const PLAYWRIGHT_PROJECT = 'chromium';
const CHILD_TIMEOUT_MS = 240_000;
const CHILD_TERM_GRACE_MS = 5_000;
const MAX_OUTPUT_LENGTH = 16 * 1024 * 1024;

type JourneyResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
};

type GitResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
};

type TemporaryWorktree = {
	parentPath: string;
	worktreePath: string;
};

const errorText = (error: unknown): string =>
	error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const readChildOutput = (current: string, chunk: Buffer | string): string => {
	if (current.length >= MAX_OUTPUT_LENGTH) {
		return current;
	}

	const remaining = MAX_OUTPUT_LENGTH - current.length;
	return current + chunk.toString().slice(0, remaining);
};

const runGit = (args: string[]): GitResult => {
	const result = spawnSync('git', args, {
		cwd: REPO_ROOT,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
		timeout: 30_000,
	});

	return {
		status: result.status,
		stdout: typeof result.stdout === 'string' ? result.stdout : '',
		stderr: typeof result.stderr === 'string' ? result.stderr : '',
		error: result.error,
	};
};

const removeTemporaryWorktree = (worktreePath: string): void => {
	const removal = runGit(['worktree', 'remove', '--force', worktreePath]);
	if (removal.status === 0) {
		return;
	}

	try {
		rmSync(worktreePath, { recursive: true, force: true });
	} catch (error) {
		throw new Error(
			`MESURE IMPOSSIBLE: temporary proof worktree cleanup failed (${errorText(error)})`,
		);
	}
	throw new Error(
		'MESURE IMPOSSIBLE: git could not remove the temporary proof worktree',
	);
};

const createTemporaryWorktree = (): TemporaryWorktree => {
	const parentPath = mkdtempSync(join(tmpdir(), 'publyapp-1611-proof-'));
	const worktreePath = join(parentPath, 'source');
	const result = runGit(['worktree', 'add', '--detach', worktreePath, 'HEAD']);
	if (result.status !== 0) {
		try {
			rmSync(parentPath, { recursive: true, force: true });
		} catch {
			// The original measurement error is more useful than a temp-dir error.
		}
		throw new Error(
			`MESURE IMPOSSIBLE: could not create the isolated proof worktree (${errorText(result.error)})`,
		);
	}

	try {
		symlinkSync(
			resolve(REPO_ROOT, 'node_modules'),
			join(worktreePath, 'node_modules'),
		);
		symlinkSync(
			resolve(REPO_ROOT, 'apps/front/node_modules'),
			join(worktreePath, 'apps/front/node_modules'),
		);
	} catch (error) {
		removeTemporaryWorktree(worktreePath);
		throw new Error(
			`MESURE IMPOSSIBLE: could not expose the installed dependencies to the isolated proof worktree (${errorText(error)})`,
		);
	}

	return { parentPath, worktreePath };
};

const runBoundedE2E = (worktreePath: string): Promise<JourneyResult> =>
	new Promise((resolveResult) => {
		const child = spawn(
			process.execPath,
			[join(worktreePath, E2E_RUNNER_RELATIVE_PATH)],
			{
				cwd: worktreePath,
				detached: true,
				env: {
					...process.env,
					E2E_PLAYWRIGHT_SPEC: PLAYWRIGHT_SPEC,
					E2E_PLAYWRIGHT_GREP: PLAYWRIGHT_GREP,
					E2E_PLAYWRIGHT_PROJECT: PLAYWRIGHT_PROJECT,
				},
				stdio: ['ignore', 'pipe', 'pipe'],
			},
		);

		let stdout = '';
		let stderr = '';
		let timedOut = false;
		let settled = false;
		let killTimer: NodeJS.Timeout | undefined;
		let groupPollTimer: NodeJS.Timeout | undefined;
		let postKillTimer: NodeJS.Timeout | undefined;

		const finish = (result: JourneyResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			clearTimeout(timeoutTimer);
			if (killTimer !== undefined) {
				clearTimeout(killTimer);
			}
			if (groupPollTimer !== undefined) {
				clearTimeout(groupPollTimer);
			}
			if (postKillTimer !== undefined) {
				clearTimeout(postKillTimer);
			}
			process.removeListener('SIGINT', onSignal);
			process.removeListener('SIGTERM', onSignal);
			resolveResult(result);
		};

		const finishTimedOut = (): void => {
			stderr += `\nE2E proof child exceeded ${CHILD_TIMEOUT_MS}ms and was terminated.`;
			finish({ status: 124, stdout, stderr });
		};

		const waitForTreeTermination = (): void => {
			postKillTimer = setTimeout(() => {
				if (
					process.platform !== 'win32' &&
					processGroupStillExists(child.pid)
				) {
					// Keep the wrapper bounded even if the platform probe cannot
					// prove that an already SIGKILLed group has disappeared.
					stderr +=
						'\nMESURE IMPOSSIBLE: forced proof child group termination was not observed.';
					signalChildTree(child, 'SIGKILL');
				}
				finishTimedOut();
			}, CHILD_TERM_GRACE_MS);

			if (process.platform === 'win32') {
				// taskkill /T /F has no process-group probe on Windows. Give the
				// tree a bounded settling window after the forced kill.
				return;
			}

			const poll = (): void => {
				if (!processGroupStillExists(child.pid)) {
					finishTimedOut();
					return;
				}
				groupPollTimer = setTimeout(poll, 50);
			};

			poll();
		};

		const requestTermination = (): void => {
			if (settled || timedOut) {
				return;
			}
			timedOut = true;
			signalChildTree(child, 'SIGTERM');
			killTimer = setTimeout(() => {
				if (settled) {
					return;
				}
				signalChildTree(child, 'SIGKILL');
				waitForTreeTermination();
			}, CHILD_TERM_GRACE_MS);
		};

		const onSignal = (): void => {
			requestTermination();
		};

		const timeoutTimer = setTimeout(requestTermination, CHILD_TIMEOUT_MS);

		child.stdout?.on('data', (chunk: Buffer | string) => {
			stdout = readChildOutput(stdout, chunk);
		});
		child.stderr?.on('data', (chunk: Buffer | string) => {
			stderr = readChildOutput(stderr, chunk);
		});
		child.once('error', (error) => {
			if (timedOut) {
				stderr += `\nE2E proof child error during termination: ${errorText(error)}`;
				return;
			}
			finish({ status: null, stdout, stderr, error });
		});
		child.once('exit', (status, signal) => {
			if (timedOut) {
				// The leader can exit while a TERM-resistant descendant keeps the
				// detached group alive. Leave the escalation armed until the group
				// probe proves that the whole tree is gone.
				if (processGroupStillExists(child.pid)) {
					return;
				}
				finishTimedOut();
				return;
			}

			finish({
				status: status ?? 1,
				stdout,
				stderr: signal === null ? stderr : `${stderr}\nchild signal: ${signal}`,
			});
		});

		process.once('SIGINT', onSignal);
		process.once('SIGTERM', onSignal);
	});

const runMutatedJourneyInIsolation = async (
	originalSource: string,
): Promise<JourneyResult> => {
	const mutationCount = originalSource.split(MUTATION_FROM).length - 1;
	if (mutationCount !== 1) {
		throw new Error(
			`MESURE IMPOSSIBLE: expected exactly one live all-deleted branch marker, found ${mutationCount}`,
		);
	}

	const mutatedSource = originalSource.replace(MUTATION_FROM, MUTATION_TO);
	const isolated = createTemporaryWorktree();
	try {
		const isolatedSourcePath = resolve(
			isolated.worktreePath,
			PICKER_STATES_RELATIVE_PATH,
		);
		writeFileSync(isolatedSourcePath, mutatedSource, 'utf8');
		return await runBoundedE2E(isolated.worktreePath);
	} finally {
		removeTemporaryWorktree(isolated.worktreePath);
		try {
			rmSync(isolated.parentPath, { recursive: true, force: true });
		} catch {
			// The git worktree removal already detached the source safely.
		}
	}
};

test(
	'the real @1611 Playwright journey rejects collapsed all-deleted copy',
	{ timeout: 270_000 },
	async () => {
		const originalSource = readFileSync(PICKER_STATES_PATH, 'utf8');
		const mutatedResult = await runMutatedJourneyInIsolation(originalSource);

		if (readFileSync(PICKER_STATES_PATH, 'utf8') !== originalSource) {
			throw new Error(
				'MESURE IMPOSSIBLE: the checked-out production source changed during the isolated proof',
			);
		}
		if (mutatedResult.error) {
			throw new Error(
				`MESURE IMPOSSIBLE: the real @1611 Playwright journey could not start (${errorText(mutatedResult.error)})`,
			);
		}
		if (mutatedResult.status === null || mutatedResult.status === 124) {
			throw new Error(
				'MESURE IMPOSSIBLE: the bounded real @1611 Playwright journey did not return a measured test status',
			);
		}

		const output = `${mutatedResult.stdout}\n${mutatedResult.stderr}`;
		if (
			!output.includes('Your organizations are no longer available') ||
			!output.includes(PLAYWRIGHT_SPEC)
		) {
			throw new Error(
				'MESURE IMPOSSIBLE: the mutated failure did not reach the real all-deleted journey assertion',
			);
		}

		// Kept-red assertion: with the temporary production mutation, the real
		// journey must fail. A pass means the journey no longer distinguishes
		// all-deleted organizations from a generic empty state.
		expect(mutatedResult.status).toBe(0);
	},
);
