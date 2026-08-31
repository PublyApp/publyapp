import { expect, test, vi } from 'vitest';

const { warnSpy } = vi.hoisted(() => {
	const warnSpy = vi.fn();
	return { warnSpy };
});

vi.mock('@org/shared-ts/lib/logger/iso-logger', () => ({
	logger: {
		warn: (...args: unknown[]) => warnSpy(...args),
		info: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

import { retry } from './retry-fn';

test('retry throws RangeError for non-integer attempts (2.5)', async () => {
	const fn = vi.fn().mockRejectedValue(new Error('boom'));

	await expect(retry({ fn, attempts: 2.5, delay: 1 })).rejects.toThrow(
		RangeError,
	);

	expect(fn).not.toHaveBeenCalled();
});

test('retry throws RangeError for negative attempts (-1)', async () => {
	const fn = vi.fn().mockRejectedValue(new Error('boom'));

	await expect(retry({ fn, attempts: -1, delay: 1 })).rejects.toThrow(
		RangeError,
	);

	expect(fn).not.toHaveBeenCalled();
});

test('retry succeeds on first attempt without retrying', async () => {
	const fn = vi.fn().mockResolvedValue('ok');

	const result = await retry({ fn, attempts: 3, delay: 1 });

	expect(result).toBe('ok');
	expect(fn).toHaveBeenCalledTimes(1);
});

test('retry exhausts attempts and throws last error', async () => {
	const error = new Error('persistent failure');
	const fn = vi.fn().mockRejectedValue(error);

	await expect(retry({ fn, attempts: 2, delay: 1 })).rejects.toThrow(
		'persistent failure',
	);

	// attempts=2 means: 2 total calls (1 initial + 1 retry)
	expect(fn).toHaveBeenCalledTimes(2);
});

test('retry with attempts: 0 should call fn exactly once then throw on error', async () => {
	const error = new Error('boom');
	const fn = vi.fn().mockRejectedValue(error);

	await expect(retry({ fn, attempts: 0, delay: 1 })).rejects.toThrow('boom');

	// attempts=0 should mean: exactly 1 call (the initial call, no retries)
	expect(fn).toHaveBeenCalledTimes(1);
});

// --- Pin call counts for attempts >= 3 (#1951 follow-up, part of #1883) ---
// The contract is max(1, attempts). These tests pin the exact total call count
// for attempts=3, 4, and 5 so a decrement-step mutation (one fewer call than
// expected) is caught rather than masked by the attempts:0 or attempts:2 tests.

test('retry with attempts: 3 calls fn exactly 3 times (1 initial + 2 retries)', async () => {
	const fn = vi.fn().mockRejectedValue(new Error('fail'));

	await expect(retry({ fn, attempts: 3, delay: 1 })).rejects.toThrow('fail');

	expect(fn).toHaveBeenCalledTimes(3);
});

test('retry with attempts: 4 calls fn exactly 4 times (1 initial + 3 retries)', async () => {
	const fn = vi.fn().mockRejectedValue(new Error('fail'));

	await expect(retry({ fn, attempts: 4, delay: 1 })).rejects.toThrow('fail');

	expect(fn).toHaveBeenCalledTimes(4);
});

test('retry with attempts: 5 calls fn exactly 5 times (1 initial + 4 retries)', async () => {
	const fn = vi.fn().mockRejectedValue(new Error('fail'));

	await expect(retry({ fn, attempts: 5, delay: 1 })).rejects.toThrow('fail');

	expect(fn).toHaveBeenCalledTimes(5);
});
