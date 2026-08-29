/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	navigate: vi.fn(),
	search: {},
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantProfileDetailsQuery: vi.fn(),
	toStaffTenantProfileDetails: vi.fn(),
	useStaffTenantProfileMembersQuery: vi.fn(),
	toStaffTenantProfileMemberRows: vi.fn(),
	shouldLogoutForFailure: vi.fn((_: unknown) => false),
	drawerIsOpen: false,
	drawerOnOpenChange: (_isOpen: boolean) => {},
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
			profileId: '22222222-2222-2222-2222-222222222222',
		}),
		useSearch: () => mocks.search,
	}),
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
	profile: 'Profile',
	members: 'Members',
	level: 'Level',
	status: 'Status',
	'staff-tenant-profiles:other-profiles': 'Other profiles',
	'staff-tenant-profiles:joined': 'Joined',
	'staff-tenant-profiles:no-other-profiles': 'No other profiles',
	admin: 'Admin',
	user: 'User',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-globally-suspended': 'Globally suspended',
	'staff-tenant-profiles:profile-sections': 'Profile sections',
	'assign-members': 'Assign members',
	'profile-members-tab-description':
		'People currently assigned to this profile.',
	'profile-members-table-aria-label': 'Profile members',
	'profile-members-empty-title': 'No members assigned yet',
	'profile-members-empty-description':
		'Use "Assign members" to add people to this profile.',
	'tenant-users-no-match-title': 'No members match your search',
	'tenant-users-no-match-description':
		'Try a different name, email, or filter.',
	'search-tenant-members': 'Search members by name or email…',
	'no-description-provided': 'No description provided.',
	'loading-tenant-profile': 'Loading tenant profile…',
	'error-500-code': '500 — Server Error',
	'error-404-code': '404 — Not Found',
	'tenant-profile-not-found-title': 'Tenant profile not found',
	'tenant-profile-not-found-description':
		'This tenant profile could not be found.',
	'tenant-profile-payload-empty': 'The tenant profile payload was empty.',
	'unable-to-load-tenant-profile': 'Unable to load this tenant profile',
	'tenant-profile-load-error-description':
		'There was a problem loading this tenant profile.',
	'tenant-details-error-title': 'Unable to load this tenant',
	'tenant-response-incomplete': 'The tenant response was incomplete.',
	'back-to-tenants': 'Back to tenants',
	'try-again': 'Try again',
	retry: 'Retry',
	'list-error-default-description': 'Something went wrong loading this list.',
	'list-unavailable-title': 'List unavailable',
	'list-empty-title': 'Nothing here',
	'list-empty-default-description': 'Nothing to show yet.',
	'list-no-match-title': 'No matches',
	'list-no-match-default-description': 'Try a different search.',
	'rows-per-page': 'Rows per page',
	'page-n': 'Page {{page}}',
	'previous-page': 'Previous page',
	'next-page': 'Next page',
	search: 'Search',
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
		i18n: { language: 'en' },
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
}));

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	useStaffTenantProfileDetailsQuery: mocks.useStaffTenantProfileDetailsQuery,
	toStaffTenantProfileDetails: mocks.toStaffTenantProfileDetails,
	useStaffTenantProfileMembersQuery: mocks.useStaffTenantProfileMembersQuery,
	toStaffTenantProfileMemberRows: mocks.toStaffTenantProfileMemberRows,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./_assign-members-drawer', () => ({
	AssignMembersDrawer: ({
		isOpen,
		onOpenChange,
	}: {
		isOpen: boolean;
		onOpenChange: (isOpen: boolean) => void;
	}) => {
		mocks.drawerIsOpen = isOpen;
		mocks.drawerOnOpenChange = onOpenChange;
		if (isOpen) {
			return <div data-testid="assign-drawer-open" />;
		}
		return null;
	},
}));

import {
	makeProfileMemberColumns,
	parseProfileMembersSearchParams,
	serializeProfileMembersSearchParams,
	Route,
} from './users';

