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
	bulkDeleteProfileMutation: vi.fn(),
	useBulkDeleteStaffTenantProfilesMutation: vi.fn(),
	toStaffTenantProfileBulkActionSummary: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
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
	system: 'System',
	custom: 'Custom',
	'all-types': 'All types',
	'view-details': 'View details',
	edit: 'Edit',
	delete: 'Delete',
	'default-profile-delete-disabled': "Default profiles can't be deleted.",
	'no-description-provided': 'No description provided.',
	'tenant-member-count': '{{count}} members',
	'tenant-permission-count': '{{count}} permissions',
	'list-unavailable-title': 'List unavailable',
	'list-error-default-description': 'There was a problem loading this list.',
	retry: 'Retry',
	'list-empty-title': 'Nothing here — yet',
	'list-no-match-title': 'No matches for that search',
	clear: 'Clear',
	'cards-view': 'Cards view',
	'select-row-named': 'Select {{name}}',
	'select-all-rows': 'Select all rows',
	'page-n': 'Page {{page}}',
	'previous-page': 'Previous page',
	'next-page': 'Next page',
	'table-view': 'Table view',
	'view-toggle-aria-label': 'Switch between cards and table view',
	profile: 'Profile',
	description: 'Description',
	members: 'Members',
	permissions: 'Permissions',
	actions: 'Actions',
	'bulk-delete': 'Delete selected',
	'confirm-bulk-delete-tenant-profiles':
		'Are you sure you want to delete {{count}} profile(s)?',
	'tenant-profile-bulk-delete-success':
		'Successfully deleted {{count}} profile(s).',
	'tenant-profile-bulk-delete-partial-success':
		'Deleted {{succeeded}} profile(s), {{failed}} failed.',
	'tenant-profile-bulk-delete-failure': 'Failed to delete selected profiles.',
	'bulk-delete-disabled-only-default-profiles':
		'Default profiles cannot be bulk-deleted.',
	'bulk-action-max-count-exceeded':
		'Reduce your selection to at most {{max}} items ({{count}} selected).',
	'clear-selection': 'Clear selection',
	'select-all-visible': 'Select all {{count}}',
	'selected-count': '{{count}} selected',
	close: 'Close',
	'actions-for': 'Actions for {{name}}',
	'tenant-profiles-table-aria-label': 'Tenant profiles',
	'tenant-profiles-empty-description': 'No tenant profiles found.',
	'tenant-profiles-no-match-description':
		'No tenant profiles match your search.',
	'confirm-delete-tenant-profile-description':
		'This will permanently delete this tenant profile. Users assigned to this profile may be affected and the action cannot be undone.',
	'error-500-code': '500 — Server Error',
	'tenant-details-error-title': 'Unable to load this tenant',
	'tenant-response-incomplete': 'The tenant response was incomplete.',
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
	toStaffTenantProfileRows: mocks.toStaffTenantProfileRows,
	useStaffTenantProfilesQuery: mocks.useStaffTenantProfilesQuery,
	useDeleteStaffTenantProfileMutation:
		mocks.useDeleteStaffTenantProfileMutation,
	useBulkDeleteStaffTenantProfilesMutation:
		mocks.useBulkDeleteStaffTenantProfilesMutation,
	toStaffTenantProfileBulkActionSummary:
		mocks.toStaffTenantProfileBulkActionSummary,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
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

const RouteComponent = (
	Route as unknown as {
		component: () => JSX.Element;
	}
).component;

