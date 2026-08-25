import { IconChevronDown, IconUserMinus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME } from '~/components/table/floating-selection-bar';
import type { UseRowSelectionResult } from '~/components/table/use-row-selection';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import {
	displayLocalMutationFailure,
	toastLocalMutationResult,
} from '~/lib/mutation-toast';
import {
	type StaffProfileUserRow,
	useBulkUnassignStaffProfileUsersMutation,
} from '~/lib/query/staff-profile-users';
import { invalidateStaffProfiles } from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

/** Route-local bulk management action for the staff profile "users" tab
 * (#1388): selection mode existed nowhere on this surface even though the API
 * ships `POST /staff/profiles/{profileId}/users/unassign`. Mirrors
 * `StaffUsersListBulkActions` (`staff-users/_list-bulk-actions.tsx`) and follows
 * docs/guides/bulk-action-ux-conventions.md: the menu item renders
 * unconditionally; the click handler enforces eligibility and surfaces the
 * reason instead of hiding or disabling the item. */

type PendingAction = 'unassign' | null;

export const ProfileUsersListBulkActions = ({
	profileId,
	rows,
	selection,
	onSessionExpired,
}: {
	profileId: string;
	rows: StaffProfileUserRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const unassignMutation = useBulkUnassignStaffProfileUsersMutation();

	const selectedUsers = rows.filter((row) => selection.rowSelection[row.id]);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending = unassignMutation.isPending;

	// MenuItem renders unconditionally (docs/guides/bulk-action-ux-conventions.md):
	// the click handler enforces eligibility and surfaces the reason rather than
	// disabling or hiding the item.
	const handleMenuItemClick = (): void => {
		if (selectedCount === 0) {
			toastLocalMutationResult.warning(t('bulk-unassign-no-eligible-users'));
			return;
		}
		setPendingAction('unassign');
	};

	const performUnassign = async () => {
		let result;
		try {
			// Only mutateAsync sits inside the try (mutation-feedback ownership:
			// the split try/catch keeps post-success bookkeeping out of the error
			// path).
			result = await unassignMutation.mutateAsync({
				profileId,
				userIds: selectedUsers.map((user) => user.id),
			});
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t('staff-profile-user-bulk-unassign-failure'),
			);
			return;
		}

		setPendingAction(null);
		selection.clearSelection();

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;

		if (failedCount > 0) {
			toastLocalMutationResult.error(
				t('staff-profile-user-bulk-unassign-partial-success', {
					succeeded: succeededCount,
					failed: failedCount,
				}),
			);
		} else {
			toastLocalMutationResult.success(
				t('staff-profile-user-bulk-unassign-success', {
					count: succeededCount,
				}),
			);
		}

		await invalidateStaffProfiles(queryClient);
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="sm"
							disabled={isOverLimit}
							title={
								isOverLimit
									? t('bulk-action-max-count-exceeded', {
											max: BULK_ACTION_MAX_COUNT,
											count: selectedCount,
										})
									: t('more-actions')
							}
							aria-label={t('more-actions')}
							className={FLOATING_SELECTION_BAR_ACTION_BUTTON_CLASS_NAME}
						/>
					}
				>
					{t('bulk-actions')}
					<IconChevronDown aria-hidden="true" className="size-3" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" side="top" sideOffset={6}>
					<DropdownMenuItem
						variant="destructive"
						disabled={isActionPending}
						onClick={handleMenuItemClick}
					>
						<IconUserMinus />
						{t('bulk-unassign')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={t('bulk-unassign')}
				description={t('bulk-unassign-staff-profile-users-confirm', {
					count: selectedUsers.length,
				})}
				confirmLabel={t('unassign')}
				isPending={isActionPending}
				onConfirm={() => {
					void performUnassign();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingAction(null);
				}}
			/>
		</>
	);
};
