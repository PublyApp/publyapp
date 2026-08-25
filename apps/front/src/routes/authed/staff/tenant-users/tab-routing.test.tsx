/** @vitest-environment jsdom */
/**
 * #1161 Tier-2 guard: the GLOBAL staff tenant-user detail tabs as REAL path
 * segments, driven through a REAL TanStack router.
 *
 * What is real here:
 *  - five production route objects — the redirect stub
 *    (`tenant-users-details-$userId.tsx`), the unknown-tab fallback stub
 *    (`_tenant-user-details-tab-fallback.tsx`), and the two real tab routes
 *    (`$userId/general`, `$userId/organizations`) plus their shared shell.
 *    Each is imported and `.update()`-ed onto a throwaway parent exactly the
 *    way `routeTree.gen` wires them, so their real ids, `beforeLoad`
 *    redirects, `staticData` and `component` are the ones under test.
 *  - a real `createRouter` + `createMemoryHistory` with real `<Link>`
 *    navigation.
 *  - the real tab bodies (`TenantUserDetailsShell`, the identity edit form,
 *    the organizations tab content) via each route's real `component`.
 *
 * What is faked: only the network-facing hooks of
 * `~/lib/query/staff-global-tenant-users` (the `useQuery`/`useMutation`
 * exports) plus i18n. Every pure helper — `toGlobalTenantUserDetails`,
 * `toGlobalTenantUserCompanyRows`, the crumb-query pair — stays the REAL
 * implementation via `importOriginal`.
 *
 * The synthetic parent is the pattern this repo already uses for real-route
 * tests (`section-routing.test.tsx`, `deep-link-canonicalization.test.tsx`):
 * mounting the whole app route tree would drag in session/auth
 * bootstrapping that has nothing to do with what is being proved here.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import type { AnyRouter } from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const USER_ID = '7f9c24e8-3b12-4c5d-9e8f-1a2b3c4d5e6f';
const DETAILS_BASE = `/staff/tenant-users/details/${USER_ID}`;
const GENERAL_PATH = `${DETAILS_BASE}/general`;
const ORGANIZATIONS_PATH = `${DETAILS_BASE}/organizations`;

const mocks = vi.hoisted(() => ({
	details: {
		id: '7f9c24e8-3b12-4c5d-9e8f-1a2b3c4d5e6f',
		email: 'member@example.com',
		firstName: 'Ada',
		lastName: 'Lovelace',
		status: 'Active',
		avatarUrl: null,
		companyCount: 0,
		createdAt: new Date('2026-07-01T09:00:00Z'),
		updatedAt: null,
		displayName: 'Ada Lovelace',
	} as Record<string, unknown>,
	companies: [] as unknown[],
	updateIdentity: vi.fn().mockResolvedValue(undefined),
}));

const settledQuery = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: vi.fn().mockResolvedValue(undefined),
});

const settledMutation = (mutateAsync: unknown) => ({
	isPending: false,
	mutate: vi.fn(),
	mutateAsync,
});

vi.mock('~/lib/query/staff-global-tenant-users', async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import('~/lib/query/staff-global-tenant-users')
		>();

	return {
		...actual,
		useGlobalTenantUserDetailsQuery: () => settledQuery(mocks.details),
		useGlobalTenantUserCompaniesQuery: () =>
			settledQuery({ data: mocks.companies, nextCursor: null }),
		useUpdateGlobalTenantUserIdentityMutation: () =>
			settledMutation(mocks.updateIdentity),
		useBulkUnlinkGlobalTenantUserCompaniesMutation: () =>
			settledMutation(vi.fn().mockResolvedValue({ succeeded: [], failed: [] })),
		useLinkGlobalTenantUserCompaniesMutation: () =>
			settledMutation(vi.fn().mockResolvedValue(undefined)),
		useGlobalTenantUsersPickerQuery: () => settledQuery({ data: [] }),
		invalidateGlobalTenantUsers: () => Promise.resolve(),
	};
});

vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return actual;
});

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const bare = key.includes(':') ? (key.split(':').at(-1) ?? key) : key;
			let text = bare;
			for (const [optionKey, value] of Object.entries(options ?? {})) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}

			return text;
		},
		i18n: { language: 'en' },
	}),
}));

vi.mock('~/components/ui/product-page', () => ({
	StatusPill: ({ children }: { children?: ReactNode }) =>
		createElement('span', { 'data-testid': 'status-pill' }, children),
}));

vi.mock('~/components/ui/person-avatar', () => ({
	PersonAvatar: ({ name }: { name: string }) =>
		createElement('span', { 'data-testid': 'person-avatar' }, name),
}));

import { Route as TabFallbackRoute } from '../_tenant-user-details-tab-fallback';
import { Route as DetailsStubRoute } from '../tenant-users-details-$userId';
import { Route as GeneralTabRoute } from './$userId-general';
import { Route as OrganizationsTabRoute } from './$userId-organizations';

/**
 * `createFileRoute(...)(options)` does not attach id/path/parent — the
 * generated `routeTree.gen.ts` does, with exactly this `.update()` call.
 * Doing the same here mounts the REAL route objects under a throwaway
 * parent so their own `Route.useParams()`/hooks resolve against the router
 * built below. Mirrors `section-routing.test.tsx`.
 */
const mountRealRoute = <TRoute,>(
	route: TRoute,
	options: Record<string, unknown>,
): TRoute => {
	(route as { update: (options: Record<string, unknown>) => void }).update(
		options,
	);

	return route;
};

const openHistories: { destroy: () => void }[] = [];

const destroyOpenHistories = (): void => {
	while (openHistories.length > 0) {
		openHistories.pop()?.destroy();
	}
};

