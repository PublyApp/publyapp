import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

import {
	parseInviteUserSearchParams,
	serializeInviteUserSearchParams,
	type InviteUserSearchState,
	type InviteUserSearchStateInput,
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

export const KNOWN_TENANT_USER_ROLES = ['full_access', 'standard'] as const;

export type KnownTenantUserRole = (typeof KNOWN_TENANT_USER_ROLES)[number];

const KNOWN_TENANT_USER_ROLE_SET = new Set<string>(KNOWN_TENANT_USER_ROLES);

export type TenantUsersListSearchParams = TableSearchParams & {
	status?: string;
	role?: string;
} & InviteUserSearchState;

export type TenantUsersListWireParams = {
	status?: string;
	role?: string;
	invite?: 1;
} & TableSearchWireParams;

export type TenantUsersListSearchParamInput = TableSearchParamInput & {
	status?: unknown;
	role?: unknown;
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

export const parseTenantUserRoleFilter = (
	value: unknown,
): KnownTenantUserRole[] => {
	const normalized = normalizeString(value);
	if (!normalized) {
		return [];
	}

	const seen = new Set<KnownTenantUserRole>();
	const roles: KnownTenantUserRole[] = [];

	for (const part of normalized.split(',')) {
		const candidate = part.trim().toLowerCase();
		if (!KNOWN_TENANT_USER_ROLE_SET.has(candidate)) {
			continue;
		}

		const role = candidate as KnownTenantUserRole;
		if (seen.has(role)) {
			continue;
		}

		seen.add(role);
		roles.push(role);
	}

	return roles;
};

export const serializeTenantUserRoleFilter = (
	roles: KnownTenantUserRole[],
): string | undefined => (roles.length > 0 ? roles.join(',') : undefined);

export const deriveTenantUserRoleKey = (
	isFullAccess: boolean,
): KnownTenantUserRole => (isFullAccess ? 'full_access' : 'standard');

export const parseTenantUsersListSearchParams = (
	search: TenantUsersListSearchParamInput,
): TenantUsersListSearchParams => {
	const base = parseTableSearchParams(search);
	const status = serializeTenantUserStatusFilter(
		parseTenantUserStatusFilter(search.status),
	);
	const role = serializeTenantUserRoleFilter(
		parseTenantUserRoleFilter(search.role),
	);
	const invite = parseInviteUserSearchParams(search);

	return {
		...base,
		status,
		role,
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
	const role = serializeTenantUserRoleFilter(
		parseTenantUserRoleFilter(params.role),
	);
	const invite = serializeInviteUserSearchParams(params);

	return {
		...next,
		status: status || undefined,
		role: role || undefined,
		invite: invite.invite,
	};
};
