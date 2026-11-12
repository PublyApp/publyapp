import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
	AttemptCancelledError,
	AttemptTimedOutError,
	createAttemptRegistry,
} from './_attempt';

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('createAttemptRegistry', () => {
	test('a new attempt supersedes the previous one', () => {
		const registry = createAttemptRegistry();
		const first = registry.begin();
		const second = registry.begin();

		expect(first.isCurrent()).toBe(false);
		expect(second.isCurrent()).toBe(true);
	});

	test('invalidate (close, unmount) supersedes the current attempt', () => {
		const registry = createAttemptRegistry();
		const attempt = registry.begin();

		registry.invalidate();

		expect(attempt.isCurrent()).toBe(false);
	});

	test('run resolves with the work while the attempt is current', async () => {
		const attempt = createAttemptRegistry().begin();

		await expect(attempt.run(Promise.resolve(7))).resolves.toBe(7);
	});

	test('run stops waiting as soon as the attempt is superseded', async () => {
		const registry = createAttemptRegistry();
		const attempt = registry.begin();
		const waiting = attempt.run(new Promise<number>(() => undefined));

		registry.invalidate();

		await expect(waiting).rejects.toBeInstanceOf(AttemptCancelledError);
	});

	test('run on an already superseded attempt rejects at once', async () => {
		const registry = createAttemptRegistry();
		const attempt = registry.begin();
		registry.invalidate();

		await expect(attempt.run(Promise.resolve(1))).rejects.toBeInstanceOf(
			AttemptCancelledError,
		);
	});

	test('no timer is left behind after resolve, reject, cancel or timeout', async () => {
		const registry = createAttemptRegistry(1000);
		const attempt = registry.begin();

		await attempt.run(Promise.resolve(1));
		expect(vi.getTimerCount()).toBe(0);

		await expect(attempt.run(Promise.reject(new Error('x')))).rejects.toThrow(
			'x',
		);
		expect(vi.getTimerCount()).toBe(0);

		const cancelled = attempt.run(new Promise<number>(() => undefined));
		const cancelledAssertion = expect(cancelled).rejects.toBeInstanceOf(
			AttemptCancelledError,
		);
		expect(vi.getTimerCount()).toBe(1);
		registry.invalidate();
		await cancelledAssertion;
		expect(vi.getTimerCount()).toBe(0);

		const timed = registry.begin().run(new Promise<number>(() => undefined));
		const timedAssertion =
			expect(timed).rejects.toBeInstanceOf(AttemptTimedOutError);
		await vi.advanceTimersByTimeAsync(1001);
		await timedAssertion;
		expect(vi.getTimerCount()).toBe(0);
	});

	test('run gives up after the time limit', async () => {
		const attempt = createAttemptRegistry(1000).begin();
		const waiting = attempt.run(new Promise<number>(() => undefined));
		const assertion =
			expect(waiting).rejects.toBeInstanceOf(AttemptTimedOutError);

		await vi.advanceTimersByTimeAsync(1001);

		await assertion;
	});
});
