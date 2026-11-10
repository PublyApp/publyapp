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
import { Route as StaffSystemJobsRoute } from '~/routes/authed/staff/jobs/system-jobs';

/**
 * #2340 — the real staff system-jobs route preloads its four page queries from
 * the route's own query spec (see `staff-users.preload.test.tsx` for the
 * harness rationale). The permission payload is a page query through
 * `_permissions.ts`, so hover must warm it too.
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

const QUEUE_PATH = ['staff', 'jobs', 'queue', 'get'] as const;
const DEAD_LETTERS_PATH = ['staff', 'jobs', 'deadLetter', 'get'] as const;
const SYSTEM_JOBS_PATH = ['staff', 'jobs', 'systemJobs', 'get'] as const;
const PERMISSIONS_PATH = ['auth', 'scopeAuthData', 'get'] as const;
const LINK_LABEL = 'open system jobs';

const destination = widenOptions<PreloadDestination>({
	linkTo: '/staff/jobs/system-jobs',
	path: '/staff/jobs/system-jobs',
	options: StaffSystemJobsRoute.options,
});

describe('#2340 staff system-jobs route preload', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.respond.mockReset();
	});

	test('hovering the link warms the four page queries exactly once, permissions included', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});

		const link = await screen.findByRole('link', { name: LINK_LABEL });
		expect(countCallsByPath(mocks.respond, ...SYSTEM_JOBS_PATH)).toBe(0);

		fireEvent.mouseEnter(link);

		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...SYSTEM_JOBS_PATH)).toBe(1);
			expect(countCallsByPath(mocks.respond, ...QUEUE_PATH)).toBe(1);
			expect(countCallsByPath(mocks.respond, ...DEAD_LETTERS_PATH)).toBe(1);
			expect(countCallsByPath(mocks.respond, ...PERMISSIONS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		expect(warmed).toHaveLength(4);
		expect(warmed.every((query) => query.state.data !== undefined)).toBe(true);
		expect(screen.queryByTestId('staff-jobs-system-table')).toBeNull();
	});

	test('clicking after the preload paints the page from cache with no refetch', async () => {
		const { queryClient } = renderPreloadScenario({
			destination,
			linkLabel: LINK_LABEL,
		});
		const link = await screen.findByRole('link', { name: LINK_LABEL });

		fireEvent.mouseEnter(link);
		await waitFor(() => {
			expect(countCallsByPath(mocks.respond, ...PERMISSIONS_PATH)).toBe(1);
		});
		await waitFor(() => {
			expect(queryClient.isFetching()).toBe(0);
		});

		const warmed = preloadedQueries(queryClient);
		const snapshot = warmedSnapshot(warmed);

		fireEvent.click(link);

		await waitFor(() => {
			expect(screen.getByTestId('staff-jobs-system-table')).toBeTruthy();
		});

		for (const query of warmed) {
			expect(query.getObserversCount()).toBeGreaterThan(0);
			expect(query.state.dataUpdatedAt).toBe(snapshot.get(query.queryKey));
		}
	});
});
