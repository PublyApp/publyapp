import { afterEach, describe, expect, test, vi } from 'vitest';

import {
	SESSION_VALIDATION_TIMEOUT_MS,
	withSessionValidationTimeout,
} from './session-validation';

type TrackedValidation = {
	activeRequests: () => number;
	completeLatest: (value: string) => void;
	startedRequests: () => number;
	validate: (signal: AbortSignal) => Promise<string>;
};

const createTrackedValidation = (): TrackedValidation => {
	let activeRequests = 0;
	let startedRequests = 0;
	const completions: Array<(value: string) => void> = [];

	return {
		activeRequests: () => activeRequests,
		completeLatest: (value) => {
			const complete = completions.at(-1);
			if (!complete) {
				throw new Error('No validation request is active');
			}

			complete(value);
		},
		startedRequests: () => startedRequests,
		validate: (signal) =>
			new Promise<string>((resolve, reject) => {
				startedRequests += 1;
				activeRequests += 1;
				let isSettled = false;

				const settle = (callback: () => void) => {
					if (isSettled) {
						return;
					}

					isSettled = true;
					activeRequests -= 1;
					signal.removeEventListener('abort', onAbort);
					callback();
				};
				const onAbort = () => {
					settle(() => reject(signal.reason));
				};

				signal.addEventListener('abort', onAbort, { once: true });
				completions.push((value) => {
					settle(() => resolve(value));
				});
			}),
	};
};

afterEach(() => {
	vi.useRealTimers();
});

describe('withSessionValidationTimeout', () => {
	test('lets a slow working validation finish before the generous deadline', async () => {
		vi.useFakeTimers();
		const validation = (_signal: AbortSignal) =>
			new Promise<string>((resolve) => {
				setTimeout(() => resolve('staff'), SESSION_VALIDATION_TIMEOUT_MS - 1);
			});

		const result = withSessionValidationTimeout(validation);

		await vi.advanceTimersByTimeAsync(SESSION_VALIDATION_TIMEOUT_MS - 1);
		await expect(result).resolves.toBe('staff');
	});

	test('rejects a validation that never settles once the deadline is reached', async () => {
		vi.useFakeTimers();
		const validation = (_signal: AbortSignal) =>
			new Promise<string>(() => undefined);

		const result = withSessionValidationTimeout(validation);
		const rejection = expect(result).rejects.toThrow(
			'Session validation timed out',
		);

		await vi.advanceTimersByTimeAsync(SESSION_VALIDATION_TIMEOUT_MS);
		await rejection;
	});

	test('aborts a timed-out request before a retry starts so requests never stack', async () => {
		vi.useFakeTimers();
		const tracked = createTrackedValidation();

		const firstAttempt = withSessionValidationTimeout(tracked.validate);
		const firstRejection = expect(firstAttempt).rejects.toThrow(
			'Session validation timed out',
		);

		expect(tracked.startedRequests()).toBe(1);
		expect(tracked.activeRequests()).toBe(1);
		await vi.advanceTimersByTimeAsync(SESSION_VALIDATION_TIMEOUT_MS);
		await firstRejection;
		expect(tracked.startedRequests()).toBe(1);
		expect(tracked.activeRequests()).toBe(0);

		const retryAttempt = withSessionValidationTimeout(tracked.validate);
		expect(tracked.startedRequests()).toBe(2);
		expect(tracked.activeRequests()).toBe(1);

		tracked.completeLatest('staff');
		await expect(retryAttempt).resolves.toBe('staff');
		expect(tracked.startedRequests()).toBe(2);
		expect(tracked.activeRequests()).toBe(0);
	});

	test('aborts the underlying request when the caller cancels the attempt', async () => {
		const tracked = createTrackedValidation();
		const caller = new AbortController();
		const abortReason = new DOMException(
			'Session validation superseded',
			'AbortError',
		);

		const result = withSessionValidationTimeout(
			tracked.validate,
			caller.signal,
		);
		expect(tracked.activeRequests()).toBe(1);

		caller.abort(abortReason);

		await expect(result).rejects.toBe(abortReason);
		expect(tracked.startedRequests()).toBe(1);
		expect(tracked.activeRequests()).toBe(0);
	});
});