const renderPage = () => {
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PROFILE_ID = '22222222-2222-2222-2222-222222222222';

const TENANT = {
	id: TENANT_ID,
	name: 'Acme Corporation',
	code: 'ACME',
	status: 'Active',
	logoUrl: null,
	usersCount: 12,
	ownersCount: 1,
	createdAt: new Date('2026-01-01T00:00:00Z'),
};

const PROFILE = {
	id: PROFILE_ID,
	name: 'Approvers',
	description: 'Can review approvals',
	isDefault: false,
	userAccountCount: 4,
};

/** Row identity contract (step4b-review MAJOR 4): `id` (user_account_id) and
 * `userId` (the global user id) are DELIBERATELY distinct literal strings so
 * an assertion on link href actually proves which one is used — a fixture
 * that conflates them would let a regression back to `id` pass silently. */
const MEMBER_ROWS = [
	{
		id: 'account-1',
		userId: 'user-1',
		email: 'ada@example.com',
		firstName: 'Ada',
		lastName: 'Lovelace',
		avatarUrl: null,
		status: 'Active',
		level: 'Admin',
		otherProfiles: [
			{ id: 'profile-1', name: 'Editors' },
			{ id: 'profile-2', name: 'Publishers' },
			{ id: 'profile-3', name: 'Reviewers' },
		],
		joinedAt: new Date('2026-02-03T04:05:06Z'),
		displayName: 'Ada Lovelace',
	},
	{
		id: 'account-2',
		userId: 'user-2',
		email: 'grace@example.com',
		firstName: 'Grace',
		lastName: 'Hopper',
		avatarUrl: null,
		status: 'Suspended',
		level: 'User',
		otherProfiles: [],
		joinedAt: null,
		displayName: 'Grace Hopper',
	},
];

const buildMembersQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: { users: MEMBER_ROWS, count: MEMBER_ROWS.length },
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn(),
	...overrides,
});

beforeEach(() => {
	vi.clearAllMocks();
	// clearAllMocks keeps implementations, so the escape-hatch tests that
	// force a logout verdict would otherwise leak into later tests once the
	// fatal-error gate stopped short-circuiting on the raw query error flag.
	mocks.shouldLogoutForFailure.mockReturnValue(false);
	mocks.search = {};
	mocks.useStaffTenantDetailsQuery.mockReturnValue({
		data: TENANT,
		isPending: false,
		isError: false,
		refetch: vi.fn(),
	});
	mocks.toStaffTenantDetails.mockReturnValue(TENANT);
	mocks.useStaffTenantProfileDetailsQuery.mockReturnValue({
		data: PROFILE,
		isPending: false,
		isError: false,
		refetch: vi.fn(),
	});
	mocks.toStaffTenantProfileDetails.mockReturnValue(PROFILE);
	mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
		buildMembersQueryResult(),
	);
	mocks.toStaffTenantProfileMemberRows.mockReturnValue(MEMBER_ROWS);
});

afterEach(() => {
	cleanup();
});

describe('parseProfileMembersSearchParams', () => {
	test('round-trips the assign flag as the number 1 alongside table state', () => {
		expect(parseProfileMembersSearchParams({ assign: 1 })).toEqual({
			q: undefined,
			sortId: undefined,
			sortOrder: undefined,
			cursor: undefined,
			size: undefined,
			assign: 1,
		});
		expect(parseProfileMembersSearchParams({ assign: '1' }).assign).toBe(1);
		expect(parseProfileMembersSearchParams({}).assign).toBeUndefined();
		expect(
			parseProfileMembersSearchParams({ assign: 'nonsense' }).assign,
		).toBeUndefined();
	});

	test('parses table state alongside the assign flag', () => {
		expect(
			parseProfileMembersSearchParams({
				q: 'ada',
				sort_id: 'email',
				sort_order: 'asc',
				size: 50,
				assign: 1,
			}),
		).toEqual({
			q: 'ada',
			sortId: 'email',
			sortOrder: 'asc',
			cursor: undefined,
			size: 50,
			assign: 1,
		});
	});
});

describe('serializeProfileMembersSearchParams', () => {
	test('serializes table state to snake_case and keeps the assign flag as a number', () => {
		expect(
			serializeProfileMembersSearchParams({
				q: 'ada',
				sortId: 'email',
				sortOrder: 'asc',
				size: 50,
				assign: 1,
			}),
		).toEqual({
			q: 'ada',
			sort_id: 'email',
			sort_order: 'asc',
			size: 50,
			assign: 1,
		});
	});

	test('omits the assign key when undefined', () => {
		expect(serializeProfileMembersSearchParams({ assign: undefined })).toEqual({
			assign: undefined,
		});
	});
});

