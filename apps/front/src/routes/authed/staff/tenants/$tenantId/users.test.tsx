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
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';
import { chooseBulkAction } from '~/test-helpers/choose-bulk-action';

const mocks = vi.hoisted(() => ({
	search: {},
	navigate: vi.fn(),
	invalidateQueries: vi.fn(),
	toStaffTenantDetails: vi.fn(),
	useStaffTenantDetailsQuery: vi.fn(),
	toStaffTenantUserRows: vi.fn(),
	useStaffTenantUsersQuery: vi.fn(),
	suspendMutation: vi.fn(),
	reactivateMutation: vi.fn(),
	removeMutation: vi.fn(),
	bulkRemoveMutation: vi.fn(),
	exportMutation: vi.fn(),
	useSuspendStaffTenantUserMutation: vi.fn(),
	useReactivateStaffTenantUserMutation: vi.fn(),
	useRemoveStaffTenantUserMutation: vi.fn(),
	useBulkRemoveStaffTenantUsersMutation: vi.fn(),
	useExportStaffTenantUsersMutation: vi.fn(),
	downloadFile: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	invalidateAllStaffTenantScopes: vi.fn().mockResolvedValue(undefined),
	inviteHostIsOpen: false,
	inviteHostOnOpenChange: (_isOpen: boolean) => {},
	inviteHostOnInvited: () => {},
	inviteHostOnDirtyChange: undefined as
		| undefined
		| ((isDirty: boolean) => void),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
	},
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

const TRANSLATIONS: TestLabelMap = {
	basics: 'Basics',
	profiles: 'Profiles',
	invitations: 'Invitations',
	users: 'Users',
	members: 'Members',
	level: 'Level',
	status: 'Status',
	actions: 'Actions',
	'view-details': 'View details',
	edit: 'Edit',
	reactivate: 'Reactivate',
	suspend: 'Suspend',
	'remove-user-from-tenant': 'Remove from tenant',
	'all-statuses': 'All statuses',
	'all-levels': 'All levels',
	'status-active': 'Active',
	'status-suspended': 'Suspended',
	'status-globally-suspended': 'Globally suspended',
	admin: 'Admin',
	user: 'User',
	'search-tenant-members': 'Search members by name or email…',
	'invite-people': 'Invite people',
	'tenant-users-tab-description': 'Everyone with access to this workspace.',
	clear: 'Clear',
	'suspend-tenant-user-description':
		'This user will lose access to this tenant. Are you sure you want to proceed?',
	'reactivate-tenant-user-description':
		'Access to this tenant will be restored. Are you sure you want to proceed?',
	'confirm-remove-user-from-tenant-details':
		'Are you sure you want to remove this user from this tenant? They will lose access to this tenant.',
	'tenant-users-empty-title': 'No members yet',
	'tenant-users-empty-description':
		'Invite people to give them access to this workspace.',
	'tenant-users-no-match-title': 'No members match your search',
	'tenant-users-no-match-description':
		'Try a different name, email, or filter.',
	'selected-count': '{{count}} selected',
	'clear-selection': 'Clear selection',
	'more-actions': 'More actions',
	'bulk-actions': 'Bulk actions',
	'bulk-action-max-count-exceeded':
		'Reduce your selection to at most {{max}} items ({{count}} selected).',
	'export-selected-users': 'Export selected users',
	'export-failed': 'Export failed',
	'export-completed-success': 'Export completed.',
	'remove-selected-from-tenant': 'Remove selected from tenant',
	'confirm-bulk-remove-tenant-users':
		'Are you sure you want to remove {{count}} selected user(s) from this tenant?',
	remove: 'Remove',
	'tenant-user-bulk-remove-success':
		'Successfully removed {{count}} user(s) from this tenant.',
	'tenant-user-bulk-remove-partial-success':
		'Removed {{succeeded}} user(s), {{failed}} failed.',
	'tenant-user-bulk-remove-failure':
		'Failed to remove selected users from this tenant.',
	'bulk-action-rows-may-leave-filter':
		'Some rows may no longer appear in the filtered view.',
	'actions-for': 'Actions for {{name}}',
	'tenant-users-table-aria-label': 'Tenant users',
	'error-500-code': '500 — Server Error',
	'tenant-details-error-title': 'Unable to load this tenant',
	'tenant-response-incomplete': 'The tenant response was incomplete.',
	close: 'Close',
	'unsaved-changes-dialog-title': 'Leave without saving?',
	'unsaved-changes-dialog-description':
		'You have unsaved changes that will be lost if you leave this page.',
	'leave-page': 'Leave page',
	'select-row-named': 'Select {{name}}',
	'select-all-rows': 'Select all rows',
	'page-n': 'Page {{page}}',
	'previous-page': 'Previous page',
	'next-page': 'Next page',
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

vi.mock('~/lib/query/staff-tenant-users', () => ({
	toStaffTenantUserRows: mocks.toStaffTenantUserRows,
	useStaffTenantUsersQuery: mocks.useStaffTenantUsersQuery,
	useSuspendStaffTenantUserMutation: mocks.useSuspendStaffTenantUserMutation,
	useReactivateStaffTenantUserMutation:
		mocks.useReactivateStaffTenantUserMutation,
	useRemoveStaffTenantUserMutation: mocks.useRemoveStaffTenantUserMutation,
	useBulkRemoveStaffTenantUsersMutation:
		mocks.useBulkRemoveStaffTenantUsersMutation,
	useExportStaffTenantUsersMutation: mocks.useExportStaffTenantUsersMutation,
	toStaffTenantUserBulkActionSummary: (result: {
		succeededCount?: number;
		failedCount?: number;
		failedItems?: unknown[];
	}) => ({
		succeededCount: result?.succeededCount ?? 0,
		failedCount: result?.failedCount ?? 0,
		failedItems: result?.failedItems ?? [],
	}),
	useInviteTenantUserMutation: vi.fn(() => ({
		mutateAsync: vi.fn(),
		isPending: false,
	})),
}));

vi.mock('~/lib/query/staff-tenants', () => ({
	invalidateAllStaffTenantScopes: mocks.invalidateAllStaffTenantScopes,
	toStaffTenantDetails: mocks.toStaffTenantDetails,
	useStaffTenantDetailsQuery: mocks.useStaffTenantDetailsQuery,
}));

vi.mock('~/lib/download-file', () => ({
	downloadFile: mocks.downloadFile,
	formatExportDateStamp: () => '2026-07-12',
}));

// #1442: `@org/shared-ts/lib/should-logout-for-failure` is deliberately NOT mocked in this
// suite — every rejection below runs through the REAL failure helper (and its
// real `toApiFailure` classification), so the 401/logout path is exercised
// against production code instead of a stubbed predicate.

vi.mock('./_invite-user-drawer-host', () => ({
	InviteTenantUserDrawerHost: ({
		isOpen,
		onOpenChange,
		onInvited,
	}: {
		isOpen: boolean;
		onOpenChange: (isOpen: boolean) => void;
		onInvited?: () => void;
	}) => {
		mocks.inviteHostIsOpen = isOpen;
		mocks.inviteHostOnOpenChange = onOpenChange;
		mocks.inviteHostOnInvited = onInvited ?? (() => undefined);
		mocks.inviteHostOnDirtyChange = undefined;

		if (isOpen) return <div data-testid="invite-drawer-open" />;
		return null;
	},
}));

import type { ColumnDef } from '@tanstack/react-table';
import type { StaffTenantUserRow } from '~/lib/query/staff-tenant-users';

import {
	formatTenantUserLevelLabel,
	formatTenantUserStatusLabel,
	tenantUserLevelChipClassName,
} from './_tenant-details-shell';
import { makeTenantUserColumns } from './_users-columns';
import {
	parseTenantUserLevelFilter,
	parseTenantUserStatusFilter,
	Route,
} from './users';

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
	const Component = Route.options.component as () => JSX.Element;

	return render(<Component />);
};

const identityT = (key: string) => TRANSLATIONS[key] ?? key;

describe('staff tenant users route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.search = {};
		mocks.inviteHostIsOpen = false;
		mocks.inviteHostOnOpenChange = vi.fn();
		mocks.inviteHostOnInvited = vi.fn();
		mocks.inviteHostOnDirtyChange = undefined;
		mocks.invalidateQueries.mockResolvedValue(undefined);
		mocks.useSuspendStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.suspendMutation,
			isPending: false,
		});
		mocks.useReactivateStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.reactivateMutation,
			isPending: false,
		});
		mocks.useRemoveStaffTenantUserMutation.mockReturnValue({
			mutateAsync: mocks.removeMutation,
			isPending: false,
		});
		mocks.useBulkRemoveStaffTenantUsersMutation.mockReturnValue({
			mutateAsync: mocks.bulkRemoveMutation,
			isPending: false,
		});
		mocks.useExportStaffTenantUsersMutation.mockReturnValue({
			mutateAsync: mocks.exportMutation,
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
		mocks.toStaffTenantUserRows.mockReturnValue([
			{
				id: 'user-1',
				displayName: 'Alex Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				firstName: 'Alex',
				lastName: 'Johnson',
				avatarUrl: null,
			},
		]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [
						{
							id: 'user-1',
							firstName: 'Alex',
							lastName: 'Johnson',
							email: 'alex@example.com',
							level: 'Admin',
							status: 'Active',
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

	test('renders the shared tenant shell with users active, the members title, and the default list query state', () => {
		renderPage();

		expect(screen.getByTestId('staff-tenant-users-page')).toBeTruthy();
		expect(screen.getByText('Acme Corporation')).toBeTruthy();
		expect(
			screen.getByRole('link', { name: /Alex Johnson/ }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/users/user-1');
		expect(
			screen.getByText('Users', { selector: 'span[aria-current="page"]' }),
		).toBeTruthy();
		const title = screen.getByRole('heading', { name: /Members/ });
		expect(title).toBeTruthy();
		// The Users tab MAY show the honest usersCount field from tenant details.
		expect(title.textContent).toContain('12');
		expect(screen.getByText('Alex Johnson')).toBeTruthy();
		expect(screen.getByText('alex@example.com')).toBeTruthy();
		expect(screen.getByText('Admin')).toBeTruthy();
		expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
		expect(
			screen.getByRole('link', { name: 'Profiles' }).getAttribute('href'),
		).toBe('/staff/tenants/11111111-1111-1111-1111-111111111111/profiles');
		expect(screen.getByRole('button', { name: 'Invite people' })).toBeTruthy();
		expect(mocks.useStaffTenantUsersQuery).toHaveBeenCalledWith(
			{
				tenantId: '11111111-1111-1111-1111-111111111111',
				q: undefined,
				status: undefined,
				sortId: 'created_at',
				sortOrder: 'desc',
				cursor: undefined,
				size: 100,
			},
			{ enabled: true },
		);
	});

	test('invite people button navigates to open the invite drawer via search state', () => {
		renderPage();

		fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ invite: 1 }),
				replace: true,
			}),
		);
	});

	test('renders the invite drawer open when the invite search param is set', () => {
		mocks.search = { invite: 1 };
		renderPage();

		expect(screen.getByTestId('invite-drawer-open')).toBeTruthy();
	});

	test('closes the invite drawer from Users while preserving non-invite search state', () => {
		mocks.search = { invite: 1, q: 'alex', status: 'active', level: 'admin' };
		renderPage();

		mocks.navigate.mockClear();
		mocks.inviteHostOnOpenChange(false);

		const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
			search?: Record<string, string | 1 | undefined>;
		};

		expect(lastCall?.search).toEqual(
			expect.objectContaining({
				invite: undefined,
				q: 'alex',
				status: 'active',
				level: 'admin',
			}),
		);
	});

	test('a debounced search commit does not close a drawer opened within the debounce window (F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			const Component = Route.options.component as () => JSX.Element;
			const renderResult = render(<Component />);

			fireEvent.change(screen.getByTestId('staff-tenant-users-table-search'), {
				target: { value: 'an' },
			});

			// Simulate opening the invite drawer within the 300ms debounce
			// window: the route re-renders with the new URL search state, same
			// as a real navigation would, before the debounced commit fires.
			mocks.search = { invite: 1 };
			renderResult.rerender(<Component />);

			// Deterministic (W6-FLAKE #827): step PAST the debounce instead of
			// a real-time sleep.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(lastCall?.search).toMatchObject({ invite: 1, q: 'an' });
		} finally {
			vi.useRealTimers();
		}
	});

	test('a debounced search commit does not reopen a drawer closed within the debounce window (r3-F1, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			mocks.search = { invite: 1 };
			const Component = Route.options.component as () => JSX.Element;
			const renderResult = render(<Component />);

			fireEvent.change(screen.getByTestId('staff-tenant-users-table-search'), {
				target: { value: 'an' },
			});

			// Simulate closing the invite drawer within the 300ms debounce
			// window. canonicalized parsing stores explicit `invite: undefined`
			// so the re-rendered route search keeps the canonical key shape.
			mocks.search = {};
			renderResult.rerender(<Component />);

			// Deterministic (W6-FLAKE #827): see the F1 test above.
			await vi.advanceTimersByTimeAsync(301);

			const lastCall = mocks.navigate.mock.calls.at(-1)?.[0] as {
				search?: Record<string, unknown>;
			};
			expect(
				Object.prototype.hasOwnProperty.call(lastCall?.search, 'invite'),
			).toBe(true);
			expect(lastCall?.search?.invite).toBeUndefined();
			expect(lastCall?.search).toMatchObject({ q: 'an' });
		} finally {
			vi.useRealTimers();
		}
	});

	// tenants-r6-F2: entering selection mode must freeze the query that
	// defines the destructive bulk-action target set — a still-pending
	// search debounce or a still-clickable level/status filter can silently
	// change which rows a bulk action would hit right after selection.
	test('selecting a row while a search commit is pending cancels the pending debounce (tenants-r6-F2, deterministic timers)', async () => {
		vi.useFakeTimers();
		try {
			renderPage();

			fireEvent.change(screen.getByTestId('staff-tenant-users-table-search'), {
				target: { value: 'an' },
			});
			fireEvent.click(screen.getByLabelText('Select Alex Johnson'));

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

	test('disables the level and status filter triggers while a row is selected (tenants-r6-F2)', () => {
		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));

		expect(
			(
				screen.getByTestId(
					'staff-tenant-users-level-filter-trigger',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			(
				screen.getByTestId(
					'staff-tenant-users-status-filter-trigger',
				) as HTMLButtonElement
			).disabled,
		).toBe(true);
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
			status: 'bogus',
			level: 'bogus',
			invite: 'bogus',
		});

		expect(
			Object.prototype.hasOwnProperty.call(canonicalSearch, 'status'),
		).toBe(true);
		expect(Object.prototype.hasOwnProperty.call(canonicalSearch, 'level')).toBe(
			true,
		);
		expect(
			Object.prototype.hasOwnProperty.call(canonicalSearch, 'invite'),
		).toBe(true);
		expect(canonicalSearch).toMatchObject({
			status: undefined,
			level: undefined,
			invite: undefined,
		});

		mocks.search = canonicalSearch;
		renderPage();

		expect(
			screen.getByTestId('staff-tenant-users-level-filter-trigger').textContent,
		).toContain('All levels');
		expect(
			screen.getByTestId('staff-tenant-users-status-filter-trigger')
				.textContent,
		).toContain('All statuses');
		expect(screen.queryByTestId('invite-drawer-open')).toBeNull();
		expect(mocks.useStaffTenantUsersQuery).toHaveBeenCalledWith(
			expect.objectContaining({
				tenantId: '11111111-1111-1111-1111-111111111111',
				status: undefined,
				level: undefined,
			}),
			{ enabled: true },
		);
	});

	test('renders a checkbox selection column but no Last active column', () => {
		renderPage();

		expect(screen.queryByLabelText('Select all rows')).toBeTruthy();
		expect(screen.queryByText('Last active')).toBeNull();
	});

	test('renders the no-match state when search is active and no rows match', () => {
		mocks.search = { q: 'alex' };
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
			buildQueryResult({
				data: {
					data: [],
					nextCursor: null,
				},
			}),
		);

		renderPage();

		expect(
			screen.getByTestId('staff-tenant-users-table-no-match'),
		).toBeTruthy();
		expect(screen.getByText('No members match your search')).toBeTruthy();
	});

	// The gate is structurally hard to reach through normal navigation (row
	// selection is pruned to the visible page every fetch, and page size tops
	// out at BULK_ACTION_MAX_COUNT — see review-r2-tests.md F3/F4), but the
	// branch is real production code and must render correctly whenever the
	// selection count does exceed the limit.
	test('disables the bulk actions trigger and shows the max-count message once selection exceeds BULK_ACTION_MAX_COUNT', async () => {
		const manyRows = Array.from({ length: 101 }, (_, index) => ({
			id: `user-${index}`,
			displayName: `User ${index}`,
			email: `user-${index}@example.com`,
			level: 'Member' as const,
			status: 'Active' as const,
			firstName: `User`,
			lastName: `${index}`,
			avatarUrl: null,
		}));
		mocks.toStaffTenantUserRows.mockReturnValue(manyRows);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
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

	// #1400 (WCAG 2.5.3 label-in-name): the bulk trigger's accessible name
	// must EQUAL its visible "Bulk actions" label — both from one i18n key.
	test('the bulk trigger accessible name equals its visible Bulk actions label', async () => {
		renderPage();

		fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));

		const trigger = await screen.findByRole('button', {
			name: 'Bulk actions',
		});
		expect(trigger.getAttribute('aria-label')).toBe('Bulk actions');
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});

	test('shows a reactivate action for a suspended user and a suspend action for an active one', async () => {
		const user = userEvent.setup();
		mocks.toStaffTenantUserRows.mockReturnValue([
			{
				id: 'user-1',
				displayName: 'Alex Johnson',
				email: 'alex@example.com',
				level: 'Admin',
				status: 'Active',
				firstName: 'Alex',
				lastName: 'Johnson',
				avatarUrl: null,
			},
			{
				id: 'user-2',
				displayName: 'Jamie Lee',
				email: 'jamie@example.com',
				level: 'User',
				status: 'Suspended',
				firstName: 'Jamie',
				lastName: 'Lee',
				avatarUrl: null,
			},
		]);

		renderPage();

		const triggers = screen.getAllByRole('button', { name: /^Actions for/ });
		await user.click(triggers[0]);
		expect(
			await screen.findByRole('menuitem', { name: 'Suspend' }),
		).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Reactivate' })).toBeNull();

		await user.click(triggers[0]);
		await user.click(triggers[1]);
		expect(
			await screen.findByRole('menuitem', { name: 'Reactivate' }),
		).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Suspend' })).toBeNull();
	});

	test('suspends a user after explicit confirmation and invalidates tenant user and tenant details queries', async () => {
		const user = userEvent.setup();
		mocks.suspendMutation.mockResolvedValue({});

		renderPage();

		await user.click(screen.getByRole('button', { name: /^Actions for/ }));
		await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Suspend' })).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.suspendMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'user-1',
			}),
		);
		await waitFor(() =>
			expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled(),
		);
	});

	test('leaves a failed row action to central feedback without a persistent bar', async () => {
		const user = userEvent.setup();
		mocks.suspendMutation.mockRejectedValue({
			kind: 'problem',
			status: 400,
			responseStatusCode: 400,
			title: 'Invalid tenant user',
			detail: 'Invalid tenant user',
		});

		renderPage();

		await user.click(screen.getByRole('button', { name: /^Actions for/ }));
		await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }));

		await waitFor(() =>
			expect(screen.getByRole('heading', { name: 'Suspend' })).toBeTruthy(),
		);
		fireEvent.click(
			screen.getAllByRole('button', { name: 'Suspend' }).slice(-1)[0],
		);

		await waitFor(() => expect(mocks.suspendMutation).toHaveBeenCalledOnce());
		expect(screen.queryByText('Invalid tenant user')).toBeNull();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	test('removes a user from the tenant after explicit confirmation', async () => {
		const user = userEvent.setup();
		mocks.removeMutation.mockResolvedValue({});

		renderPage();

		await user.click(screen.getByRole('button', { name: /^Actions for/ }));
		await user.click(
			await screen.findByRole('menuitem', { name: 'Remove from tenant' }),
		);

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Remove from tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(
			screen
				.getAllByRole('button', { name: 'Remove from tenant' })
				.slice(-1)[0],
		);

		await waitFor(() =>
			expect(mocks.removeMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userId: 'user-1',
			}),
		);
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

	test('keeps the user on the page for 403 query failures', () => {
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
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

		expect(screen.getByTestId('staff-tenant-users-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('renders the table error state without logging out for ordinary problem failures', () => {
		mocks.toStaffTenantUserRows.mockReturnValue([]);
		mocks.useStaffTenantUsersQuery.mockReturnValue(
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

		expect(screen.getByTestId('staff-tenant-users-table-error')).toBeTruthy();
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
	});

	test('redirects to logout only when the tenant users query returns a 401 auth failure', () => {
		mocks.useStaffTenantUsersQuery.mockReturnValue(
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

		renderPage();

		expect(screen.getByTestId('logout-redirect')).toBeTruthy();
	});

	test('selecting a row reveals the floating selection bar; the level/status filters stay visible', async () => {
		renderPage();

		expect(screen.queryByText('Bulk actions')).toBeNull();
		expect(screen.getByText('All levels')).toBeTruthy();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));

		expect(await screen.findByText('1 selected')).toBeTruthy();
		expect(screen.getByText('Bulk actions')).toBeTruthy();
		expect(screen.getByTestId('floating-selection-bar')).toBeTruthy();
		// Toolbar no longer swaps — filters remain visible during selection.
		expect(screen.getByText('All levels')).toBeTruthy();
	});

	test('the level filter offers an "All levels" entry that clears the filter and closes the menu', async () => {
		mocks.search = { level: 'admin' };
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-users-level-filter-trigger'),
		);

		expect(
			await screen.findByTestId('staff-tenant-users-level-filter-all'),
		).toBeTruthy();
		fireEvent.click(screen.getByTestId('staff-tenant-users-level-filter-all'));

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({ replace: true }),
		);
		const [[navigatedArgs]] = mocks.navigate.mock.calls;
		const navigatedSearch = (
			navigatedArgs as { search: Record<string, unknown> }
		).search;
		expect(navigatedSearch.level).toBeUndefined();

		// The menu closes on selecting the exclusive "All levels" entry.
		await waitFor(() =>
			expect(
				screen.queryByTestId('staff-tenant-users-level-filter-all'),
			).toBeNull(),
		);
	});

	test('the status filter offers an "All statuses" entry that clears the filter and closes the menu', async () => {
		mocks.search = { status: 'active' };
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-users-status-filter-trigger'),
		);

		expect(
			await screen.findByTestId('staff-tenant-users-status-filter-all'),
		).toBeTruthy();
		fireEvent.click(screen.getByTestId('staff-tenant-users-status-filter-all'));

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({ replace: true }),
		);
		const [[navigatedArgs]] = mocks.navigate.mock.calls;
		const navigatedSearch = (
			navigatedArgs as { search: Record<string, unknown> }
		).search;
		expect(navigatedSearch.status).toBeUndefined();

		// The menu closes on selecting the exclusive "All statuses" entry.
		await waitFor(() =>
			expect(
				screen.queryByTestId('staff-tenant-users-status-filter-all'),
			).toBeNull(),
		);
	});

	test('toggling an individual level keeps the menu open (multi-select)', async () => {
		renderPage();

		fireEvent.click(
			screen.getByTestId('staff-tenant-users-level-filter-trigger'),
		);
		fireEvent.click(
			await screen.findByTestId('staff-tenant-users-level-filter-admin'),
		);

		expect(mocks.navigate).toHaveBeenCalledWith(
			expect.objectContaining({
				search: expect.objectContaining({ level: 'admin' }),
				replace: true,
			}),
		);
		// closeOnClick={false} on individual levels — the menu stays open.
		expect(
			screen.getByTestId('staff-tenant-users-level-filter-admin'),
		).toBeTruthy();
	});

	test('exports the selected users as a csv download', async () => {
		const buffer = new ArrayBuffer(4);
		mocks.exportMutation.mockResolvedValue(buffer);

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Export selected users', 'Bulk actions');

		await waitFor(() =>
			expect(mocks.exportMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				ids: ['user-1'],
			}),
		);
		await waitFor(() =>
			expect(mocks.downloadFile).toHaveBeenCalledWith({
				data: buffer,
				fileName: 'ACME-members-2026-07-12.csv',
				mimeType: 'text/csv',
			}),
		);
		expect(mocks.toastSuccess).toHaveBeenCalledOnce();
		// Export never removes rows from the view, so the filter-leave
		// warning must NOT accompany the export success toast.
		expect(mocks.toastSuccess).toHaveBeenCalledWith('Export completed.');
		expect(mocks.toastSuccess.mock.calls[0]).toHaveLength(1);
		expect(mocks.downloadFile.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.toastSuccess.mock.invocationCallOrder[0],
		);
	});

	test('displays one local mutation failure when the export request rejects', async () => {
		const error = new Error('request failed');
		mocks.exportMutation.mockRejectedValue(error);

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Export selected users', 'Bulk actions');

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledOnce(),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
			error,
			'Export failed',
		);
		expect(mocks.downloadFile).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows one export failure when the response has no data', async () => {
		mocks.exportMutation.mockResolvedValue(undefined);

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Export selected users', 'Bulk actions');

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastError).toHaveBeenCalledWith('Export failed');
		expect(mocks.downloadFile).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('shows one export failure when download post-processing throws', async () => {
		mocks.exportMutation.mockResolvedValue(new ArrayBuffer(4));
		mocks.downloadFile.mockImplementation(() => {
			throw new Error('download failed');
		});

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Export selected users', 'Bulk actions');

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastError).toHaveBeenCalledWith('Export failed');
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('removes selected users after explicit confirmation and shows a success summary', async () => {
		mocks.bulkRemoveMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Remove selected from tenant', 'Bulk actions');

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Remove selected from tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		await waitFor(() =>
			expect(mocks.bulkRemoveMutation).toHaveBeenCalledWith({
				tenantId: '11111111-1111-1111-1111-111111111111',
				userIds: ['user-1'],
			}),
		);
		await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledOnce());
		expect(mocks.toastSuccess).toHaveBeenCalledWith(
			'Successfully removed 1 user(s) from this tenant.',
			'Some rows may no longer appear in the filtered view.',
		);
		expect(
			screen.queryByText('Successfully removed 1 user(s) from this tenant.'),
		).toBeNull();
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
	});

	test('reports a partial-success message when some bulk-removed users fail', async () => {
		mocks.bulkRemoveMutation.mockResolvedValue({
			succeededCount: 1,
			failedCount: 1,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Remove selected from tenant', 'Bulk actions');

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Remove selected from tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		expect(mocks.toastError).toHaveBeenCalledWith(
			'Removed 1 user(s), 1 failed.',
			'Some rows may no longer appear in the filtered view.',
		);
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
	});

	(test('reports a failure message when every bulk-removed user fails', async () => {
		mocks.bulkRemoveMutation.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [],
		});

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Remove selected from tenant', 'Bulk actions');

		await waitFor(() =>
			expect(
				screen.getByRole('heading', { name: 'Remove selected from tenant' }),
			).toBeTruthy(),
		);
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledOnce());
		// Total failure (succeededCount === 0): no row left the view, so
		// the filter-leave warning is suppressed -- only the plain failure
		// message rides, with an explicit undefined second arg.
		expect(mocks.toastError).toHaveBeenCalledWith(
			'Failed to remove selected users from this tenant.',
			undefined,
		);
		expect(mocks.toastError.mock.calls[0]).toHaveLength(2);
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
		expect(mocks.invalidateAllStaffTenantScopes).toHaveBeenCalled();
	}),
		// #1442: the bulk-remove catch block consults the REAL
		// shouldLogoutForFailure helper (not mocked in this suite), so a 401
		// rejection drives the route into its logout redirect.
		test('logs out through the real failure helper when bulk removal rejects with 401', async () => {
			mocks.bulkRemoveMutation.mockRejectedValue({
				status: 401,
				responseStatusCode: 401,
				title: 'Unauthorized',
				detail: 'Session expired',
			});

			renderPage();

			fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
			await chooseBulkAction('Remove selected from tenant', 'Bulk actions');
			await screen.findByRole('heading', {
				name: 'Remove selected from tenant',
			});
			fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

			await waitFor(() =>
				expect(mocks.bulkRemoveMutation).toHaveBeenCalledOnce(),
			);
			await waitFor(() =>
				expect(screen.getByTestId('logout-redirect')).toBeTruthy(),
			);
			expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
			expect(mocks.toastError).not.toHaveBeenCalled();
		}));

	// Same path, non-auth status: the real helper classifies 403 as a stay-
	// logged-in failure and the route keeps local feedback ownership.
	test('keeps local failure feedback when bulk removal rejects with 403', async () => {
		const error = {
			status: 403,
			responseStatusCode: 403,
			title: 'Forbidden',
			detail: 'No permission to remove users',
		};
		mocks.bulkRemoveMutation.mockRejectedValue(error);

		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Remove selected from tenant', 'Bulk actions');
		await screen.findByRole('heading', {
			name: 'Remove selected from tenant',
		});
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledOnce(),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
			error,
			'Failed to remove selected users from this tenant.',
		);
		expect(screen.queryByTestId('logout-redirect')).toBeNull();
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});
	test('displays one local failure when bulk removal rejects', async () => {
		const error = new Error('bulk request failed');
		mocks.bulkRemoveMutation.mockRejectedValue(error);
		renderPage();

		fireEvent.click(screen.getByLabelText('Select Alex Johnson'));
		await chooseBulkAction('Remove selected from tenant', 'Bulk actions');
		await screen.findByRole('heading', {
			name: 'Remove selected from tenant',
		});
		fireEvent.click(screen.getByRole('button', { name: 'Remove' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledOnce(),
		);
		expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
			error,
			'Failed to remove selected users from this tenant.',
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).not.toHaveBeenCalled();
	});
});

