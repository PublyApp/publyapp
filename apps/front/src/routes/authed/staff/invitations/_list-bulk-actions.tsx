import { IconChevronDown, IconX } from '@tabler/icons-react';
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
	invalidateStaffInvitations,
	useBulkRevokeStaffInvitationsMutation,
} from '~/lib/query/staff-invitations';
import { shouldLogoutForFailure } from '~/lib/should-logout-for-failure';

import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';

import { getBulkRevokeEligibleIds } from './bulk-revoke-eligibility';
import type { InvitationRow } from './table-columns';

/** Route-local bulk-revoke action for the staff invitations list (#1387): the
 * selection toolbar offered only Export even though the API already ships
 * `POST /staff/invitations/bulk-revoke`. Mirrors `StaffUsersListBulkActions`
 * (#820) and follows docs/guides/bulk-action-ux-conventions.md: the menu item
 * renders unconditionally; the click handler enforces pending-only eligibility
 * and surfaces the reason instead of hiding or disabling the item. Unlike the
 * #1385 trigger, the accessible name equals the visible label (#1400). */

type InvitationPendingAction = 'revoke' | null;

const INVITATION_BULK_REVOKE_FAILURE_KEY = 'invitation-bulk-revoke-failure';
const INVITATION_BULK_REVOKE_SUCCESS_KEY = 'invitation-bulk-revoke-success';
const INVITATION_BULK_REVOKE_PARTIAL_SUCCESS_KEY =
	'invitation-bulk-revoke-partial-success';

export const InvitationsListBulkActions = ({
	rows,
	selection,
	onSessionExpired,
}: {
	rows: InvitationRow[];
	selection: UseRowSelectionResult;
	onSessionExpired: () => void;
}) => {
	const { t } = useTranslation('common');
	const queryClient = useQueryClient();
	const [pendingAction, setPendingAction] =
		useState<InvitationPendingAction>(null);
	const bulkRevokeMutation = useBulkRevokeStaffInvitationsMutation();

	const selectedInvitations = rows.filter(
		(row) => selection.rowSelection[row.id],
	);
	const selectedCount = selection.selectedCount;
	const isOverLimit = selectedCount > BULK_ACTION_MAX_COUNT;
	const isActionPending = bulkRevokeMutation.isPending;

	const eligibleIds = getBulkRevokeEligibleIds(selectedInvitations);

	// MenuItems render unconditionally (docs/guides/bulk-action-ux-conventions.md):
	// the click handler enforces eligibility and surfaces the reason rather than
	// disabling or hiding the item.
	const handleMenuItemClick = (): void => {
		if (eligibleIds.length === 0) {
			toastLocalMutationResult.warning(
				t('only-pending-invitations-can-be-revoked'),
			);
			return;
		}
		setPendingAction('revoke');
	};

	const performBulkRevoke = async () => {
		let result;
		try {
			// Only mutateAsync sits inside the try (mutation-feedback ownership:
			// the split try/catch keeps post-success bookkeeping out of the error
			// path).
			result = await bulkRevokeMutation.mutateAsync({
				invitationIds: eligibleIds,
			});
		} catch (error) {
			setPendingAction(null);
			if (shouldLogoutForFailure(error)) {
				onSessionExpired();
				return;
			}

			await displayLocalMutationFailure(
				error,
				t(INVITATION_BULK_REVOKE_FAILURE_KEY),
			);
			return;
		}

		setPendingAction(null);
		selection.clearSelection();

		const succeededCount = result?.succeededCount ?? 0;
		const failedCount = result?.failedCount ?? 0;

		if (failedCount > 0) {
			toastLocalMutationResult.error(
				t(INVITATION_BULK_REVOKE_PARTIAL_SUCCESS_KEY, {
					succeeded: succeededCount,
					failed: failedCount,
				}),
			);
		} else {
			toastLocalMutationResult.success(
				t(INVITATION_BULK_REVOKE_SUCCESS_KEY, { count: succeededCount }),
			);
		}

		await invalidateStaffInvitations(queryClient);
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
						disabled={isActionPending}
						onClick={handleMenuItemClick}
					>
						<IconX />
						{t('revoke-selected')}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<ConfirmDialog
				isOpen={pendingAction !== null}
				title={t('revoke-selected')}
				description={t('confirm-bulk-revoke-invitations', {
					count: eligibleIds.length,
				})}
				confirmLabel={t('revoke')}
				isPending={isActionPending}
				onConfirm={() => {
					void performBulkRevoke();
				}}
				onOpenChange={(isOpen) => {
					if (!isOpen) setPendingAction(null);
				}}
			/>
		</>
	);
};
