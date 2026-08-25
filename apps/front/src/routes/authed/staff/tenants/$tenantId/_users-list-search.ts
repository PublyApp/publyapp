import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

import {
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
} from './_invite-user-search-state';

export const KNOWN_TENANT_USER_STATUSES = [
	'active',
	'suspended',
	'globally_suspended',
] as const;

export type KnownTenantUserStatus = (typeof KNOWN_TENANT_USER_STATUSES)[number];

const KNOWN_TENANT_USER_STATUS_SET = new Set<string>(
	KNOWN_TENANT_USER_STATUSES,
);

export const KNOWN_TENANT_USER_LEVELS = ['admin', 'user'] as const;

export type KnownTenantUserLevel = (typeof KNOWN_TENANT_USER_LEVELS)[number];

const KNOWN_TENANT_USER_LEVEL_SET = new Set<string>(KNOWN_TENANT_USER_LEVELS);

export type TenantUsersListSearchParams = TableSearchParams & {
	status?: string;
	level?: string;
} & InviteUserSearchState;

export type TenantUsersListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	level?: unknown;
} & InviteUserSearchStateInput;

const normalizeString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const parseCsvFilter = <TValue extends string>(
	value: unknown,
	allowed: Set<string>,
): TValue[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<TValue>();
	const values: TValue[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!allowed.has(candidate)) {
			continue;
		}

		const parsed = candidate as TValue;
		if (seen.has(parsed)) {
			continue;
		}

		seen.add(parsed);
		values.push(parsed);
	}

	return values;
};

export const parseTenantUserStatusFilter = (
	value: unknown,
): KnownTenantUserStatus[] =>
	parseCsvFilter<KnownTenantUserStatus>(value, KNOWN_TENANT_USER_STATUS_SET);

export const serializeTenantUserStatusFilter = (
	statuses: KnownTenantUserStatus[],
): string | undefined => (statuses.length > 0 ? statuses.join(',') : undefined);

export const parseTenantUserLevelFilter = (
	value: unknown,
): KnownTenantUserLevel[] =>
	parseCsvFilter<KnownTenantUserLevel>(value, KNOWN_TENANT_USER_LEVEL_SET);

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

export type TenantUsersListWireParams = {
	status?: string;
	level?: string;
	invite?: 1;
} & TableSearchWireParams;

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
