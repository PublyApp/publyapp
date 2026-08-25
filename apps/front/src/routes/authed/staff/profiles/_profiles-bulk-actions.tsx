import { IconChevronDown, IconTrash } from '@tabler/icons-react';
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
	invalidateStaffProfiles,
	type BulkStaffProfileActionInput,
	type StaffProfileRow,
	useBulkDeleteStaffProfilesMutation,
} from '~/lib/query/staff-profiles';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { getDeletableProfileIds } from './_profiles-bulk-helpers';

/** Route-local bulk action for the staff profiles list (#1386): the selection
 * toolbar offered only Export even though the API already ships
 * `POST /staff/profiles/bulk-delete`. Mirrors `StaffUsersListBulkActions`
 * (#1385) and follows docs/guides/bulk-action-ux-conventions.md: the menu item
 * renders unconditionally; the click handler enforces eligibility (default
 * profiles are skipped server-side, so they never reach the wire) and surfaces
 * the reason instead of hiding or disabling the item. */

export const ProfilesListBulkActions = ({
	rows,
	selection,
	onSessionExpired,
}: {
	rows: StaffProfileRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const bulkDeleteMutation = useBulkDeleteStaffProfilesMutation();

	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;

	// Eligibility mirrors the backend service (`BulkDeleteStaffProfilesAsync`):
	// default profiles would come back as per-item failures, so they are scoped
	// out before the confirm dialog is ever opened.
	const deletableProfileIds = getDeletableProfileIds(
		rows,
		selection.rowSelection,
	);

	// The MenuItem renders unconditionally (docs/guides/bulk-action-ux-conventions.md):
	// the click handler enforces eligibility and surfaces the reason rather than
	// disabling or hiding the item.
	const handleMenuItemClick = (): void => {
		if (deletableProfileIds.length === 0) {
			toastLocalMutationResult.warning(
				t('bulk-delete-disabled-default-profiles-selected'),
			);
			return;
		}
		setIsDialogOpen(true);
	};

	const performBulkDelete = async () => {
		const args: BulkStaffProfileActionInput = {
			profileIds: deletableProfileIds,
		};

		let result;
		try {
			// Only mutateAsync sits inside the try (mutation-feedback ownership:
			// the split try/catch keeps post-success bookkeeping out of the error
			// path).
			result = await bulkDeleteMutation.mutateAsync(args);
		} catch (error) {
			setIsDialogOpen(false);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t('staff-profile-bulk-delete-failure'),
			);
			return;
		}

		setIsDialogOpen(false);
		selection.clearSelection();

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;

		if (failedCount > 0) {
			toastLocalMutationResult.error(
				t('staff-profile-bulk-delete-partial-success', {
					succeeded: succeededCount,
					failed: failedCount,
				}),
			);
		} else {
			toastLocalMutationResult.success(
				t('staff-profile-bulk-delete-success', { count: succeededCount }),
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
						disabled={bulkDeleteMutation.isPending}
						onClick={handleMenuItemClick}
					>
						<IconTrash />
						{t('bulk-delete')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={isDialogOpen}
				title={t('bulk-delete')}
				description={t('bulk-delete-profiles-confirm', {
					count: deletableProfileIds.length,
				})}
				confirmLabel={t('delete')}
				isPending={bulkDeleteMutation.isPending}
				onConfirm={() => {
					void performBulkDelete();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setIsDialogOpen(false);
				}}
			/>
		</>
	);
};
