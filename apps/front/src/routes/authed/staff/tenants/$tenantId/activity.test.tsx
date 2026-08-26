/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { TenantActivityRow } from '~/lib/query/staff-tenant-activity';
import type { TestLabelMap } from '~/lib/testing/test-label-map';
import type { TableSearchWireParams } from '~/lib/url-state/table-search-params';

const mocks = vi.hoisted(() => ({
	activityQuery: {
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
	detailsQuery: {
		isPending: false,
		isLoading: false,
		isError: false,
		isSuccess: true,
		error: null as Error | null,
		data: undefined as
			| {
					tenantId: string;
					name: string;
					status?: string | null;
					createdAt?: Date | null;
			  }
			| undefined,
		refetch: vi.fn(),
	},
	shouldLogoutForFailure: vi.fn(() => false),
	lastActivityVariables: undefined as
		| {
				tenantId: string;
				cursor?: string;
		  }
		| undefined,
	navigate: vi.fn(),
	search: {} as TableSearchWireParams,
}));

vi.mock('~/lib/query/staff-tenant-activity', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenant-activity')>();

	return {
		...actual,
		useTenantActivityQuery: vi.fn(
			(variables: { tenantId: string; cursor?: string }) => {
				mocks.lastActivityVariables = variables;
				return mocks.activityQuery;
			},
		),
	};
});

vi.mock('~/lib/query/staff-tenants', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('~/lib/query/staff-tenants')>();

	return {
		...actual,
		useStaffTenantDetailsQuery: vi.fn(() => mocks.detailsQuery),
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
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
		useSearch: () => mocks.search,
	}),
	Link: ({
		to,
		children,
		params,
		...props
	}: {
		to: string;
		children: React.ReactNode;
		params?: Record<string, string>;
		[key: string]: unknown;
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

const EN_LABELS: TestLabelMap = {
	'tenant-activity-page-title': 'Tenant Activity',
	'tenant-activity-page-description': 'Recent events for this tenant.',
	'tenant-activity-empty-title': 'No activity yet',
	'tenant-activity-empty-description':
		'Audit events for this tenant will appear here once tracked.',
	retry: 'Retry',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => {
			if (EN_LABELS[key] !== undefined) {
				return EN_LABELS[key];
			}
			// The component qualifies cross-namespace keys (`common:event`);
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

const StaffTenantActivityPage = Route.options.component as ComponentType;

const activityRow = (overrides: Partial<TenantActivityRow> = {}) => ({
	id: '0197b8f0-3333-7ccc-8ccc-cccccccccccc',
	action: 'tenant.created',
	userName: 'Ada Admin',
	userEmail: 'ada@example.com',
	ipAddress: '10.0.0.1',
	targetId: null,
	createdAt: new Date('2026-08-26T08:00:00Z'),
	...overrides,
});

const seedDetails = () => ({
	tenantId: '11111111-1111-1111-1111-111111111111',
	name: 'Acme',
	status: 'active',
	createdAt: new Date('2026-01-01T00:00:00Z'),
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	mocks.activityQuery.isPending = false;
	mocks.activityQuery.isError = false;
	mocks.activityQuery.isSuccess = true;
	mocks.activityQuery.error = null;
	mocks.activityQuery.data = undefined;
	mocks.detailsQuery.isPending = false;
	mocks.detailsQuery.isError = false;
	mocks.detailsQuery.isSuccess = true;
	mocks.detailsQuery.error = null;
	mocks.detailsQuery.data = undefined;
	mocks.lastActivityVariables = undefined;
});

describe('StaffTenantActivityPage', () => {
	test('renders the rows returned by the activity query', () => {
		mocks.detailsQuery.data = seedDetails();
		mocks.activityQuery.data = {
			data: [activityRow()],
			nextCursor: null,
		};

		render(<StaffTenantActivityPage />);

		expect(screen.getByTestId('staff-tenant-activity-page')).toBeTruthy();
		expect(screen.getByTestId('staff-tenant-activity-table-card')).toBeTruthy();
		expect(screen.getByText('Ada Admin')).toBeTruthy();
	});

	test('shows the empty state when the feed has zero rows', () => {
		mocks.detailsQuery.data = seedDetails();
		mocks.activityQuery.data = { data: [], nextCursor: null };

		render(<StaffTenantActivityPage />);

		expect(
			screen.getByTestId('staff-tenant-activity-table-empty'),
		).toBeTruthy();
		expect(screen.queryByTestId('staff-tenant-activity-table-card')).toBeNull();
	});

	test('shows the error state with a working retry', async () => {
		const user = userEvent.setup();
		mocks.detailsQuery.data = seedDetails();
		mocks.activityQuery.isError = true;
		mocks.activityQuery.isSuccess = false;
		mocks.activityQuery.error = new Error('network down');
		mocks.activityQuery.refetch.mockResolvedValue(undefined);

		render(<StaffTenantActivityPage />);

		expect(
			screen.getByTestId('staff-tenant-activity-table-error'),
		).toBeTruthy();

		await user.click(screen.getByRole('button', { name: 'Retry' }));
		await waitFor(() => {
			expect(mocks.activityQuery.refetch).toHaveBeenCalled();
		});
	});

	test('disables the next-page button when no next cursor exists', () => {
		mocks.detailsQuery.data = seedDetails();
		mocks.activityQuery.data = { data: [activityRow()], nextCursor: null };

		render(<StaffTenantActivityPage />);

		const next = screen.getByTestId(
			'staff-tenant-activity-table-next-page',
		) as HTMLButtonElement;
		expect(next.disabled).toBe(true);
	});

	test('advances the activity query with the next cursor on next page', async () => {
		const user = userEvent.setup();
		mocks.detailsQuery.data = seedDetails();
		mocks.activityQuery.data = {
			data: [activityRow()],
			nextCursor: '0197b8f0-4444-7ccc-8ccc-dddddddddddd',
		};

		render(<StaffTenantActivityPage />);

		const next = screen.getByTestId(
			'staff-tenant-activity-table-next-page',
		) as HTMLButtonElement;
		expect(next.disabled).toBe(false);

		await user.click(next);
		await waitFor(() => {
			expect(mocks.lastActivityVariables?.cursor).toBe(
				'0197b8f0-4444-7ccc-8ccc-dddddddddddd',
			);
		});
	});

	test('redirects to logout when the activity query fails with an auth error', () => {
		mocks.detailsQuery.data = seedDetails();
		mocks.activityQuery.isError = true;
		mocks.activityQuery.isSuccess = false;
		mocks.activityQuery.error = new Error('401');
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		render(<StaffTenantActivityPage />);

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});
