/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	query: {
		isPending: false,
		isError: false,
		error: null as Error | null,
		data: undefined as Record<string, unknown> | undefined,
		refetch: vi.fn(),
	},
	actionsQuery: {
		isError: false,
		data: { actions: ['tenant.updated', 'auth.login.succeeded'] } as
			| { actions: string[] }
			| undefined,
	},
	shouldLogoutForFailure: vi.fn(() => false),
	navigate: vi.fn(),
}));

vi.mock('~/lib/query/staff-audit-logs', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-audit-logs')>();

	return {
		...actual,
		useStaffAuditLogsQuery: vi.fn(() => mocks.query),
		useAuditLogActionsQuery: vi.fn(() => mocks.actionsQuery),
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
		useNavigate: () => mocks.navigate,
	}),
}));

const EN_LABELS: TestLabelMap = {
	'history-search-placeholder': 'Search an event, an actor, an IP…',
	'history-events': '{{count}} events · kept {{days}} days',
	'history-events-unknown': 'Events · kept {{days}} days',
	'history-day-today': 'Today',
	'history-day-yesterday': 'Yesterday',
	'history-day-unknown': 'Unknown date',
	'history-filter-categories': 'Categories',
	'history-filter-period': 'Period',
	'history-filter-sensitivity': 'Sensitivity',
	'history-period-today': 'Today',
	'history-period-week': 'Last 7 days',
	'history-period-month': 'Last 30 days',
	'history-sensitivity-sensitive': 'Sensitive actions',
	'history-category-tenant': 'Organisation',
	'history-category-auth': 'Authentication',
	'history-open': 'Open',
	'history-system': 'System',
	'no-audit-logs-yet': 'No audit logs yet',
	'no-audit-logs-description': 'Audit events will appear here.',
	'no-audit-logs-match-title': 'No matching events',
	'no-audit-logs-match-description': 'Try removing a filter.',
	'list-open-row': 'Open {{name}}',
	'list-no-match-title': 'No match',
	'list-no-match-default-description': 'No rows match the filters.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let label = EN_LABELS[key] ?? key;
			if (options) {
				for (const [name, value] of Object.entries(options)) {
					label = label.replaceAll(`{{${name}}}`, String(value));
				}
			}
			return label;
		},
		i18n: {
			resolvedLanguage: 'en',
			language: 'en',
			exists: () => false,
		},
	}),
}));

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import { Route } from './activity';

const Activity = Route.options.component as ComponentType;

const auditRow = (overrides: Record<string, unknown> = {}) => ({
	id: '0197b8f0-3333-7ccc-8ccc-cccccccccccc',
	action: 'tenant.updated',
	userName: 'Ada Admin',
	userEmail: 'ada@example.com',
	ipAddress: '10.0.0.1',
	targetId: null,
	createdAt: new Date(),
	...overrides,
});

const resetMocks = () => {
	mocks.query.isPending = false;
	mocks.query.isError = false;
	mocks.query.error = null;
	mocks.query.data = undefined;
	mocks.actionsQuery.isError = false;
	mocks.actionsQuery.data = {
		actions: ['tenant.updated', 'auth.login.succeeded'],
	};
	mocks.shouldLogoutForFailure.mockReturnValue(false);
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resetMocks();
});

describe('staff dashboard activity', () => {
	test('renders the shared activity history with the event and its day group', () => {
		mocks.query.data = {
			data: [auditRow()],
			nextCursor: null,
			totalCount: 1,
		};

		render(<Activity />);

		expect(screen.getByTestId('staff-dashboard-activity')).toBeTruthy();
		expect(screen.getByTestId('staff-dashboard-activity-days')).toBeTruthy();
		expect(screen.getByText('Today')).toBeTruthy();
		expect(screen.getByText('Ada Admin')).toBeTruthy();
		expect(
			screen.getByPlaceholderText('Search an event, an actor, an IP…'),
		).toBeTruthy();
		expect(
			screen.getByTestId('staff-dashboard-activity-count').textContent,
		).toBe('1 events · kept 365 days');
	});

	test('shows the empty state when the API returns no event', () => {
		mocks.query.data = { data: [], nextCursor: null, totalCount: 0 };

		render(<Activity />);

		expect(screen.getByTestId('staff-dashboard-activity-empty')).toBeTruthy();
	});

	test('shows the shared skeleton while the query is pending', () => {
		mocks.query.isPending = true;
		mocks.query.data = undefined;

		render(<Activity />);

		expect(screen.getByTestId('staff-dashboard-activity-loading')).toBeTruthy();
	});

	test('an auth failure logs out through the shared path', () => {
		mocks.query.isError = true;
		mocks.query.error = new Error('401');
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(<Activity />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
