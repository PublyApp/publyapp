import { createUntypedString } from '@microsoft/kiota-abstractions';
import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import {
	normalizeNullableFileUrl,
	toRootRelativeApiFileUrl,
} from '~/lib/api-client/resolve-api-file-url';
import { normalizeString } from '~/lib/normalize-string';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	AccountProfileResult,
	UpdateAccountProfileBody,
} from '@org/client-ts/models/index';
import { buildTenantQueryOptions } from '@org/shared-ts/lib/query/create-hooks';
import { getUserFullName } from '@org/shared-ts/utils/user.utils';

export type TenantAccountProfile = {
	id: string;
	email: string;
	firstName: string | null;
	lastName: string | null;
	avatarUrl: string | null;
	displayName: string | null;
};

export type AccountProfileUpdateInput = {
	tenantId: string;
	firstName?: string | null;
	lastName?: string | null;
	avatarUrl?: string | null;
};

/** @internal Unscoped — the tenant id is appended by the hooks below. */
const ACCOUNT_PROFILE_QUERY_KEY = ['account-profile'] as const;

/**
 * The signed-in user's tenant-scoped profile. One factory, consumed by the
 * page hook AND the route preload (single shared fetch path, #487 §1.2).
 */
export const tenantAccountProfileQueryOptions = buildTenantQueryOptions<
	ApiClient,
	AccountProfileResult,
	{ tenantId: string }
>(
	{
		queryKeyFn: () => [...ACCOUNT_PROFILE_QUERY_KEY],
		fetcher: async (client) => {
			const result = await client.account.profile.get();

			if (!result) {
				throw new Error('tenant account profile result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const toAccountProfile = (
	result: AccountProfileResult | null | undefined,
): TenantAccountProfile | null => {
	const id = normalizeString(result?.id?.toString() ?? undefined);
	if (!id) {
		return null;
	}

	const firstName = normalizeString(result?.firstName);
	const lastName = normalizeString(result?.lastName);

	return {
		id,
		email: normalizeString(result?.email) ?? '',
		firstName,
		lastName,
		avatarUrl: normalizeNullableFileUrl(result?.avatarUrl),
		displayName: getUserFullName({ firstName, lastName }) || null,
	};
};

const updateAccountProfile = async (
	input: AccountProfileUpdateInput,
): Promise<AccountProfileResult> => {
	const client = getClientManager().getOrCreateClient(input.tenantId);
	const result = await client.account.profile.patch(
		buildUpdateAccountProfileBody(input),
	);

	if (!result) {
		throw new Error('updated tenant account profile result was empty');
	}

	return result;
};

const normalizeUpdateStringField = (
	value: string | null | undefined,
): string | null | undefined => {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return null;
};

export const buildUpdateAccountProfileBody = (
	input: AccountProfileUpdateInput,
): UpdateAccountProfileBody => {
	const body: UpdateAccountProfileBody = {};
	const firstName = normalizeUpdateStringField(input.firstName);
	const lastName = normalizeUpdateStringField(input.lastName);
	const avatarUrl = normalizeUpdateStringField(input.avatarUrl);

	if (firstName !== undefined) {
		body.firstName = firstName === null ? null : createUntypedString(firstName);
	}

	if (lastName !== undefined) {
		body.lastName = lastName === null ? null : createUntypedString(lastName);
	}

	if (avatarUrl !== undefined) {
		body.avatarUrl =
			avatarUrl === null
				? null
				: createUntypedString(toRootRelativeApiFileUrl(avatarUrl));
	}

	return body;
};

/**
 * The signed-in user's tenant-scoped profile. `tenantId` comes from the
 * resolved workspace tenant (see `useResolvedWorkspaceTenantId`); the hook is
 * disabled until a tenant is actually resolved.
 */
export const useAccountProfileQuery = (tenantId: string | null) =>
	useQuery({
		queryKey: tenantAccountProfileQueryOptions.queryKey({
			tenantId: tenantId ?? '',
		}),
		queryFn: () =>
			tenantAccountProfileQueryOptions.fetcher({ tenantId: tenantId ?? '' }),
		enabled: tenantId !== null,
	});

export const useUpdateAccountProfileMutation = () => {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: ['tenant', ...ACCOUNT_PROFILE_QUERY_KEY, 'update'],
		mutationFn: updateAccountProfile,
		onSuccess: (_data, variables) => {
			void queryClient.invalidateQueries({
				queryKey: ['tenant', ...ACCOUNT_PROFILE_QUERY_KEY, variables.tenantId],
			});
		},
	});
};

export const invalidateAccountProfileQuery = async (
	queryClient: QueryClient,
	tenantId: string,
): Promise<void> => {
	await queryClient.invalidateQueries({
		queryKey: ['tenant', ...ACCOUNT_PROFILE_QUERY_KEY, tenantId],
	});
};
