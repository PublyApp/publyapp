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

const STAFF_INVITATION_STATUS_VALUE_SET = new Set<string>(
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
