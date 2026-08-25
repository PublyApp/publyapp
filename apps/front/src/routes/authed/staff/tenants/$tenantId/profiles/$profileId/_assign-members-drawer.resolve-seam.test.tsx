/**
 * @vitest-environment jsdom
 *
 * step4b-rereview MAJOR 4: the sibling `_assign-members-drawer.test.tsx`
 * mocks the resolve/assign/unassign HOOKS directly, which proves the
 * component calls a mock with the right shape but nothing about whether that
 * shape actually reaches the real query/mutation options or the account-id
 * route. This file drives the UI through the REAL
 * `useStaffTenantProfileMemberAssignmentResolutionQuery` /
 * `useAssignStaffTenantProfileUserMutation` /
 * `useUnassignStaffTenantProfileUserMutation` hooks and a REAL
 * `QueryClient`, faking only the underlying Kiota client
 * (`getClientManager()`), so it can assert:
 *
 * 1. identity: the DELETE/resolve calls the fake client with the
 *    tenant-membership `userAccountId`, never the global user `id` — with
 *    fixtures where the two are deliberately distinct literals.
 * 2. the generation-guard race protection: after a commit bumps the resolve
 *    query onto a brand-new cache key, a late write to the ABANDONED
 *    previous-generation's cache entry can never reach the rendered switch.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	getOrCreateStaffClient: vi.fn(),
	useStaffTenantUsersQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('~/lib/api-client/client-manager', () => ({
	getClientManager: () => ({
		getOrCreateStaffClient: mocks.getOrCreateStaffClient,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;
		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}
		return (
			<a href={href} {...props}>
				{children}
			</a>
		);
	},
}));

const TRANSLATIONS: TestLabelMap = {
	members: 'Members',
	'assign-members': 'Assign members',
	'assign-members-drawer-description': 'Toggle a member to assign or remove.',
	'assign-member-toggle-label': 'Toggle profile assignment for {{name}}',
	'no-tenant-members-to-assign': 'There are no tenant members to assign yet.',
	'assign-members-resolution-error-title':
		"Can't confirm who's already assigned",
	'assign-members-resolution-error-description':
		"We couldn't check current assignment status.",
	'tenant-users-no-match-title': 'No members match your search',
	'tenant-users-no-match-description': 'Try a different search.',
	'search-tenant-members': 'Search members by name or email…',
	close: 'Close',
	retry: 'Retry',
	'page-n': 'Page {{page}}',
	'previous-page': 'Previous page',
	'next-page': 'Next page',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			if (!options) {
				return text;
			}
			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
	}),
}));

// The candidate-list hook stays mocked (it's a different, already-covered
// seam — see staff-tenant-users.test.ts for its own id-identity proof); only
// the resolve/assign/unassign seam under test runs for real below.
vi.mock('~/lib/query/staff-tenant-users', () => ({
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
	toStaffTenantUserRows: (
		items:
			| {
					id?: string;
					userAccountId?: string;
					email?: string;
					firstName?: string | null;
					lastName?: string | null;
			  }[]
			| null
			| undefined,
	) =>
		(items ?? []).map((item) => ({
			id: item.id ?? '',
			userAccountId: item.userAccountId ?? '',
			email: item.email ?? '',
			firstName: item.firstName ?? null,
			lastName: item.lastName ?? null,
			avatarUrl: null,
			status: 'active',
			displayName:
				[item.firstName, item.lastName].filter(Boolean).join(' ') ||
				item.email ||
				'',
		})),
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { AssignMembersDrawer } from './_assign-members-drawer';

const TENANT_ID = 'tenant-1';
const PROFILE_ID = 'profile-1';

// FIXTURE IDENTITY CONTRACT (step4b-review BLOCKER 1): `id` (global user) and
// `userAccountId` (tenant membership) are deliberately distinct literals, so
// an assertion on the account-id literal fails if the component regresses to
// sending the global id instead.
const FIXTURE_USERS = [
	{
		id: 'user-1',
		userAccountId: 'account-1',
		email: 'ada@example.com',
		firstName: 'Ada',
		lastName: 'Lovelace',
	},
];

const RESOLUTION_QUERY_KEY_PREFIX = [
	'staff',
	'staff-tenants',
	'profiles',
	'users',
	'assignment-resolution',
];

const buildFakeClient = () => {
	const byUserAccountIdPost = vi.fn().mockResolvedValue(undefined);
	const byUserAccountIdDelete = vi.fn().mockResolvedValue(undefined);
	const assignmentResolutionPost = vi.fn();

	const byUserAccountId = (userAccountId: string) => ({
		post: () => byUserAccountIdPost(userAccountId),
		delete: () => byUserAccountIdDelete(userAccountId),
	});

	const client = {
		staff: {
			tenants: {
				byTenantId: () => ({
					profiles: {
						byProfileId: () => ({
							users: {
								byUser_account_id: byUserAccountId,
								assignmentResolution: {
									post: (body: unknown) => assignmentResolutionPost(body),
								},
							},
						}),
					},
				}),
			},
		},
	};

	return {
		byUserAccountIdPost,
		byUserAccountIdDelete,
		assignmentResolutionPost,
		client,
	};
};

type FakeClient = ReturnType<typeof buildFakeClient>;

const renderDrawer = (queryClient: QueryClient): ReturnType<typeof render> =>
	render(
		(
			<QueryClientProvider client={queryClient}>
				<AssignMembersDrawer
					tenantId={TENANT_ID}
					profileId={PROFILE_ID}
					isOpen
					onOpenChange={() => {}}
					onSessionExpired={() => {}}
				/>
			</QueryClientProvider>
		) as JSX.Element,
	);

let fake: FakeClient;
let queryClient: QueryClient;

beforeEach(() => {
	vi.clearAllMocks();
	fake = buildFakeClient();
	mocks.getOrCreateStaffClient.mockReturnValue(fake.client);
	mocks.useStaffTenantUsersQuery.mockReturnValue({
		data: { data: FIXTURE_USERS, nextCursor: null },
		isPending: false,
		isError: false,
		isFetching: false,
		refetch: vi.fn(),
	});
	queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	});
});

afterEach(() => {
	cleanup();
	queryClient.clear();
});

describe('AssignMembersDrawer — real resolve/assign/unassign seam', () => {
	test('resolves and unassigns through the real hooks using the account id, never the global user id', async () => {
		fake.assignmentResolutionPost.mockResolvedValue({
			assignments: [{ userAccountId: 'account-1', isAssigned: true }],
		});

		renderDrawer(queryClient);

		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-checked'),
			).toBe('true');
		});

		// The REAL resolve query hit the REAL fetcher, which hit the fake client
		// with a body referencing the account id — never the global user id.
		expect(fake.assignmentResolutionPost).toHaveBeenCalled();
		const [body] = fake.assignmentResolutionPost.mock.calls[0] as [unknown];
		const serializedBody = JSON.stringify(body);
		expect(serializedBody).toContain('account-1');
		expect(serializedBody).not.toContain('user-1');

		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		await waitFor(() => {
			expect(fake.byUserAccountIdDelete).toHaveBeenCalledWith('account-1');
		});
		expect(fake.byUserAccountIdDelete).not.toHaveBeenCalledWith('user-1');
		expect(fake.byUserAccountIdPost).not.toHaveBeenCalled();

		// The name link, meanwhile, still navigates with the GLOBAL user id.
		const link = screen.getByText('Ada Lovelace').closest('a');
		expect(link?.getAttribute('href')).toBe(
			`/staff/tenants/${TENANT_ID}/users/user-1`,
		);
	});

	// step4b-rereview MAJOR 2: proves the generation-guard actually protects
	// against a late-settling stale response — not just that the component
	// "looks" disabled/enabled correctly in isolation.
	test('a write to the ABANDONED previous-generation cache entry never overwrites the current post-commit state', async () => {
		fake.assignmentResolutionPost.mockResolvedValueOnce({
			assignments: [{ userAccountId: 'account-1', isAssigned: false }],
		});

		renderDrawer(queryClient);

		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-disabled'),
			).toBeNull();
		});
		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('false');

		// Capture the Query object that answered the FIRST (pre-toggle)
		// generation — this is the cache entry a slow/late response belongs to.
		const queriesBeforeCommit = queryClient
			.getQueryCache()
			.findAll({ queryKey: RESOLUTION_QUERY_KEY_PREFIX });
		expect(queriesBeforeCommit).toHaveLength(1);
		const staleQuery = queriesBeforeCommit[0];

		// Toggling ON commits the write and (per the drawer's own logic) bumps
		// the resolve generation, issuing a brand-new query for the next fetch.
		fake.assignmentResolutionPost.mockResolvedValueOnce({
			assignments: [{ userAccountId: 'account-1', isAssigned: true }],
		});
		fireEvent.click(screen.getByTestId('assign-member-toggle-account-1'));

		await waitFor(() => {
			expect(fake.byUserAccountIdPost).toHaveBeenCalledWith('account-1');
		});
		await waitFor(() => {
			expect(
				screen
					.getByTestId('assign-member-toggle-account-1')
					.getAttribute('aria-checked'),
			).toBe('true');
		});

		const queriesAfterCommit = queryClient
			.getQueryCache()
			.findAll({ queryKey: RESOLUTION_QUERY_KEY_PREFIX });
		expect(queriesAfterCommit).toHaveLength(2);
		const currentQuery = queriesAfterCommit.find(
			(query) => query !== staleQuery,
		);
		expect(currentQuery).toBeDefined();

		// Simulate the OLD (pre-toggle) fetch finally settling LATE, with data
		// that flatly contradicts the just-committed assignment. Under the
		// previous wall-clock design this exact shape of lateness could
		// resurrect/clobber the row; under the generation-keyed design it can
		// only ever mutate the now-ABANDONED query object — nothing renders
		// from it anymore.
		staleQuery?.setData({
			assignments: [{ userAccountId: 'account-1', isAssigned: false }],
		});

		expect(
			screen
				.getByTestId('assign-member-toggle-account-1')
				.getAttribute('aria-checked'),
		).toBe('true');
	});
});
