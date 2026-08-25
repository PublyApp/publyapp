/** @vitest-environment jsdom */
/**
 * #1386 component suite for `ProfilesListBulkActions` — the route-local
 * selection-toolbar component that wires the existing
 * `POST /staff/profiles/bulk-delete` endpoint into the staff profiles list.
 *
 * Covered here (the routing suite proves the page-level wiring; this suite
 * pins the component contract):
 *  - the menu item renders unconditionally (bulk-action-ux-conventions.md);
 *  - over-cap trigger is disabled with the max-count i18n title;
 *  - confirmed happy path: ids scoped to selected rows, invalidate + clear +
 *    success toast with the count;
 *  - partial-success toast when the API reports per-item failures (e.g.
 *    default profiles skipped server-side);
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

const PROFILE_A = 'aaaaaaaa-1111-1111-1111-111111111111';
const PROFILE_B = 'bbbbbbbb-2222-2222-2222-222222222222';

const mocks = vi.hoisted(() => ({
	bulkDelete: vi.fn(),
	invalidateStaffProfiles: vi.fn().mockResolvedValue(undefined),
	toastSuccess: vi.fn(),
	toastWarning: vi.fn(),
	toastError: vi.fn(),
	displayLocalMutationFailure: vi.fn().mockResolvedValue(undefined),
	shouldLogoutForFailure: vi.fn().mockReturnValue(false),
}));

vi.mock('~/lib/query/staff-profiles', () => ({
	STAFF_PROFILES_QUERY_KEY: ['staff-profiles'],
	invalidateStaffProfiles: mocks.invalidateStaffProfiles,
	useBulkDeleteStaffProfilesMutation: () => ({
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
			const labels: Record<string, string> = {
				'more-actions': 'More actions',
				'bulk-actions': 'Bulk actions',
				'bulk-delete': 'Delete selected',
				delete: 'Delete',
				'bulk-delete-profiles-confirm':
					'Are you sure you want to delete {{count}} selected profile(s)? Assigned members lose this profile. Default profiles in the selection are skipped.',
				'staff-profile-bulk-delete-success':
					'Successfully deleted {{count}} profile(s).',
				'staff-profile-bulk-delete-partial-success':
					'Deleted {{succeeded}} profile(s), {{failed}} failed.',
				'staff-profile-bulk-delete-failure':
					'Failed to delete selected profiles.',
				'bulk-delete-disabled-default-profiles-selected':
					"Default profiles can't be deleted. Clear them from the selection first.",
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
import type { StaffProfileRow } from '~/lib/query/staff-profiles';

import { ProfilesListBulkActions } from './_profiles-bulk-actions';

const row = (
	id: string,
	userAccountCount: number | null = null,
): StaffProfileRow => ({
	id,
	name: `Profile ${id.slice(0, 4)}`,
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
	rows = [row(PROFILE_A, 3), row(PROFILE_B)],
	selectedIds = [PROFILE_A],
	onSessionExpired = () => undefined,
}: {
	rows?: StaffProfileRow[];
	selectedIds?: string[];
	onSessionExpired?: () => void;
} = {}) =>
	render(
		createElement(
			QueryClientProvider,
			{ client: new QueryClient() },
			createElement(ProfilesListBulkActions, {
				rows,
				selection: buildSelection(selectedIds),
				onSessionExpired,
			}),
		),
	);

const openMenu = async () => {
	fireEvent.click(
		screen.getByRole('button', { name: 'More actions', expanded: false }),
	);
	await waitFor(() =>
		expect(
			screen
				.getByRole('button', { name: 'More actions' })
				.getAttribute('aria-expanded'),
		).toBe('true'),
	);
};

describe('#1386 ProfilesListBulkActions', () => {
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
		expect(mocks.toastWarning).not.toHaveBeenCalled();
	});

	test('over-cap selection disables the trigger with the max-count title', () => {
		const manyRows = Array.from({ length: 101 }, (_, index) =>
			row(`p-${index}`),
		);
		renderBulkActions({
			rows: manyRows,
			selectedIds: manyRows.map((profile) => profile.id),
		});

		// The trigger carries aria-label "More actions" for its accessible name;
		// the max-count reason rides on the title attribute.
		const trigger = screen.getByRole('button', {
			name: 'More actions',
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
			...buildSelection([PROFILE_A, PROFILE_B]),
			clearSelection,
		};
		render(
			createElement(
				QueryClientProvider,
				{ client: new QueryClient() },
				createElement(ProfilesListBulkActions, {
					rows: [row(PROFILE_A, 3), row(PROFILE_B)],
					selection,
					onSessionExpired: () => undefined,
				}),
			),
		);

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));

		// The dialog names the count and the consequence before firing.
		expect(
			await screen.findByText(
				'Are you sure you want to delete 2 selected profile(s)? Assigned members lose this profile. Default profiles in the selection are skipped.',
			),
		).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.bulkDelete).toHaveBeenCalledWith({
				profileIds: [PROFILE_A, PROFILE_B],
			}),
		);
		await waitFor(() => expect(clearSelection).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(mocks.toastSuccess).toHaveBeenCalledWith(
				'Successfully deleted 2 profile(s).',
			),
		);
		await waitFor(() =>
			expect(mocks.invalidateStaffProfiles).toHaveBeenCalledOnce(),
		);
	});

	test('partial failure raises the partial-success toast instead of plain success', async () => {
		mocks.bulkDelete.mockResolvedValue({ succeededCount: 1, failedCount: 2 });

		renderBulkActions({
			rows: [row(PROFILE_A), row(PROFILE_B)],
			selectedIds: [PROFILE_A, PROFILE_B],
		});

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 2 selected profile/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.toastError).toHaveBeenCalledWith(
				'Deleted 1 profile(s), 2 failed.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('mutation rejection surfaces a transparent local failure message', async () => {
		mocks.bulkDelete.mockRejectedValue(new Error('boom'));

		renderBulkActions();

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected profile/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() =>
			expect(mocks.displayLocalMutationFailure).toHaveBeenCalledWith(
				expect.anything(),
				'Failed to delete selected profiles.',
			),
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	test('a 401-shaped failure routes to onSessionExpired instead of a toast', async () => {
		mocks.shouldLogoutForFailure.mockReturnValue(true);
		const onSessionExpired = vi.fn();
		mocks.bulkDelete.mockRejectedValue(new Error('unauthorized'));

		renderBulkActions({ onSessionExpired });

		await openMenu();
		fireEvent.click(screen.getByRole('menuitem', { name: 'Delete selected' }));
		expect(await screen.findByText(/delete 1 selected profile/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
		expect(mocks.displayLocalMutationFailure).not.toHaveBeenCalled();
	});
});
