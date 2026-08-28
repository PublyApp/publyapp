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

import type { BulkStaffInvitationActionFailedItem } from '@org/client-ts/models/index';
import { BULK_ACTION_MAX_COUNT } from '@org/shared-ts/lib/constants';
import { shouldLogoutForFailure } from '@org/shared-ts/lib/should-logout-for-failure';

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

// Wire reasons (apps/api … BulkStaffInvitationActionFailureReasons) → i18n
// keys. Unknown future reasons fall back to a generic translated key — never
// a hardcoded literal (transparent-failure principle, #1387 r1 MINOR).
// Wire reasons arrive from the API as plain strings and unknown future reasons
// fall back to a generic key, so lookup goes through Map.get instead of
// widening the literal to an open dictionary (no-known-value-widening).
const INVITATION_BULK_REVOKE_REASON_I18N_KEYS = new Map<string, string>([
	['already_accepted', 'invitation-bulk-revoke-reason-already-accepted'],
	['not_found', 'invitation-bulk-revoke-reason-not-found'],
]);
const INVITATION_BULK_REVOKE_REASON_OTHER_KEY =
	'invitation-bulk-revoke-reason-other';

type TFunctionLike = (key: string, options?: Record<string, unknown>) => string;

/** Groups per-item revoke failures by reason with counts ("1 already accepted;
 * 1 not found") for the partial-success toast description: the 200 body says
 * WHY items failed, so the toast must say it too. Insertion order preserved,
 * so the most relevant server ordering survives grouping. Returns undefined
 * when the payload carries no per-item reasons (the toast then shows the
 * aggregate counts only). */
const describeBulkRevokeFailureReasons = (
	failedItems:
		| readonly BulkStaffInvitationActionFailedItem[]
		| null
		| undefined,
	t: TFunctionLike,
): string | undefined => {
	if (!failedItems || failedItems.length === 0) {
		return undefined;
	}

	const countsByReason = new Map<string, number>();
	for (const item of failedItems) {
		const reason = item.reason ?? '';
		countsByReason.set(reason, (countsByReason.get(reason) ?? 0) + 1);
	}

	const parts: string[] = [];
	for (const [reason, count] of countsByReason) {
		const key =
			INVITATION_BULK_REVOKE_REASON_I18N_KEYS.get(reason) ??
			INVITATION_BULK_REVOKE_REASON_OTHER_KEY;
		parts.push(t(key, { count }));
	}
	return parts.join('; ');
};

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
			// Per-item reasons ride along as the toast description when the body
			// carries them; the aggregate-counts-only shape stays a 1-arg call.
			const message = t(INVITATION_BULK_REVOKE_PARTIAL_SUCCESS_KEY, {
				succeeded: succeededCount,
				failed: failedCount,
			});
			const reasonsLine = describeBulkRevokeFailureReasons(
				result?.failedItems,
				t,
			);
			if (reasonsLine === undefined) {
				// Only hint that rows may leave the filtered view when at
				// least one row actually changed state. On a total failure
				// (succeededCount === 0) nothing left the view.
				toastLocalMutationResult.error(
					message,
					succeededCount > 0
						? t('bulk-action-rows-may-leave-filter')
						: undefined,
				);
			} else {
				toastLocalMutationResult.error(message, reasonsLine);
			}
		} else {
			toastLocalMutationResult.success(
				t(INVITATION_BULK_REVOKE_SUCCESS_KEY, { count: succeededCount }),
				t('bulk-action-rows-may-leave-filter'),
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
