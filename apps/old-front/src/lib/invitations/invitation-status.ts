import snakeCase from 'lodash/snakeCase';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

export const INVITATION_STATUS_PENDING = 'pending' as const;
export const INVITATION_STATUS_ACCEPTED = 'accepted' as const;
export const INVITATION_STATUS_EXPIRED = 'expired' as const;
export const INVITATION_STATUS_REVOKED = 'revoked' as const;

// Sentinel used for backend status values that don't match the known set, so
// the row can still render rather than being silently coerced to a known value.
// Intentionally NOT included in filter values.
export const INVITATION_STATUS_UNKNOWN = 'unknown' as const;

export type KnownInvitationStatus =
	| typeof INVITATION_STATUS_PENDING
	| typeof INVITATION_STATUS_ACCEPTED
	| typeof INVITATION_STATUS_EXPIRED
	| typeof INVITATION_STATUS_REVOKED;

export type InvitationStatus =
	| KnownInvitationStatus
	| typeof INVITATION_STATUS_UNKNOWN;

export const INVITATION_STATUS_VALUES: readonly KnownInvitationStatus[] = [
	INVITATION_STATUS_PENDING,
	INVITATION_STATUS_ACCEPTED,
	INVITATION_STATUS_EXPIRED,
	INVITATION_STATUS_REVOKED,
];

export type InvitationStatusOption = {
	label: string;
	value: KnownInvitationStatus;
};

export const INVITATION_STATUS_VALUE_SET = new Set<string>(
	INVITATION_STATUS_VALUES,
);

type InvitationStatusSource = {
	id?: string | null;
	status?: string | null;
};

export const parseStatusFilter = (value: string): KnownInvitationStatus[] => {
	if (!value) {
		return [];
	}

	const statuses: KnownInvitationStatus[] = [];

	for (const part of value.split(',')) {
		const status = part.trim();
		if (INVITATION_STATUS_VALUE_SET.has(status)) {
			statuses.push(status as KnownInvitationStatus);
		}
	}

	return statuses;
};

export const getInvitationStatus = (
	invitation: InvitationStatusSource,
	logSource: string,
): InvitationStatus => {
	const status = invitation.status ? snakeCase(invitation.status) : undefined;
	if (status && INVITATION_STATUS_VALUE_SET.has(status)) {
		return status as KnownInvitationStatus;
	}

	logger.warn(`[${logSource}] unknown invitation status`, {
		invitationId: invitation.id,
		rawStatus: invitation.status,
	});
	return INVITATION_STATUS_UNKNOWN;
};