describe('StaffTenantProfileMembersPage', () => {
	test('declares the profile feature namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual([
			'staff-tenant-profiles',
		]);
	});

	test('renders the profile identity, member count, and tabs', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-page'),
		).toBeTruthy();
		expect(screen.getByText('Approvers')).toBeTruthy();
		expect(screen.getByText('Can review approvals')).toBeTruthy();
		expect(screen.getAllByText('4').length).toBeGreaterThan(0);
		expect(screen.getByText('Profile', { selector: 'a' })).toBeTruthy();
	});

	test('opens the assign-members drawer via the URL-backed ?assign=1 flag', () => {
		renderPage();

		expect(mocks.drawerIsOpen).toBe(false);

		fireEvent.click(screen.getByText('Assign members'));

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const call = mocks.navigate.mock.calls[0]?.[0] as {
			search: (previous: { assign?: 1 }) => Record<string, unknown>;
			replace: boolean;
		};
		expect(call.search({})).toEqual({ assign: 1 });
		expect(call.replace).toBe(true);
	});

	test('renders the drawer open when the URL already carries ?assign=1', () => {
		mocks.search = { assign: 1 };
		renderPage();

		expect(mocks.drawerIsOpen).toBe(true);
		expect(screen.getByTestId('assign-drawer-open')).toBeTruthy();
	});

	test('renders the loading state while the tenant query is pending', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: true,
			isError: false,
			refetch: vi.fn(),
		});

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-loading')).toBeTruthy();
	});

	test('renders the not-found view when the profile payload is empty', () => {
		mocks.toStaffTenantProfileDetails.mockReturnValue(null);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-not-found'),
		).toBeTruthy();
	});

	test('redirects to logout when the tenant query fails with a session error', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue({
			data: undefined,
			isPending: false,
			isError: true,
			error: new Error('session expired'),
			refetch: vi.fn(),
		});
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('fetches members scoped to the tenant and profile once the profile is loaded', () => {
		renderPage();

		expect(mocks.useStaffTenantProfileMembersQuery).toHaveBeenCalled();
		const [variables, options] =
			mocks.useStaffTenantProfileMembersQuery.mock.calls[0];
		expect(variables).toMatchObject({
			tenantId: TENANT_ID,
			profileId: PROFILE_ID,
		});
		expect(options?.enabled).toBe(true);
	});
});

