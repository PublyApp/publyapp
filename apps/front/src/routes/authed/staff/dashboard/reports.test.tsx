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

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useStaffAuditLogsQuery,
		useExportStaffAuditLogsMutation: vi.fn(() => mocks.exportMutation),
	};
});

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
import { periodStart } from './_dashboard-filters';
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
};

const resetMocks = () => {
	for (const query of [mocks.audit, mocks.impersonations] as AuditQuery[]) {
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
};

resetMocks();

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resetMocks();
});

describe('staff dashboard reports', () => {
	test('renders the two served KPIs from period-scoped audit totals', () => {
		withData();
		render(<Reports />);

		for (const [testId, figure] of [
			['staff-dashboard-kpi-report-events', '4,812'],
			['staff-dashboard-kpi-impersonations', '12'],
		]) {
			const card = screen.getByTestId(testId);
			expect(within(card).getByText(figure)).toBeTruthy();
			// A served figure is not a ghost: no « No data yet » footer.
			expect(within(card).queryByText('No data yet')).toBeNull();
		}
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

	test('the type breakdown is a ghost: its facet is whole-history (B7)', () => {
		withData();
		render(<Reports />);

		const card = screen.getByTestId('staff-dashboard-type-share');
		expect(within(card).getByText('No data yet')).toBeTruthy();
		expect(
			within(card).getByText('The share of each event type will appear here.'),
		).toBeTruthy();
		expect(
			card.querySelectorAll('svg[aria-hidden="true"]').length,
		).toBeGreaterThan(0);
		// The whole-history figure must not leak into the period-scoped report.
		expect(within(card).queryByText('1,684')).toBeNull();
	});

	test('draws ghosts (not « — ») for the daily series the API does not provide', () => {
		withData();
		render(<Reports />);

		for (const [testId, sentence] of [
			[
				'staff-dashboard-events-per-day',
				'One bar per day: the volume of audit events.',
			],
			[
				'staff-dashboard-signins-per-day',
				'The successful sign-ins curve will be drawn here, day by day.',
			],
			[
				'staff-dashboard-top-orgs',
				'The most active organisations will be ranked here.',
			],
		]) {
			const card = screen.getByTestId(testId);
			expect(within(card).getByText('No data yet')).toBeTruthy();
			expect(within(card).getByText(sentence)).toBeTruthy();
			expect(
				card.querySelectorAll('svg[aria-hidden="true"]').length,
			).toBeGreaterThan(0);
			expect(within(card).queryByRole('button', { name: 'Table' })).toBeNull();
		}
	});

	test('both daily-ghost cards keep the hero slot as a muted « — » (N3)', () => {
		withData();
		render(<Reports />);

		for (const testId of [
			'staff-dashboard-events-per-day',
			'staff-dashboard-signins-per-day',
		]) {
			const card = screen.getByTestId(testId);
			const hero = card.querySelector('.pt-3\\.5 p');
			expect(hero?.textContent).toBe('—');
			expect(hero?.querySelector('.text-muted-foreground')).toBeTruthy();
		}
	});

	test('a failed events query shows the error state, never the ghost (B4)', () => {
		withData();
		mocks.audit.isError = true;
		mocks.audit.error = new Error('500');
		render(<Reports />);

		expect(
			screen.getByTestId('staff-dashboard-kpi-report-events-error'),
		).toBeTruthy();
	});

	test('a pending events query shows the existing skeleton (B4)', () => {
		mocks.audit.isPending = true;
		mocks.audit.data = undefined;
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
		});
		expect(useStaffAuditLogsQuery).toHaveBeenCalledWith({
			size: 1,
			startDate: expectedStart,
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
