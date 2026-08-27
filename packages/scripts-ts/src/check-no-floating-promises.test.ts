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
