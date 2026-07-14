/** @vitest-environment jsdom */
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	toStaffTenantRows: vi.fn(),
	useStaffTenantsQuery: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	suspendTenantMutation: vi.fn(),
	reactivateTenantMutation: vi.fn(),
	deleteTenantMutation: vi.fn(),
	useSuspendStaffTenantMutation: vi.fn(),
	useReactivateStaffTenantMutation: vi.fn(),
	useDeleteStaffTenantMutation: vi.fn(),
	bulkSuspendTenantsMutation: vi.fn(),
	bulkReactivateTenantsMutation: vi.fn(),
	bulkDeleteTenantsMutation: vi.fn(),
	useBulkSuspendStaffTenantsMutation: vi.fn(),
	useBulkReactivateStaffTenantsMutation: vi.fn(),
	useBulkDeleteStaffTenantsMutation: vi.fn(),
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
		useSearch: () => mocks.search,
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

const TRANSLATIONS: Record<string, string> = {
	tenant: 'Tenant',
	'bulk-suspend': 'Suspend selected',
	'bulk-reactivate': 'Reactivate selected',
	'bulk-delete': 'Delete selected',
	suspend: 'Suspend',
	reactivate: 'Reactivate',
	delete: 'Delete',
	'bulk-suspend-confirm': 'Are you sure you want to suspend {{count}} tenants?',
	'bulk-reactivate-confirm':
		'Are you sure you want to reactivate {{count}} tenants?',
	'bulk-delete-confirm':
		'Are you sure you want to delete {{count}} tenants? This action cannot be undone.',
	'bulk-suspend-disabled-no-active-tenants':
		'Select at least one active tenant to suspend.',
	'bulk-reactivate-disabled-no-suspended-tenants':
		'Select at least one suspended tenant to reactivate.',
	'bulk-delete-disabled-until-all-tenants-suspended':
		'Only suspended tenants can be deleted. Clear active tenants from the selection first.',
	'tenant-bulk-suspend-success': 'Successfully suspended {{count}} tenant(s).',
	'tenant-bulk-suspend-partial-success':
		'Suspended {{succeeded}} tenant(s), {{failed}} failed.',
	'tenant-bulk-suspend-failure': 'Failed to suspend selected tenants.',
	'selected-count': '{{count}} selected',
	'clear-selection': 'Clear selection',
	'more-actions': 'More actions',
	'bulk-actions': 'Bulk actions',
	'bulk-action-max-count-exceeded':
		'Reduce your selection to at most {{max}} items ({{count}} selected).',
	'all-statuses': 'All statuses',
	'select-row-named': 'Select {{name}}',
	'select-all-rows': 'Select all rows',
	'page-n': 'Page {{page}}',
	'previous-page': 'Previous page',
	'next-page': 'Next page',
	'status-pending': 'Pending',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	clear: 'Clear',
	tenants: 'Tenants',
	'tenants-list-description':
		'Manage tenant organizations, seats, and lifecycle.',
	name: 'Name',
	status: 'Status',
	users: 'Users',
	'max-users-column': 'Max users',
	'staff-tenants-table-aria-label': 'Staff tenants',
	'actions-for': 'Actions for {{name}}',
	'no-lifecycle-actions': 'No lifecycle actions',
	'suspend-tenant': 'Suspend tenant',
	'suspend-tenant-confirm': 'Are you sure you want to suspend "{{name}}"?',
	'reactivate-tenant': 'Reactivate tenant',
	'reactivate-tenant-confirm':
		'Are you sure you want to reactivate "{{name}}"?',
	'confirm-delete-tenant-title': 'Delete tenant',
	'confirm-delete-tenant-message':
		'Are you sure you want to delete this tenant?',
	'unable-to-suspend-tenant': 'Unable to suspend this tenant.',
	'unable-to-reactivate-tenant': 'Unable to reactivate this tenant.',
	'unable-to-delete-tenant': 'Unable to delete this tenant.',
	cancel: 'Cancel',
	'list-no-match-default-description': 'No results match your search.',
};

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			if (key === 'new-item' && typeof options?.item === 'string') {
				return `New ${options.item}`;
			}

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
	LogoutRedirect: () =>
		createElement('div', { 'data-testid': 'logout-redirect' }, 'logout'),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	toStaffTenantRows: mocks.toStaffTenantRows,
	useStaffTenantsQuery: mocks.useStaffTenantsQuery,
	invalidateStaffTenants: (queryClient: {
		invalidateQueries: (arg: unknown) => unknown;
	}) =>
		queryClient.invalidateQueries({
			queryKey: ['staff', 'staff-tenants'],
		}),
	useSuspendStaffTenantMutation: mocks.useSuspendStaffTenantMutation,
	useReactivateStaffTenantMutation: mocks.useReactivateStaffTenantMutation,
	useDeleteStaffTenantMutation: mocks.useDeleteStaffTenantMutation,
	useBulkSuspendStaffTenantsMutation: mocks.useBulkSuspendStaffTenantsMutation,
	useBulkReactivateStaffTenantsMutation:
		mocks.useBulkReactivateStaffTenantsMutation,
	useBulkDeleteStaffTenantsMutation: mocks.useBulkDeleteStaffTenantsMutation,
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

