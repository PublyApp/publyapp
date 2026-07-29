import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createDebouncer } from './debouncer';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('createDebouncer', () => {
	test('fires after the configured delay', () => {
		const debouncer = createDebouncer(300);
		const run = vi.fn();

		debouncer.schedule(run);
		vi.advanceTimersByTime(299);
		expect(run).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(run).toHaveBeenCalledTimes(1);
	});

	test('rescheduling before the delay elapses cancels the previous run', () => {
		const debouncer = createDebouncer(300);
		const first = vi.fn();
		const second = vi.fn();

		debouncer.schedule(first);
		vi.advanceTimersByTime(200);
		debouncer.schedule(second);
		vi.advanceTimersByTime(299);
		expect(second).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	test('cancel drops a pending run', () => {
		const debouncer = createDebouncer(300);
		const run = vi.fn();

		debouncer.schedule(run);
		debouncer.cancel();
		vi.advanceTimersByTime(1000);

		expect(run).not.toHaveBeenCalled();
	});

	test('cancel is a no-op when nothing is scheduled', () => {
		const debouncer = createDebouncer(300);
		expect(() => debouncer.cancel()).not.toThrow();
	});
});
