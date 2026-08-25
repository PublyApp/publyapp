import type { InvitationDisplayStatus } from './list-helpers';

/**
 * #1387 bulk-revoke eligibility for the staff invitations selection toolbar:
 * only PENDING invitations can be revoked (the API rejects the rest per-item).
 *
 * Statuses normally arrive already normalized through
 * `normalizeInvitationStatus`, but the comparison stays defensive
 * (trim + lowercase, like the #820 staff-users toolbar) so a raw backend
 * string can never silently flip eligibility.
 */
export type BulkRevokeEligibilityRow = {
	id: string;
	status: InvitationDisplayStatus | string | null | undefined;
};

const isPending = (status: BulkRevokeEligibilityRow['status']): boolean =>
	typeof status === 'string' && status.trim().toLowerCase() === 'pending';

export const getBulkRevokeEligibleIds = (
	rows: BulkRevokeEligibilityRow[],
): string[] => {
	const eligibleIds: string[] = [];

	for (const row of rows) {
		if (isPending(row.status)) {
			eligibleIds.push(row.id);
		}
	}

	return eligibleIds;
};

export const getIneligibleRevokeCount = (
	rows: BulkRevokeEligibilityRow[],
	selectedIds: string[],
): number => {
	const selectedIdSet = new Set(selectedIds);
	let ineligibleCount = 0;

	for (const row of rows) {
		if (selectedIdSet.has(row.id) && !isPending(row.status)) {
			ineligibleCount += 1;
		}
	}

	return ineligibleCount;
};
