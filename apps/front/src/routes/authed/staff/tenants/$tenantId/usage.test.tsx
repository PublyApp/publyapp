/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const mocks = vi.hoisted(() => ({
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantUsage: vi.fn(),
	useStaffTenantUsageQuery: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
	}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: ReactNode;
		to: string;
		params?: Record<string, string>;
	}) => {
		let href = to;

		for (const [key, value] of Object.entries(params ?? {})) {
			href = href.replace(`$${key}`, value);
		}

		return createElement('a', { href, ...props }, children);
	},
}));

const TRANSLATIONS: TestLabelMap = {
	'back-to-staff-tenants': 'Back to staff tenants',
	edit: 'Edit',
	unknown: 'Unknown',
	'tenant-member-count': '{{count}} members',
	'tenant-owner-count': '{{count}} owners',
	'since-date': 'Since {{date}}',
	basics: 'Basics',
	profiles: 'Profiles',
	invitations: 'Invitations',
	users: 'Users',
	usage: 'Usage',
	projects: 'Projects',
	'scheduled-publications': 'Scheduled publications',
	'usage-as-of': 'Computed {{datetime}}',
	'usage-last-activity': 'Last activity',
	'usage-users-active-of-total': '{{active}} of {{total}} members',
	'usage-no-activity-yet': 'No activity recorded yet',
	'error-500-code': '500',
	'tenant-details-error-title': 'This tenant could not be loaded',
	'tenant-response-incomplete': 'Incomplete response.',
	'loading-tenant': 'Loading tenant…',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-pending': 'Pending',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			if (!options) {
				return text;
			}

			for (const [optionKey, value] of Object.entries(options)) {
				text = text.replaceAll(`{{${optionKey}}}`, String(value));
			}
			return text;
		},
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

vi.mock('~/lib/query/staff-tenants', () => ({
	selectStaffTenantCrumbName: () => undefined,
	staffTenantCrumbQuery: () => ({}),
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
	toStaffTenantUsage: mocks.toStaffTenantUsage,
	useStaffTenantUsageQuery: mocks.useStaffTenantUsageQuery,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: vi.fn(() => false),
}));

import { Route } from './usage';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const TENANT = {
	id: '11111111-1111-1111-1111-111111111111',
	name: 'Acme Corporation',
	code: 'ACME',
	status: 'Active',
	usersCount: 12,
	maxUsers: 50,
	ownersCount: 4,
	logoUrl: null,
	createdAt: new Date('2026-07-01T09:00:00Z'),
};

const USAGE = {
	tenantId: '11111111-1111-1111-1111-111111111111',
	usersActive: 9,
	usersTotal: 12,
	projectsCount: 7,
	scheduledPublicationsCount: 3,
	lastActivityAt: new Date('2026-08-20T10:00:00Z'),
	computedAt: new Date('2026-08-26T09:30:00Z'),
};

const renderPage = () => {
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

describe('staff tenant usage route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: { tenantId: TENANT.id },
			}),
		);
		mocks.toStaffTenantDetails.mockReturnValue(TENANT);
		mocks.useStaffTenantUsageQuery.mockReturnValue(
			buildQueryResult({
				data: { tenantId: TENANT.id },
			}),
		);
		mocks.toStaffTenantUsage.mockReturnValue(USAGE);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the usage stat cards and the computed-at freshness line (#168 trap 3)', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-usage-page')).toBeTruthy();

		const membersCard = screen.getByTestId('tenant-stat-usage-members');
		expect(membersCard.textContent).toContain('12');
		expect(membersCard.textContent).toContain('9 of 12 members');

		const projectsCard = screen.getByTestId('tenant-stat-usage-projects');
		expect(projectsCard.textContent).toContain('7');

		const scheduledCard = screen.getByTestId('tenant-stat-usage-scheduled');
		expect(scheduledCard.textContent).toContain('3');

		// Freshness contract: the snapshot carries when it was computed and
		// the page names that instant next to the numbers.
		const shell = screen.getByTestId('staff-tenant-usage-page');
		expect(shell.textContent).toContain('Computed Aug 26, 2026');

		// The Usage tab is active inside the section nav.
		const activeTab = screen.getByText('Usage');
		expect(activeTab.getAttribute('aria-current')).toBe('page');
	});

	test('shows no-activity copy when the tenant has no recorded activity', () => {
		mocks.toStaffTenantUsage.mockReturnValue({
			...USAGE,
			lastActivityAt: null,
		});

		renderPage();

		expect(screen.getByText('No activity recorded yet')).toBeTruthy();
	});

	test('renders the usage error view inside the shell when the usage query fails', () => {
		mocks.useStaffTenantUsageQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Missing permission',
				},
				isError: true,
			}),
		);

		renderPage();

		// Transparent failure: the error view replaces the cards, the shell
		// (identity + tabs) still renders so the user keeps their bearings.
		expect(screen.getByTestId('staff-tenant-usage-page')).toBeTruthy();
		expect(screen.queryByTestId('tenant-stat-usage-members')).toBeNull();
	});
});
