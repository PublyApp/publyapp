/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantUserRows: vi.fn(),
	useStaffTenantUsersQuery: vi.fn(),
	suspendMutation: vi.fn(),
	reactivateMutation: vi.fn(),
	removeMutation: vi.fn(),
	useSuspendStaffTenantUserMutation: vi.fn(),
	useReactivateStaffTenantUserMutation: vi.fn(),
	useRemoveStaffTenantUserMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
		useSearch: () => mocks.search,
	}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: React.ReactNode;
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

const TRANSLATIONS: Record<string, string> = {
	basics: 'Basics',
	profiles: 'Profiles',
	invitations: 'Invitations',
	users: 'Users',
	members: 'Members',
	level: 'Level',
	status: 'Status',
	actions: 'Actions',
	'view-details': 'View details',
	edit: 'Edit',
	reactivate: 'Reactivate',
	suspend: 'Suspend',
	'remove-user-from-tenant': 'Remove from tenant',
	'all-statuses': 'All statuses',
	'all-levels': 'All levels',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-globally-suspended': 'Globally suspended',
	admin: 'Admin',
	user: 'User',
	'search-tenant-members': 'Search members by name or email…',
	'invite-people': 'Invite people',
	'tenant-users-tab-description': 'Everyone with access to this workspace.',
	clear: 'Clear',
	'suspend-tenant-user-description':
		'This user will lose access to this tenant. Are you sure you want to proceed?',
	'reactivate-tenant-user-description':
		'Access to this tenant will be restored. Are you sure you want to proceed?',
	'confirm-remove-user-from-tenant-details':
		'Are you sure you want to remove this user from this tenant? They will lose access to this tenant.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => TRANSLATIONS[key] ?? key,
		i18n: {
			language: 'en',
		},
	}),
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('~/components/error-views/View403', () => ({
	View403: () => <div data-testid="forbidden-view">forbidden</div>,
}));

vi.mock('~/lib/query/staff-tenant-users', () => ({
	STAFF_TENANT_USERS_QUERY_KEY: ['staff-tenants', 'users'],
	STAFF_TENANT_USER_DETAILS_QUERY_KEY: ['staff-tenants', 'users', 'detail'],
	toStaffTenantUserRows: mocks.toStaffTenantUserRows,
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
	useSuspendStaffTenantUserMutation: mocks.useSuspendStaffTenantUserMutation,
	useReactivateStaffTenantUserMutation:
		mocks.useReactivateStaffTenantUserMutation,
	useRemoveStaffTenantUserMutation: mocks.useRemoveStaffTenantUserMutation,
	useInviteTenantUserMutation: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./_invite-user-drawer', () => ({
	InviteTenantUserDrawer: ({ isOpen }: { isOpen: boolean }) =>
		isOpen ? <div data-testid="invite-drawer-open" /> : null,
}));

import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	makeTenantUserColumns,
	parseTenantUserLevelFilter,
	parseTenantUserStatusFilter,
	Route,
	tenantUserLevelChipClassName,
} from './users';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

const identityT = (key: string) => TRANSLATIONS[key] ?? key;