import { Route } from './tenants';

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

describe('staff tenants route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.toStaffTenantRows.mockReturnValue([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			},
		]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'tenant-1',
							name: 'Acme Corporation',
							status: 'Active',
							usersCount: 12,
							maxUsers: 50,
						},
					],
					nextCursor: null,
				},
			}),
		);
		mocks.useSuspendStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.suspendTenantMutation,
			isPending: false,
		});
		mocks.useReactivateStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.reactivateTenantMutation,
			isPending: false,
		});
		mocks.useDeleteStaffTenantMutation.mockReturnValue({
			mutateAsync: mocks.deleteTenantMutation,
			isPending: false,
		});
		mocks.useBulkSuspendStaffTenantsMutation.mockReturnValue({
			mutateAsync: mocks.bulkSuspendTenantsMutation,
			isPending: false,
		});
		mocks.useBulkReactivateStaffTenantsMutation.mockReturnValue({
			mutateAsync: mocks.bulkReactivateTenantsMutation,
			isPending: false,
		});
		mocks.useBulkDeleteStaffTenantsMutation.mockReturnValue({
			mutateAsync: mocks.bulkDeleteTenantsMutation,
			isPending: false,
		});
	});

	afterEach(() => {
		cleanup();
	});

	test('renders tenant rows and uses the default table query state', () => {
		renderPage();

		expect(screen.getByText('Tenants')).toBeTruthy();
		expect(screen.getByTestId('staff-tenants-table-rows')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(screen.getByText('Active')).toBeTruthy();
		expect(screen.getByText('12')).toBeTruthy();
		expect(screen.getAllByText('50').length).toBeGreaterThan(0);
		expect(screen.getByTestId('staff-tenants-table-page-size')).toBeTruthy();
		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith({
			q: undefined,
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: undefined,
			size: 100,
		});
	});

	test('passes the active status filter from the URL through to the tenants query', () => {
		mocks.search = { status: 'active' };

		renderPage();

		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith({
			q: undefined,
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: undefined,
			size: 100,
			status: 'active',
		});
	});

	test('passes the suspended status filter from the URL through to the tenants query', () => {
		mocks.search = { status: 'suspended' };

		renderPage();

		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith({
			q: undefined,
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: undefined,
			size: 100,
			status: 'suspended',
		});
	});

	test('renders a status filter trigger reflecting the URL and lists All/Active/Suspended', async () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenants-table-status-filter-trigger')
				.textContent,
		).toContain('All statuses');

		fireEvent.click(
			screen.getByTestId('staff-tenants-table-status-filter-trigger'),
		);

		expect(
			await screen.findByTestId('staff-tenants-table-status-filter-all'),
		).toBeTruthy();
		expect(
			screen.getByTestId('staff-tenants-table-status-filter-pending'),
		).toBeTruthy();
		expect(
			screen.getByTestId('staff-tenants-table-status-filter-active'),
		).toBeTruthy();
		expect(
			screen.getByTestId('staff-tenants-table-status-filter-suspended'),
		).toBeTruthy();
	});

	test('selecting Active in the status filter navigates with status=active', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenants-table-status-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-active'),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ status: 'active' }),
				replace: true,
			}),
		);
	});

	test('a debounced search commit does not revert a status filter chosen within the debounce window (F1)', async () => {
		const renderResult = renderPage();

		fireEvent.change(screen.getByTestId('staff-tenants-table-search'), {
			target: { value: 'an' },
		});

		// Simulate choosing "Active" within the 300ms debounce window: the
		// route re-renders with the new URL search state, same as a real
		// navigation would, before the debounced commit fires.
		mocks.search = { status: 'active' };
		renderResult.rerender(<RouteComponent />);

		await new Promise((resolve) => setTimeout(resolve, 350));

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).toMatchObject({ status: 'active', q: 'an' });
	});

	test('a debounced search commit does not revert a status filter cleared within the debounce window (r3-F1)', async () => {
		mocks.search = { status: 'active' };
		const renderResult = renderPage();

		fireEvent.change(screen.getByTestId('staff-tenants-table-search'), {
			target: { value: 'an' },
		});

		// Simulate clearing the status filter ("All statuses") within the
		// 300ms debounce window: the parse helper omits `status` entirely
		// rather than setting it to undefined, so the route re-renders with
		// no `status` key at all.
		mocks.search = {};
		renderResult.rerender(<RouteComponent />);

		await new Promise((resolve) => setTimeout(resolve, 350));

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).not.toHaveProperty('status');
		expect(lastCall?.search).toMatchObject({ q: 'an' });
	});

	test('selecting Pending in the status filter navigates with status=pending', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenants-table-status-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-pending'),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ status: 'pending' }),
				replace: true,
			}),
		);
	});

	test('changing the status filter resets the cursor page index back to 0 (cursorResetKey generation reset)', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'tenant-1',
							name: 'Acme Corporation',
							status: 'Active',
							usersCount: 12,
							maxUsers: 50,
						},
					],
					nextCursor: 'cursor-2',
				},
			}),
		);

		const renderResult = renderPage();

		expect(screen.getByText('Page 1')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
		expect(screen.getByText('Page 2')).toBeTruthy();

		// Simulate the URL now reflecting a status filter change — the route
		// re-renders with new search props, same as a real navigation would.
		mocks.search = { status: 'active' };
		renderResult.rerender(<RouteComponent />);

		expect(screen.getByText('Page 1')).toBeTruthy();
	});

	test('the status filter trigger reflects an active URL status and "All statuses" clears it', async () => {
		mocks.search = { status: 'suspended' };
		renderPage();

		expect(
			screen.getByTestId('staff-tenants-table-status-filter-trigger')
				.textContent,
		).toContain('Suspended');

		fireEvent.click(
			screen.getByTestId('staff-tenants-table-status-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-all'),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				replace: true,
			}),
		);
		const [[navigatedArgs]] = mocks.navigate.mock.calls;
		expect(
			(navigatedArgs as { search: Record<string, unknown> }).search.status,
		).toBeUndefined();
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'acme' };
		mocks.toStaffTenantRows.mockReturnValue([]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenants-table-no-match')).toBeTruthy();
		expect(screen.getByText('No results match your search.')).toBeTruthy();
		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith({
			q: 'acme',
			sortId: 'created_at',
			sortOrder: 'desc',
			cursor: undefined,
			size: 100,
		});
	});

	test('renders the table error state without logging out for non-401 failures', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
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
		mocks.toStaffTenantRows.mockReturnValue([]);

		renderPage();

		expect(screen.getByTestId('staff-tenants-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when the failure should invalidate the session', () => {
		mocks.useStaffTenantsQuery.mockReturnValue(
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
		mocks.toStaffTenantRows.mockReturnValue([]);

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	// The gate is structurally hard to reach through normal navigation (row
	// selection is pruned to the visible page every fetch, and page size tops
	// out at BULK_ACTION_MAX_COUNT — see review-r2-tests.md F3/F4), but the
	// branch is real production code and must render correctly whenever the
	// selection count does exceed the limit.
	test('disables the bulk actions trigger and shows the max-count message once selection exceeds BULK_ACTION_MAX_COUNT', async () => {
		const manyRows = Array.from({ length: 101 }, (_, index) => ({
			id: `tenant-${index}`,
			name: `Tenant ${index}`,
			status: 'Active',
			usersCount: 1,
			maxUsers: 50,
		}));
		mocks.toStaffTenantRows.mockReturnValue(manyRows);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: manyRows,
					nextCursor: null,
				},
			}),
		);

		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));

		const moreActionsButton = await screen.findByRole('button', {
			name: 'More actions',
		});
		expect(moreActionsButton.hasAttribute('disabled')).toBe(true);
		expect(moreActionsButton.getAttribute('title')).toBe(
			'Reduce your selection to at most 100 items (101 selected).',
		);
	});

	test('renders a suspend action for active tenants', async () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));

		expect(
			await screen.findByRole('menuitem', { name: 'Suspend' }),
		).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).toBeNull();
		expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
	});

	test('renders reactivate and delete actions for suspended tenants', async () => {
		mocks.toStaffTenantRows.mockReturnValue([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Suspended',
				usersCount: 12,
				maxUsers: 50,
			},
		]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'tenant-1',
							name: 'Acme Corporation',
							status: 'Suspended',
							usersCount: 12,
							maxUsers: 50,
						},
					],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));

		expect(
			await screen.findByRole('menuitem', { name: 'Reactivate' }),
		).toBeTruthy();
		expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Suspend' })).toBeNull();
	});

	test('renders "—" with no actions menu for a Pending tenant (no lifecycle action is eligible)', () => {
		mocks.toStaffTenantRows.mockReturnValue([
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Pending',
				usersCount: 0,
				maxUsers: 50,
			},
		]);
		mocks.useStaffTenantsQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'tenant-1',
							name: 'Acme Corporation',
							status: 'Pending',
							usersCount: 0,
							maxUsers: 50,
						},
					],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(screen.getByText('—')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Actions for/ })).toBeNull();
	});

	test('requires explicit confirmation before suspending a tenant', async () => {
		mocks.suspendTenantMutation.mockResolvedValue({});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Suspend tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Cancel' }).slice(-1)[0],
		);
		await waitFor(() =>
			expect(mocks.suspendTenantMutation).not.toHaveBeenCalled(),
		);
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('performs suspend action for active tenants and refreshes tenant list and detail data', async () => {
		mocks.suspendTenantMutation.mockResolvedValue({
			status: 'Suspended',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Suspend tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.suspendTenantMutation).toHaveBeenCalledWith({
				tenantId: 'tenant-1',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			}),
		);
	});

	test('shows a local non-auth error when a tenant action fails with 400', async () => {
		mocks.suspendTenantMutation.mockRejectedValue({
			kind: 'problem',
			status: 400,
			responseStatusCode: 400,
			title: 'Invalid tenant',
			detail: 'Invalid tenant',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Suspend tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(
				within(screen.getByRole('status')).getByText('Invalid tenant'),
			).toBeTruthy(),
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.invalidateQueries).not.toHaveBeenCalled();
	});

	test('redirects to logout when a tenant action fails with 401', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		mocks.suspendTenantMutation.mockRejectedValue({
			kind: 'problem',
			status: 401,
			responseStatusCode: 401,
			title: 'Unauthorized',
			detail: 'Session expired',
		});

		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /^Actions for/ }));
		fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Suspend tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
		);
	});

	describe('bulk actions', () => {
		test('renders a selection checkbox and hashed avatar for each tenant row', () => {
			const { container } = renderPage();

			expect(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			).toBeTruthy();
			expect(container.querySelector('.publy-avatar-initials')).toBeTruthy();
		});

		test('wraps the avatar and name inside a single link so hovering either activates it', () => {
			const { container } = renderPage();

			const nameLink = screen.getByRole('link', { name: /Acme Corporation/ });
			expect(nameLink.querySelector('.publy-avatar-initials')).toBeTruthy();
			expect(container.querySelector('.publy-avatar-initials')).toBe(
				nameLink.querySelector('.publy-avatar-initials'),
			);
		});

		test('centres the row-actions trigger via a data-align cell instead of a justify-end wrapper', () => {
			renderPage();

			const trigger = screen.getByRole('button', { name: /^Actions for/ });
			const cell = trigger.closest('[data-slot="table-cell"]');
			expect(cell?.getAttribute('data-align')).toBe('center');
			expect(trigger.closest('.flex.items-end')).toBeNull();
		});

		test('selecting a row reveals the floating selection bar with a selected count', async () => {
			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);

			expect(await screen.findByText('1 selected')).toBeTruthy();
			expect(
				await screen.findByRole('button', { name: 'More actions' }),
			).toBeTruthy();
			expect(screen.getByTestId('floating-selection-bar')).toBeTruthy();
		});

		test('the toolbar does not swap during selection — no filters to hide on this page', () => {
			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);

			expect(screen.getByTestId('staff-tenants-table-toolbar')).toBeTruthy();
		});

		test('an ineligible bulk suspend click shows inline feedback and does not open the confirm dialog', async () => {
			mocks.toStaffTenantRows.mockReturnValue([
				{
					id: 'tenant-1',
					name: 'Acme Corporation',
					status: 'Suspended',
					usersCount: 12,
					maxUsers: 50,
				},
			]);
			mocks.useStaffTenantsQuery.mockReturnValue(
				buildQueryResult({
					data: {
						data: [
							{
								id: 'tenant-1',
								name: 'Acme Corporation',
								status: 'Suspended',
								usersCount: 12,
								maxUsers: 50,
							},
						],
						nextCursor: null,
					},
				}),
			);

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				await screen.findByRole('button', { name: 'More actions' }),
			);
			fireEvent.click(
				await screen.findByRole('menuitem', { name: 'Suspend selected' }),
			);

			expect(
				screen.getByText('Select at least one active tenant to suspend.'),
			).toBeTruthy();
			expect(
				screen.queryByRole('heading', { name: 'Suspend selected' }),
			).toBeNull();
			expect(mocks.bulkSuspendTenantsMutation).not.toHaveBeenCalled();
		});

		test('bulk-suspends only the eligible selected tenants and reports success', async () => {
			mocks.bulkSuspendTenantsMutation.mockResolvedValue({
				succeededCount: 1,
				failedCount: 0,
			});

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				await screen.findByRole('button', { name: 'More actions' }),
			);
			fireEvent.click(
				await screen.findByRole('menuitem', { name: 'Suspend selected' }),
			);

			await waitFor(() =>
				expect(
					screen.getByRole('heading', { name: 'Suspend selected' }),
				).toBeTruthy(),
			);
			expect(
				screen.getByText('Are you sure you want to suspend 1 tenants?'),
			).toBeTruthy();

			fireEvent.click(
				screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(mocks.bulkSuspendTenantsMutation).toHaveBeenCalledWith({
					tenantIds: ['tenant-1'],
				}),
			);
			await waitFor(() =>
				expect(
					screen.getByText('Successfully suspended 1 tenant(s).'),
				).toBeTruthy(),
			);
			expect(mocks.invalidateQueries).toHaveBeenCalledWith({
				queryKey: ['staff', 'staff-tenants'],
			});
			expect(
				screen
					.getByRole('checkbox', { name: 'Select Acme Corporation' })
					.getAttribute('aria-checked'),
			).toBe('false');
		});

		test('reports a partial-success message when some bulk-suspended tenants fail', async () => {
			mocks.bulkSuspendTenantsMutation.mockResolvedValue({
				succeededCount: 1,
				failedCount: 1,
			});

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				await screen.findByRole('button', { name: 'More actions' }),
			);
			fireEvent.click(
				await screen.findByRole('menuitem', { name: 'Suspend selected' }),
			);
			await waitFor(() =>
				expect(
					screen.getByRole('heading', { name: 'Suspend selected' }),
				).toBeTruthy(),
			);
			fireEvent.click(
				screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(
					screen.getByText('Suspended 1 tenant(s), 1 failed.'),
				).toBeTruthy(),
			);
		});

		test('redirects to logout when a bulk action fails with 401', async () => {
			mocks.shouldLogoutForFailure.mockReturnValue(true);
			mocks.bulkSuspendTenantsMutation.mockRejectedValue({
				kind: 'problem',
				status: 401,
				responseStatusCode: 401,
				title: 'Unauthorized',
				detail: 'Session expired',
			});

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				await screen.findByRole('button', { name: 'More actions' }),
			);
			fireEvent.click(
				await screen.findByRole('menuitem', { name: 'Suspend selected' }),
			);
			await waitFor(() =>
				expect(
					screen.getByRole('heading', { name: 'Suspend selected' }),
				).toBeTruthy(),
			);
			fireEvent.click(
				screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
			);
		});

		const mixedStatusTenants = [
			{
				id: 'tenant-1',
				name: 'Acme Corporation',
				status: 'Active',
				usersCount: 12,
				maxUsers: 50,
			},
			{
				id: 'tenant-2',
				name: 'Globex Corporation',
				status: 'Suspended',
				usersCount: 3,
				maxUsers: 10,
			},
		];

		const allSuspendedTenants = mixedStatusTenants.map((tenant) => ({
			...tenant,
			status: 'Suspended',
		}));

		test('a mixed active/suspended bulk delete click shows inline feedback and fires no mutation', async () => {
			mocks.toStaffTenantRows.mockReturnValue(mixedStatusTenants);
			mocks.useStaffTenantsQuery.mockReturnValue(
				buildQueryResult({
					data: { data: mixedStatusTenants, nextCursor: null },
				}),
			);

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Globex Corporation' }),
			);
			fireEvent.click(
				await screen.findByRole('button', { name: 'More actions' }),
			);
			fireEvent.click(
				await screen.findByRole('menuitem', { name: 'Delete selected' }),
			);

			expect(
				screen.getByText(
					'Only suspended tenants can be deleted. Clear active tenants from the selection first.',
				),
			).toBeTruthy();
			expect(
				screen.queryByRole('heading', { name: 'Delete selected' }),
			).toBeNull();
			expect(mocks.bulkDeleteTenantsMutation).not.toHaveBeenCalled();
		});

		test('bulk-deletes every selected tenant when the whole selection is suspended', async () => {
			mocks.toStaffTenantRows.mockReturnValue(allSuspendedTenants);
			mocks.useStaffTenantsQuery.mockReturnValue(
				buildQueryResult({
					data: { data: allSuspendedTenants, nextCursor: null },
				}),
			);
			mocks.bulkDeleteTenantsMutation.mockResolvedValue({
				succeededCount: 2,
				failedCount: 0,
			});

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Globex Corporation' }),
			);
			fireEvent.click(
				await screen.findByRole('button', { name: 'More actions' }),
			);
			fireEvent.click(
				await screen.findByRole('menuitem', { name: 'Delete selected' }),
			);

			await waitFor(() =>
				expect(
					screen.getByRole('heading', { name: 'Delete selected' }),
				).toBeTruthy(),
			);
			fireEvent.click(
				screen.getAllByRole('button', { name: 'Delete' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(mocks.bulkDeleteTenantsMutation).toHaveBeenCalledWith({
					tenantIds: ['tenant-1', 'tenant-2'],
				}),
			);
		});
	});
});
