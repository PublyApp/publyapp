/**
 * @vitest-environment jsdom
 */
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

/** The single argument TanStack Router hands `shouldBlockFn`, narrowed to the
 * fields this page's guard reads. Every call below passes a real transition
 * shape rather than calling the guard with no arguments. */
type BlockerTransition = {
	current: { pathname: string };
	next: { pathname: string; search: Record<string, unknown> };
};

const LIST_PATHNAME =
	'/staff/tenants/11111111-1111-1111-1111-111111111111/roles';

/** A transition that leaves this list route (a browser Back, a sibling
 * route) — what the unsaved-draft guard exists to intercept. */
const leavingListTransition = () => ({
	current: { pathname: LIST_PATHNAME },
	next: { pathname: '/staff/tenants', search: {} },
});

const mocks = vi.hoisted(() => ({
	invalidateQueries: vi.fn(),
	search: {},
	navigate: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantRoleRows: vi.fn(),
	useStaffTenantRolesQuery: vi.fn(),
	deleteRoleMutation: vi.fn(),
	useDeleteStaffTenantRoleMutation: vi.fn(),
	bulkDeleteRoleMutation: vi.fn(),
	useBulkDeleteStaffTenantRolesMutation: vi.fn(),
	toStaffTenantRoleBulkActionSummary: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
	shouldLogoutForFailure: vi.fn(() => false),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	historyBack: vi.fn(),
	blockerResolver: {
		status: 'idle' as 'idle' | 'blocked',
		proceed: undefined as (() => void) | undefined,
		reset: undefined as (() => void) | undefined,
	},
	capturedShouldBlockFn: undefined as
		| ((transition: BlockerTransition) => boolean)
		| undefined,
	capturedOnSaved: undefined as ((roleId: string) => void) | undefined,
	setPageFormField: undefined as
		| ((field: 'name', value: string) => void)
		| undefined,
	resetPageForm: undefined as (() => void) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
	useQueryErrorResetBoundary: () => ({ reset: vi.fn() }),
	useQueryClient: () => ({
		invalidateQueries: mocks.invalidateQueries,
	}),
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
	useBlocker: (opts: {
		shouldBlockFn: (transition: BlockerTransition) => boolean;
	}) => {
		mocks.capturedShouldBlockFn = opts.shouldBlockFn;
		return mocks.blockerResolver;
	},
	useRouter: () => ({
		history: { back: mocks.historyBack },
		invalidate: vi.fn(),
	}),
}));

const TRANSLATIONS: TestLabelMap = {
	basics: 'Basics',
	'common:default-role-name': 'Default role',
	'common:default-role-description': 'Default role with no permissions',
	roles: 'Roles',
	invitations: 'Invitations',
	users: 'Users',
	'tenant-roles-tab-description':
		"Permission sets available to this tenant's members.",
	'new-role': 'New role',
	'search-roles': 'Search roles…',
	system: 'System',
	custom: 'Custom',
	'all-types': 'All types',
	'view-details': 'View details',
	edit: 'Edit',
	delete: 'Delete',
	'default-role-delete-disabled': "Default roles can't be deleted.",
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
	role: 'Role',
	description: 'Description',
	members: 'Members',
	permissions: 'Permissions',
	actions: 'Actions',
	'bulk-delete': 'Delete selected',
	'confirm-bulk-delete-tenant-roles':
		'Are you sure you want to delete {{count}} role(s)?',
	'tenant-role-bulk-delete-success': 'Successfully deleted {{count}} role(s).',
	'tenant-role-bulk-delete-partial-success':
		'Deleted {{succeeded}} role(s), {{failed}} failed.',
	'tenant-role-bulk-delete-failure': 'Failed to delete selected roles.',
	'bulk-action-rows-may-leave-filter':
		'Some rows may no longer appear in the filtered view.',
	'bulk-delete-disabled-only-default-roles':
		'Default roles cannot be bulk-deleted.',
	'bulk-action-max-count-exceeded':
		'Reduce your selection to at most {{max}} items ({{count}} selected).',
	'clear-selection': 'Clear selection',
	'select-all-visible': 'Select all {{count}}',
	'selected-count': '{{count}} selected',
	close: 'Close',
	'unsaved-changes-dialog-title': 'Leave without saving?',
	'unsaved-changes-dialog-description':
		'You have unsaved changes that will be lost if you leave this page.',
	'leave-page': 'Leave page',
	'actions-for': 'Actions for {{name}}',
	'tenant-roles-table-aria-label': 'Tenant roles',
	'tenant-roles-empty-description': 'No tenant roles found.',
	'tenant-roles-no-match-description': 'No tenant roles match your search.',
	'confirm-delete-tenant-role-description':
		'This will permanently delete this tenant role. Users assigned to this role may be affected and the action cannot be undone.',
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

vi.mock('~/lib/query/staff-tenant-roles', () => ({
	toStaffTenantRoleRows: mocks.toStaffTenantRoleRows,
	useStaffTenantRolesQuery: mocks.useStaffTenantRolesQuery,
	useDeleteStaffTenantRoleMutation: mocks.useDeleteStaffTenantRoleMutation,
	useBulkDeleteStaffTenantRolesMutation:
		mocks.useBulkDeleteStaffTenantRolesMutation,
	toStaffTenantRoleBulkActionSummary: mocks.toStaffTenantRoleBulkActionSummary,
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
		warning: mocks.toastWarning,
	},
}));

