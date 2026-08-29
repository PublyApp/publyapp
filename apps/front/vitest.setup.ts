import { configure } from '@testing-library/react';

/**
 * `waitFor`/`findBy*` default to a 1000ms timeout. Under vitest's file-level
 * parallelism (up to CPU-core-many worker processes contending for the host),
 * that budget is tight enough to flake on ordinary async assertions — not
 * just ones rendering unusually large fixtures — once enough other test
 * files are running concurrently (see W6-FLAKE). This raises the shared
 * budget suite-wide instead of patching individual call sites: a genuine
 * regression still fails the assertion, just with more headroom for a
 * still-resolving re-render to catch up under load.
 */
configure({ asyncUtilTimeout: 25000 });

/**
 * `DataTable` derives its responsive breakpoints from `window.matchMedia`
 * (review-r3-shell.md F7), not from `window.innerWidth` + a raw `resize`
 * listener — jsdom (the `environment: 'jsdom'` test files) doesn't
 * implement `matchMedia` at all, so any test rendering a table with
 * `hideBelow`/`pinWidthAbove` columns would otherwise crash. This installs
 * a minimal polyfill, driven off `window.innerWidth`, so every existing
 * test's `Object.defineProperty(window, 'innerWidth', …)` +
 * `fireEvent(window, new Event('resize'))` pattern keeps working unchanged
 * — `change` only fires for a query whose `matches` actually flipped,
 * mirroring real browser behaviour (and proving F7's "only re-render on an
 * actual breakpoint crossing" fix).
 *
 * No-ops under the `environment: 'node'` test files (no `window` global
 * there), and never overrides a test's own `vi.stubGlobal('matchMedia', …)`
 * — `vi.unstubAllGlobals()` restores to this polyfill, not to `undefined`.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	const parseMinWidth = (query: string): number => {
		const match = /min-width:\s*(\d+)px/.exec(query);
		if (match) {
			return Number(match[1]);
		}
		return 0;
	};

	const computeMatches = (query: string): boolean =>
		window.innerWidth >= parseMinWidth(query);

	const registry = new Map<
		string,
		{
			listeners: Set<(event: Event) => void>;
			lastMatches: boolean;
		}
	>();

	window.addEventListener('resize', () => {
		for (const [query, entry] of registry) {
			const matches = computeMatches(query);
			if (matches !== entry.lastMatches) {
				entry.lastMatches = matches;
				for (const listener of entry.listeners) {
					listener(new Event('change'));
				}
			}
		}
	});

	window.matchMedia = ((query: string) => {
		if (!registry.has(query)) {
			registry.set(query, {
				listeners: new Set(),
				lastMatches: computeMatches(query),
			});
		}
		const entry = registry.get(query);

		return {
			media: query,
			get matches() {
				return computeMatches(query);
			},
			onchange: null as MediaQueryList['onchange'],
			addEventListener: (type: string, listener: (event: Event) => void) => {
				if (type === 'change') {
					entry?.listeners.add(listener);
				}
			},
			removeEventListener: (type: string, listener: (event: Event) => void) => {
				if (type === 'change') {
					entry?.listeners.delete(listener);
				}
			},
			dispatchEvent: (): boolean => false,
		};
	}) as typeof window.matchMedia;
}
