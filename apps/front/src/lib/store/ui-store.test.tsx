/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import {
	resetCookieConsentStoreForTests,
	useCookieConsentStore,
} from './cookie-consent-store';
import { useUiStore } from './ui-store';

beforeEach(() => {
	useUiStore.setState({ colorScheme: 'light', sidebarOpen: true });
	resetCookieConsentStoreForTests();
});

afterEach(cleanup);

/**
 * Selector-stability contract pinned during the zustand 4→5 migration
 * (#1378).
 *
 * v5 selectors are compared with `Object.is` and their output must be a
 * STABLE reference across calls while the underlying state is unchanged
 * (React's `useSyncExternalStore` snapshot contract). A selector that
 * creates a fresh object/array per call is a render-loop hazard under v5:
 * it must go through `useShallow` (or return a stored reference directly).
 * These tests keep that idiom executable instead of tribal knowledge.
 */
describe('zustand selector stability', () => {
	test('an object-returning selector does not re-render on unrelated state changes', () => {
		let renderCount = 0;

		const SidebarProbe = () => {
			renderCount += 1;
			const { sidebarOpen } = useUiStore((state) => ({
				sidebarOpen: state.sidebarOpen,
			}));
			return <div data-testid="sidebar-probe">{String(sidebarOpen)}</div>;
		};

		render(<SidebarProbe />);
		expect(renderCount).toBe(1);

		// Unrelated slice changes: the probe selected only `sidebarOpen`,
		// so it must not re-render.
		act(() => {
			useUiStore.setState({ colorScheme: 'dark' });
		});
		expect(renderCount).toBe(1);

		act(() => {
			useUiStore.setState({ sidebarOpen: false });
		});
		expect(renderCount).toBe(2);
		expect(useUiStore.getState().sidebarOpen).toBe(false);
	});

	test('a stored-reference object selector does not re-render on unrelated state changes', () => {
		let renderCount = 0;

		const ConsentProbe = () => {
			renderCount += 1;
			// Property access on the state object: the returned reference is
			// stable until an action replaces `consent` via `set()`.
			const consent = useCookieConsentStore((state) => state.consent);
			return (
				<div data-testid="consent-probe">{String(consent.functional)}</div>
			);
		};

		render(<ConsentProbe />);
		expect(renderCount).toBe(1);

		act(() => {
			useCookieConsentStore.setState({ isHydrated: true });
		});
		expect(renderCount).toBe(1);

		act(() => {
			useCookieConsentStore.getState().acceptAll();
		});
		expect(renderCount).toBe(2);
		expect(useCookieConsentStore.getState().hasDecision).toBe(true);
	});
});
