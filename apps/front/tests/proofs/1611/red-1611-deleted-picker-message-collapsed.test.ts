import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, test } from 'vitest';

/**
 * KEPT RED PROOF — issue #1611.
 *
 * This proof mutates the production picker source, builds the real front
 * runtime, and replays the real tagged Playwright journey against that fresh
 * runtime. The mutation makes the all-deleted branch use the generic empty
 * state, so the journey must fail its visible all-deleted assertions. The
 * source is restored in `finally` and the same journey is replayed green.
 *
 * No response, component, i18n module, or browser page is injected here: the
 * child is `run-e2e-front.mts`, which builds the Docker image and runs
 * `e2e/tenant-portal-picker.spec.ts --grep @1611 --project chromium`.
 *
 * Replay directly (this intentionally ends red on the final kept-red
 * assertion when the production source is correct; Docker is required):
 *
 *   cd apps/front && pnpm exec vitest run --config vitest.proofs.config.ts \
 *     tests/proofs/1611/red-1611-deleted-picker-message-collapsed.test.ts
 */

const FRONT_ROOT = process.cwd();
const REPO_ROOT = resolve(FRONT_ROOT, '..', '..');
const PICKER_STATES_PATH = resolve(
	FRONT_ROOT,
	'src/routes/authed/tenant/_tenant-picker-states.tsx',
);
const E2E_RUNNER_PATH = resolve(
	REPO_ROOT,
	'apps/front/scripts/run-e2e-front.mts',
);
const MUTATION_FROM = 'if (hasDeletedTenants) {';
const MUTATION_TO = 'if (false) {';
const PLAYWRIGHT_SPEC = 'e2e/tenant-portal-picker.spec.ts';
const PLAYWRIGHT_GREP = '@1611';
const PLAYWRIGHT_PROJECT = 'chromium';

type JourneyResult = {
	status: number | null;
	stdout: string;
	stderr: string;
	error?: Error;
};

const errorText = (error: unknown): string =>
	error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const runRealPickerJourney = (): JourneyResult => {
	const result = spawnSync(process.execPath, [E2E_RUNNER_PATH], {
		cwd: REPO_ROOT,
		env: {
			...process.env,
			E2E_PLAYWRIGHT_SPEC: PLAYWRIGHT_SPEC,
			E2E_PLAYWRIGHT_GREP: PLAYWRIGHT_GREP,
			E2E_PLAYWRIGHT_PROJECT: PLAYWRIGHT_PROJECT,
		},
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024,
	});

	return {
		status: result.status,
		stdout: typeof result.stdout === 'string' ? result.stdout : '',
		stderr: typeof result.stderr === 'string' ? result.stderr : '',
		error: result.error,
	};
};

test(
	'the real @1611 Playwright journey rejects collapsed all-deleted copy',
	{ timeout: 240_000 },
	() => {
		const original = readFileSync(PICKER_STATES_PATH, 'utf8');
		if (!original.includes(MUTATION_FROM)) {
			throw new Error(
				'MESURE IMPOSSIBLE: the all-deleted branch marker was not found; the proof mutation no longer targets the live production source',
			);
		}

		const mutatedSource = original.replace(MUTATION_FROM, MUTATION_TO);
		if (mutatedSource === original) {
			throw new Error(
				'MESURE IMPOSSIBLE: the production source mutation did not change the source',
			);
		}

		let mutatedResult: JourneyResult | undefined;
		let restoredResult: JourneyResult | undefined;
		try {
			writeFileSync(PICKER_STATES_PATH, mutatedSource, 'utf8');
			mutatedResult = runRealPickerJourney();
		} finally {
			writeFileSync(PICKER_STATES_PATH, original, 'utf8');
			restoredResult = runRealPickerJourney();
		}

		if (mutatedResult === undefined || mutatedResult.error) {
			throw new Error(
				`MESURE IMPOSSIBLE: the mutated real @1611 Playwright journey could not start (${errorText(mutatedResult?.error)})`,
			);
		}
		if (mutatedResult.status === null) {
			throw new Error(
				'MESURE IMPOSSIBLE: the mutated real @1611 Playwright journey exited without a status',
			);
		}
		if (
			restoredResult === undefined ||
			restoredResult.error ||
			restoredResult.status !== 0
		) {
			throw new Error(
				`MESURE IMPOSSIBLE: the restored real @1611 Playwright journey did not pass (${errorText(restoredResult?.error)})`,
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

		// Kept-red assertion: the source-backed real journey must fail under the
		// temporary production mutation. A pass means the journey no longer
		// distinguishes all-deleted organizations from a generic empty state.
		expect(mutatedResult.status).toBe(0);
	},
);