// Genuine roster rendering — uses the REAL DataTable, PersonAvatar, and
// StatusPill (not mocked), so these tests exercise the actual row/column
// wiring, not just that a mock was invoked (step4b-review MAJOR 7).
describe('StaffTenantProfileMembersPage — roster rendering', () => {
	test('renders a real members roster table instead of the removed placeholder', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-table'),
		).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-profile-members-list-unavailable'),
		).toBeNull();
	});

	test('renders each member row with name, email, level, and status', () => {
		renderPage();

		expect(screen.getByText('Ada Lovelace')).toBeTruthy();
		expect(screen.getByText('ada@example.com')).toBeTruthy();
		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getAllByText('Active').length).toBeGreaterThan(0);

		expect(screen.getByText('Grace Hopper')).toBeTruthy();
		expect(screen.getByText('grace@example.com')).toBeTruthy();
		expect(screen.getByText('User')).toBeTruthy();
		expect(screen.getByText('Suspended')).toBeTruthy();
	});

	// step4b-review MAJOR 4: the roster's `id` is the user_account_id, but the
	// name link must resolve the GLOBAL user id — a regression back to `id`
	// would 404 in production.
	test('links each row name to the global-user-id detail route, not the user_account_id', () => {
		renderPage();

		const adaLink = screen.getByText('Ada Lovelace').closest('a');
		expect(adaLink?.getAttribute('href')).toBe(
			`/staff/tenants/${TENANT_ID}/users/user-1`,
		);

		const graceLink = screen.getByText('Grace Hopper').closest('a');
		expect(graceLink?.getAttribute('href')).toBe(
			`/staff/tenants/${TENANT_ID}/users/user-2`,
		);
	});

	test('renders the genuine empty state when the profile has no members, distinct from the removed unavailable state', () => {
		mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
			buildMembersQueryResult({ data: { users: [], count: 0 } }),
		);
		mocks.toStaffTenantProfileMemberRows.mockReturnValue([]);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-table-empty'),
		).toBeTruthy();
		expect(screen.getByText('No members assigned yet')).toBeTruthy();
		expect(
			screen.queryByTestId('staff-tenant-profile-members-list-unavailable'),
		).toBeNull();
	});

	test('renders the no-match state when a search is active and no rows match', () => {
		mocks.search = { q: 'nobody' };
		mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
			buildMembersQueryResult({ data: { users: [], count: 0 } }),
		);
		mocks.toStaffTenantProfileMemberRows.mockReturnValue([]);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-table-no-match'),
		).toBeTruthy();
		expect(screen.getByText('No members match your search')).toBeTruthy();
	});

	test('renders the error state with a retry action when the members query fails', () => {
		const refetch = vi.fn();
		mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
			buildMembersQueryResult({
				data: undefined,
				isError: true,
				error: new Error('boom'),
				refetch,
			}),
		);
		mocks.toStaffTenantProfileMemberRows.mockReturnValue([]);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-members-table-error'),
		).toBeTruthy();

		fireEvent.click(screen.getByText('Retry'));
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	test('typing in the search box calls navigate with the committed q after debounce', async () => {
		vi.useFakeTimers();
		renderPage();

		const searchInput = screen.getByPlaceholderText(
			'Search members by name or email…',
		);
		fireEvent.change(searchInput, { target: { value: 'ada' } });

		await vi.advanceTimersByTimeAsync(400);

		expect(mocks.navigate).toHaveBeenCalled();
		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search: Record<string, unknown>;
		};
		expect(lastCall.search.q).toBe('ada');
		vi.useRealTimers();
	});

	// step4b-review MAJOR 5: the backend now supports sort_id=level (#875
	// follow-up) — clicking the Level header must emit it, and the query must
	// actually be called with it, proving the fix end-to-end from the UI.
	test('clicking the Level column header navigates with sort_id=level (the now-supported backend sort)', () => {
		renderPage();

		fireEvent.click(screen.getByText('Level'));

		expect(mocks.navigate).toHaveBeenCalledTimes(1);
		const call = mocks.navigate.mock.calls[0]?.[0] as {
			search: Record<string, unknown>;
		};
		expect(call.search).toMatchObject({
			sort_id: 'level',
			sort_order: 'asc',
		});
	});

	// step4b-review MAJOR 5: proves the fix end-to-end — if the URL already
	// carries sort_id=level (e.g. from the navigate above, or a deep link),
	// the members query must actually be called with it.
	test('requests sort_id=level from the members query when the URL already carries it', () => {
		mocks.search = { sortId: 'level', sortOrder: 'asc' };
		renderPage();

		const lastCall =
			mocks.useStaffTenantProfileMembersQuery.mock.calls[
				mocks.useStaffTenantProfileMembersQuery.mock.calls.length - 1
			];
		expect(lastCall?.[0]).toMatchObject({ sortId: 'level', sortOrder: 'asc' });
	});

	test('clicking next page advances pageIndex on the members query once more results exist', () => {
		mocks.useStaffTenantProfileMembersQuery.mockReturnValue(
			buildMembersQueryResult({ data: { users: MEMBER_ROWS, count: 50 } }),
		);

		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-members-table-next-page'),
		);

		const lastCall =
			mocks.useStaffTenantProfileMembersQuery.mock.calls[
				mocks.useStaffTenantProfileMembersQuery.mock.calls.length - 1
			];
		expect(lastCall?.[0]).toMatchObject({ pageIndex: 1 });
	});

	test('does not advance beyond the last page when no more results exist', () => {
		renderPage();

		const nextPageButton = screen.getByTestId(
			'staff-tenant-profile-members-table-next-page',
		);
		expect(nextPageButton.hasAttribute('disabled')).toBe(true);
	});

	// #999: a missing item count (the query still in flight for the destination
	// page) must be treated as UNKNOWN, not as zero. Treating it as zero makes
	// the page-clamp effect conclude "there are zero items" and immediately
	// revert page 2 back to page 1 — the [1, 2, 1] request sequence from the
	// issue. This mocks the query hook per-pageIndex, exactly like a real
	// fetch: page 0 resolves with a known count; page 1 is momentarily
	// in-flight with `data: undefined`.
	test('#999: does not clamp back to page 1 when the count is momentarily unavailable during a page transition', () => {
		mocks.useStaffTenantProfileMembersQuery.mockImplementation(
			(variables: { pageIndex: number }) =>
				variables.pageIndex === 0
					? buildMembersQueryResult({
							data: { users: MEMBER_ROWS, count: 25 },
						})
					: buildMembersQueryResult({ data: undefined, isFetching: true }),
		);

		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-members-table-next-page'),
		);

		expect(
			screen.getByTestId('staff-tenant-profile-members-table-page-label')
				.textContent,
		).toBe('Page 2');

		const requestedPageIndexes =
			mocks.useStaffTenantProfileMembersQuery.mock.calls.map(
				(call) => (call[0] as { pageIndex: number }).pageIndex,
			);
		// The bug reverts the LAST requested page back to 0 (displayed "Page 1")
		// once the effect observes the momentarily-missing count.
		expect(requestedPageIndexes.at(-1)).toBe(1);
	});

	// #999 review follow-up (warm-cache race): a deliberate reset (search,
	// sort, size, tenant, or profile change) must always win over a clamp
	// derived from an ALREADY-WARM cached count for the destination query —
	// not just an absent one. The "reset pageIndex to 0" effect and the
	// clamp effect both read the pre-reset (stale) pageIndex in the same
	// commit; if the clamp computes against that stale value using a known
	// (warm) count, it can overwrite the reset with some clamped-but-nonzero
	// page instead of page 1. This is a different route into the same
	// symptom the cold-path test above fixed.
	test('#999: a filter change resets to page 1 even when the new query is already warm with a known, smaller count', () => {
		mocks.useStaffTenantProfileMembersQuery.mockImplementation(
			(variables: { q?: string; pageIndex: number }) =>
				buildMembersQueryResult({
					data: {
						users: MEMBER_ROWS,
						// q="ada" is already warm in the cache with a SMALLER known
						// count (25, size 20 -> last page index 1) than the page the
						// reader is currently on (5) — never undefined/in-flight.
						count: variables.q === 'ada' ? 25 : 1000,
					},
				}),
		);

		const { rerender } = renderPage();
		const Component = Route.options.component as () => JSX.Element;

		const nextButton = screen.getByTestId(
			'staff-tenant-profile-members-table-next-page',
		);
		for (let index = 0; index < 5; index += 1) {
			fireEvent.click(nextButton);
		}
		expect(
			screen.getByTestId('staff-tenant-profile-members-table-page-label')
				.textContent,
		).toBe('Page 6');

		// Simulate the URL already reflecting a committed search change (the
		// route reads search via Route.useSearch()) while the local pageIndex
		// state (5) is preserved across the re-render, exactly as it would be
		// for a real navigation.
		mocks.search = { q: 'ada' };
		rerender(<Component />);

		expect(
			screen.getByTestId('staff-tenant-profile-members-table-page-label')
				.textContent,
		).toBe('Page 1');
	});
});

