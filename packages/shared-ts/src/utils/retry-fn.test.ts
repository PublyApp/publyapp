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

	// attempts=2 means: initial call + 2 retries = 3 total
	expect(fn).toHaveBeenCalledTimes(3);
});
