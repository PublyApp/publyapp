// Fixture for route-loader-query-key-guard.test.ts (#2340): an imported helper
// that warms a cache entry behind the guard's back.
export const warmElsewhere = (_queryClient: unknown): Promise<void> =>
	Promise.resolve();
