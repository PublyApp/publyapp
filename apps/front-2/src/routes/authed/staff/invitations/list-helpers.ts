import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
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

export type InvitationListSearchParams = TableSearchParams & {
	status?: string;
};

export type InvitationListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
};

export type InvitationSearchableRow = {
	email: string;
	profileName?: string | null;
	invitedByName?: string | null;
	status?: string | null;
};

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
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
	return normalized && KNOWN_INVITATION_STATUS_SET.has(normalized)
		? (normalized as KnownInvitationStatus)
		: 'unknown';
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
	return statuses.length > 0 ? statuses.join(',') : undefined;
};

export const parseInvitationListSearchParams = (
	search: InvitationListSearchParamInput,
): InvitationListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = serializeInvitationStatusFilter(
		parseInvitationStatusFilter(search.status),
	);

	return status ? { ...base, status } : base;
};

export const serializeInvitationListSearchParams = (
	params: InvitationListSearchParams,
): Record<string, string | undefined> => {
	const next = serializeTableSearchParams(params);
	const status = serializeInvitationStatusFilter(
		parseInvitationStatusFilter(params.status),
	);

	return status ? { ...next, status } : next;
};

export const formatInvitationStatusLabel = (
	status: InvitationDisplayStatus,
): string => {
	if (status === 'unknown') {
		return 'Unknown';
	}

	return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
};

export const filterInvitationRows = <TRow extends InvitationSearchableRow>(
	rows: TRow[],
	query: string | undefined,
): TRow[] => {
	const normalized = query?.trim().toLowerCase() ?? '';
	if (normalized.length === 0) {
		return rows;
	}

	return rows.filter((row) => {
		return [row.email, row.profileName, row.invitedByName, row.status].some(
			(value) => value?.toLowerCase().includes(normalized),
		);
	});
};
