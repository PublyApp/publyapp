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
import { Route as CalendarRoute } from '~/routes/authed/tenant/posts/calendar';

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

const LINK_LABEL = 'open calendar';
const SCHEDULED = ['posts', 'publications', 'get'] as const;

const destination = widenOptions<PreloadDestination>({
	linkTo: '/tenant/posts/',
	path: '/tenant/posts/',
	options: CalendarRoute.options,
});

describe('#2340 tenant calendar route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the first page of the month once, with its window and size, and the click reuses the infinite walk', async () => {
		await expectWarmPickerHoverThenClick({
			destination,
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-posts-calendar-page',
			endpoints: [SCHEDULED],
			respond: mocks.respond,
			assertRequests: () => {
				expect(requestTenantIds(mocks.respond, ...SCHEDULED)).toEqual([
					TENANT_ID,
				]);
				const now = new Date();
				const [parameters] = requestQueryParameters(
					mocks.respond,
					...SCHEDULED,
				);
				expect(parameters).toEqual({
					from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
					to: new Date(
						now.getFullYear(),
						now.getMonth() + 1,
						1,
						0,
						0,
						0,
						-1,
					).toISOString(),
					status: undefined,
					cursor: undefined,
					limit: '100',
				});
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
