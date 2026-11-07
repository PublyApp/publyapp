/** @vitest-environment jsdom */
/**
 * #1386 component suite for `RolesListBulkActions` — the route-local
 * selection-toolbar component that wires the existing
 * `POST /staff/roles/bulk-delete` endpoint into the staff roles list.
 *
 * Covered here (the routing suite proves the page-level wiring; this suite
 * pins the component contract):
 *  - the menu item renders unconditionally (bulk-action-ux-conventions.md);
 *  - over-cap trigger is disabled with the max-count i18n title;
 *  - confirmed happy path: ids scoped to selected rows, invalidate + clear +
 *    success toast with the count;
 *  - a selected id ABSENT from `rows` never reaches `bulkDelete` and the
 *    dialog counts only what will be sent (#1408 r1: mutations A and H);
 *  - partial-success toast carries each server reason VERBATIM in its
 *    description, deduplicated and order-preserved (#1408 r1 item 3);
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

const ROLE_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const ROLE_B = 'bbbbbbbb-2222-2222-2222-222222222222';
// An id that exists nowhere in `rows`: the stale-selection shape the prune
// effect has not absorbed yet (see #1408 r1 mutation A).
const STALE_ID = 'cccccccc-3333-3333-3333-333333333333';

const mocks = vi.hoisted(() => ({
	bulkDelete: vi.fn(),
	invalidateStaffRoles: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	shouldLogoutForFailure: vi.fn().mockReturnValue(false),
}));

vi.mock('~/lib/query/staff-roles', () => ({
	STAFF_ROLES_QUERY_KEY: ['staff-roles'],
	invalidateStaffRoles: mocks.invalidateStaffRoles,
	useBulkDeleteStaffRolesMutation: () => ({
		mutateAsync: mocks.bulkDelete,
		isPending: false,
	}),
}));

vi.mock('~/lib/mutation-feedback/mutation-toast', () => ({
	displayLocalMutationFailure: mocks.displayLocalMutationFailure,
	toastLocalMutationResult: {
		success: mocks.toastSuccess,
		error: mocks.toastError,
	},
}));

vi.mock('@org/shared-ts/lib/should-logout-for-failure', () => ({
	shouldLogoutForFailure: mocks.shouldLogoutForFailure,
}));

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => {
			const labels: TestLabelMap = {
				'more-actions': 'More actions',
				'bulk-actions': 'Bulk actions',
				'bulk-delete': 'Delete selected',
				delete: 'Delete',
				'bulk-delete-roles-confirm':
					'Are you sure you want to delete {{count}} selected role(s)? Assigned members lose this role.',
				'staff-role-bulk-delete-success':
					'Successfully deleted {{count}} role(s).',
				'staff-role-bulk-delete-partial-success':
					'Deleted {{succeeded}} role(s), {{failed}} failed.',
				'staff-role-bulk-delete-failure': 'Failed to delete selected roles.',
				'bulk-action-max-count-exceeded':
					'Reduce your selection to at most {{max}} items ({{count}} selected).',
				'bulk-action-rows-may-leave-filter':
					'Some rows may no longer appear in the filtered view.',
				'bulk-action-total-failure-no-reason':
					"The server didn't specify a reason for this failure. Try again, or contact support if the problem persists.",
			};

			return (labels[key] ?? key).replace(
				/\{\{(\w+)\}\}/g,
				(_, name: string) => {
					const value = options?.[name];
					if (typeof value === 'string' || typeof value === 'number') {
						return String(value);
					}
					return '';
				},
			);
		},
		i18n: { language: 'en' },
	}),
}));

import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import type { StaffRoleRow } from '~/lib/query/staff-roles';
import type { TestLabelMap } from '~/lib/testing/test-label-map';

import { RolesListBulkActions } from './_roles-bulk-actions';

const row = (
	id: string,
	userAccountCount: number | null = null,
): StaffRoleRow => ({
	id,
	name: `Role ${id.slice(0, 4)}`,
	description: null,
	userAccountCount,
	icon: 'briefcase',
	iconTone: 'neutral',
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
	rows = [row(ROLE_A, 3), row(ROLE_B)],
	selectedIds = [ROLE_A],
	onSessionExpired = () => undefined,
}: {
	rows?: StaffRoleRow[];
	selectedIds?: string[];
	onSessionExpired?: () => void;
} = {}) =>
	render(
		createElement(
			QueryClientProvider,
			{ client: new QueryClient() },
			createElement(RolesListBulkActions, {
				rows,
				selection: buildSelection(selectedIds),
				onSessionExpired,
			}),
		),
	);

const openMenu = async () => {
	fireEvent.click(screen.getByRole('button', { name: 'Bulk actions' }));
	await waitFor(() =>
		expect(
			screen
				.getByRole('button', { name: 'Bulk actions' })
				.getAttribute('aria-expanded'),
		).toBe('true'),
	);
};

describe('#1386 RolesListBulkActions', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.bulkDelete.mockResolvedValue({ succeededCount: 1, failedCount: 0 });
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	test('menu item renders unconditionally regardless of eligibility (bulk-action-ux-conventions)', async () => {
		renderBulkActions();

		await openMenu();

		expect(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(mocks.bulkDelete).not.toHaveBeenCalled();
	});

	test('over-cap selection disables the trigger with the max-count title', () => {
		const manyRows = Array.from({ length: 101 }, (_, index) =>
			row(`p-${index}`),
		);
		renderBulkActions({
			rows: manyRows,
			selectedIds: manyRows.map((role) => role.id),
		});

		const trigger = screen.getByRole('button', {
			name: 'Bulk actions',
		}) as HTMLButtonElement;
		expect(trigger.disabled).toBe(true);
		expect(trigger.getAttribute('title')).toBe(
			'Reduce your selection to at most 100 items (101 selected).',
		);
	});

	test('confirmed delete scopes ids to selected rows and clears selection after success', async () => {
		mocks.bulkDelete.mockResolvedValue({ succeededCount: 2, failedCount: 0 });
		const clearSelection = vi.fn();
		const selection = {
			...buildSelection([ROLE_A, ROLE_B]),
			clearSelection,
		};
		render(
			createElement(
				QueryClientProvider,
				{ client: new QueryClient() },
				createElement(RolesListBulkActions, {
					rows: [row(ROLE_A, 3), row(ROLE_B)],
					selection,
					onSessionExpired: () => undefined,
				}),
			),
		);

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));

		// The dialog names exactly the number of ids that will be sent.
		expect(
			await screen.findByText(
				'Are you sure you want to delete 2 selected role(s)? Assigned members lose this role.',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.bulkDelete).toHaveBeenCalledWith({
				roleIds: [ROLE_A, ROLE_B],
			}),
		);
		await waitFor(() => expect(clearSelection).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'Successfully deleted 2 role(s).',
				'Some rows may no longer appear in the filtered view.',
			),
		);
		await waitFor(() =>
			expect(mocks.invalidateStaffRoles).toHaveBeenCalledOnce(),
		);
	});

	// #1408 r1 mutation A: sending every key of rowSelection (including ids
	// absent from rows) must turn RED here — only loaded-row ids reach the wire.
	test('a selected id absent from rows is not sent to bulk delete', async () => {
		renderBulkActions({
			rows: [row(ROLE_A)],
			selectedIds: [ROLE_A, STALE_ID],
		});

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));

		// The dialog counts only what will be sent (#1408 r1 mutation H).
		expect(await screen.findByText(/delete 1 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.bulkDelete).toHaveBeenCalledWith({
				roleIds: [ROLE_A],
			}),
		);
		expect(mocks.bulkDelete).not.toHaveBeenCalledWith({
			roleIds: expect.arrayContaining([STALE_ID]),
		});
	});

	// #1408 r1 item 3: the partial-success toast surfaces each per-item server
	// reason verbatim (deduplicated, order-preserved) as its description.
	test('partial failure toast carries each server reason verbatim', async () => {
		mocks.bulkDelete.mockResolvedValue({
			succeededCount: 1,
			failedCount: 3,
			failedItems: [
				{
					roleId: ROLE_B,
					errorEscaped: 'Default roles cannot be deleted',
				},
				{
					roleId: STALE_ID,
					errorEscaped: 'Role not found',
				},
				{
					roleId: 'dddddddd-4444-4444-4444-444444444444',
					errorEscaped: 'Default roles cannot be deleted',
				},
			],
		});

		renderBulkActions({
			rows: [row(ROLE_A), row(ROLE_B), row(STALE_ID)],
			selectedIds: [ROLE_A, ROLE_B, STALE_ID],
		});

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 3 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
		const [message, description] = mocks.toastError.mock.calls[0] as [
			string,
			string | undefined,
		];
		expect(message).toBe('Deleted 1 role(s), 3 failed.');
		expect(description).toContain('Default roles cannot be deleted');
		expect(description).toContain('Role not found');
		// Order preserved on first appearance; duplicate reasons collapse.
		expect(
			description?.indexOf('Default roles cannot be deleted'),
		).toBeLessThan(description?.indexOf('Role not found') ?? Number.NaN);
		expect(description?.split('\n')).toEqual([
			'Default roles cannot be deleted',
			'Role not found',
		]);
	});

	test('mutation rejection surfaces a transparent local failure message', async () => {
		mocks.bulkDelete.mockRejectedValue(new Error('boom'));

		renderBulkActions();

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				expect.anything(),
				'Failed to delete selected roles.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('total-failure toast suppresses the filter-leave warning when nothing succeeded', async () => {
		mocks.bulkDelete.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
			failedItems: [
				{
					roleId: ROLE_A,
					errorEscaped: 'Default roles cannot be deleted',
				},
			],
		});

		renderBulkActions();

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
		const [message, description] = mocks.toastError.mock.calls[0] as [
			string,
			string | undefined,
		];
		expect(message).toBe('Deleted 0 role(s), 1 failed.');
		// #1605: total failure (succeededCount === 0) with per-item reasons
		// carries the cause description, NOT the filter-leave warning.
		expect(description).toBe('Default roles cannot be deleted');
		expect(description).not.toContain('Some rows may no longer appear');
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('a 401-shaped failure routes to onSessionExpired instead of a toast', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const onSessionExpired = vi.fn();
		mocks.bulkDelete.mockRejectedValue(new Error('unauthorized'));

		renderBulkActions({ onSessionExpired });

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});

	// #1605 / #1787 r6 / #1811 : total failure (succeededCount === 0) with no
	// per-item reasons must NOT carry the filter-leave warning. Without this
	// test, the `filterWarning` ternary on line 112-113 is unreachable on the
	// roles surface — the existing total-failure test always supplies
	// errorEscaped, so reasons.length > 0 and the guard never falls through to
	// filterWarning.
	// #1811: the description must NO LONGER be undefined — it must carry the
	// fallback cause "no reason provided by the server" (the rule
	// "every failure shows its cause in plain words" forbids silence).
	test('an all-failure delete without per-item reasons shows the no-reason fallback (#1811)', async () => {
		mocks.bulkDelete.mockResolvedValue({
			succeededCount: 0,
			failedCount: 1,
		});

		renderBulkActions();

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Deleted 0 role(s), 1 failed.',
				"The server didn't specify a reason for this failure. Try again, or contact support if the problem persists.",
			),
		);
		// #1605: a total failure (succeededCount === 0) with no per-item
		// reasons does NOT carry the filter warning — no row left the view.
		expect(mocks.toastError.mock.calls[0][1]).not.toContain(
			'Some rows may no longer appear',
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	// #1605: success and partial-success toasts carry the filter-warning
	// description so users know rows may vanish from the current filter.
	test('success toast includes the filter-leave-warning description (#1605)', async () => {
		mocks.bulkDelete.mockResolvedValue({ succeededCount: 1, failedCount: 0 });

		renderBulkActions();

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected role/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'Successfully deleted 1 role(s).',
				'Some rows may no longer appear in the filtered view.',
			),
		);
	});

	test('partial-success toast includes the filter-leave-warning when no per-item reasons', async () => {
		mocks.bulkDelete.mockResolvedValue({
			succeededCount: 1,
			failedCount: 2,
			failedItems: [{ roleId: ROLE_B }, { roleId: STALE_ID }],
		});

		renderBulkActions({
			rows: [row(ROLE_A), row(ROLE_B), row(STALE_ID)],
			selectedIds: [ROLE_A, ROLE_B, STALE_ID],
		});

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
		const [, description] = mocks.toastError.mock.calls[0] as [
			string,
			string | undefined,
		];
		expect(description).toBe(
			'Some rows may no longer appear in the filtered view.',
		);
	});

	test('partial-success toast surfaces per-item reasons instead of the filter warning', async () => {
		mocks.bulkDelete.mockResolvedValue({
			succeededCount: 1,
			failedCount: 3,
			failedItems: [
				{
					roleId: ROLE_B,
					errorEscaped: 'Default roles cannot be deleted',
				},
				{ roleId: STALE_ID, errorEscaped: 'Role not found' },
				{
					roleId: 'dddddddd-4444-4444-4444-444444444444',
					errorEscaped: 'Default roles cannot be deleted',
				},
			],
		});

		renderBulkActions({
			rows: [row(ROLE_A), row(ROLE_B), row(STALE_ID)],
			selectedIds: [ROLE_A, ROLE_B, STALE_ID],
		});

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
		const [, description] = mocks.toastError.mock.calls[0] as [
			string,
			string | undefined,
		];
		expect(description).toContain('Default roles cannot be deleted');
		expect(description).toContain('Role not found');
		expect(description).not.toContain('Some rows may no longer appear');
	});
});
