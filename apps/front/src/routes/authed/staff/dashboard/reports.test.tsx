/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

type ReportSearch = { period?: string };

type AuditQuery = {
	isPending: boolean;
	isError: boolean;
	error: Error | null;
	data: Record<string, unknown> | undefined;
	refetch: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => ({
	audit: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	impersonations: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	series: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	previousSeries: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	topOrganisations: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	exportMutation: {
		isPending: false,
		mutateAsync: vi.fn(),
	},
	shouldLogoutForFailure: vi.fn(() => false),
	downloadFile: vi.fn(),
	toastSuccess: vi.fn(),
	search: {} as ReportSearch,
	navigate: vi.fn(),
}));

const useStaffAuditLogsQuery = vi.hoisted(() => vi.fn());
const useStaffDashboardSeriesQuery = vi.hoisted(() => vi.fn());
const useStaffDashboardTopOrganisationsQuery = vi.hoisted(() => vi.fn());

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useStaffAuditLogsQuery,
		useExportStaffAuditLogsMutation: vi.fn(() => mocks.exportMutation),
	};
});

vi.mock('~/lib/query/staff-dashboard', () => ({
	useStaffDashboardSeriesQuery,
	useStaffDashboardTopOrganisationsQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/utils/download-file', () => ({
	downloadFile: mocks.downloadFile,
	formatExportDateStamp: () => '2026-08-31',
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: vi.fn(),
		warning: vi.fn(),
	},
}));

vi.mock('~/components/error-views/LogoutRedirect', () => ({
	LogoutRedirect: () => <div data-testid="logout-redirect">logout</div>,
}));

vi.mock('@tanstack/react-router', () => ({
	useRouter: () => undefined,
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useSearch: () => mocks.search,
		useNavigate: () => mocks.navigate,
	}),
}));

const EN_LABELS: TestLabelMap = {
	'dashboard-kpi-audit-events': 'Audit events',
	'dashboard-kpi-signins': 'Sign-ins',
	'dashboard-kpi-failed-signins': 'Failed sign-ins',
	'dashboard-kpi-impersonations': 'Impersonation sessions',
	'dashboard-card-audit-events-per-day': 'Audit events per day',
	'dashboard-card-type-share': 'Breakdown by type',
	'dashboard-card-signins-per-day': 'Sign-ins per day',
	'dashboard-card-top-orgs': 'Most active organisations',
	'dashboard-note-events-per-day': 'Audit events per day',
	'dashboard-note-signins': 'Successful sign-ins',
	'dashboard-note-top-orgs': 'Audit events attributed to each organisation',
	'dashboard-col-events': 'Events',
	'dashboard-col-date': 'Date',
	'dashboard-type-organisation': 'Organisation',
	'dashboard-type-auth': 'Authentication',
	'dashboard-type-user': 'User',
	'dashboard-type-invitation': 'Invitation',
	'dashboard-type-other': 'Other',
	'dashboard-view-chart': 'Chart',
	'dashboard-view-table': 'Table',
	'dashboard-note-type-share': 'Every event in the period, grouped by domain',
	'dashboard-col-type': 'Type',
	'dashboard-col-share': 'Share',
	'dashboard-export': 'Export',
	'dashboard-exporting': 'Export…',
	'dashboard-export-format': 'Export format',
	'dashboard-export-csv-hint': 'Spreadsheet',
	'dashboard-export-json-hint': 'Raw data',
	'dashboard-export-complete': 'Export complete · {{file}}',
	'dashboard-filter-report-period': 'Report period',
	'dashboard-period-30d': 'Last 30 days',
	'dashboard-period-7d': 'Last 7 days',
	'dashboard-period-previous-30d': 'previous 30 days',
	'dashboard-delta-vs-previous': 'vs {{period}}',
	'dashboard-chart-column': 'Column chart',
	'export-failed': 'Export failed',
	'dashboard-ghost-tag': 'No data yet',
	'dashboard-ghost-card-events-per-day':
		'One bar per day: the volume of audit events.',
	'dashboard-ghost-card-signins-per-day':
		'The successful sign-ins curve will be drawn here, day by day.',
	'dashboard-ghost-card-top-orgs':
		'The most active organisations will be ranked here.',
	'dashboard-ghost-card-type-share':
		'The share of each event type will appear here.',
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
import { Route } from './reports';

const Reports = Route.options.component as ComponentType;

const withData = () => {
	mocks.audit.data = {
		data: [],
		nextCursor: null,
		totalCount: 4812,
		counts: {
			today: 0,
			last30Days: 0,
			byAction: [
				{ action: 'tenant.updated', count: 1684 },
				{ action: 'auth.login.succeeded', count: 1215 },
			],
			byActor: [],
		},
	};
	mocks.impersonations.data = { data: [], nextCursor: null, totalCount: 12 };
	const today = todayIso();
	const points = (days: number, value: number) =>
		Array.from({ length: days }, (_, index) => ({
			date: addIsoDays(today, -(days - 1 - index)),
			value,
		}));
	mocks.series.data = { points: points(30, 160) };
	mocks.previousSeries.data = { points: points(30, 148) };
	mocks.topOrganisations.data = {
		startDate: '',
		endDate: '',
		items: [
			{ id: '1', name: 'Acme Corporation', count: 1284 },
			{ id: '2', name: 'TechStart Inc', count: 903 },
		],
	};
};

const resetMocks = () => {
	for (const query of [
		mocks.audit,
		mocks.impersonations,
		mocks.series,
		mocks.previousSeries,
		mocks.topOrganisations,
	] as AuditQuery[]) {
		query.isPending = false;
		query.isError = false;
		query.error = null;
		query.data = undefined;
	}
	mocks.exportMutation.isPending = false;
	mocks.shouldLogoutForFailure.mockReturnValue(false);
	mocks.search = {};
	useStaffAuditLogsQuery.mockImplementation(
		(variables: { actions?: string[] }) =>
			variables.actions?.[0] === 'impersonation.started'
				? mocks.impersonations
				: mocks.audit,
	);
	useStaffDashboardSeriesQuery.mockImplementation(
		(variables: { endDate: string }) =>
			variables.endDate !== todayIso() ? mocks.previousSeries : mocks.series,
	);
	useStaffDashboardTopOrganisationsQuery.mockImplementation(
		() => mocks.topOrganisations,
	);
};

resetMocks();

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resetMocks();
});

