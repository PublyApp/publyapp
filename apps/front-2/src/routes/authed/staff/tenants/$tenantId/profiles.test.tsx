/**
 * @vitest-environment jsdom
 */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantProfileRows: vi.fn(),
	useStaffTenantProfilesQuery: vi.fn(),
	deleteProfileMutation: vi.fn(),
	useDeleteStaffTenantProfileMutation: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useNavigate: () => mocks.navigate,
		useParams: () => ({
			tenantId: '11111111-1111-1111-1111-111111111111',
		}),
		useSearch: () => mocks.search,
	}),
	Link: ({
		children,
		to,
		params,
		...props
	}: {
		children: React.ReactNode;
		to: string;
		params?: Record<string, string>;
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

const TRANSLATIONS: Record<string, string> = {
	basics: 'Basics',
	profiles: 'Profiles',
	invitations: 'Invitations',
	users: 'Users',
	'tenant-profiles-tab-description':
		"Permission sets available to this tenant's members.",
	'new-profile': 'New profile',
	'search-profiles': 'Search profiles…',
	default: 'Default',
	custom: 'Custom',
	'view-details': 'View details',
	edit: 'Edit',
	delete: 'Delete',
	'no-description-provided': 'No description provided.',
	'tenant-member-count': '{{count}} members',
	'list-unavailable-title': 'List unavailable',
	'list-error-default-description': 'There was a problem loading this list.',
	retry: 'Retry',
	'list-empty-title': 'Nothing here — yet',
	'list-no-match-title': 'No matches for that search',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			let text = TRANSLATIONS[key] ?? key;
			if (options) {
				for (const [optionKey, value] of Object.entries(options)) {
					text = text.replaceAll(`{{${optionKey}}}`, String(value));
				}
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

vi.mock('~/lib/query/staff-tenant-profiles', () => ({
	STAFF_TENANT_PROFILES_QUERY_KEY: ['staff', 'staff-tenants', 'profiles'],
	toStaffTenantProfileRows: mocks.toStaffTenantProfileRows,
	useStaffTenantProfilesQuery: mocks.useStaffTenantProfilesQuery,
	useDeleteStaffTenantProfileMutation:
		mocks.useDeleteStaffTenantProfileMutation,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/routes/authed/layout', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('./profiles/_profile-form-drawer', () => ({
	ProfileFormDrawer: ({ isOpen }: { isOpen: boolean }) =>
		isOpen ? <div data-testid="profile-create-drawer-open" /> : null,
}));

import {
	deriveTenantProfileCardStyle,
	Route,
	tenantProfileTypeChipClassName,
} from './profiles';

const buildQueryResult = (overrides: Record<string, unknown> = {}) => ({
	data: undefined,
	error: null,
	isPending: false,
	isError: false,
	isFetching: false,
	refetch: vi.fn().mockResolvedValue(undefined),
	...overrides,
});

const renderPage = () => {
	const Component = (
		Route as unknown as {
			component: () => JSX.Element;
		}
	).component;

	return render(<Component />);
};

describe('staff tenant profiles route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useDeleteStaffTenantProfileMutation.mockReturnValue({
			mutateAsync: mocks.deleteProfileMutation,
			isPending: false,
		});
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			logoUrl: null,
			createdAt: new Date('2026-07-01T09:00:00Z'),
			updatedAt: new Date('2026-07-02T10:00:00Z'),
		});
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					tenantId: '11111111-1111-1111-1111-111111111111',
				},
			}),
		);
		mocks.toStaffTenantProfileRows.mockReturnValue([
			{
				id: 'profile-1',
				name: 'Approvers',
				description: 'Can review approvals',
				isDefault: true,
				userAccountCount: 7,
			},
			{
				id: 'profile-2',
				name: 'Support',
				description: 'Respond to member tickets',
				isDefault: false,
				userAccountCount: 5,
			},
		]);
		mocks.useStaffTenantProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'profile-1',
							name: 'Approvers',
							description: 'Can review approvals',
							isDefault: true,
							userAccountCount: 7,
						},
						{
							id: 'profile-2',
							name: 'Support',
							description: 'Respond to member tickets',
							isDefault: false,
							userAccountCount: 5,
						},
					],
					nextCursor: null,
				},
			}),
		);
	});

	afterEach(() => {
		cleanup();
	});

	test('renders the shared tenant shell with profiles active, a card grid, and the default list query state', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-profiles-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByText('Profiles', { selector: 'span[aria-current="page"]' }),
		).toBeTruthy();
		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
		expect(screen.getAllByText('Approvers').length).toBeGreaterThan(0);
		expect(screen.getByText('Can review approvals')).toBeTruthy();
		expect(screen.getByText('Default')).toBeTruthy();
		expect(screen.getByText('Custom')).toBeTruthy();
		expect(screen.getByText('7 members')).toBeTruthy();
		expect(screen.getByText('5 members')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: 'Basics' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111');
		expect(
			screen.getByRole('link', { name: 'Users' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users');
		expect(screen.getByRole('button', { name: /New profile/ })).toBeTruthy();
		expect(mocks.useStaffTenantProfilesQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				q: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: undefined,
				size: 100,
			},
			{ enabled: true },
		);
	});

	test('new profile button navigates to open the create drawer via search state', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /New profile/ }));

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ new: '1' }),
				replace: true,
			}),
		);
	});

	test('renders the create drawer open when the new search param is set', () => {
		mocks.search = { new: '1' };
		renderPage();

		expect(screen.getByTestId('profile-create-drawer-open')).toBeTruthy();
	});

	test('never shows a permissions count on the card (not on the list contract)', () => {
		renderPage();

		expect(screen.queryByText(/permissions/i)).toBeNull();
	});

	test('does not render a Delete action for the default profile but does for a custom one', async () => {
		renderPage();

		const triggers = screen.getAllByRole('button', { name: /^Actions for/ });
		fireEvent.click(triggers[0]);
		expect(
			await screen.findByRole('menuitem', { name: 'View details' }),
		).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();

		fireEvent.click(triggers[0]);
		fireEvent.click(triggers[1]);
		expect(
			await screen.findByRole('menuitem', { name: 'Delete' }),
		).toBeTruthy();
	});

	test('deletes a custom profile after explicit confirmation and invalidates the profiles query', async () => {
		mocks.deleteProfileMutation.mockResolvedValue({});

		renderPage();

		const triggers = screen.getAllByRole('button', { name: /^Actions for/ });
		fireEvent.click(triggers[1]);
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Delete' })).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.deleteProfileMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileId: 'profile-2',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants', 'profiles'],
			}),
		);
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'approver' };
		mocks.toStaffTenantProfileRows.mockReturnValue([]);
		mocks.useStaffTenantProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profiles-grid-no-match'),
		).toBeTruthy();
	});

	test('renders the not-found view without logging out for a malformed id', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 400,
					responseStatusCode: 400,
					title: 'Bad Request',
					detail: 'Invalid tenantId',
					translationKey: 'malformed-id',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-details-not-found')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders forbidden without logging out for 403 failures', () => {
		mocks.useStaffTenantDetailsQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 403,
					responseStatusCode: 403,
					title: 'Forbidden',
					detail: 'Forbidden',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('forbidden-view')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders the error state without logging out for ordinary problem failures', () => {
		mocks.toStaffTenantProfileRows.mockReturnValue([]);
		mocks.useStaffTenantProfilesQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 500,
					responseStatusCode: 500,
					title: 'Server Error',
					detail: 'Unexpected failure',
				},
				isError: true,
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-profiles-grid-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when the profiles query failure should invalidate the session', () => {
		mocks.toStaffTenantProfileRows.mockReturnValue([]);
		mocks.useStaffTenantProfilesQuery.mockReturnValue(
			buildQueryResult({
				error: {
					status: 401,
					responseStatusCode: 401,
					title: 'Unauthorized',
					detail: 'Session expired',
				},
				isError: true,
			}),
		);
		mocks.shouldLogoutForFailure.mockReturnValue(true);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});
});

describe('tenantProfileTypeChipClassName', () => {
	test('maps isDefault to the amber chip and otherwise to the neutral chip', () => {
		expect(tenantProfileTypeChipClassName(true)).toContain('--amber');
		expect(tenantProfileTypeChipClassName(false)).toContain('--outline');
	});
});

describe('deriveTenantProfileCardStyle', () => {
	test('is deterministic for the same name', () => {
		const first = deriveTenantProfileCardStyle('Approvers');
		const second = deriveTenantProfileCardStyle('Approvers');
		expect(first.tone).toBe(second.tone);
		expect(first.Icon).toBe(second.Icon);
	});
});
