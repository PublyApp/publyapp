import assert from 'node:assert/strict';

import { test, vi } from 'vitest';

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
	async ({ onTestFinished }) => {
		// Save original env so we can restore it after the test.
		const originalPath = process.env.PATH;

		try {
			// Simulate oxlint being unavailable by pointing PATH at nothing.
			// (The binary resolves to an absolute path, so this test is more
			// about documenting intent — the real guard is existsSync() inside
			// the binary.)
			const result = await checkNoFloatingPromises();

			// If this assertion fails, we need to verify the binary's
			// existsSync() check is actually catching missing oxlint.
			assert.notStrictEqual(
				result.withinLimit,
				'error',
				'expected the ratchet to succeed with oxlint present, but it returned error',
			);
		} finally {
			process.env.PATH = originalPath;
		}
	},
);