// step4b-review MAJOR 6: a large roster must scroll inside the table, never
// the app shell — mirrors the sibling contained-scroll test in
// staff/profiles/$profileId/users.test.tsx.
describe('StaffTenantProfileMembersPage — contained scroll layout', () => {
	test('gives the shell a bounded h-full/min-h-0 flex chain down to the DataTable', () => {
		renderPage();

		const shell = screen.getByTestId('staff-tenant-profile-members-page');
		expect(shell.getAttribute('data-body-scroll')).toBe('contained');

		const table = screen.getByTestId('staff-tenant-profile-members-table');

		const tabsContent = table.closest('.publy-detail-tab-body');
		expect(tabsContent).not.toBeNull();
		expect(tabsContent?.className).toContain('min-h-0');

		const tabsRoot = tabsContent?.closest('[data-slot="tabs"]');
		expect(tabsRoot).not.toBeNull();
		expect(tabsRoot?.className).toContain('min-h-0');
		expect(tabsRoot?.className).toContain('flex-1');
	});

	// #978: DataTable already renders its own `.publy-table-card` surface —
	// wrapping it in a `Card` produces two concentric rounded surfaces. This
	// route must render the table directly on the tab body, matching the
	// convention on staff/tenants.tsx and its siblings.
	test('#978: renders the table directly on the tab body, with no wrapping Card', () => {
		renderPage();

		const table = screen.getByTestId('staff-tenant-profile-members-table');
		expect(table.closest('[data-slot="card"]')).toBeNull();
	});
});

