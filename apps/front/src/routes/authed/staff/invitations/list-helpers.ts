import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

export const KNOWN_INVITATION_STATUSES = [
	'pending',
	'accepted',
	'expired',
	'revoked',
] as const;

export type KnownInvitationStatus = (typeof KNOWN_INVITATION_STATUSES)[number];
export type InvitationDisplayStatus = KnownInvitationStatus | 'unknown';

const KNOWN_INVITATION_STATUS_SET = new Set<string>(KNOWN_INVITATION_STATUSES);

const KNOWN_INVITATION_ACCOUNT_LEVELS = ['admin', 'user'] as const;

export type KnownInvitationAccountLevel =
	(typeof KNOWN_INVITATION_ACCOUNT_LEVELS)[number];

const KNOWN_INVITATION_ACCOUNT_LEVEL_SET = new Set<string>(
	KNOWN_INVITATION_ACCOUNT_LEVELS,
);

export type InvitationListSearchParams = TableSearchParams & {
	status?: string;
};

export type InvitationListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
};

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const toSnakeLower = (value: string): string => {
	return value
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[\s-]+/g, '_')
		.toLowerCase();
};

export const normalizeInvitationStatus = (
	value: string | null | undefined,
): InvitationDisplayStatus => {
	const normalized = value ? toSnakeLower(value) : undefined;
	if (normalized && KNOWN_INVITATION_STATUS_SET.has(normalized)) {
		return normalized as KnownInvitationStatus;
	}
	return 'unknown';
};

export const parseInvitationStatusFilter = (
	value: unknown,
): KnownInvitationStatus[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownInvitationStatus>();
	const statuses: KnownInvitationStatus[] = [];

	for (const part of normalized.split(',')) {
		const candidate = toSnakeLower(part.trim());
		if (!KNOWN_INVITATION_STATUS_SET.has(candidate)) {
			continue;
		}

		const status = candidate as KnownInvitationStatus;
		if (seen.has(status)) {
			continue;
		}

		seen.add(status);
		statuses.push(status);
	}

	return statuses;
};

export const serializeInvitationStatusFilter = (
	statuses: KnownInvitationStatus[],
): string | undefined => {
	if (statuses.length > 0) {
		return statuses.join(',');
	}
	return undefined;
};

export const parseInvitationAccountLevelFilter = (
	value: unknown,
): KnownInvitationAccountLevel[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownInvitationAccountLevel>();
	const levels: KnownInvitationAccountLevel[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!KNOWN_INVITATION_ACCOUNT_LEVEL_SET.has(candidate)) {
			continue;
		}

		const level = candidate as KnownInvitationAccountLevel;
		if (seen.has(level)) {
			continue;
		}

		seen.add(level);
		levels.push(level);
	}

	return levels;
};

export const serializeInvitationAccountLevelFilter = (
	levels: KnownInvitationAccountLevel[],
): string | undefined => (levels.length > 0 ? levels.join(',') : undefined);

export const parseInvitationListSearchParams = (
	search: InvitationListSearchParamInput,
): InvitationListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = serializeInvitationStatusFilter(
		parseInvitationStatusFilter(search.status),
	);

	return { ...base, status: status || undefined };
};

export type InvitationListWireParams = {
	status?: string;
} & TableSearchWireParams;

export const serializeInvitationListSearchParams = (
	params: InvitationListSearchParams,
): InvitationListWireParams => {
	const next = serializeTableSearchParams(params);
	const status = serializeInvitationStatusFilter(
		parseInvitationStatusFilter(params.status),
	);

	return { ...next, status: status || undefined };
};

const INVITATION_STATUS_LABEL_KEYS = {
	pending: 'staff-invitations:invitation-status-pending',
	accepted: 'staff-invitations:invitation-status-accepted',
	expired: 'staff-invitations:invitation-status-expired',
	revoked: 'staff-invitations:invitation-status-revoked',
	unknown: 'unknown',
} satisfies Record<InvitationDisplayStatus, string>;

/** Translation key for an invitation status, for callers that render through
 * `t()` instead of the untranslated `formatInvitationStatusLabel`. */
export const getInvitationStatusLabelKey = (
	status: InvitationDisplayStatus,
): string => INVITATION_STATUS_LABEL_KEYS[status];
