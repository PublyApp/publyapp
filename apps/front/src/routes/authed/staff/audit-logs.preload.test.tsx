/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
	countCallsByPath,
	type FakeClientCall,
	type FakeResponse,
	type PreloadDestination,
	preloadedQueries,
	renderPreloadScenario,
	warmedSnapshot,
	widenOptions,
} from '~/routes/authed/staff/_preload-test-harness';
import { Route as StaffAuditLogsRoute } from '~/routes/authed/staff/audit-logs';

/**
 * #2340 — the real staff audit-logs route preloads its page queries from the
 * route's own query spec (see `staff-users.preload.test.tsx` for the harness
 * rationale). Hover warms the action registry and the history list once; the
 * click paints them from cache.
 */
const mocks = vi.hoisted(() => ({
	respond: vi.fn((_call: FakeClientCall): FakeResponse => ({})),
}));

vi.mock('~/lib/api-client/client-manager', async () => {
	const actual = await vi.importActual<
		typeof import('~/lib/api-client/client-manager')
	>('~/lib/api-client/client-manager');
	const { buildFakeApiClient } =
		await import('~/routes/authed/staff/_preload-test-harness');
	const fakeClient = buildFakeApiClient(mocks.respond);

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

const LOGS_PATH = ['staff', 'auditLogs', 'get'] as const;
const ACTIONS_PATH = ['staff', 'auditLogs', 'actions', 'get'] as const;
const LINK_LABEL = 'open audit logs';

const destinationFor = (linkSearch: Record<string, string>) =>
	widenOptions<PreloadDestination>({
		linkTo: '/staff/audit-logs',
		linkSearch,
		path: '/staff/audit-logs',
		options: StaffAuditLogsRoute.options,
	});

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/audit-logs',
	path: '/staff/audit-logs',
	options: StaffAuditLogsRoute.options,
});

describe('#2340 staff audit-logs route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering the link warms the action registry and the history list once', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});

		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(countCallsByPath(mocks.respond, ...LOGS_PATH)).toBe(0);

		fireEvent.mouseEnter(link);

		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...LOGS_PATH)).toBe(1);
			expect(countCallsByPath(mocks.respond, ...ACTIONS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		expect(warmed).toHaveLength(2);
		expect(warmed.every((query) => query.state.data !== undefined)).toBe(true);
		expect(screen.queryByTestId('staff-audit-logs-history')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...LOGS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);

		await waitFor(() => {
			expect(screen.getByTestId('staff-audit-logs-history')).toBeTruthy();
		});

		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
	});

	test('a period filter warms the key the page reads for that URL', async () => {
		const { queryClient } = renderPreloadScenario({
			destination: destinationFor({ period: 'week' }),
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...LOGS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);
		await waitFor(() => {
			expect(screen.getByTestId('staff-audit-logs-history')).toBeTruthy();
		});

		// The page observes every warmed key as-is: same key, no refetch.
		expect(warmed).toHaveLength(2);
		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
		expect(countCallsByPath(mocks.respond, ...LOGS_PATH)).toBe(1);
	});

	test('a category filter with a cold action registry does not warm the logs', async () => {
		const { queryClient } = renderPreloadScenario({
			destination: destinationFor({ category: 'auth' }),
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...ACTIONS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		expect(countCallsByPath(mocks.respond, ...LOGS_PATH)).toBe(0);
		expect(preloadedQueries(queryClient)).toHaveLength(1);
	});
});
