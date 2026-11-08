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

type DashboardSearch = { period?: string; scope?: string };

type QueryMock = {
	isPending: boolean;
	isError: boolean;
	error: Error | null;
	data: Record<string, unknown> | undefined;
	refetch: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
	countsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	latestTenantsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	pendingInvitationsQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	invitationOutcomesQuery: {
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
	seriesQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	previousSeriesQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	heatmapQuery: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	search: {} as DashboardSearch,
	navigate: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

const useStaffTenantsQuery = vi.hoisted(() => vi.fn());
const useStaffInvitationsQuery = vi.hoisted(() => vi.fn());
const useStaffAuditLogsQuery = vi.hoisted(() => vi.fn());
const useStaffDashboardSeriesQuery = vi.hoisted(() => vi.fn());

vi.mock('~/lib/query/staff-tenants', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenants')>();

	return { ...actual, useStaffTenantsQuery };
});

vi.mock('~/lib/query/staff-invitations', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-invitations')>();

	return { ...actual, useStaffInvitationsQuery };
});

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return { ...actual, useStaffAuditLogsQuery };
});

vi.mock('~/lib/query/staff-dashboard', () => ({
	useStaffDashboardSeriesQuery,
}));

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
		useSearch: () => mocks.search,
		useNavigate: () => mocks.navigate,
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
	'dashboard-card-growth': 'Organisation growth',
	'dashboard-note-growth': 'Active organisations per day',
	'dashboard-card-status': 'Organisations by status',
	'dashboard-note-status': 'Lifecycle status of every organisation',
	'dashboard-card-heatmap': 'Platform activity',
	'dashboard-heatmap-note-empty': 'Audit events per day',
	'dashboard-heatmap-note-weeks':
		'Audit events per day over the last {{count}} weeks',
	'dashboard-delta-vs-previous': 'vs {{period}}',
	'dashboard-period-previous-30d': 'previous 30 days',
	'dashboard-card-invitation-outcomes': 'Invitation outcomes',
	'dashboard-note-invitation-outcomes': 'Staff invitations, by final status',
	'dashboard-card-latest-tenants': 'Latest organisations',
	'dashboard-note-latest-tenants':
		'The five most recently created organisations.',
	'dashboard-note-pending-invitations':
		'Staff invitations sent but not accepted yet.',
	'dashboard-view-all': 'View all',
	'dashboard-view-chart': 'Chart',
	'dashboard-view-table': 'Table',
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
	'dashboard-ghost-card-status':
		'The split of organisations by status will appear here.',
	'dashboard-ghost-card-invitation-outcomes':
		'What happens to invitations: accepted, expired or revoked.',
	'overview-empty-tenants': 'No organizations yet.',
	'overview-empty-invitations': 'No pending invitations right now.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let label = EN_LABELS[key] ?? key;
			if (options) {
				for (const [name, value] of Object.entries(options)) {
					label = label.replace(`{{${name}}}`, String(value));
				}
			}
			return label;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { addIsoDays, periodStart, todayIso } from './_dashboard-filters';
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

/** The facets of the status-filtered tenants query: the whole-platform counts
 * must never come from here (B3). */
const suspendedTenantCounts = {
	total: 3,
	active: 0,
	pending: 0,
	suspended: 3,
	members: 40,
};

const outcomeCounts = {
	total: 24,
	pending: 5,
	accepted: 15,
	expired: 0,
	revoked: 4,
};

