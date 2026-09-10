import { describe, expect, test, vi } from 'vitest';

import {
	subscribeToSessionInvalidated,
	triggerSessionInvalidated,
} from './session-invalidation-channel';

describe('session-invalidation-channel', () => {
	test('notifies every subscribed listener when triggered', () => {
		const listenerA = vi.fn();
		const listenerB = vi.fn();
		subscribeToSessionInvalidated(listenerA);
		subscribeToSessionInvalidated(listenerB);

		triggerSessionInvalidated();

		expect(listenerA).toHaveBeenCalledTimes(1);
		expect(listenerB).toHaveBeenCalledTimes(1);
	});

	test('stops notifying a listener after it unsubscribes', () => {
		const listener = vi.fn();
		const unsubscribe = subscribeToSessionInvalidated(listener);

		unsubscribe();
		triggerSessionInvalidated();

		expect(listener).not.toHaveBeenCalled();
	});

	test('does nothing when there are no subscribers', () => {
		expect(() => triggerSessionInvalidated()).not.toThrow();
	});
});
