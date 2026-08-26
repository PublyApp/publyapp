/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/** A staff list endpoint's page payload, as the query hooks expose it. */
type StaffListPage = {
	data: Array<Record<string, unknown>>;
	nextCursor: string | null;
};

const mocks = vi.hoisted(() => ({
	tenantsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as StaffListPage | undefined,
		refetch: vi.fn(),
	},
	usersQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as StaffListPage | undefined,
		refetch: vi.fn(),
	},
	invitationsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as StaffListPage | undefined,
		refetch: vi.fn(),
	},
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('~/lib/query/staff-tenants', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenants')>();

	return {
		...actual,
		useStaffTenantsQuery: vi.fn(() => mocks.tenantsQuery),
	};
});

vi.mock('~/lib/query/staff-users', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-users')>();

	return {
		...actual,
		useStaffUsersQuery: vi.fn(() => mocks.usersQuery),
	};
});

vi.mock('~/lib/query/staff-invitations', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-invitations')>();

	return {
		...actual,
		useStaffInvitationsQuery: vi.fn(() => mocks.invitationsQuery),
	};
});

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
	Link: ({
		to,
		children,
		...props
	}: {
		to: string;
		children: React.ReactNode;
		[key: string]: unknown;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
}));

const EN_LABELS: TestLabelMap = {
	'nav-tenants': 'Tenants',
	'staff-users': 'Staff members',
	'pending-invitations': 'Pending invitations',
	'view-all': 'View all',
	retry: 'Retry',
	'overview-empty-tenants': 'No tenants yet',
	'overview-empty-staff': 'No staff members yet',
	'overview-empty-invitations': 'No pending invitations',
	'overview-error-title': "Couldn't load this summary",
	'status-active': 'Active',
	'status-pending': 'Pending',
	'tenant-member-count': '{{count}} members',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let label = EN_LABELS[key] ?? key;
			if (options && typeof options.count === 'number') {
				label = label.replace('{{count}}', String(options.count));
			}
			return label;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './index';

const StaffDashboardOverviewTab = Route.options.component as ComponentType;

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.tenantsQuery.isPending = false;
	mocks.tenantsQuery.error = null;
	mocks.usersQuery.isPending = false;
	mocks.usersQuery.error = null;
	mocks.invitationsQuery.isPending = false;
	mocks.invitationsQuery.error = null;
});

describe('StaffDashboardOverviewTab', () => {
	test('renders the mapped platform summary from the three staff queries', () => {
		mocks.tenantsQuery.data = {
			data: [
				{
					id: '0197b8f0-3333-7ccc-8ccc-cccccccccc01',
					name: 'Acme Corp',
					logoUrl: null,
					status: 'active',
					usersCount: 12,
					maxUsers: 25,
				},
			],
			nextCursor: null,
		};
		mocks.usersQuery.data = {
			data: [
				{
					id: '0197b8f0-3333-7ccc-8ccc-cccccccccc02',
					email: 'grace@example.com',
					firstName: 'Grace',
					lastName: 'Hopper',
					avatarUrl: null,
					level: 'admin',
					status: 'active',
				},
			],
			nextCursor: null,
		};
		mocks.invitationsQuery.data = {
			data: [
				{
					id: '0197b8f0-3333-7ccc-8ccc-cccccccccc03',
					email: 'new-hire@example.com',
					invitedByName: 'Ada Admin',
				},
			],
			nextCursor: null,
		};

		render(<StaffDashboardOverviewTab />);

		expect(screen.getByTestId('staff-dashboard-overview-panel')).toBeTruthy();

		expect(screen.getByText('Acme Corp')).toBeTruthy();
		expect(screen.getByText('12 members')).toBeTruthy();
		expect(screen.getByText('Grace Hopper')).toBeTruthy();
		expect(screen.getByText('new-hire@example.com')).toBeTruthy();
		expect(screen.getByText('Ada Admin')).toBeTruthy();

		const tenantLinks = screen
			.getAllByRole('link')
			.filter((link) => link.getAttribute('href') === '/staff/tenants');
		expect(tenantLinks.length).toBeGreaterThan(0);
	});

	test('shows honest empty states when the platform has no data yet', () => {
		mocks.tenantsQuery.data = { data: [], nextCursor: null };
		mocks.usersQuery.data = { data: [], nextCursor: null };
		mocks.invitationsQuery.data = { data: [], nextCursor: null };

		render(<StaffDashboardOverviewTab />);

		expect(
			screen.getByTestId('staff-dashboard-overview-tenants-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('staff-dashboard-overview-staff-empty'),
		).toBeTruthy();
		expect(
			screen.getByTestId('staff-dashboard-overview-invitations-empty'),
		).toBeTruthy();
	});

	test('each summary card renders its own error state with retry', async () => {
		mocks.tenantsQuery.data = { data: [], nextCursor: null };
		mocks.usersQuery.data = { data: [], nextCursor: null };
		mocks.invitationsQuery.data = { data: [], nextCursor: null };
		mocks.tenantsQuery.error = new Error('boom');

		const user = userEvent.setup();
		render(<StaffDashboardOverviewTab />);

		expect(
			screen.getByTestId('staff-dashboard-overview-tenants-error'),
		).toBeTruthy();
		// The other two cards still render their data states.
		expect(
			screen.getByTestId('staff-dashboard-overview-staff-empty'),
		).toBeTruthy();

		await user.click(screen.getByText('Retry'));
		await waitFor(() => {
			expect(mocks.tenantsQuery.refetch).toHaveBeenCalled();
		});
	});

	test('an auth failure on any query logs out through the shared path', () => {
		mocks.tenantsQuery.data = { data: [], nextCursor: null };
		mocks.usersQuery.data = { data: [], nextCursor: null };
		mocks.invitationsQuery.data = { data: [], nextCursor: null };
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.usersQuery.error = new Error('401');

		render(<StaffDashboardOverviewTab />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
