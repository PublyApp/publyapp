import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

import {
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
} from './_invite-user-search-state';

type TableSearchParamInput = Parameters<typeof parseTableSearchParams>[0];

const KNOWN_TENANT_USER_STATUSES = [
	'active',
	'suspended',
	'globally_suspended',
] as const;

export type KnownTenantUserStatus = (typeof KNOWN_TENANT_USER_STATUSES)[number];

const KNOWN_TENANT_USER_STATUS_SET = new Set<string>(
	KNOWN_TENANT_USER_STATUSES,
);

const KNOWN_TENANT_USER_LEVELS = ['admin', 'user'] as const;

export type KnownTenantUserLevel = (typeof KNOWN_TENANT_USER_LEVELS)[number];

const KNOWN_TENANT_USER_LEVEL_SET = new Set<string>(KNOWN_TENANT_USER_LEVELS);

export type TenantUsersListSearchParams = TableSearchParams & {
	status?: string;
	level?: string;
} & InviteUserSearchState;

export type TenantUsersListWireParams = {
	status?: string;
	level?: string;
	invite?: 1;
} & TableSearchWireParams;

export type TenantUsersListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	level?: unknown;
} & InviteUserSearchStateInput;

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

export const parseTenantUserStatusFilter = (
	value: unknown,
): KnownTenantUserStatus[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownTenantUserStatus>();
	const statuses: KnownTenantUserStatus[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!KNOWN_TENANT_USER_STATUS_SET.has(candidate)) {
			continue;
		}

		const status = candidate as KnownTenantUserStatus;
		if (seen.has(status)) {
			continue;
		}

		seen.add(status);
		statuses.push(status);
	}

	return statuses;
};

export const serializeTenantUserStatusFilter = (
	statuses: KnownTenantUserStatus[],
): string | undefined => (statuses.length > 0 ? statuses.join(',') : undefined);

export const parseTenantUserLevelFilter = (
	value: unknown,
): KnownTenantUserLevel[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownTenantUserLevel>();
	const levels: KnownTenantUserLevel[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!KNOWN_TENANT_USER_LEVEL_SET.has(candidate)) {
			continue;
		}

		const level = candidate as KnownTenantUserLevel;
		if (seen.has(level)) {
			continue;
		}

		seen.add(level);
		levels.push(level);
	}

	return levels;
};

export const serializeTenantUserLevelFilter = (
	levels: KnownTenantUserLevel[],
): string | undefined => (levels.length > 0 ? levels.join(',') : undefined);

export const parseTenantUsersListSearchParams = (
	search: TenantUsersListSearchParamInput,
): TenantUsersListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = serializeTenantUserStatusFilter(
		parseTenantUserStatusFilter(search.status),
	);
	const level = serializeTenantUserLevelFilter(
		parseTenantUserLevelFilter(search.level),
	);
	const invite = parseInviteUserSearchParams(search);

	return {
		...base,
		status,
		level,
		...invite,
	};
};

export const serializeTenantUsersListSearchParams = (
	params: TenantUsersListSearchParams,
): TenantUsersListWireParams => {
	const next = serializeTableSearchParams(params);
	const status = serializeTenantUserStatusFilter(
		parseTenantUserStatusFilter(params.status),
	);
	const level = serializeTenantUserLevelFilter(
		parseTenantUserLevelFilter(params.level),
	);
	const invite = serializeInviteUserSearchParams(params);

	return {
		...next,
		status: status || undefined,
		level: level || undefined,
		invite: invite.invite,
	};
};