describe('staff tenant users route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useSuspendStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.suspendMutation,
			isPending: false,
		});
		mocks.useReactivateStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.reactivateMutation,
			isPending: false,
		});
		mocks.useRemoveStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.removeMutation,
			isPending: false,
		});
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: null,
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		});
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		mocks.toStaffTenantUserRows.mockReturnValue([
			{
				id: 'user-1',
				displayName: 'Alex Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				firstName: 'Alex',
				lastName: 'Johnson',
				avatarUrl: null,
			},
		]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'user-1',
							firstName: 'Alex',
							lastName: 'Johnson',
							email: 'alex@example.com',
							level: 'Admin',
							status: 'Active',
						},
					],
					nextCursor: null,
				},
			}),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the shared tenant shell with users active, the members title, and the default list query state', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-users-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: /Alex Johnson/ }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users/user-1');
		expect(
			screen.getByText('Users', { selector: 'span[aria-current="page"]' }),
		).toBeTruthy();
		const title = screen.getByRole('heading', { name: /Members/ });
		expect(title).toBeTruthy();
		// The Users tab MAY show the honest usersCount field from tenant details.
		expect(title.textContent).toContain('12');
		expect(screen.getByText('Alex Johnson')).toBeTruthy();
		expect(screen.getByText('alex@example.com')).toBeTruthy();
		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
		expect(
			screen.getByRole('link', { name: 'Profiles' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		expect(screen.getByRole('button', { name: 'Invite people' })).toBeTruthy();
		expect(mocks.useStaffTenantUsersQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				q: undefined,
				status: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: undefined,
				size: 100,
			},
			{ enabled: true },
		);
	});

	test('invite people button navigates to open the invite drawer via search state', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ invite: 1 }),
				replace: true,
			}),
		);
	});

	test('renders the invite drawer open when the invite search param is set', () => {
		mocks.search = { invite: 1 };
		renderPage();

		expect(screen.getByTestId('invite-drawer-open')).toBeTruthy();
	});

	test('does not render a checkbox column or a Last active column', () => {
		renderPage();

		expect(screen.queryByLabelText('Select all rows')).toBeNull();
		expect(screen.queryByText('Last active')).toBeNull();
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'alex' };
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-users-table-no-match'),
		).toBeTruthy();
		expect(screen.getByText('No tenant users match your search.')).toBeTruthy();
	});

	test('shows a reactivate action for a suspended user and a suspend action for an active one', async () => {
		mocks.toStaffTenantUserRows.mockReturnValue([
			{
				id: 'user-1',
				displayName: 'Alex Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				firstName: 'Alex',
				lastName: 'Johnson',
				avatarUrl: null,
			},
			{
				id: 'user-2',
				displayName: 'Jamie Lee',
				email: 'jamie@example.com',
				level: 'User',
				status: 'Suspended',
				firstName: 'Jamie',
				lastName: 'Lee',
				avatarUrl: null,
			},
		]);

		renderPage();

		const triggers = screen.getAllByRole('button', { name: /^Actions for/ });
		fireEvent.click(triggers[0]);
		expect(
			await screen.findByRole('menuitem', { name: 'Suspend' }),
		).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).toBeNull();

		fireEvent.click(triggers[0]);
		fireEvent.click(triggers[1]);
		expect(
			await screen.findByRole('menuitem', { name: 'Reactivate' }),
		).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Suspend' })).toBeNull();
	});

	test('suspends a user after explicit confirmation and invalidates tenant user queries', async () => {
		mocks.suspendMutation.mockResolvedValue({});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Suspend' })).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.suspendMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'user-1',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants', 'users'],
			}),
		);
	});

	test('removes a user from the tenant after explicit confirmation', async () => {
		mocks.removeMutation.mockResolvedValue({});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(
			await screen.findByRole('menuitem', { name: 'Remove from tenant' }),
		);

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Remove from tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(
			screen
				.getAllByRole('button', { name: 'Remove from tenant' })
				.slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.removeMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'user-1',
			}),
		);
	});

	test('renders the not-found view without logging out for a malformed id', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid tenantId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('keeps the user on the page for 403 query failures', () => {
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-users-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders the table error state without logging out for ordinary problem failures', () => {
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 500,
					responseStatusCode: 500,
					title: 'Server Error',
					detail: 'Unexpected failure',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-users-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout only when the tenant users query returns a 401 auth failure', () => {
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 401,
					responseStatusCode: 401,
					title: 'Unauthorized',
					detail: 'Session expired',
				},
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});

describe('makeTenantUserColumns column widths', () => {
	test('applies a fixed width to every column except the fluid name column', () => {
		const columns = makeTenantUserColumns(
			'11111111-1111-1111-1111-111111111111',
			identityT,
			() => undefined,
		);
		const widthById = Object.fromEntries(
			columns.map((column) => [column.id, column.meta?.width]),
		);

		expect(widthById).toEqual({
			name: undefined,
			level: '150px',
			status: '130px',
			actions: '40px',
		});
	});
});

describe('tenant user level chip mapping', () => {
	test('maps Admin to the amber chip and User to the neutral chip', () => {
		expect(tenantUserLevelChipClassName('Admin')).toContain('--amber');
		expect(tenantUserLevelChipClassName('User')).toContain('--outline');
		expect(tenantUserLevelChipClassName(null)).toContain('--outline');
	});

	test('formats level labels through i18n', () => {
		expect(formatTenantUserLevelLabel('Admin', identityT)).toBe('Admin');
		expect(formatTenantUserLevelLabel('User', identityT)).toBe('User');
	});
});

describe('tenant user status label mapping', () => {
	test('maps the three real tenant-user statuses honestly', () => {
		expect(formatTenantUserStatusLabel('Active', identityT)).toBe('Active');
		expect(formatTenantUserStatusLabel('Suspended', identityT)).toBe(
			'Suspended',
		);
		expect(formatTenantUserStatusLabel('GloballySuspended', identityT)).toBe(
			'Globally suspended',
		);
	});
});

describe('parseTenantUserStatusFilter', () => {
	test('parses known comma-separated statuses and drops unknown tokens', () => {
		expect(parseTenantUserStatusFilter('active,bogus,suspended')).toEqual([
			'active',
			'suspended',
		]);
		expect(parseTenantUserStatusFilter(undefined)).toEqual([]);
	});
});

describe('parseTenantUserLevelFilter', () => {
	test('parses known comma-separated levels, drops unknown tokens, and dedupes', () => {
		expect(parseTenantUserLevelFilter('admin,bogus,user,admin')).toEqual([
			'admin',
			'user',
		]);
		expect(parseTenantUserLevelFilter(undefined)).toEqual([]);
	});
});

describe('level filter wiring on the users list query', () => {
	test('passes the level search param through to the tenant users query', () => {
		mocks.search = { level: 'admin' };

		renderPage();

		expect(mocks.useStaffTenantUsersQuery).toHaveBeenCalledWith(
			expect.objectContaining({ level: 'admin' }),
			{ enabled: true },
		);
	});
});
