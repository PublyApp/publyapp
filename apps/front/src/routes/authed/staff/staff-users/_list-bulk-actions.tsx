import { IconPlayerPause, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import {
	type BulkActionMenuItem,
	BulkActionsMenu,
	BulkActionsTrigger,
} from '~/components/ui/bulk-actions-trigger';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DropdownMenu } from '~/components/ui/dropdown-menu';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	invalidateStaffUsers,
	type BulkStaffUserActionInput,
	type StaffUserRow,
	useBulkDeleteStaffUsersMutation,
	useBulkReactivateStaffUsersMutation,
	useBulkSuspendStaffUsersMutation,
} from '~/lib/query/staff-users';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/** Route-local bulk management actions for the shared staff-users list
 * (#820): the selection toolbar used to offer only Export even though the API
 * already ships `POST /staff/users/bulk-suspend|bulk-reactivate|bulk-delete`.
 * Mirrors `TenantBulkActions` (`staff/tenants.tsx`) and follows
 * docs/guides/bulk-action-ux-conventions.md: menu items render unconditionally;
 * the click handler enforces eligibility and surfaces the reason instead of
 * hiding or disabling items. */

type StaffUserPendingAction = 'suspend' | 'reactivate' | 'delete' | null;

type StaffUserActionKey = Exclude<StaffUserPendingAction, null>;

// Statuses arrive as raw backend strings ("Active"/"Suspended"); normalize
// lowercase-trim exactly like status-labels.ts.
const STAFF_USER_STATUS_ACTIVE = 'active';
const STAFF_USER_STATUS_SUSPENDED = 'suspended';

const STAFF_USER_BULK_FAILURE_KEYS = {
	suspend: 'staff-user-bulk-suspend-failure',
	reactivate: 'staff-user-bulk-reactivate-failure',
	delete: 'staff-user-bulk-delete-failure',
} satisfies Record<StaffUserActionKey, string>;

const STAFF_USER_BULK_SUCCESS_KEYS = {
	suspend: 'staff-user-bulk-suspend-success',
	reactivate: 'staff-user-bulk-reactivate-success',
	delete: 'staff-user-bulk-delete-success',
} satisfies Record<StaffUserActionKey, string>;

const STAFF_USER_BULK_PARTIAL_SUCCESS_KEYS = {
	suspend: 'staff-user-bulk-suspend-partial-success',
	reactivate: 'staff-user-bulk-reactivate-partial-success',
	delete: 'staff-user-bulk-delete-partial-success',
} satisfies Record<StaffUserActionKey, string>;

const getConfirmDialogConfig = (
	action: StaffUserPendingAction,
	count: number,
	t: (key: string, options?: Record<string, unknown>) => string,
) => {
	switch (action) {
		case 'suspend':
			return {
				title: t('bulk-suspend'),
				description: t('bulk-suspend-staff-users-confirm', { count }),
				confirmLabel: t('suspend'),
			};
		case 'reactivate':
			return {
				title: t('bulk-reactivate'),
				description: t('bulk-reactivate-staff-users-confirm', { count }),
				confirmLabel: t('reactivate'),
			};
		case 'delete':
			return {
				title: t('bulk-delete'),
				description: t('bulk-delete-staff-users-confirm', { count }),
				confirmLabel: t('delete'),
			};
		default:
			return { title: '', description: '', confirmLabel: '' };
	}
};

