/**
 * Lookup maps for mocked `t()` functions in tests. These are intentionally
 * open dictionaries: the keys under test arrive as plain `string` (they are
 * i18n keys, not a closed union), so a literal-keyed record type would force
 * every call site into casts while adding no real guarantee.
 *
 * Declared as interfaces with index signatures — a named owner contract —
 * rather than anonymous `Record<string, …>` annotations, which the
 * `no-known-value-widening` anti-slop rule rejects on known literals.
 */
export interface TestLabelMap {
	[key: string]: string;
}

export interface TestLocaleLabelMap {
	[locale: string]: TestLabelMap;
}

export interface TestStringArrayMap {
	[key: string]: string[];
}