vi.mock('./roles/_role-form-drawer', () => ({
	RoleFormDrawer: ({
		isOpen,
		methods,
		onSaved,
	}: {
		isOpen: boolean;
		methods?: UseFormReturn<StaffTenantRoleFormValues>;
		onSaved?: (roleId: string) => void;
	}) => {
		// The page owns the RHF store now; expose it so tests can drive the
		// real dirty state instead of simulating a child-to-parent relay.
		if (methods) {
			mocks.setPageFormField = (field, value) =>
				methods.setValue(field, value, { shouldDirty: true });
			mocks.resetPageForm = () => methods.reset();
		}
		mocks.capturedOnSaved = onSaved;
		if (isOpen) {
			return <div data-testid="role-create-drawer-open" />;
		}
		return null;
	},
}));

import type { UseFormReturn } from 'react-hook-form';

import type { StaffTenantRoleFormValues } from './roles';
import {
	deriveTenantRoleCardStyle,
	Route,
	tenantRoleTypeChipClassName,
} from './roles';

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

// The create form is owned by the page (react-hook-form), so tests drive
// dirtiness through the real form store rather than a relayed callback.
const makeCreateFormDirty = (): void => {
	act(() => mocks.setPageFormField?.('name', 'draft name'));
};

const makeCreateFormClean = (): void => {
	act(() => mocks.resetPageForm?.());
};

