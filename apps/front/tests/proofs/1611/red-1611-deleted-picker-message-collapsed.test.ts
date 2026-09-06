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
 * picker source there, and runs exactly one bounded real product-render test
 * against that worktree. The checked-out worktree is never mutated, so
 * an outer watchdog SIGKILL cannot leave the branch source half-mutated. The
 * temporary worktree is removed after the child exits; the child itself is in
 * a detached process group with a finite timeout and receives TERM then KILL.
 *
 * The green replay is deliberately a separate invocation: the captain runs the
 * ordinary unmutated Docker E2E journey after this kept-red replay.
 *
 * No response, component, i18n module, browser page, or proof route is
 * injected. The child is the existing focused Vitest test in
 * `src/routes/authed/tenant.test.tsx`, selecting the real #258 all-deleted
 * route assertion.
 *
 * Replay directly (the final assertion intentionally stays red when the
 * corrected production source is used):
 *
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1611/red-1611-deleted-picker-message-collapsed.test.ts
 */

const FRONT_ROOT = process.cwd();
const REPO_ROOT = resolve(FRONT_ROOT, '..', '..');
const PICKER_STATES_RELATIVE_PATH =
	'apps/front/src/routes/authed/tenant/_tenant-picker-states.tsx';
const PICKER_STATES_PATH = resolve(REPO_ROOT, PICKER_STATES_RELATIVE_PATH);
const MUTATION_FROM = 'if (hasDeletedTenants) {';
const MUTATION_TO = 'if (false) {';
const PRODUCT_TEST_FILE = 'src/routes/authed/tenant.test.tsx';
const PRODUCT_TEST_GREP =
	'#258: renders the deletion notice when every tenant was soft-deleted';
const ALL_DELETED_TITLE = 'Your organizations are no longer available';
const CHILD_TIMEOUT_MS = 120_000;
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

const runBoundedProductTest = (
	worktreePath: string,
): Promise<BoundedProcessResult> =>
	runBoundedProcessTree({
		file: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
		args: [
			'exec',
			'vitest',
			'run',
			'--config',
			'vitest.config.ts',
			'--no-color',
			'--reporter=verbose',
			PRODUCT_TEST_FILE,
			'--testNamePattern',
			PRODUCT_TEST_GREP,
		],
		cwd: join(worktreePath, 'apps/front'),
		env: {
			...process.env,
		},
		timeoutMs: CHILD_TIMEOUT_MS,
		termGraceMs: CHILD_TERM_GRACE_MS,
		maxOutputLength: 16 * 1024 * 1024,
	});

const runMutatedProductTestInIsolation = async (
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
		return await runBoundedProductTest(isolated.worktreePath);
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
	'the real #258 product test rejects collapsed all-deleted copy',
	{ timeout: 150_000 },
	async () => {
		const originalSource = readFileSync(PICKER_STATES_PATH, 'utf8');
		const mutatedResult =
			await runMutatedProductTestInIsolation(originalSource);

		if (readFileSync(PICKER_STATES_PATH, 'utf8') !== originalSource) {
			throw new Error(
				'MESURE IMPOSSIBLE: the checked-out production source changed during the isolated proof',
			);
		}
		if (mutatedResult.error) {
			throw new Error(
				`MESURE IMPOSSIBLE: the real #258 product test could not start (${errorText(mutatedResult.error)})`,
			);
		}
		if (mutatedResult.status === null || mutatedResult.status === 124) {
			throw new Error(
				'MESURE IMPOSSIBLE: the bounded real #258 product test did not return a measured test status',
			);
		}

		const output = `${mutatedResult.stdout}\n${mutatedResult.stderr}`;
		if (
			!output.includes(PRODUCT_TEST_FILE) ||
			!output.includes(PRODUCT_TEST_GREP) ||
			!output.includes(ALL_DELETED_TITLE)
		) {
			throw new Error(
				'MESURE IMPOSSIBLE: the mutated failure did not reach the real #258 all-deleted product assertion',
			);
		}

		// Kept-red assertion: with the temporary production mutation, the real
		// product test must fail. A pass means the route no longer distinguishes
		// all-deleted organizations from a generic empty state.
		expect(mutatedResult.status).toBe(0);
	},
);
