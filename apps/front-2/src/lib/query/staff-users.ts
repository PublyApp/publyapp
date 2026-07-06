import { useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	FindStaffUsersResponse,
	GetStaffUserByIdResult,
	GetStaffUserProfilesResult,
	StaffUserItem,
} from '@org/client-ts/src/models/index.js';
import { buildStaffQueryOptions } from '@org/shared-ts/lib/query/create-hooks';

export type StaffUsersQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffUserDetailsQueryVariables = {
	userId: string;
};

export type StaffUserProfilesQueryVariables = {
	userId: string;
};

export type StaffUserRow = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	level: string | null;
	status: string | null;
	displayName: string;
};

export type AssignedStaffProfile = {
	id: string;
	name: string;
	description: string | null;
};

export type StaffUserDetails = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	accountLevel: string | null;
	status: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
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

const normalizeDate = (value: Date | null | undefined): Date | null => {
	if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
		return null;
	}

	return value;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const getDisplayName = ({
	firstName,
	lastName,
	email,
}: {
	firstName: string | null;
	lastName: string | null;
	email: string;
}): string => {
	const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
	return fullName || email || '—';
};

export const buildFindStaffUsersQueryParameters = (
	variables: StaffUsersQueryVariables,
): {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: string;
} => {
	return {
		q: normalizeString(variables.q),
		sortId: normalizeString(variables.sortId),
		sortOrder: variables.sortOrder,
		cursor: normalizeString(variables.cursor),
		limit: isPositiveSafeInteger(variables.size)
			? String(variables.size)
			: undefined,
	};
};

export const toStaffUserRows = (
	items: StaffUserItem[] | null | undefined,
): StaffUserRow[] => {
	const rows: StaffUserRow[] = [];

	for (const item of items ?? []) {
		const id = normalizeString(item.id ?? undefined);
		if (!id) {
			continue;
		}

		const email = normalizeString(item.email) ?? '';
		const firstName = normalizeNullableString(item.firstName);
		const lastName = normalizeNullableString(item.lastName);

		rows.push({
			id,
			email,
			firstName,
			lastName,
			level: normalizeNullableString(item.level),
			status: normalizeNullableString(item.status),
			displayName: getDisplayName({ firstName, lastName, email }),
		});
	}

	return rows;
};

export const toStaffUserDetails = (
	result: GetStaffUserByIdResult | null | undefined,
): StaffUserDetails | null => {
	const id = normalizeString(result?.id ?? undefined);
	if (!id) {
		return null;
	}

	const email = normalizeString(result?.email) ?? '';
	const firstName = normalizeNullableString(result?.firstName);
	const lastName = normalizeNullableString(result?.lastName);

	return {
		id,
		email,
		firstName,
		lastName,
		avatarUrl: normalizeNullableString(result?.avatarUrl),
		accountLevel: normalizeNullableString(result?.accountLevel),
		status: normalizeNullableString(result?.status),
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
		displayName: getDisplayName({ firstName, lastName, email }),
	};
};

export const toAssignedStaffProfiles = (
	result: GetStaffUserProfilesResult | null | undefined,
): AssignedStaffProfile[] => {
	const profiles: AssignedStaffProfile[] = [];

	for (const item of result?.assignedProfiles ?? []) {
		const id = normalizeString(
			typeof item.id === 'string' ? item.id : undefined,
		);

		if (!id) {
			continue;
		}

		profiles.push({
			id,
			name: normalizeString(item.name) ?? 'Unnamed profile',
			description: normalizeNullableString(item.description),
		});
	}

	return profiles;
};

const staffUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffUsersResponse,
	StaffUsersQueryVariables
>(
	{
		queryKeyFn: () => ['staff-users'],
		fetcher: async (client, vars) => {
			const result = await client.staff.users.get({
				queryParameters: buildFindStaffUsersQueryParameters(vars),
			});

			if (!result) {
				throw new Error('staff users result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffUsersQuery = (variables: StaffUsersQueryVariables) =>
	useQuery({
		queryKey: staffUsersQueryOptions.queryKey(variables),
		queryFn: () => staffUsersQueryOptions.fetcher(variables),
	});

const staffUserDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetStaffUserByIdResult,
	StaffUserDetailsQueryVariables
>(
	{
		queryKeyFn: () => ['staff-users', 'detail'],
		fetcher: async (client, variables) => {
			const result = await client.staff.users.byUserId(variables.userId).get();

			if (!result) {
				throw new Error('staff user details result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffUserDetailsQuery = (
	variables: StaffUserDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffUserDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffUserDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

const staffUserProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	GetStaffUserProfilesResult,
	StaffUserProfilesQueryVariables
>(
	{
		queryKeyFn: () => ['staff-users', 'detail', 'profiles'],
		fetcher: async (client, variables) => {
			const result = await client.staff.users
				.byUserId(variables.userId)
				.profiles.get();

			if (!result) {
				throw new Error('staff user profiles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffUserProfilesQuery = (
	variables: StaffUserProfilesQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffUserProfilesQueryOptions.queryKey(variables),
		queryFn: () => staffUserProfilesQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});
