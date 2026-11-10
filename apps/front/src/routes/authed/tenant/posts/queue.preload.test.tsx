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
import { Route as QueueRoute } from '~/routes/authed/tenant/posts/queue';

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

const LINK_LABEL = 'open queue';
const SCHEDULED = ['posts', 'publications', 'get'] as const;
const NOON = new Date('2026-11-10T12:00:10.000Z');

const destination = widenOptions<PreloadDestination>({
	linkTo: '/tenant/posts/queue',
	path: '/tenant/posts/queue',
	options: QueueRoute.options,
});

describe('#2340 tenant queue route preload', () => {
	afterEach(() => {
		vi.useRealTimers();
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the first page of the queue once, with its statuses, size and window, and the click reuses it a moment later', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOON);
		await expectWarmPickerHoverThenClick({
			destination,
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-posts-queue-page',
			endpoints: [SCHEDULED],
			respond: mocks.respond,
			assertRequests: () => {
				expect(requestTenantIds(mocks.respond, ...SCHEDULED)).toEqual([
					TENANT_ID,
				]);
				expect(requestQueryParameters(mocks.respond, ...SCHEDULED)).toEqual([
					{
						from: '2026-11-09T12:00:00.000Z',
						to: '2026-12-11T12:00:00.000Z',
						status: 'scheduled,in_progress,paused',
						cursor: undefined,
						limit: '20',
					},
				]);
				// The page mounts a moment after the hover: both build the same window.
				vi.setSystemTime(new Date(NOON.valueOf() + 250));
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
