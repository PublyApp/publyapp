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

export const parseStatusFilter = (value: string): StaffInvitationStatus[] => {
	if (!value) {
		return [];
	}

	const valid = new Set<string>(STAFF_INVITATION_STATUS_VALUES);
	const statuses: StaffInvitationStatus[] = [];

	for (const part of value.split(',')) {
		const status = part.trim();
		if (valid.has(status)) {
			statuses.push(status as StaffInvitationStatus);
		}
	}

	return statuses;
};
