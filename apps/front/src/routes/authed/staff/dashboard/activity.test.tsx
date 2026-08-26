/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { StaffAuditLogRow } from '~/lib/query/staff-audit-logs';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	query: {
		isPending: false,
		isLoading: false,
		isError: false,
		isSuccess: true,
		error: null as Error | null,
		data: undefined as
			| { data: Array<Record<string, unknown>>; nextCursor: string | null }
			| undefined,
		refetch: vi.fn(),
	},
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useStaffAuditLogsQuery: vi.fn(() => mocks.query),
	};
});

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
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
	'recent-activity': 'Recent Activity',
	'view-all': 'View all',
	retry: 'Retry',
	'no-audit-logs-yet': 'No audit logs yet',
	'no-audit-logs-description':
		'Audit logs will appear here once activities are tracked.',
	'failed-to-load-activity': "Couldn't load recent activity",
	'failed-to-load-activity-description':
		'The latest audit events could not be loaded. Try again.',
	unknown: 'Unknown',
	loading: 'Loading',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			if (EN_LABELS[key] !== undefined) {
				return EN_LABELS[key];
			}
			// The component qualifies cross-namespace keys (`common:retry`);
			// real i18next resolves those through the namespaces array.
			const separator = key.indexOf(':');
			if (separator !== -1) {
				return EN_LABELS[key.slice(separator + 1)] ?? key;
			}
			return key;
		},
		i18n: { resolvedLanguage: 'en', language: 'en' },
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './activity';

const StaffDashboardActivityTab = Route.options.component as ComponentType;

const auditRow = (overrides: Partial<StaffAuditLogRow> = {}) => ({
	id: '0197b8f0-3333-7ccc-8ccc-cccccccccccc',
	action: 'tenant.created',
	userName: 'Ada Admin',
	userEmail: 'ada@example.com',
	ipAddress: '10.0.0.1',
	targetId: null,
	createdAt: new Date('2026-08-26T08:00:00Z'),
	...overrides,
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.query.isPending = false;
	mocks.query.isError = false;
	mocks.query.isSuccess = true;
	mocks.query.error = null;
});

describe('StaffDashboardActivityTab', () => {
	test('renders the mapped recent audit events from the API response', () => {
		mocks.query.data = { data: [auditRow()], nextCursor: null };

		render(<StaffDashboardActivityTab />);

		expect(screen.getByText('Recent Activity')).toBeTruthy();
		const entries = screen.getAllByTestId('staff-dashboard-activity-entry');
		expect(entries.length).toBe(1);
		expect(screen.getByText('Ada Admin')).toBeTruthy();
		const viewAll = screen.getByRole('link', { name: /view all/i });
		expect(viewAll.getAttribute('href')).toBe('/staff/audit-logs');
	});

	test('shows the empty state when the feed maps to zero rows', () => {
		mocks.query.data = { data: [], nextCursor: null };

		render(<StaffDashboardActivityTab />);

		expect(screen.getByTestId('staff-dashboard-activity-empty')).toBeTruthy();
	});

	test('shows a skeleton while the query is pending', () => {
		mocks.query.isPending = true;
		mocks.query.isSuccess = false;

		render(<StaffDashboardActivityTab />);

		expect(
			screen.getByTestId('staff-dashboard-activity-skeleton'),
		).toBeTruthy();
	});

	test('shows the error state with a working retry', async () => {
		const user = userEvent.setup();
		mocks.query.isError = true;
		mocks.query.isSuccess = false;
		mocks.query.error = new Error('network down');
		mocks.query.refetch.mockResolvedValue(undefined);

		render(<StaffDashboardActivityTab />);

		expect(screen.getByTestId('staff-dashboard-activity-error')).toBeTruthy();

		await user.click(screen.getByRole('button', { name: 'Retry' }));
		await waitFor(() => {
			expect(mocks.query.refetch).toHaveBeenCalled();
		});
	});

	test('redirects to logout on an auth failure', () => {
		mocks.query.isError = true;
		mocks.query.isSuccess = false;
		mocks.query.error = new Error('401');
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(<StaffDashboardActivityTab />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
