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

		// Map payload to API body format
		if (data.name) {
			body.name = {
				getValue() {
					return data.name;
				},
			};
		}

		if (data.description) {
			body.description = {
				getValue() {
					return data.description;
				},
			};
		}

		if (data.permissions && !_.isEmpty(data.permissions)) {
			body.permissions = {
				getValue() {
					return data.permissions;
				},
			};
		}

		if (data.emails && !_.isEmpty(data.emails)) {
			body.emails = {
				getValue() {
					return data.emails;
				},
			};
		}

		const result = await clientManager.apiClient.staff.profiles.post(body);

		if (_.isNil(result)) {
			throw new Error(`[${createStaffProfileMutationKey}]: result is nil`);
		}

		return result;
	},
});
