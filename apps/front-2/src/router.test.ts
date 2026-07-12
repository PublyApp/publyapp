import { describe, expect, test } from 'vitest';

import { getRouter } from './router';

describe('getRouter', () => {
	test('the QueryClient defaults to a non-zero staleTime so a tab refocus does not stampede every mounted query', () => {
		const router = getRouter();
		const { staleTime } = router.options.context.queryClient.getDefaultOptions()
			.queries as { staleTime?: number };

		expect(staleTime).toBeGreaterThan(0);
	});
});
