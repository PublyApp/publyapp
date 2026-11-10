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
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as ProfileRoute } from '~/routes/authed/tenant/account/profile';

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

const LINK_LABEL = 'open profile';
const PROFILE = ['account', 'profile', 'get'] as const;

const destination = widenOptions<PreloadDestination>({
	linkTo: '/tenant/account',
	path: '/tenant/account',
	options: ProfileRoute.options,
});

describe('#2340 tenant account profile route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the profile once, scoped to the resolved tenant, and the click reuses it', async () => {
		await expectWarmPickerHoverThenClick({
			destination,
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-account-profile-page',
			endpoints: [PROFILE],
			respond: mocks.respond,
			assertRequests: () => {
				expect(requestTenantIds(mocks.respond, ...PROFILE)).toEqual([
					TENANT_ID,
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
