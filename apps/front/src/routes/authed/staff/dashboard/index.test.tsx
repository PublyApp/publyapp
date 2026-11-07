/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	tenantsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	invitationsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	auditQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
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

vi.mock('~/lib/query/staff-invitations', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-invitations')>();

	return {
		...actual,
		useStaffInvitationsQuery: vi.fn(() => mocks.invitationsQuery),
	};
});

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useStaffAuditLogsQuery: vi.fn(() => mocks.auditQuery),
	};
});

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('@tanstack/react-router', () => ({
	useRouter: () => ({ invalidate: vi.fn() }),
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
	'dashboard-kpi-active-tenants': 'Active organisations',
	'dashboard-kpi-members': 'Organisation members',
	'dashboard-kpi-audit-events': 'Audit events',
	'dashboard-kpi-pending-invitations': 'Pending invitations',
	'dashboard-vs-previous-30d': 'vs previous 30 days',
	'dashboard-last-30d': 'Last 30 days',
	'dashboard-card-growth': 'Organisation growth',
	'dashboard-note-growth': 'Active organisations per day',
	'dashboard-card-status': 'Organisations by status',
	'dashboard-note-status': 'Lifecycle status of every organisation',
	'dashboard-card-heatmap': 'Platform activity',
	'dashboard-heatmap-note-empty': 'Audit events per day',
	'dashboard-card-invitation-outcomes': 'Invitation outcomes',
	'dashboard-note-invitation-outcomes': 'Staff invitations sent over 30 days',
	'dashboard-card-latest-tenants': 'Latest organisations',
	'dashboard-note-latest-tenants':
		'The five most recently created organisations.',
	'dashboard-card-pending-invitations': 'Pending invitations',
	'dashboard-note-pending-invitations':
		'Staff invitations sent but not accepted yet.',
	'dashboard-view-all': 'View all',
	'dashboard-view-chart': 'Chart',
	'dashboard-view-table': 'Table',
	'dashboard-col-day': 'Day',
	'dashboard-col-active-orgs': 'Active organisations',
	'dashboard-col-status': 'Status',
	'dashboard-col-invitations': 'Invitations',
	'dashboard-col-share': 'Share',
	'dashboard-col-invited-email': 'Invited email',
	'dashboard-col-profile': 'Profile',
	'dashboard-col-invited-by': 'Invited by',
	'dashboard-col-expiry': 'Expiry',
	'dashboard-status-active': 'Active',
	'dashboard-status-pending': 'Pending',
	'dashboard-status-suspended': 'Suspended',
	'dashboard-filter-period': 'Period',
	'dashboard-filter-organisations': 'Organisations',
	'dashboard-period-30d': 'Last 30 days',
	'dashboard-org-all': 'All organisations',
	'dashboard-invitations-sent': 'Sent',
	'dashboard-invitations-accepted': 'Accepted',
	'dashboard-invitations-expired': 'Expired',
	'dashboard-invitations-revoked': 'Revoked',
	'tenant-member-count': '{{count}} members',
	'dashboard-ghost-tag': 'No data yet',
	'dashboard-ghost-card-growth':
		'The active-organisations curve will be drawn here, day by day.',
	'dashboard-ghost-card-heatmap':
		'Each square will become one day of platform activity.',
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

const Overview = Route.options.component as ComponentType;

const tenantCounts = {
	total: 38,
	active: 31,
	pending: 4,
	suspended: 3,
	members: 1284,
};

const invitationCounts = {
	total: 24,
	pending: 5,
	accepted: 15,
	expired: 5,
	revoked: 4,
};

const withData = () => {
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
		counts: tenantCounts,
	};
	mocks.invitationsQuery.data = {
		data: [
			{
				id: '0197b8f0-3333-7ccc-8ccc-cccccccccc02',
				email: 'new-hire@example.com',
				roleName: 'Support',
				invitedByName: 'Ada Admin',
				expiresAt: new Date(Date.now() + 5 * 86_400_000),
			},
		],
		nextCursor: null,
		counts: invitationCounts,
	};
	mocks.auditQuery.data = {
		data: [],
		nextCursor: null,
		totalCount: 4812,
		counts: { today: 0, last30Days: 0, byAction: [], byActor: [] },
	};
};

const resetMocks = () => {
	for (const query of [
		mocks.tenantsQuery,
		mocks.invitationsQuery,
		mocks.auditQuery,
	]) {
		query.isPending = false;
		query.isError = false;
		query.error = null;
		query.data = undefined;
	}
	mocks.shouldLogoutForFailure.mockReturnValue(false);
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resetMocks();
});

describe('staff dashboard overview', () => {
	test('renders the four KPIs from the API counts', () => {
		withData();
		render(<Overview />);

		expect(
			screen.getByTestId('staff-dashboard-kpi-active-tenants'),
		).toBeTruthy();
		expect(
			within(
				screen.getByTestId('staff-dashboard-kpi-active-tenants'),
			).getByText('31'),
		).toBeTruthy();
		expect(screen.getByText('1,284')).toBeTruthy();
		expect(screen.getByText('4,812')).toBeTruthy();
		// Pending invitations appears twice: the KPI label and the card title.
		expect(screen.getAllByText('Pending invitations').length).toBeGreaterThan(
			0,
		);
	});

	test('renders the six prototype cards with the segmented chart/table toggle', () => {
		withData();
		render(<Overview />);

		for (const label of [
			'Organisation growth',
			'Organisations by status',
			'Platform activity',
			'Invitation outcomes',
			'Latest organisations',
		]) {
			expect(screen.getByText(label)).toBeTruthy();
		}

		// The invitation-outcomes table is hidden until « Table » is pressed.
		expect(screen.queryByText('Status')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Table' }));
		expect(screen.getByText('Status')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Chart' }));
		expect(screen.queryByText('Status')).toBeNull();
	});

	test('draws a ghost (not « — ») for the series the API does not provide', () => {
		withData();
		render(<Overview />);

		// Growth series and the heatmap have no endpoint yet: each card draws
		// its own chart as a ghost, with the tag and its own sentence.
		const growth = screen.getByTestId('staff-dashboard-growth');
		expect(within(growth).getByText('No data yet')).toBeTruthy();
		expect(
			within(growth).getByText(
				'The active-organisations curve will be drawn here, day by day.',
			),
		).toBeTruthy();
		expect(
			growth.querySelectorAll('svg[aria-hidden="true"]').length,
		).toBeGreaterThan(0);
		// No table without data: the switch steps aside on a ghost card.
		expect(within(growth).queryByRole('button', { name: 'Table' })).toBeNull();

		const heatmap = screen.getByTestId('staff-dashboard-heatmap');
		expect(within(heatmap).getByText('No data yet')).toBeTruthy();
		expect(
			within(heatmap).getByText(
				'Each square will become one day of platform activity.',
			),
		).toBeTruthy();
	});

	test('shows « — » in a KPI only when its figure is missing', () => {
		withData();
		const tenantsData = mocks.tenantsQuery.data;
		if (tenantsData) {
			tenantsData.counts = { ...tenantCounts, active: 0 };
		}
		render(<Overview />);

		// A real zero is a figure, never « — ».
		expect(
			within(
				screen.getByTestId('staff-dashboard-kpi-active-tenants'),
			).getByText('0'),
		).toBeTruthy();
		// The delta/sparkline series has no endpoint: the footer is the ghost.
		expect(screen.getAllByText('No data yet').length).toBeGreaterThanOrEqual(5);
	});

	test('renders the latest tenants and pending invitations rows', () => {
		withData();
		render(<Overview />);

		expect(screen.getByText('Acme Corp')).toBeTruthy();
		expect(screen.getByText('12 members')).toBeTruthy();
		expect(screen.getByText('new-hire@example.com')).toBeTruthy();
		expect(screen.getByText('Ada Admin')).toBeTruthy();
		expect(screen.getByText('Support')).toBeTruthy();

		const tenantsLink = screen.getByTestId(
			'staff-dashboard-latest-tenants-view-all',
		);
		expect(tenantsLink.getAttribute('href')).toBe('/staff/tenants');
		const invitationsLink = screen.getByTestId(
			'staff-dashboard-pending-invitations-view-all',
		);
		expect(invitationsLink.getAttribute('href')).toBe('/staff/invitations');
	});

	test('renders the unknown figure while a query is pending', () => {
		withData();
		mocks.tenantsQuery.isPending = true;
		mocks.tenantsQuery.data = undefined;

		render(<Overview />);

		expect(screen.getByTestId('staff-dashboard-status-skeleton')).toBeTruthy();
		expect(
			screen.getByTestId('staff-dashboard-latest-tenants-skeleton'),
		).toBeTruthy();
		expect(screen.getAllByText('—').length).toBeGreaterThan(0);
	});

	test('an auth failure on any query logs out through the shared path', () => {
		withData();
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.auditQuery.error = new Error('401');

		render(<Overview />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
