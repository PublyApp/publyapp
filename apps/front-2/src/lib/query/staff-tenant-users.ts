import { createUntypedString } from '@microsoft/kiota-abstractions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	CreateInvitationForTenantAsStaffBody,
	FindTenantUsersAsStaffResult,
	InvitationCreatedForTenant,
	TenantUserDetailsResult,
	TenantUserItem,
} from '@org/client-ts/src/models/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
} from '@org/shared-ts/lib/query/create-hooks';
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

export type StaffTenantUserInvitationInput = {
	tenantId: string;
	email: string;
	accountLevel: 'Admin' | 'User';
};

type StaffTenantUserInvitationBodyInput = Omit<
	StaffTenantUserInvitationInput,
	'tenantId' | 'accountLevel'
> & {
	accountLevel?: string;
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

export type StaffTenantUserDetailsQueryVariables = {
	tenantId: string;
	userId: string;
};

export type StaffTenantUserDetails = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	accountLevel: string | null;
	status: string | null;
	avatarUrl: string | null;
	tenantId: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	displayName: string;
};

export const STAFF_TENANT_USERS_QUERY_KEY = ['staff-tenants', 'users'] as const;

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

export const buildCreateStaffTenantUserInvitationBody = (
	input: StaffTenantUserInvitationBodyInput,
): CreateInvitationForTenantAsStaffBody => {
	const body: CreateInvitationForTenantAsStaffBody = {};
	const email = normalizeString(input.email);
	const accountLevel = normalizeString(input.accountLevel);

	if (email) {
		body.email = createUntypedString(email) as typeof body.email;
	}

	if (accountLevel) {
		body.accountLevel = createUntypedString(
			accountLevel,
		) as typeof body.accountLevel;
	}

	return body;
};

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

export const toStaffTenantUserDetails = (
	result: TenantUserDetailsResult | null | undefined,
): StaffTenantUserDetails | null => {
	const id = normalizeString(result?.id?.toString());
	if (!id) {
		return null;
	}

	const email = normalizeString(result?.email);

	return {
		id,
		email: email ?? '',
		firstName: normalizeNullableString(result?.firstName),
		lastName: normalizeNullableString(result?.lastName),
		accountLevel: normalizeNullableString(result?.level),
		status: normalizeNullableString(result?.status),
		avatarUrl: normalizeNullableString(result?.avatarUrl),
		tenantId: normalizeNullableString(result?.tenantId?.toString()),
		createdAt: normalizeDate(result?.createdAt),
		updatedAt: normalizeDate(result?.updatedAt),
		displayName: getDisplayName({
			firstName: normalizeNullableString(result?.firstName),
			lastName: normalizeNullableString(result?.lastName),
			email: email ?? '',
		}),
	};
};

const staffTenantUsersQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindTenantUsersAsStaffResult,
	StaffTenantUsersQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_USERS_QUERY_KEY],
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

const createStaffTenantUserInvitationMutationOptions =
	buildStaffMutationOptions<
		ApiClient,
		InvitationCreatedForTenant | undefined,
		StaffTenantUserInvitationInput
	>(
		{
			mutationKeyFn: () => ['staff-tenants', 'users', 'invitations'],
			mutationFn: (client, variables) =>
				client.staff.tenants
					.byTenantId(variables.tenantId)
					.users.invitations.post(
						buildCreateStaffTenantUserInvitationBody({
							email: variables.email,
							accountLevel: variables.accountLevel,
						}),
					),
		},
		{ clientAccessor: getClientManager() },
	);

const staffTenantUserDetailsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	TenantUserDetailsResult,
	StaffTenantUserDetailsQueryVariables
>(
	{
		queryKeyFn: () => ['staff-tenants', 'users', 'detail'],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.users.byUserId(variables.userId)
				.get();

			if (!result) {
				throw new Error('staff tenant user details result was empty');
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

export const useStaffTenantUserDetailsQuery = (
	variables: StaffTenantUserDetailsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantUserDetailsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantUserDetailsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useInviteTenantUserMutation = () =>
	useMutation(createStaffTenantUserInvitationMutationOptions);
