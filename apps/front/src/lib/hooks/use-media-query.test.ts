// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { useMediaQuery } from './use-media-query';

// react-dom's `act` expects this flag when there's no test-runner integration
// (e.g. @testing-library/react) declaring the environment for it.
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

class FakeMediaQueryList {
	matches: boolean;
	readonly media: string;
	private readonly listeners = new Set<() => void>();
	addEventListenerCallCount = 0;
	removeEventListenerCallCount = 0;

	constructor(media: string, matches: boolean) {
		this.media = media;
		this.matches = matches;
	}

	addEventListener(_type: 'change', listener: () => void): void {
		this.addEventListenerCallCount += 1;
		this.listeners.add(listener);
	}

	removeEventListener(_type: 'change', listener: () => void): void {
		this.removeEventListenerCallCount += 1;
		this.listeners.delete(listener);
	}

	setMatches(matches: boolean): void {
		this.matches = matches;
		for (const listener of this.listeners) {
			listener();
		}
	}

	listenerCount(): number {
		return this.listeners.size;
	}
}

const mountedRoots: Root[] = [];

afterEach(() => {
	for (const root of mountedRoots.splice(0)) {
		act(() => {
			root.unmount();
		});
	}
});

let mql: FakeMediaQueryList;

beforeEach(() => {
	mql = new FakeMediaQueryList('(min-width: 1024px)', true);
	// Real browsers return distinct MediaQueryList objects per call but keep
	// `matches` consistent for a given query (it's a live read against the
	// viewport). Returning the same fake instance for every call reproduces
	// that consistency without modelling per-query caching.
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => mql),
	);
});

const renderUseMediaQuery = (query: string) => {
	let latest: boolean | undefined;

	const Probe = (): null => {
		latest = useMediaQuery(query);
		return null;
	};

	const container = document.createElement('div');
	const root = createRoot(container);
	mountedRoots.push(root);

	act(() => {
		root.render(createElement(Probe));
	});

	return {
		result: () => {
			if (latest === undefined) {
				throw new Error('useMediaQuery did not render');
			}
			return latest;
		},
	};
};

describe('useMediaQuery', () => {
	test('reflects the current match state from matchMedia', () => {
		mql.setMatches(true);
		const { result } = renderUseMediaQuery('(min-width: 1024px)');
		expect(result()).toBe(true);
	});

	test('updates when the underlying media query list fires a change event', () => {
		mql.setMatches(false);
		const { result } = renderUseMediaQuery('(min-width: 1024px)');
		expect(result()).toBe(false);

		act(() => {
			mql.setMatches(true);
		});
		expect(result()).toBe(true);
	});

	test('removes its change listener on unmount', () => {
		const container = document.createElement('div');
		const root = createRoot(container);

		const Probe = (): null => {
			useMediaQuery('(min-width: 1024px)');
			return null;
		};

		act(() => {
			root.render(createElement(Probe));
		});
		expect(mql.listenerCount()).toBe(1);

		act(() => {
			root.unmount();
		});
		expect(mql.listenerCount()).toBe(0);
	});

	test('does not resubscribe on every re-render for the same query', () => {
		// A net listener count of 1 after a render is satisfied just as well
		// by "subscribe once" as by "unsubscribe then resubscribe every
		// render" — the two are indistinguishable by listener count alone.
		// Counting the raw addEventListener/removeEventListener calls across
		// multiple renders of the *same* mounted component tells them apart:
		// only the resubscribing version calls addEventListener more than
		// once.
		let renderCount = 0;
		const Probe = (): null => {
			renderCount += 1;
			useMediaQuery('(min-width: 1024px)');
			return null;
		};

		const container = document.createElement('div');
		const root = createRoot(container);
		mountedRoots.push(root);

		act(() => {
			root.render(createElement(Probe));
		});
		act(() => {
			// Re-renders the same mounted component in place (no unmount).
			root.render(createElement(Probe));
		});
		act(() => {
			root.render(createElement(Probe));
		});

		expect(renderCount).toBe(3);
		expect(mql.addEventListenerCallCount).toBe(1);
		expect(mql.removeEventListenerCallCount).toBe(0);
	});
});