const withData = () => {
	mocks.countsQuery.data = {
		data: [],
		nextCursor: null,
		counts: tenantCounts,
	};
	mocks.latestTenantsQuery.data = {
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
	mocks.pendingInvitationsQuery.data = {
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
		counts: { total: 5, pending: 5, accepted: 0, expired: 0, revoked: 0 },
	};
	mocks.invitationOutcomesQuery.data = {
		data: [],
		nextCursor: null,
		counts: outcomeCounts,
	};
	mocks.auditQuery.data = {
		data: [],
		nextCursor: null,
		totalCount: 4812,
		counts: { today: 0, last30Days: 0, byAction: [], byActor: [] },
	};
	const today = todayIso();
	const points = (days: number, value: number) =>
		Array.from({ length: days }, (_, index) => ({
			date: addIsoDays(today, -(days - 1 - index)),
			value,
		}));
	mocks.seriesQuery.data = { points: points(30, 160) };
	mocks.previousSeriesQuery.data = { points: points(30, 148) };
	mocks.heatmapQuery.data = { points: points(365, 12) };
};

const resetMocks = () => {
	for (const query of [
		mocks.countsQuery,
		mocks.latestTenantsQuery,
		mocks.pendingInvitationsQuery,
		mocks.invitationOutcomesQuery,
		mocks.auditQuery,
		mocks.seriesQuery,
		mocks.previousSeriesQuery,
		mocks.heatmapQuery,
	] as QueryMock[]) {
		query.isPending = false;
		query.isError = false;
		query.error = null;
		query.data = undefined;
	}
	mocks.search = {};
	mocks.shouldLogoutForFailure.mockReturnValue(false);
	useStaffTenantsQuery.mockImplementation((variables: { size?: number }) =>
		variables.size === 5 ? mocks.latestTenantsQuery : mocks.countsQuery,
	);
	useStaffInvitationsQuery.mockImplementation(
		(variables: { status?: string }) =>
			variables.status === 'pending'
				? mocks.pendingInvitationsQuery
				: mocks.invitationOutcomesQuery,
	);
	useStaffAuditLogsQuery.mockImplementation(() => mocks.auditQuery);
	useStaffDashboardSeriesQuery.mockImplementation(
		(variables: { startDate: string; endDate: string }) => {
			if (variables.startDate <= addIsoDays(todayIso(), -300)) {
				return mocks.heatmapQuery;
			}
			if (variables.endDate !== todayIso()) {
				return mocks.previousSeriesQuery;
			}
			return mocks.seriesQuery;
		},
	);
};

resetMocks();

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
			within(
				screen.getByTestId('staff-dashboard-kpi-active-tenants'),
			).getByText('31'),
		).toBeTruthy();
		expect(screen.getByText('1,284')).toBeTruthy();
		expect(screen.getByText('4,812')).toBeTruthy();
		expect(
			within(
				screen.getByTestId('staff-dashboard-kpi-pending-invitations'),
			).getByText('5'),
		).toBeTruthy();
	});

	test('the invitation outcomes come from the unfiltered query, not the pending-only one (B2)', () => {
		withData();
		render(<Overview />);

		// The pending-only response claims 5 sent and 0 accepted; the unfiltered
		// one says 24 sent / 15 accepted. The card must show the latter.
		const card = screen.getByTestId('staff-dashboard-invitation-outcomes');
		expect(within(card).getByText('24')).toBeTruthy();
		// « 15 · 62,5 % »: the figure and its share share one span.
		expect(within(card).getByText(/^15 ·/)).toBeTruthy();
		expect(useStaffInvitationsQuery).toHaveBeenCalledWith({ size: 1 });
	});

	test('the organisations filter never reaches the KPI counts or the status donut (B3)', () => {
		withData();
		mocks.search = { scope: 'suspended' };
		mocks.latestTenantsQuery.data = {
			data: [],
			nextCursor: null,
			counts: suspendedTenantCounts,
		};

		render(<Overview />);

		// The KPI stays whole-platform: « Actives » reads 31, never the
		// filtered query's 0.
		expect(
			within(
				screen.getByTestId('staff-dashboard-kpi-active-tenants'),
			).getByText('31'),
		).toBeTruthy();
		// The donut keeps its three real segments.
		const status = screen.getByTestId('staff-dashboard-status');
		expect(within(status).getByText('Active')).toBeTruthy();
		expect(within(status).getByText('31')).toBeTruthy();
		// Only the latest-organisations list follows the filter.
		expect(useStaffTenantsQuery).toHaveBeenCalledWith({ size: 1 });
		expect(useStaffTenantsQuery).toHaveBeenCalledWith({
			size: 5,
			sortId: 'created_at',
			sortOrder: 'desc',
			status: 'suspended',
		});
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

	test('draws a ghost (not « — ») for the one series the API does not provide', () => {
		withData();
		render(<Overview />);

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
		expect(within(growth).queryByRole('button', { name: 'Table' })).toBeNull();
	});

	test('draws the real heatmap and the audit-events delta from the series endpoint', () => {
		withData();
		render(<Overview />);

		const heatmap = screen.getByTestId('staff-dashboard-heatmap');
		expect(within(heatmap).queryByText('No data yet')).toBeNull();
		expect(
			heatmap.querySelector('[data-testid="staff-dashboard-heatmap-grid"]'),
		).not.toBeNull();
		expect(
			within(heatmap).getByText('Audit events per day over the last 53 weeks'),
		).toBeTruthy();

		const kpi = screen.getByTestId('staff-dashboard-kpi-audit-events');
		expect(
			within(kpi).getByTestId('staff-dashboard-kpi-audit-events-delta'),
		).toBeTruthy();
		expect(within(kpi).getByText('Last 30 days')).toBeTruthy();
	});

	test('a real zero KPI shows « 0 », never « — » nor the ghost footer', () => {
		withData();
		const counts = mocks.countsQuery.data;
		if (counts) {
			counts.counts = { ...tenantCounts, active: 0 };
		}
		render(<Overview />);

		// A real zero is a figure, never « — ».
		const card = screen.getByTestId('staff-dashboard-kpi-active-tenants');
		expect(within(card).getByText('0')).toBeTruthy();
		expect(within(card).queryByText('—')).toBeNull();
		expect(within(card).queryByText('No data yet')).toBeNull();
	});

	test('a KPI with a real figure never carries the ghost footer (BLOCKING 2)', () => {
		withData();
		render(<Overview />);

		const card = screen.getByTestId('staff-dashboard-kpi-active-tenants');
		expect(within(card).getByText('31')).toBeTruthy();
		expect(within(card).queryByText('No data yet')).toBeNull();
		// The ghost footer's 36 px stays, so the figure does not jump.
		expect(card.querySelector('.min-h-10')).toBeTruthy();
	});

	test('a failed KPI request shows the error state, never the ghost (B4)', () => {
		withData();
		mocks.countsQuery.isError = true;
		mocks.countsQuery.error = new Error('500');

		render(<Overview />);

		const card = screen.getByTestId('staff-dashboard-kpi-active-tenants');
		expect(
			within(card).getByTestId('staff-dashboard-kpi-active-tenants-error'),
		).toBeTruthy();
		expect(within(card).queryByText('No data yet')).toBeNull();
	});

	test('a pending KPI request shows the existing skeleton (B4)', () => {
		withData();
		mocks.countsQuery.isPending = true;
		mocks.countsQuery.data = undefined;

		render(<Overview />);

		expect(
			screen.getByTestId('staff-dashboard-kpi-active-tenants-skeleton'),
		).toBeTruthy();
		expect(screen.getByTestId('staff-dashboard-status-skeleton')).toBeTruthy();
	});

	test('an empty list is the existing empty state, never « — » (B6)', () => {
		withData();
		mocks.latestTenantsQuery.data = {
			data: [],
			nextCursor: null,
			counts: tenantCounts,
		};
		mocks.pendingInvitationsQuery.data = {
			data: [],
			nextCursor: null,
			counts: { total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 },
		};

		render(<Overview />);

		expect(
			screen.getByTestId('staff-dashboard-latest-tenants-empty'),
		).toBeTruthy();
		expect(screen.getByText('No organizations yet.')).toBeTruthy();
		expect(
			screen.getByTestId('staff-dashboard-pending-invitations-empty'),
		).toBeTruthy();
		expect(screen.getByText('No pending invitations right now.')).toBeTruthy();
	});

	test('a real empty platform still draws the status donut with its 0 (B6)', () => {
		withData();
		mocks.countsQuery.data = {
			data: [],
			nextCursor: null,
			counts: { total: 0, active: 0, pending: 0, suspended: 0, members: 0 },
		};

		render(<Overview />);

		const status = screen.getByTestId('staff-dashboard-status');
		expect(
			within(status).getByRole('img', { name: 'Organisations' }),
		).toBeTruthy();
		expect(within(status).queryByText('—')).toBeNull();
	});

	test('the period and scope filters drive the API through the URL (N4)', () => {
		withData();
		mocks.search = { period: '7d', scope: 'active' };
		const expectedStart = periodStart('7d');

		render(<Overview />);

		expect(useStaffAuditLogsQuery).toHaveBeenCalledWith({
			size: 1,
			startDate: expectedStart,
		});
		expect(useStaffTenantsQuery).toHaveBeenCalledWith({
			size: 5,
			sortId: 'created_at',
			sortOrder: 'desc',
			status: 'active',
		});
	});

	test('renders the latest tenants and pending invitations rows', () => {
		withData();
		render(<Overview />);

		expect(screen.getByText('Acme Corp')).toBeTruthy();
		expect(screen.getByText('12 members')).toBeTruthy();
		// The table and the stacked phone cards both render in jsdom.
		expect(screen.getAllByText('new-hire@example.com').length).toBeGreaterThan(
			0,
		);
		expect(screen.getAllByText('Ada Admin').length).toBeGreaterThan(0);

		const tenantsLink = screen.getByTestId(
			'staff-dashboard-latest-tenants-view-all',
		);
		expect(tenantsLink.getAttribute('href')).toBe('/staff/tenants');
		const invitationsLink = screen.getByTestId(
			'staff-dashboard-pending-invitations-view-all',
		);
		expect(invitationsLink.getAttribute('href')).toBe('/staff/invitations');
	});

	test('the invitation expiry day is the viewer-local day, never the UTC day (2339)', () => {
		withData();
		// 22:30 UTC is already the next day at UTC+14 (Pacific/Kiritimati), so
		// the UTC slice and the viewer's local day disagree on this row.
		const expiry = new Date('2099-01-01T22:30:00Z');
		mocks.pendingInvitationsQuery.data = {
			data: [
				{
					id: '0197b8f0-3333-7ccc-8ccc-cccccccccc02',
					email: 'new-hire@example.com',
					roleName: 'Support',
					invitedByName: 'Ada Admin',
					expiresAt: expiry,
				},
			],
			nextCursor: null,
			counts: { total: 1, pending: 1, accepted: 0, expired: 0, revoked: 0 },
		};

		render(<Overview />);

		// The react-i18next mock above resolves the locale to « en ».
		const card = screen.getByTestId('staff-dashboard-pending-invitations');
		// The prototype prints the ISO day next to the relative one (#2339).
		expect(card.textContent).toContain(expiry.toISOString().slice(0, 10));
	});

	test('an auth failure on any query logs out through the shared path', () => {
		withData();
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.auditQuery.error = new Error('401');

		render(<Overview />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
