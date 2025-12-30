import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import _ from 'lodash';
import { createMutation, createQuery } from 'react-query-kit';

import { clientManager } from '@/front/lib/js-client/client-manager';
import type { ApiClient } from '@/js-client/src/apiClient';
import type { CreateStaffProfileBody } from '@/js-client/src/models';

import { getQueryKey } from '../../query-utils';

type FindStaffProfilesParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

const findStaffProfilesQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.profiles.get,
);

export const useFindStaffProfiles = createQuery({
	queryKey: [findStaffProfilesQueryKey] as const,
	fetcher: async (params: FindStaffProfilesParams) => {
		const result = await clientManager.apiClient.staff.profiles.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});

		if (_.isNil(result)) {
			throw new Error(`[${findStaffProfilesQueryKey}] result is nil`);
		}

		return result;
	},
});

// Query: Fetch available staff permissions from API
const findStaffPermissionsQueryKey = getQueryKey<ApiClient>(
	(client) => client.staff.permissions.get,
);

type FindStaffPermissionsParams = {
	language?: string;
};

export const useFindStaffPermissions = createQuery({
	queryKey: [findStaffPermissionsQueryKey] as const,
	fetcher: async (params: FindStaffPermissionsParams) => {
		const result = await clientManager.apiClient.staff.permissions.get({
			queryParameters: {
				language: params.language,
			},
		});
		if (_.isNil(result)) {
			throw new Error(`[${findStaffPermissionsQueryKey}]: result is nil`);
		}
		return result;
	},
});

// Mutation: Create staff profile
const createStaffProfileMutationKey = getQueryKey<ApiClient>(
	(client) => client.staff.profiles.post,
);

type CreateStaffProfilePayload = {
	name: string;
	description?: string;
	permissions?: string[];
	emails?: string[];
};

export const useCreateStaffProfile = createMutation({
	mutationKey: [createStaffProfileMutationKey] as const,
	mutationFn: async (data: CreateStaffProfilePayload) => {
		const body: CreateStaffProfileBody = {};

		// Map payload to API body format using Kiota's UntypedNode factories
		// Type assertions are needed because the generated types don't include UntypedNode in the union
		if (data.name) {
			body.name = createUntypedString(data.name) as typeof body.name;
		}

		if (data.description) {
			body.description = createUntypedString(
				data.description,
			) as typeof body.description;
		}

		if (data.permissions && !_.isEmpty(data.permissions)) {
			body.permissions = createUntypedArray(
				data.permissions.map((p) => createUntypedString(p)),
			) as typeof body.permissions;
		}

		if (data.emails && !_.isEmpty(data.emails)) {
			body.emails = createUntypedArray(
				data.emails.map((e) => createUntypedString(e)),
			) as typeof body.emails;
		}

		const result = await clientManager.apiClient.staff.profiles.post(body);

		if (_.isNil(result)) {
			throw new Error(`[${createStaffProfileMutationKey}]: result is nil`);
		}

		return result;
	},
});
