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
import { Route as EditRoute } from '~/routes/authed/tenant/posts/$postId/edit';

import {
	TENANT_ID,
	expectColdPickerHoverWarmsNothing,
	expectWarmPickerHoverThenClick,
	requestTenantIds,
} from '../../_preload-test-support';

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

const LINK_LABEL = 'open post';
const DETAILS = ['posts', 'byPostId', 'get'] as const;
const PROJECTS = ['projects', 'get'] as const;
const PUBLISH_TARGETS = ['publishing', 'publishTargets', 'get'] as const;
const POST_PUBLICATIONS = ['posts', 'byPostId', 'publications', 'get'] as const;
const PERMISSIONS = ['auth', 'scopeAuthData', 'get'] as const;

const destination = widenOptions<PreloadDestination>({
	linkTo: '/tenant/posts/post-42/edit',
	path: '/tenant/posts/$postId/edit',
	options: EditRoute.options,
});

describe('#2340 tenant post edit route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the post, the projects, the targets, the publications of the post and the permissions once, and the click reuses them', async () => {
		mocks.respond.mockImplementation((call: FakeClientCall): FakeResponse =>
			call.path.includes('byPostId') && !call.path.includes('publications')
				? { id: 'post-42', body: 'Hello' }
				: {},
		);
		await expectWarmPickerHoverThenClick({
			destination,
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-post-edit-page',
			endpoints: [
				DETAILS,
				PROJECTS,
				PUBLISH_TARGETS,
				POST_PUBLICATIONS,
				PERMISSIONS,
			],
			respond: mocks.respond,
			assertRequests: () => {
				for (const endpoint of [
					DETAILS,
					PROJECTS,
					PUBLISH_TARGETS,
					POST_PUBLICATIONS,
				]) {
					expect(requestTenantIds(mocks.respond, ...endpoint)).toEqual([
						TENANT_ID,
					]);
				}
				// The post id is not visible on the fake path: a loader that warmed another
				// id leaves the page's own details key cold, so the click fetches again and
				// the once-per-endpoint check below fails.
				expect(requestQueryParameters(mocks.respond, ...PERMISSIONS)).toEqual([
					{ scope: TENANT_ID },
				]);
			},
		});
	});

	test('hovering before the picker has loaded warms nothing and raises no error', async () => {
		await expectColdPickerHoverWarmsNothing({
			destination,
			linkLabel: LINK_LABEL,
			respond: mocks.respond,
		});
	});
});