const buildRouter = (initialUrl: string) => {
	const rootRoute = createRootRoute({
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});
	const layoutRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/_authed-layout',
		staticData: { crumbs: 'shell' },
		component: () => <Outlet />,
	});

	const detailsStubRoute = mountRealRoute(DetailsStubRoute, {
		id: '/staff/tenant-users/details/$userId',
		path: '/staff/tenant-users/details/$userId',
		getParentRoute: () => layoutRoute,
	});
	const tabFallbackRoute = mountRealRoute(TabFallbackRoute, {
		id: '/staff/tenant-users/details/$userId/$tab',
		path: '/staff/tenant-users/details/$userId/$tab',
		getParentRoute: () => layoutRoute,
	});
	const generalTabRoute = mountRealRoute(GeneralTabRoute, {
		id: '/staff/tenant-users/details/$userId/general',
		path: '/staff/tenant-users/details/$userId/general',
		getParentRoute: () => layoutRoute,
	});
	const organizationsTabRoute = mountRealRoute(OrganizationsTabRoute, {
		id: '/staff/tenant-users/details/$userId/organizations',
		path: '/staff/tenant-users/details/$userId/organizations',
		getParentRoute: () => layoutRoute,
	});
	const tenantUsersListRoute = createRoute({
		getParentRoute: () => layoutRoute,
		path: '/staff/tenant-users',
		staticData: { crumbs: 'shell' },
		component: () => <div data-testid="tenant-users-list-page" />,
	});
	const notFoundRoute = createRoute({
		getParentRoute: () => rootRoute,
		id: '/not-found-catchall',
		staticData: { crumbs: 'shell' },
		component: () => <div data-testid="not-found-page" />,
	});

	// `.addChildren` exists at runtime on every route but is absent from the
	// public types for file routes, so the helper names its shape once.
	function widenOptions<T>(value: unknown): T {
		return value as T;
	}
	function addChildrenOf(route: unknown) {
		return widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	}

	const routeTree = addChildrenOf(rootRoute)([
		notFoundRoute,
		addChildrenOf(layoutRoute)([
			detailsStubRoute,
			tabFallbackRoute,
			generalTabRoute,
			organizationsTabRoute,
			tenantUsersListRoute,
		]),
	]);

	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const router: AnyRouter = createRouter(
		widenOptions<Parameters<typeof createRouter>[0]>({
			routeTree,
			history,
			context: { queryClient },
		}),
	);

	return { router, history, queryClient };
};

const renderAt = async (initialUrl: string) => {
	const harness = buildRouter(initialUrl);
	openHistories.push(harness.history);

	render(
		<QueryClientProvider client={harness.queryClient}>
			<RouterProvider router={harness.router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(screen.queryByTestId('tenant-user-details-page')).toBeTruthy(),
	);

	// `.state.location` is public at runtime but only partially exposed by the
	// generic router type; the helper names the observed shape once.
	function routerPathnameOf(router: unknown): string {
		return (router as { state: { location: { pathname: string } } }).state
			.location.pathname;
	}

	return Object.assign(harness, {
		location: () => routerPathnameOf(harness.router),
	});
};

describe('#1161 global tenant-user detail tabs are path segments (real router)', () => {
	afterEach(() => {
		cleanup();
		destroyOpenHistories();
		vi.clearAllMocks();
	});

	test('the details base URL redirects to the general tab (old bookmark parity)', async () => {
		const h = await renderAt(DETAILS_BASE);

		expect(screen.getByTestId('tenant-user-general-tab')).toBeTruthy();
		expect(h.location()).toBe(GENERAL_PATH);
	});

	test('an unknown tab deep link redirects to the general tab, not a broken page', async () => {
		const h = await renderAt(`${DETAILS_BASE}/billing`);

		expect(screen.getByTestId('tenant-user-general-tab')).toBeTruthy();
		expect(h.location()).toBe(GENERAL_PATH);
	});

	test('the general tab renders through the shared details shell with identity header', async () => {
		await renderAt(GENERAL_PATH);

		expect(screen.getByTestId('tenant-user-general-tab')).toBeTruthy();
		expect(screen.getByTestId('person-avatar').textContent).toBe(
			'Ada Lovelace',
		);
		expect(screen.getByTestId('status-pill').textContent).toBe('status-active');
	});

	test('the organizations tab renders its table inside the same shell', async () => {
		await renderAt(ORGANIZATIONS_PATH);

		expect(screen.getByTestId('tenant-user-companies-table')).toBeTruthy();
		expect(screen.getByTestId('person-avatar').textContent).toBe(
			'Ada Lovelace',
		);
	});

	test('both tabs are reachable by real Link navigation from the shell', async () => {
		const h = await renderAt(GENERAL_PATH);

		const link = document.querySelector<HTMLAnchorElement>(
			`a[href="${ORGANIZATIONS_PATH}"]`,
		);
		expect(link).toBeTruthy();
		link?.click();

		await waitFor(() =>
			expect(screen.getByTestId('tenant-user-companies-table')).toBeTruthy(),
		);
		expect(h.location()).toBe(ORGANIZATIONS_PATH);
	});

	test('the identity form hydrates from the cached details payload', async () => {
		await renderAt(GENERAL_PATH);

		const firstNameInput = document.querySelector<HTMLInputElement>(
			'input[name="firstName"]',
		);
		const lastNameInput = document.querySelector<HTMLInputElement>(
			'input[name="lastName"]',
		);

		expect(firstNameInput?.value).toBe('Ada');
		expect(lastNameInput?.value).toBe('Lovelace');
	});
});
