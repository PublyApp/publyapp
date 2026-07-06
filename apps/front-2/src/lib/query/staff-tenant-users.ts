import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	FindTenantUsersAsStaffResult,
	TenantUserItem,
} from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type StaffTenantUsersQueryVariables = {
	tenantId: string;
	q?: string;
	status?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffTenantUserRow = {
	id: string;
	firstName: string | null;
	lastName: string | null;
	email: string;
	level: string | null;
	status: string | null;
	avatarUrl: string | null;
	displayName: string;
};

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => normalizeString(value) ?? null;

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const getDisplayName = ({
	firstName,
	lastName,
	email,
}: Pick<StaffTenantUserRow, 'firstName' | 'lastName' | 'email'>): string => {
	const fullName = getUserFullName({ firstName, lastName });
	return fullName || email || '—';
};

export const buildFindStaffTenantUsersQueryParameters = (
	variables: Omit<StaffTenantUsersQueryVariables, 'tenantId'>,
): {
	q?: string;
	status?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
} => ({
	q: normalizeString(variables.q),
	status: normalizeString(variables.status),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const toStaffTenantUserRows = (
	items: TenantUserItem[] | null | undefined,
): StaffTenantUserRow[] => {
	const rows: StaffTenantUserRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id?.toString());
		if (!id) {
			continue;
		}

		const email = normalizeString(item.email) ?? '';
		const firstName = normalizeNullableString(item.firstName);
		const lastName = normalizeNullableString(item.lastName);

		rows.push({
			id,
			firstName,
			lastName,
			email,
			level: normalizeNullableString(item.level),
			status: normalizeNullableString(item.status),
			avatarUrl: normalizeNullableString(item.avatarUrl),
			displayName: getDisplayName({ firstName, lastName, email }),
		});
	}

	return rows;
};

const staffTenantUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantUsersAsStaffResult,
	StaffTenantUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-tenants', 'users'],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.get({
					queryParameters: buildFindStaffTenantUsersQueryParameters(variables),
				});

			if (!result) {
				throw new Error('staff tenant users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffTenantUsersQuery = (
	variables: StaffTenantUsersQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantUsersQueryOptions.queryKey(variables),
		queryFn: () => staffTenantUsersQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});
