import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getClientManager } from '~/lib/api-client/client-manager';
import type { SortOrder } from '~/lib/url-state/table-search-params';

import type { ApiClient } from '@org/client-ts/src/apiClient';
import type {
	CreateStaffProfileBody,
	FindStaffProfilesResult,
	StaffProfileItem,
	StaffProfileCreated,
} from '@org/client-ts/src/models/index.js';
import type { StaffGetResponse } from '@org/client-ts/src/staff/permissions/scopes/staff/index.js';
import {
	buildStaffMutationOptions,
	buildStaffQueryOptions,
} from '@org/shared-ts/lib/query/create-hooks';

export type StaffProfilesQueryVariables = {
	q?: string;
	sortId?: string;
	sortOrder?: SortOrder;
	cursor?: string;
	limit?: number;
};

export type CreateStaffProfileInput = {
	name: string;
	description?: string;
	permissions: string[];
	emails?: string[];
};

export type StaffPermissionCatalogQueryVariables = {
	language?: string;
};

export type StaffPermissionCatalogEntry = {
	key?: string | null;
	name?: string | null;
	description?: string | null;
};

export type StaffPermissionCatalog = Record<
	string,
	Record<string, StaffPermissionCatalogEntry>
>;

export type StaffProfileRow = {
	id: string;
	name: string;
	description: string | null;
	userAccountCount: number;
};

export const STAFF_PROFILES_QUERY_KEY = ['staff', 'staff-profiles'] as const;

const normalizeString = (value: string | undefined): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

export const toStaffProfileRows = (
	items: StaffProfileItem[] | null | undefined,
): StaffProfileRow[] => {
	const list = items ?? [];
	const rows: StaffProfileRow[] = [];

	for (const item of list) {
		if (typeof item.id !== 'string' || item.id.length === 0) {
			continue;
		}

		rows.push({
			id: item.id,
			name: item.name?.trim() || '—',
			description: item.description ?? null,
			userAccountCount: item.userAccountCount ?? 0,
		});
	}

	return rows;
};

export const buildCreateStaffProfileBody = (
	input: CreateStaffProfileInput,
): CreateStaffProfileBody => {
	const body: CreateStaffProfileBody = {};
	const description = normalizeString(input.description);
	const permissions = input.permissions.filter(
		(permission) => permission.length > 0,
	);
	const emails =
		input.emails?.filter((email) => normalizeString(email) !== undefined) ?? [];

	body.name = createUntypedString(input.name) as typeof body.name;

	if (description) {
		body.description = createUntypedString(
			description,
		) as typeof body.description;
	}

	if (permissions.length > 0) {
		body.permissions = createUntypedArray(
			permissions.map((permission) => createUntypedString(permission)),
		) as typeof body.permissions;
	}

	if (emails.length > 0) {
		body.emails = createUntypedArray(
			emails.map((email) => createUntypedString(email)),
		) as typeof body.emails;
	}

	return body;
};

const staffProfilesQueryOptions = buildStaffQueryOptions<
	ApiClient,
	FindStaffProfilesResult,
	StaffProfilesQueryVariables
>(
	{
		queryKeyFn: () => ['staff-profiles'],
		fetcher: async (client, vars) => {
			const result = await client.staff.profiles.get({
				queryParameters: {
					q: vars.q,
					sortId: vars.sortId,
					sortOrder: vars.sortOrder,
					cursor: vars.cursor,
					limit: vars.limit === undefined ? undefined : String(vars.limit),
				},
			});

			if (!result) {
				throw new Error('staff profiles result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

const createStaffProfileMutationOptions = buildStaffMutationOptions<
	ApiClient,
	StaffProfileCreated | undefined,
	CreateStaffProfileInput
>(
	{
		mutationKeyFn: () => ['staff-profiles', 'create'],
		mutationFn: (client, variables) =>
			client.staff.profiles.post(buildCreateStaffProfileBody(variables)),
	},
	{ clientAccessor: getClientManager() },
);

const staffPermissionCatalogQueryOptions = buildStaffQueryOptions<
	ApiClient,
	StaffGetResponse,
	StaffPermissionCatalogQueryVariables
>(
	{
		queryKeyFn: () => ['staff-permissions', 'catalog'],
		fetcher: async (client, variables) => {
			const result = await client.staff.permissions.scopes.staff.get({
				queryParameters: {
					language: variables.language,
				},
			});

			if (!result) {
				throw new Error('staff permission catalog result was empty');
			}

			return result;
		},
	},
	{ clientAccessor: getClientManager() },
);

export const useStaffProfilesQuery = (variables: StaffProfilesQueryVariables) =>
	useQuery({
		queryKey: staffProfilesQueryOptions.queryKey(variables),
		queryFn: () => staffProfilesQueryOptions.fetcher(variables),
	});

export const useCreateStaffProfileMutation = () =>
	useMutation(createStaffProfileMutationOptions);

export const useStaffPermissionCatalogQuery = (
	variables: StaffPermissionCatalogQueryVariables,
) =>
	useQuery({
		queryKey: staffPermissionCatalogQueryOptions.queryKey(variables),
		queryFn: () => staffPermissionCatalogQueryOptions.fetcher(variables),
	});
