/**
 * @vitest-environment jsdom
 */
import { cleanup } from '@testing-library/react';
import { afterEach, describe, test, vi } from 'vitest';
import type {
	FakeClientCall,
	FakeResponse,
} from '~/routes/authed/staff/_preload-test-harness';
import {
	type PreloadDestination,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as PageRoute } from '~/routes/authed/tenant';

import {
	PICKER_RESPONSE,
	expectPickerOnlyHoverThenClick,
} from './_preload-test-support';

const mocks = vi.hoisted(() => ({
	respond: vi.fn((_call: FakeClientCall): FakeResponse => ({})),
}));

vi.mock('~/lib/api-client/client-manager', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const { buildTenantClientManager } =
		await import('~/routes/authed/tenant/_preload-test-client');
	const manager = buildTenantClientManager((call) => mocks.respond(call));

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

const LINK_LABEL = 'open portal';

const destination = widenOptions<PreloadDestination>({
	linkTo: '/tenant',
	path: '/tenant',
	options: PageRoute.options,
});

describe('#2340 tenant portal layout preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
		window.localStorage.clear();
	});

	test('hovering with a cold picker cache warms the picker once and the click reads it without a new request', async () => {
		// Two active workspaces and no saved choice: the portal stays on the picker
		// (a single one would redirect into the account section).
		mocks.respond.mockReturnValue({
			...PICKER_RESPONSE,
			tenants: [
				...PICKER_RESPONSE.tenants,
				{ id: 'tenant-preload-2', name: 'Other Org', status: 'active' },
			],
			activeCount: 2,
			totalCount: 2,
		});
		await expectPickerOnlyHoverThenClick({
			destination,
			linkLabel: LINK_LABEL,
			pageTestId: 'tenant-portal-picker',
			respond: mocks.respond,
		});
	});
});
