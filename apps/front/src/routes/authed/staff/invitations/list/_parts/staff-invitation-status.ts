export type StaffInvitationStatus =
	| 'pending'
	| 'accepted'
	| 'expired'
	| 'revoked';

export const STAFF_INVITATION_STATUS_VALUES: readonly StaffInvitationStatus[] =
	['pending', 'accepted', 'expired', 'revoked'];

export type StaffInvitationStatusOption = {
	label: string;
	value: StaffInvitationStatus;
};

// Sentinel used for backend status values that don't match the known set, so
// the row can still render rather than being silently coerced to a known value.
export const STAFF_INVITATION_UNKNOWN_STATUS = 'unknown' as const;

export type StaffInvitationRowStatus =
	| StaffInvitationStatus
	| typeof STAFF_INVITATION_UNKNOWN_STATUS;

export const STAFF_INVITATION_STATUS_VALUE_SET = new Set<string>(
	STAFF_INVITATION_STATUS_VALUES,
);

export const parseStatusFilter = (value: string): StaffInvitationStatus[] => {
	if (!value) {
		return [];
	}

	const statuses: StaffInvitationStatus[] = [];

	for (const part of value.split(',')) {
		const status = part.trim();
		if (STAFF_INVITATION_STATUS_VALUE_SET.has(status)) {
			statuses.push(status as StaffInvitationStatus);
		}
	}

	return statuses;
};