describe('makeTenantUserColumns column widths', () => {
	test('applies a fixed width to every column except the fluid name column', () => {
		const columns = makeTenantUserColumns(
			'11111111-1111-1111-1111-111111111111',
			identityT,
			() => undefined,
		);
		const widthById = Object.fromEntries(
			columns.map((column: ColumnDef<StaffTenantUserRow>) => [
				column.id,
				column.meta?.width,
			]),
		);

		expect(widthById).toEqual({
			name: undefined,
			level: '150px',
			status: '130px',
			actions: '40px',
		});
	});

	test('hides the level column below the 768px mobile breakpoint, keeping name/status/actions', () => {
		const columns = makeTenantUserColumns(
			'11111111-1111-1111-1111-111111111111',
			identityT,
			() => undefined,
		);
		const hideBelowById = Object.fromEntries(
			columns.map((column: ColumnDef<StaffTenantUserRow>) => [
				column.id,
				column.meta?.hideBelow,
			]),
		);

		expect(hideBelowById).toEqual({
			name: undefined,
			level: 768,
			status: undefined,
			actions: undefined,
		});
	});
});

describe('tenant user level chip mapping', () => {
	test('maps Admin to the amber chip and User to the neutral chip', () => {
		expect(tenantUserLevelChipClassName('Admin')).toContain('--amber');
		expect(tenantUserLevelChipClassName('User')).toContain('--outline');
		expect(tenantUserLevelChipClassName(null)).toContain('--outline');
	});

	test('formats level labels through i18n', () => {
		expect(formatTenantUserLevelLabel('Admin', identityT)).toBe('Admin');
		expect(formatTenantUserLevelLabel('User', identityT)).toBe('User');
	});
});

