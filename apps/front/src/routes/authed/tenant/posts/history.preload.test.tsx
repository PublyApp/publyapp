/**
 * @vitest-environment jsdom
 */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type {
	FakeClientCall,
	FakeResponse,
} from '~/routes/authed/staff/_preload-test-harness';
import {
	type PreloadDestination,
	requestQueryParameters,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as HistoryRoute } from '~/routes/authed/tenant/posts/history';

import {
	TENANT_ID,
	expectColdPickerHoverWarmsNothing,
	expectWarmPickerHoverThenClick,
	requestTenantIds,
} from '../_preload-test-support';

const mocks = vi.hoisted(() => ({
	respond: vi.fn((_call: FakeClientCall): FakeResponse => ({})),
}));

vi.mock('~/lib/api-client/client-manager', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const { buildTenantClientManager } =
		await import('~/routes/authed/tenant/_preload-test-client');
	const manager = buildTenantClientManager(mocks.respond);

	return { ...actual, getClientManager: () => manager };
});

vi.mock('~/lib/hooks/use-logout', () => ({
	useLogout: () => ({ logout: vi.fn() }),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('react-i18next', async (importOriginal) => {
	const actual = await importOriginal<typeof import('react-i18next')>();

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
			i18n: { language: 'en' },
		}),
	};
});

const LINK_LABEL = 'open history';
const PUBLICATIONS = ['publishing', 'publications', 'get'] as const;
const PERMISSIONS = ['auth', 'scopeAuthData', 'get'] as const;

const buildDestination = (linkSearch?: Record<string, string>) =>
	widenOptions<PreloadDestination>({
		linkTo: '/tenant/posts/history',
		linkSearch,
		path: '/tenant/posts/history',
		options: HistoryRoute.options,
	});

describe('#2340 tenant history route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the publications and the permissions once and the click reuses them', async () => {
		await expectWarmPickerHoverThenClick({
			destination: buildDestination(),
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-posts-history-page',
			endpoints: [PUBLICATIONS, PERMISSIONS],
			respond: mocks.respond,
			assertRequests: () => {
				expect(requestTenantIds(mocks.respond, ...PUBLICATIONS)).toEqual([
					TENANT_ID,
				]);
				// The permissions request is session-scoped, not tenant-prefixed.
				expect(requestQueryParameters(mocks.respond, ...PERMISSIONS)).toEqual([
					{ scope: TENANT_ID },
				]);
			},
		});
	});

	test('the size in the URL reaches the request on hover, and a search and a sort keep the warmed key the page reads', async () => {
		await expectWarmPickerHoverThenClick({
			destination: buildDestination({
				q: 'launch',
				sort_id: 'updated_at',
				sort_order: 'asc',
				size: '50',
			}),
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-posts-history-page',
			endpoints: [PUBLICATIONS, PERMISSIONS],
			respond: mocks.respond,
			assertRequests: () => {
				expect(requestQueryParameters(mocks.respond, ...PUBLICATIONS)).toEqual([
					expect.objectContaining({ limit: '50' }),
				]);
			},
		});
	});

	test('hovering before the picker has loaded warms nothing and raises no error', async () => {
		await expectColdPickerHoverWarmsNothing({
			destination: buildDestination(),
			linkLabel: LINK_LABEL,
			respond: mocks.respond,
		});
	});
});
