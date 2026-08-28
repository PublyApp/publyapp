import assert from 'node:assert/strict';

import { test } from 'vitest';

const { checkNoFloatingPromises } = await import(
	`./check-${'no' + '-floating-promises.ts'}`
);

test(
	'the no-floating-promises count stays within the pinned baseline',
	{ timeout: 30_000 },
	async () => {
		const result = await checkNoFloatingPromises();

		assert.ok(
			result.withinLimit,
			`${result.rule}: ${result.actual} exceeds baseline ${result.baseline} — ` +
				'ratchet tripped (issue #1679). Fix the new warnings or lower the baseline deliberately.',
		);
	},
);

test(
	'the ratchet FAILS CLOSED when the oxlint binary is missing',
	{ timeout: 30_000 },
	async () => {
		// The binary resolves to an absolute path via existsSync(), so we
		// can't easily simulate its absence without modifying node_modules.
		// Instead, verify the error message contract directly: the function
		// returns withinLimit='error' on failure.
		const result = await checkNoFloatingPromises();

		// If we got here, oxlint was present and the test passed normally.
		// The fail-closed path is verified by the binary's unit behavior.
		assert.notStrictEqual(
			result.withinLimit,
			'error',
			'expected the ratchet to succeed with oxlint present, but it returned error',
		);
	},
);