const renderPage = () => render(<RouteComponent />);

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
		mocks.useBulkDeleteStaffTenantProfilesMutation.mockReturnValue({
			mutateAsync: mocks.bulkDeleteProfileMutation,
			isPending: false,
		});
		mocks.toStaffTenantProfileBulkActionSummary.mockImplementation(
			(result: { succeededCount?: number; failedCount?: number }) => ({
				succeededCount: result?.succeededCount ?? 0,
				failedCount: result?.failedCount ?? 0,
				failedItems: [],
			}),
		);
		mocks.toStaffTenantDetails.mockReturnValue({
			id: '11111111-1111-1111-1111-111111111111',
			name: 'Acme Corporation',
			code: 'ACME',
			status: 'Active',
			usersCount: 12,
			maxUsers: 50,
			profilesCount: 2,
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
				permissionsCount: 12,
			},
			{
				id: 'profile-2',
				name: 'Support',
				description: 'Respond to member tickets',
				isDefault: false,
				userAccountCount: 5,
				permissionsCount: 4,
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
		expect(screen.getByText('System')).toBeTruthy();
		expect(screen.getByText('Custom')).toBeTruthy();
		expect(screen.getByText('7 members · 12 permissions')).toBeTruthy();
		expect(screen.getByText('5 members · 4 permissions')).toBeTruthy();
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
				search: expect.objectContaining({ new: 1 }),
				replace: true,
			}),
		);
	});

	test('renders the create drawer open when the new search param is set', () => {
		mocks.search = { new: 1 };
		renderPage();

		expect(screen.getByTestId('profile-create-drawer-open')).toBeTruthy();
	});

	test('a debounced search commit does not close a drawer opened within the debounce window (F1)', async () => {
		const renderResult = renderPage();

		fireEvent.change(screen.getByTestId('staff-tenant-profiles-grid-search'), {
			target: { value: 'an' },
		});

		// Simulate opening the create drawer within the 300ms debounce window:
		// the route re-renders with the new URL search state, same as a real
		// navigation would, before the debounced commit fires.
		mocks.search = { new: 1 };
		renderResult.rerender(<RouteComponent />);

		await new Promise((resolve) => setTimeout(resolve, 350));

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).toMatchObject({ new: 1, q: 'an' });
	});

	test('a debounced search commit does not revert the view toggled within the debounce window (r3-F1)', async () => {
		mocks.search = { view: 'table' };
		const renderResult = renderPage();

		fireEvent.change(screen.getByTestId('staff-tenant-profiles-grid-search'), {
			target: { value: 'an' },
		});

		// Simulate toggling the view back to "cards" within the 300ms debounce
		// window: `view` is omitted entirely for 'cards' rather than set to
		// undefined, so the route re-renders with no `view` key at all.
		mocks.search = {};
		renderResult.rerender(<RouteComponent />);

		await new Promise((resolve) => setTimeout(resolve, 350));

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).not.toHaveProperty('view');
		expect(lastCall?.search).toMatchObject({ q: 'an' });
	});

	test('shows the honest profiles count next to the tab title', () => {
		renderPage();

		const title = screen.getByRole('heading', { name: /Profiles/ });
		expect(title.textContent).toContain('2');
	});

	test('shows the permissions count alongside the member count on each card', () => {
		renderPage();

		expect(screen.getByText(/12 permissions/)).toBeTruthy();
		expect(screen.getByText(/4 permissions/)).toBeTruthy();
	});

	test('renders the Delete action disabled (not hidden) for the default profile but enabled for a custom one', async () => {
		renderPage();

		const triggers = screen.getAllByRole('button', { name: /^Actions for/ });
		fireEvent.click(triggers[0]);
		expect(
			await screen.findByRole('menuitem', { name: 'View details' }),
		).toBeTruthy();

		const defaultDeleteItem = screen.getByTestId(
			'staff-tenant-profile-delete-profile-1',
		);
		expect(defaultDeleteItem).toBeTruthy();
		expect(defaultDeleteItem.getAttribute('aria-disabled')).toBe('true');
		expect(defaultDeleteItem.getAttribute('title')).toBe(
			"Default profiles can't be deleted.",
		);

		fireEvent.click(triggers[0]);
		fireEvent.click(triggers[1]);
		const customDeleteItem = await screen.findByTestId(
			'staff-tenant-profile-delete-profile-2',
		);
		expect(customDeleteItem.getAttribute('aria-disabled')).toBeNull();
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
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
	});

	test('shows a failed profile delete in the top feedback bar, not silently at the page bottom (r3-tenants-F12)', async () => {
		mocks.deleteProfileMutation.mockRejectedValue({
			kind: 'problem',
			status: 409,
			responseStatusCode: 409,
			title: 'Conflict',
			detail: 'This profile is still assigned to a user.',
		});

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
			expect(
				within(screen.getByRole('status')).getByText(
					'This profile is still assigned to a user.',
				),
			).toBeTruthy(),
		);
	});

	test('the type filter maps System/Custom to the is_default URL param and resets the cursor', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profiles-grid-type-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId(
				'staff-tenant-profiles-grid-type-filter-system',
			),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ is_default: true }),
				replace: true,
			}),
		);
		const [[navigatedArgs]] = mocks.navigate.mock.calls;
		expect(
			(navigatedArgs as { search: Record<string, unknown> }).search.cursor,
		).toBeUndefined();
	});

	test('renders profiles narrowed to System when is_default=true is set on the URL', () => {
		mocks.search = { is_default: true };

		renderPage();

		expect(mocks.useStaffTenantProfilesQuery).toHaveBeenCalledWith(
			expect.objectContaining({ isDefault: 'true' }),
			expect.anything(),
		);
	});

	test('the view toggle switches to the table view and stores it on the URL', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profile-card-profile-1'),
		).toBeTruthy();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profiles-grid-view-toggle-table'),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ view: 'table' }),
				replace: true,
			}),
		);
	});

	test('renders the profiles table with row selection when view=table is set on the URL', () => {
		mocks.search = { view: 'table' };

		renderPage();

		expect(screen.getByTestId('staff-tenant-profiles-grid-rows')).toBeTruthy();
		expect(screen.getAllByText('Approvers').length).toBeGreaterThan(0);
		expect(
			screen.getByRole('checkbox', { name: 'Select all rows' }),
		).toBeTruthy();
	});

	test('the card grid view lets the page scroll (bodyScroll=page); the table view owns its own scroll (bodyScroll=contained)', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profiles-page').dataset.bodyScroll,
		).toBe('page');
		cleanup();

		mocks.search = { view: 'table' };
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-profiles-page').dataset.bodyScroll,
		).toBe('contained');
	});

	test('bulk-deletes selected profiles from the card grid via the floating selection bar', async () => {
		mocks.bulkDeleteProfileMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		mocks.toStaffTenantProfileBulkActionSummary.mockReturnValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-card-select-profile-2'),
		);

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Delete selected' }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

		await waitFor(() =>
			expect(mocks.bulkDeleteProfileMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileIds: ['profile-2'],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
		await waitFor(() =>
			expect(
				screen.getByText('Successfully deleted 1 profile(s).'),
			).toBeTruthy(),
		);
	});

	test('reports a partial-success message when some bulk-deleted profiles fail', async () => {
		mocks.bulkDeleteProfileMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [],
		});
		mocks.toStaffTenantProfileBulkActionSummary.mockReturnValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-card-select-profile-2'),
		);

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Delete selected' }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

		await waitFor(() =>
			expect(mocks.bulkDeleteProfileMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileIds: ['profile-2'],
			}),
		);
		await waitFor(() =>
			expect(screen.getByText('Deleted 1 profile(s), 1 failed.')).toBeTruthy(),
		);
	});

	test('reports a failure message when every bulk-deleted profile fails', async () => {
		mocks.bulkDeleteProfileMutation.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [],
		});
		mocks.toStaffTenantProfileBulkActionSummary.mockReturnValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-card-select-profile-2'),
		);

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Delete selected' }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

		await waitFor(() =>
			expect(mocks.bulkDeleteProfileMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileIds: ['profile-2'],
			}),
		);
		await waitFor(() =>
			expect(screen.getByText('Deleted 0 profile(s), 1 failed.')).toBeTruthy(),
		);
	});

	test('warns and fires no mutation when only the default profile is selected for bulk delete', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-card-select-profile-1'),
		);

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);

		await waitFor(() =>
			expect(
				screen.getByText('Default profiles cannot be bulk-deleted.'),
			).toBeTruthy(),
		);
		expect(
			screen.queryByRole('heading', { name: 'Delete selected' }),
		).toBeNull();
		expect(mocks.bulkDeleteProfileMutation).not.toHaveBeenCalled();
	});

	test('excludes the default profile from a mixed bulk-delete selection', async () => {
		mocks.bulkDeleteProfileMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		mocks.toStaffTenantProfileBulkActionSummary.mockReturnValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-card-select-profile-1'),
		);
		fireEvent.click(
			screen.getByTestId('staff-tenant-profile-card-select-profile-2'),
		);

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);
		await waitFor(() =>
			expect(
				screen.getByText('Are you sure you want to delete 1 profile(s)?'),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

		await waitFor(() =>
			expect(mocks.bulkDeleteProfileMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				profileIds: ['profile-2'],
			}),
		);
	});

	// The gate is structurally hard to reach through normal navigation (row
	// selection is pruned to the visible page every fetch, and page size tops
	// out at BULK_ACTION_MAX_COUNT — see review-r2-tests.md F3/F4), but the
	// branch is real production code and must render correctly whenever the
	// selection count does exceed the limit.
	test('disables bulk delete and shows the max-count message once selection exceeds BULK_ACTION_MAX_COUNT', async () => {
		const manyRows = Array.from({ length: 101 }, (_, index) => ({
			id: `profile-${index}`,
			name: `Profile ${index}`,
			description: null,
			isDefault: false,
			userAccountCount: 1,
			permissionsCount: 1,
		}));
		mocks.toStaffTenantProfileRows.mockReturnValue(manyRows);
		mocks.useStaffTenantProfilesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: manyRows,
					nextCursor: null,
				},
			}),
		);
		mocks.search = { view: 'table' };

		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));

		const deleteButton = await screen.findByRole('button', {
			name: 'Delete selected',
		});
		expect(deleteButton.hasAttribute('disabled')).toBe(true);
		expect(deleteButton.getAttribute('title')).toBe(
			'Reduce your selection to at most 100 items (101 selected).',
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