export const StaffUsersListBulkActions = ({
	rows,
	selection,
	onSessionExpired,
}: {
	rows: StaffUserRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<StaffUserPendingAction>(null);
	const bulkSuspendMutation = useBulkSuspendStaffUsersMutation();
	const bulkReactivateMutation = useBulkReactivateStaffUsersMutation();
	const bulkDeleteMutation = useBulkDeleteStaffUsersMutation();

	const selectedUsers = rows.filter((row) => selection.rowSelection[row.id]);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending =
		bulkSuspendMutation.isPending ||
		bulkReactivateMutation.isPending ||
		bulkDeleteMutation.isPending;

	const eligibleIdsFor = (action: StaffUserActionKey): string[] => {
		if (action === 'suspend') {
			return selectedUsers.flatMap((user) =>
				user.status?.trim().toLowerCase() === STAFF_USER_STATUS_ACTIVE
					? [user.id]
					: [],
			);
		}
		if (action === 'reactivate' || action === 'delete') {
			const allSelectedAreSuspended =
				selectedUsers.length > 0 &&
				selectedUsers.every(
					(user) =>
						user.status?.trim().toLowerCase() === STAFF_USER_STATUS_SUSPENDED,
				);
			if (allSelectedAreSuspended) {
				return selectedUsers.map((user) => user.id);
			}
			return [];
		}
		return [];
	};

	const ineligibleMessageFor = (action: StaffUserActionKey): string => {
		if (action === 'suspend') {
			return t('bulk-suspend-disabled-no-active-users');
		}
		if (action === 'reactivate') {
			return t('bulk-reactivate-disabled-no-suspended-users');
		}
		return t('bulk-delete-disabled-until-all-suspended');
	};

	// MenuItems render unconditionally (docs/guides/bulk-action-ux-conventions.md):
	// the click handler enforces eligibility and surfaces the reason rather than
	// disabling or hiding the item.
	const handleMenuItemClick = (action: StaffUserActionKey): void => {
		if (eligibleIdsFor(action).length === 0) {
			toastLocalMutationResult.warning(ineligibleMessageFor(action));
			return;
		}
		setPendingAction(action);
	};

	const performBulkAction = async (action: StaffUserActionKey) => {
		const args: BulkStaffUserActionInput = {
			userIds: eligibleIdsFor(action),
		};

		let result;
		try {
			// Only mutateAsync sits inside the try (mutation-feedback ownership:
			// the split try/catch keeps post-success bookkeeping out of the error
			// path).
			if (action === 'suspend') {
				result = await bulkSuspendMutation.mutateAsync(args);
			} else if (action === 'reactivate') {
				result = await bulkReactivateMutation.mutateAsync(args);
			} else {
				result = await bulkDeleteMutation.mutateAsync(args);
			}
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t(STAFF_USER_BULK_FAILURE_KEYS[action]),
			);
			return;
		}

		setPendingAction(null);
		selection.clearSelection();

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;

		if (failedCount > 0) {
			// Only hint that rows may leave the filtered view when at least
			// one row actually changed state. On a total failure
			// (succeededCount === 0) nothing left the view, so the hint
			// would contradict the leading count message.
			toastLocalMutationResult.error(
				t(STAFF_USER_BULK_PARTIAL_SUCCESS_KEYS[action], {
					succeeded: succeededCount,
					failed: failedCount,
				}),
				succeededCount > 0 ? t('bulk-action-rows-may-leave-filter') : undefined,
			);
		} else {
			toastLocalMutationResult.success(
				t(STAFF_USER_BULK_SUCCESS_KEYS[action], { count: succeededCount }),
				t('bulk-action-rows-may-leave-filter'),
			);
		}

		await invalidateStaffUsers(queryClient);
	};

	const dialogConfig = getConfirmDialogConfig(
		pendingAction,
		pendingAction ? eligibleIdsFor(pendingAction).length : 0,
		t,
	);

	const menuItems: readonly BulkActionMenuItem<StaffUserActionKey>[] = [
		{ key: 'reactivate', label: t('bulk-reactivate'), icon: <IconRefresh /> },
		{
			key: 'suspend',
			label: t('bulk-suspend'),
			icon: <IconPlayerPause />,
			variant: 'destructive',
			disabled: isActionPending,
		},
		{
			key: 'delete',
			label: t('bulk-delete'),
			icon: <IconTrash />,
			variant: 'destructive',
			disabled: isActionPending,
		},
	];

	return (
		<>
			<DropdownMenu>
				<BulkActionsTrigger
					triggerLabel={t('bulk-actions')}
					isOverLimit={isOverLimit}
					overLimitMessage={t('bulk-action-max-count-exceeded', {
						max: BULK_ACTION_MAX_COUNT,
						count: selectedCount,
					})}
				/>
				<BulkActionsMenu
					items={menuItems}
					onMenuItemClick={handleMenuItemClick}
				/>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={dialogConfig.title}
				description={dialogConfig.description}
				confirmLabel={dialogConfig.confirmLabel}
				isPending={isActionPending}
				onConfirm={() => {
					if (pendingAction) {
						void performBulkAction(pendingAction);
					}
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingAction(null);
				}}
			/>
		</>
	);
};
