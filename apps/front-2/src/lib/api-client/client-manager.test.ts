import { describe, expect, test, vi } from 'vitest';

import { buildCustomFetch } from './client-manager';

describe('buildCustomFetch', () => {
	test('passes an attempt cancellation signal to the underlying request', async () => {
		const controller = new AbortController();
		let receivedSignal: AbortSignal | null | undefined;
		const fetchImpl = vi.fn(
			async (_input: RequestInfo | URL, init?: RequestInit) => {
				receivedSignal = init?.signal;
				return new Response(null, { status: 204 });
			},
		);
		const request = buildCustomFetch({
			apiBaseUrl: 'https://api.example.test',
			fetchImpl,
			getSessionToken: () => undefined,
			signal: controller.signal,
		});

		await request('/auth/redirect-code');

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(receivedSignal).toBe(controller.signal);
	});
});
