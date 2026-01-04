import {
	createUntypedArray,
	createUntypedString,
} from '@microsoft/kiota-abstractions';
import _ from 'lodash';

import type { CreateStaffProfileBody } from '@/js-client/src/models';

import { createStaffMutation, createStaffQuery } from '../../create-hooks';

type FindStaffProfilesParams = {
	cursor?: string;
	limit?: number;
	sort?: { id: string; order: 'desc' | 'asc' };
};

export const useFindStaffProfiles = createStaffQuery({
	queryKeyFn: (client) => client.staff.profiles.get,
	fetcher: async (client, params: FindStaffProfilesParams) => {
		const result = await client.staff.profiles.get({
			queryParameters: {
				cursor: params.cursor,
				limit: params.limit ? params.limit.toString() : undefined,
				sortId: params.sort?.id,
				sortOrder: params.sort?.order,
			},
		});

		if (_.isNil(result)) {
			throw new Error('useFindStaffProfiles: result is nil');
		}

		return result;
	},
});

// Query: Fetch available staff permissions from API
type FindStaffPermissionsParams = {
	language?: string;
};

export const useFindStaffPermissions = createStaffQuery({
	queryKeyFn: (client) => client.staff.permissions.get,
	fetcher: async (client, params: FindStaffPermissionsParams) => {
		const result = await client.staff.permissions.get({
			queryParameters: {
				language: params.language,
			},
		});
		if (_.isNil(result)) {
			throw new Error('useFindStaffPermissions: result is nil');
		}
		return result;
	},
});

// Mutation: Create staff profile
type CreateStaffProfilePayload = {
	name: string;
	description?: string;
	permissions?: string[];
	emails?: string[];
};

export const useCreateStaffProfile = createStaffMutation({
	mutationKeyFn: (client) => client.staff.profiles.post,
	mutationFn: async (client, data: CreateStaffProfilePayload) => {
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

		const result = await client.staff.profiles.post(body);

		if (_.isNil(result)) {
			throw new Error('useCreateStaffProfile: result is nil');
		}

		return result;
	},
});
