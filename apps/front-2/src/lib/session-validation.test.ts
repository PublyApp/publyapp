import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	SESSION_VALIDATION_TIMEOUT_MS,
	withSessionValidationTimeout,
} from './session-validation';

afterEach(() => {
	vi.useRealTimers();
});

describe('withSessionValidationTimeout', () => {
	test('lets a slow working validation finish before the generous deadline', async () => {
		vi.useFakeTimers();
		const validation = new Promise<string>((resolve) => {
			setTimeout(() => resolve('staff'), SESSION_VALIDATION_TIMEOUT_MS - 1);
		});

		const result = withSessionValidationTimeout(validation);

		await vi.advanceTimersByTimeAsync(SESSION_VALIDATION_TIMEOUT_MS - 1);
		await expect(result).resolves.toBe('staff');
	});

	test('rejects a validation that never settles once the deadline is reached', async () => {
		vi.useFakeTimers();
		const validation = new Promise<string>(() => undefined);

		const result = withSessionValidationTimeout(validation);
		const rejection = expect(result).rejects.toThrow(
			'Session validation timed out',
		);

		await vi.advanceTimersByTimeAsync(SESSION_VALIDATION_TIMEOUT_MS);
		await rejection;
	});
});
