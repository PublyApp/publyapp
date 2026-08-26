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
import type { TestLabelMap } from '~/lib/testing/test-label-map';
import { chooseBulkAction } from '~/test-helpers/choose-bulk-action';

const mocks = vi.hoisted(() => ({
	search: {},
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
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
}));

vi.mock('@tanstack/react-router', () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		options,
		useNavigate: () => mocks.navigate,
		useSearch: () => mocks.search,
	}),
	Link: ({ children, to, ...props }: { children: ReactNode; to: string }) =>
		createElement('a', { href: to, ...props }, children),
}));

const TRANSLATIONS: TestLabelMap = {
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
		invalidateQueries: (arg: unknown) => void;
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

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
		warning: mocks.toastWarning,
	},
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

const RouteComponent = Route.options.component as () => JSX.Element;

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
		vi.useRealTimers();
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

	test('renders the default status control when handed an already-canonicalized search (URL-level proof: deep-link-canonicalization.test.tsx)', () => {
		const validateSearch = (
			Route.options as {
				validateSearch: (
					search: Record<string, unknown>,
				) => Record<string, unknown>;
			}
		).validateSearch;
		const canonicalSearch = validateSearch({ status: 'bogus' });

		expect(
			Object.prototype.hasOwnProperty.call(canonicalSearch, 'status'),
		).toBe(true);
		expect(canonicalSearch.status).toBeUndefined();

		mocks.search = canonicalSearch;
		renderPage();

		expect(
			screen.getByTestId('staff-tenants-table-status-filter-trigger')
				.textContent,
		).toContain('All statuses');
		expect(mocks.useStaffTenantsQuery).toHaveBeenCalledWith(
			expect.objectContaining({ status: undefined }),
		);
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

	test('renders persistent square checkbox rows and a distinct All statuses reset', async () => {
		mocks.search = { status: 'active,suspended' };
		renderPage();

		const trigger = screen.getByTestId(
			'staff-tenants-table-status-filter-trigger',
		);
		expect(trigger.textContent).toContain('Active, Suspended');
		fireEvent.click(trigger);

		const all = await screen.findByTestId(
			'staff-tenants-table-status-filter-all',
		);
		const pending = screen.getByTestId(
			'staff-tenants-table-status-filter-pending',
		);
		const active = screen.getByTestId(
			'staff-tenants-table-status-filter-active',
		);
		const suspended = screen.getByTestId(
			'staff-tenants-table-status-filter-suspended',
		);

		expect(
			all.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
		).toBeNull();
		for (const item of [pending, active, suspended]) {
			expect(item.getAttribute('role')).toBe('menuitemcheckbox');
			expect(
				item.querySelector('[data-slot="dropdown-menu-checkbox-item-box"]'),
			).not.toBeNull();
		}
		expect(active.getAttribute('aria-checked')).toBe('true');
		expect(suspended.getAttribute('aria-checked')).toBe('true');
	});

	test('toggles multiple statuses without closing and clears the cursor', async () => {
		const view = renderPage();
		const trigger = screen.getByTestId(
			'staff-tenants-table-status-filter-trigger',
		);
		fireEvent.click(trigger);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-active'),
		);

		expect(
			screen.getByTestId('staff-tenants-table-status-filter-suspended'),
		).toBeTruthy();
		mocks.search = { status: 'active' };
		view.rerender(<RouteComponent />);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-suspended'),
		);

		const toggleSearch = mocks.navigate.mock.calls.at(-1)?.[0]?.search as
			| Record<string, unknown>
			| undefined;
		expect(toggleSearch?.status).toBe('active,suspended');
		expect(toggleSearch?.cursor).toBeUndefined();
		expect(mocks.navigate.mock.calls.at(-1)?.[0]?.replace).toBe(true);
	});

	test('deselects a selected status and All statuses resets the set', async () => {
		mocks.search = { status: 'active,suspended', cursor: 'cursor-2' };
		const view = renderPage();
		fireEvent.click(
			screen.getByTestId('staff-tenants-table-status-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-active'),
		);
		const deselectSearch = mocks.navigate.mock.calls.at(-1)?.[0]?.search as
			| Record<string, unknown>
			| undefined;
		expect(deselectSearch?.status).toBe('suspended');
		expect(deselectSearch?.cursor).toBeUndefined();
		expect(mocks.navigate.mock.calls.at(-1)?.[0]?.replace).toBe(true);

		mocks.search = { status: 'suspended' };
		view.rerender(<RouteComponent />);
		fireEvent.click(
			await screen.findByTestId('staff-tenants-table-status-filter-all'),
		);
		const resetSearch = mocks.navigate.mock.calls.at(-1)?.[0]?.search as
			| Record<string, unknown>
			| undefined;
		expect(resetSearch?.status).toBeUndefined();
		expect(resetSearch?.cursor).toBeUndefined();
		expect(mocks.navigate.mock.calls.at(-1)?.[0]?.replace).toBe(true);
	});

	test('a debounced search commit does not revert a status filter chosen within the debounce window (F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			const renderResult = renderPage();

			fireEvent.change(screen.getByTestId('staff-tenants-table-search'), {
				target: { value: 'an' },
			});

			// Simulate choosing "Active" within the 300ms debounce window: the
			// route re-renders with the new URL search state, same as a real
			// navigation would, before the debounced commit fires.
			mocks.search = { status: 'active,suspended' };
			renderResult.rerender(<RouteComponent />);

			// Deterministic (W6-FLAKE #827): step PAST the debounce instead of a
			// real-time sleep — a 350ms wall-clock wait is load-sensitive and was
			// the suite's largest remaining fixed sleep.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(lastCall?.search).toMatchObject({
				status: 'active,suspended',
				q: 'an',
			});
		} finally {
			vi.useRealTimers();
		}
	});

	// tenants-r6-F2: entering selection mode must freeze the query that
	// defines the destructive bulk-action target set — a still-pending
	// search debounce or a still-clickable status filter can silently
	// change which rows a bulk action would hit right after selection.
	test('selecting a row synchronously restores the committed search and cancels its pending debounce (tenants-r6-F2)', () => {
		vi.useFakeTimers();

		try {
			renderPage();

			const search = screen.getByTestId(
				'staff-tenants-table-search',
			) as HTMLInputElement;
			fireEvent.change(search, {
				target: { value: 'an' },
			});
			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);

			expect(search.value).toBe('');
			vi.runOnlyPendingTimers();

			expect(mocks.navigate).not.toHaveBeenCalledWith(
				expect.objectContaining({
					search: expect.objectContaining({ q: 'an' }),
				}),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test('disables the status filter trigger while a row is selected (tenants-r6-F2)', () => {
		renderPage();

		fireEvent.click(
			screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
		);

		expect(
			(
				screen.getByTestId(
					'staff-tenants-table-status-filter-trigger',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	test('a debounced search commit does not revert a status filter cleared within the debounce window (r3-F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		mocks.search = { status: 'active,suspended' };
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

		// Deterministic (W6-FLAKE #827): see the F1 test above.
		await vi.advanceTimersByTimeAsync(301);

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, unknown>;
		};
		expect(lastCall?.search).toHaveProperty('status');
		expect(lastCall?.search?.status).toBeUndefined();
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
		mocks.search = { status: 'active,suspended' };
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
			(navigatedArgs as { search: Record<string, unknown> }).search,
		).toMatchObject({ status: undefined });
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'acme', status: 'active,suspended' };
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
			status: 'active,suspended',
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

		// #1400: the visible label is the accessible name even while capped.
		const moreActionsButton = await screen.findByRole('button', {
			name: 'Bulk actions',
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
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	test('leaves row lifecycle failure feedback to the central mutation owner', async () => {
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

		await waitFor(() => expect(mocks.suspendTenantMutation).toHaveBeenCalled());
		expect(screen.queryByRole('status')).toBeNull();
		expect(screen.queryByText('Invalid tenant')).toBeNull();
		expect(mocks.toastError).not.toHaveBeenCalled();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
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

		test('renders a selection checkbox and hashed logo fallback for each tenant row', () => {
			const { container } = renderPage();

			expect(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			).toBeTruthy();
			expect(
				container.querySelector('[data-slot="person-avatar"]'),
			).toBeTruthy();
			expect(
				container
					.querySelector('[data-slot="person-avatar-fallback"]')
					?.getAttribute('data-palette'),
			).toBe('7');
		});

		test('wraps the avatar and name inside a single link so hovering either activates it', () => {
			const { container } = renderPage();

			const nameLink = screen.getByRole('link', { name: /Acme Corporation/ });
			expect(
				nameLink.querySelector('[data-slot="person-avatar"]'),
			).toBeTruthy();
			expect(container.querySelector('[data-slot="person-avatar"]')).toBe(
				nameLink.querySelector('[data-slot="person-avatar"]'),
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
				await screen.findByRole('button', { name: 'Bulk actions' }),
			).toBeTruthy();
			expect(screen.getByTestId('floating-selection-bar')).toBeTruthy();
		});

		// #1400 (WCAG 2.5.3 label-in-name): the bulk trigger's accessible name
		// must EQUAL its visible "Bulk actions" label — both from one i18n key.
		test('the bulk trigger accessible name equals its visible Bulk actions label', async () => {
			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);

			const trigger = await screen.findByRole('button', {
				name: 'Bulk actions',
			});
			expect(trigger.getAttribute('aria-label')).toBe('Bulk actions');
			expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
		});

		test('the toolbar does not swap during selection — no filters to hide on this page', () => {
			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);

			expect(screen.getByTestId('staff-tenants-table-toolbar')).toBeTruthy();
		});

		test('an ineligible bulk suspend click shows one warning toast and does not open the confirm dialog', async () => {
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
			await chooseBulkAction('Suspend selected', 'Bulk actions');

			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'Select at least one active tenant to suspend.',
			);
			expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
			expect(
				screen.queryByText('Select at least one active tenant to suspend.'),
			).toBeNull();
			expect(
				screen.queryByRole('heading', { name: 'Suspend selected' }),
			).toBeNull();
			expect(mocks.bulkSuspendTenantsMutation).not.toHaveBeenCalled();
		});

		test('bulk-suspends only the eligible selected tenants and reports success', async () => {
			mocks.toStaffTenantRows.mockReturnValue(mixedStatusTenants);
			mocks.useStaffTenantsQuery.mockReturnValue(
				buildQueryResult({
					data: { data: mixedStatusTenants, nextCursor: null },
				}),
			);
			mocks.bulkSuspendTenantsMutation.mockResolvedValue({
				succeededCount: 1,
				failedCount: 0,
			});

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Globex Corporation' }),
			);
			await chooseBulkAction('Suspend selected', 'Bulk actions');

			expect(
				screen.getByRole('heading', { name: 'Suspend selected' }),
			).toBeTruthy();
			expect(
				screen.getByText('Are you sure you want to suspend 1 tenants?'),
			).toBeTruthy();

			fireEvent.click(
				screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(mocks.toastSuccess).toHaveBeenCalledWith(
					'Successfully suspended 1 tenant(s).',
				),
			);
			expect(mocks.bulkSuspendTenantsMutation).toHaveBeenCalledWith({
				tenantIds: ['tenant-1'],
			});
			expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
			expect(screen.queryByRole('status')).toBeNull();
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
			await chooseBulkAction('Suspend selected', 'Bulk actions');
			expect(
				screen.getByRole('heading', { name: 'Suspend selected' }),
			).toBeTruthy();
			fireEvent.click(
				screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(mocks.toastError).toHaveBeenCalledWith(
					'Suspended 1 tenant(s), 1 failed.',
				),
			);
			expect(mocks.toastError).toHaveBeenCalledTimes(1);
			expect(screen.queryByRole('status')).toBeNull();
		});

		test('reports a bulk action failure through one local error toast owner', async () => {
			const error = {
				kind: 'problem',
				status: 400,
				responseStatusCode: 400,
				title: 'Invalid tenants',
				detail: 'The selected tenants cannot be suspended.',
			};
			mocks.bulkSuspendTenantsMutation.mockRejectedValue(error);

			renderPage();

			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select Acme Corporation' }),
			);
			await chooseBulkAction('Suspend selected', 'Bulk actions');
			const dialog = screen.getByRole('alertdialog');
			fireEvent.click(within(dialog).getByRole('button', { name: 'Suspend' }));

			await waitFor(() =>
				expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
					error,
					'Failed to suspend selected tenants.',
				),
			);
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledTimes(1);
			expect(screen.queryByRole('status')).toBeNull();
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
			await chooseBulkAction('Suspend selected', 'Bulk actions');
			expect(
				screen.getByRole('heading', { name: 'Suspend selected' }),
			).toBeTruthy();
			fireEvent.click(
				screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
			);

			await waitFor(() =>
				expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
			);
			expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
			expect(mocks.toastError).not.toHaveBeenCalled();
		});

		const allSuspendedTenants = mixedStatusTenants.map((tenant) => ({
			...tenant,
			status: 'Suspended',
		}));

		test('a mixed active/suspended bulk delete click shows one warning toast and fires no mutation', async () => {
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
			await chooseBulkAction('Delete selected', 'Bulk actions');

			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'Only suspended tenants can be deleted. Clear active tenants from the selection first.',
			);
			expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
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
			await chooseBulkAction('Delete selected', 'Bulk actions');

			expect(
				screen.getByRole('heading', { name: 'Delete selected' }),
			).toBeTruthy();
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
