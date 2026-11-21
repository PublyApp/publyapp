import { vi } from 'vitest';
import {
	buildFakeApiClient,
	type FakeClientCall,
	type FakeResponse,
} from '~/__tests__/support/preload-harness';

/**
 * Module factories for the staff `*.preload.test.tsx` suites. `vi.mock` calls
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