describe('staff dashboard reports', () => {
	test('no sample-data chip: the screen reads the real API (#2339 fix6)', () => {
		withData();
		render(<Reports />);

		expect(screen.queryByTestId('staff-dashboard-sample-chip')).toBeNull();
	});

	test('renders the two served KPIs from period-scoped audit totals', () => {
		withData();
		render(<Reports />);

		for (const [testId, figure] of [
			['staff-dashboard-kpi-report-events', '4,800'],
			['staff-dashboard-kpi-impersonations', '12'],
		]) {
			const card = screen.getByTestId(testId);
			expect(within(card).getByText(figure)).toBeTruthy();
			// A served figure is not a ghost: no « No data yet » footer.
			expect(within(card).queryByText('No data yet')).toBeNull();
		}
	});

	test('the delta names the previous window, not the current one (B ME-1)', () => {
		withData();
		render(<Reports />);

		const kpi = screen.getByTestId('staff-dashboard-kpi-report-events');
		expect(within(kpi).getByText('vs previous 30 days')).toBeTruthy();
		expect(within(kpi).queryByText('Last 30 days')).toBeNull();
	});

	test('an empty series falls back to the audit list total, not a false 0', () => {
		withData();
		mocks.series.data = { points: [] };
		render(<Reports />);

		const kpi = screen.getByTestId('staff-dashboard-kpi-report-events');
		expect(within(kpi).getByText('4,812')).toBeTruthy();
		expect(within(kpi).queryByText('0')).toBeNull();
	});

	test('the sign-in KPIs are ghosts: their audit actions are never emitted (B1)', () => {
		withData();
		render(<Reports />);

		for (const testId of [
			'staff-dashboard-kpi-signins',
			'staff-dashboard-kpi-failed-signins',
		]) {
			const card = screen.getByTestId(testId);
			expect(within(card).getByText('—')).toBeTruthy();
			expect(within(card).getByText('No data yet')).toBeTruthy();
		}

		// No query is even issued for an action the backend never writes.
		for (const call of useStaffAuditLogsQuery.mock.calls) {
			expect(call[0].actions ?? []).not.toContain('auth.login.succeeded');
			expect(call[0].actions ?? []).not.toContain('auth.login.failed');
		}
	});

	test('the type breakdown renders the byAction facet as a stacked bar and its table', () => {
		withData();
		render(<Reports />);

		const card = screen.getByTestId('staff-dashboard-type-share');
		expect(within(card).queryByText('No data yet')).toBeNull();
		expect(within(card).getByText('Organisation')).toBeTruthy();
		expect(within(card).getByText('Authentication')).toBeTruthy();
		expect(within(card).getByText('1,684')).toBeTruthy();
		expect(within(card).getByText('1,215')).toBeTruthy();
	});

	test('draws the real events series and top organisations, and keeps the sign-in ghost', () => {
		withData();
		render(<Reports />);

		const events = screen.getByTestId('staff-dashboard-events-per-day');
		expect(within(events).queryByText('No data yet')).toBeNull();
		expect(
			within(events).getByRole('img', { name: 'Column chart' }),
		).toBeTruthy();
		expect(within(events).getByRole('button', { name: 'Table' })).toBeTruthy();

		const top = screen.getByTestId('staff-dashboard-top-orgs');
		expect(within(top).queryByText('No data yet')).toBeNull();
		expect(within(top).getByText('Acme Corporation')).toBeTruthy();
		expect(within(top).getByText('1,284')).toBeTruthy();

		const signins = screen.getByTestId('staff-dashboard-signins-per-day');
		expect(within(signins).getByText('No data yet')).toBeTruthy();
		expect(
			within(signins).getByText(
				'The successful sign-ins curve will be drawn here, day by day.',
			),
		).toBeTruthy();
	});

	test('the sign-ins ghost keeps the hero slot as a muted « — » (N3)', () => {
		withData();
		render(<Reports />);

		const card = screen.getByTestId('staff-dashboard-signins-per-day');
		const hero = card.querySelector('.pt-3\\.5 p');
		expect(hero?.textContent).toBe('—');
		expect(hero?.querySelector('.text-muted-foreground')).toBeTruthy();
	});

	test('a failed events query shows the error state, never the ghost (B4)', () => {
		withData();
		mocks.series.isError = true;
		mocks.series.error = new Error('500');
		render(<Reports />);

		expect(
			screen.getByTestId('staff-dashboard-kpi-report-events-error'),
		).toBeTruthy();
		expect(
			within(screen.getByTestId('staff-dashboard-events-per-day')).queryByText(
				'No data yet',
			),
		).toBeNull();
	});

	test('a pending events query shows the existing skeleton (B4)', () => {
		withData();
		mocks.series.isPending = true;
		mocks.series.data = undefined;
		render(<Reports />);

		expect(
			screen.getByTestId('staff-dashboard-kpi-report-events-skeleton'),
		).toBeTruthy();
	});

	test('the report period drives the API through the URL (N4)', () => {
		withData();
		mocks.search = { period: '7d' };
		const expectedStart = periodStart('7d');
		render(<Reports />);

		expect(useStaffAuditLogsQuery).toHaveBeenCalledWith({
			size: 1,
			startDate: expectedStart,
			endDate: todayIso(),
		});
		expect(useStaffAuditLogsQuery).toHaveBeenCalledWith({
			size: 1,
			startDate: expectedStart,
			endDate: todayIso(),
			actions: ['impersonation.started'],
		});
	});

	test('opens the export dropdown with the two formats and exports the chosen one', async () => {
		withData();
		mocks.exportMutation.mutateAsync.mockResolvedValue(new ArrayBuffer(8));
		render(<Reports />);

		const trigger = screen.getByTestId('staff-dashboard-export-trigger');
		fireEvent.click(trigger);

		const csv = await screen.findByRole('menuitem', { name: /CSV/ });
		expect(screen.getByText('Export format')).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: /JSON/ })).toBeTruthy();

		fireEvent.click(csv);

		await waitFor(() => {
			expect(mocks.exportMutation.mutateAsync).toHaveBeenCalledWith({
				format: 'csv',
				startDate: expect.any(String),
			});
			expect(mocks.downloadFile).toHaveBeenCalledWith({
				data: expect.any(ArrayBuffer),
				fileName: 'audit-logs-2026-08-31.csv',
				mimeType: 'text/csv',
			});
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'Export complete · audit-logs-2026-08-31.csv',
			);
		});
	});

	test('shows the pending label and disables the export while it runs', () => {
		withData();
		mocks.exportMutation.isPending = true;

		render(<Reports />);

		const trigger = screen.getByTestId(
			'staff-dashboard-export-trigger',
		) as HTMLButtonElement;
		expect(trigger.disabled).toBe(true);
		expect(trigger.textContent).toContain('Export…');
	});

	test('an auth failure on any query logs out through the shared path', () => {
		withData();
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.impersonations.error = new Error('401');

		render(<Reports />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
