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
		return match ? Number(match[1]) : 0;
	};

	const computeMatches = (query: string): boolean =>
		window.innerWidth >= parseMinWidth(query);

	const registry = new Map<
		string,
		{ listeners: Set<() => void>; lastMatches: boolean }
	>();

	window.addEventListener('resize', () => {
		for (const [query, entry] of registry) {
			const matches = computeMatches(query);
			if (matches !== entry.lastMatches) {
				entry.lastMatches = matches;
				for (const listener of entry.listeners) {
					listener();
				}
			}
		}
	});

	window.matchMedia = ((query: string): MediaQueryList => {
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
			onchange: null,
			addEventListener: (_type: 'change', listener: () => void) => {
				entry?.listeners.add(listener);
			},
			removeEventListener: (_type: 'change', listener: () => void) => {
				entry?.listeners.delete(listener);
			},
			addListener: () => {},
			removeListener: () => {},
			dispatchEvent: () => false,
		} as unknown as MediaQueryList;
	}) as typeof window.matchMedia;
}
