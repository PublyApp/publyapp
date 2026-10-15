/**
 * @vitest-environment jsdom
 */
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

type SearchMock = { code?: string; state?: string; error?: string };

const mocks = vi.hoisted(() => ({
	search: {} as SearchMock,
	navigate: vi.fn(),
	complete: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	useSearch: () => mocks.search,
	useNavigate: () => mocks.navigate,
}));
vi.mock('~/lib/query/mastodon-connect', () => ({
	useCompleteMastodonConnectMutation: () => ({
		mutateAsync: mocks.complete,
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { useMastodonCallback } from './_use-mastodon-callback';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.search = {};
});

describe('useMastodonCallback', () => {
	test('ItShouldCompleteTheConnectOnceAndClearTheQueryString', async () => {
		mocks.search = { code: 'c1', state: 's1' };
		mocks.complete.mockResolvedValue(undefined);

		const { rerender } = renderHook(() => useMastodonCallback('t1'));
		rerender();

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
		expect(mocks.complete).toHaveBeenCalledTimes(1);
		expect(mocks.complete).toHaveBeenCalledWith({
			tenantId: 't1',
			code: 'c1',
			state: 's1',
		});
		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({ search: {}, replace: true }),
		);
	});

	test('ItShouldStillClearTheQueryStringWhenTheCompletionFails', async () => {
		mocks.search = { code: 'c1', state: 'used' };
		mocks.complete.mockRejectedValue(new Error('invalid state'));

		renderHook(() => useMastodonCallback('t1'));

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
	});

	test('ItShouldOnlyClearWhenTheUserDeclinedOnTheInstance', async () => {
		mocks.search = { error: 'access_denied', state: 's1' };

		renderHook(() => useMastodonCallback('t1'));

		await waitFor(() => expect(mocks.navigate).toHaveBeenCalledTimes(1));
		expect(mocks.complete).not.toHaveBeenCalled();
	});

	test('ItShouldDoNothingWithoutACallbackOrBeforeTheTenantResolves', () => {
		renderHook(() => useMastodonCallback('t1'));
		mocks.search = { code: 'c1', state: 's1' };
		renderHook(() => useMastodonCallback(null));

		expect(mocks.complete).not.toHaveBeenCalled();
		expect(mocks.navigate).not.toHaveBeenCalled();
	});
});