describe('makeProfileMemberColumns', () => {
	test('renders the first column as a link to the tenant user detail page using userId, not id', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
			'en',
		);
		const nameColumn = columns.find((column) => column.id === 'name');
		const row = { original: MEMBER_ROWS[0] };
		const cellRenderer = nameColumn?.cell as (props: {
			row: typeof row;
		}) => JSX.Element;

		render(<>{cellRenderer({ row })}</>);

		const userLink = screen.getByRole('link', {
			name: /Ada Lovelace/,
		}) as HTMLAnchorElement;
		expect(userLink.getAttribute('href')).toBe(
			`/staff/tenants/${TENANT_ID}/users/user-1`,
		);
		expect(screen.getByText('Ada Lovelace').className).toContain(
			'publy-record-link',
		);
	});

	test('renders the level chip using the shared level formatter', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
			'en',
		);
		const levelColumn = columns.find((column) => column.id === 'level');
		const cellRenderer = levelColumn?.cell as (props: {
			getValue: () => string | null;
		}) => JSX.Element;

		render(<>{cellRenderer({ getValue: () => 'Admin' })}</>);

		expect(screen.getByText('Admin')).toBeTruthy();
	});

	test('renders the status pill using the shared status formatter and tone', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
			'en',
		);
		const statusColumn = columns.find((column) => column.id === 'status');
		const cellRenderer = statusColumn?.cell as (props: {
			getValue: () => string | null;
		}) => JSX.Element;

		render(<>{cellRenderer({ getValue: () => 'Active' })}</>);

		expect(screen.getByText('Active')).toBeTruthy();
	});

	test('orders and labels the five design columns', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
			'en',
		);

		expect(columns.map((column) => column.id)).toEqual([
			'name',
			'level',
			'otherProfiles',
			'status',
			'joinedAt',
		]);
		expect(columns[2]?.header).toBe('Other profiles');
		expect(columns[4]?.header).toBe('Joined');
	});

	test('renders other-profile chips with overflow and the empty treatment', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
			'en',
		);
		const otherProfilesColumn = columns.find(
			(column) => column.id === 'otherProfiles',
		);
		const cellRenderer = otherProfilesColumn?.cell as (props: {
			row: { original: (typeof MEMBER_ROWS)[number] };
		}) => JSX.Element;

		const { rerender } = render(
			<>{cellRenderer({ row: { original: MEMBER_ROWS[0] } })}</>,
		);

		expect(screen.getByText('Editors').className).toContain(
			'publy-detail-chip',
		);
		expect(screen.getByText('Publishers')).toBeTruthy();
		expect(screen.queryByText('Reviewers')).toBeNull();
		expect(screen.getByText('+1')).toBeTruthy();

		rerender(<>{cellRenderer({ row: { original: MEMBER_ROWS[1] } })}</>);
		expect(screen.getByText('No other profiles')).toBeTruthy();
	});

	test('renders joined as month-year and uses a dash when joinedAt is null', () => {
		const columns = makeProfileMemberColumns(
			TENANT_ID,
			(key) => TRANSLATIONS[key] ?? key,
			'en',
		);
		const joinedColumn = columns.find((column) => column.id === 'joinedAt');
		const cellRenderer = joinedColumn?.cell as (props: {
			getValue: () => Date | null;
		}) => JSX.Element;

		const { rerender } = render(
			<>{cellRenderer({ getValue: () => MEMBER_ROWS[0].joinedAt })}</>,
		);
		expect(screen.getByText('Feb 2026')).toBeTruthy();

		rerender(<>{cellRenderer({ getValue: () => MEMBER_ROWS[1].joinedAt })}</>);
		expect(screen.getByText('—')).toBeTruthy();
	});
});
