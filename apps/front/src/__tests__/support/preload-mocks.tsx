import { vi } from 'vitest';
import {
	buildFakeApiClient,
	type FakeClientCall,
	type FakeResponse,
} from '~/__tests__/support/preload-harness';

/**
 * Module factories for the staff and tenant `*.preload.test.tsx` suites. `vi.mock` calls
 * are hoisted per file, so each test file keeps its four one-line `vi.mock`
 * registrations and hands the module body to these factories.
 */

/** The one fake Kiota call recorder every preload suite asserts against. */
export const respond = vi.fn((_call: FakeClientCall): FakeResponse => ({}));

export const clientManagerModule = async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const fakeClient = buildFakeApiClient(respond);

	return {
		...actual,
		getClientManager: () => ({
			getOrCreateClient: () => fakeClient,
			getOrCreateStaffClient: () => fakeClient,
			getOrCreateTenantScopeClient: () => fakeClient,
			getOrCreateAnonymousClient: () => fakeClient,
			getOrCreateSessionClient: () => fakeClient,
			clearClients: () => {},
		}),
	};
};

type LogoutHookModule = { useLogout: () => { logout: () => void } };

export const logoutHookModule = (): LogoutHookModule => ({
	useLogout: () => ({ logout: vi.fn() }),
});

export const logoutRedirectModule = () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect" />,
});

export const identityI18nModule = async (
	importOriginal: () => Promise<typeof import('react-i18next')>,
): Promise<Record<string, unknown>> => ({
	...(await importOriginal()),
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: {
			language: 'en',
			getFixedT: () => (key: string) => key,
			t: (key: string) => key,
		},
	}),
});

/** The fake client manager of the tenant routes: tenant-scoped clients prefix
 * every call path with the tenant id they were built for. */
export const tenantClientManagerModule = async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const plain = buildFakeApiClient(respond);
	const manager = {
		getOrCreateClient: (tenantId: string) =>
			buildFakeApiClient((call) =>
				respond({ path: [tenantId, ...call.path], args: call.args }),
			),
		getOrCreateStaffClient: () => plain,
		getOrCreateTenantScopeClient: () => plain,
		getOrCreateAnonymousClient: () => plain,
		getOrCreateSessionClient: () => plain,
		clearClients: () => {},
	};

	return { ...actual, getClientManager: () => manager };
};
