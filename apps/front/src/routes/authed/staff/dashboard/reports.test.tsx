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
	signins: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	failed: {
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
}));

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useStaffAuditLogsQuery: vi.fn((variables: { actions?: string[] }) => {
			const action = variables.actions?.[0];
			if (action === 'auth.login.succeeded') {
				return mocks.signins;
			}
			if (action === 'auth.login.failed') {
				return mocks.failed;
			}
			if (action === 'impersonation.started') {
				return mocks.impersonations;
			}
			return mocks.audit;
		}),
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
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
	}),
}));

const EN_LABELS: TestLabelMap = {
	'dashboard-kpi-audit-events': 'Audit events',
	'dashboard-kpi-signins': 'Sign-ins',
	'dashboard-kpi-failed-signins': 'Failed sign-ins',
	'dashboard-kpi-impersonations': 'Impersonation sessions',
	'dashboard-last-30d': 'Last 30 days',
	'dashboard-card-audit-events-per-day': 'Audit events per day',
	'dashboard-card-type-share': 'Breakdown by type',
	'dashboard-card-signins-per-day': 'Sign-ins per day',
	'dashboard-card-top-orgs': 'Most active organisations',
	'dashboard-note-events-per-day': 'Audit events per day',
	'dashboard-note-signins-per-day': 'Successful sign-ins · last 30 days',
	'dashboard-note-type-share-all': 'All events, grouped by domain',
	'dashboard-note-top-orgs': 'Audit events attributed to each organisation',
	'dashboard-col-day': 'Day',
	'dashboard-col-events': 'Events',
	'dashboard-col-signins': 'Sign-ins',
	'dashboard-col-type': 'Type',
	'dashboard-col-share': 'Share',
	'dashboard-type-organisation': 'Organisation',
	'dashboard-type-auth': 'Authentication',
	'dashboard-type-user': 'User',
	'dashboard-type-invitation': 'Invitation',
	'dashboard-type-other': 'Other',
	'dashboard-export': 'Export',
	'dashboard-exporting': 'Export…',
	'dashboard-export-format': 'Export format',
	'dashboard-export-csv-hint': 'Spreadsheet',
	'dashboard-export-json-hint': 'Raw data',
	'dashboard-export-complete': 'Export complete · {{file}}',
	'dashboard-filter-report-period': 'Report period',
	'dashboard-period-30d': 'Last 30 days',
	'export-failed': 'Export failed',
	'dashboard-ghost-tag': 'No data yet',
	'dashboard-ghost-card-events-per-day':
		'One bar per day: the volume of audit events.',
	'dashboard-ghost-card-signins-per-day':
		'The successful sign-ins curve will be drawn here, day by day.',
	'dashboard-ghost-card-top-orgs':
		'The most active organisations will be ranked here.',
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
				{ action: 'tenant.user.removed', count: 902 },
				{ action: 'invitation.created', count: 611 },
				{ action: 'post.created', count: 400 },
			],
			byActor: [],
		},
	};
	mocks.signins.data = { data: [], nextCursor: null, totalCount: 1469 };
	mocks.failed.data = { data: [], nextCursor: null, totalCount: 38 };
	mocks.impersonations.data = { data: [], nextCursor: null, totalCount: 12 };
};

const resetMocks = () => {
	for (const query of [
		mocks.audit,
		mocks.signins,
		mocks.failed,
		mocks.impersonations,
	] as AuditQuery[]) {
		query.isPending = false;
		query.isError = false;
		query.error = null;
		query.data = undefined;
	}
	mocks.exportMutation.isPending = false;
	mocks.shouldLogoutForFailure.mockReturnValue(false);
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resetMocks();
});

describe('staff dashboard reports', () => {
	test('renders the four report KPIs from period-scoped audit totals', () => {
		withData();
		render(<Reports />);

		expect(
			screen.getByTestId('staff-dashboard-kpi-report-events'),
		).toBeTruthy();
		// The period total appears as the KPI value and as the events card's hero.
		expect(screen.getAllByText('4,812').length).toBeGreaterThanOrEqual(1);
		expect(screen.getByText('1,469')).toBeTruthy();
		expect(screen.getByText('38')).toBeTruthy();
		expect(screen.getByText('12')).toBeTruthy();
	});

	test('renders the type breakdown grouped by domain', () => {
		withData();
		render(<Reports />);

		for (const label of [
			'Organisation',
			'Authentication',
			'User',
			'Invitation',
			'Other',
		]) {
			expect(screen.getByText(label)).toBeTruthy();
		}
		expect(screen.getByText('1,684')).toBeTruthy();
		expect(screen.getByText('35%')).toBeTruthy();
	});

	test('draws ghosts (not « — ») for the daily series the API does not provide', () => {
		withData();
		render(<Reports />);

		// Events/day, sign-ins/day and the top-organisations ranking each draw
		// their own chart as a ghost, with the tag and their sentence.
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

		// The events card's hero figure is a muted « — » on a ghost card.
		expect(
			within(screen.getByTestId('staff-dashboard-events-per-day')).getByText(
				'—',
			),
		).toBeTruthy();
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
		mocks.signins.error = new Error('401');

		render(<Reports />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
