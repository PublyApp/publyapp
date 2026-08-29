import type { QueryClient } from '@tanstack/react-query';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/apiClient';
import type {
	AccountLevel,
	ApiResponse,
	FindInvitationsForTenantAsStaffResult,
	InvitationEffectiveStatus,
	StaffTenantInvitationListItem,
} from '@org/client-ts/models/index';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
	scopedKey,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffTenantInvitationsQueryVariables = {
	tenantId: string;
	q?: string;
	status?: string;
	level?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	size?: number;
};

export type StaffTenantInvitationRow = {
	id: string;
	email: string;
	status: InvitationEffectiveStatus | null;
	scope: string | null;
	profileName: string | null;
	profiles: Array<{ id: string; name: string }>;
	accountLevel: AccountLevel | null;
	invitedByName: string;
	acceptedAt: Date | null;
	createdAt: Date | null;
	expiresAt: Date | null;
};

export type StaffTenantInvitationActionVariables = {
	tenantId: string;
	invitationId: string;
};

/** @internal Unscoped — `scopedKey('staff', …)` is the only way to build an
 * invalidation key from this; use `invalidateStaffTenantInvitations`. */
export const STAFF_TENANT_INVITATIONS_QUERY_KEY = [
	'staff-tenants',
	'invitations',
] as const;

export const invalidateStaffTenantInvitations = (
	queryClient: Pick<QueryClient, 'invalidateQueries'>,
) =>
	queryClient.invalidateQueries({
		queryKey: scopedKey('staff', STAFF_TENANT_INVITATIONS_QUERY_KEY),
	});

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
): string | null => normalizeString(value) ?? null;

const normalizeStatusToken = (
	value: string | null | undefined,
): string | undefined => {
	const normalized = normalizeString(value);
	return normalized?.toLowerCase();
};

const normalizeProfiles = (
	profiles: StaffTenantInvitationListItem['profiles'],
): Array<{ id: string; name: string }> => {
	const normalizedProfiles: Array<{ id: string; name: string }> = [];
	const seenIds = new Set<string>();

	for (const profile of profiles ?? []) {
		const id = normalizeString(profile.id?.toString());
		const name = normalizeString(profile.name);
		if (!id || !name || seenIds.has(id)) {
			continue;
		}

		normalizedProfiles.push({ id, name });
		seenIds.add(id);
	}

	return normalizedProfiles;
};

const isPositiveSafeInteger = (value: number | undefined): value is number =>
	typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export const buildFindStaffTenantInvitationsQueryParameters = (
	variables: Omit<StaffTenantInvitationsQueryVariables, 'tenantId'>,
) => ({
	q: normalizeString(variables.q),
	status: normalizeString(variables.status),
	level: normalizeString(variables.level),
	sortId: normalizeString(variables.sortId),
	sortOrder: variables.sortOrder,
	cursor: normalizeString(variables.cursor),
	limit: isPositiveSafeInteger(variables.size)
		? String(variables.size)
		: undefined,
});

export const toStaffTenantInvitationRows = (
	items: StaffTenantInvitationListItem[] | null | undefined,
): StaffTenantInvitationRow[] => {
	const rows: StaffTenantInvitationRow[] = [];

	for (const item of items ?? []) {
		// Required identities a staff admin reads as real data — a malformed
		// or forward-incompatible payload missing one is dropped rather than
		// shown with a `'—'` placeholder a staff admin can't distinguish from
		// a legitimate value (shell-r5-F3).
		const id = normalizeString(item.id?.toString());
		const email = normalizeString(item.email);
		const profileName = normalizeNullableString(item.profileName);
		const accountLevel = item.accountLevel ?? null;
		const invitedByName = normalizeString(item.invitedByName);
		if (!id || !email || !invitedByName) {
			continue;
		}

		rows.push({
			id,
			email,
			status: item.status ?? null,
			scope: normalizeNullableString(item.scope),
			profileName,
			profiles: normalizeProfiles(item.profiles),
			accountLevel: accountLevel ?? null,
			invitedByName,
			acceptedAt: item.acceptedAt ?? null,
			createdAt: item.createdAt ?? null,
			expiresAt: item.expiresAt ?? null,
		});
	}

	return rows;
};

export const isStaffTenantInvitationRevocable = ({
	status,
}: Pick<StaffTenantInvitationRow, 'status'>): boolean =>
	normalizeStatusToken(status) === 'pending';

const staffTenantInvitationsQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindInvitationsForTenantAsStaffResult,
	StaffTenantInvitationsQueryVariables
>(
	{
		queryKeyFn: () => [...STAFF_TENANT_INVITATIONS_QUERY_KEY],
		fetcher: async (client, variables) => {
			const result = await client.staff.tenants
				.byTenantId(variables.tenantId)
				.invitations.get({
					queryParameters:
						buildFindStaffTenantInvitationsQueryParameters(variables),
				});

			if (!result) {
				throw new Error('staff tenant invitations result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const revokeStaffTenantInvitationMutationOptions = buildStaffMutationOptions<
	ApiClient,
	ApiResponse | undefined,
	StaffTenantInvitationActionVariables
>(
	{
		mutationKeyFn: () => ['staff-tenants', 'invitations', 'revoke'],
		mutationFn: (client, variables) =>
			client.staff.tenants
				.byTenantId(variables.tenantId)
				.invitations.byInvitationId(variables.invitationId)
				.delete(),
		meta: { successMessage: 'revoke-invitation-success' },
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffTenantInvitationsQuery = (
	variables: StaffTenantInvitationsQueryVariables,
	options?: {
		enabled?: boolean;
	},
) =>
	useQuery({
		queryKey: staffTenantInvitationsQueryOptions.queryKey(variables),
		queryFn: () => staffTenantInvitationsQueryOptions.fetcher(variables),
		enabled: options?.enabled ?? true,
	});

export const useRevokeStaffTenantInvitationMutation = () =>
	useMutation(revokeStaffTenantInvitationMutationOptions);