describe('staff tenant roles route', () => {
	test('declares the role feature namespace', () => {
		expect(Route.options.staticData?.i18nNamespaces).toEqual([
			'staff-tenant-roles',
		]);
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.blockerResolver.status = 'idle';
		mocks.blockerResolver.proceed = undefined;
		mocks.blockerResolver.reset = undefined;
		mocks.capturedShouldBlockFn = undefined;
		mocks.capturedOnSaved = undefined;
		mocks.shouldLogoutForFailure.mockReturnValue(false);
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useDeleteStaffTenantRoleMutation.mockReturnValue({
			mutateAsync: mocks.deleteRoleMutation,
			isPending: false,
		});
		mocks.useBulkDeleteStaffTenantRolesMutation.mockReturnValue({
			mutateAsync: mocks.bulkDeleteRoleMutation,
			isPending: false,
		});
		mocks.toStaffTenantRoleBulkActionSummary.mockImplementation(
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
			rolesCount: 2,
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
		mocks.toStaffTenantRoleRows.mockReturnValue([
			{
				id: 'role-1',
				name: 'Approvers',
				description: 'Can review approvals',
				isDefault: true,
				userAccountCount: 7,
				permissionsCount: 12,
			},
			{
				id: 'role-2',
				name: 'Support',
				description: 'Respond to member tickets',
				isDefault: false,
				userAccountCount: 5,
				permissionsCount: 4,
			},
		]);
		mocks.useStaffTenantRolesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'role-1',
							name: 'Approvers',
							description: 'Can review approvals',
							isDefault: true,
							userAccountCount: 7,
						},
						{
							id: 'role-2',
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

	test('renders the shared tenant shell with roles active, a card grid, and the default list query state', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-roles-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByText('Roles', { selector: 'span[aria-current="page"]' }),
		).toBeTruthy();
		expect(screen.getByTestId('staff-tenant-roles-grid-rows')).toBeTruthy();
		// A renamed default role keeps its own name (display-role.ts): only
		// the untouched seeded copy is translated at render time.
		expect(screen.getAllByText('Approvers').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Can review approvals').length).toBeGreaterThan(
			0,
		);
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
		expect(screen.getByRole('button', { name: /New role/ })).toBeTruthy();
		expect(mocks.useStaffTenantRolesQuery).toHaveBeenCalledWith(
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

	test('renders a persisted icon and tone on the role card', () => {
		mocks.toStaffTenantRoleRows.mockReturnValue([
			{
				id: 'role-1',
				name: 'Approvers',
				description: 'Can review approvals',
				icon: 'briefcase',
				tone: '6',
				isDefault: false,
				userAccountCount: 7,
				permissionsCount: 12,
			},
		]);

		renderPage();

		const card = screen.getByTestId('staff-tenant-role-card-role-1');
		const tile = card.querySelector('.publy-role-icon-tile');
		expect(tile?.getAttribute('data-tone')).toBe('6');
		expect(tile?.querySelector('.tabler-icon-briefcase')).toBeTruthy();
	});

	test('new role button navigates to open the create drawer via search state', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: /New role/ }));

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

		expect(screen.getByTestId('role-create-drawer-open')).toBeTruthy();
	});

	test('a debounced search commit does not close a drawer opened within the debounce window (F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			const renderResult = renderPage();

			fireEvent.change(screen.getByTestId('staff-tenant-roles-grid-search'), {
				target: { value: 'an' },
			});

			// Simulate opening the create drawer within the 300ms debounce
			// window: the route re-renders with the new URL search state, same
			// as a real navigation would, before the debounced commit fires.
			mocks.search = { new: 1 };
			renderResult.rerender(<RouteComponent />);

			// Deterministic (W6-FLAKE #827): step PAST the debounce instead of
			// a real-time sleep.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(lastCall?.search).toMatchObject({ new: 1, q: 'an' });
		} finally {
			vi.useRealTimers();
		}
	});

	test('a debounced search commit does not revert the view toggled within the debounce window (r3-F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			mocks.search = { view: 'table' };
			const renderResult = renderPage();

			fireEvent.change(screen.getByTestId('staff-tenant-roles-grid-search'), {
				target: { value: 'an' },
			});

			// Simulate toggling the view back to "cards" within the 300ms
			// debounce window: canonical parsing writes `view: undefined` so the
			// route re-render preserves the canonical key shape.
			mocks.search = {};
			renderResult.rerender(<RouteComponent />);

			// Deterministic (W6-FLAKE #827): see the F1 test above.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(
				Object.prototype.hasOwnProperty.call(lastCall?.search, 'view'),
			).toBe(true);
			expect(lastCall?.search?.view).toBeUndefined();
			expect(lastCall?.search).toMatchObject({ q: 'an' });
		} finally {
			vi.useRealTimers();
		}
	});

	// tenants-r6-F2: entering selection mode must freeze the query that
	// defines the destructive bulk-action target set — a still-pending
	// search debounce or a still-clickable type filter can silently change
	// which rows a bulk action would hit right after selection.
	test('selecting a row while a search commit is pending cancels the pending debounce (tenants-r6-F2, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			mocks.search = { view: 'table' };
			renderPage();

			fireEvent.change(screen.getByTestId('staff-tenant-roles-grid-search'), {
				target: { value: 'an' },
			});
			fireEvent.click(
				screen.getByRole('checkbox', { name: 'Select all rows' }),
			);

			// Deterministic (W6-FLAKE #827): run out the debounce clock without
			// a real-time wait.
			await vi.advanceTimersByTimeAsync(301);

			expect(mocks.navigate).not.toHaveBeenCalledWith(
				expect.objectContaining({
					search: expect.objectContaining({ q: 'an' }),
				}),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test('disables the type filter trigger while a row is selected (tenants-r6-F2)', () => {
		mocks.search = { view: 'table' };
		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));

		expect(
			(
				screen.getByTestId(
					'staff-tenant-roles-grid-type-filter-trigger',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	test('shows the honest roles count next to the tab title', () => {
		renderPage();

		const title = screen.getByRole('heading', { name: /Roles/ });
		expect(title.textContent).toContain('2');
	});

	test('shows the permissions count alongside the member count on each card', () => {
		renderPage();

		expect(screen.getByText(/12 permissions/)).toBeTruthy();
		expect(screen.getByText(/4 permissions/)).toBeTruthy();
	});

	test('renders the Delete action disabled (not hidden) for the default role but enabled for a custom one', async () => {
		renderPage();

		const triggers = screen.getAllByRole('button', { name: /^Actions for/ });
		fireEvent.click(triggers[0]);
		expect(
			await screen.findByRole('menuitem', { name: 'View details' }),
		).toBeTruthy();

		const defaultDeleteItem = screen.getByTestId(
			'staff-tenant-role-delete-role-1',
		);
		expect(defaultDeleteItem).toBeTruthy();
		expect(defaultDeleteItem.getAttribute('aria-disabled')).toBe('true');
		expect(defaultDeleteItem.getAttribute('title')).toBe(
			"Default roles can't be deleted.",
		);

		fireEvent.click(triggers[0]);
		fireEvent.click(triggers[1]);
		const customDeleteItem = await screen.findByTestId(
			'staff-tenant-role-delete-role-2',
		);
		expect(customDeleteItem.getAttribute('aria-disabled')).toBeNull();
	});

	test('deletes a custom role after explicit confirmation and invalidates the roles query', async () => {
		mocks.deleteRoleMutation.mockResolvedValue({});

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
			expect(mocks.deleteRoleMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleId: 'role-2',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
	});

	test('leaves a failed row delete to the central feedback owner', async () => {
		mocks.deleteRoleMutation.mockRejectedValue({
			kind: 'problem',
			status: 409,
			responseStatusCode: 409,
			title: 'Conflict',
			detail: 'This role is still assigned to a user.',
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
			expect(mocks.deleteRoleMutation).toHaveBeenCalledTimes(1),
		);
		expect(
			screen.queryByText('This role is still assigned to a user.'),
		).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	test('the type filter maps System/Custom to the is_default URL param and resets the cursor', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-roles-grid-type-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenant-roles-grid-type-filter-system'),
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

	test('renders default filter controls when handed an already-canonicalized search (URL-level proof: deep-link-canonicalization.test.tsx)', () => {
		const validateSearch = (
			Route.options as {
				validateSearch: (
					search: Record<string, unknown>,
				) => Record<string, unknown>;
			}
		).validateSearch;
		const canonicalSearch = validateSearch({
			new: 'yes',
			is_default: 'maybe',
			view: 'invalid',
		});

		expect(Object.prototype.hasOwnProperty.call(canonicalSearch, 'new')).toBe(
			true,
		);
		expect(
			Object.prototype.hasOwnProperty.call(canonicalSearch, 'is_default'),
		).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(canonicalSearch, 'view')).toBe(
			true,
		);
		expect(canonicalSearch).toMatchObject({
			new: undefined,
			is_default: undefined,
			view: undefined,
		});

		mocks.search = canonicalSearch;
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-roles-grid-type-filter-trigger')
				.textContent,
		).toContain('All types');
		expect(
			screen
				.getByTestId('staff-tenant-roles-grid-view-toggle-cards')
				.getAttribute('aria-pressed'),
		).toBe('true');
		expect(screen.queryByTestId('role-create-drawer-open')).toBeNull();
		expect(screen.getByTestId('staff-tenant-roles-grid-rows')).toBeTruthy();
	});

	test('renders roles narrowed to System when is_default=true is set on the URL', () => {
		mocks.search = { is_default: true };

		renderPage();

		expect(mocks.useStaffTenantRolesQuery).toHaveBeenCalledWith(
			expect.objectContaining({ isDefault: 'true' }),
			expect.anything(),
		);
	});

	test('the view toggle switches to the table view and stores it on the URL', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-role-card-role-1')).toBeTruthy();

		fireEvent.click(
			screen.getByTestId('staff-tenant-roles-grid-view-toggle-table'),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ view: 'table' }),
				replace: true,
			}),
		);
	});

	test('renders the roles table with row selection when view=table is set on the URL', () => {
		mocks.search = { view: 'table' };

		renderPage();

		expect(screen.getByTestId('staff-tenant-roles-grid-rows')).toBeTruthy();
		expect(screen.getAllByText('Approvers').length).toBeGreaterThan(0);
		expect(
			screen.getByRole('checkbox', { name: 'Select all rows' }),
		).toBeTruthy();
	});

	test('the card grid view lets the page scroll (bodyScroll=page); the table view owns its own scroll (bodyScroll=contained)', () => {
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-roles-page').dataset.bodyScroll,
		).toBe('page');
		cleanup();

		mocks.search = { view: 'table' };
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-roles-page').dataset.bodyScroll,
		).toBe('contained');
	});

	test('bulk-deletes selected roles from the card grid via the floating selection bar', async () => {
		mocks.bulkDeleteRoleMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		mocks.toStaffTenantRoleBulkActionSummary.mockReturnValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-2'));

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
			expect(mocks.bulkDeleteRoleMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleIds: ['role-2'],
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Successfully deleted 1 role(s).',
			'Some rows may no longer appear in the filtered view.',
		);
		expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Successfully deleted 1 role(s).')).toBeNull();
	});

	test('reports a partial-success message when some bulk-deleted roles fail', async () => {
		mocks.bulkDeleteRoleMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [],
		});
		mocks.toStaffTenantRoleBulkActionSummary.mockReturnValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-2'));

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
			expect(mocks.bulkDeleteRoleMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleIds: ['role-2'],
			}),
		);
		expect(mocks.toastError).toHaveBeenCalledWith(
			'Deleted 1 role(s), 1 failed.',
			'Some rows may no longer appear in the filtered view.',
		);
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Deleted 1 role(s), 1 failed.')).toBeNull();
	});

	test('reports a failure message when every bulk-deleted role fails', async () => {
		mocks.bulkDeleteRoleMutation.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [],
		});
		mocks.toStaffTenantRoleBulkActionSummary.mockReturnValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-2'));

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
			expect(mocks.bulkDeleteRoleMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleIds: ['role-2'],
			}),
		);
		// Total failure (succeededCount === 0): no row left the view, so
		// the filter-leave warning is suppressed -- only the plain failure
		// message rides, with an explicit undefined second arg.
		expect(mocks.toastError).toHaveBeenCalledWith(
			'Deleted 0 role(s), 1 failed.',
			undefined,
		);
		expect(mocks.toastError.mock.calls[0]).toHaveLength(2);
		expect(mocks.toastError).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Deleted 0 role(s), 1 failed.')).toBeNull();
	});

	test('reports a rejected bulk delete through one local failure toast owner', async () => {
		const error = {
			status: 409,
			responseStatusCode: 409,
			title: 'Conflict',
			detail: 'Selected roles cannot be deleted.',
		};
		mocks.bulkDeleteRoleMutation.mockRejectedValue(error);

		renderPage();
		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-2'));
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
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				error,
				'Failed to delete selected roles.',
			),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledTimes(1);
		expect(screen.queryByText('Selected roles cannot be deleted.')).toBeNull();
	});

	test('warns and fires no mutation when only the default role is selected for bulk delete', async () => {
		renderPage();

		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-1'));

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);

		expect(mocks.toastWarning).toHaveBeenCalledWith(
			'Default roles cannot be bulk-deleted.',
		);
		expect(mocks.toastWarning).toHaveBeenCalledTimes(1);
		expect(
			screen.queryByRole('heading', { name: 'Delete selected' }),
		).toBeNull();
		expect(mocks.bulkDeleteRoleMutation).not.toHaveBeenCalled();
	});

	test('excludes the default role from a mixed bulk-delete selection', async () => {
		mocks.bulkDeleteRoleMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});
		mocks.toStaffTenantRoleBulkActionSummary.mockReturnValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-1'));
		fireEvent.click(screen.getByTestId('staff-tenant-role-card-select-role-2'));

		fireEvent.click(
			await screen.findByRole('button', { name: 'Delete selected' }),
		);
		await waitFor(() =>
			expect(
				screen.getByText('Are you sure you want to delete 1 role(s)?'),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

		await waitFor(() =>
			expect(mocks.bulkDeleteRoleMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				roleIds: ['role-2'],
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
			id: `role-${index}`,
			name: `Role ${index}`,
			description: null,
			isDefault: false,
			userAccountCount: 1,
			permissionsCount: 1,
		}));
		mocks.toStaffTenantRoleRows.mockReturnValue(manyRows);
		mocks.useStaffTenantRolesQuery.mockReturnValue(
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
		mocks.toStaffTenantRoleRows.mockReturnValue([]);
		mocks.useStaffTenantRolesQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(screen.getByTestId('staff-tenant-roles-grid-no-match')).toBeTruthy();
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
		mocks.toStaffTenantRoleRows.mockReturnValue([]);
		mocks.useStaffTenantRolesQuery.mockReturnValue(
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

		expect(screen.getByTestId('staff-tenant-roles-grid-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout when the roles query failure should invalidate the session', () => {
		mocks.toStaffTenantRoleRows.mockReturnValue([]);
		mocks.useStaffTenantRolesQuery.mockReturnValue(
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

	// tenants-r1-F2: the create drawer's open flag is URL-driven (`?new=1`); a
	// browser Back or sibling-route navigation changes/unmounts it without
	// ever calling the drawer's own close guard, discarding a dirty create
	// draft with no confirmation.
	test('the URL nav-guard only blocks navigation while the create drawer is open AND dirty', () => {
		mocks.search = { new: 1 };
		renderPage();

		expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(false);

		makeCreateFormDirty();
		expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(true);

		makeCreateFormClean();
		expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(false);
	});

	test('the URL nav-guard never blocks when the create drawer is closed, even if reported dirty', () => {
		mocks.search = {};
		renderPage();

		makeCreateFormDirty();
		expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(false);
	});

	// W8-DRAWER: `onDirtyChange(false)` is an async state update — a
	// successful create submit calls it and then `onSaved(roleId)`
	// synchronously in the same tick, so the guard's closure still sees the
	// old (dirty) render. Covers both onSaved branches: navigating to the new
	// role's detail page, and (empty roleId) closing the drawer in
	// place via setCreateDrawerOpen(false).
	test('a successful create submit with a new roleId does not leave the nav guard blocking its own navigation (W8-DRAWER)', () => {
		mocks.search = { new: 1 };
		renderPage();

		makeCreateFormDirty();
		expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(true);

		// The bypass ref is set synchronously by onSaved before the navigation
		// it performs, so asserting inside this act still exercises the guard
		// against this render's (still dirty) form state.
		act(() => {
			mocks.capturedOnSaved?.('new-role-id');

			expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(
				false,
			);
		});

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				to: '/staff/tenants/$tenantId/roles/$roleId',
				params: {
					tenantId: '11111111-1111-1111-1111-111111111111',
					roleId: 'new-role-id',
				},
			}),
		);
	});

	test('a successful create submit with an empty roleId does not leave the nav guard blocking its own drawer close (W8-DRAWER)', () => {
		mocks.search = { new: 1 };
		renderPage();

		makeCreateFormDirty();
		expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(true);

		act(() => {
			mocks.capturedOnSaved?.('');

			expect(mocks.capturedShouldBlockFn?.(leavingListTransition())).toBe(
				false,
			);
		});

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ new: undefined }),
				replace: true,
			}),
		);
	});

	test('shows the unsaved-changes confirm dialog when the router blocks navigation away from a dirty create drawer', () => {
		const proceed = vi.fn();
		const reset = vi.fn();
		mocks.search = { new: 1 };
		mocks.blockerResolver.status = 'blocked';
		mocks.blockerResolver.proceed = proceed;
		mocks.blockerResolver.reset = reset;

		renderPage();

		expect(screen.getByText('Leave without saving?')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Leave page' }));
		expect(proceed).toHaveBeenCalled();
		expect(reset).not.toHaveBeenCalled();
	});
});

describe('tenantRoleTypeChipClassName', () => {
	test('maps isDefault to the amber chip and otherwise to the neutral chip', () => {
		expect(tenantRoleTypeChipClassName(true)).toContain('--amber');
		expect(tenantRoleTypeChipClassName(false)).toContain('--outline');
	});
});

describe('deriveTenantRoleCardStyle', () => {
	test('falls back to the same deterministic style for absent or null persisted values', () => {
		const absent = deriveTenantRoleCardStyle('Approvers');
		const nullPersisted = deriveTenantRoleCardStyle('Approvers', null, null);
		expect(absent.icon).toBe(nullPersisted.icon);
		expect(absent.tone).toBe(nullPersisted.tone);
		expect(absent.Icon).toBe(nullPersisted.Icon);
	});

	test('prefers persisted icon and tone over the name-derived style', () => {
		const derived = deriveTenantRoleCardStyle('Approvers');
		const persisted = deriveTenantRoleCardStyle('Approvers', 'briefcase', '6');

		expect(persisted.tone).toBe('6');
		expect(persisted.icon).toBe('briefcase');
		expect(persisted.Icon).not.toBe(derived.Icon);
	});
});
