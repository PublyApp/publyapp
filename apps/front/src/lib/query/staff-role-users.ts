import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import { normalizeNullableFileUrl } from '~/lib/api-client/resolve-api-file-url';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	BulkStaffRoleUserUnassignActionResult,
	FindStaffRoleUsersResult,
	UserStatus,
	StaffRoleUserItem,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffRoleUsersQueryVariables = {
	roleId: string;
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	pageIndex?: number;
	size?: number;
};

export type StaffRoleUserRow = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	status: UserStatus | null;
};

const normalizeString = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

const normalizeNullableString = (
	value: string | null | undefined,
): string | null => {
	return normalizeString(value) ?? null;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const normalizePageIndex = (value: number | undefined): number => {
	if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
		return value;
	}
	return 0;
};

export const toStaffRoleUserRows = (
	items: StaffRoleUserItem[] | null | undefined,
): StaffRoleUserRow[] => {
	const rows: StaffRoleUserRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id ?? undefined);
		if (!id) {
			continue;
		}

		rows.push({
			id,
			email: normalizeString(item.email) ?? '',
			firstName: normalizeNullableString(item.firstName),
			lastName: normalizeNullableString(item.lastName),
			avatarUrl: normalizeNullableFileUrl(item.avatarUrl),
			status: item.status ?? null,
		});
	}

	return rows;
};

export const buildStaffRoleUsersRequestQuery = (
	variables: Omit<StaffRoleUsersQueryVariables, 'roleId'>,
) => {
	return {
		q: normalizeString(variables.q),
		sortId: normalizeString(variables.sortId),
		sortOrder: variables.sortOrder,
		page: String(normalizePageIndex(variables.pageIndex) + 1),
		limit: isPositiveSafeInteger(variables.size)
			? String(variables.size)
			: undefined,
	};
};

export const staffRoleUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffRoleUsersResult,
	StaffRoleUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-roles', 'users'],
		fetcher: async (client, variables) => {
			const result = await client.staff.roles
				.byRoleId(variables.roleId)
				.users.get({
					queryParameters: buildStaffRoleUsersRequestQuery(variables),
				});

			if (!result) {
				throw new Error('staff role users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffRoleUsersQuery = (
	variables: StaffRoleUsersQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffRoleUsersQueryOptions.queryKey(variables),
		queryFn: () => staffRoleUsersQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

// Invalidates the nested role-users list family (['staff', 'staff-roles',
// 'users', …]) — the unassign mutation changes which rows appear in this list,
// so it MUST cover the list family (and, through the same prefix, the nested
// row's line). This is the "Mutation Invalidation Coherence" (#359) requirement
// for a list-membership mutation; see the guard test for the coverage proof.
export const invalidateStaffRoleUsers = (queryClient: QueryClient) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', ['staff-roles', 'users']),
	});

export type BulkUnassignStaffRoleUsersInput = {
	roleId: string;
	userIds: string[];
};

const bulkUnassignStaffRoleUsersMutationOptions = buildStaffMutationOptions<
	ApiClient,
	BulkStaffRoleUserUnassignActionResult | undefined,
	BulkUnassignStaffRoleUsersInput
>(
	{
		mutationKeyFn: () => ['staff-roles', 'bulk-unassign-users'],
		mutationFn: (client, variables) =>
			client.staff.roles.byRoleId(variables.roleId).users.unassign.post({
				userIds: createUntypedArray(
					variables.userIds.map((id) => createUntypedString(id)),
				),
			}),
		meta: { silentSuccess: true, skipGlobalErrorHandler: true },
	},
	{ clientAccessor: getClientManager() },
);

export const useBulkUnassignStaffRoleUsersMutation = () => {
	const queryClient = useQueryClient();

	return useMutation({
		...bulkUnassignStaffRoleUsersMutationOptions,
		onSuccess: () => {
			void invalidateStaffRoleUsers(queryClient);
		},
	});
};
