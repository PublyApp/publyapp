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

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

/** Route-local bulk action for the staff profiles list (#1386): the selection
 * toolbar offered only Export even though the API already ships
 * `POST /staff/profiles/bulk-delete`. Mirrors `StaffUsersListBulkActions`
 * (#1385) and follows docs/guides/bulk-action-ux-conventions.md: the menu item
 * renders unconditionally, and the API accounts for every requested id — one
 * it refuses comes back in `failedItems` with a plain-language reason, which
 * the partial-success toast surfaces verbatim (#1408 r1). */

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

	// Only ids present among the loaded rows are sent: a selection entry
	// without a row (possible in the render window before `useRowSelection`
	// prunes a data change) must not reach the wire — the server would report
	// it "Profile not found" for an id the user cannot see (#1408 r1).
	const selectedIds = rows.flatMap((row) =>
		selection.rowSelection[row.id] ? [row.id] : [],
	);

	const handleMenuItemClick = (): void => {
		setIsDialogOpen(true);
	};

	const performBulkDelete = async () => {
		const args: BulkStaffProfileActionInput = {
			profileIds: selectedIds,
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
		const failedItems = result?.failedItems ?? [];

		if (failedCount > 0) {
			// Transparent failure causes: surface each per-item reason verbatim
			// (deduplicated, order-preserved), never a bare "some items failed".
			const reasons = [
				...new Set(
					failedItems.flatMap((item) => {
						const reason = item.errorEscaped?.trim();
						if (reason) return [reason];
						return [];
					}),
				),
			];
			// `publy`/oxlint interdit les ternaires imbriques : on calcule
			// l'avertissement de filtre en amont, la description reste identique.
			const filterWarning =
				succeededCount > 0 ? t('bulk-action-rows-may-leave-filter') : undefined;
			toastLocalMutationResult.error(
				t('staff-profile-bulk-delete-partial-success', {
					succeeded: succeededCount,
					failed: failedCount,
				}),
				reasons.length > 0 ? reasons.join('\n') : filterWarning,
			);
		} else {
			toastLocalMutationResult.success(
				t('staff-profile-bulk-delete-success', { count: succeededCount }),
				t('bulk-action-rows-may-leave-filter'),
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
									: t('bulk-actions')
							}
							aria-label={t('bulk-actions')}
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
					count: selectedIds.length,
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
