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
import { Route as DraftsRoute } from '~/routes/authed/tenant/posts/drafts';

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

const LINK_LABEL = 'open drafts';
const POSTS = ['posts', 'get'] as const;
const PROJECTS = ['projects', 'get'] as const;
const PUBLISH_TARGETS = ['publishing', 'publishTargets', 'get'] as const;
const PERMISSIONS = ['auth', 'scopeAuthData', 'get'] as const;

const buildDestination = (linkSearch?: Record<string, string>) =>
	widenOptions<PreloadDestination>({
		linkTo: '/tenant/posts/drafts',
		linkSearch,
		path: '/tenant/posts/drafts',
		options: DraftsRoute.options,
	});

describe('#2340 tenant drafts route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the posts, the projects and the publish targets once, scoped to the resolved tenant, and the click reuses them', async () => {
		await expectWarmPickerHoverThenClick({
			destination: buildDestination(),
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-posts-drafts-page',
			endpoints: [POSTS, PROJECTS, PUBLISH_TARGETS],
			respond: mocks.respond,
			assertRequests: () => {
				for (const endpoint of [POSTS, PROJECTS, PUBLISH_TARGETS]) {
					expect(requestTenantIds(mocks.respond, ...endpoint)).toEqual([
						TENANT_ID,
					]);
				}
				// The create drawer's permission gate mounts only once it opens.
				expect(requestTenantIds(mocks.respond, ...PERMISSIONS)).toEqual([]);
			},
		});
	});

	test('the search, sort and size in the URL reach the request on hover, and the click reuses the warmed key', async () => {
		await expectWarmPickerHoverThenClick({
			destination: buildDestination({
				q: 'vanilla',
				sort_id: 'created_at',
				sort_order: 'asc',
				size: '50',
			}),
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-posts-drafts-page',
			endpoints: [POSTS, PROJECTS, PUBLISH_TARGETS],
			respond: mocks.respond,
			assertRequests: () => {
				expect(requestQueryParameters(mocks.respond, ...POSTS)).toEqual([
					expect.objectContaining({
						q: 'vanilla',
						sortId: 'created_at',
						sortOrder: 'asc',
						limit: '50',
					}),
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
