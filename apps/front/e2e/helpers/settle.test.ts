import { describe, expect, test } from 'vitest';

import { waitForValueToSettle } from './settle';

const sequence = <T>(values: T[]) => {
	let index = 0;
	return () => {
		const value = values[Math.min(index, values.length - 1)] as T;
		index += 1;
		return Promise.resolve(value);
	};
};

// Generous budget: a descheduled vitest worker must not trip the deadline.
const FAST = { pollIntervalMs: 1, timeoutMs: 30_000 };

describe('waitForValueToSettle', () => {
	test('skips a value that changes mid-way and returns the final one', async () => {
		// The footer grows 174 -> 198 when the late limit counter mounts (#2279).
		const read = sequence([150, 174, 174, 198, 198, 198, 198]);
		const settled = await waitForValueToSettle(read, (a, b) => a === b, {
			...FAST,
			requiredStableSamples: 3,
		});
		expect(settled).toBe(198);
	});

	test('rejects with a clear message when the value never stops changing', async () => {
		let n = 0;
		await expect(
			waitForValueToSettle(
				() => Promise.resolve(n++),
				(a, b) => a === b,
				{ pollIntervalMs: 1, timeoutMs: 30 },
			),
		).rejects.toThrow('did not settle within 30ms');
	});

	test('bounds a read that never resolves by the timeout', async () => {
		await expect(
			waitForValueToSettle(
				() => new Promise<number>(() => {}),
				(a, b) => a === b,
				{ pollIntervalMs: 1, timeoutMs: 50 },
			),
		).rejects.toThrow('did not settle within 50ms');
	});
});
