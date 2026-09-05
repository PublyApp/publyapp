import { spawnSync } from 'node:child_process';
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
	runBoundedProcessTree,
	type BoundedProcessResult,
} from '../../../scripts/run-proof-child.mts';

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

const runBoundedE2E = (worktreePath: string): Promise<BoundedProcessResult> =>
	runBoundedProcessTree({
		file: process.execPath,
		args: [join(worktreePath, E2E_RUNNER_RELATIVE_PATH)],
		cwd: worktreePath,
		env: {
			...process.env,
			E2E_PLAYWRIGHT_SPEC: PLAYWRIGHT_SPEC,
			E2E_PLAYWRIGHT_GREP: PLAYWRIGHT_GREP,
			E2E_PLAYWRIGHT_PROJECT: PLAYWRIGHT_PROJECT,
		},
		timeoutMs: CHILD_TIMEOUT_MS,
		termGraceMs: CHILD_TERM_GRACE_MS,
		maxOutputLength: 16 * 1024 * 1024,
	});

const runMutatedJourneyInIsolation = async (
	originalSource: string,
): Promise<BoundedProcessResult> => {
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
