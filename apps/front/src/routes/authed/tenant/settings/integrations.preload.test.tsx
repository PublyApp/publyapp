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
import { Route as IntegrationsRoute } from '~/routes/authed/tenant/settings/integrations';

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

const LINK_LABEL = 'open integrations';
const NEEDS_RECONNECT = [
	'socialAccounts',
	'needsReconnectAccounts',
	'get',
] as const;
const ACCOUNTS = ['socialAccounts', 'get'] as const;
const PROJECTS = ['projects', 'get'] as const;
const CAPABILITIES = ['publishing', 'capabilities', 'get'] as const;

const destination = widenOptions<PreloadDestination>({
	linkTo: '/tenant/settings/integrations',
	path: '/tenant/settings/integrations',
	options: IntegrationsRoute.options,
});

describe('#2340 tenant integrations route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with the workspace picker warm fetches the reconnect list, the accounts, the projects and the provider capabilities once, each scoped to the resolved tenant, and the click reuses them', async () => {
		await expectWarmPickerHoverThenClick({
			destination,
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-settings-integrations-page',
			endpoints: [NEEDS_RECONNECT, ACCOUNTS, PROJECTS, CAPABILITIES],
			respond: mocks.respond,
			assertRequests: () => {
				for (const endpoint of [
					NEEDS_RECONNECT,
					ACCOUNTS,
					PROJECTS,
					CAPABILITIES,
				]) {
					expect(requestTenantIds(mocks.respond, ...endpoint)).toEqual([
						TENANT_ID,
					]);
				}
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