describe('tenant user status label mapping', () => {
	test('maps the three real tenant-user statuses honestly', () => {
		expect(formatTenantUserStatusLabel('Active', identityT)).toBe('Active');
		expect(formatTenantUserStatusLabel('Suspended', identityT)).toBe(
			'Suspended',
		);
		expect(formatTenantUserStatusLabel('GloballySuspended', identityT)).toBe(
			'Globally suspended',
		);
	});
});

describe('parseTenantUserStatusFilter', () => {
	test('parses known comma-separated statuses and drops unknown tokens', () => {
		expect(parseTenantUserStatusFilter('active,bogus,suspended')).toEqual([
			'active',
			'suspended',
		]);
		expect(parseTenantUserStatusFilter(undefined)).toEqual([]);
	});
});

describe('parseTenantUserLevelFilter', () => {
	test('parses known comma-separated levels, drops unknown tokens, and dedupes', () => {
		expect(parseTenantUserLevelFilter('admin,bogus,user,admin')).toEqual([
			'admin',
			'user',
		]);
		expect(parseTenantUserLevelFilter(undefined)).toEqual([]);
	});
});

describe('level filter wiring on the users list query', () => {
	test('passes the level search param through to the tenant users query', () => {
		mocks.search = { level: 'admin' };

		renderPage();

		expect(mocks.useStaffTenantUsersQuery).toHaveBeenCalledWith(
			expect.objectContaining({ level: 'admin' }),
			{ enabled: true },
		);
	});
});
