/** @vitest-environment jsdom */
/**
 * #820 component suite for `StaffUsersListBulkActions` — the route-local
 * selection-toolbar component that wires the existing bulk staff-user
 * endpoints into the shared staff-users list.
 *
 * Covered here (the routing suite proves the page-level wiring; this suite
 * pins the component contract):
 *  - menu items render unconditionally (bulk-action-ux-conventions.md);
 *  - over-cap trigger is disabled with the max-count i18n title;
 *  - ineligible click → warning toast, no confirm dialog;
 *  - confirmed happy path: ids scoped to eligible rows, invalidate + clear +
 *    success toast;
 *  - partial-success toast when the API reports per-item failures;
 *  - failure toast fallback via displayLocalMutationFailure;
 *  - 401-shaped failure routes to onSessionExpired.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';
const USER_C = '33333333-3333-3333-3333-333333333333';

const mocks = vi.hoisted(() => ({
	bulkSuspend: vi.fn(),
	bulkReactivate: vi.fn(),
	bulkDelete: vi.fn(),
	invalidateStaffUsers: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	shouldLogoutForFailure: vi.fn().mockReturnValue(false),
}));

vi.mock('~/lib/query/staff-users', () => ({
	STAFF_USERS_QUERY_KEY: ['staff-users'],
	invalidateStaffUsers: mocks.invalidateStaffUsers,
	useBulkSuspendStaffUsersMutation: () => ({
		mutateAsync: mocks.bulkSuspend,
		isPending: false,
	}),
	useBulkReactivateStaffUsersMutation: () => ({
		mutateAsync: mocks.bulkReactivate,
		isPending: false,
	}),
	useBulkDeleteStaffUsersMutation: () => ({
		mutateAsync: mocks.bulkDelete,
		isPending: false,
	}),
}));

vi.mock('~/lib/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		warning: mocks.toastWarning,
		error: mocks.toastError,
	},
}));

vi.mock('~/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'more-actions': 'More actions',
				'bulk-actions': 'Bulk actions',
				'bulk-reactivate': 'Reactivate selected',
				'bulk-suspend': 'Suspend selected',
				'bulk-delete': 'Delete selected',
				suspend: 'Suspend',
				reactivate: 'Reactivate',
				delete: 'Delete',
				'bulk-suspend-staff-users-confirm':
					'Are you sure you want to suspend {{count}} staff member(s)?',
				'bulk-reactivate-staff-users-confirm':
					'Are you sure you want to reactivate {{count}} staff member(s)?',
				'bulk-delete-staff-users-confirm':
					'Are you sure you want to delete {{count}} staff member(s)? This action cannot be easily undone.',
				'staff-user-bulk-suspend-success':
					'Successfully suspended {{count}} staff member(s).',
				'staff-user-bulk-reactivate-success':
					'Successfully reactivated {{count}} staff member(s).',
				'staff-user-bulk-delete-success':
					'Successfully deleted {{count}} staff member(s).',
				'staff-user-bulk-suspend-partial-success':
					'Suspended {{succeeded}} staff member(s), {{failed}} failed.',
				'staff-user-bulk-reactivate-partial-success':
					'Reactivated {{succeeded}} staff member(s), {{failed}} failed.',
				'staff-user-bulk-delete-partial-success':
					'Deleted {{succeeded}} staff member(s), {{failed}} failed.',
				'staff-user-bulk-suspend-failure':
					'Failed to suspend selected staff members.',
				'staff-user-bulk-reactivate-failure':
					'Failed to reactivate selected staff members.',
				'staff-user-bulk-delete-failure':
					'Failed to delete selected staff members.',
				'bulk-suspend-disabled-no-active-users':
					'No active staff members in the selection.',
				'bulk-reactivate-disabled-no-suspended-users':
					'No suspended staff members in the selection.',
				'bulk-delete-disabled-until-all-suspended':
					'Only suspended staff members can be deleted. Clear active users from the selection first.',
				'bulk-action-max-count-exceeded':
					'Reduce your selection to at most {{max}} items ({{count}} selected).',
			};

			return (labels[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
				String(options?.[name] ?? ''),
			);
		},
		i18n: { language: 'en' },
	}),
}));

import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { StaffUserRow } from '~/lib/query/staff-users';

import { StaffUsersListBulkActions } from './_list-bulk-actions';

const row = (
	id: string,
	status: string | null,
	displayName = `User ${id.slice(0, 4)}`,
): StaffUserRow => ({
	id,
	email: `${id.slice(0, 4)}@example.com`,
	firstName: displayName.split(' ')[0] ?? null,
	lastName: displayName.split(' ')[1] ?? null,
	avatarUrl: null,
	level: 'User',
	status,
	displayName,
});

const buildSelection = (selectedIds: string[]): UseRowSelectionResult => ({
	rowSelection: Object.fromEntries(selectedIds.map((id) => [id, true])),
	selectedKeys: new Set(selectedIds),
	selectedCount: selectedIds.length,
	isSelectionMode: true,
	onSelectionChange: () => undefined,
	clearSelection: () => undefined,
});

const renderBulkActions = ({
	rows = [
		row(USER_A, 'Active'),
		row(USER_B, 'Suspended'),
		row(USER_C, 'Active'),
	],
	selectedIds = [USER_A],
	onSessionExpired = () => undefined,
}: {
	rows?: StaffUserRow[];
	selectedIds?: string[];
	onSessionExpired?: () => void;
} = {}) => {
	const view = render(
		createElement(
			QueryClientProvider,
			{ client: new QueryClient() },
			createElement(StaffUsersListBulkActions, {
				rows,
				selection: buildSelection(selectedIds),
				onSessionExpired,
			}),
		),
	);

	return view;
};

const openMenu = async () => {
	fireEvent.click(
		screen.getByRole('button', { name: 'Bulk actions', expanded: false }),
	);
	await waitFor(() =>
		expect(
			screen
				.getByRole('button', { name: 'Bulk actions' })
				.getAttribute('aria-expanded'),
		).toBe('true'),
	);
};

describe('#820 StaffUsersListBulkActions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.bulkSuspend.mockResolvedValue({ succeededCount: 1, failedCount: 0 });
		mocks.bulkReactivate.mockResolvedValue({
			succeededCount: 1,
			failedCount: 0,
		});
		mocks.bulkDelete.mockResolvedValue({ succeededCount: 1, failedCount: 0 });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	test('menu items render unconditionally regardless of eligibility (bulk-action-ux-conventions)', async () => {
		// Only an Active user is selected: Reactivate/Delete are ineligible but
		// must still render.
		renderBulkActions();

		await openMenu();

		expect(screen.getByRole('menuitem', { name: 'Reactivate selected' }));
		expect(screen.getByRole('menuitem', { name: 'Suspend selected' }));
		expect(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(mocks.toastWarning).not.toHaveBeenCalled();
	});

	test('over-cap selection disables the trigger with the max-count title', () => {
		const manyRows = Array.from({ length: 101 }, (_, index) =>
			row(`id-${index}`, 'Active'),
		);
		renderBulkActions({
			rows: manyRows,
			selectedIds: manyRows.map((r) => r.id),
		});

		// #1400: the visible "Bulk actions" text IS the accessible name; the
		// max-count reason rides on the title attribute (description, not name).
		const trigger = screen.getByRole('button', {
			name: 'Bulk actions',
		}) as HTMLButtonElement;
		expect(trigger.disabled).toBe(true);
		expect(trigger.textContent).toContain('Bulk actions');
		expect(trigger.getAttribute('title')).toBe(
			'Reduce your selection to at most 100 items (101 selected).',
		);
	});

	test('ineligible suspend click warns and never opens the confirm dialog', async () => {
		renderBulkActions({ selectedIds: [USER_B] }); // Suspended only

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend selected' }));

		await waitFor(() =>
			expect(mocks.toastWarning).toHaveBeenCalledWith(
				'No active staff members in the selection.',
			),
		);
		expect(screen.queryByText(/Are you sure you want to suspend/)).toBeNull();
		expect(mocks.bulkSuspend).not.toHaveBeenCalled();
	});

	test('confirmed suspend scopes ids to eligible rows and clears selection after success', async () => {
		const clearSelection = vi.fn();
		const selection = {
			...buildSelection([USER_A, USER_B]),
			clearSelection,
		};
		render(
			createElement(
				QueryClientProvider,
				{ client: new QueryClient() },
				createElement(StaffUsersListBulkActions, {
					rows: [row(USER_A, 'Active'), row(USER_B, 'Suspended')],
					selection,
					onSessionExpired: () => undefined,
				}),
			),
		);

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend selected' }));

		expect(
			await screen.findByText(
				'Are you sure you want to suspend 1 staff member(s)?',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(mocks.bulkSuspend).toHaveBeenCalledWith({ userIds: [USER_A] }),
		);
		await waitFor(() => expect(clearSelection).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'Successfully suspended 1 staff member(s).',
			),
		);
		await waitFor(() =>
			expect(mocks.invalidateStaffUsers).toHaveBeenCalledOnce(),
		);
	});

	test('partial failure raises the partial-success toast instead of plain success', async () => {
		mocks.bulkReactivate.mockResolvedValue({
			succeededCount: 1,
			failedCount: 2,
		});

		renderBulkActions({
			rows: [row(USER_A, 'Suspended'), row(USER_B, 'Suspended')],
			selectedIds: [USER_A, USER_B],
		});

		await openMenu();
		fireEvent.click(
			screen.getByRole('menuitem', { name: 'Reactivate selected' }),
		);
		expect(
			await screen.findByText(
				'Are you sure you want to reactivate 2 staff member(s)?',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

		await waitFor(() =>
			expect(mocks.bulkReactivate).toHaveBeenCalledWith({
				userIds: [USER_A, USER_B],
			}),
		);
		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Reactivated 1 staff member(s), 2 failed.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('mutation rejection surfaces a transparent local failure message', async () => {
		mocks.bulkSuspend.mockRejectedValue(new Error('boom'));

		renderBulkActions({ selectedIds: [USER_A] });

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend selected' }));
		expect(await screen.findByText(/suspend 1 staff member/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				expect.anything(),
				'Failed to suspend selected staff members.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('a 401-shaped failure routes to onSessionExpired instead of a toast', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const onSessionExpired = vi.fn();
		mocks.bulkSuspend.mockRejectedValue(new Error('unauthorized'));

		renderBulkActions({ selectedIds: [USER_A], onSessionExpired });

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend selected' }));
		expect(await screen.findByText(/suspend 1 staff member/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Suspend' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});
});
