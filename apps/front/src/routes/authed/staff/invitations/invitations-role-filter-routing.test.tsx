/** @vitest-environment jsdom */
/**
 * The role filter of the real invitations route: changing it from page 2 must
 * not send the page-2 cursor, and a legacy `?role=<name>` link is resolved to
 * the role id (URL replaced) or dropped. Same real-router harness as
 * `invitations-bulk-revoke-routing.test.tsx`; only the data hooks are faked.
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
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const ROLE_WRITER = '11111111-1111-4111-8111-111111111111';
const ROLE_READER = '22222222-2222-4222-8222-222222222222';
const LIST_ROUTE_PATH = '/staff/invitations';

const mocks = vi.hoisted(() => ({
	useStaffInvitationsQuery: vi.fn(),
	teamRoles: [] as { id: string; name: string; memberCount: number }[],
}));

vi.mock('~/lib/query/staff-invitations', () => ({
	STAFF_INVITATIONS_QUERY_KEY: ['staff-invitations'],
	staffInvitationsQueryOptions: {
		queryKey: () => ['staff-invitations'],
		fetcher: () => Promise.resolve({}),
	},
	invalidateStaffInvitations: vi.fn(),
	useStaffInvitationsQuery: mocks.useStaffInvitationsQuery,
	useResendStaffInvitationMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useRevokeStaffInvitationMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
	useBulkRevokeStaffInvitationsMutation: () => ({
		mutateAsync: vi.fn(),
		isPending: false,
	}),
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: () => false,
}));

vi.mock('../_staff-list-team', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../_staff-list-team')>();
	return {
		...actual,
		useStaffTeamOverview: () => ({
			counts: { staff: 1, invitations: 1, roles: 2 },
			staffCounts: null,
			invitationCounts: null,
			roles: mocks.teamRoles,
		}),
	};
});

vi.mock('~/routes/authed/staff/staff-list-export-selected', () => ({
	StaffListExportSelectedAction: () => null,
	StaffListExportSelectedButton: () => null,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === 'list-filter-chip') {
				return `${String(options?.category)}: ${String(options?.value)}`;
			}
			const bare = key.includes(':') ? key.split(':').slice(1).join(':') : key;
			return bare.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
				String(options?.[name] ?? ''),
			);
		},
		i18n: { language: 'en' },
	}),
}));

import { Route as InvitationsListRoute } from './index';

const widenOptions = <T,>(value: unknown): T => value as T;

const payload = (nextCursor: string | null) => ({
	data: [
		{
			id: '33333333-3333-4333-8333-333333333333',
			email: 'writer@example.com',
			roleName: 'Writer',
			roleNames: ['Writer'],
			invitedByName: 'Alex',
			status: 'Pending',
			acceptedAt: null,
			createdAt: '2026-08-01T10:00:00Z',
			expiresAt: null,
		},
	],
	nextCursor,
	totalCount: 2,
	counts: {
		total: 2,
		roleCounts: [
			{ roleId: ROLE_WRITER, name: 'Writer', count: 1 },
			{ roleId: ROLE_READER, name: 'Reader', count: 1 },
		],
	},
});

const settled = (data: unknown) => ({
	data,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	isSuccess: true,
	refetch: () => Promise.resolve(),
});

const histories: { destroy: () => void }[] = [];

const mount = async (initialUrl: string) => {
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
	widenOptions<{ update: (options: Record<string, unknown>) => void }>(
		InvitationsListRoute,
	).update({
		id: LIST_ROUTE_PATH,
		path: LIST_ROUTE_PATH,
		getParentRoute: () => layoutRoute,
	});
	const addChildrenOf = (route: unknown) =>
		widenOptions<{ addChildren: (children: unknown[]) => void }>(route)
			.addChildren;
	const routeTree = addChildrenOf(rootRoute)([
		addChildrenOf(layoutRoute)([InvitationsListRoute]),
	]);
	const history = createMemoryHistory({ initialEntries: [initialUrl] });
	histories.push(history);
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
	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	await waitFor(() =>
		expect(screen.getByTestId('staff-invitations-table')).toBeTruthy(),
	);
	return { history, router };
};

const lastVariables = () =>
	mocks.useStaffInvitationsQuery.mock.calls.at(-1)?.[0] as {
		cursor?: string;
		roleId?: string;
	};

afterEach(() => {
	cleanup();
	while (histories.length > 0) {
		histories.pop()?.destroy();
	}
	mocks.useStaffInvitationsQuery.mockReset();
	mocks.teamRoles = [];
});

describe('invitations role filter (real route)', () => {
	test('changing the role from page 2 requests the first page, not the page-2 cursor', async () => {
		mocks.useStaffInvitationsQuery.mockReturnValue(
			settled(payload('cursor-2')),
		);
		const { history } = await mount(`${LIST_ROUTE_PATH}?size=25`);

		fireEvent.click(await screen.findByRole('button', { name: 'next-page' }));
		await waitFor(() => expect(lastVariables().cursor).toBe('cursor-2'));

		history.replace(`${LIST_ROUTE_PATH}?size=25&role=${ROLE_WRITER}`);

		await waitFor(() => expect(lastVariables().roleId).toBe(ROLE_WRITER));
		expect(lastVariables().cursor).toBeUndefined();
	});

	test('a legacy ?role=<name> link is replaced by the role id and filters by it', async () => {
		mocks.useStaffInvitationsQuery.mockReturnValue(settled(payload(null)));
		const { history } = await mount(`${LIST_ROUTE_PATH}?role=writer`);

		await waitFor(() => expect(history.location.search).toContain(ROLE_WRITER));
		expect(history.location.search).not.toContain('writer&');
		await waitFor(() => expect(lastVariables().roleId).toBe(ROLE_WRITER));
	});

	test('a legacy name no role matches is dropped from the URL', async () => {
		mocks.useStaffInvitationsQuery.mockReturnValue(settled(payload(null)));
		const { history } = await mount(`${LIST_ROUTE_PATH}?role=Ghost`);

		await waitFor(() => expect(history.location.search).not.toContain('Ghost'));
		expect(lastVariables().roleId).toBeUndefined();
	});

	test('a valid id keeps its name when another filter drops it from the facet', async () => {
		mocks.teamRoles = [{ id: ROLE_READER, name: 'Reader', memberCount: 1 }];
		const withoutReader = payload(null);
		withoutReader.counts.roleCounts = [
			{ roleId: ROLE_WRITER, name: 'Writer', count: 1 },
		];
		mocks.useStaffInvitationsQuery.mockReturnValue(settled(withoutReader));
		await mount(`${LIST_ROUTE_PATH}?role=${ROLE_READER}`);

		// The chip carries the role's name (from the staff roles list), never a
		// placeholder, although the facet does not list the role.
		await waitFor(() =>
			expect(screen.getAllByText('roles: Reader').length).toBeGreaterThan(0),
		);
		expect(screen.queryByText('loading')).toBeNull();
	});
});
